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
} from '../models/task';
import { getAllEmployees } from '../models/employee';

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

  res.render('dashboard', {
    tasks,
    tasksByEmployee,
    stats,
    employees,
    groupChats,
    filters,
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

export default router;
