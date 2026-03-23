import cron from 'node-cron';
import { Telegraf } from 'telegraf';
import { getAllEmployees } from '../models/employee';
import { getPendingTasksForEmployee, getUnassignedPendingTasksByGroup, updateOverdueTasks, incrementReminderCount, TaskWithEmployee } from '../models/task';
import { getDueRoutinesForEmployee, getDueUnassignedRoutinesByGroup, RoutineWithEmployee } from '../models/routine';
import { sendWhatsAppSafe } from './whatsapp';
import { morningEmployeeMessage, eveningEmployeeMessage, managerMorningSummary, groupMorningMessage, groupEveningMessage } from './templates';
import { config } from '../config';

/**
 * Build compact checkbox inline keyboard buttons for tasks + routines combined (2 per row).
 * Line numbers are continuous: tasks first, then routines.
 */
function buildCombinedButtons(
  tasks: TaskWithEmployee[],
  routines: RoutineWithEmployee[]
): { text: string; callback_data: string }[][] {
  const items: { num: number; callback_data: string }[] = [];
  let num = 1;
  for (const task of tasks) {
    items.push({ num, callback_data: `toggle_task_${task.id}` });
    num++;
  }
  for (const routine of routines) {
    items.push({ num, callback_data: `toggle_routine_${routine.id}` });
    num++;
  }

  const buttons: { text: string; callback_data: string }[][] = [];
  for (let i = 0; i < items.length; i += 2) {
    const row: { text: string; callback_data: string }[] = [];
    row.push({ text: `☑️ ${items[i].num}`, callback_data: items[i].callback_data });
    if (i + 1 < items.length) {
      row.push({ text: `☑️ ${items[i + 1].num}`, callback_data: items[i + 1].callback_data });
    }
    buttons.push(row);
  }
  return buttons;
}

function buildTaskButtons(tasks: TaskWithEmployee[]): { text: string; callback_data: string }[][] {
  return buildCombinedButtons(tasks, []);
}

/**
 * Send reminder to an employee via Telegram DM (preferred) or WhatsApp (fallback).
 * When sending via Telegram, includes inline checkbox buttons for task completion.
 */
async function sendReminder(
  bot: Telegraf,
  employee: { name: string; telegram_user_id: string | null; whatsapp_number: string | null },
  message: string,
  buttons?: { text: string; callback_data: string }[][]
): Promise<boolean> {
  // Try Telegram DM first
  if (employee.telegram_user_id) {
    try {
      await bot.telegram.sendMessage(employee.telegram_user_id, message, {
        parse_mode: 'Markdown',
        ...(buttons && buttons.length > 0 ? { reply_markup: { inline_keyboard: buttons } } : {}),
      });
      return true;
    } catch (err: unknown) {
      // User may not have started the bot — fall through to WhatsApp
      console.warn(`[Cron] Telegram DM failed for ${employee.name}, trying WhatsApp...`);
    }
  }

  // Fallback to WhatsApp
  if (employee.whatsapp_number) {
    return await sendWhatsAppSafe(employee.whatsapp_number, message);
  }

  return false;
}

/**
 * Send morning reminders to all employees,
 * then send a consolidated summary to the manager via Telegram.
 */
async function runMorningReminders(bot: Telegraf): Promise<void> {
  console.log('[Cron] Running morning reminders...');
  updateOverdueTasks();

  const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const employees = getAllEmployees();
  const tasksByEmployee: Record<string, { employee: string; tasks: TaskWithEmployee[] }> = {};

  for (const employee of employees) {
    const tasks = getPendingTasksForEmployee(employee.id);
    const routines = getDueRoutinesForEmployee(employee.id, todayIST);
    if (tasks.length === 0 && routines.length === 0) continue;

    tasksByEmployee[employee.id] = { employee: employee.name, tasks };

    const msg = morningEmployeeMessage(employee.name, tasks, routines);
    const buttons = buildCombinedButtons(tasks, routines);
    const sent = await sendReminder(bot, employee as any, msg, buttons);
    if (sent) {
      for (const task of tasks) {
        incrementReminderCount(task.id);
      }
      console.log(`[Cron] Morning reminder sent to ${employee.name} (${tasks.length} tasks, ${routines.length} routines)`);
    } else {
      console.warn(`[Cron] Could not reach ${employee.name} (no Telegram DM or WhatsApp)`);
    }
  }

  // Send reminders for unassigned tasks + routines to their group chats
  const unassignedGroups = getUnassignedPendingTasksByGroup();
  const unassignedRoutineGroups = getDueUnassignedRoutinesByGroup(todayIST);

  // Merge group keys
  const allGroupIds = new Set([...Object.keys(unassignedGroups), ...Object.keys(unassignedRoutineGroups)]);
  for (const groupChatId of allGroupIds) {
    try {
      const taskGroup = unassignedGroups[groupChatId];
      const routineGroup = unassignedRoutineGroups[groupChatId];
      const tasks = taskGroup?.tasks ?? [];
      const routines = routineGroup?.routines ?? [];
      const groupName = taskGroup?.groupChatName ?? routineGroup?.groupChatName ?? groupChatId;

      const msg = groupMorningMessage(groupName, tasks, routines);
      const groupButtons = buildCombinedButtons(tasks, routines);
      await bot.telegram.sendMessage(groupChatId, msg, {
        parse_mode: 'Markdown',
        ...(groupButtons.length > 0 ? { reply_markup: { inline_keyboard: groupButtons } } : {}),
      });
      for (const task of tasks) {
        incrementReminderCount(task.id);
      }
      console.log(`[Cron] Morning group reminder sent to ${groupName} (${tasks.length} tasks, ${routines.length} routines)`);
    } catch (err: unknown) {
      console.warn(`[Cron] Failed to send morning reminder to group ${groupChatId}:`, err);
    }
  }

  // Send consolidated summary to manager via Telegram
  if (config.manager.telegramId) {
    try {
      const summary = managerMorningSummary(config.manager.name, tasksByEmployee);
      await bot.telegram.sendMessage(config.manager.telegramId, summary);
      console.log('[Cron] Morning summary sent to manager on Telegram');
    } catch (err: unknown) {
      console.error('[Cron] Failed to send manager Telegram summary:', err);
    }
  }
}

/**
 * Send evening reminders to all employees.
 */
async function runEveningReminders(bot: Telegraf): Promise<void> {
  console.log('[Cron] Running evening reminders...');
  updateOverdueTasks();

  const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const employees = getAllEmployees();

  for (const employee of employees) {
    const tasks = getPendingTasksForEmployee(employee.id);
    const routines = getDueRoutinesForEmployee(employee.id, todayIST);
    if (tasks.length === 0 && routines.length === 0) continue;

    const msg = eveningEmployeeMessage(employee.name, tasks, routines);
    const buttons = buildCombinedButtons(tasks, routines);
    const sent = await sendReminder(bot, employee as any, msg, buttons);
    if (sent) {
      for (const task of tasks) {
        incrementReminderCount(task.id);
      }
      console.log(`[Cron] Evening reminder sent to ${employee.name} (${tasks.length} tasks, ${routines.length} routines)`);
    } else {
      console.warn(`[Cron] Could not reach ${employee.name}`);
    }
  }

  // Send reminders for unassigned tasks + routines to their group chats
  const unassignedGroups = getUnassignedPendingTasksByGroup();
  const unassignedRoutineGroups = getDueUnassignedRoutinesByGroup(todayIST);

  const allGroupIds = new Set([...Object.keys(unassignedGroups), ...Object.keys(unassignedRoutineGroups)]);
  for (const groupChatId of allGroupIds) {
    try {
      const taskGroup = unassignedGroups[groupChatId];
      const routineGroup = unassignedRoutineGroups[groupChatId];
      const tasks = taskGroup?.tasks ?? [];
      const routines = routineGroup?.routines ?? [];
      const groupName = taskGroup?.groupChatName ?? routineGroup?.groupChatName ?? groupChatId;

      const msg = groupEveningMessage(groupName, tasks, routines);
      const groupButtons = buildCombinedButtons(tasks, routines);
      await bot.telegram.sendMessage(groupChatId, msg, {
        parse_mode: 'Markdown',
        ...(groupButtons.length > 0 ? { reply_markup: { inline_keyboard: groupButtons } } : {}),
      });
      for (const task of tasks) {
        incrementReminderCount(task.id);
      }
      console.log(`[Cron] Evening group reminder sent to ${groupName} (${tasks.length} tasks, ${routines.length} routines)`);
    } catch (err: unknown) {
      console.warn(`[Cron] Failed to send evening reminder to group ${groupChatId}:`, err);
    }
  }
}

/**
 * Periodically mark overdue tasks (runs every hour).
 */
function runOverdueCheck(): void {
  const changed = updateOverdueTasks();
  if (changed > 0) {
    console.log(`[Cron] Marked ${changed} task(s) as overdue`);
  }
}

export function setupCron(bot: Telegraf): void {
  // Morning reminders: 10:15 AM IST
  cron.schedule('15 10 * * *', () => {
    runMorningReminders(bot).catch((err) => {
      console.error('[Cron] Morning reminder error:', err);
    });
  }, { timezone: config.timezone });

  // Evening reminders: 5:00 PM IST
  cron.schedule('0 17 * * *', () => {
    runEveningReminders(bot).catch((err) => {
      console.error('[Cron] Evening reminder error:', err);
    });
  }, { timezone: config.timezone });

  // Overdue check: every hour
  cron.schedule('0 * * * *', () => {
    runOverdueCheck();
  });

  console.log('[Cron] Scheduled: morning (10:15 AM IST), evening (5:00 PM IST), overdue check (hourly)');
}
