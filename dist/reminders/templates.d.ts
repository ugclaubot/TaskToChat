import { TaskWithEmployee } from '../models/task';
export declare function morningEmployeeMessage(employeeName: string, tasks: TaskWithEmployee[]): string;
export declare function eveningEmployeeMessage(employeeName: string, tasks: TaskWithEmployee[]): string;
export declare function managerMorningSummary(managerName: string, tasksByEmployee: Record<string, {
    employee: string;
    tasks: TaskWithEmployee[];
}>): string;
//# sourceMappingURL=templates.d.ts.map