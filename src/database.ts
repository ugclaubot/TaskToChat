import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from './config';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export function initDb(): Database.Database {
  const dbDir = path.dirname(config.db.path);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(config.db.path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);
  console.log(`[DB] Initialized at ${config.db.path}`);
  return db;
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      telegram_username TEXT UNIQUE,
      telegram_user_id TEXT UNIQUE,
      whatsapp_number TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      assigned_to INTEGER REFERENCES employees(id),
      assigned_by TEXT NOT NULL,
      group_chat_id TEXT,
      group_chat_name TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed','overdue')),
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('high','medium','low')),
      due_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      reminder_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS task_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      update_type TEXT NOT NULL CHECK(update_type IN ('created','reminded','completed','reopened','updated')),
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Add telegram_user_id column if missing (migration)
    -- SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we use a safe approach
  `);

  // Safe migration: add telegram_user_id if it doesn't exist
  try {
    db.exec(`ALTER TABLE employees ADD COLUMN telegram_user_id TEXT UNIQUE`);
  } catch (_) {
    // Column already exists, ignore
  }

  // Admins table
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_user_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      added_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS routines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      assigned_to INTEGER REFERENCES employees(id),
      assigned_by TEXT NOT NULL,
      group_chat_id TEXT,
      group_chat_name TEXT,
      recurrence_type TEXT NOT NULL CHECK(recurrence_type IN ('daily','weekly','monthly','quarterly','yearly')),
      recurrence_day INTEGER,
      recurrence_month INTEGER,
      anchor_date TEXT,
      next_due TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','stopped')),
      last_completed TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
    CREATE INDEX IF NOT EXISTS idx_task_updates_task_id ON task_updates(task_id);
    
    CREATE INDEX IF NOT EXISTS idx_routines_assigned_to ON routines(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_routines_status ON routines(status);
    CREATE INDEX IF NOT EXISTS idx_routines_next_due ON routines(next_due);
    CREATE INDEX IF NOT EXISTS idx_routines_group_chat_id ON routines(group_chat_id);
  `);

  console.log('[DB] Migrations complete');
}
