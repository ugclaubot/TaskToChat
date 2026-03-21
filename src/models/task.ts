import { getDb } from '../database';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'overdue';
export type TaskPriority = 'high' | 'medium' | 'low';
export type UpdateType = 'created' | 'reminded' | 'completed' | 'reopened' | 'updated';

export interface Task {
  id: number;
  title: string;
  description: string | null;
  assigned_to: number | null;
  assigned_by: string;
  group_chat_id: string | null;
  group_chat_name: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  created_at: string;
  completed_at: string | null;
  reminder_count: number;
}

export interface TaskWithEmployee extends Task {
  employee_name: string | null;
  employee_username: string | null;
  employee_whatsapp: string | null;
}

export interface TaskUpdate {
  id: number;
  task_id: number;
  update_type: UpdateType;
  note: string | null;
  created_at: string;
}

export function createTask(params: {
  title: string;
  description?: string;
  assignedTo?: number;
  assignedBy: string;
  groupChatId?: string;
  groupChatName?: string;
  priority?: TaskPriority;
  dueDate?: string;
}): Task {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO tasks (title, description, assigned_to, assigned_by, group_chat_id, group_chat_name, priority, due_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      params.title,
      params.description ?? null,
      params.assignedTo ?? null,
      params.assignedBy,
      params.groupChatId ?? null,
      params.groupChatName ?? null,
      params.priority ?? 'medium',
      params.dueDate ?? null
    );

  const task = getTaskById(result.lastInsertRowid as number)!;
  addTaskUpdate(task.id, 'created', 'Task created');
  return task;
}

export function getTaskById(id: number): Task | null {
  const db = getDb();
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | null;
}

export function getTasksByEmployee(employeeId: number, status?: TaskStatus): Task[] {
  const db = getDb();
  if (status) {
    return db
      .prepare('SELECT * FROM tasks WHERE assigned_to = ? AND status = ? ORDER BY due_date ASC, created_at ASC')
      .all(employeeId, status) as Task[];
  }
  return db
    .prepare('SELECT * FROM tasks WHERE assigned_to = ? ORDER BY status, due_date ASC, created_at ASC')
    .all(employeeId) as Task[];
}

/**
 * Find existing pending tasks similar to the given title for the same assignee.
 */
export function findSimilarPendingTasks(title: string, assignedTo?: number, groupChatId?: string): TaskWithEmployee[] {
  const db = getDb();
  const words = title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  if (words.length === 0) return [];

  const conditions: string[] = ["t.status IN ('pending','in_progress','overdue')"];
  const values: unknown[] = [];

  if (assignedTo) {
    conditions.push('t.assigned_to = ?');
    values.push(assignedTo);
  }
  if (groupChatId) {
    conditions.push('t.group_chat_id = ?');
    values.push(groupChatId);
  }

  // Match any significant word in the title
  const wordConditions = words.map(w => {
    values.push(`%${w}%`);
    return 'lower(t.title) LIKE ?';
  });
  conditions.push(`(${wordConditions.join(' OR ')})`);

  const where = conditions.join(' AND ');
  return db.prepare(
    `SELECT t.*, e.name as employee_name, e.telegram_username as employee_username, e.whatsapp_number as employee_whatsapp
     FROM tasks t LEFT JOIN employees e ON t.assigned_to = e.id
     WHERE ${where} LIMIT 5`
  ).all(...values) as TaskWithEmployee[];
}

export function getTasksByGroupChat(groupChatId: string, status?: TaskStatus): TaskWithEmployee[] {
  const db = getDb();
  const conditions = ['t.group_chat_id = ?'];
  const values: unknown[] = [groupChatId];

  if (status) {
    conditions.push('t.status = ?');
    values.push(status);
  } else {
    conditions.push("t.status != 'completed'");
  }

  return db.prepare(
    `SELECT t.*, e.name as employee_name, e.telegram_username as employee_username, e.whatsapp_number as employee_whatsapp
     FROM tasks t LEFT JOIN employees e ON t.assigned_to = e.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY e.name, t.status, t.due_date ASC`
  ).all(...values) as TaskWithEmployee[];
}

export function getAllTasksWithEmployees(filters?: {
  status?: TaskStatus;
  employeeId?: number;
  fromDate?: string;
  toDate?: string;
}): TaskWithEmployee[] {
  const db = getDb();
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters?.status) {
    conditions.push('t.status = ?');
    values.push(filters.status);
  }
  if (filters?.employeeId) {
    conditions.push('t.assigned_to = ?');
    values.push(filters.employeeId);
  }
  if (filters?.fromDate) {
    conditions.push('t.created_at >= ?');
    values.push(filters.fromDate);
  }
  if (filters?.toDate) {
    conditions.push('t.created_at <= ?');
    values.push(filters.toDate);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return db
    .prepare(
      `SELECT t.*, e.name as employee_name, e.telegram_username as employee_username, e.whatsapp_number as employee_whatsapp
       FROM tasks t
       LEFT JOIN employees e ON t.assigned_to = e.id
       ${where}
       ORDER BY t.status, t.due_date ASC, t.created_at ASC`
    )
    .all(...values) as TaskWithEmployee[];
}

export function getPendingTasksForEmployee(employeeId: number): TaskWithEmployee[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT t.*, e.name as employee_name, e.telegram_username as employee_username, e.whatsapp_number as employee_whatsapp
       FROM tasks t
       LEFT JOIN employees e ON t.assigned_to = e.id
       WHERE t.assigned_to = ? AND t.status IN ('pending','in_progress','overdue')
       ORDER BY t.status = 'overdue' DESC, t.due_date ASC`
    )
    .all(employeeId) as TaskWithEmployee[];
}

export function completeTask(taskId: number, note?: string): Task | null {
  const db = getDb();
  db.prepare(
    `UPDATE tasks SET status = 'completed', completed_at = datetime('now') WHERE id = ?`
  ).run(taskId);
  addTaskUpdate(taskId, 'completed', note ?? 'Task marked complete');
  return getTaskById(taskId);
}

export function markTaskOverdue(taskId: number): void {
  const db = getDb();
  db.prepare(`UPDATE tasks SET status = 'overdue' WHERE id = ? AND status IN ('pending','in_progress')`).run(taskId);
  addTaskUpdate(taskId, 'updated', 'Marked overdue by system');
}

export function updateOverdueTasks(): number {
  const db = getDb();
  const now = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const result = db
    .prepare(
      `UPDATE tasks SET status = 'overdue'
       WHERE status IN ('pending','in_progress')
       AND due_date IS NOT NULL
       AND due_date < ?`
    )
    .run(now);
  return result.changes;
}

export function incrementReminderCount(taskId: number): void {
  const db = getDb();
  db.prepare('UPDATE tasks SET reminder_count = reminder_count + 1 WHERE id = ?').run(taskId);
  addTaskUpdate(taskId, 'reminded');
}

export function addTaskUpdate(taskId: number, type: UpdateType, note?: string): void {
  const db = getDb();
  db.prepare('INSERT INTO task_updates (task_id, update_type, note) VALUES (?, ?, ?)').run(
    taskId,
    type,
    note ?? null
  );
}

export function getTaskUpdates(taskId: number): TaskUpdate[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM task_updates WHERE task_id = ? ORDER BY created_at ASC')
    .all(taskId) as TaskUpdate[];
}

export function findTasksByKeywords(keywords: string, employeeId?: number): Task[] {
  const db = getDb();
  const term = `%${keywords}%`;
  if (employeeId !== undefined) {
    return db
      .prepare(
        `SELECT * FROM tasks WHERE assigned_to = ? AND (lower(title) LIKE lower(?) OR lower(description) LIKE lower(?))
         AND status != 'completed' ORDER BY created_at DESC`
      )
      .all(employeeId, term, term) as Task[];
  }
  return db
    .prepare(
      `SELECT * FROM tasks WHERE (lower(title) LIKE lower(?) OR lower(description) LIKE lower(?))
       AND status != 'completed' ORDER BY created_at DESC`
    )
    .all(term, term) as Task[];
}

export function getTaskStats(): {
  total: number;
  completed: number;
  pending: number;
  overdue: number;
  in_progress: number;
  completion_rate: number;
} {
  const db = getDb();
  const rows = db
    .prepare('SELECT status, COUNT(*) as count FROM tasks GROUP BY status')
    .all() as { status: string; count: number }[];

  const stats = { total: 0, completed: 0, pending: 0, overdue: 0, in_progress: 0, completion_rate: 0 };
  for (const row of rows) {
    stats.total += row.count;
    if (row.status === 'completed') stats.completed = row.count;
    else if (row.status === 'pending') stats.pending = row.count;
    else if (row.status === 'overdue') stats.overdue = row.count;
    else if (row.status === 'in_progress') stats.in_progress = row.count;
  }
  stats.completion_rate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
  return stats;
}
