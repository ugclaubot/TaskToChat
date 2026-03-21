"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = getDb;
exports.initDb = initDb;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const config_1 = require("./config");
let db;
function getDb() {
    if (!db) {
        throw new Error('Database not initialized. Call initDb() first.');
    }
    return db;
}
function initDb() {
    const dbDir = path_1.default.dirname(config_1.config.db.path);
    if (!fs_1.default.existsSync(dbDir)) {
        fs_1.default.mkdirSync(dbDir, { recursive: true });
    }
    db = new better_sqlite3_1.default(config_1.config.db.path);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    console.log(`[DB] Initialized at ${config_1.config.db.path}`);
    return db;
}
function runMigrations(db) {
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
    }
    catch (_) {
        // Column already exists, ignore
    }
    db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
    CREATE INDEX IF NOT EXISTS idx_task_updates_task_id ON task_updates(task_id);
  `);
    console.log('[DB] Migrations complete');
}
//# sourceMappingURL=database.js.map