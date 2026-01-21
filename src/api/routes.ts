import { Router } from 'express';
import { readSheet } from '../services/sheets.js';
import { ENV } from '../config/env.js';

const router = Router();

// Helper to parse dates DD/MM/YYYY or YYYY-MM-DD
function parseDate(dateStr: string) {
    if (!dateStr) return new Date(0);
    // Try timestamp
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;

    // Try DD/MM/YY or DD/MM/YYYY parts
    const parts = dateStr.split(/[-/]/);
    if (parts.length === 3) {
        // Assume DD/MM/YYYY if first part is small
        // But Google Sheets usually saves as what locale? 
        // We set locale es-ES in setupSheets formulas, but values depends on input.
        // Let's guess: Day is likely first.
        return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    }
    return new Date(0);
}

function parseAmount(val: string) {
    if (!val) return 0;
    // Remove currency symbols, commas if European decimal?
    // Google Sheets API returns unformatted values if we used valueRenderOption, but readSheet uses default (FORMATTED_VALUE).
    // Let's handle "1.000,00 €" vs "1000.00"
    const clean = val.replace(/[€$]/g, '').trim();
    // If it has comma and dot, assume dot is thousands sep if comma is later? 
    // Simplify: replace all non-numeric-dot-comma.
    // Actually, let's assume standard format for now or check if API returns number.
    // readSheet uses default which returns strings.
    // Let's remove spaces. Replace comma with dot if it looks like decimal.
    const normalized = clean.replace(/\./g, '').replace(',', '.');
    return parseFloat(normalized) || 0;
}

router.get('/data', async (req, res) => {
    try {
        // We read specific new sheets for Finance
        // And old sheets (ENV name might be 'FINANCE' but we want 'INGRESOS'/'GASTOS')

        const [ideas, shopping, recipes, todos, appointments, ingresos, gastos] = await Promise.all([
            readSheet(ENV.SHEET_NAMES.IDEAS),
            readSheet(ENV.SHEET_NAMES.SHOPPING),
            readSheet(ENV.SHEET_NAMES.RECIPES),
            readSheet(ENV.SHEET_NAMES.TODO),
            readSheet(ENV.SHEET_NAMES.APPOINTMENTS),
            readSheet('INGRESOS'),
            readSheet('GASTOS')
        ]);

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        // --- Calculate Financial Stats ---
        let incomeMonth = 0;
        let incomeYear = 0;
        let incomeAfterTaxMonth = 0;
        let incomeAfterTaxYear = 0;

        let expenseMonth = 0;
        let expenseYear = 0;

        // Skip Header (Row 0)
        ingresos.slice(1).forEach(row => {
            // SetupSheets INGRESOS: [Fecha, Invoice, Client, Cop, Base(4), IVA, Cuota, IRPF, CuotaIRPF(8), Total, ... ]
            const date = parseDate(row[0]);
            const base = parseAmount(row[4]);
            const irpfQuota = parseAmount(row[8]); // Assuming Col I is Index 8

            if (date.getFullYear() === currentYear) {
                incomeYear += base;
                incomeAfterTaxYear += (base - irpfQuota);

                if (date.getMonth() === currentMonth) {
                    incomeMonth += base;
                    incomeAfterTaxMonth += (base - irpfQuota);
                }
            }
        });

        gastos.slice(1).forEach(row => {
            // SetupSheets GASTOS: [Fecha, Prov, Concept, Base(3), ... ]
            const date = parseDate(row[0]);
            const base = parseAmount(row[3]);

            if (date.getFullYear() === currentYear) {
                expenseYear += base;
                if (date.getMonth() === currentMonth) {
                    expenseMonth += base;
                }
            }
        });

        // --- Filter Lists ---
        // TODO: Filter only pending?
        const pendingTodos = todos.slice(1).filter(row => row[4]?.trim().toUpperCase() !== 'DONE');
        const pendingShopping = shopping.slice(1).filter(row => row[3]?.trim().toUpperCase() !== 'COMPRADO' && row[3]?.trim().toUpperCase() !== 'DONE');

        // APPOINTMENTS: [Created, Date, Summary, ...]
        // Filter future appointments
        const futureAppointments = appointments.slice(1).filter(row => {
            const d = parseDate(row[1]); // Appointment Date
            return d >= new Date(now.setHours(0, 0, 0, 0));
        }).sort((a, b) => parseDate(a[1]).getTime() - parseDate(b[1]).getTime());

        res.json({
            stats: {
                incomeMonth,
                incomeYear,
                expenseMonth,
                expenseYear,
                netMonth: incomeMonth - expenseMonth, // Before Tax Benefit
                netYear: incomeYear - expenseYear,
                incomeAfterTaxMonth, // "Ingresos luego de impuestos"
                incomeAfterTaxYear
            },
            lists: {
                todos: pendingTodos,
                shopping: pendingShopping,
                appointments: futureAppointments,
                ideas: ideas.slice(1)
            }
        });
    } catch (error) {
        console.error("Dashboard Data Error:", error);
        res.status(500).json({ error: "Failed to fetch data" });
    }
});

export default router;
