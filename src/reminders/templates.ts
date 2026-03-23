import { TaskWithEmployee } from '../models/task';
import { formatDueDate } from '../bot/taskParser';

/**
 * Calculate human-readable time elapsed since a given date.
 */
function timeElapsed(dateStr: string): string {
  const then = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMins > 0) return `${diffMins}m ago`;
  return 'just now';
}

/**
 * Format a task line with date + time elapsed in italic brackets.
 */
function formatTaskLine(index: number, task: TaskWithEmployee): string {
  const dateStr = task.due_date
    ? formatDueDate(new Date(task.due_date))
    : formatDueDate(new Date(task.created_at));
  const elapsed = timeElapsed(task.due_date || task.created_at);
  return `${index}. ${task.title} _(${dateStr}, ${elapsed})_`;
}

export function morningEmployeeMessage(employeeName: string, tasks: TaskWithEmployee[]): string {
  if (tasks.length === 0) {
    return `Good morning, ${employeeName}! 🌅\n\nYou have no pending tasks today. Great work staying on top of things!`;
  }

  const lines: string[] = [
    `*Morning Reminder* ☀️\n`,
  ];

  let index = 1;
  for (const task of tasks) {
    lines.push(formatTaskLine(index, task));
    index++;
  }

  lines.push('');
  lines.push(`_Total: ${tasks.length} pending_`);

  return lines.join('\n');
}

export function eveningEmployeeMessage(employeeName: string, tasks: TaskWithEmployee[]): string {
  if (tasks.length === 0) {
    return `Good evening, ${employeeName}! 🌆\n\nAll tasks are complete! Enjoy your evening. 🎉`;
  }

  const lines: string[] = [
    `*Evening Reminder* 🌆\n`,
  ];

  let index = 1;
  for (const task of tasks) {
    lines.push(formatTaskLine(index, task));
    index++;
  }

  lines.push('');
  lines.push(`_Total: ${tasks.length} pending_`);

  return lines.join('\n');
}

export function groupMorningMessage(groupName: string, tasks: TaskWithEmployee[]): string {
  const lines: string[] = [
    `*Morning Reminder* ☀️\n`,
  ];

  let index = 1;
  for (const task of tasks) {
    lines.push(formatTaskLine(index, task));
    index++;
  }

  lines.push('');
  lines.push(`_Total: ${tasks.length} pending_`);

  return lines.join('\n');
}

export function groupEveningMessage(groupName: string, tasks: TaskWithEmployee[]): string {
  const lines: string[] = [
    `*Evening Reminder* 🌆\n`,
  ];

  let index = 1;
  for (const task of tasks) {
    lines.push(formatTaskLine(index, task));
    index++;
  }

  lines.push('');
  lines.push(`_Total: ${tasks.length} pending_`);

  return lines.join('\n');
}

export function managerMorningSummary(
  managerName: string,
  tasksByEmployee: Record<string, { employee: string; tasks: TaskWithEmployee[] }>
): string {
  const allTasks = Object.values(tasksByEmployee).flatMap((e) => e.tasks);
  const overdue = allTasks.filter((t) => t.status === 'overdue');
  const pending = allTasks.filter((t) => t.status !== 'overdue');

  const lines: string[] = [
    `📊 Good morning, ${managerName}! Here's your team's task summary:\n`,
    `Total pending: ${allTasks.length} | Overdue: ${overdue.length}\n`,
  ];

  for (const [, entry] of Object.entries(tasksByEmployee)) {
    if (entry.tasks.length === 0) continue;

    const empOverdue = entry.tasks.filter((t) => t.status === 'overdue');
    lines.push(
      `👤 ${entry.employee} (${entry.tasks.length} pending${empOverdue.length ? `, ${empOverdue.length} overdue ⚠️` : ''})`
    );
    for (const task of entry.tasks.slice(0, 5)) {
      const isOverdue = task.status === 'overdue';
      const dueStr = task.due_date ? ` (Due: ${formatDueDate(new Date(task.due_date))})` : '';
      lines.push(`   ${isOverdue ? '⚠️' : '•'} ${task.title}${dueStr}`);
    }
    if (entry.tasks.length > 5) {
      lines.push(`   ... and ${entry.tasks.length - 5} more`);
    }
    lines.push('');
  }

  if (allTasks.length === 0) {
    lines.push('✅ All tasks are complete! Great team performance!');
  }

  return lines.join('\n');
}
