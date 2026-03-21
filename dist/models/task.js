"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTask = createTask;
exports.getTaskById = getTaskById;
exports.getTasksByEmployee = getTasksByEmployee;
exports.getAllTasksWithEmployees = getAllTasksWithEmployees;
exports.getPendingTasksForEmployee = getPendingTasksForEmployee;
exports.completeTask = completeTask;
exports.markTaskOverdue = markTaskOverdue;
exports.updateOverdueTasks = updateOverdueTasks;
exports.incrementReminderCount = incrementReminderCount;
exports.addTaskUpdate = addTaskUpdate;
exports.getTaskUpdates = getTaskUpdates;
exports.findTasksByKeywords = findTasksByKeywords;
exports.getTaskStats = getTaskStats;
const database_1 = require("../database");
function createTask(params) {
    const db = (0, database_1.getDb)();
    const result = db
        .prepare(`INSERT INTO tasks (title, description, assigned_to, assigned_by, group_chat_id, group_chat_name, priority, due_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(params.title, params.description ?? null, params.assignedTo ?? null, params.assignedBy, params.groupChatId ?? null, params.groupChatName ?? null, params.priority ?? 'medium', params.dueDate ?? null);
    const task = getTaskById(result.lastInsertRowid);
    addTaskUpdate(task.id, 'created', 'Task created');
    return task;
}
function getTaskById(id) {
    const db = (0, database_1.getDb)();
    return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
}
function getTasksByEmployee(employeeId, status) {
    const db = (0, database_1.getDb)();
    if (status) {
        return db
            .prepare('SELECT * FROM tasks WHERE assigned_to = ? AND status = ? ORDER BY due_date ASC, created_at ASC')
            .all(employeeId, status);
    }
    return db
        .prepare('SELECT * FROM tasks WHERE assigned_to = ? ORDER BY status, due_date ASC, created_at ASC')
        .all(employeeId);
}
function getAllTasksWithEmployees(filters) {
    const db = (0, database_1.getDb)();
    const conditions = [];
    const values = [];
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
        .prepare(`SELECT t.*, e.name as employee_name, e.telegram_username as employee_username, e.whatsapp_number as employee_whatsapp
       FROM tasks t
       LEFT JOIN employees e ON t.assigned_to = e.id
       ${where}
       ORDER BY t.status, t.due_date ASC, t.created_at ASC`)
        .all(...values);
}
function getPendingTasksForEmployee(employeeId) {
    const db = (0, database_1.getDb)();
    return db
        .prepare(`SELECT t.*, e.name as employee_name, e.telegram_username as employee_username, e.whatsapp_number as employee_whatsapp
       FROM tasks t
       LEFT JOIN employees e ON t.assigned_to = e.id
       WHERE t.assigned_to = ? AND t.status IN ('pending','in_progress','overdue')
       ORDER BY t.status = 'overdue' DESC, t.due_date ASC`)
        .all(employeeId);
}
function completeTask(taskId, note) {
    const db = (0, database_1.getDb)();
    db.prepare(`UPDATE tasks SET status = 'completed', completed_at = datetime('now') WHERE id = ?`).run(taskId);
    addTaskUpdate(taskId, 'completed', note ?? 'Task marked complete');
    return getTaskById(taskId);
}
function markTaskOverdue(taskId) {
    const db = (0, database_1.getDb)();
    db.prepare(`UPDATE tasks SET status = 'overdue' WHERE id = ? AND status IN ('pending','in_progress')`).run(taskId);
    addTaskUpdate(taskId, 'updated', 'Marked overdue by system');
}
function updateOverdueTasks() {
    const db = (0, database_1.getDb)();
    const now = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const result = db
        .prepare(`UPDATE tasks SET status = 'overdue'
       WHERE status IN ('pending','in_progress')
       AND due_date IS NOT NULL
       AND due_date < ?`)
        .run(now);
    return result.changes;
}
function incrementReminderCount(taskId) {
    const db = (0, database_1.getDb)();
    db.prepare('UPDATE tasks SET reminder_count = reminder_count + 1 WHERE id = ?').run(taskId);
    addTaskUpdate(taskId, 'reminded');
}
function addTaskUpdate(taskId, type, note) {
    const db = (0, database_1.getDb)();
    db.prepare('INSERT INTO task_updates (task_id, update_type, note) VALUES (?, ?, ?)').run(taskId, type, note ?? null);
}
function getTaskUpdates(taskId) {
    const db = (0, database_1.getDb)();
    return db
        .prepare('SELECT * FROM task_updates WHERE task_id = ? ORDER BY created_at ASC')
        .all(taskId);
}
function findTasksByKeywords(keywords, employeeId) {
    const db = (0, database_1.getDb)();
    const term = `%${keywords}%`;
    if (employeeId !== undefined) {
        return db
            .prepare(`SELECT * FROM tasks WHERE assigned_to = ? AND (lower(title) LIKE lower(?) OR lower(description) LIKE lower(?))
         AND status != 'completed' ORDER BY created_at DESC`)
            .all(employeeId, term, term);
    }
    return db
        .prepare(`SELECT * FROM tasks WHERE (lower(title) LIKE lower(?) OR lower(description) LIKE lower(?))
       AND status != 'completed' ORDER BY created_at DESC`)
        .all(term, term);
}
function getTaskStats() {
    const db = (0, database_1.getDb)();
    const rows = db
        .prepare('SELECT status, COUNT(*) as count FROM tasks GROUP BY status')
        .all();
    const stats = { total: 0, completed: 0, pending: 0, overdue: 0, in_progress: 0, completion_rate: 0 };
    for (const row of rows) {
        stats.total += row.count;
        if (row.status === 'completed')
            stats.completed = row.count;
        else if (row.status === 'pending')
            stats.pending = row.count;
        else if (row.status === 'overdue')
            stats.overdue = row.count;
        else if (row.status === 'in_progress')
            stats.in_progress = row.count;
    }
    stats.completion_rate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
    return stats;
}
//# sourceMappingURL=task.js.map