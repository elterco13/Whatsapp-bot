import type { WASocket } from 'baileys';
import type { WAMessage } from "../utils/whatsapp.js";
import { parseWithGemini } from "../services/gemini.js";
import { appendRow } from "../services/sheets.js";
import { ENV } from "../config/env.js";
import { safeReply, safeReact } from "../utils/whatsapp.js";

export async function handleTodo(sock: WASocket, message: WAMessage, text: string) {
    await safeReact(sock, message, '📝');

    const data = await parseWithGemini('TODO', text);

    if (!data) {
        await safeReply(sock, message, "🤖 No pude entender la tarea.");
        return;
    }

    // Schema: [Date, Task, Priority, Deadline, Status]
    const formattedDate = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
    const row = [
        formattedDate,
        data.task || text,
        data.priority || 'Normal',
        data.deadline || '',
        'Pendiente'
    ];

    const success = await appendRow(ENV.SHEET_NAMES.TODO, row);

    if (success) {
        await safeReply(sock, message, `✅ Tarea registrada: *${data.task}*`);
    } else {
        await safeReply(sock, message, "❌ Error al guardar en Sheets.");
    }
}
