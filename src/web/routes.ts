import { Router, Request, Response } from 'express';
import {
  getAllTasksWithEmployees,
  getTaskStats,
  updateOverdueTasks,
  TaskWithEmployee,
  createTask,
  completeTask,
  deleteTask,
  getDistinctGroupChats,
  getPendingTasksForEmployee,
  getUnassignedPendingTasksByGroup,
} from '../models/task';
import { getAllEmployees, getEmployeeById } from '../models/employee';
import { Telegraf } from 'telegraf';
import { formatDueDate } from '../bot/taskParser';

let botInstance: Telegraf | null = null;

export function setBotInstance(bot: Telegraf): void {
  botInstance = bot;
}

const router = Router();

router.get('/', (req: Request, res: Response) => {
  updateOverdueTasks();

  const filters = {
    status: (req.query.status as string) || '',
    employee: (req.query.employee as string) || '',
    from: (req.query.from as string) || '',
    to: (req.query.to as string) || '',
  };

  const queryFilters: Parameters<typeof getAllTasksWithEmployees>[0] = {};
  if (filters.status) queryFilters.status = filters.status as TaskWithEmployee['status'];
  if (filters.employee) queryFilters.employeeId = parseInt(filters.employee, 10);
  if (filters.from) queryFilters.fromDate = filters.from;
  if (filters.to) queryFilters.toDate = filters.to + 'T23:59:59';

  const tasks = getAllTasksWithEmployees(queryFilters);
  const stats = getTaskStats();
  const employees = getAllEmployees();
  const groupChats = getDistinctGroupChats();

  // Group tasks by employee name (or "Unassigned")
  const tasksByEmployee: Record<string, TaskWithEmployee[]> = {};

  for (const task of tasks) {
    const key = task.employee_name ?? 'Unassigned';
    if (!tasksByEmployee[key]) tasksByEmployee[key] = [];
    tasksByEmployee[key].push(task);
  }

  const msg = (req.query.msg as string) || '';

  res.render('dashboard', {
    tasks,
    tasksByEmployee,
    stats,
    employees,
    groupChats,
    filters,
    msg,
  });
});

router.post('/tasks/create', (req: Request, res: Response) => {
  const { title, description, assigned_to, priority, due_date, group_chat_id, group_chat_name } = req.body;

  if (!title || !title.trim()) {
    return res.redirect('/');
  }

  // Find selected group chat name if group_chat_id provided
  let resolvedGroupChatName = group_chat_name || null;
  if (group_chat_id && !resolvedGroupChatName) {
    const chats = getDistinctGroupChats();
    const found = chats.find(c => c.group_chat_id === group_chat_id);
    if (found) resolvedGroupChatName = found.group_chat_name;
  }

  createTask({
    title: title.trim(),
    description: description?.trim() || undefined,
    assignedTo: assigned_to ? parseInt(assigned_to, 10) : undefined,
    assignedBy: 'Dashboard',
    groupChatId: group_chat_id || undefined,
    groupChatName: resolvedGroupChatName || undefined,
    priority: priority || 'medium',
    dueDate: due_date || undefined,
  });

  res.redirect('/');
});

router.post('/tasks/:id/done', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!isNaN(id)) completeTask(id);
  res.redirect('/');
});

router.post('/tasks/:id/delete', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!isNaN(id)) deleteTask(id);
  res.redirect('/');
});

// Send pending task list to a person (DM) or group (group chat) via Telegram
router.post('/tasks/send-telegram', async (req: Request, res: Response) => {
  if (!botInstance) {
    return res.redirect('/?msg=Bot+not+ready');
  }

  const { type, employee_id, group_chat_id } = req.body;

  try {
    if (type === 'employee' && employee_id) {
      const empId = parseInt(employee_id, 10);
      const employee = getEmployeeById(empId);
      if (!employee || !employee.telegram_user_id) {
        return res.redirect('/?msg=Employee+has+no+Telegram+ID');
      }
      const tasks = getPendingTasksForEmployee(empId);
      if (tasks.length === 0) {
        return res.redirect('/?msg=No+pending+tasks');
      }
      const lines = [`📋 *Your pending tasks (${tasks.length}):*\n`];
      tasks.forEach((t, i) => {
        const due = t.due_date ? ` _(${formatDueDate(new Date(t.due_date))})_` : '';
        const overdue = t.status === 'overdue' ? ' ⚠️' : '';
        lines.push(`${i + 1}. ${t.title}${due}${overdue}`);
      });
      await botInstance.telegram.sendMessage(employee.telegram_user_id, lines.join('\n'), { parse_mode: 'Markdown' });
      return res.redirect('/?msg=Sent+to+' + encodeURIComponent(employee.name));

    } else if (type === 'group' && group_chat_id) {
      const groups = getUnassignedPendingTasksByGroup();
      const group = groups[group_chat_id];
      // Also get all tasks for this group chat (assigned + unassigned)
      const allTasks = getAllTasksWithEmployees().filter(
        t => t.group_chat_id === group_chat_id && t.status !== 'completed'
      );
      if (allTasks.length === 0) {
        return res.redirect('/?msg=No+pending+tasks');
      }
      const groupName = allTasks[0]?.group_chat_name || 'Group';
      const lines = [`📋 *Pending tasks (${allTasks.length}):*\n`];
      allTasks.forEach((t, i) => {
        const due = t.due_date ? ` _(${formatDueDate(new Date(t.due_date))})_` : '';
        const overdue = t.status === 'overdue' ? ' ⚠️' : '';
        const assignee = t.employee_name ? ` → ${t.employee_name}` : '';
        lines.push(`${i + 1}. ${t.title}${assignee}${due}${overdue}`);
      });
      await botInstance.telegram.sendMessage(group_chat_id, lines.join('\n'), { parse_mode: 'Markdown' });
      return res.redirect('/?msg=Sent+to+' + encodeURIComponent(groupName));
    }

    res.redirect('/?msg=Invalid+request');
  } catch (err: unknown) {
    console.error('[Web] Send Telegram error:', err);
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    res.redirect('/?msg=Error:+' + encodeURIComponent(errMsg));
  }
});

export default router;
