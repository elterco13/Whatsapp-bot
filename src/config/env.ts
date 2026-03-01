import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const ENV = {
    // API Keys
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',

    // Google Credentials
    GOOGLE_SERVICE_ACCOUNT_PATH: process.env.GOOGLE_SERVICE_ACCOUNT_PATH || path.join(process.cwd(), 'service-account.json'),
    SPREADSHEET_ID: process.env.GOOGLE_SPREADSHEET_ID || '',
    CALENDAR_ID: process.env.GOOGLE_CALENDAR_ID || 'primary',

    // Sheet Tabs (Nombres de las pestañas en Google Sheets)
    SHEET_NAMES: {
        IDEAS: 'Ideas',
        SHOPPING: 'Compras',
        RECIPES: 'Recetas',
        TODO: 'Todo',
        APPOINTMENTS: 'Citas',
        GASTOS: 'GASTOS',
        GASTOS_FIJOS: 'GASTOS FIJOS',
        INGRESOS: 'INGRESOS',
        DESPENSA: 'Despensa',
        MOVIMIENTOS: 'Movimientos',
        ANALISIS_CONTABLE: 'ANALISIS CONTABLE',
        CLIENTES: 'CLIENTES'
    },

    // Permitted chats (if empty, allows all)
    ALLOWED_CHATS: (process.env.ALLOWED_CHATS || '').split(',').map(id => id.trim()).filter(id => id.length > 0)
};

// Simple validation
if (!ENV.GEMINI_API_KEY) {
    console.warn("⚠️ Warning: GEMINI_API_KEY is not set in .env");
}
if (!ENV.SPREADSHEET_ID) {
    console.warn("⚠️ Warning: GOOGLE_SPREADSHEET_ID is not set in .env");
}
