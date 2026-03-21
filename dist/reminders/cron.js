"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupCron = setupCron;
const node_cron_1 = __importDefault(require("node-cron"));
const employee_1 = require("../models/employee");
const task_1 = require("../models/task");
const whatsapp_1 = require("./whatsapp");
const templates_1 = require("./templates");
const config_1 = require("../config");
/**
 * Send reminder to an employee via Telegram DM (preferred) or WhatsApp (fallback).
 */
async function sendReminder(bot, employee, message) {
    // Try Telegram DM first
    if (employee.telegram_user_id) {
        try {
            await bot.telegram.sendMessage(employee.telegram_user_id, message);
            return true;
        }
        catch (err) {
            // User may not have started the bot — fall through to WhatsApp
            console.warn(`[Cron] Telegram DM failed for ${employee.name}, trying WhatsApp...`);
        }
    }
    // Fallback to WhatsApp
    if (employee.whatsapp_number) {
        return await (0, whatsapp_1.sendWhatsAppSafe)(employee.whatsapp_number, message);
    }
    return false;
}
/**
 * Send morning reminders to all employees,
 * then send a consolidated summary to the manager via Telegram.
 */
async function runMorningReminders(bot) {
    console.log('[Cron] Running morning reminders...');
    (0, task_1.updateOverdueTasks)();
    const employees = (0, employee_1.getAllEmployees)();
    const tasksByEmployee = {};
    for (const employee of employees) {
        const tasks = (0, task_1.getPendingTasksForEmployee)(employee.id);
        if (tasks.length === 0)
            continue;
        tasksByEmployee[employee.id] = { employee: employee.name, tasks };
        const msg = (0, templates_1.morningEmployeeMessage)(employee.name, tasks);
        const sent = await sendReminder(bot, employee, msg);
        if (sent) {
            for (const task of tasks) {
                (0, task_1.incrementReminderCount)(task.id);
            }
            console.log(`[Cron] Morning reminder sent to ${employee.name}`);
        }
        else {
            console.warn(`[Cron] Could not reach ${employee.name} (no Telegram DM or WhatsApp)`);
        }
    }
    // Send consolidated summary to manager via Telegram
    if (config_1.config.manager.telegramId) {
        try {
            const summary = (0, templates_1.managerMorningSummary)(config_1.config.manager.name, tasksByEmployee);
            await bot.telegram.sendMessage(config_1.config.manager.telegramId, summary);
            console.log('[Cron] Morning summary sent to manager on Telegram');
        }
        catch (err) {
            console.error('[Cron] Failed to send manager Telegram summary:', err);
        }
    }
}
/**
 * Send evening reminders to all employees.
 */
async function runEveningReminders(bot) {
    console.log('[Cron] Running evening reminders...');
    (0, task_1.updateOverdueTasks)();
    const employees = (0, employee_1.getAllEmployees)();
    for (const employee of employees) {
        const tasks = (0, task_1.getPendingTasksForEmployee)(employee.id);
        if (tasks.length === 0)
            continue;
        const msg = (0, templates_1.eveningEmployeeMessage)(employee.name, tasks);
        const sent = await sendReminder(bot, employee, msg);
        if (sent) {
            for (const task of tasks) {
                (0, task_1.incrementReminderCount)(task.id);
            }
            console.log(`[Cron] Evening reminder sent to ${employee.name}`);
        }
        else {
            console.warn(`[Cron] Could not reach ${employee.name}`);
        }
    }
}
/**
 * Periodically mark overdue tasks (runs every hour).
 */
function runOverdueCheck() {
    const changed = (0, task_1.updateOverdueTasks)();
    if (changed > 0) {
        console.log(`[Cron] Marked ${changed} task(s) as overdue`);
    }
}
function setupCron(bot) {
    // Morning reminders: 10:15 AM IST
    node_cron_1.default.schedule('15 10 * * *', () => {
        runMorningReminders(bot).catch((err) => {
            console.error('[Cron] Morning reminder error:', err);
        });
    }, { timezone: config_1.config.timezone });
    // Evening reminders: 6:00 PM IST
    node_cron_1.default.schedule('0 18 * * *', () => {
        runEveningReminders(bot).catch((err) => {
            console.error('[Cron] Evening reminder error:', err);
        });
    }, { timezone: config_1.config.timezone });
    // Overdue check: every hour
    node_cron_1.default.schedule('0 * * * *', () => {
        runOverdueCheck();
    });
    console.log('[Cron] Scheduled: morning (10:15 AM IST), evening (6:00 PM IST), overdue check (hourly)');
}
//# sourceMappingURL=cron.js.map