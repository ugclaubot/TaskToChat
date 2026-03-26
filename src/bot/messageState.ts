import { getTaskById } from '../models/task';
import { getRoutineById } from '../models/routine';
import { formatDueDate } from './taskParser';
import { formatTaskAgeLabel } from '../utils/datetime';

export type ReminderTaskItem = {
  kind: 'task';
  id: number;
  done: boolean;
};

export type ReminderRoutineItem = {
  kind: 'routine';
  id: number;
  done: boolean;
};

export type ReminderItem = ReminderTaskItem | ReminderRoutineItem;

function formatTaskAge(createdAt?: string): string {
  const label = formatTaskAgeLabel(createdAt);
  if (!label) return '';
  return label.replace(/^created\s+/, '').trim();
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

function escapeTelegramMarkdown(text: string): string {
  return text.replace(/([_*!\[\]()`~>#+\-=|{}.!\\])/g, '\\$1');
}

/**
 * Compact encoding: "t123+t124-r5+" where t=task, r=routine, +=done, -=pending
 * Fits within Telegram's 64-byte callback_data limit for reasonable task counts.
 */
export function encodeReminderState(items: ReminderItem[]): string {
  return items.map(item => {
    const prefix = item.kind === 'task' ? 't' : 'r';
    const suffix = item.done ? '+' : '-';
    return `${prefix}${item.id}${suffix}`;
  }).join('');
}

export function decodeReminderState(data?: string): ReminderItem[] | null {
  if (!data) return null;

  // Try compact format first: "t123+t124-r5+"
  const compactRegex = /([tr])(\d+)([+-])/g;
  let match: RegExpExecArray | null;
  const compactItems: ReminderItem[] = [];
  while ((match = compactRegex.exec(data)) !== null) {
    compactItems.push({
      kind: match[1] === 't' ? 'task' : 'routine',
      id: parseInt(match[2], 10),
      done: match[3] === '+',
    } as ReminderItem);
  }
  if (compactItems.length > 0) return compactItems;

  // Fallback: legacy JSON format
  try {
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return null;

    const items: ReminderItem[] = [];
    for (const item of parsed) {
      if (!item || (item.kind !== 'task' && item.kind !== 'routine') || typeof item.id !== 'number') {
        return null;
      }
      items.push({
        kind: item.kind,
        id: item.id,
        done: Boolean(item.done),
      } as ReminderItem);
    }
    return items;
  } catch {
    return null;
  }
}

export function fallbackReminderStateFromMarkup(markup: any): ReminderItem[] {
  if (!markup?.inline_keyboard) return [];

  const items: ReminderItem[] = [];
  for (const row of markup.inline_keyboard) {
    for (const btn of row ?? []) {
      const taskMatch = typeof btn?.callback_data === 'string' ? btn.callback_data.match(/^toggle_task_(\d+)$/) : null;
      if (taskMatch) {
        items.push({ kind: 'task', id: parseInt(taskMatch[1], 10), done: false });
        continue;
      }

      const routineMatch = typeof btn?.callback_data === 'string' ? btn.callback_data.match(/^toggle_routine_(\d+)$/) : null;
      if (routineMatch) {
        items.push({ kind: 'routine', id: parseInt(routineMatch[1], 10), done: false });
      }
    }
  }

  return items;
}

export function markReminderItemDone(items: ReminderItem[], kind: ReminderItem['kind'], id: number): ReminderItem[] {
  return items.map((item) =>
    item.kind === kind && item.id === id
      ? { ...item, done: true }
      : item
  );
}

export function markReminderItemPending(items: ReminderItem[], kind: ReminderItem['kind'], id: number): ReminderItem[] {
  return items.map((item) =>
    item.kind === kind && item.id === id
      ? { ...item, done: false }
      : item
  );
}

export function buildReminderButtons(items: ReminderItem[]): { text: string; callback_data: string }[][] {
  const buttons: { text: string; callback_data: string }[][] = [];

  for (let i = 0; i < items.length; i += 2) {
    const row: { text: string; callback_data: string }[] = [];

    const first = items[i];
    const firstNum = i + 1;
    row.push({
      text: `${first.done ? '↩️' : '☑️'} ${firstNum}`,
      callback_data: first.kind === 'task'
        ? `${first.done ? 'undo_task' : 'toggle_task'}_${first.id}`
        : `${first.done ? 'undo_routine' : 'toggle_routine'}_${first.id}`,
    });

    if (i + 1 < items.length) {
      const second = items[i + 1];
      const secondNum = i + 2;
      row.push({
        text: `${second.done ? '↩️' : '☑️'} ${secondNum}`,
        callback_data: second.kind === 'task'
          ? `${second.done ? 'undo_task' : 'toggle_task'}_${second.id}`
          : `${second.done ? 'undo_routine' : 'toggle_routine'}_${second.id}`,
      });
    }

    buttons.push(row);
  }

  return buttons;
}

export function renderReminderMessage(items: ReminderItem[]): string {
  const lines: string[] = [];

  items.forEach((item, index) => {
    if (item.kind === 'task') {
      const task = getTaskById(item.id);
      if (!task) return;

      const age = formatTaskAge(task.created_at);
      let infoStr = '';
      if (task.due_date && age) {
        infoStr = ` \\[${escapeTelegramMarkdown(formatDueDate(new Date(task.due_date)))}, ${escapeTelegramMarkdown(age)}\\]`;
      } else if (task.due_date) {
        infoStr = ` \\[${escapeTelegramMarkdown(formatDueDate(new Date(task.due_date)))}\\]`;
      } else if (age) {
        infoStr = ` \\[${escapeTelegramMarkdown(age)}\\]`;
      }

      const safeTitle = escapeTelegramMarkdown(task.title);
      const isDone = item.done || task.status === 'completed';
      const renderedTitle = isDone ? `~${safeTitle}~` : safeTitle;
      lines.push(`${index + 1}\\. ${isDone ? '✅' : '⬜'} ${renderedTitle}${infoStr}`);
      return;
    }

    const routine = getRoutineById(item.id);
    if (!routine) return;

    const safeTitle = escapeTelegramMarkdown(routine.title);
    const isDone = item.done;
    const nextDue = escapeTelegramMarkdown(formatNextDue(routine.next_due));
    const renderedTitle = isDone ? `~${safeTitle}~` : safeTitle;
    lines.push(`${index + 1}\\. ${isDone ? '✅' : '🔁'} ${renderedTitle} \\[next: ${nextDue}\\]`);
  });

  const doneCount = items.filter((item) => item.done).length;
  const totalCount = items.length;
  const statusLine = doneCount === totalCount
    ? '\n\n🎉 All done'
    : `\n\n${doneCount}\\/${totalCount} completed`;

  return lines.join('\n') + statusLine;
}
