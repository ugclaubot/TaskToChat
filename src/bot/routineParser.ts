import * as chrono from 'chrono-node';
import { RoutineRecurrence } from '../models/routine';

export interface ParsedRoutine {
  assigneeName: string;
  title: string;
  recurrenceType: RoutineRecurrence;
  recurrenceDay: number | null;
  recurrenceMonth: number | null;
  anchorDate: string | null;
  rawText: string;
}

/**
 * Check if text looks like a routine message.
 */
export function isRoutineMessage(text: string): boolean {
  return /^(#routine)\s+/i.test(text.trim());
}

/**
 * Parse routine messages in multiple formats:
 *  - #routine @PersonName description every Monday
 *  - #routine @PersonName description daily
 *  - #routine @PersonName description monthly on 20th
 *  - #routine @PersonName description quarterly on 1st
 *  - #routine @PersonName description yearly on 15 March
 *  - #routine description daily (for group routines)
 */
export function parseRoutineMessage(text: string): ParsedRoutine | null {
  const cleaned = text.replace(/^#routine\s+/i, '').trim();

  if (!cleaned) return null;

  // Try to extract assignee (name or @username)
  const firstToken = cleaned.split(/\s+/)[0];
  const hasAssignee = firstToken.startsWith('@') || /^[A-Z][a-z]+$/.test(firstToken);

  let assigneeName = '';
  let remainder = cleaned;

  if (hasAssignee) {
    assigneeName = firstToken.replace('@', '').trim();
    remainder = cleaned.slice(firstToken.length).trim();
  }

  if (!remainder) return null;

  // Parse recurrence info
  let recurrenceType: RoutineRecurrence = 'daily';
  let recurrenceDay: number | null = null;
  let recurrenceMonth: number | null = null;
  let title = remainder;

  // Match: "... daily"
  const dailyMatch = remainder.match(/^(.+?)\s+daily\s*$/i);
  if (dailyMatch) {
    title = dailyMatch[1].trim();
    recurrenceType = 'daily';
    return { assigneeName, title, recurrenceType, recurrenceDay, recurrenceMonth, anchorDate: null, rawText: text };
  }

  // Match: "... every Monday/Tuesday/.../Sunday"
  const weeklyMatch = remainder.match(/^(.+?)\s+every\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*$/i);
  if (weeklyMatch) {
    title = weeklyMatch[1].trim();
    const dayName = weeklyMatch[2].toLowerCase();
    const dayMap: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };
    recurrenceType = 'weekly';
    recurrenceDay = dayMap[dayName] ?? 0;
    return { assigneeName, title, recurrenceType, recurrenceDay, recurrenceMonth, anchorDate: null, rawText: text };
  }

  // Match: "... weekly"
  const weeklySimpleMatch = remainder.match(/^(.+?)\s+weekly\s*$/i);
  if (weeklySimpleMatch) {
    title = weeklySimpleMatch[1].trim();
    recurrenceType = 'weekly';
    // Default to current day of week
    recurrenceDay = new Date().getDay();
    return { assigneeName, title, recurrenceType, recurrenceDay, recurrenceMonth, anchorDate: null, rawText: text };
  }

  // Match: "... monthly on 1st/20th/15th"
  const monthlyMatch = remainder.match(/^(.+?)\s+monthly\s+on\s+(\d{1,2})(?:st|nd|rd|th)?\s*$/i);
  if (monthlyMatch) {
    title = monthlyMatch[1].trim();
    recurrenceType = 'monthly';
    recurrenceDay = parseInt(monthlyMatch[2], 10);
    if (recurrenceDay < 1 || recurrenceDay > 31) {
      return null;
    }
    return { assigneeName, title, recurrenceType, recurrenceDay, recurrenceMonth, anchorDate: null, rawText: text };
  }

  // Match: "... quarterly on 1st/15th"
  const quarterlyMatch = remainder.match(/^(.+?)\s+quarterly\s+on\s+(\d{1,2})(?:st|nd|rd|th)?\s*$/i);
  if (quarterlyMatch) {
    title = quarterlyMatch[1].trim();
    recurrenceType = 'quarterly';
    recurrenceDay = parseInt(quarterlyMatch[2], 10);
    if (recurrenceDay < 1 || recurrenceDay > 31) {
      return null;
    }
    return { assigneeName, title, recurrenceType, recurrenceDay, recurrenceMonth, anchorDate: null, rawText: text };
  }

  // Match: "... yearly on 15 March" or "... yearly on March 15"
  const yearlyMatch = remainder.match(/^(.+?)\s+yearly\s+on\s+(.+?)\s*$/i);
  if (yearlyMatch) {
    title = yearlyMatch[1].trim();
    const dateStr = yearlyMatch[2].trim();

    // Try to parse with chrono
    const parsed = chrono.parseDate(dateStr, new Date());
    if (parsed) {
      recurrenceType = 'yearly';
      recurrenceDay = parsed.getDate();
      recurrenceMonth = parsed.getMonth() + 1; // 1-12
      return { assigneeName, title, recurrenceType, recurrenceDay, recurrenceMonth, anchorDate: dateStr, rawText: text };
    }

    // Fallback: try simple patterns like "15 March", "March 15"
    const simpleYearlyMatch = dateStr.match(/^(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)$/i) ||
                               dateStr.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})$/i);
    
    if (simpleYearlyMatch) {
      const monthMap: Record<string, number> = {
        january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
        july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
      };

      let day: number;
      let month: number;

      if (/^\d/.test(simpleYearlyMatch[1])) {
        // Format: "15 March"
        day = parseInt(simpleYearlyMatch[1], 10);
        month = monthMap[simpleYearlyMatch[2].toLowerCase()] ?? 1;
      } else {
        // Format: "March 15"
        month = monthMap[simpleYearlyMatch[1].toLowerCase()] ?? 1;
        day = parseInt(simpleYearlyMatch[2], 10);
      }

      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        recurrenceType = 'yearly';
        recurrenceDay = day;
        recurrenceMonth = month;
        return { assigneeName, title, recurrenceType, recurrenceDay, recurrenceMonth, anchorDate: dateStr, rawText: text };
      }
    }
  }

  return null;
}
