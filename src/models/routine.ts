import { getDb } from '../database';

export type RoutineRecurrence = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type RoutineStatus = 'active' | 'paused' | 'stopped';

export interface Routine {
  id: number;
  title: string;
  assigned_to: number | null;
  assigned_by: string;
  group_chat_id: string | null;
  group_chat_name: string | null;
  recurrence_type: RoutineRecurrence;
  recurrence_day: number | null; // 0-6 for weekly, 1-31 for monthly/quarterly, 1-31 for yearly
  recurrence_month: number | null; // 1-12 for yearly
  anchor_date: string | null; // original anchor date for reference
  next_due: string; // ISO date YYYY-MM-DD
  status: RoutineStatus;
  last_completed: string | null;
  created_at: string;
}

export interface RoutineWithEmployee extends Routine {
  employee_name: string | null;
  employee_username: string | null;
}

/**
 * Calculate the next due date for a routine based on its recurrence type.
 * @param recurrenceType daily/weekly/monthly/quarterly/yearly
 * @param recurrenceDay day of week (0-6) or day of month (1-31)
 * @param recurrenceMonth month (1-12) for yearly
 * @param fromDate base date to calculate from (defaults to today)
 */
export function calculateNextDue(
  recurrenceType: RoutineRecurrence,
  recurrenceDay: number | null,
  recurrenceMonth: number | null,
  fromDate: Date = new Date()
): string {
  const next = new Date(fromDate);
  next.setHours(0, 0, 0, 0);

  if (recurrenceType === 'daily') {
    next.setDate(next.getDate() + 1);
  } else if (recurrenceType === 'weekly' && recurrenceDay !== null) {
    // recurrenceDay is 0-6 (Sunday-Saturday)
    const targetDay = recurrenceDay;
    let daysAhead = targetDay - next.getDay();
    if (daysAhead <= 0) {
      daysAhead += 7;
    }
    next.setDate(next.getDate() + daysAhead);
  } else if (recurrenceType === 'monthly' && recurrenceDay !== null) {
    // Same day next month, handle month-end edge cases
    const targetDay = recurrenceDay;
    next.setMonth(next.getMonth() + 1);
    next.setDate(1);
    next.setDate(Math.min(targetDay, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
  } else if (recurrenceType === 'quarterly' && recurrenceDay !== null) {
    // Same day, 3 months later
    const targetDay = recurrenceDay;
    next.setMonth(next.getMonth() + 3);
    next.setDate(1);
    next.setDate(Math.min(targetDay, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
  } else if (recurrenceType === 'yearly' && recurrenceDay !== null && recurrenceMonth !== null) {
    // Same day+month next year
    next.setFullYear(next.getFullYear() + 1);
    next.setMonth(recurrenceMonth - 1);
    next.setDate(recurrenceDay);
  }

  return next.toISOString().split('T')[0];
}

export function createRoutine(params: {
  title: string;
  assignedTo?: number;
  assignedBy: string;
  groupChatId?: string;
  groupChatName?: string;
  recurrenceType: RoutineRecurrence;
  recurrenceDay?: number;
  recurrenceMonth?: number;
  anchorDate?: string;
  nextDue?: string;
}): Routine {
  const db = getDb();
  const nextDue =
    params.nextDue ||
    calculateNextDue(params.recurrenceType, params.recurrenceDay ?? null, params.recurrenceMonth ?? null);

  const result = db
    .prepare(
      `INSERT INTO routines (
        title, assigned_to, assigned_by, group_chat_id, group_chat_name,
        recurrence_type, recurrence_day, recurrence_month, anchor_date,
        next_due, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      params.title,
      params.assignedTo ?? null,
      params.assignedBy,
      params.groupChatId ?? null,
      params.groupChatName ?? null,
      params.recurrenceType,
      params.recurrenceDay ?? null,
      params.recurrenceMonth ?? null,
      params.anchorDate ?? null,
      nextDue,
      'active'
    );

  return getRoutineById(result.lastInsertRowid as number)!;
}

export function getRoutineById(id: number): Routine | null {
  const db = getDb();
  return db.prepare('SELECT * FROM routines WHERE id = ?').get(id) as Routine | null;
}

export function getActiveRoutines(): RoutineWithEmployee[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT r.*, e.name as employee_name, e.telegram_username as employee_username
       FROM routines r
       LEFT JOIN employees e ON r.assigned_to = e.id
       WHERE r.status = 'active'
       ORDER BY r.next_due ASC`
    )
    .all() as RoutineWithEmployee[];
}

export function getDueRoutines(date: string = new Date().toISOString().split('T')[0]): RoutineWithEmployee[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT r.*, e.name as employee_name, e.telegram_username as employee_username
       FROM routines r
       LEFT JOIN employees e ON r.assigned_to = e.id
       WHERE r.status = 'active' AND r.next_due <= ?
       ORDER BY r.assigned_to, r.next_due ASC`
    )
    .all(date) as RoutineWithEmployee[];
}

export function getDueRoutinesForEmployee(employeeId: number, date: string = new Date().toISOString().split('T')[0]): RoutineWithEmployee[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT r.*, e.name as employee_name, e.telegram_username as employee_username
       FROM routines r
       LEFT JOIN employees e ON r.assigned_to = e.id
       WHERE r.assigned_to = ? AND r.status = 'active' AND r.next_due <= ?
       ORDER BY r.next_due ASC`
    )
    .all(employeeId, date) as RoutineWithEmployee[];
}

export function getDueUnassignedRoutinesByGroup(date: string = new Date().toISOString().split('T')[0]): Record<string, { groupChatId: string; groupChatName: string; routines: RoutineWithEmployee[] }> {
  const db = getDb();
  const routines = db
    .prepare(
      `SELECT r.*, NULL as employee_name, NULL as employee_username
       FROM routines r
       WHERE r.assigned_to IS NULL AND r.status = 'active' AND r.next_due <= ?
       AND r.group_chat_id IS NOT NULL
       ORDER BY r.group_chat_id, r.next_due ASC`
    )
    .all(date) as RoutineWithEmployee[];

  const grouped: Record<string, { groupChatId: string; groupChatName: string; routines: RoutineWithEmployee[] }> = {};
  for (const routine of routines) {
    const gid = routine.group_chat_id!;
    if (!grouped[gid]) {
      grouped[gid] = { groupChatId: gid, groupChatName: routine.group_chat_name || 'Unknown Group', routines: [] };
    }
    grouped[gid].routines.push(routine);
  }
  return grouped;
}

export function getRoutinesForEmployee(employeeId: number): RoutineWithEmployee[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT r.*, e.name as employee_name, e.telegram_username as employee_username
       FROM routines r
       LEFT JOIN employees e ON r.assigned_to = e.id
       WHERE r.assigned_to = ? AND r.status IN ('active', 'paused')
       ORDER BY r.next_due ASC`
    )
    .all(employeeId) as RoutineWithEmployee[];
}

export function getRoutinesByGroupChat(groupChatId: string): RoutineWithEmployee[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT r.*, e.name as employee_name, e.telegram_username as employee_username
       FROM routines r
       LEFT JOIN employees e ON r.assigned_to = e.id
       WHERE r.group_chat_id = ? AND r.status IN ('active', 'paused')
       ORDER BY r.next_due ASC`
    )
    .all(groupChatId) as RoutineWithEmployee[];
}

export function getAllRoutines(): RoutineWithEmployee[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT r.*, e.name as employee_name, e.telegram_username as employee_username
       FROM routines r
       LEFT JOIN employees e ON r.assigned_to = e.id
       ORDER BY r.status, r.next_due ASC`
    )
    .all() as RoutineWithEmployee[];
}

/**
 * Complete a routine occurrence and calculate the next due date.
 */
export function completeRoutineOccurrence(routineId: number, note?: string): Routine | null {
  const db = getDb();
  const routine = getRoutineById(routineId);
  if (!routine) return null;

  const nextDue = calculateNextDue(
    routine.recurrence_type,
    routine.recurrence_day,
    routine.recurrence_month,
    new Date()
  );

  db.prepare(
    `UPDATE routines SET next_due = ?, last_completed = datetime('now') WHERE id = ?`
  ).run(nextDue, routineId);

  return getRoutineById(routineId);
}

export function pauseRoutine(routineId: number): Routine | null {
  const db = getDb();
  db.prepare(`UPDATE routines SET status = 'paused' WHERE id = ?`).run(routineId);
  return getRoutineById(routineId);
}

export function resumeRoutine(routineId: number): Routine | null {
  const db = getDb();
  db.prepare(`UPDATE routines SET status = 'active' WHERE id = ?`).run(routineId);
  return getRoutineById(routineId);
}

export function stopRoutine(routineId: number): Routine | null {
  const db = getDb();
  db.prepare(`UPDATE routines SET status = 'stopped' WHERE id = ?`).run(routineId);
  return getRoutineById(routineId);
}

/**
 * Format a human-readable recurrence label for display.
 */
export function formatRecurrenceLabel(
  recurrenceType: RoutineRecurrence,
  recurrenceDay: number | null,
  recurrenceMonth: number | null,
  anchorDate: string | null
): string {
  if (recurrenceType === 'daily') {
    return 'every day';
  } else if (recurrenceType === 'weekly' && recurrenceDay !== null) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return `every ${days[recurrenceDay]}`;
  } else if (recurrenceType === 'monthly' && recurrenceDay !== null) {
    const suf = ['', 'st', 'nd', 'rd', 'th'];
    const suffix = recurrenceDay <= 3 && recurrenceDay >= 1 ? suf[recurrenceDay] : 'th';
    return `monthly on ${recurrenceDay}${suffix}`;
  } else if (recurrenceType === 'quarterly' && recurrenceDay !== null) {
    const suf = ['', 'st', 'nd', 'rd', 'th'];
    const suffix = recurrenceDay <= 3 && recurrenceDay >= 1 ? suf[recurrenceDay] : 'th';
    return `quarterly on ${recurrenceDay}${suffix}`;
  } else if (recurrenceType === 'yearly' && recurrenceDay !== null && recurrenceMonth !== null) {
    const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `yearly on ${recurrenceDay} ${months[recurrenceMonth]}`;
  }
  return recurrenceType;
}

/**
 * Calculate the FIRST due date when creating a new routine.
 * May return today if today matches the recurrence pattern.
 */
export function calculateFirstDue(
  recurrenceType: RoutineRecurrence,
  recurrenceDay: number | null,
  recurrenceMonth: number | null,
  fromDate: Date = new Date()
): string {
  const base = new Date(fromDate);
  base.setHours(0, 0, 0, 0);

  if (recurrenceType === 'daily') {
    return base.toISOString().split('T')[0];
  }

  if (recurrenceType === 'weekly' && recurrenceDay !== null) {
    const daysUntil = (recurrenceDay - base.getDay() + 7) % 7; // 0 = today matches
    base.setDate(base.getDate() + daysUntil);
    return base.toISOString().split('T')[0];
  }

  if ((recurrenceType === 'monthly' || recurrenceType === 'quarterly') && recurrenceDay !== null) {
    if (base.getDate() > recurrenceDay) {
      base.setMonth(base.getMonth() + 1);
    }
    base.setDate(1);
    base.setDate(Math.min(recurrenceDay, new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()));
    return base.toISOString().split('T')[0];
  }

  if (recurrenceType === 'yearly' && recurrenceDay !== null && recurrenceMonth !== null) {
    const targetMonth = recurrenceMonth - 1;
    const candidate = new Date(base.getFullYear(), targetMonth, 1);
    candidate.setDate(Math.min(recurrenceDay, new Date(base.getFullYear(), targetMonth + 1, 0).getDate()));
    if (candidate < base) {
      candidate.setFullYear(candidate.getFullYear() + 1);
      candidate.setMonth(targetMonth);
      candidate.setDate(1);
      candidate.setDate(Math.min(recurrenceDay, new Date(candidate.getFullYear(), targetMonth + 1, 0).getDate()));
    }
    return candidate.toISOString().split('T')[0];
  }

  return calculateNextDue(recurrenceType, recurrenceDay, recurrenceMonth, fromDate);
}
