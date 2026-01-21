import { google } from 'googleapis';
import { ENV } from '../config/env.js';

const auth = new google.auth.GoogleAuth({
    keyFile: ENV.GOOGLE_SERVICE_ACCOUNT_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = ENV.SPREADSHEET_ID;

async function listSheets() {
    console.log("🔍 Listing Sheet Names...");
    try {
        const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
        const titles = meta.data.sheets?.map(s => s.properties?.title) || [];
        console.log("📄 Sheets Found:", titles);

        console.log("--- ENV Config Check ---");
        console.log("ENV.TODO:", ENV.SHEET_NAMES.TODO);

        // simple heuristic check
        const match = titles.find(t => t?.toLowerCase() === ENV.SHEET_NAMES.TODO.toLowerCase());
        if (!match) {
            console.error(`⚠️ Mismatch! ENV expects '${ENV.SHEET_NAMES.TODO}' but it's not in the list.`);
        } else if (match !== ENV.SHEET_NAMES.TODO) {
            console.warn(`⚠️ Case Mismatch! ENV: '${ENV.SHEET_NAMES.TODO}', Actual: '${match}'. Google Query IS case sensitive for sheet names!`);
        } else {
            console.log("✅ Exact match found for Todo sheet.");
        }

    } catch (e: any) {
        console.error("❌ Error:", e.message);
    }
}

listSheets();
