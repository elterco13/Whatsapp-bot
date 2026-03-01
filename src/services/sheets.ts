import { google } from 'googleapis';
import { ENV } from '../config/env.js';

const auth = new google.auth.GoogleAuth({
    keyFile: ENV.GOOGLE_SERVICE_ACCOUNT_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

/**
 * Returns a safe range prefix for a sheet name.
 * Only wraps in single quotes if the name contains spaces or special chars.
 */
function sheetRange(name: string, range: string): string {
    const needsQuotes = /[\s\-\(\)']/.test(name);
    const prefix = needsQuotes ? `'${name}'` : name;
    return `${prefix}!${range}`;
}

/**
 * Appends a row to a specific sheet.
 * @param sheetName Name of the tab (e.g. 'Ideas')
 * @param rowData Array of values to append
 */
export async function appendRow(sheetName: string, rowData: string[]) {
    try {
        await sheets.spreadsheets.values.append({
            spreadsheetId: ENV.SPREADSHEET_ID,
            range: sheetRange(sheetName, 'A:A'),
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [rowData],
            },
        });
        console.log(`✅ Row added to ${sheetName}`);
        return true;
    } catch (error) {
        console.error(`❌ Error appending to ${sheetName}:`, error);
        return false;
    }
}

/**
 * Reads all rows from a specific sheet.
 * @param sheetName Name of the tab
 */
export async function readSheet(sheetName: string) {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: ENV.SPREADSHEET_ID,
            range: sheetRange(sheetName, 'A:Z'),
        });
        return response.data.values || [];
    } catch (error) {
        console.error(`❌ Error reading from ${sheetName}:`, error);
        return [];
    }
}

// ─── CLIENTES ─────────────────────────────────────────────────────────────────

export interface Cliente {
    id: string;
    nombre: string;
    razonSocial: string;
    pais: string;
    tipo: string; // B2B | B2C
}

export async function readClientes(): Promise<Cliente[]> {
    const rows = await readSheet(ENV.SHEET_NAMES.CLIENTES);
    if (!rows || rows.length < 2) return [];
    // Row 0 = headers; skip it
    return rows.slice(1).map(row => ({
        id: row[0] || '',
        nombre: row[1] || '',
        razonSocial: row[2] || '',
        pais: row[5] || 'es',
        tipo: row[6] || 'B2B',
    })).filter(c => c.nombre || c.razonSocial);
}

/** Fuzzy-match: returns clients whose nombre or razonSocial contains the query */
export function matchCliente(clientes: Cliente[], query: string): Cliente[] {
    const q = query.toLowerCase().trim();
    return clientes.filter(c =>
        c.nombre.toLowerCase().includes(q) ||
        c.razonSocial.toLowerCase().includes(q) ||
        q.includes(c.nombre.toLowerCase()) ||
        q.includes(c.razonSocial.toLowerCase())
    );
}

/**
 * Gets the next invoice number for ANALISIS CONTABLE in format YYYY/NN
 * Reads col C (index 2) of existing rows, finds max N for current year, returns N+1
 */
export async function getNextInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const rows = await readSheet(ENV.SHEET_NAMES.ANALISIS_CONTABLE);
    let maxN = 0;
    for (const row of rows.slice(1)) { // skip header row
        const cell = (row[2] || '').trim(); // col C = Nº Factura
        const match = cell.match(/^(\d{4})\/(\d+)$/);
        if (match && parseInt(match[1]) === year) {
            maxN = Math.max(maxN, parseInt(match[2]));
        }
    }
    return `${year}/${String(maxN + 1).padStart(2, '0')}`;
}


/**
 * Searches for a row where 'searchColIndex' contains 'searchText' and updates 'targetColIndex' with 'newValue'.
 * Returns the updated row content or null if not found.
 */
export async function updateRowStatus(
    sheetName: string,
    searchText: string,
    newValue: string = "DONE",
    searchColIndex: number = 1, // Default: Column B (Item/Task)
    targetColIndex: number = 3  // Default: Column D (Status) for Shopping/Todo? Need to verify schemas.
) {
    try {
        const rows = await readSheet(sheetName);
        const rowIndex = rows.findIndex(row => {
            const cell = row[searchColIndex];
            return cell && typeof cell === 'string' && cell.toLowerCase().includes(searchText.toLowerCase());
        });

        if (rowIndex === -1) return null;

        // Row Index is 0-based from data. Sheets is 1-based.
        // If data includes header, Row 0 is Header. 
        // If readSheet returns detailed range, checking... readSheet returns values. 
        // rowIndex 0 in 'values' = Row 1 in Sheet.
        // So update Range is rowIndex + 1.

        const sheetRow = rowIndex + 1;

        // Convert targetColIndex to Letter (0=A, 1=B, etc.)
        // Simple helper for single letter columns
        const colLetter = String.fromCharCode(65 + targetColIndex);

        await sheets.spreadsheets.values.update({
            spreadsheetId: ENV.SPREADSHEET_ID,
            range: sheetRange(sheetName, `${colLetter}${sheetRow}`),
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[newValue]]
            }
        });

        return rows[rowIndex][searchColIndex]; // Return the item name found
    } catch (error) {
        console.error(`❌ Error updating ${sheetName}:`, error);
        return null;
    }
}

/**
 * Schemas for reference (Documentation only, not enforced by code strictly yet)
 * 
 * IDEAS: [Date, Idea, Tags]
 * SHOPPING: [Date, Item, Quantity, Status]
 * RECIPES: [Date, Title, Link, Ingredients, Steps, Tags]
 * TODO: [Date, Task, Priority, Deadline, Status]
 * FINANCE: [Date, Type, Description, Amount, Currency, EUR Amount, Category, Invoice]
 * APPOINTMENTS: [Date Created, Appointment Date, Summary, Location, Status]
 * DESPENSA: [Producto, Marca, Categoría, Precio Promedio, Última Compra, Frecuencia, Tipo]
 * MOVIMIENTOS: [Fecha, Cuenta, Descripción, Importe, Tipo, Categoría, Origen]
 */

/**
 * Updates the DESPENSA sheet with items from a supermarket ticket.
 * - Creates new rows for new items
 * - Increments frequency and updates average price for existing items
 * - Marks items as FIJO when frequency >= 3
 * @returns Object with counts: { created, updated, markedFijo }
 */
export async function updateDespensa(
    sheetName: string,
    items: Array<{
        product: string;
        brand?: string | null;
        category?: string;
        unitPrice: number;
        quantity: number;
    }>,
    purchaseDate: string
): Promise<{ created: number; updated: number; markedFijo: number }> {
    const result = { created: 0, updated: 0, markedFijo: 0 };

    try {
        const rows = await readSheet(sheetName);
        // Schema: [Producto, Marca, Categoría, Precio Promedio, Última Compra, Frecuencia, Tipo]
        // Col:      A          B       C           D                E              F           G
        // rows[0] = header row, data starts at rows[1]
        const dataRows = rows.slice(1);

        // Build a map of existing items (lowercased product name → row index in sheet)
        const existingMap = new Map<string, { sheetRowNum: number; avgPrice: number; frequency: number }>();
        dataRows.forEach((row, idx) => {
            const productName = row[0]?.toLowerCase().trim();
            if (productName) {
                existingMap.set(productName, {
                    sheetRowNum: idx + 2, // +1 for 0-index, +1 for header
                    avgPrice: parseFloat(row[3]) || 0,
                    frequency: parseInt(row[5]) || 0,
                });
            }
        });

        for (const item of items) {
            const productKey = item.product.toLowerCase().trim();
            const existing = existingMap.get(productKey);

            if (existing) {
                // Update existing row
                const newFrequency = existing.frequency + 1;
                // Weighted moving average: ((oldAvg * oldFreq) + newPrice) / newFreq
                const newAvgPrice = ((existing.avgPrice * existing.frequency) + item.unitPrice) / newFrequency;
                const tipo = newFrequency >= 3 ? 'FIJO' : 'OCASIONAL';

                if (newFrequency >= 3 && existing.frequency < 3) {
                    result.markedFijo++;
                }

                const colLetter = (col: number) => String.fromCharCode(65 + col);
                const r = existing.sheetRowNum;

                await sheets.spreadsheets.values.batchUpdate({
                    spreadsheetId: ENV.SPREADSHEET_ID,
                    requestBody: {
                        valueInputOption: 'USER_ENTERED',
                        data: [
                            { range: sheetRange(sheetName, `D${r}`), values: [[newAvgPrice.toFixed(2)]] },
                            { range: sheetRange(sheetName, `E${r}`), values: [[purchaseDate]] },
                            { range: sheetRange(sheetName, `F${r}`), values: [[String(newFrequency)]] },
                            { range: sheetRange(sheetName, `G${r}`), values: [[tipo]] },
                        ]
                    }
                });

                result.updated++;
            } else {
                // Create new row
                const newRow = [
                    item.product,
                    item.brand || '',
                    item.category || 'Otros',
                    item.unitPrice.toFixed(2),
                    purchaseDate,
                    '1',
                    'OCASIONAL'
                ];
                const ok = await appendRow(sheetName, newRow);
                if (ok) result.created++;
                else console.warn(`⚠️ Despensa: could not create row for "${item.product}". Sheet may not exist.`);
            }
        }
    } catch (error) {
        console.error(`❌ Error updating despensa:`, error);
    }

    return result;
}

/**
 * Marks shopping list items as COMPRADO if they match any of the purchased items.
 * Returns list of item names that were matched and updated.
 */
export async function markShoppingItemsDone(
    sheetName: string,
    purchasedItems: string[]
): Promise<string[]> {
    const matched: string[] = [];
    try {
        const rows = await readSheet(sheetName);
        // Schema: [Date, Item, Quantity, Status]
        // Col:      A      B     C         D (index 3)

        for (let i = 1; i < rows.length; i++) { // skip header
            const itemCell = rows[i][1]?.toLowerCase().trim();
            const statusCell = rows[i][3]?.toLowerCase();

            if (!itemCell || statusCell === 'comprado') continue;

            const isMatch = purchasedItems.some(p =>
                p.toLowerCase().includes(itemCell) || itemCell.includes(p.toLowerCase())
            );

            if (isMatch) {
                const sheetRowNum = i + 1; // 1-indexed + header offset
                await sheets.spreadsheets.values.update({
                    spreadsheetId: ENV.SPREADSHEET_ID,
                    range: sheetRange(sheetName, `D${sheetRowNum}`),
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: [['Comprado']] }
                });
                matched.push(rows[i][1]);
            }
        }
    } catch (error) {
        console.error(`❌ Error marking shopping items:`, error);
    }
    return matched;
}

