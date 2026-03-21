import { Context, Telegraf } from 'telegraf';
import { config } from '../config';
import {
  createEmployee,
  getAllEmployees,
  getEmployeeByUsername,
  findEmployee,
} from '../models/employee';
import {
  getAllTasksWithEmployees,
  completeTask,
  findTasksByKeywords,
  getTaskById,
  TaskWithEmployee,
  updateOverdueTasks,
} from '../models/task';
import { formatDueDate } from './taskParser';

function isManager(ctx: Context): boolean {
  const userId = ctx.from?.id?.toString();
  return userId === config.manager.telegramId || config.manager.telegramId === '';
}

function statusEmoji(status: string): string {
  switch (status) {
    case 'completed': return '✅';
    case 'overdue': return '⚠️';
    case 'in_progress': return '🔄';
    default: return '📌';
  }
}

function priorityEmoji(priority: string): string {
  switch (priority) {
    case 'high': return '🔴';
    case 'low': return '🟢';
    default: return '🟡';
  }
}

function formatTaskLine(task: TaskWithEmployee, index?: number): string {
  const num = index !== undefined ? `${index + 1}. ` : `#${task.id} `;
  const overdue = task.status === 'overdue' ? '[OVERDUE ⚠️] ' : '';
  const due = task.due_date ? ` (Due: ${formatDueDate(new Date(task.due_date))})` : '';
  const priority = priorityEmoji(task.priority);
  return `${num}${overdue}${priority} ${task.title}${due}`;
}

function formatTaskBlock(task: TaskWithEmployee): string {
  const lines: string[] = [];
  lines.push(`${statusEmoji(task.status)} *#${task.id}* — ${task.title}`);
  if (task.description) lines.push(`   _${task.description}_`);
  if (task.employee_name) lines.push(`   👤 ${task.employee_name}`);
  if (task.due_date) lines.push(`   📅 Due: ${formatDueDate(new Date(task.due_date))}`);
  lines.push(`   ${priorityEmoji(task.priority)} ${task.priority} priority | ${task.status}`);
  return lines.join('\n');
}

export function registerCommands(bot: Telegraf): void {

  // /start
  bot.start((ctx) => {
    ctx.reply(
      '👋 Welcome to *ChatFlow*!\n\n' +
      'I help track tasks assigned in this chat.\n\n' +
      '*Quick commands:*\n' +
      '/tasks - View all pending tasks\n' +
      '/mytasks - View your tasks\n' +
      '/done <ID> - Mark a task complete\n' +
      '/overdue - View overdue tasks\n' +
      '/addemployee - Add a team member\n' +
      '/employees - List all employees\n\n' +
      '*Create tasks by typing:*\n' +
      '`task: @Person do something by Friday`',
      { parse_mode: 'Markdown' }
    ).catch(() => {
      ctx.reply('Welcome to ChatFlow! Type /help for commands.');
    });
  });

  // /help
  bot.help((ctx) => {
    ctx.reply(
      '📋 *ChatFlow Commands*\n\n' +
      '*Task Creation:*\n' +
      '`task: @Name description by DATE !priority`\n' +
      '`task: Name - description - due Friday`\n' +
      '`#task @Name do something by March 25`\n\n' +
      '*Task Management:*\n' +
      '/tasks — All pending tasks\n' +
      '/tasks @person — Tasks for a specific person\n' +
      '/mytasks — Your own tasks\n' +
      '/done <ID or keywords> — Mark task complete\n' +
      '/overdue — All overdue tasks\n\n' +
      '*Admin (Manager only):*\n' +
      '/addemployee Name @username 91XXXXXXXXXX\n' +
      '/employees — List all employees',
      { parse_mode: 'Markdown' }
    );
  });

  // /addemployee Name @username 919810XXXXXX
  bot.command('addemployee', (ctx) => {
    if (!isManager(ctx)) {
      return ctx.reply('❌ Only the manager can add employees.');
    }

    const args = ctx.message.text.replace('/addemployee', '').trim();
    if (!args) {
      return ctx.reply(
        '❌ Usage: `/addemployee Name @username 919810000000`\n\n' +
        'Example: `/addemployee John Doe @johndoe 919810123456`',
        { parse_mode: 'Markdown' }
      );
    }

    // Parse: "First Last @username number"
    const parts = args.split(/\s+/);
    let name = '';
    let username: string | null = null;
    let whatsapp: string | null = null;

    for (const part of parts) {
      if (part.startsWith('@')) {
        username = part.replace('@', '').toLowerCase();
      } else if (/^91\d{10}$/.test(part)) {
        whatsapp = part;
      } else {
        name += (name ? ' ' : '') + part;
      }
    }

    if (!name) {
      return ctx.reply('❌ Please provide at least a name.\nUsage: `/addemployee Name @username 919810000000`', {
        parse_mode: 'Markdown',
      });
    }

    try {
      const employee = createEmployee(name, username, whatsapp);
      ctx.reply(
        `✅ Employee added!\n\n` +
        `👤 *${employee.name}*\n` +
        (employee.telegram_username ? `📱 @${employee.telegram_username}\n` : '') +
        (employee.whatsapp_number ? `💬 WhatsApp: ${employee.whatsapp_number}\n` : '') +
        `🆔 ID: ${employee.id}`,
        { parse_mode: 'Markdown' }
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('UNIQUE')) {
        ctx.reply('❌ An employee with that username already exists.');
      } else {
        ctx.reply(`❌ Error: ${msg}`);
      }
    }
  });

  // /employees
  bot.command('employees', (ctx) => {
    const employees = getAllEmployees();
    if (employees.length === 0) {
      return ctx.reply('No employees found. Use /addemployee to add team members.');
    }

    const lines = employees.map(
      (e, i) =>
        `${i + 1}. *${e.name}*` +
        (e.telegram_username ? ` @${e.telegram_username}` : '') +
        (e.whatsapp_number ? ` | 📱 ${e.whatsapp_number}` : '')
    );
    ctx.reply(`👥 *Team Members (${employees.length})*\n\n${lines.join('\n')}`, {
      parse_mode: 'Markdown',
    });
  });

  // /tasks or /tasks @person
  bot.command('tasks', (ctx) => {
    updateOverdueTasks();

    const arg = ctx.message.text.replace('/tasks', '').trim();
    let tasks: TaskWithEmployee[];

    if (arg) {
      const employee = findEmployee(arg);
      if (!employee) {
        return ctx.reply(`❌ Employee "${arg}" not found. Check /employees for the list.`);
      }
      tasks = getAllTasksWithEmployees({ employeeId: employee.id }).filter(
        (t) => t.status !== 'completed'
      );
      if (tasks.length === 0) {
        return ctx.reply(`✅ No pending tasks for *${employee.name}*!`, { parse_mode: 'Markdown' });
      }
      const lines = tasks.map((t, i) => formatTaskLine(t, i));
      ctx.reply(
        `📋 *Tasks for ${employee.name}* (${tasks.length})\n\n${lines.join('\n')}`,
        { parse_mode: 'Markdown' }
      );
    } else {
      tasks = getAllTasksWithEmployees().filter((t) => t.status !== 'completed');

      if (tasks.length === 0) {
        return ctx.reply('✅ No pending tasks! Everyone is caught up.');
      }

      // Group by employee
      const byEmployee: Record<string, TaskWithEmployee[]> = {};
      const unassigned: TaskWithEmployee[] = [];

      for (const task of tasks) {
        if (task.employee_name) {
          const key = task.employee_name;
          if (!byEmployee[key]) byEmployee[key] = [];
          byEmployee[key].push(task);
        } else {
          unassigned.push(task);
        }
      }

      const sections: string[] = [];
      for (const [name, empTasks] of Object.entries(byEmployee)) {
        const lines = empTasks.map((t, i) => formatTaskLine(t, i));
        sections.push(`👤 *${name}* (${empTasks.length})\n${lines.join('\n')}`);
      }
      if (unassigned.length > 0) {
        const lines = unassigned.map((t, i) => formatTaskLine(t, i));
        sections.push(`❓ *Unassigned* (${unassigned.length})\n${lines.join('\n')}`);
      }

      ctx.reply(
        `📋 *All Pending Tasks* (${tasks.length})\n\n${sections.join('\n\n')}`,
        { parse_mode: 'Markdown' }
      );
    }
  });

  // /mytasks
  bot.command('mytasks', (ctx) => {
    updateOverdueTasks();

    const username = ctx.from?.username;
    if (!username) {
      return ctx.reply('❌ You need a Telegram username to use /mytasks.');
    }

    const employee = getEmployeeByUsername(username);
    if (!employee) {
      return ctx.reply(
        `❌ Your username @${username} isn't in the employee directory. Ask the manager to add you with /addemployee.`
      );
    }

    const tasks = getAllTasksWithEmployees({ employeeId: employee.id }).filter(
      (t) => t.status !== 'completed'
    );

    if (tasks.length === 0) {
      return ctx.reply(`✅ You have no pending tasks, ${employee.name}! Great work!`);
    }

    const lines = tasks.map((t, i) => formatTaskLine(t, i));
    ctx.reply(
      `📋 *Your Tasks, ${employee.name}* (${tasks.length})\n\n${lines.join('\n')}\n\nUse /done <task number or keywords> to mark complete.`,
      { parse_mode: 'Markdown' }
    );
  });

  // /done <ID or keywords>
  bot.command('done', (ctx) => {
    const arg = ctx.message.text.replace('/done', '').trim();
    if (!arg) {
      return ctx.reply('❌ Usage: `/done <task ID>` or `/done <keywords>`\nExample: `/done 5` or `/done update spreadsheet`', {
        parse_mode: 'Markdown',
      });
    }

    // Try numeric ID first
    if (/^\d+$/.test(arg)) {
      const taskId = parseInt(arg, 10);
      const task = getTaskById(taskId);
      if (!task) {
        return ctx.reply(`❌ Task #${taskId} not found.`);
      }
      if (task.status === 'completed') {
        return ctx.reply(`ℹ️ Task #${taskId} is already marked complete.`);
      }
      completeTask(taskId, `Marked done by @${ctx.from?.username ?? 'unknown'}`);
      return ctx.reply(`✅ Task #${taskId} marked as complete!\n\n_"${task.title}"_`, {
        parse_mode: 'Markdown',
      });
    }

    // Try keyword search — narrow to user's tasks if they're an employee
    const username = ctx.from?.username;
    const employee = username ? getEmployeeByUsername(username) : null;

    const matches = findTasksByKeywords(arg, employee?.id);
    if (matches.length === 0) {
      return ctx.reply(`❌ No pending tasks found matching "${arg}".`);
    }
    if (matches.length > 1) {
      const list = matches
        .slice(0, 5)
        .map((t) => `• #${t.id}: ${t.title}`)
        .join('\n');
      return ctx.reply(
        `⚠️ Multiple tasks match "${arg}". Please use a task ID:\n\n${list}\n\nThen: /done <ID>`,
        { parse_mode: 'Markdown' }
      );
    }

    const task = matches[0];
    completeTask(task.id, `Marked done by @${ctx.from?.username ?? 'unknown'}`);
    ctx.reply(`✅ Task #${task.id} marked as complete!\n\n_"${task.title}"_`, {
      parse_mode: 'Markdown',
    });
  });

  // /overdue
  bot.command('overdue', (ctx) => {
    updateOverdueTasks();
    const tasks = getAllTasksWithEmployees({ status: 'overdue' });

    if (tasks.length === 0) {
      return ctx.reply('✅ No overdue tasks! Everything is on track.');
    }

    const lines = tasks.map(
      (t) =>
        `⚠️ *#${t.id}* ${t.title}\n` +
        `   👤 ${t.employee_name ?? 'Unassigned'} | Due: ${t.due_date ? formatDueDate(new Date(t.due_date)) : 'Unknown'}`
    );

    ctx.reply(
      `🚨 *Overdue Tasks* (${tasks.length})\n\n${lines.join('\n\n')}`,
      { parse_mode: 'Markdown' }
    );
  });
}
