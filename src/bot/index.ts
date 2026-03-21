import { Telegraf, Context } from 'telegraf';
import { config } from '../config';
import { registerCommands } from './commands';
import { isTaskMessage, parseTaskMessage, parseMultiTaskMessage, formatDueDate } from './taskParser';
import { findOrCreateEmployee, autoRegisterFromTelegram } from '../models/employee';
import { createTask, getTaskById, completeTask, getAllTasksWithEmployees, findSimilarPendingTasks } from '../models/task';

export function createBot(): Telegraf {
  const bot = new Telegraf(config.telegram.botToken);

  // Register all slash commands
  registerCommands(bot);

  // Handle checkbox button taps to mark tasks done
  bot.action(/^toggle_task_(\d+)$/, async (ctx) => {
    const taskId = parseInt(ctx.match[1], 10);
    const task = getTaskById(taskId);
    if (!task) {
      await ctx.answerCbQuery('❌ Task not found');
      return;
    }

    if (task.status === 'completed') {
      await ctx.answerCbQuery('Already done ✅');
      return;
    }

    const doneBy = ctx.from?.username ? `@${ctx.from.username}` : ctx.from?.first_name ?? 'Unknown';
    completeTask(taskId, `Marked done by ${doneBy}`);
    await ctx.answerCbQuery(`✅ Task #${taskId} done!`);

    // Rebuild the message with updated checkboxes
    try {
      const markup = ctx.callbackQuery.message && 'reply_markup' in ctx.callbackQuery.message
        ? (ctx.callbackQuery.message as any).reply_markup
        : null;
      if (markup?.inline_keyboard) {
        const taskIds = markup.inline_keyboard
          .flat()
          .map((btn: any) => btn.callback_data?.match(/^toggle_task_(\d+)$/))
          .filter(Boolean)
          .map((m: RegExpMatchArray) => parseInt(m[1], 10));

        // Also include the current task ID in case its button was already removed
        if (!taskIds.includes(taskId)) taskIds.push(taskId);

        const tasks = taskIds.map((id: number) => getTaskById(id)).filter(Boolean) as import('../models/task').Task[];
        const lines = tasks.map((t, i) => {
          const duePart = t.due_date ? ` _(${formatDueDate(new Date(t.due_date))})_` : '';
          if (t.status === 'completed') {
            return `${i + 1}. ✅ ~${t.title}~${duePart}`;
          }
          return `${i + 1}. _${t.title}_${duePart}`;
        });

        const remaining = tasks.filter(t => t.status !== 'completed').length;
        const total = tasks.length;
        const statusLine = remaining === 0
          ? '\n\n🎉 _All done!_'
          : `\n\n${total - remaining}/${total} ✅`;

        // Compact buttons — numbered, two per row
        const pendingTasks = tasks.map((t, i) => ({ ...t, num: i + 1 })).filter(t => t.status !== 'completed');
        const buttons: { text: string; callback_data: string }[][] = [];
        for (let i = 0; i < pendingTasks.length; i += 2) {
          const row: { text: string; callback_data: string }[] = [];
          row.push({ text: `☑️ ${pendingTasks[i].num}`, callback_data: `toggle_task_${pendingTasks[i].id}` });
          if (i + 1 < pendingTasks.length) {
            row.push({ text: `☑️ ${pendingTasks[i + 1].num}`, callback_data: `toggle_task_${pendingTasks[i + 1].id}` });
          }
          buttons.push(row);
        }

        await ctx.editMessageText(
          lines.join('\n') + statusLine,
          {
            parse_mode: 'Markdown',
            reply_markup: buttons.length > 0 ? { inline_keyboard: buttons } : undefined,
          }
        );
      }
    } catch (err) {
      console.error('[Bot] Failed to update task message:', err);
    }
  });

  // Handle ALL text messages — silently auto-register users
  bot.on('text', async (ctx) => {
    // Auto-register anyone who messages in a group
    if (ctx.from && ctx.message.chat.type !== 'private') {
      try {
        autoRegisterFromTelegram(
          String(ctx.from.id),
          ctx.from.first_name,
          ctx.from.last_name,
          ctx.from.username
        );
      } catch (err) {
        // Silent — don't break flow
      }
    }

    const text = ctx.message.text?.trim();
    if (!text) return;

    if (!isTaskMessage(text)) return;

    // Try multi-task format first (bullet points)
    const multiTasks = parseMultiTaskMessage(text);
    if (multiTasks && multiTasks.length > 1) {
      await handleMultiTaskCreation(ctx, multiTasks);
      return;
    }

    await handleTaskCreation(ctx, text);
  });

  // Error handler
  bot.catch((err: unknown, ctx: Context) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Bot] Error for update ${ctx.updateType}:`, msg);
  });

  return bot;
}

async function handleTaskCreation(ctx: Context & { message: { text: string; chat: { id: number; title?: string; type: string } } }, text: string): Promise<void> {
  const parsed = parseTaskMessage(text);

  if (!parsed) {
    await ctx.reply(
      '❌ Could not parse that task. Try:\n`#task @Name description by Friday`\nor just `#task description by Friday` for group tasks',
      { parse_mode: 'Markdown', reply_to_message_id: ctx.message.message_id } as Parameters<typeof ctx.reply>[1]
    ).catch(() => {});
    return;
  }

  const chat = ctx.message.chat;
  const assignedBy = ctx.from?.username
    ? `@${ctx.from.username}`
    : ctx.from?.first_name ?? 'Unknown';

  let employee = null;
  if (parsed.assigneeName) {
    employee = findOrCreateEmployee(parsed.assigneeName);
  }

  // Check for duplicate/similar tasks
  const similar = findSimilarPendingTasks(parsed.title, employee?.id, String(chat.id));
  if (similar.length > 0) {
    const dupeLines = similar.map(t => `• _${t.title}_ (${t.status})`).join('\n');
    await ctx.reply(
      `⚠️ Similar pending task(s) found:\n\n${dupeLines}\n\nCreating anyway...`,
      { parse_mode: 'Markdown', reply_to_message_id: ctx.message.message_id } as any
    ).catch(() => {});
  }

  const task = createTask({
    title: parsed.title,
    assignedTo: employee?.id,
    assignedBy,
    groupChatId: String(chat.id),
    groupChatName: chat.type !== 'private' ? (chat.title ?? undefined) : undefined,
    priority: parsed.priority,
    dueDate: parsed.dueDate?.toISOString().split('T')[0] ?? undefined,
  });

  const dueLine = parsed.dueDate ? ` _(${formatDueDate(parsed.dueDate)})_` : '';

  const assignedLine = employee
    ? `👤 *${employee.name}*`
    : `👥 *Group*`;

  await ctx.reply(
    `${assignedLine}\n\n1. _${task.title}_${dueLine}`,
    {
      parse_mode: 'Markdown',
      reply_to_message_id: ctx.message.message_id,
      reply_markup: {
        inline_keyboard: [
          [{ text: `☑️ Mark done`, callback_data: `toggle_task_${task.id}` }]
        ]
      },
    } as any
  ).catch((err: unknown) => {
    console.error('[Bot] Failed to send task confirmation:', err);
  });
}

async function handleMultiTaskCreation(ctx: Context & { message: { text: string; chat: { id: number; title?: string; type: string } } }, parsedTasks: import('./taskParser').ParsedTask[]): Promise<void> {
  const chat = ctx.message.chat;
  const assignedBy = ctx.from?.username
    ? `@${ctx.from.username}`
    : ctx.from?.first_name ?? 'Unknown';

  const createdTaskIds: number[] = [];

  for (const parsed of parsedTasks) {
    let employee = null;
    if (parsed.assigneeName) {
      employee = findOrCreateEmployee(parsed.assigneeName);
    }

    const task = createTask({
      title: parsed.title,
      assignedTo: employee?.id,
      assignedBy,
      groupChatId: String(chat.id),
      groupChatName: chat.type !== 'private' ? (chat.title ?? undefined) : undefined,
      priority: parsed.priority,
      dueDate: parsed.dueDate?.toISOString().split('T')[0] ?? undefined,
    });

    createdTaskIds.push(task.id);
  }

  const assigneeName = parsedTasks[0]?.assigneeName;
  const assignedLine = assigneeName
    ? `👤 *${assigneeName}*`
    : `👥 *Group tasks*`;

  // Build numbered task lines
  const taskLines = createdTaskIds.map((id, i) => {
    const duePart = parsedTasks[i].dueDate ? ` _(${formatDueDate(parsedTasks[i].dueDate!)})_` : '';
    return `${i + 1}. _${parsedTasks[i].title}_${duePart}`;
  });

  // Compact buttons — two per row where possible
  const buttons: { text: string; callback_data: string }[][] = [];
  for (let i = 0; i < createdTaskIds.length; i += 2) {
    const row: { text: string; callback_data: string }[] = [];
    row.push({ text: `☑️ ${i + 1}`, callback_data: `toggle_task_${createdTaskIds[i]}` });
    if (i + 1 < createdTaskIds.length) {
      row.push({ text: `☑️ ${i + 2}`, callback_data: `toggle_task_${createdTaskIds[i + 1]}` });
    }
    buttons.push(row);
  }

  await ctx.reply(
    `${assignedLine}\n\n${taskLines.join('\n')}`,
    {
      parse_mode: 'Markdown',
      reply_to_message_id: ctx.message.message_id,
      reply_markup: { inline_keyboard: buttons },
    } as any
  ).catch((err: unknown) => {
    console.error('[Bot] Failed to send multi-task confirmation:', err);
  });
}

export async function startBot(bot: Telegraf): Promise<void> {
  await bot.launch();
  console.log('[Bot] Telegram bot started (long-polling)');

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
