import type { WASocket } from 'baileys';
import type { WAMessage } from "../utils/whatsapp.js";
import { parseWithGemini } from "../services/gemini.js";
import { appendRow, readSheet } from "../services/sheets.js";
import { ENV } from "../config/env.js";
import { safeReply, safeReact } from "../utils/whatsapp.js";

/**
 * Searches for recipes containing ALL the specified ingredients.
 */
export async function handleIngredientsSearch(sock: WASocket, message: WAMessage, text: string) {
    if (!text) {
        await safeReply(sock, message, "🥦 Dime qué ingredientes tienes. Ej: `/tengo pollo, arroz`");
        return;
    }

    const ingredients = text.split(/[\s,]+/).map(i => i.trim().toLowerCase()).filter(i => i.length > 0);

    if (ingredients.length === 0) {
        await safeReply(sock, message, "🥦 No entendí los ingredientes.");
        return;
    }

    const recipes = await readSheet(ENV.SHEET_NAMES.RECIPES);
    const matches: any[] = [];

    // Schema: [Date, Title, Link, Ingredients, Steps, Tags]
    // Index 1: Title
    // Index 3: Ingredients (multiline string)

    recipes.forEach(row => {
        const title = row[1] || 'Sin Título';
        const recipeIngredients = (row[3] || '').toLowerCase();

        // Check if ALL searched ingredients are present in the recipe's ingredient list
        const hasAll = ingredients.every(ing => recipeIngredients.includes(ing));

        if (hasAll) {
            matches.push({ title, link: row[2] });
        }
    });

    if (matches.length === 0) {
        await safeReply(sock, message, `😕 No encontré recetas con: ${ingredients.join(', ')}.`);
        // Optional: Call Gemini to suggest a NEW recipe?
        return;
    }

    let response = `🍳 *Recetas encontradas (${matches.length}):*\n\n`;
    matches.slice(0, 10).forEach((m, i) => {
        response += `*${i + 1}.* ${m.title}\n`;
        if (m.link) response += `   🔗 ${m.link}\n`;
    });

    if (matches.length > 10) {
        response += `\n... y ${matches.length - 10} más.`;
    }

    await safeReply(sock, message, response);
}

export async function handleRecipe(sock: WASocket, message: WAMessage, text: string) {
    await safeReact(sock, message, '🍳');
    await safeReply(sock, message, '⏳ Analizando receta...');

    console.log('🤖 Parsing recipe with Gemini...');
    const data = await parseWithGemini('RECIPE', text);

    if (!data) {
        await safeReply(sock, message, "🤖 No pude procesar la receta.");
        return;
    }

    // Schema: [Date, Title, Link, Ingredients, Steps, Tags]
    // We try to find a link in the original text if possible, otherwise empty
    const linkMatch = text.match(/https?:\/\/[^\s]+/);
    const link = linkMatch ? linkMatch[0] : '';

    const formattedDate = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });

    const ingredientsStr = data.ingredients ? data.ingredients.join('\n') : '';
    const stepsStr = data.steps ? data.steps.join('\n') : '';

    // Fill up to 6 tag columns
    const tags = data.tags || [];
    const tagline = [
        tags[0] || '',
        tags[1] || '',
        tags[2] || '',
        tags[3] || '',
        tags[4] || '',
        tags[5] || ''
    ];

    const row = [
        formattedDate,
        data.title || 'Sin Título',
        link,
        ingredientsStr,
        stepsStr,
        ...tagline
    ];

    const success = await appendRow(ENV.SHEET_NAMES.RECIPES, row);

    if (success) {
        // Reply with Markdown
        const msg = `*🍳 ${data.title}*\n\n*Ingredientes:*\n${data.ingredients.map((i: string) => `- ${i}`).join('\n')}\n\n*Pasos:*\n${data.steps.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}`;
        await safeReply(sock, message, msg);
    } else {
        await safeReply(sock, message, "❌ Error al guardar la receta.");
    }
}
