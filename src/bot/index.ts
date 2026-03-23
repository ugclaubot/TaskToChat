import { Telegraf, Context } from 'telegraf';
import { config } from '../config';
import { registerCommands } from './commands';
import { isTaskMessage, parseTaskMessage, parseMultiTaskMessage, formatDueDate } from './taskParser';
import { isRoutineMessage, parseRoutineMessage } from './routineParser';
import { findOrCreateEmployee, autoRegisterFromTelegram } from '../models/employee';
import { createTask, getTaskById, completeTask, getAllTasksWithEmployees, findSimilarPendingTasks } from '../models/task';
import { createRoutine, getRoutineById, completeRoutineOccurrence, Routine, formatRecurrenceLabel, calculateFirstDue } from '../models/routine';

function formatTaskAge(createdAt?: string): string {
  if (!createdAt) return '';
  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  const dateLabel = created.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  if (days === 0) return `[created today]`;
  if (days === 1) return `[created ${dateLabel} · 1d ago]`;
  return `[created ${dateLabel} · ${days}d ago]`;
}

function formatNextDue(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

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

        if (!taskIds.includes(taskId)) taskIds.push(taskId);

        const tasks = taskIds.map((id: number) => getTaskById(id)).filter(Boolean) as import('../models/task').Task[];
        const lines: string[] = [];

        let idx = 1;
        for (const t of tasks) {
          const duePart = t.due_date ? ` (${formatDueDate(new Date(t.due_date))}) ` : '';
          const age = formatTaskAge(t.created_at);
          if (t.status === 'completed') {
            lines.push(`${idx}. ✅ ~${t.title}~${duePart}${age ? ` ${age}` : ''}`);
          } else {
            lines.push(`${idx}. _${t.title}_${duePart}${age ? ` ${age}` : ''}`);
          }
          idx++;
        }

        const remaining = tasks.filter(t => t.status !== 'completed').length;
        const total = tasks.length;
        const statusLine = remaining === 0
          ? '\n\n🎉 _All done!_'
          : `\n\n${total - remaining}/${total} ✅`;

        // Rebuild buttons for pending tasks
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

  // Handle routine checkbox button taps
  bot.action(/^toggle_routine_(\d+)$/, async (ctx) => {
    const routineId = parseInt(ctx.match[1], 10);
    const routine = getRoutineById(routineId);
    if (!routine) {
      await ctx.answerCbQuery('❌ Routine not found');
      return;
    }

    const completed = completeRoutineOccurrence(routineId);
    if (!completed) {
      await ctx.answerCbQuery('❌ Failed to update routine');
      return;
    }

    const nextDueLabel = formatNextDue(completed.next_due);
    await ctx.answerCbQuery(`✅ Done! Next: ${nextDueLabel}`);

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

        const routineIds = markup.inline_keyboard
          .flat()
          .map((btn: any) => btn.callback_data?.match(/^toggle_routine_(\d+)$/))
          .filter(Boolean)
          .map((m: RegExpMatchArray) => parseInt(m[1], 10));

        const tasks = taskIds.map((id: number) => getTaskById(id)).filter(Boolean) as import('../models/task').Task[];
        const routines = routineIds.map((id: number) => getRoutineById(id)).filter(Boolean) as Routine[];

        const lines: string[] = [];
        let idx = 1;

        for (const t of tasks) {
          const duePart = t.due_date ? ` (${formatDueDate(new Date(t.due_date))}) ` : '';
          const age = formatTaskAge(t.created_at);
          if (t.status === 'completed') {
            lines.push(`${idx}. ✅ ~${t.title}~${duePart}${age ? ` ${age}` : ''}`);
          } else {
            lines.push(`${idx}. _${t.title}_${duePart}${age ? ` ${age}` : ''}`);
          }
          idx++;
        }

        for (const r of routines) {
          const label = formatRecurrenceLabel(r.recurrence_type, r.recurrence_day, r.recurrence_month, r.anchor_date);
          lines.push(`${idx}. 🔁 _${r.title}_ _(${label})_`);
          idx++;
        }

        // Rebuild buttons
        const allPending = [...tasks.filter(t => t.status !== 'completed'), ...routines];
        const buttons: { text: string; callback_data: string }[][] = [];
        let btnIdx = 1;
        for (let i = 0; i < allPending.length; i += 2) {
          const row: { text: string; callback_data: string }[] = [];
          const item1 = allPending[i];
          const callback1 = 'assigned_to' in item1 ? `toggle_task_${(item1 as any).id}` : `toggle_routine_${(item1 as any).id}`;
          row.push({ text: `☑️ ${btnIdx}`, callback_data: callback1 });

          if (i + 1 < allPending.length) {
            const item2 = allPending[i + 1];
            const callback2 = 'assigned_to' in item2 ? `toggle_task_${(item2 as any).id}` : `toggle_routine_${(item2 as any).id}`;
            row.push({ text: `☑️ ${btnIdx + 1}`, callback_data: callback2 });
          }
          buttons.push(row);
          btnIdx += 2;
        }

        const pendingCount = tasks.filter(t => t.status !== 'completed').length + routines.length;
        const totalCount = tasks.length + routines.length;
        const statusLine = pendingCount === 0
          ? '\n\n🎉 _All done!_'
          : `\n\n${totalCount - pendingCount}/${totalCount} ✅`;

        await ctx.editMessageText(
          lines.join('\n') + statusLine,
          {
            parse_mode: 'Markdown',
            reply_markup: buttons.length > 0 ? { inline_keyboard: buttons } : undefined,
          }
        );
      }
    } catch (err) {
      console.error('[Bot] Failed to update routine message:', err);
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
        // Silent
      }
    }

    const text = ctx.message.text?.trim();
    if (!text) return;

    // Handle routine messages
    if (isRoutineMessage(text)) {
      await handleRoutineCreation(ctx, text);
      return;
    }

    // Handle task messages
    if (!isTaskMessage(text)) return;

    // Try multi-task format first
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

  const dueLine = parsed.dueDate ? ` (${formatDueDate(parsed.dueDate)})` : '';
  const assignedLine = employee
    ? `👤 *${employee.name}*`
    : `👥 *Group*`;
  const age = formatTaskAge(task.created_at);

  await ctx.reply(
    `${assignedLine}\n\n1. _${task.title}_${dueLine}${age ? ` ${age}` : ''}`,
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

  const taskLines = createdTaskIds.map((id, i) => {
    const duePart = parsedTasks[i].dueDate ? ` (${formatDueDate(parsedTasks[i].dueDate!)})` : '';
    return `${i + 1}. _${parsedTasks[i].title}_${duePart} [created today]`;
  });

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

async function handleRoutineCreation(ctx: Context & { message: { text: string; chat: { id: number; title?: string; type: string } } }, text: string): Promise<void> {
  const parsed = parseRoutineMessage(text);

  if (!parsed) {
    await ctx.reply(
      '❌ Could not parse that routine. Try:\n' +
      '`#routine @Name daily`\n' +
      '`#routine @Name every Monday`\n' +
      '`#routine @Name monthly on 20th`\n' +
      '`#routine @Name yearly on 15 March`',
      { parse_mode: 'Markdown', reply_to_message_id: ctx.message.message_id } as any
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

  const firstDue = calculateFirstDue(
    parsed.recurrenceType,
    parsed.recurrenceDay,
    parsed.recurrenceMonth
  );

  const routine = createRoutine({
    title: parsed.title,
    assignedTo: employee?.id,
    assignedBy,
    groupChatId: String(chat.id),
    groupChatName: chat.type !== 'private' ? (chat.title ?? undefined) : undefined,
    recurrenceType: parsed.recurrenceType,
    recurrenceDay: parsed.recurrenceDay ?? undefined,
    recurrenceMonth: parsed.recurrenceMonth ?? undefined,
    anchorDate: parsed.anchorDate ?? undefined,
    nextDue: firstDue,
  });

  const label = formatRecurrenceLabel(routine.recurrence_type, routine.recurrence_day, routine.recurrence_month, routine.anchor_date);
  const nextDueLabel = formatNextDue(routine.next_due);
  const assignedLine = employee
    ? `👤 *${employee.name}*`
    : `👥 *Group*`;

  await ctx.reply(
    `${assignedLine}\n\n🔁 _${routine.title}_\n_Every: ${label}_\n_Next due: ${nextDueLabel}_`,
    {
      parse_mode: 'Markdown',
      reply_to_message_id: ctx.message.message_id,
      reply_markup: {
        inline_keyboard: [
          [{ text: `☑️ Mark done`, callback_data: `toggle_routine_${routine.id}` }]
        ]
      },
    } as any
  ).catch((err: unknown) => {
    console.error('[Bot] Failed to send routine confirmation:', err);
  });
}

export async function startBot(bot: Telegraf): Promise<void> {
  await bot.launch();
  console.log('[Bot] Telegram bot started (long-polling)');

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
