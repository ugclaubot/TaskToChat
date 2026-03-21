"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTaskMessage = parseTaskMessage;
exports.isTaskMessage = isTaskMessage;
exports.parseMultiTaskMessage = parseMultiTaskMessage;
exports.formatDueDate = formatDueDate;
const chrono = __importStar(require("chrono-node"));
/**
 * Check if the first token looks like a person name/username vs a task description word.
 * Names start with @ or are capitalized single words.
 */
function looksLikeName(token) {
    if (token.startsWith('@'))
        return true;
    // Capitalized single word (like "Rahul", "John")
    if (/^[A-Z][a-z]+$/.test(token))
        return true;
    return false;
}
/**
 * Parses task messages in multiple formats:
 *  - task: @PersonName description of task by DueDate !high
 *  - task: PersonName - description - due Friday
 *  - #task @PersonName description by March 25
 */
function parseTaskMessage(text) {
    // Strip the task: or #task prefix
    const cleaned = text
        .replace(/^(task:|#task)\s*/i, '')
        .trim();
    if (!cleaned)
        return null;
    // Extract priority flag
    const priorityMatch = cleaned.match(/\s*!(high|medium|low)\s*/i);
    const priority = priorityMatch
        ? priorityMatch[1].toLowerCase()
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
        const byDateMatch = withoutPriority.match(/^(@?\S+)\s+(.+?)(?:\s+(?:by|on|due|before)\s+(.+))?$/i);
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
                    descPart = (descPart.slice(0, lastParsed.index) + descPart.slice(lastParsed.index + lastParsed.text.length)).trim();
                }
            }
            const dueDate = dueDateStr
                ? chrono.parseDate(dueDateStr, new Date(), { forwardDate: true })
                : null;
            if (!assigneeName || !descPart)
                return null;
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
    let dueDateStr;
    const byMatch = withoutPriority.match(/^(.+?)(?:\s+(?:by|on|due|before)\s+(.+))$/i);
    if (byMatch) {
        descPart = byMatch[1].trim();
        dueDateStr = byMatch[2].trim();
    }
    else {
        const parsed = chrono.parse(descPart, new Date(), { forwardDate: true });
        if (parsed.length > 0) {
            const lastParsed = parsed[parsed.length - 1];
            dueDateStr = lastParsed.text;
            descPart = (descPart.slice(0, lastParsed.index) + descPart.slice(lastParsed.index + lastParsed.text.length)).trim();
        }
    }
    const dueDate = dueDateStr
        ? chrono.parseDate(dueDateStr, new Date(), { forwardDate: true })
        : null;
    if (!descPart)
        return null;
    return {
        assigneeName: '',
        title: descPart,
        dueDate,
        priority,
        rawText: text,
    };
}
function isTaskMessage(text) {
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
function parseMultiTaskMessage(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2)
        return null;
    // Check if any line after the first is a bullet point
    const bulletLines = lines.slice(1).filter(l => /^[-•*]\s+/.test(l));
    if (bulletLines.length === 0)
        return null;
    // First line: #task or #task PersonName
    const firstLine = lines[0].replace(/^(task:|#task)\s*/i, '').trim();
    // Check if first line has an assignee name
    let assigneeName = '';
    if (firstLine && looksLikeName(firstLine.split(/\s+/)[0])) {
        assigneeName = firstLine.replace('@', '').trim();
    }
    const tasks = [];
    for (const bullet of bulletLines) {
        const itemText = bullet.replace(/^[-•*]\s+/, '').trim();
        if (!itemText)
            continue;
        // Extract priority
        const priorityMatch = itemText.match(/\s*!(high|medium|low)\s*/i);
        const priority = priorityMatch
            ? priorityMatch[1].toLowerCase()
            : 'medium';
        let cleaned = itemText.replace(/\s*!(high|medium|low)\s*/gi, ' ').trim();
        // Extract date
        let dueDate = null;
        const byMatch = cleaned.match(/^(.+?)(?:\s+(?:by|on|due|before)\s+(.+))$/i);
        if (byMatch) {
            cleaned = byMatch[1].trim();
            dueDate = chrono.parseDate(byMatch[2].trim(), new Date(), { forwardDate: true });
        }
        else {
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
function formatDueDate(date) {
    if (!date)
        return 'No due date';
    return date.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
        timeZone: 'Asia/Kolkata',
    });
}
//# sourceMappingURL=taskParser.js.map