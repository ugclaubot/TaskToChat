import { Router, Request, Response } from 'express';
import { getAllTasksWithEmployees, getTaskStats, updateOverdueTasks, TaskWithEmployee } from '../models/task';
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
    filters,
  });
});

export default router;
