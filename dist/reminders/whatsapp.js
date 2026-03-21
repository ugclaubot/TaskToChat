"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendWhatsApp = sendWhatsApp;
exports.sendWhatsAppSafe = sendWhatsAppSafe;
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
/**
 * Send a WhatsApp message via wacli CLI.
 * @param to Phone number in format 91XXXXXXXXXX (no + prefix)
 * @param message The text message to send
 */
async function sendWhatsApp(to, message) {
    if (!to) {
        console.warn('[WhatsApp] No phone number provided, skipping send');
        return;
    }
    // Sanitize: remove +, spaces, dashes
    const number = to.replace(/[+\s\-]/g, '');
    // Escape the message for shell — use single quotes, escape internal single quotes
    const escaped = message.replace(/'/g, "'\"'\"'");
    const cmd = `wacli send text --to ${number} --message '${escaped}'`;
    console.log(`[WhatsApp] Sending to ${number} (${message.length} chars)`);
    try {
        const { stdout, stderr } = await execAsync(cmd, { timeout: 30000 });
        if (stdout)
            console.log(`[WhatsApp] stdout: ${stdout.trim()}`);
        if (stderr)
            console.warn(`[WhatsApp] stderr: ${stderr.trim()}`);
        console.log(`[WhatsApp] Sent successfully to ${number}`);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[WhatsApp] Failed to send to ${number}: ${msg}`);
        throw err;
    }
}
/**
 * Send a WhatsApp message, silently failing and logging errors.
 * Use this for reminder jobs where one failure shouldn't stop others.
 */
async function sendWhatsAppSafe(to, message) {
    try {
        await sendWhatsApp(to, message);
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=whatsapp.js.map