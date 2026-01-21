import { google } from 'googleapis';
import { ENV } from '../config/env.js';

const auth = new google.auth.GoogleAuth({
    keyFile: ENV.GOOGLE_SERVICE_ACCOUNT_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = ENV.SPREADSHEET_ID;

async function restorePending() {
    console.log("🔧 Restoring 'PENDIENTES' Formula...");

    try {
        // PENDIENTES (Default Location: D1 header, D2 formula)
        // Formula: Query TODO sheet

        // 1. Clear the area first to prevent "Spill" errors and remove junk
        // We clear starting from D2 downwards. Formula goes in D2.
        await sheets.spreadsheets.values.clear({
            spreadsheetId: SPREADSHEET_ID,
            range: 'DASHBOARD!D2:E30'
        });

        // 2. Write Header (D1) and Formula (D2)
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: 'DASHBOARD!D1',
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [
                    ["📝 PENDIENTES", ""], // Header Row
                    [`=QUERY(${ENV.SHEET_NAMES.TODO}!A:E; "SELECT B, E WHERE E <> 'DONE' LIMIT 15"; 1)`] // Formula Row
                ]
            }
        });

        console.log("✅ 'PENDIENTES' Formula Restored in Column D!");

    } catch (e: any) {
        console.error("❌ Error restoring formula:", e.message);
    }
}

restorePending();
