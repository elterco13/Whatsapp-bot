import { google } from 'googleapis';
import { ENV } from '../config/env.js';

const auth = new google.auth.GoogleAuth({
    keyFile: ENV.GOOGLE_SERVICE_ACCOUNT_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = ENV.SPREADSHEET_ID;

async function clearRange() {
    console.log("🧹 Clearing blocking cells in Dashboard...");

    try {
        // Clear cells below headers to allow Query to spill
        // PENDIENTES is in D1:E1 (Header). Formula in D2 spills to D2:E15.
        // We clear D2:E20 just to be safe.

        await sheets.spreadsheets.values.clear({
            spreadsheetId: SPREADSHEET_ID,
            range: 'DASHBOARD!D2:E50'
        });

        console.log("✅ Range D2:E50 cleared. Formula should spill now.");

    } catch (e: any) {
        console.error("❌ Error clearing range:", e.message);
    }
}

clearRange();
