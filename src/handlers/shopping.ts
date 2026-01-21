import type { WASocket } from 'baileys';
import type { WAMessage } from "../utils/whatsapp.js";
import { parseWithGemini } from "../services/gemini.js";
import { appendRow } from "../services/sheets.js";
import { ENV } from "../config/env.js";
import { safeReply, safeReact } from "../utils/whatsapp.js";

export async function handleShopping(sock: WASocket, message: WAMessage, text: string) {
    await safeReact(sock, message, '🛒');

    const data = await parseWithGemini('SHOPPING', text);

    if (!data || !data.items || data.items.length === 0) {
        // Fallback simple
        const formattedDate = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
        await appendRow(ENV.SHEET_NAMES.SHOPPING, [formattedDate, text, '1', 'Pendiente']);
        await safeReply(sock, message, "✅ Agregado a la lista.");
        return;
    }

    let count = 0;
    for (const item of data.items) {
        // Schema: [Date, Item, Quantity, Status]
        const formattedDate = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
        const row = [
            formattedDate,
            item.product,
            String(item.quantity || 1),
            'Pendiente'
        ];
        if (await appendRow(ENV.SHEET_NAMES.SHOPPING, row)) {
            count++;
        }
    }

    await safeReply(sock, message, `✅ Se agregaron ${count} ítems a la lista.`);
}
