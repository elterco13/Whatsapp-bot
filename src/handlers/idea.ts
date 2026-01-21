import type { WASocket } from 'baileys';
import type { WAMessage } from "../utils/whatsapp.js";
import { parseWithGemini } from "../services/gemini.js";
import { appendRow } from "../services/sheets.js";
import { ENV } from "../config/env.js";
import { safeReply, safeReact } from "../utils/whatsapp.js";

export async function handleIdea(sock: WASocket, message: WAMessage, text: string) {
    await safeReact(sock, message, '💡');

    const data = await parseWithGemini('IDEA', text);

    if (!data) {
        await safeReply(sock, message, "🤖 No pude entender la idea. Intenta ser más claro.");
        return;
    }

    const formattedDate = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });

    const row = [
        formattedDate,
        data.summary || text,
        data.details || '',
        data.tags ? data.tags.join(', ') : ''
    ];

    const success = await appendRow(ENV.SHEET_NAMES.IDEAS, row);

    if (success) {
        await safeReply(sock, message, `✅ Idea guardada: *${data.summary}*`);
    } else {
        await safeReply(sock, message, "❌ Error al guardar en Sheets.");
    }
}
