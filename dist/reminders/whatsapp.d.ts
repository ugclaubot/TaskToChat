/**
 * Send a WhatsApp message via wacli CLI.
 * @param to Phone number in format 91XXXXXXXXXX (no + prefix)
 * @param message The text message to send
 */
export declare function sendWhatsApp(to: string, message: string): Promise<void>;
/**
 * Send a WhatsApp message, silently failing and logging errors.
 * Use this for reminder jobs where one failure shouldn't stop others.
 */
export declare function sendWhatsAppSafe(to: string, message: string): Promise<boolean>;
//# sourceMappingURL=whatsapp.d.ts.map