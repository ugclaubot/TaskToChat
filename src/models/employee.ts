import { getDb } from '../database';

export interface Employee {
  id: number;
  name: string;
  telegram_username: string | null;
  telegram_user_id: string | null;
  whatsapp_number: string | null;
  created_at: string;
}

export function createEmployee(
  name: string,
  telegramUsername: string | null,
  whatsappNumber: string | null,
  telegramUserId: string | null = null
): Employee {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO employees (name, telegram_username, telegram_user_id, whatsapp_number)
    VALUES (?, ?, ?, ?)
  `);

  const result = stmt.run(
    name,
    telegramUsername ? telegramUsername.replace('@', '').toLowerCase() : null,
    telegramUserId || null,
    whatsappNumber || null
  );

  return getEmployeeById(result.lastInsertRowid as number)!;
}

/**
 * Auto-register or update a user from Telegram message context.
 * Silently captures anyone who messages in a group.
 */
export function autoRegisterFromTelegram(
  telegramUserId: string,
  firstName: string,
  lastName: string | undefined,
  username: string | undefined
): Employee {
  const db = getDb();

  // Check if already exists by telegram_user_id
  const existing = db.prepare('SELECT * FROM employees WHERE telegram_user_id = ?').get(telegramUserId) as Employee | null;
  if (existing) {
    // Update name/username if changed
    const newName = lastName ? `${firstName} ${lastName}` : firstName;
    const newUsername = username?.toLowerCase() || null;
    if (existing.name !== newName || existing.telegram_username !== newUsername) {
      db.prepare('UPDATE employees SET name = ?, telegram_username = ? WHERE id = ?')
        .run(newName, newUsername, existing.id);
    }
    return getEmployeeById(existing.id)!;
  }

  // Check if exists by username (may have been auto-created from task assignment)
  if (username) {
    const byUsername = getEmployeeByUsername(username);
    if (byUsername) {
      // Link telegram_user_id to existing record
      db.prepare('UPDATE employees SET telegram_user_id = ? WHERE id = ?')
        .run(telegramUserId, byUsername.id);
      return getEmployeeById(byUsername.id)!;
    }
  }

  // Create new
  const fullName = lastName ? `${firstName} ${lastName}` : firstName;
  return createEmployee(fullName, username || null, null, telegramUserId);
}

export function getEmployeeByTelegramId(telegramUserId: string): Employee | null {
  const db = getDb();
  return db.prepare('SELECT * FROM employees WHERE telegram_user_id = ?').get(telegramUserId) as Employee | null;
}

export function getAllEmployeesWithTelegramId(): Employee[] {
  const db = getDb();
  return db.prepare('SELECT * FROM employees WHERE telegram_user_id IS NOT NULL ORDER BY name').all() as Employee[];
}

export function getEmployeeById(id: number): Employee | null {
  const db = getDb();
  return db.prepare('SELECT * FROM employees WHERE id = ?').get(id) as Employee | null;
}

export function getEmployeeByUsername(username: string): Employee | null {
  const db = getDb();
  const clean = username.replace('@', '').toLowerCase();
  return db
    .prepare('SELECT * FROM employees WHERE lower(telegram_username) = ?')
    .get(clean) as Employee | null;
}

export function getEmployeeByName(name: string): Employee | null {
  const db = getDb();
  return db
    .prepare("SELECT * FROM employees WHERE lower(name) = lower(?)")
    .get(name) as Employee | null;
}

export function getAllEmployees(): Employee[] {
  const db = getDb();
  return db.prepare('SELECT * FROM employees ORDER BY name').all() as Employee[];
}

export function findEmployee(nameOrUsername: string): Employee | null {
  // Try username first (with or without @)
  const byUsername = getEmployeeByUsername(nameOrUsername);
  if (byUsername) return byUsername;

  // Try exact name match
  const byName = getEmployeeByName(nameOrUsername);
  if (byName) return byName;

  // Try partial name match
  const db = getDb();
  const partial = db
    .prepare("SELECT * FROM employees WHERE lower(name) LIKE lower(?) LIMIT 1")
    .get(`%${nameOrUsername}%`) as Employee | null;
  return partial;
}

/**
 * Find an employee or auto-create one if not found.
 */
export function findOrCreateEmployee(nameOrUsername: string): Employee {
  const existing = findEmployee(nameOrUsername);
  if (existing) return existing;

  // Auto-create with just the name
  const cleanName = nameOrUsername.replace('@', '').trim();
  // If it looks like a username (no spaces), try to use it as both name and username
  const isUsername = !cleanName.includes(' ') && /^[a-zA-Z0-9_]+$/.test(cleanName);
  return createEmployee(
    cleanName,
    isUsername ? cleanName.toLowerCase() : null,
    null
  );
}

export function updateEmployee(
  id: number,
  updates: Partial<Pick<Employee, 'name' | 'telegram_username' | 'whatsapp_number'>>
): Employee | null {
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.telegram_username !== undefined) {
    fields.push('telegram_username = ?');
    values.push(updates.telegram_username?.replace('@', '').toLowerCase() ?? null);
  }
  if (updates.whatsapp_number !== undefined) {
    fields.push('whatsapp_number = ?');
    values.push(updates.whatsapp_number);
  }

  if (fields.length === 0) return getEmployeeById(id);

  values.push(id);
  db.prepare(`UPDATE employees SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getEmployeeById(id);
}
