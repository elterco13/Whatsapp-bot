import type { WASocket } from 'baileys';
import type { WAMessage } from '../utils/whatsapp.js';
import { readSheet } from '../services/sheets.js';
import { flowState } from '../services/flowState.js';
import { safeReply } from '../utils/whatsapp.js';
import { ENV } from '../config/env.js';

/**
 * Main entry point for /LISTAS command
 */
export async function handleLists(sock: WASocket, message: WAMessage) {
    const userId = message.key.remoteJid!;

    const menu = `📋 *MIS LISTAS*

1. 🛒 Compras
2. 📌 Pendientes
3. 🍳 Recetas
4. 📅 Citas

👉 Responde con el número de la lista que quieres ver`;

    flowState.set(userId, {
        step: 'WAITING_FOR_INPUT',
        command: 'LISTS_MENU',
        data: {}
    });

    await safeReply(sock, message, menu);
}

/**
 * Process main menu selection
 */
export async function handleListSelection(sock: WASocket, message: WAMessage, selection: string) {
    const userId = message.key.remoteJid!;
    const choice = parseInt(selection.trim());

    switch (choice) {
        case 1:
            await showShoppingList(sock, message);
            break;
        case 2:
            await showPendingTasks(sock, message);
            break;
        case 3:
            await showRecipesMenu(sock, message);
            break;
        case 4:
            await showAppointments(sock, message);
            break;
        default:
            await safeReply(sock, message, "❌ Opción inválida. Escribe /LISTAS para ver el menú de nuevo.");
            flowState.clear(userId);
    }
}

/**
 * Show shopping list
 */
async function showShoppingList(sock: WASocket, message: WAMessage) {
    const shopping = await readSheet(ENV.SHEET_NAMES.SHOPPING);
    const pending = shopping.filter(row => row[3]?.toLowerCase() === 'pendiente');

    if (pending.length === 0) {
        await safeReply(sock, message, "🎉 Lista de compras vacía!");
        flowState.clear(message.key.remoteJid!);
        return;
    }

    let response = "🛒 *LISTA DE COMPRAS*\n\n";
    pending.forEach((row, i) => {
        const item = row[1];
        const quantity = row[2] || '1';
        response += `${i + 1}. ${item} (${quantity})\n`;
    });

    await safeReply(sock, message, response);
    flowState.clear(message.key.remoteJid!);
}

/**
 * Show pending tasks
 */
async function showPendingTasks(sock: WASocket, message: WAMessage) {
    const tasks = await readSheet(ENV.SHEET_NAMES.TODO);
    const pending = tasks.filter(row => row[4]?.toLowerCase() === 'pendiente');

    if (pending.length === 0) {
        await safeReply(sock, message, "🎉 No hay tareas pendientes!");
        flowState.clear(message.key.remoteJid!);
        return;
    }

    let response = "📌 *TAREAS PENDIENTES*\n\n";
    pending.forEach((row, i) => {
        const task = row[1];
        const priority = row[2] || 'Normal';
        const deadline = row[3] || '';
        response += `${i + 1}. ${task}\n   📊 ${priority}${deadline ? ` | 📅 ${deadline}` : ''}\n\n`;
    });

    await safeReply(sock, message, response);
    flowState.clear(message.key.remoteJid!);
}

/**
 * Show recipes submenu
 */
async function showRecipesMenu(sock: WASocket, message: WAMessage) {
    const menu = `🍳 *RECETAS*

1. Ver últimas 5 recetas
2. Buscar por ingrediente

👉 Elige una opción`;

    flowState.set(message.key.remoteJid!, {
        step: 'WAITING_FOR_INPUT',
        command: 'RECIPES_SUBMENU',
        data: {}
    });

    await safeReply(sock, message, menu);
}

/**
 * Process recipes submenu selection
 */
export async function handleRecipesSubmenu(sock: WASocket, message: WAMessage, selection: string) {
    const userId = message.key.remoteJid!;
    const choice = parseInt(selection.trim());

    if (choice === 1) {
        await showRecentRecipes(sock, message);
    } else if (choice === 2) {
        flowState.set(userId, {
            step: 'WAITING_FOR_INPUT',
            command: 'RECIPE_SEARCH',
            data: {}
        });
        await safeReply(sock, message, "🔍 Dime qué ingrediente o comida buscas:");
    } else {
        await safeReply(sock, message, "❌ Opción inválida.");
        flowState.clear(userId);
    }
}

/**
 * Show recent 5 recipes
 */
async function showRecentRecipes(sock: WASocket, message: WAMessage) {
    const recipes = await readSheet(ENV.SHEET_NAMES.RECIPES);
    const recent = recipes.slice(-5).reverse(); // Last 5, newest first

    if (recent.length === 0) {
        await safeReply(sock, message, "📭 No hay recetas guardadas.");
        flowState.clear(message.key.remoteJid!);
        return;
    }

    let response = "🍳 *ÚLTIMAS 5 RECETAS*\n\n";
    recent.forEach((row, i) => {
        const title = row[1] || 'Sin título';
        const link = row[2] || '';
        response += `${i + 1}. *${title}*\n`;
        if (link) response += `   🔗 ${link}\n`;
        response += '\n';
    });

    await safeReply(sock, message, response);
    flowState.clear(message.key.remoteJid!);
}

/**
 * Search recipes by ingredient or name
 */
export async function handleRecipeSearch(sock: WASocket, message: WAMessage, query: string) {
    const recipes = await readSheet(ENV.SHEET_NAMES.RECIPES);
    const matches = recipes.filter(row => {
        const title = (row[1] || '').toLowerCase();
        const ingredients = (row[3] || '').toLowerCase();
        const searchTerm = query.toLowerCase();
        return title.includes(searchTerm) || ingredients.includes(searchTerm);
    });

    if (matches.length === 0) {
        await safeReply(sock, message, `😕 No encontré recetas con "${query}"`);
        flowState.clear(message.key.remoteJid!);
        return;
    }

    let response = `🍳 *Recetas con "${query}":*\n\n`;
    matches.slice(0, 5).forEach((row, i) => {
        const title = row[1] || 'Sin título';
        const link = row[2] || '';
        const ingredients = row[3] || '';
        const steps = row[4] || '';

        response += `*${i + 1}. ${title}*\n`;
        if (ingredients) {
            const ingredientsList = ingredients.split('\n').slice(0, 3).join(', ');
            response += `📝 ${ingredientsList}${ingredients.split('\n').length > 3 ? '...' : ''}\n`;
        }
        if (steps) {
            const firstStep = steps.split('\n')[0];
            response += `👨‍🍳 ${firstStep.substring(0, 80)}${firstStep.length > 80 ? '...' : ''}\n`;
        }
        if (link) response += `🔗 ${link}\n`;
        response += '\n';
    });

    if (matches.length > 5) {
        response += `\n... y ${matches.length - 5} más.`;
    }

    await safeReply(sock, message, response);
    flowState.clear(message.key.remoteJid!);
}

/**
 * Show upcoming appointments
 */
async function showAppointments(sock: WASocket, message: WAMessage) {
    const appointments = await readSheet(ENV.SHEET_NAMES.APPOINTMENTS);
    // Filter scheduled appointments
    const upcoming = appointments.filter(row => {
        return row[4]?.toLowerCase() === 'scheduled';
    }).slice(0, 5);

    if (upcoming.length === 0) {
        await safeReply(sock, message, "📅 No hay citas programadas.");
        flowState.clear(message.key.remoteJid!);
        return;
    }

    let response = "📅 *PRÓXIMAS CITAS*\n\n";
    upcoming.forEach((row, i) => {
        const date = row[1];
        const summary = row[2];
        const location = row[3] || '';
        response += `${i + 1}. *${summary}*\n   📅 ${date}${location ? `\n   📍 ${location}` : ''}\n\n`;
    });

    await safeReply(sock, message, response);
    flowState.clear(message.key.remoteJid!);
}
