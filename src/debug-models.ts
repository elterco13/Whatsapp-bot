import { ENV } from "./config/env.js";

const apiKey = ENV.GEMINI_API_KEY;
const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

async function listModels() {
    console.log("🔍 Checking available Gemini models...");
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`❌ HTTP Error: ${response.status} ${response.statusText}`);
            const text = await response.text();
            console.error(text);
            return;
        }
        const data = await response.json();
        console.log("✅ Available Models:");
        // @ts-ignore
        data.models.forEach((m: any) => {
            if (m.name.includes("gemini")) {
                console.log(`- ${m.name} (Methods: ${m.supportedGenerationMethods.join(", ")})`);
            }
        });
    } catch (error) {
        console.error("❌ Error fetching models:", error);
    }
}

listModels();
