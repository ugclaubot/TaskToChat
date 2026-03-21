"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const task_1 = require("../models/task");
const employee_1 = require("../models/employee");
const router = (0, express_1.Router)();
router.get('/', (req, res) => {
    (0, task_1.updateOverdueTasks)();
    const filters = {
        status: req.query.status || '',
        employee: req.query.employee || '',
        from: req.query.from || '',
        to: req.query.to || '',
    };
    const queryFilters = {};
    if (filters.status)
        queryFilters.status = filters.status;
    if (filters.employee)
        queryFilters.employeeId = parseInt(filters.employee, 10);
    if (filters.from)
        queryFilters.fromDate = filters.from;
    if (filters.to)
        queryFilters.toDate = filters.to + 'T23:59:59';
    const tasks = (0, task_1.getAllTasksWithEmployees)(queryFilters);
    const stats = (0, task_1.getTaskStats)();
    const employees = (0, employee_1.getAllEmployees)();
    // Group tasks by employee name (or "Unassigned")
    const tasksByEmployee = {};
    for (const task of tasks) {
        const key = task.employee_name ?? 'Unassigned';
        if (!tasksByEmployee[key])
            tasksByEmployee[key] = [];
        tasksByEmployee[key].push(task);
    }
    res.render('dashboard', {
        tasks,
        tasksByEmployee,
        stats,
        employees,
        filters,
    });
});
exports.default = router;
//# sourceMappingURL=routes.js.map