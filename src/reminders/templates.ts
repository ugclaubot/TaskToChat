import { TaskWithEmployee } from '../models/task';
import { formatDueDate } from '../bot/taskParser';

export function morningEmployeeMessage(employeeName: string, tasks: TaskWithEmployee[]): string {
  if (tasks.length === 0) {
    return `Good morning, ${employeeName}! 🌅\n\nYou have no pending tasks today. Great work staying on top of things!`;
  }

  const overdue = tasks.filter((t) => t.status === 'overdue');
  const pending = tasks.filter((t) => t.status !== 'overdue');

  const lines: string[] = [
    `📋 Good morning, ${employeeName}! Here are your pending tasks:\n`,
  ];

  let index = 1;
  for (const task of [...overdue, ...pending]) {
    const isOverdue = task.status === 'overdue';
    const dueStr = task.due_date
      ? ` (Due: ${formatDueDate(new Date(task.due_date))})`
      : '';
    const overdueTag = isOverdue ? '[OVERDUE ⚠️] ' : '';
    lines.push(`${index}. ${overdueTag}${task.title}${dueStr}`);
    index++;
  }

  lines.push('');
  lines.push(`Total: ${tasks.length} pending${overdue.length > 0 ? `, ${overdue.length} overdue` : ''}`);
  lines.push('\nHave a productive day! 💪');

  return lines.join('\n');
}

export function eveningEmployeeMessage(employeeName: string, tasks: TaskWithEmployee[]): string {
  if (tasks.length === 0) {
    return `Good evening, ${employeeName}! 🌆\n\nAll tasks are complete! Enjoy your evening. 🎉`;
  }

  const overdue = tasks.filter((t) => t.status === 'overdue');
  const pending = tasks.filter((t) => t.status !== 'overdue');

  const lines: string[] = [
    `🌆 Good evening, ${employeeName}! End-of-day task check:\n`,
  ];

  let index = 1;
  for (const task of [...overdue, ...pending]) {
    const isOverdue = task.status === 'overdue';
    const dueStr = task.due_date
      ? ` (Due: ${formatDueDate(new Date(task.due_date))})`
      : '';
    const overdueTag = isOverdue ? '[OVERDUE ⚠️] ' : '';
    lines.push(`${index}. ${overdueTag}${task.title}${dueStr}`);
    index++;
  }

  lines.push('');
  if (overdue.length > 0) {
    lines.push(`⚠️ Warning: ${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}. Please prioritize tomorrow!`);
  }
  lines.push(`Total: ${tasks.length} still pending`);
  lines.push('\nHave a restful evening! 🌙');

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
