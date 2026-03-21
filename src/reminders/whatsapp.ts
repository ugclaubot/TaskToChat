import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Send a WhatsApp message via wacli CLI.
 * @param to Phone number in format 91XXXXXXXXXX (no + prefix)
 * @param message The text message to send
 */
export async function sendWhatsApp(to: string, message: string): Promise<void> {
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
    const { stdout, stderr } = await execAsync(cmd, { timeout: 30_000 });
    if (stdout) console.log(`[WhatsApp] stdout: ${stdout.trim()}`);
    if (stderr) console.warn(`[WhatsApp] stderr: ${stderr.trim()}`);
    console.log(`[WhatsApp] Sent successfully to ${number}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[WhatsApp] Failed to send to ${number}: ${msg}`);
    throw err;
  }
}

/**
 * Send a WhatsApp message, silently failing and logging errors.
 * Use this for reminder jobs where one failure shouldn't stop others.
 */
export async function sendWhatsAppSafe(to: string, message: string): Promise<boolean> {
  try {
    await sendWhatsApp(to, message);
    return true;
  } catch {
    return false;
  }
}
