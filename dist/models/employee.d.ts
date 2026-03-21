export interface Employee {
    id: number;
    name: string;
    telegram_username: string | null;
    telegram_user_id: string | null;
    whatsapp_number: string | null;
    created_at: string;
}
export declare function createEmployee(name: string, telegramUsername: string | null, whatsappNumber: string | null, telegramUserId?: string | null): Employee;
/**
 * Auto-register or update a user from Telegram message context.
 * Silently captures anyone who messages in a group.
 */
export declare function autoRegisterFromTelegram(telegramUserId: string, firstName: string, lastName: string | undefined, username: string | undefined): Employee;
export declare function getEmployeeByTelegramId(telegramUserId: string): Employee | null;
export declare function getAllEmployeesWithTelegramId(): Employee[];
export declare function getEmployeeById(id: number): Employee | null;
export declare function getEmployeeByUsername(username: string): Employee | null;
export declare function getEmployeeByName(name: string): Employee | null;
export declare function getAllEmployees(): Employee[];
export declare function findEmployee(nameOrUsername: string): Employee | null;
/**
 * Find an employee or auto-create one if not found.
 */
export declare function findOrCreateEmployee(nameOrUsername: string): Employee;
export declare function updateEmployee(id: number, updates: Partial<Pick<Employee, 'name' | 'telegram_username' | 'whatsapp_number'>>): Employee | null;
//# sourceMappingURL=employee.d.ts.map