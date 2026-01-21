import { google } from 'googleapis';
import { ENV } from '../config/env.js';

const auth = new google.auth.GoogleAuth({
    keyFile: ENV.GOOGLE_SERVICE_ACCOUNT_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

/**
 * Appends a row to a specific sheet.
 * @param sheetName Name of the tab (e.g. 'Ideas')
 * @param rowData Array of values to append
 */
export async function appendRow(sheetName: string, rowData: string[]) {
    try {
        await sheets.spreadsheets.values.append({
            spreadsheetId: ENV.SPREADSHEET_ID,
            range: `'${sheetName}'!A:A`, // Append to the end of the sheet, quoted for safety
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
            range: `'${sheetName}'!A:Z`, // Read all columns
        });
        return response.data.values || [];
    } catch (error) {
        console.error(`❌ Error reading from ${sheetName}:`, error);
        return [];
    }
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
            range: `'${sheetName}'!${colLetter}${sheetRow}`,
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
 */
