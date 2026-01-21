import { google } from 'googleapis';
import { ENV } from '../config/env.js';

const auth = new google.auth.GoogleAuth({
    keyFile: ENV.GOOGLE_SERVICE_ACCOUNT_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = ENV.SPREADSHEET_ID;

async function updateDashboard() {
    console.log("📊 Updating Google Sheets Dashboard...");

    try {
        // 1. Define Formulas & Layout
        // We will layout the dashboard in blocks:
        // A1-B6: Financial Stats
        // D1-F10: Pending Tasks (Todos)
        // H1-J10: Next Appointments
        // L1-N10: Shopping List

        const values = [
            // Headings
            ["METRICA", "VALOR", "", "TASKS (Pendientes)", "Estado", "", "CITAS (Próximas)", "Asunto", "", "COMPRAS"],

            // Financials (Row 2) + Query Headers (Row 2 is header for Query usually, but we can put labels above)
            // Let's rely on Query headers or manual ones.
            // Row 2:
            [
                "Ingresos (Este Año)",
                `=SUMIFS(INGRESOS!E:E; INGRESOS!A:A; ">="&DATE(YEAR(TODAY());1;1))`,
                "",
                `=QUERY(${ENV.SHEET_NAMES.TODO}!A:E; "SELECT B, E WHERE E <> 'DONE' LIMIT 10"; 1)`, // D2
                "", "",
                `=QUERY(${ENV.SHEET_NAMES.APPOINTMENTS}!A:E; "SELECT B, C WHERE B >= date '"&TEXT(TODAY();"yyyy-mm-dd")&"' ORDER BY B ASC LIMIT 10"; 1)`, // H2
                "", "",
                `=QUERY(${ENV.SHEET_NAMES.SHOPPING}!A:D; "SELECT B, C WHERE D <> 'COMPRADO' AND D <> 'DONE' LIMIT 10"; 1)` // L2
            ],

            // Row 3 (Offset for arrays is difficult with direct assignment if ranges overlap.
            // QUERY returns an array. If we put it in D2, it spills down.
            // So we can't write to D3, D4 etc explicitly if we want the Query to spill.
            // We should just write the Formulas in the top cells and let them spill.
            // But 'values.update' expects a rectangular grid.
            // If we send a matrix, it overwrites.
            // Strategy: Write distinct blocks.)
        ];

        // Block 1: Financial Stats (A1:B10)
        // We'll write specific formulas in separate cells.
        const statsValues = [
            ["📊 FINANZAS", ""],
            ["Ingresos (Año)", `=SUMIFS(INGRESOS!E:E; INGRESOS!A:A; ">="&DATE(YEAR(TODAY());1;1))`],
            ["Ingresos (Mes)", `=SUMIFS(INGRESOS!E:E; INGRESOS!A:A; ">="&DATE(YEAR(TODAY());MONTH(TODAY());1); INGRESOS!A:A; "<"&DATE(YEAR(TODAY());MONTH(TODAY())+1;1))`],
            ["Gastos (Año)", `=SUMIFS(GASTOS!D:D; GASTOS!A:A; ">="&DATE(YEAR(TODAY());1;1))`],
            ["Gastos (Mes)", `=SUMIFS(GASTOS!D:D; GASTOS!A:A; ">="&DATE(YEAR(TODAY());MONTH(TODAY());1); GASTOS!A:A; "<"&DATE(YEAR(TODAY());MONTH(TODAY())+1;1))`],
            ["Neto Post-Tax (Año)", `=B2 - SUMIFS(INGRESOS!I:I; INGRESOS!A:A; ">="&DATE(YEAR(TODAY());1;1)) - B4`], // Income - IRPF - Expense
            ["IVA a Pagar (Trim)", `=SUMIFS(INGRESOS!G:G; INGRESOS!A:A; ">="&DATE(YEAR(TODAY());1;1)) - SUMIFS(GASTOS!F:F; GASTOS!A:A; ">="&DATE(YEAR(TODAY());1;1); GASTOS!I:I; TRUE)`] // Approximate Trim logic (simplifying to YTD for now or need complex Month math for Quarters)
        ];

        // Clear Dashboard first to avoid formula spill errors?
        await sheets.spreadsheets.values.clear({
            spreadsheetId: SPREADSHEET_ID,
            range: 'DASHBOARD!A1:Z50'
        });

        // Write Stats
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: 'DASHBOARD!A1',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: statsValues }
        });

        // Write Lists (using formulas that Spill)
        // PENDIENTES (D1)
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: 'DASHBOARD!D1',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [["📝 PENDIENTES", ""], [`=QUERY(${ENV.SHEET_NAMES.TODO}!A:E; "SELECT B, E WHERE E <> 'DONE' LIMIT 15"; 1)`]] }
        });

        // CITAS (H1)
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: 'DASHBOARD!H1',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [["📅 CITAS", ""], [`=QUERY(${ENV.SHEET_NAMES.APPOINTMENTS}!A:E; "SELECT B, C WHERE B >= date '"&TEXT(TODAY();"yyyy-mm-dd")&"' ORDER BY B ASC LIMIT 15"; 1)`]] }
        });

        // COMPRAS (L1)
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: 'DASHBOARD!L1',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [["🛒 COMPRAS", ""], [`=QUERY(${ENV.SHEET_NAMES.SHOPPING}!A:D; "SELECT B, C WHERE D <> 'COMPRADO' AND D <> 'DONE' LIMIT 15"; 1)`]] }
        });

        // Formatting (Optional but nice)
        const dashboardSheetId = (await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID })).data.sheets?.find(s => s.properties?.title === 'DASHBOARD')?.properties?.sheetId;
        if (dashboardSheetId !== undefined) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId: SPREADSHEET_ID,
                requestBody: {
                    requests: [
                        {
                            updateDimensionProperties: {
                                properties: { pixelSize: 180 },
                                range: { sheetId: dashboardSheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 14 },
                                fields: "pixelSize"
                            }
                        },
                        {
                            repeatCell: {
                                range: { sheetId: dashboardSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 14 },
                                cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 11 }, backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 } } },
                                fields: "userEnteredFormat(textFormat,backgroundColor)"
                            }
                        }
                    ]
                }
            });
        }

        console.log("✅ Dashboard Sheet Updated!");

    } catch (e: any) {
        console.error("❌ Error updating Dashboard:", e.message);
    }
}

updateDashboard();
