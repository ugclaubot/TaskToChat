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
export declare function createTask(params: {
    title: string;
    description?: string;
    assignedTo?: number;
    assignedBy: string;
    groupChatId?: string;
    groupChatName?: string;
    priority?: TaskPriority;
    dueDate?: string;
}): Task;
export declare function getTaskById(id: number): Task | null;
export declare function getTasksByEmployee(employeeId: number, status?: TaskStatus): Task[];
export declare function getAllTasksWithEmployees(filters?: {
    status?: TaskStatus;
    employeeId?: number;
    fromDate?: string;
    toDate?: string;
}): TaskWithEmployee[];
export declare function getPendingTasksForEmployee(employeeId: number): TaskWithEmployee[];
export declare function completeTask(taskId: number, note?: string): Task | null;
export declare function markTaskOverdue(taskId: number): void;
export declare function updateOverdueTasks(): number;
export declare function incrementReminderCount(taskId: number): void;
export declare function addTaskUpdate(taskId: number, type: UpdateType, note?: string): void;
export declare function getTaskUpdates(taskId: number): TaskUpdate[];
export declare function findTasksByKeywords(keywords: string, employeeId?: number): Task[];
export declare function getTaskStats(): {
    total: number;
    completed: number;
    pending: number;
    overdue: number;
    in_progress: number;
    completion_rate: number;
};
//# sourceMappingURL=task.d.ts.map