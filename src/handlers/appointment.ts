import type { WASocket } from 'baileys';
import type { WAMessage } from "../utils/whatsapp.js";
import { flowState } from "../services/flowState.js";
import { parseWithGemini } from "../services/gemini.js";
import { createEvent } from "../services/calendar.js";
import { appendRow } from "../services/sheets.js";
import { ENV } from "../config/env.js";
import { addHours, format } from "date-fns";
import { safeReply } from "../utils/whatsapp.js";

export async function handleAppointment(sock: WASocket, message: WAMessage, text: string) {
    const userId = message.key.remoteJid!;
    let currentState = flowState.get(userId);

    // Initial parsing
    // If we are already in a state, we merge the new text with the previous context implies complexity.
    // For simplicity, we just pass the new text as "Context" or rely on the user answering the specific question.
    // ... rest of logic
    let promptText = text;
    if (currentState && currentState.data) {
        promptText = `Existing Info: ${JSON.stringify(currentState.data)}. User Update: ${text}`;
    }

    const data = await parseWithGemini('APPOINTMENT', promptText);

    if (!data) {
        await safeReply(sock, message, "🤖 No entendí. Intenta de nuevo.");
        return;
    }

    // Check for missing fields
    const missing = [];
    if (!data.summary) missing.push('Asunto');
    if (!data.start) missing.push('Fecha/Hora');

    if (missing.length > 0) {
        // Update State
        flowState.set(userId, {
            step: missing.includes('Fecha/Hora') ? 'WAITING_FOR_DATE' : 'WAITING_FOR_SUBJECT',
            data: data,
            command: 'CITA'
        });

        if (missing.includes('Fecha/Hora')) {
            await safeReply(sock, message, "📅 ¿Para cuándo es la cita? (Ej: 'Mañana a las 5pm')");
        } else {
            await safeReply(sock, message, "🤔 ¿Cuál es el asunto de la cita?");
        }
        return;
    }

    // All good! Create Event
    const eventData = {
        summary: data.summary,
        location: data.location,
        description: data.description || 'Creado vía WhatsApp Bot',
        start: data.start,
        end: data.end || addHours(new Date(data.start), 1).toISOString() // Default 1h
    };

    const createdEvent = await createEvent(eventData);

    if (createdEvent) {
        // Also save to Sheets
        const formattedDate = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
        const apptDate = new Date(eventData.start).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

        await appendRow(ENV.SHEET_NAMES.APPOINTMENTS, [
            formattedDate,
            apptDate,
            eventData.summary,
            eventData.location || '',
            ''   // Estado calculado por ARRAYFORMULA en el sheet
        ]);

        await safeReply(sock, message, `✅ Cita Agendada: *${eventData.summary}*\nFecha: ${format(new Date(eventData.start), 'PP pp')}\nLink: ${createdEvent.htmlLink}`);
        flowState.clear(userId);
    } else {
        await safeReply(sock, message, "❌ Error al crear en Google Calendar.");
        flowState.clear(userId);
    }
}
