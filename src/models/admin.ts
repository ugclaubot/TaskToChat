import { getDb } from '../database';
import { config } from '../config';

export interface Admin {
  id: number;
  telegram_user_id: string;
  name: string;
  added_by: string | null;
  created_at: string;
}

/**
 * Check if a user is an admin (either the original manager or added via /addadmin).
 */
export function isAdmin(telegramUserId: string): boolean {
  // Original manager is always admin
  if (telegramUserId === config.manager.telegramId) return true;

  const db = getDb();
  const row = db.prepare('SELECT 1 FROM admins WHERE telegram_user_id = ?').get(telegramUserId);
  return !!row;
}

export function addAdmin(telegramUserId: string, name: string, addedBy: string): Admin {
  const db = getDb();
  db.prepare('INSERT OR IGNORE INTO admins (telegram_user_id, name, added_by) VALUES (?, ?, ?)')
    .run(telegramUserId, name, addedBy);
  return db.prepare('SELECT * FROM admins WHERE telegram_user_id = ?').get(telegramUserId) as Admin;
}

export function removeAdmin(telegramUserId: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM admins WHERE telegram_user_id = ?').run(telegramUserId);
  return result.changes > 0;
}

export function getAllAdmins(): Admin[] {
  const db = getDb();
  return db.prepare('SELECT * FROM admins ORDER BY name').all() as Admin[];
}
