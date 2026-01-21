import type { WASocket } from 'baileys';
import type { WAMessage } from "../utils/whatsapp.js";
import { downloadMediaMessage } from 'baileys';
import { parseWithGemini } from "../services/gemini.js";
import { appendRow } from "../services/sheets.js";
import { safeReply, safeReact } from "../utils/whatsapp.js";

export async function handleFinance(sock: WASocket, message: WAMessage, text: string) {
    await safeReact(sock, message, '💸');

    let mediaPayload = undefined;
    const hasMedia = message.message?.imageMessage || message.message?.documentMessage;

    if (hasMedia) {
        try {
            const buffer = await downloadMediaMessage(message, 'buffer', {});
            const base64 = buffer.toString('base64');
            const mimeType = message.message?.imageMessage?.mimetype || 'image/jpeg';

            mediaPayload = {
                mimeType,
                data: base64
            };
        } catch (e) {
            console.error('Error downloading media:', e);
        }
    }

    // 1. Parse with Gemini
    const data = await parseWithGemini('FINANCE', text, mediaPayload);

    if (!data) {
        await safeReply(sock, message, "🤖 No pude entender los datos financieros. Intenta ser más claro o envía una foto.");
        return;
    }

    // 2. Check for Missing Info / Ambiguity
    if (data.missingInfo) {
        await safeReply(sock, message, `❓ ${data.missingInfo}`);
        // In a real flow, we would set state to waiting for answer, 
        // but for now we rely on user replying and we processing it again.
        return;
    }

    // 3. Process based on Type
    const date = data.date || new Date().toLocaleDateString('es-ES');
    let amount = Number(data.amount); // Base Imponible

    // CURRENCY CONVERSION (Simple fixed rate for now)
    if (data.currency === 'USD') {
        // Exchange Rate Example: 1 USD = 0.95 EUR (Adjust as needed or implement live fetch)
        const exchangeRate = 0.95;
        console.log(`💱 Converting ${amount} USD to EUR (Rate: ${exchangeRate})`);
        amount = Number((amount * exchangeRate).toFixed(2));
    }

    // Ensure amount is string for Sheets (formatted) or number?
    // Google Sheets handles numbers well.
    const amountStr = String(amount);

    const entity = data.entity || (data.type === 'INCOME' ? 'Cliente Varios' : 'Proveedor Varios');
    const concept = data.concept || 'Servicios Profesionales';

    let success = false;
    let replyMsg = "";

    console.log(`📝 Attempting to write to sheet: ${data.type === 'INCOME' ? 'INGRESOS' : 'GASTOS'}`);

    if (data.type === 'INCOME') {
        // Enforce 0% if isInvoice is false (Double safety)
        const isInvoice = data.isInvoice === true;
        const ivaRateVal = isInvoice ? (data.ivaRate ?? 0.21) : 0;
        const irpfRateVal = isInvoice ? (data.irpfRate ?? 0.15) : 0;

        const ivaRate = `${ivaRateVal * 100}%`;
        const irpfRate = `${irpfRateVal * 100}%`;

        // INGRESOS: [Fecha, Nº Factura, Cliente, Concepto, Base, % IVA, % IRPF, Estado]
        // Note: We skip Formula columns (G, I, J) as they auto-calc in Row 2+
        // Actually, if we use appendRow, we append to A:K. 
        // If we append values, we should put empty strings for Formula columns if the sheet expects user input,
        // BUT if the sheet has ARRAYFORMULA in Row 2, we should NOT write to those cells or we might break the array formula 
        // if it's not robust (e.g. infinite range).
        // Best Practice with ARRAYFORMULA: You write to Input columns, and Formula columns just "show" values.
        // However, 'appendRow' adds a new row. If ARRAYFORMULA is "A2:A", it automatically covers new rows.
        // We just need to ensure we don't overwrite the calculated cells with static values if we don't want to.
        // Actually, with Infinite Array Formulas, you shouldn't write ANYTHING to the formula columns.
        // So we write: [Fecha, InvoiceNo, Client, Concept, Base, IvaRate, "", IrpfRate, "", "", Status]

        const row = [
            date,
            isInvoice ? "AUTO" : "S/F", // Placeholder: AUTO if Invoice, S/F (Sin Factura) if not? Or just empty.
            entity,
            concept,
            amountStr,
            ivaRate,
            "", // G: Cuota IVA (Auto)
            irpfRate,
            "", // I: Cuota IRPF (Auto)
            "", // J: Total (Auto)
            "Pendiente" // K: Estado
        ];

        success = await appendRow('INGRESOS', row);
        replyMsg = `✅ *INGRESO REGISTRADO*
💶 Base: ${amountStr}€ (Conv. de ${data.currency || 'EUR'})
🏢 Cliente: ${entity}
📊 IVA: ${ivaRate} | IRPF: ${irpfRate}`;

    } else {
        // GASTO
        const isInvoice = data.isInvoice === true;
        const ivaRateVal = isInvoice ? (data.ivaRate ?? 0.21) : 0;
        const ivaRate = `${ivaRateVal * 100}%`;

        const category = data.category || 'Otros';
        const deductible = data.isDeductible !== false ? 'TRUE' : 'FALSE';

        const row = [
            date,
            entity,
            concept,
            amountStr,
            ivaRate,
            "", // F: Cuota IVA (Auto)
            "", // G: Total (Auto)
            category,
            deductible
        ];

        success = await appendRow('GASTOS', row);
        replyMsg = `✅ *GASTO REGISTRADO*
💸 Base: ${amountStr}€
🏪 Proveedor: ${entity}
📂 Cat: ${category}`;
    }

    if (success) {
        await safeReply(sock, message, replyMsg);
    } else {
        await safeReply(sock, message, "❌ Error al guardar en Google Sheets.");
    }
}
