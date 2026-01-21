import { google } from 'googleapis';
import { ENV } from '../config/env.js';

const auth = new google.auth.GoogleAuth({
    keyFile: ENV.GOOGLE_SERVICE_ACCOUNT_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = ENV.SPREADSHEET_ID;

async function setupSheets() {
    console.log("🛠️ Starting Sheets Setup (Robust Mode)...");

    try {
        const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
        console.log(`✅ Connected to Spreadsheet: "${meta.data.properties?.title}"`);

        const existingSheets = meta.data.sheets || [];
        const existingNames = existingSheets.map(s => s.properties?.title || "");
        console.log("📑 Existing Sheets:", existingNames.join(", "));

        // Define targets with desired vs allowed names
        const targets = [
            {
                name: 'INGRESOS', headers: ["Fecha", "Nº Factura", "Cliente", "Concepto", "Base Imponible", "% IVA", "Cuota IVA", "% IRPF", "Cuota IRPF", "Total a Cobrar", "Estado"],
                data: ["", "", "", "", "", "21%", '=ARRAYFORMULA(IF(ISNUMBER(E2:E); E2:E*F2:F; ""))', "15%", '=ARRAYFORMULA(IF(ISNUMBER(E2:E); E2:E*H2:H; ""))', '=ARRAYFORMULA(IF(ISNUMBER(E2:E); E2:E+G2:G-I2:I; ""))', "Pendiente"]
            },

            {
                name: 'GASTOS', headers: ["Fecha", "Proveedor", "Concepto", "Base Imponible", "% IVA Soportado", "Cuota IVA", "Total Pagado", "Categoría", "Deducible?"],
                data: ["", "", "", "", "21%", '=ARRAYFORMULA(IF(ISNUMBER(D2:D); D2:D*E2:E; ""))', '=ARRAYFORMULA(IF(ISNUMBER(D2:D); D2:D+F2:F; ""))', "Otros", "TRUE"]
            },

            {
                name: 'DASHBOARD', headers: ["METRICA", "VALOR"],
                // Note: We'll construct the formulas referencing the ACTUAL names we find/create
                isDashboard: true
            }
        ];

        // 1. Create Missing Sheets (One by one to avoid batch failures)
        const finalNames: Record<string, string> = {}; // Map desired -> actual

        for (const target of targets) {
            // Check existence case-insensitive
            const match = existingNames.find(n => n.toLowerCase() === target.name.toLowerCase());

            if (match) {
                console.log(`ℹ️ Sheet '${match}' already exists (matches '${target.name}'). Using it.`);
                finalNames[target.name] = match;
            } else {
                console.log(`✨ Creating sheet '${target.name}'...`);
                try {
                    await sheets.spreadsheets.batchUpdate({
                        spreadsheetId: SPREADSHEET_ID,
                        requestBody: {
                            requests: [{ addSheet: { properties: { title: target.name } } }]
                        }
                    });
                    console.log(`✅ Created '${target.name}'`);
                    finalNames[target.name] = target.name;
                    // Update our local list in case we loop again (not needed here but good practice)
                    existingNames.push(target.name);
                } catch (e: any) {
                    console.error(`❌ Failed to create '${target.name}':`, e.message);
                }
            }
        }

        // 2. Update Headers & Formulas
        for (const target of targets) {
            const actualName = finalNames[target.name];
            if (!actualName) continue; // Skip if creation failed

            console.log(`📝 Updating content of '${actualName}'...`);

            let values: any[][] = [];

            if (target.isDashboard) {
                // Construct Dashboard Formulas using ACTUAL sheet names
                const Ingresos = finalNames['INGRESOS'];
                const Gastos = finalNames['GASTOS'];

                if (Ingresos && Gastos) {
                    values = [
                        target.headers,
                        ["IVA a Pagar (Trimestre)", `=SUM('${Ingresos}'!G:G) - SUMIF('${Gastos}'!I:I; TRUE; '${Gastos}'!F:F)`],
                        ["Beneficio Neto", `=SUM('${Ingresos}'!E:E) - SUM('${Gastos}'!D:D)`],
                        ["Provisión IRPF (20%)", `=B3*0.20`]
                    ];
                } else {
                    console.warn("⚠️ Skipping Dashboard formulas because INGRESOS or GASTOS keys missing.");
                    values = [target.headers, ["Error", "Missing Sheets"]];
                }
            } else {
                // INGRESOS or GASTOS
                values = [target.headers, target.data || []];
            }

            try {
                await sheets.spreadsheets.values.update({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `'${actualName}'!A1`, // Start at A1
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values }
                });
                console.log(`✅ Updated '${actualName}'`);
            } catch (e: any) {
                console.error(`❌ Failed to update '${actualName}':`, e.message);
            }
        }

        console.log("🎉 Setup Complete!");

    } catch (e: any) {
        console.error("❌ Fatal Error:", e.message);
    }
}

setupSheets();
