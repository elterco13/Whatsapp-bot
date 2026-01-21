import type { WASocket } from 'baileys';
import type { WAMessage } from "../utils/whatsapp.js";
import { updateRowStatus, readSheet } from "../services/sheets.js";
import { flowState } from "../services/flowState.js";
import { ENV } from "../config/env.js";
import { safeReply } from "../utils/whatsapp.js";

// Helper interface for actionable items
interface PendingItem {
    id: number;
    sheetName: string;
    text: string;
    originalRowIndex: number; // Not strictly needed if we search by text, but good for debugging
    type: 'TAREA' | 'COMPRA';
}

/**
 * Handle /HECHO command.
 * If text is provided -> Legacy "Try to find and mark done immediately"
 * If text is empty -> Show numbered list of pending items
 */
export async function handleDone(sock: WASocket, message: WAMessage, text: string) {
    // 1. Legacy / Quick Mode: "/hecho comprar leche"
    if (text) {
        // Try TODO
        let foundItem = await updateRowStatus(ENV.SHEET_NAMES.TODO, text, "DONE", 1, 4);
        if (foundItem) {
            await safeReply(sock, message, `✅ Tarea marcada como hecha: *${foundItem}*`);
            return;
        }

        // Try SHOPPING
        foundItem = await updateRowStatus(ENV.SHEET_NAMES.SHOPPING, text, "COMPRADO", 1, 3);
        if (foundItem) {
            await safeReply(sock, message, `✅ Producto tachado de la lista: *${foundItem}*`);
            return;
        }

        await safeReply(sock, message, `❌ No encontré "${text}" en Pendientes ni Compras.`);
        return;
    }

    // 2. Interactive Mode: "/hecho" (List pending items)
    await handleShowPending(sock, message);
}

/**
 * Lists all pending items from Todo and Shopping sheets.
 */
async function handleShowPending(sock: WASocket, message: WAMessage) {
    const todos = await readSheet(ENV.SHEET_NAMES.TODO);
    const shopping = await readSheet(ENV.SHEET_NAMES.SHOPPING);

    const pendingItems: PendingItem[] = [];
    let counter = 1;

    // Filter Todos (Pending in Col 4 / Index 4)
    // Row: [Date, Task, Priority, Deadline, Status]
    todos.forEach((row, index) => {
        // Skip header if it exists (usually row 0) - assuming simple check
        if (row[4]?.trim().toLowerCase() === 'pendiente') {
            pendingItems.push({
                id: counter++,
                sheetName: ENV.SHEET_NAMES.TODO,
                text: row[1], // Task
                originalRowIndex: index,
                type: 'TAREA'
            });
        }
    });

    // Filter Shopping (Pending in Col 3 / Index 3)
    // Row: [Date, Item, Quantity, Status]
    shopping.forEach((row, index) => {
        if (row[3]?.trim().toLowerCase() === 'pendiente') {
            pendingItems.push({
                id: counter++,
                sheetName: ENV.SHEET_NAMES.SHOPPING,
                text: row[1], // Item
                originalRowIndex: index,
                type: 'COMPRA'
            });
        }
    });

    if (pendingItems.length === 0) {
        await safeReply(sock, message, "🎉 ¡No hay nada pendiente! Todo al día.");
        return;
    }

    // Build the list message
    let response = "*📝 COSAS PENDIENTES:*\n\n";
    pendingItems.forEach(item => {
        const icon = item.type === 'TAREA' ? '📌' : '🛒';
        response += `*${item.id}.* ${icon} ${item.text}\n`;
    });
    response += "\n👇 *Responde con los números para tacharlos* (ej: '1, 3').";

    // Save state
    const userId = message.key.remoteJid!;
    flowState.set(userId, {
        step: 'WAITING_FOR_INPUT',
        command: 'DONE_SELECTION',
        data: { pendingItems }
    });

    await safeReply(sock, message, response);
}

/**
 * Process the numbers sent by the user.
 */
export async function handleProcessDoneSelection(sock: WASocket, message: WAMessage, text: string, data: any) {
    const pendingItems = data.pendingItems as PendingItem[];
    if (!pendingItems) {
        await safeReply(sock, message, "❌ Error de sesión. Por favor escribe /hecho de nuevo.");
        return;
    }

    // Parse items "1, 2, 5" -> [1, 2, 5]
    // Also handle space separation "1 2 5"
    const indices = text.split(/[\s,]+/)
        .map(s => parseInt(s.trim()))
        .filter(n => !isNaN(n));

    if (indices.length === 0) {
        await safeReply(sock, message, "❌ No entendí los números. Intenta de nuevo (ej: '1, 3') o escribe otra cosa para cancelar.");
        return;
    }

    const completed: string[] = [];
    const errors: string[] = [];

    for (const id of indices) {
        const item = pendingItems.find(p => p.id === id);
        if (item) {
            const status = item.type === 'TAREA' ? 'DONE' : 'COMPRADO';
            const targetCol = item.type === 'TAREA' ? 4 : 3;

            const result = await updateRowStatus(item.sheetName, item.text, status, 1, targetCol);

            if (result) completed.push(`${item.text}`);
            else errors.push(`${item.text}`);
        }
    }

    if (completed.length > 0) {
        await safeReply(sock, message, `✅ *Completados:*\n${completed.map(c => `~${c}~`).join('\n')}`);
    }

    if (errors.length > 0) {
        await safeReply(sock, message, `⚠️ No se pudieron marcar: ${errors.join(', ')}`);
    }
}
