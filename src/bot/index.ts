import { Telegraf, Context } from 'telegraf';
import { config } from '../config';
import { registerCommands } from './commands';
import { isTaskMessage, parseTaskMessage, parseMultiTaskMessage, formatDueDate } from './taskParser';
import { isRoutineMessage, parseRoutineMessage } from './routineParser';
import { findOrCreateEmployee, autoRegisterFromTelegram } from '../models/employee';
import { createTask, getTaskById, completeTask, reopenTask, getAllTasksWithEmployees, findSimilarPendingTasks } from '../models/task';
import { createRoutine, getRoutineById, completeRoutineOccurrence, formatRecurrenceLabel, calculateFirstDue } from '../models/routine';
import {
  buildReminderButtons,
  decodeReminderState,
  encodeReminderState,
  fallbackReminderStateFromMarkup,
  markReminderItemDone,
  markReminderItemPending,
  renderReminderMessage,
  type ReminderItem,
} from './messageState';
import { formatTaskAgeLabel } from '../utils/datetime';

function formatTaskAge(createdAt?: string): string {
  const label = formatTaskAgeLabel(createdAt);
  if (!label) return '';
  return label.replace(/^created\s+/, '').trim();
}

function escapeTelegramMarkdown(text: string): string {
  return text.replace(/([_*\[\]`])/g, '\\$1');
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

    const message = ctx.callbackQuery.message;
    const storedState = message && 'reply_markup' in message
      ? decodeReminderState((message as any).reply_markup?.inline_keyboard?.slice(-1)?.[0]?.[0]?.callback_data?.startsWith('state:')
          ? (message as any).reply_markup.inline_keyboard.slice(-1)[0][0].callback_data.slice(6)
          : undefined)
      : null;
    const visibleMarkup = message && 'reply_markup' in message
      ? {
          inline_keyboard: ((message as any).reply_markup?.inline_keyboard ?? []).filter((row: any[]) => {
            return !(row?.length === 1 && typeof row[0]?.callback_data === 'string' && row[0].callback_data.startsWith('state:'));
          }),
        }
      : null;
    const baseState = storedState ?? fallbackReminderStateFromMarkup(visibleMarkup);

    if (task.status === 'completed') {
      const updatedState = markReminderItemDone(baseState, 'task', taskId);
      await ctx.answerCbQuery('Already done ✅');
      try {
        const buttons = buildReminderButtons(updatedState);
        buttons.push([{ text: '·', callback_data: `state:${encodeReminderState(updatedState)}` }]);
        await ctx.editMessageText(renderReminderMessage(updatedState), {
          parse_mode: 'MarkdownV2',
          reply_markup: { inline_keyboard: buttons },
        });
      } catch (err) {
        console.error('[Bot] Failed to refresh task message:', err);
      }
      return;
    }

    const doneBy = ctx.from?.username ? `@${ctx.from.username}` : ctx.from?.first_name ?? 'Unknown';
    completeTask(taskId, `Marked done by ${doneBy}`);
    const updatedState = markReminderItemDone(baseState, 'task', taskId);
    await ctx.answerCbQuery(`✅ Task #${taskId} done!`);

    try {
      const buttons = buildReminderButtons(updatedState);
      buttons.push([{ text: '·', callback_data: `state:${encodeReminderState(updatedState)}` }]);
      await ctx.editMessageText(renderReminderMessage(updatedState), {
        parse_mode: 'MarkdownV2',
        reply_markup: { inline_keyboard: buttons },
      });
    } catch (err) {
      console.error('[Bot] Failed to update task message:', err);
    }
  });

  bot.action(/^undo_task_(\d+)$/, async (ctx) => {
    const taskId = parseInt(ctx.match[1], 10);
    const task = getTaskById(taskId);
    if (!task) {
      await ctx.answerCbQuery('❌ Task not found');
      return;
    }

    const message = ctx.callbackQuery.message;
    const storedState = message && 'reply_markup' in message
      ? decodeReminderState((message as any).reply_markup?.inline_keyboard?.slice(-1)?.[0]?.[0]?.callback_data?.startsWith('state:')
          ? (message as any).reply_markup.inline_keyboard.slice(-1)[0][0].callback_data.slice(6)
          : undefined)
      : null;
    const visibleMarkup = message && 'reply_markup' in message
      ? {
          inline_keyboard: ((message as any).reply_markup?.inline_keyboard ?? []).filter((row: any[]) => {
            return !(row?.length === 1 && typeof row[0]?.callback_data === 'string' && row[0].callback_data.startsWith('state:'));
          }),
        }
      : null;
    const baseState = storedState ?? fallbackReminderStateFromMarkup(visibleMarkup);

    reopenTask(taskId, `Reopened by ${ctx.from?.username ? `@${ctx.from.username}` : ctx.from?.first_name ?? 'Unknown'}`);
    const updatedState = markReminderItemPending(baseState, 'task', taskId);
    await ctx.answerCbQuery(`↩️ Task #${taskId} reopened`);

    try {
      const buttons = buildReminderButtons(updatedState);
      buttons.push([{ text: '·', callback_data: `state:${encodeReminderState(updatedState)}` }]);
      await ctx.editMessageText(renderReminderMessage(updatedState), {
        parse_mode: 'MarkdownV2',
        reply_markup: { inline_keyboard: buttons },
      });
    } catch (err) {
      console.error('[Bot] Failed to update reopened task message:', err);
    }
  });

  bot.action(/^undo_routine_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery('Routine undo is not supported yet');
  });

  // Handle routine checkbox button taps
  bot.action(/^toggle_routine_(\d+)$/, async (ctx) => {
    const routineId = parseInt(ctx.match[1], 10);
    const routine = getRoutineById(routineId);
    if (!routine) {
      await ctx.answerCbQuery('❌ Routine not found');
      return;
    }

    const message = ctx.callbackQuery.message;
    const storedState = message && 'reply_markup' in message
      ? decodeReminderState((message as any).reply_markup?.inline_keyboard?.slice(-1)?.[0]?.[0]?.callback_data?.startsWith('state:')
          ? (message as any).reply_markup.inline_keyboard.slice(-1)[0][0].callback_data.slice(6)
          : undefined)
      : null;
    const visibleMarkup = message && 'reply_markup' in message
      ? {
          inline_keyboard: ((message as any).reply_markup?.inline_keyboard ?? []).filter((row: any[]) => {
            return !(row?.length === 1 && typeof row[0]?.callback_data === 'string' && row[0].callback_data.startsWith('state:'));
          }),
        }
      : null;
    const baseState = storedState ?? fallbackReminderStateFromMarkup(visibleMarkup);

    const completed = completeRoutineOccurrence(routineId);
    if (!completed) {
      await ctx.answerCbQuery('❌ Failed to update routine');
      return;
    }

    const updatedState = markReminderItemDone(baseState, 'routine', routineId);
    await ctx.answerCbQuery('✅ Marked done');

    try {
      const buttons = buildReminderButtons(updatedState);
      buttons.push([{ text: '·', callback_data: `state:${encodeReminderState(updatedState)}` }]);
      await ctx.editMessageText(renderReminderMessage(updatedState), {
        parse_mode: 'MarkdownV2',
        reply_markup: { inline_keyboard: buttons },
      });
    } catch (err) {
      console.error('[Bot] Failed to update routine message:', err);
    }
  });

  bot.action(/^state:/, async (ctx) => {
    await ctx.answerCbQuery();
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
  const messageThreadId = (ctx.message as any).message_thread_id;
  const topicId = messageThreadId ? String(messageThreadId) : undefined;
  const topicName = chat.type !== 'private' && messageThreadId ? `Topic ${messageThreadId}` : undefined;
  const assignedBy = ctx.from?.username
    ? `@${ctx.from.username}`
    : ctx.from?.first_name ?? 'Unknown';

  let employee = null;
  if (parsed.assigneeName) {
    employee = findOrCreateEmployee(parsed.assigneeName);
  }

  const similar = findSimilarPendingTasks(parsed.title, employee?.id, String(chat.id));
  if (similar.length > 0) {
    const dupeLines = similar.map(t => `• _${escapeTelegramMarkdown(t.title)}_ (${t.status})`).join('\n');
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
    topicId,
    topicName,
    priority: parsed.priority,
    dueDate: parsed.dueDate?.toISOString().split('T')[0] ?? undefined,
  });

  const assignedLine = employee
    ? `👤 *${escapeTelegramMarkdown(employee.name)}*`
    : `👥 *Group*`;
  const age = formatTaskAge(task.created_at);
  let infoStr = '';
  if (parsed.dueDate && age) {
    infoStr = ` _(Due: ${formatDueDate(parsed.dueDate)} | ${age})_`;
  } else if (parsed.dueDate) {
    infoStr = ` _(Due: ${formatDueDate(parsed.dueDate)})_`;
  } else if (age) {
    infoStr = ` _(${age})_`;
  }

  const state: ReminderItem[] = [{ kind: 'task', id: task.id, done: false }];
  const buttons = buildReminderButtons(state);
  buttons.push([{ text: '·', callback_data: `state:${encodeReminderState(state)}` }]);

  await ctx.reply(
    renderReminderMessage(state),
    {
      parse_mode: 'MarkdownV2',
      reply_to_message_id: ctx.message.message_id,
      reply_markup: { inline_keyboard: buttons },
    } as any
  ).catch((err: unknown) => {
    console.error('[Bot] Failed to send task confirmation:', err);
  });
}

async function handleMultiTaskCreation(ctx: Context & { message: { text: string; chat: { id: number; title?: string; type: string } } }, parsedTasks: import('./taskParser').ParsedTask[]): Promise<void> {
  const chat = ctx.message.chat;
  const messageThreadId = (ctx.message as any).message_thread_id;
  const topicId = messageThreadId ? String(messageThreadId) : undefined;
  const topicName = chat.type !== 'private' && messageThreadId ? `Topic ${messageThreadId}` : undefined;
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
      topicId,
      topicName,
      priority: parsed.priority,
      dueDate: parsed.dueDate?.toISOString().split('T')[0] ?? undefined,
    });

    createdTaskIds.push(task.id);
  }

  const state: ReminderItem[] = createdTaskIds.map((id) => ({ kind: 'task', id, done: false }));
  const buttons = buildReminderButtons(state);
  buttons.push([{ text: '·', callback_data: `state:${encodeReminderState(state)}` }]);

  await ctx.reply(
    renderReminderMessage(state),
    {
      parse_mode: 'MarkdownV2',
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
  const messageThreadId = (ctx.message as any).message_thread_id;
  const topicId = messageThreadId ? String(messageThreadId) : undefined;
  const topicName = chat.type !== 'private' && messageThreadId ? `Topic ${messageThreadId}` : undefined;
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
    topicId,
    topicName,
    recurrenceType: parsed.recurrenceType,
    recurrenceDay: parsed.recurrenceDay ?? undefined,
    recurrenceMonth: parsed.recurrenceMonth ?? undefined,
    anchorDate: parsed.anchorDate ?? undefined,
    nextDue: firstDue,
  });

  const state: ReminderItem[] = [{ kind: 'routine', id: routine.id, done: false }];
  const buttons = buildReminderButtons(state);
  buttons.push([{ text: '·', callback_data: `state:${encodeReminderState(state)}` }]);

  await ctx.reply(
    renderReminderMessage(state),
    {
      parse_mode: 'MarkdownV2',
      reply_to_message_id: ctx.message.message_id,
      reply_markup: { inline_keyboard: buttons },
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
