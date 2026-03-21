import * as chrono from 'chrono-node';
import { TaskPriority } from '../models/task';

export interface ParsedTask {
  assigneeName: string;
  title: string;
  dueDate: Date | null;
  priority: TaskPriority;
  rawText: string;
}

/**
 * Check if the first token looks like a person name/username vs a task description word.
 * Names start with @ or are capitalized single words.
 */
function looksLikeName(token: string): boolean {
  if (token.startsWith('@')) return true;
  // Capitalized single word (like "Rahul", "John")
  if (/^[A-Z][a-z]+$/.test(token)) return true;
  return false;
}

/**
 * Parses task messages in multiple formats:
 *  - task: @PersonName description of task by DueDate !high
 *  - task: PersonName - description - due Friday
 *  - #task @PersonName description by March 25
 */
export function parseTaskMessage(text: string): ParsedTask | null {
  // Strip the task: or #task prefix
  const cleaned = text
    .replace(/^(task:|#task)\s*/i, '')
    .trim();

  if (!cleaned) return null;

  // Extract priority flag
  const priorityMatch = cleaned.match(/\s*!(high|medium|low)\s*/i);
  const priority: TaskPriority = priorityMatch
    ? (priorityMatch[1].toLowerCase() as TaskPriority)
    : 'medium';
  let withoutPriority = cleaned.replace(/\s*!(high|medium|low)\s*/gi, ' ').trim();

  // Try format: @PersonName or PersonName - description - due DATE
  // Format 1: "Name - description - due DATE"
  const dashFormat = withoutPriority.match(/^(@?\S+)\s*-\s*(.+?)(?:\s*-\s*due\s+(.+))?$/i);
  if (dashFormat) {
    const assigneeName = dashFormat[1].replace('@', '').trim();
    const title = dashFormat[2].trim();
    const duePart = dashFormat[3]?.trim();
    const dueDate = duePart ? chrono.parseDate(duePart, new Date(), { forwardDate: true }) : null;
    return { assigneeName, title, dueDate, priority, rawText: text };
  }

  // Format 2: "@Person description by/on/due DATE"
  // First word/token is the name — but only if it looks like a name
  const firstToken = withoutPriority.split(/\s+/)[0];
  const hasName = looksLikeName(firstToken);

  if (hasName) {
    const byDateMatch = withoutPriority.match(
      /^(@?\S+)\s+(.+?)(?:\s+(?:by|on|due|before)\s+(.+))?$/i
    );
    if (byDateMatch) {
      const assigneeName = byDateMatch[1].replace('@', '').trim();
      let descPart = byDateMatch[2].trim();
      let dueDateStr = byDateMatch[3]?.trim();

      // If no explicit "by" keyword, try to parse a date from the end of the description
      if (!dueDateStr) {
        const parsed = chrono.parse(descPart, new Date(), { forwardDate: true });
        if (parsed.length > 0) {
          const lastParsed = parsed[parsed.length - 1];
          dueDateStr = lastParsed.text;
          descPart = (
            descPart.slice(0, lastParsed.index) + descPart.slice(lastParsed.index + lastParsed.text.length)
          ).trim();
        }
      }

      const dueDate = dueDateStr
        ? chrono.parseDate(dueDateStr, new Date(), { forwardDate: true })
        : null;

      if (!assigneeName || !descPart) return null;

      return {
        assigneeName,
        title: descPart,
        dueDate,
        priority,
        rawText: text,
      };
    }
  }

  // Format 3: No assignee — just a task description (group task)
  // "#task finish the report by Friday"
  let descPart = withoutPriority;
  let dueDateStr: string | undefined;
  const byMatch = withoutPriority.match(/^(.+?)(?:\s+(?:by|on|due|before)\s+(.+))$/i);
  if (byMatch) {
    descPart = byMatch[1].trim();
    dueDateStr = byMatch[2].trim();
  } else {
    const parsed = chrono.parse(descPart, new Date(), { forwardDate: true });
    if (parsed.length > 0) {
      const lastParsed = parsed[parsed.length - 1];
      dueDateStr = lastParsed.text;
      descPart = (
        descPart.slice(0, lastParsed.index) + descPart.slice(lastParsed.index + lastParsed.text.length)
      ).trim();
    }
  }

  const dueDate = dueDateStr
    ? chrono.parseDate(dueDateStr, new Date(), { forwardDate: true })
    : null;

  if (!descPart) return null;

  return {
    assigneeName: '',
    title: descPart,
    dueDate,
    priority,
    rawText: text,
  };
}

export function isTaskMessage(text: string): boolean {
  return /^(task:|#task)\s*/i.test(text.trim());
}

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
export function parseMultiTaskMessage(text: string): ParsedTask[] | null {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  // Check if any line after the first is a bullet point
  const bulletLines = lines.slice(1).filter(l => /^[-•*]\s+/.test(l));
  if (bulletLines.length === 0) return null;

  // First line: #task or #task PersonName
  const firstLine = lines[0].replace(/^(task:|#task)\s*/i, '').trim();

  // Check if first line has an assignee name
  let assigneeName = '';
  if (firstLine && looksLikeName(firstLine.split(/\s+/)[0])) {
    assigneeName = firstLine.replace('@', '').trim();
  }

  const tasks: ParsedTask[] = [];
  for (const bullet of bulletLines) {
    const itemText = bullet.replace(/^[-•*]\s+/, '').trim();
    if (!itemText) continue;

    // Extract priority
    const priorityMatch = itemText.match(/\s*!(high|medium|low)\s*/i);
    const priority: TaskPriority = priorityMatch
      ? (priorityMatch[1].toLowerCase() as TaskPriority)
      : 'medium';
    let cleaned = itemText.replace(/\s*!(high|medium|low)\s*/gi, ' ').trim();

    // Extract date
    let dueDate: Date | null = null;
    const byMatch = cleaned.match(/^(.+?)(?:\s+(?:by|on|due|before)\s+(.+))$/i);
    if (byMatch) {
      cleaned = byMatch[1].trim();
      dueDate = chrono.parseDate(byMatch[2].trim(), new Date(), { forwardDate: true });
    } else {
      const parsed = chrono.parse(cleaned, new Date(), { forwardDate: true });
      if (parsed.length > 0) {
        const last = parsed[parsed.length - 1];
        dueDate = last.start.date();
        cleaned = (cleaned.slice(0, last.index) + cleaned.slice(last.index + last.text.length)).trim();
      }
    }

    tasks.push({
      assigneeName,
      title: cleaned,
      dueDate,
      priority,
      rawText: itemText,
    });
  }

  return tasks.length > 0 ? tasks : null;
}

export function formatDueDate(date: Date | null): string {
  if (!date) return 'No due date';
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year:
      date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    timeZone: 'Asia/Kolkata',
  });
}
