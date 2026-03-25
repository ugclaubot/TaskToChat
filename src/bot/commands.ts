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
  getTasksByGroupChat,
  TaskWithEmployee,
  updateOverdueTasks,
} from '../models/task';
import {
  getRoutinesForEmployee,
  getAllRoutines,
  getRoutinesByGroupChat,
  getRoutineById,
  pauseRoutine,
  resumeRoutine,
  stopRoutine,
  formatRecurrenceLabel,
  RoutineWithEmployee,
} from '../models/routine';
import { isAdmin, addAdmin, removeAdmin, getAllAdmins } from '../models/admin';
import { formatDueDate } from './taskParser';

function isManagerOrAdmin(ctx: Context): boolean {
  const userId = ctx.from?.id?.toString();
  if (!userId) return false;
  return isAdmin(userId);
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

function formatTaskLine(task: TaskWithEmployee, index?: number): string {
  const num = index !== undefined ? `${index + 1}. ` : `#${task.id} `;
  const overdue = task.status === 'overdue' ? '[OVERDUE ⚠️] ' : '';
  const due = task.due_date ? ` (Due: ${formatDueDate(new Date(task.due_date))})` : '';
  const priority = priorityEmoji(task.priority);
  const age = formatTaskAge(task.created_at);
  return age
    ? `${num}${overdue}${priority} ${task.title}${due} ${age}`
    : `${num}${overdue}${priority} ${task.title}${due}`;
}

function formatTaskBlock(task: TaskWithEmployee): string {
  const lines: string[] = [];
  lines.push(`${statusEmoji(task.status)} *#${task.id}* — ${task.title}`);
  if (task.description) lines.push(`   _${task.description}_`);
  if (task.employee_name) lines.push(`   👤 ${task.employee_name}`);
  if (task.due_date) lines.push(`   📅 Due: ${formatDueDate(new Date(task.due_date))}`);
  lines.push(`   ${priorityEmoji(task.priority)} ${task.priority} priority | ${task.status}`);
  const age = formatTaskAge(task.created_at);
  if (age) lines.push(`   ${age}`);
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
      '*Admin:*\n' +
      '/addadmin (reply to a user) — Make them admin\n' +
      '/removeadmin (reply to a user) — Remove admin\n' +
      '/admins — List all admins\n' +
      '/addemployee Name @username 91XXXXXXXXXX\n' +
      '/employees — List all employees',
      { parse_mode: 'Markdown' }
    );
  });

  // /addadmin — reply to a user's message to make them admin
  bot.command('addadmin', (ctx) => {
    if (!isManagerOrAdmin(ctx)) {
      return ctx.reply('❌ Only admins can add other admins.');
    }

    const reply = ctx.message.reply_to_message;
    if (!reply || !reply.from) {
      return ctx.reply('❌ Reply to a user\'s message with /addadmin to make them admin.');
    }

    const targetId = String(reply.from.id);
    const targetName = reply.from.first_name + (reply.from.last_name ? ' ' + reply.from.last_name : '');
    const addedBy = ctx.from?.username ? `@${ctx.from.username}` : ctx.from?.first_name ?? 'Unknown';

    const admin = addAdmin(targetId, targetName, addedBy);
    ctx.reply(`✅ *${admin.name}* is now an admin!`, { parse_mode: 'Markdown' });
  });

  // /removeadmin — reply to a user's message to remove admin
  bot.command('removeadmin', (ctx) => {
    const userId = ctx.from?.id?.toString();
    if (!userId || userId !== config.manager.telegramId) {
      return ctx.reply('❌ Only the owner can remove admins.');
    }

    const reply = ctx.message.reply_to_message;
    if (!reply || !reply.from) {
      return ctx.reply('❌ Reply to a user\'s message with /removeadmin.');
    }

    const targetId = String(reply.from.id);
    const removed = removeAdmin(targetId);
    if (removed) {
      ctx.reply(`✅ Admin removed.`);
    } else {
      ctx.reply(`ℹ️ That user wasn't an admin.`);
    }
  });

  // /admins — list all admins
  bot.command('admins', (ctx) => {
    const admins = getAllAdmins();
    const lines = admins.map((a, i) => `${i + 1}. *${a.name}*`);
    const ownerLine = `👑 *Owner:* ${config.manager.name}`;
    const adminLines = lines.length > 0 ? '\n' + lines.join('\n') : '\n_No additional admins_';
    ctx.reply(`${ownerLine}${adminLines}`, { parse_mode: 'Markdown' });
  });

  // /addemployee Name @username 919810XXXXXX
  bot.command('addemployee', (ctx) => {
    if (!isManagerOrAdmin(ctx)) {
      return ctx.reply('❌ Only admins can add employees.');
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

  // /tasks or /tasks @person — in groups, auto-scoped to that group
  bot.command('tasks', (ctx) => {
    updateOverdueTasks();

    const arg = ctx.message.text.replace('/tasks', '').trim();
    const chatId = String(ctx.message.chat.id);
    const isGroup = ctx.message.chat.type !== 'private';
    const groupName = isGroup ? ((ctx.message.chat as any).title ?? 'This group') : null;

    // /tasks @person — filter by person
    if (arg) {
      const employee = findEmployee(arg);
      if (!employee) {
        return ctx.reply(`❌ "${arg}" not found.`);
      }
      let tasks: TaskWithEmployee[];
      if (isGroup) {
        tasks = getTasksByGroupChat(chatId).filter(t => t.assigned_to === employee.id);
      } else {
        tasks = getAllTasksWithEmployees({ employeeId: employee.id }).filter(t => t.status !== 'completed');
      }
      if (tasks.length === 0) {
        return ctx.reply(`✅ No pending tasks for *${employee.name}*!`, { parse_mode: 'Markdown' });
      }
      const lines = tasks.map((t, i) => {
        const due = t.due_date ? ` _(${formatDueDate(new Date(t.due_date))})_` : '';
        const overdue = t.status === 'overdue' ? ' ⚠️' : '';
        const age = formatTaskAge(t.created_at);
        return `${i + 1}. _${t.title}_${due}${overdue}${age ? ` ${age}` : ''}`;
      });
      return ctx.reply(
        `👤 *${employee.name}* — ${tasks.length} task(s)\n\n${lines.join('\n')}`,
        { parse_mode: 'Markdown' }
      );
    }

    // /tasks — show all, grouped by person
    let tasks: TaskWithEmployee[];
    if (isGroup) {
      tasks = getTasksByGroupChat(chatId);
    } else {
      tasks = getAllTasksWithEmployees().filter(t => t.status !== 'completed');
    }

    if (tasks.length === 0) {
      return ctx.reply('✅ No pending tasks!');
    }

    // Group by employee
    const byEmployee: Record<string, TaskWithEmployee[]> = {};
    const unassigned: TaskWithEmployee[] = [];

    for (const task of tasks) {
      if (task.employee_name) {
        if (!byEmployee[task.employee_name]) byEmployee[task.employee_name] = [];
        byEmployee[task.employee_name].push(task);
      } else {
        unassigned.push(task);
      }
    }

    const sections: string[] = [];
    for (const [name, empTasks] of Object.entries(byEmployee)) {
      const lines = empTasks.map((t, i) => {
        const due = t.due_date ? ` _(${formatDueDate(new Date(t.due_date))})_` : '';
        const overdue = t.status === 'overdue' ? ' ⚠️' : '';
        const age = formatTaskAge(t.created_at);
        return `  ${i + 1}. _${t.title}_${due}${overdue}${age ? ` ${age}` : ''}`;
      });
      sections.push(`👤 *${name}* (${empTasks.length})\n${lines.join('\n')}`);
    }
    if (unassigned.length > 0) {
      const lines = unassigned.map((t, i) => {
        const due = t.due_date ? ` _(${formatDueDate(new Date(t.due_date))})_` : '';
        const overdue = t.status === 'overdue' ? ' ⚠️' : '';
        const age = formatTaskAge(t.created_at);
        return `  ${i + 1}. _${t.title}_${due}${overdue}${age ? ` ${age}` : ''}`;
      });
      sections.push(`👥 *Group* (${unassigned.length})\n${lines.join('\n')}`);
    }

    const header = isGroup ? `📋 *${groupName}* — ${tasks.length} task(s)` : `📋 *All Tasks* — ${tasks.length}`;
    ctx.reply(`${header}\n\n${sections.join('\n\n')}`, { parse_mode: 'Markdown' });
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

  // /routines — list active routines (scoped to group if in a group chat)
  bot.command('routines', (ctx) => {
    const chatId = String(ctx.message.chat.id);
    const isGroup = ctx.message.chat.type !== 'private';

    const routines: RoutineWithEmployee[] = isGroup
      ? getRoutinesByGroupChat(chatId)
      : getAllRoutines().filter(r => r.status !== 'stopped');

    if (routines.length === 0) {
      return ctx.reply('🔁 No active routines.\n\nCreate one with:\n`#routine @Name task title daily`', {
        parse_mode: 'Markdown',
      });
    }

    const lines = routines.map((r, i) => {
      const label = formatRecurrenceLabel(r.recurrence_type, r.recurrence_day, r.recurrence_month, r.anchor_date);
      const nextDue = new Date(r.next_due + 'T00:00:00').toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata',
      });
      const assignee = r.employee_name ? ` · 👤 ${r.employee_name}` : '';
      const statusTag = r.status === 'paused' ? ' ⏸' : '';
      return `${i + 1}. 🔁 *${r.title}*${statusTag}\n   _(${label})_ · next: ${nextDue}${assignee} · #${r.id}`;
    });

    const header = isGroup
      ? `🔁 *Routines* (${routines.length})`
      : `🔁 *All Routines* (${routines.length})`;

    ctx.reply(`${header}\n\n${lines.join('\n\n')}`, { parse_mode: 'Markdown' });
  });

  // /routine stop <id> | pause <id> | resume <id>
  bot.command('routine', (ctx) => {
    const args = ctx.message.text.replace('/routine', '').trim().split(/\s+/);
    const subcommand = args[0]?.toLowerCase();
    const idStr = args[1];

    if (!subcommand || !idStr || !/^\d+$/.test(idStr)) {
      return ctx.reply(
        '❌ Usage:\n`/routine stop <id>`\n`/routine pause <id>`\n`/routine resume <id>`',
        { parse_mode: 'Markdown' }
      );
    }

    const id = parseInt(idStr, 10);
    const routine = getRoutineById(id);
    if (!routine) {
      return ctx.reply(`❌ Routine #${id} not found.`);
    }

    switch (subcommand) {
      case 'stop':
        stopRoutine(id);
        return ctx.reply(`🛑 Routine #${id} stopped.\n_"${routine.title}"_`, { parse_mode: 'Markdown' });
      case 'pause':
        pauseRoutine(id);
        return ctx.reply(`⏸ Routine #${id} paused.\n_"${routine.title}"_`, { parse_mode: 'Markdown' });
      case 'resume':
        resumeRoutine(id);
        return ctx.reply(`▶️ Routine #${id} resumed.\n_"${routine.title}"_`, { parse_mode: 'Markdown' });
      default:
        return ctx.reply('❌ Unknown subcommand. Use: `stop`, `pause`, or `resume`', { parse_mode: 'Markdown' });
    }
  });

  // /myroutines — show routines assigned to the calling user
  bot.command('myroutines', (ctx) => {
    const username = ctx.from?.username;
    if (!username) {
      return ctx.reply('❌ You need a Telegram username to use /myroutines.');
    }

    const employee = getEmployeeByUsername(username);
    if (!employee) {
      return ctx.reply(
        `❌ Your username @${username} isn't in the employee directory. Ask the manager to add you with /addemployee.`
      );
    }

    const routines = getRoutinesForEmployee(employee.id);

    if (routines.length === 0) {
      return ctx.reply(`🔁 You have no active routines, ${employee.name}!`);
    }

    const lines = routines.map((r, i) => {
      const label = formatRecurrenceLabel(r.recurrence_type, r.recurrence_day, r.recurrence_month, r.anchor_date);
      const nextDue = new Date(r.next_due + 'T00:00:00').toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata',
      });
      const statusTag = r.status === 'paused' ? ' ⏸' : '';
      return `${i + 1}. 🔁 _${r.title}_${statusTag}\n   _(${label})_ · next: ${nextDue} · #${r.id}`;
    });

    ctx.reply(
      `🔁 *Your Routines, ${employee.name}* (${routines.length})\n\n${lines.join('\n\n')}`,
      { parse_mode: 'Markdown' }
    );
  });
}
