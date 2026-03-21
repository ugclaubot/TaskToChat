import { TaskPriority } from '../models/task';
export interface ParsedTask {
    assigneeName: string;
    title: string;
    dueDate: Date | null;
    priority: TaskPriority;
    rawText: string;
}
/**
 * Parses task messages in multiple formats:
 *  - task: @PersonName description of task by DueDate !high
 *  - task: PersonName - description - due Friday
 *  - #task @PersonName description by March 25
 */
export declare function parseTaskMessage(text: string): ParsedTask | null;
export declare function isTaskMessage(text: string): boolean;
/**
 * Parse a multi-line task message with bullet points.
 * Format:
 *   #task
 *   - task one by Friday
 *   - task two !high
 *
 *   #task Rahul
 *   - task one
 *   - task two by Monday
 */
export declare function parseMultiTaskMessage(text: string): ParsedTask[] | null;
export declare function formatDueDate(date: Date | null): string;
//# sourceMappingURL=taskParser.d.ts.map