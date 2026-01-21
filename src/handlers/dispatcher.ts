import type { WASocket } from 'baileys';
import type { WAMessage } from "../utils/whatsapp.js";
import { handleIdea } from "./idea.js";
import { handleTodo } from "./todo.js";
import { handleShopping } from "./shopping.js";
import { handleRecipe, handleIngredientsSearch } from "./recipe.js";
import { handleFinance } from "./finance.js";
import { handleAppointment } from "./appointment.js";
import { handleDone, handleProcessDoneSelection } from "./done.js";
import { handleLists, handleListSelection, handleRecipesSubmenu, handleRecipeSearch } from "./lists.js";
import { flowState } from "../services/flowState.js";

import { safeReply } from "../utils/whatsapp.js";

export async function dispatchMessage(sock: WASocket, message: WAMessage) {
    // Extract text from Baileys message structure
    const text = message.message?.conversation ||
        message.message?.extendedTextMessage?.text || '';
    const upperText = text.toUpperCase();
    const userId = message.key.remoteJid!;

    // 1. Check for Active Flow State
    const currentState = flowState.get(userId);
    if (currentState) {
        if (currentState.step === 'WAITING_FOR_INPUT') {
            // User replied to simple prompt
            const command = currentState.command;
            flowState.clear(userId); // Clear state before processing

            // Dispatch accordingly
            if (command === 'CITA') await handleAppointment(sock, message, text);
            else if (command === 'FINANCE') await handleFinance(sock, message, text);
            else if (command === 'TODO') await handleTodo(sock, message, text);
            else if (command === 'SHOPPING') await handleShopping(sock, message, text);
            else if (command === 'DONE_SELECTION') await handleProcessDoneSelection(sock, message, text, currentState.data);
            else if (command === 'LISTS_MENU') {
                await handleListSelection(sock, message, text);
            }
            else if (command === 'RECIPES_SUBMENU') {
                await handleRecipesSubmenu(sock, message, text);
            }
            else if (command === 'RECIPE_SEARCH') {
                await handleRecipeSearch(sock, message, text);
            }
            return;
        }

        if (currentState.command === 'CITA') {
            await handleAppointment(sock, message, text);
            return;
        }
    }

    // 2. Interactive Mode Helpers
    const askForInput = async (command: 'CITA' | 'FINANCE' | 'TODO' | 'SHOPPING', prompt: string) => {
        await safeReply(sock, message, prompt);
        flowState.set(userId, { step: 'WAITING_FOR_INPUT', command, data: {} });
    };

    // 3. Command Routing

    // IDEA (Exception: always captures text)
    if (upperText.startsWith('/IDEA')) {
        await handleIdea(sock, message, text.slice(5).trim());
    }
    // PENDIENTE
    else if (upperText.startsWith('/PENDIENTE')) {
        const content = text.slice(10).trim();
        if (!content) await askForInput('TODO', "📝 ¿Qué tarea quieres agregar?");
        else await handleTodo(sock, message, content);
    }
    // COMPRA
    else if (upperText.startsWith('/COMPRA')) {
        const content = text.slice(7).trim();
        if (!content) await askForInput('SHOPPING', "🛒 ¿Qué necesitas comprar?");
        else await handleShopping(sock, message, content);
    }
    // TENGO (Search Recipes)
    else if (upperText.startsWith('/TENGO')) {
        const ingredients = text.slice(6).trim();
        await handleIngredientsSearch(sock, message, ingredients);
    }
    // RECETA
    else if (upperText.startsWith('/RECETA')) {
        await handleRecipe(sock, message, text.slice(7).trim());
    }
    // FINANCE (Strict Triggers)
    else if (upperText.startsWith('/INGRESO') || upperText.startsWith('/GASTO') || upperText.startsWith('/FACTURA')) {
        const content = text.replace(/^\/\w+\s*/i, '').trim(); // Remove command
        const hasMedia = message.message?.imageMessage || message.message?.documentMessage;
        if (!content && !hasMedia) {
            await askForInput('FINANCE', "💸 Envíame los detalles o una foto del ingreso/gasto.");
        } else {
            await handleFinance(sock, message, text);
        }
    }
    // INFORME
    else if (upperText === 'INFORME' || upperText === '/INFORME') {
        const { readSheet } = await import("../services/sheets.js");
        const dashboardData = await readSheet('DASHBOARD');

        if (dashboardData && dashboardData.length > 3) {
            const iva = dashboardData[1]?.[1] || "0";
            const beneficio = dashboardData[2]?.[1] || "0";
            const irpf = dashboardData[3]?.[1] || "0";

            await safeReply(sock, message, `📊 *ESTADO FINANCIERO (TRIMESTRE)*

🏛️ IVA a Pagar: *${iva}€*
💰 Beneficio Neto: *${beneficio}€*
📉 Provisión IRPF: *${irpf}€*`);
        } else {
            await safeReply(sock, message, "❌ No pude leer el Dashboard. Asegúrate de haber ejecutado el setup.");
        }
    }
    // CITA
    else if (upperText.startsWith('/CITA')) {
        const content = text.slice(5).trim();
        if (!content) await askForInput('CITA', "📅 ¿Para cuándo es la cita y qué asunto?");
        else await handleAppointment(sock, message, content);
    }
    // HECHO
    else if (upperText.startsWith('/HECHO') || upperText.startsWith('/TACHADO')) {
        // Remove command and trim
        const query = text.replace(/^\/\w+\s*/i, '').trim();
        await handleDone(sock, message, query);
    }
    else if (upperText === '/LISTAS' || upperText === 'LISTAS') {
        await handleLists(sock, message);
    }
    else if (upperText.startsWith('/?')) {
        await safeReply(sock, message, `🤖 *Comandos Disponibles:*
/LISTAS - Ver mis listas
/IDEA [texto] - Guardar idea
/PENDIENTE - Crear tarea
/COMPRA - Lista de súper
/CITA - Agendar
/HECHO [algo] - Tachar pendiente/compra
/INGRESO, /GASTO, /FACTURA - Finanzas
/INFORME - Ver estado
`);
    }
}
