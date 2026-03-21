"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEmployee = createEmployee;
exports.autoRegisterFromTelegram = autoRegisterFromTelegram;
exports.getEmployeeByTelegramId = getEmployeeByTelegramId;
exports.getAllEmployeesWithTelegramId = getAllEmployeesWithTelegramId;
exports.getEmployeeById = getEmployeeById;
exports.getEmployeeByUsername = getEmployeeByUsername;
exports.getEmployeeByName = getEmployeeByName;
exports.getAllEmployees = getAllEmployees;
exports.findEmployee = findEmployee;
exports.findOrCreateEmployee = findOrCreateEmployee;
exports.updateEmployee = updateEmployee;
const database_1 = require("../database");
function createEmployee(name, telegramUsername, whatsappNumber, telegramUserId = null) {
    const db = (0, database_1.getDb)();
    const stmt = db.prepare(`
    INSERT INTO employees (name, telegram_username, telegram_user_id, whatsapp_number)
    VALUES (?, ?, ?, ?)
  `);
    const result = stmt.run(name, telegramUsername ? telegramUsername.replace('@', '').toLowerCase() : null, telegramUserId || null, whatsappNumber || null);
    return getEmployeeById(result.lastInsertRowid);
}
/**
 * Auto-register or update a user from Telegram message context.
 * Silently captures anyone who messages in a group.
 */
function autoRegisterFromTelegram(telegramUserId, firstName, lastName, username) {
    const db = (0, database_1.getDb)();
    // Check if already exists by telegram_user_id
    const existing = db.prepare('SELECT * FROM employees WHERE telegram_user_id = ?').get(telegramUserId);
    if (existing) {
        // Update name/username if changed
        const newName = lastName ? `${firstName} ${lastName}` : firstName;
        const newUsername = username?.toLowerCase() || null;
        if (existing.name !== newName || existing.telegram_username !== newUsername) {
            db.prepare('UPDATE employees SET name = ?, telegram_username = ? WHERE id = ?')
                .run(newName, newUsername, existing.id);
        }
        return getEmployeeById(existing.id);
    }
    // Check if exists by username (may have been auto-created from task assignment)
    if (username) {
        const byUsername = getEmployeeByUsername(username);
        if (byUsername) {
            // Link telegram_user_id to existing record
            db.prepare('UPDATE employees SET telegram_user_id = ? WHERE id = ?')
                .run(telegramUserId, byUsername.id);
            return getEmployeeById(byUsername.id);
        }
    }
    // Create new
    const fullName = lastName ? `${firstName} ${lastName}` : firstName;
    return createEmployee(fullName, username || null, null, telegramUserId);
}
function getEmployeeByTelegramId(telegramUserId) {
    const db = (0, database_1.getDb)();
    return db.prepare('SELECT * FROM employees WHERE telegram_user_id = ?').get(telegramUserId);
}
function getAllEmployeesWithTelegramId() {
    const db = (0, database_1.getDb)();
    return db.prepare('SELECT * FROM employees WHERE telegram_user_id IS NOT NULL ORDER BY name').all();
}
function getEmployeeById(id) {
    const db = (0, database_1.getDb)();
    return db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
}
function getEmployeeByUsername(username) {
    const db = (0, database_1.getDb)();
    const clean = username.replace('@', '').toLowerCase();
    return db
        .prepare('SELECT * FROM employees WHERE lower(telegram_username) = ?')
        .get(clean);
}
function getEmployeeByName(name) {
    const db = (0, database_1.getDb)();
    return db
        .prepare("SELECT * FROM employees WHERE lower(name) = lower(?)")
        .get(name);
}
function getAllEmployees() {
    const db = (0, database_1.getDb)();
    return db.prepare('SELECT * FROM employees ORDER BY name').all();
}
function findEmployee(nameOrUsername) {
    // Try username first (with or without @)
    const byUsername = getEmployeeByUsername(nameOrUsername);
    if (byUsername)
        return byUsername;
    // Try exact name match
    const byName = getEmployeeByName(nameOrUsername);
    if (byName)
        return byName;
    // Try partial name match
    const db = (0, database_1.getDb)();
    const partial = db
        .prepare("SELECT * FROM employees WHERE lower(name) LIKE lower(?) LIMIT 1")
        .get(`%${nameOrUsername}%`);
    return partial;
}
/**
 * Find an employee or auto-create one if not found.
 */
function findOrCreateEmployee(nameOrUsername) {
    const existing = findEmployee(nameOrUsername);
    if (existing)
        return existing;
    // Auto-create with just the name
    const cleanName = nameOrUsername.replace('@', '').trim();
    // If it looks like a username (no spaces), try to use it as both name and username
    const isUsername = !cleanName.includes(' ') && /^[a-zA-Z0-9_]+$/.test(cleanName);
    return createEmployee(cleanName, isUsername ? cleanName.toLowerCase() : null, null);
}
function updateEmployee(id, updates) {
    const db = (0, database_1.getDb)();
    const fields = [];
    const values = [];
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
    if (fields.length === 0)
        return getEmployeeById(id);
    values.push(id);
    db.prepare(`UPDATE employees SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return getEmployeeById(id);
}
//# sourceMappingURL=employee.js.map