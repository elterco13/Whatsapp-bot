import type { WASocket } from 'baileys';
import type { WAMessage } from "../utils/whatsapp.js";
import { downloadMediaMessage } from 'baileys';
import { parseWithGemini } from "../services/gemini.js";
import { appendRow, updateDespensa, markShoppingItemsDone, readClientes, matchCliente, getNextInvoiceNumber } from "../services/sheets.js";
import type { Cliente } from "../services/sheets.js";
import { flowState } from "../services/flowState.js";
import { ENV } from "../config/env.js";
import { safeReply, safeReact } from "../utils/whatsapp.js";

// ─── INGRESO / GASTO ──────────────────────────────────────────────────────────

export async function handleFinance(sock: WASocket, message: WAMessage, text: string) {
    await safeReact(sock, message, '💸');

    const userId = message.key.remoteJid!;

    let mediaPayload = undefined;
    const hasMedia = message.message?.imageMessage || message.message?.documentMessage;

    if (hasMedia) {
        try {
            const buffer = await downloadMediaMessage(message, 'buffer', {});
            const base64 = buffer.toString('base64');
            const mimeType = message.message?.imageMessage?.mimetype || 'image/jpeg';
            mediaPayload = { mimeType, data: base64 };
        } catch (e) {
            console.error('Error downloading media:', e);
        }
    }

    const data = await parseWithGemini('FINANCE', text, mediaPayload);

    if (!data) {
        await safeReply(sock, message, "🤖 No pude entender los datos financieros. Intenta ser más claro o envía una foto.");
        return;
    }

    if (data.missingInfo) {
        await safeReply(sock, message, `❓ ${data.missingInfo}`);
        return;
    }

    const date = data.date || new Date().toLocaleDateString('es-ES');
    let amount = Number(data.amount);

    if (data.currency === 'USD') {
        amount = Number((amount * 0.95).toFixed(2));
    }

    const amountStr = String(amount);
    const entity = data.entity || (data.type === 'INCOME' ? 'Cliente Varios' : 'Proveedor Varios');
    const concept = data.concept || 'Servicios Profesionales';

    if (data.type === 'INCOME') {
        // ── INGRESO: buscar cliente en CLIENTES y preguntar si facturar ───────
        const isInvoice = data.isInvoice === true;
        const ivaRateVal = isInvoice ? (data.ivaRate ?? 0.21) : 0;
        const irpfRateVal = isInvoice ? (data.irpfRate ?? 0.15) : 0;

        // Buscar en CLIENTES
        const clientes = await readClientes();
        const matches = matchCliente(clientes, entity);

        const incomeBase = {
            date, entity, concept, amountStr,
            ivaRateVal, irpfRateVal,
            currency: data.currency || 'EUR'
        };

        if (matches.length === 1) {
            // Match único → ir directo a pregunta de factura
            const cliente = matches[0];
            flowState.set(userId, {
                step: 'WAITING_FOR_INPUT',
                command: 'INGRESO_FACTURA',
                data: { ...incomeBase, country: cliente.pais, clientType: cliente.tipo, clientNombre: cliente.nombre }
            });
            await safeReply(sock, message,
                `💶 *Ingreso detectado*\n` +
                `📅 ${date} | 🏢 ${entity}\n` +
                `💰 ${amountStr}€ — ${concept}\n` +
                `👤 Cliente: *${cliente.nombre}* (${cliente.pais.toUpperCase()} · ${cliente.tipo})\n\n` +
                `❓ ¿Debe *facturarse* este ingreso?\n` +
                `Responde *SI* para incluirlo en ANALISIS CONTABLE\n` +
                `_(Por defecto: NO — se registra como S/F)_`
            );
        } else {
            // Sin match o múltiples → mostrar lista de clientes
            const lista = clientes.slice(0, 15); // máx 15
            const opciones = lista
                .map((c, i) => `${i + 1}. *${c.nombre}* (${c.pais.toUpperCase()} · ${c.tipo})`)
                .join('\n');

            flowState.set(userId, {
                step: 'WAITING_FOR_INPUT',
                command: 'INGRESO_CLIENTE_SELECCION',
                data: { ...incomeBase, clientesList: lista }
            });
            await safeReply(sock, message,
                `💶 *Ingreso detectado*\n` +
                `📅 ${date} | 💰 ${amountStr}€ — ${concept}\n\n` +
                `📊 No encontré al cliente en CLIENTES.\n` +
                `¿Cuál es el cliente? Responde con el *número*:\n\n${opciones}\n\n` +
                `_0 → ninguno (registrar sin cliente específico)_`
            );
        }

    } else {
        // ── GASTO: preguntar si es deducible antes de guardar ─────────────────
        const isInvoice = data.isInvoice === true;
        const ivaRateVal = isInvoice ? (data.ivaRate ?? 0.21) : 0;
        const ivaRateStr = `${ivaRateVal * 100}%`;
        const category = data.category || 'Otros';

        flowState.set(userId, {
            step: 'WAITING_FOR_INPUT',
            command: 'GASTO_DEDUCTIBLE',
            data: { date, entity, concept, amountStr, ivaRateStr, category }
        });

        await safeReply(sock, message,
            `💸 *Gasto detectado*\n` +
            `📅 ${date} | 🏪 ${entity}\n` +
            `💶 ${amountStr}€ — ${category}\n\n` +
            `❓ Clasifica este gasto:\n` +
            `*NO* → Personal (por defecto)\n` +
            `*SI* → Deducible profesional\n` +
            `*FIJO* → Gasto fijo recurrente\n` +
            `*FIJO+SI* → Fijo y deducible`
        );
    }
}

// ─── CONFIRMACIÓN DEDUCIBILIDAD DEL GASTO ────────────────────────────────────

export async function handleGastoDeductible(sock: WASocket, message: WAMessage, text: string, data: any) {
    const userId = message.key.remoteJid!;
    const resp = text.trim().toUpperCase().replace(/\s+/g, '');

    const isDeductible = resp === 'SI' || resp === 'FIJO+SI' || resp === 'SI+FIJO';
    const isFijo = resp === 'FIJO' || resp === 'FIJO+SI' || resp === 'SI+FIJO';

    const row = [
        data.date,
        data.entity,
        data.concept,
        data.amountStr,
        data.ivaRateStr,
        '',
        '',
        data.category,
        isDeductible ? 'TRUE' : 'FALSE'
    ];

    const success = await appendRow(ENV.SHEET_NAMES.GASTOS, row);

    // Si es gasto fijo → también a GASTOS FIJOS
    // Schema: [Concepto, Proveedor, Importe, Categoría, Deducible, Frecuencia, Fecha Alta]
    if (isFijo) {
        await appendRow(ENV.SHEET_NAMES.GASTOS_FIJOS, [
            data.concept,
            data.entity,
            data.amountStr,
            data.category,
            isDeductible ? 'TRUE' : 'FALSE',
            'Mensual',
            data.date
        ]);
    }

    flowState.clear(userId);

    if (success) {
        let tag = '📋 _Gasto personal_';
        if (isDeductible && isFijo) tag = '📊 _Deducible + Gasto fijo recurrente_ ✅';
        else if (isDeductible) tag = '📊 _Deducible → gestor_ ✅';
        else if (isFijo) tag = '🔄 _Añadido a Gastos Fijos_';

        await safeReply(sock, message,
            `✅ *GASTO REGISTRADO*\n💸 ${data.amountStr}€ | 🏪 ${data.entity}\n📂 ${data.category}\n${tag}`
        );
    } else {
        await safeReply(sock, message, "❌ Error al guardar en Google Sheets.");
    }
}

// ─── SELECCIÓN DE CLIENTE ────────────────────────────────────────────────

export async function handleIngresoClienteSeleccion(sock: WASocket, message: WAMessage, text: string, data: any) {
    const userId = message.key.remoteJid!;
    const num = parseInt(text.trim());
    const lista: Cliente[] = data.clientesList || [];

    let cliente: Cliente | null = null;
    if (num > 0 && num <= lista.length) {
        cliente = lista[num - 1];
    } else if (num === 0) {
        // Ninguno → usar datos genéricos
    } else {
        await safeReply(sock, message, `❓ Elige un número de la lista (o 0 para ninguno).`);
        return; // mantener estado
    }

    const country = cliente?.pais || 'es';
    const clientType = cliente?.tipo || 'B2B';
    const clientNombre = cliente?.nombre || data.entity;

    flowState.set(userId, {
        step: 'WAITING_FOR_INPUT',
        command: 'INGRESO_FACTURA',
        data: { ...data, country, clientType, clientNombre }
    });

    await safeReply(sock, message,
        `👤 Cliente: *${clientNombre}* (${country.toUpperCase()} · ${clientType})\n\n` +
        `❓ ¿Debe *facturarse* este ingreso?\n` +
        `Responde *SI* para incluirlo en ANALISIS CONTABLE\n` +
        `_(Por defecto: NO — S/F)_`
    );
}

// ─── CONFIRMACIÓN: ¿FACTURAR INGRESO? ───────────────────────────────────────

export async function handleIngresoFactura(sock: WASocket, message: WAMessage, text: string, data: any) {
    const userId = message.key.remoteJid!;
    const factura = text.trim().toUpperCase() === 'SI';
    flowState.clear(userId);

    const clientNombre = data.clientNombre || data.entity;
    const currency = data.currency || 'EUR';

    // INGRESOS: 9 columnas exactas
    // [Fecha | Nº Ingreso | Cliente | Concepto | Monto | Divisa | Medio Pago | Se factura? | Estado]
    const ingresoRow = [
        data.date,                          // A: Fecha
        'AUTO',                             // B: Nº Ingreso
        clientNombre,                       // C: Cliente
        data.concept,                       // D: Concepto
        data.amountStr,                     // E: Monto cobrado bruto
        currency,                           // F: Divisa (EUR, USD...)
        '',                                 // G: Medio de Pago (manual)
        factura ? 'Si' : 'No',              // H: Se factura?
        factura ? 'Pendiente' : 'Procesado' // I: Estado
    ];
    await appendRow(ENV.SHEET_NAMES.INGRESOS, ingresoRow);

    // ANALISIS CONTABLE (solo si factura = Si)
    // [Fecha | FACTURA | Nº Factura | Cliente | Pais(*) | Tipo(*) | Concepto | Base]
    // (*) cols E y F se auto-completan por VLOOKUP en el sheet
    if (factura) {
        const nroFactura = await getNextInvoiceNumber();
        const contableRow = [
            data.date,      // A: Fecha
            'Si',           // B: FACTURA
            nroFactura,     // C: Nº Factura (2026/17)
            clientNombre,   // D: Cliente
            '',             // E: Pais (VLOOKUP automático)
            '',             // F: Tipo (VLOOKUP automático)
            data.concept,   // G: Concepto
            data.amountStr  // H: Base Imponible
        ];
        await appendRow(ENV.SHEET_NAMES.ANALISIS_CONTABLE, contableRow);
    }

    const facturaMsg = factura
        ? `\n📊 _Factura ${await getNextInvoiceNumber().catch(() => '???')} → ANALISIS CONTABLE_ ✅`
        : '\n📋 _Registrado como S/F (sin factura)_';

    await safeReply(sock, message,
        `✅ *INGRESO REGISTRADO*\n💶 ${data.amountStr} ${currency}\n🏢 ${clientNombre}\n📝 ${data.concept}${facturaMsg}`
    );
}

// ─── TICKET DE SUPERMERCADO ───────────────────────────────────────────────────

export async function handleTicket(sock: WASocket, message: WAMessage, text: string) {
    await safeReact(sock, message, '🧾');

    const hasMedia = message.message?.imageMessage
        || message.message?.documentMessage
        || message.message?.documentWithCaptionMessage?.message?.documentMessage;

    if (!hasMedia) {
        await safeReply(sock, message, "📸 Por favor adjunta una foto del ticket para procesarlo.");
        return;
    }

    await safeReply(sock, message, "⏳ Leyendo el ticket... esto puede tardar unos segundos.");

    let mediaPayload: { mimeType: string; data: string } | undefined;
    try {
        const buffer = await downloadMediaMessage(message, 'buffer', {});
        const base64 = buffer.toString('base64');
        const mimeType = message.message?.imageMessage?.mimetype
            || message.message?.documentMessage?.mimetype
            || message.message?.documentWithCaptionMessage?.message?.documentMessage?.mimetype
            || 'image/jpeg';
        mediaPayload = { mimeType, data: base64 };
    } catch (e) {
        console.error('❌ Error downloading ticket image:', e);
        await safeReply(sock, message, "❌ No pude descargar la imagen. Intenta de nuevo.");
        return;
    }

    const data = await parseWithGemini('TICKET_SUPER', text, mediaPayload);

    if (!data || !data.items || data.items.length === 0) {
        await safeReply(sock, message, "🤖 No pude leer el ticket. Asegúrate de que la foto sea clara y legible.");
        return;
    }

    const date = data.date || new Date().toLocaleDateString('es-ES');
    const storeName = data.storeName || 'Supermercado';
    const totalAmount = data.totalAmount || 0;

    const gastoRow = [
        date,
        storeName,
        `Ticket supermercado — ${data.items.length} artículos`,
        String(totalAmount),
        '0%',
        '',
        '',
        'Alimentación',
        'FALSE'
    ];
    await appendRow('GASTOS', gastoRow);

    const itemNames = data.items.map((i: { product: string }) => i.product);
    const tachados = await markShoppingItemsDone(ENV.SHEET_NAMES.SHOPPING, itemNames);
    const despensaResult = await updateDespensa(ENV.SHEET_NAMES.DESPENSA, data.items, date);

    const fixosMsj = despensaResult.markedFijo > 0
        ? `\n⭐ *${despensaResult.markedFijo} ítem(s) pasaron a FIJO* (patrón detectado)`
        : '';
    const tachadosMsj = tachados.length > 0
        ? `\n✅ *De tu lista de compras:* ${tachados.join(', ')}`
        : '';

    await safeReply(sock, message,
        `🧾 *TICKET PROCESADO — ${storeName}*\n` +
        `📅 Fecha: ${date}\n` +
        `💶 Total: ${totalAmount}€\n` +
        `🛒 Artículos: ${data.items.length}\n` +
        `\n📦 *Despensa actualizada:*\n` +
        `  • Nuevos: ${despensaResult.created}\n` +
        `  • Actualizados: ${despensaResult.updated}` +
        fixosMsj +
        tachadosMsj
    );
}

// ─── EXTRACTO BANCARIO ────────────────────────────────────────────────────────

const BANK_MAP: Record<string, { bank: string; titular: string }> = {
    '1': { bank: 'BBVA', titular: 'Emiliano' },
    'BBVA': { bank: 'BBVA', titular: 'Emiliano' },
    '2': { bank: 'WISE', titular: 'Emiliano' },
    'WISE': { bank: 'WISE', titular: 'Emiliano' },
    '3': { bank: 'REVOLUT', titular: 'Marijke' },
    'REVOLUT': { bank: 'REVOLUT', titular: 'Marijke' },
    '4': { bank: 'SABADELL', titular: 'Marijke' },
    'SABADELL': { bank: 'SABADELL', titular: 'Marijke' },
    '5': { bank: 'ING', titular: 'Marijke' },
    'ING': { bank: 'ING', titular: 'Marijke' },
};

const BANK_MENU =
    `🏦 Extracto recibido. ¿De qué banco es?\n\n` +
    `1️⃣  BBVA _(Emiliano)_\n` +
    `2️⃣  WISE _(Emiliano)_\n` +
    `3️⃣  REVOLUT _(Marijke)_\n` +
    `4️⃣  SABADELL _(Marijke)_\n` +
    `5️⃣  ING _(Marijke)_\n\n` +
    `_Responde con el número o el nombre del banco_`;

// PASO 1: Descargar archivo y preguntar banco

export async function handleExtracto(sock: WASocket, message: WAMessage, text: string) {
    await safeReact(sock, message, '🏦');

    const userId = message.key.remoteJid!;
    const hasMedia = message.message?.imageMessage
        || message.message?.documentMessage
        || message.message?.documentWithCaptionMessage?.message?.documentMessage;

    if (!hasMedia) {
        await safeReply(sock, message, "📎 Adjunta el extracto bancario (PDF, Excel, imagen o CSV).");
        return;
    }

    // Descargar ahora — el link de descarga expira pronto
    let mediaPayload: { mimeType: string; data: string } | undefined;
    try {
        const buffer = await downloadMediaMessage(message, 'buffer', {});
        const base64 = buffer.toString('base64');
        const mimeType = message.message?.imageMessage?.mimetype
            || message.message?.documentMessage?.mimetype
            || message.message?.documentWithCaptionMessage?.message?.documentMessage?.mimetype
            || 'application/pdf';
        mediaPayload = { mimeType, data: base64 };
    } catch (e) {
        console.error('❌ Error downloading bank statement:', e);
        await safeReply(sock, message, "❌ No pude descargar el archivo. Intenta de nuevo.");
        return;
    }

    flowState.set(userId, {
        step: 'WAITING_FOR_INPUT',
        command: 'EXTRACTO_BANCO',
        data: { mediaPayload, text }
    });

    await safeReply(sock, message, BANK_MENU);
}

// PASO 2: Procesar con banco seleccionado por el usuario

export async function handleExtractoBanco(sock: WASocket, message: WAMessage, text: string, data: any) {
    const userId = message.key.remoteJid!;
    const match = BANK_MAP[text.trim().toUpperCase()];

    if (!match) {
        await safeReply(sock, message, `❓ No reconocí esa opción.\n\n` + BANK_MENU);
        return; // Mantiene el flowState para reintentar
    }

    const { bank: bankName, titular } = match;
    flowState.clear(userId);

    await safeReply(sock, message, `⏳ Analizando extracto de *${bankName}* (${titular})...`);

    const geminiData = await parseWithGemini('BANK_STATEMENT', data.text || '', data.mediaPayload);

    if (!geminiData || !geminiData.movements || geminiData.movements.length === 0) {
        await safeReply(sock, message, "🤖 No pude leer el extracto. Prueba con una imagen más clara o en formato PDF/CSV.");
        return;
    }

    const currency = geminiData.currency || 'EUR';
    let incomeCount = 0, expenseCount = 0, totalIncome = 0, totalExpense = 0;

    // Schema: [Fecha, Banco, Descripción, Importe, Tipo, Categoría, Moneda, Titular]
    for (const mov of geminiData.movements) {
        const row = [
            mov.date || new Date().toLocaleDateString('es-ES'),
            bankName,
            mov.description || 'Sin descripción',
            String(mov.amount || 0),
            mov.type || 'EXPENSE',
            mov.category || 'Otros',
            currency,
            titular
        ];
        await appendRow(ENV.SHEET_NAMES.MOVIMIENTOS, row);

        if (mov.type === 'INCOME') { incomeCount++; totalIncome += Number(mov.amount) || 0; }
        else { expenseCount++; totalExpense += Number(mov.amount) || 0; }
    }

    const periodStr = geminiData.periodStart && geminiData.periodEnd
        ? `${geminiData.periodStart} → ${geminiData.periodEnd}`
        : 'Período desconocido';

    await safeReply(sock, message,
        `🏦 *EXTRACTO PROCESADO*\n` +
        `🏛️ Banco: *${bankName}*\n` +
        `👤 Titular: *${titular}*\n` +
        `📅 Período: ${periodStr}\n` +
        `\n📊 *Movimientos registrados:*\n` +
        `📈 Ingresos: ${incomeCount} (${totalIncome.toFixed(2)}${currency === 'EUR' ? '€' : currency})\n` +
        `📉 Gastos: ${expenseCount} (${totalExpense.toFixed(2)}${currency === 'EUR' ? '€' : currency})\n` +
        `\n✅ *Total: ${geminiData.movements.length} movimientos* → hoja Movimientos`
    );
}
