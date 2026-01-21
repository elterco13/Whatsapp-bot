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
            systemInstruction = `Extract event details. JSON: { "summary": "title", "start": "ISO8601", "end": "ISO8601", "location": "string", "missingMap": ["start"?] }. If date is missing, include 'start' in missingMap. Default duration 1h.`;
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
