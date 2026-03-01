import { GoogleGenerativeAI } from "@google/generative-ai";
import { ENV } from "../config/env.js";

const genAI = new GoogleGenerativeAI(ENV.GEMINI_API_KEY);

export async function parseWithGemini(
    command: string,
    text: string,
    mediaPayload?: { mimeType: string; data: string }
) {
    // We use the flash model for speed and cost effectiveness
    // Updated to gemini-2.0-flash based on user's available models
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const currentContext = `
    Current Date: ${new Date().toISOString()}
    Current Locale: es-ES
    Currencies: USD, EUR, ARS
    `;

    let systemInstruction = "";

    switch (command) {
        case 'IDEA':
            systemInstruction = `Extract idea details. JSON: { "summary": "short title", "details": "long description", "tags": ["tag1", "tag2"] }`;
            break;
        case 'SHOPPING':
            systemInstruction = `Extract shopping items. JSON: { "items": [{ "product": "name", "quantity": "amount", "category": "Food/Home/etc" }] }`;
            break;
        case 'RECIPE':
            systemInstruction = `Extract recipe info. JSON: { "title": "name", "ingredients": ["item1"], "steps": ["step1"], "prepTime": "10m", "tags": ["vegan?"] }`;
            break;
        case 'APPOINTMENT':
            systemInstruction = `You are a calendar assistant for a Spanish user. Extract appointment details from the text.
            Return ONLY valid JSON, no markdown:
            {
                "summary": "string (event title/subject) — null if not mentioned",
                "start": "ISO8601 with timezone (e.g. 2026-03-05T17:00:00+01:00) — null if date not mentioned",
                "end": "ISO8601 with timezone (default: start + 1 hour)",
                "location": "string or null",
                "description": "string or null"
            }
            Rules:
            - Today is ${new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            - Use +01:00 for winter (Oct–Mar), +02:00 for summer (Apr–Sep) in Spain
            - Interpret relative dates: "mañana", "el lunes", "la semana que viene", "en 3 días", etc.
            - If time is not specified, default to 09:00
            - If summary or start cannot be determined, set them to null
            - NEVER invent dates. If date is ambiguous, set start to null`;
            break;
        case 'FINANCE':
            systemInstruction = `
            You are an accounting assistant for a Spanish freelancer.
            Extract financial data from the text or image.
            
            JSON Output Schema:
            {
                "type": "INCOME" | "EXPENSE",
                "date": "DD/MM/YYYY" (today if unspecified),
                "concept": "string",
                "amount": number (The BASE amount. See rules below),
                "currency": "EUR" | "USD" (Default EUR),
                "isInvoice": boolean (TRUE if user explicitly says 'factura' or '/factura'. FALSE otherwise),
                "ivaRate": number (If isInvoice=true, default 0.21. If isInvoice=false, MUST be 0),
                "irpfRate": number (If isInvoice=true, default 0.15. If isInvoice=false, MUST be 0),
                "entity": "string",
                "category": "string",
                "isDeductible": boolean,
                "missingInfo": string | null
            }

            Rules:
            1. INVOICE CHECK: Look for the word "factura" or "/factura" in the text.
               - IF PRESENT -> "isInvoice": true. Apply tax logic (IVA 21%, IRPF 15% default).
               - IF ABSENT -> "isInvoice": false. "ivaRate": 0, "irpfRate": 0. "amount" is the full value provided.
            
            2. AMOUNT LOGIC (Only if isInvoice=true):
               - "1000€ + IVA" -> Base = 1000.
               - "1000€ IVA incluido" -> Base = 1000 / 1.21 = 826.45.
               - "1000€" (ambiguous) -> Base = 1000 (ask in missingInfo if unsure, but implied Base if +IVA/incl is missing).
            
            3. AMOUNT LOGIC (If isInvoice=false):
               - "1000€" -> Base = 1000. (No tax calculations).
            
            4. INCOME vs EXPENSE:
               - "Ingreso", "Cobro", "Factura a client" -> INCOME.
               - "Gasto", "Pago", "Factura de proveedor" -> EXPENSE.
            `;
            break;
        case 'TODO':
            systemInstruction = `Extract task. JSON: { "task": "title", "priority": "High/Normal", "deadline": "ISO8601 or null" }`;
            break;
        case 'TICKET_SUPER':
            systemInstruction = `
            You are an expert OCR and data extraction assistant. Analyze the supermarket receipt image or text.
            
            Extract ALL line items from the ticket. Return ONLY valid JSON, no markdown:
            {
                "storeName": "string (e.g. Mercadona, Carrefour, Lidl)",
                "date": "DD/MM/YYYY (today if unreadable)",
                "totalAmount": number (total amount paid),
                "items": [
                    {
                        "product": "string (product name, clean and readable)",
                        "brand": "string or null",
                        "quantity": number (default 1),
                        "unit": "string (ud, kg, L, etc.) or null",
                        "unitPrice": number,
                        "totalPrice": number,
                        "category": "string (Lácteos, Carne, Verdura, Limpieza, Higiene, Bebidas, Panadería, Congelados, Conservas, Otros)"
                    }
                ]
            }
            
            Rules:
            - Include every line item, even small ones (bags, coins back, etc.)
            - If the product name is abbreviated, expand it to a readable form
            - For weight-based items (e.g. cheese per kg), calculate totalPrice correctly
            - If an item has a discount, use the final price paid
            - category must be one of the listed options
            `;
            break;
        case 'BANK_STATEMENT':
            systemInstruction = `
            You are an expert financial data extraction assistant. Analyze the bank statement document, image, PDF or CSV provided.
            This may be from any Spanish or international bank (BBVA, Santander, CaixaBank, ING, Revolut, Wise, etc.)
            
            Return ONLY valid JSON, no markdown:
            {
                "accountName": "string (bank name or account label)",
                "currency": "EUR" | "USD" | "GBP" (default EUR),
                "periodStart": "DD/MM/YYYY or null",
                "periodEnd": "DD/MM/YYYY or null",
                "movements": [
                    {
                        "date": "DD/MM/YYYY",
                        "description": "string (clean, human-readable description)",
                        "amount": number (always positive),
                        "type": "INCOME" | "EXPENSE",
                        "category": "string (Nómina, Freelance, Alquiler, Supermercado, Restaurante, Transporte, Suscripciones, Transferencia, Seguros, Servicios, Impuestos, Otros)"
                    }
                ]
            }
            
            Rules:
            - Debits/charges/payments → EXPENSE
            - Credits/deposits/received transfers → INCOME
            - amount is ALWAYS a positive number (type determines direction)
            - Infer category from the description intelligently
            - If the document has multiple pages or accounts, process all of them
            - Skip balance rows or header/footer rows that are not actual movements
            `;
            break;
    }

    const payload = [
        `System: ${systemInstruction}`,
        `Context: ${currentContext}`,
        `User Input: "${text}"`
    ];

    if (mediaPayload) {
        // @ts-ignore
        payload.push({ inlineData: mediaPayload });
    }

    try {
        console.log(`🤖 Sending to Gemini (${command}):`, JSON.stringify(payload).slice(0, 200) + '...');
        const result = await model.generateContent(payload);
        const response = result.response.text();
        console.log("🤖 Raw Response:", response);

        // Robust JSON extraction
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error("❌ No JSON found in response");
            return null;
        }

        const jsonStr = jsonMatch[0];
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error("❌ Gemini Error Details:", JSON.stringify(e, null, 2));
        console.error("❌ Gemini Error Message:", e);
        return null;
    }
}
