import {GoogleGenAI} from "@google/genai";


const MCP_URL = "http://localhost:3000/mcp";

const ai = new GoogleGenAI({apiKey: env.GEMINI_API_KEY});

// --- funzione per chiamare MCP ---
async function callMcpTool(toolName, args, progressToken = 1) {
    const body = {
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
            name: toolName,
            arguments: args,
            _meta: {progressToken}
        }
    };

    const res = await fetch(MCP_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream" // obbligatorio per MCP
        },
        body: JSON.stringify(body)
    });


    const rawText = await res.text();

    let data;
    try {
        // estrai il JSON dall'event-stream
        const match = rawText.match(/data: (.+)/);
        data = match ? JSON.parse(match[1]) : {};
    } catch (err) {
        throw new Error(`MCP response parse error: ${err.message} - raw: ${rawText}`);
    }

    if (!res.ok) {
        throw new Error(`MCP tool error: ${res.status} - ${rawText}`);
    }

// ora puoi usare data.result come prima
    return data.result?.content?.map(c => c.text).join("\n") || "";

}

// --- endpoint POST chat ---
export async function POST(request) {
    try {
        const {username, message} = await request.json();

        // 1) Prompt per far decidere a Gemini se usare un tool
        const planningPrompt = `
You are a smart assistant. User asked: "${message}".
Decide if you should use a tool.

If the user asks about weather, respond exactly:
{"tool": "get_weather", "args": {"city": "CityName"}}

If the user asks about exchange rates (e.g. "how much is 1 EUR in USD?"),
respond exactly:
{"tool": "get_exchange_rate", "args": {"from": "EUR", "to": "USD"}}

If you should answer normally, respond:
{"tool": null}.
`;


        const planResp = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: planningPrompt
        });

        let plan;
        try {
            plan = JSON.parse(planResp.text);
        } catch {
            plan = {tool: null};
        }

        // 2) Se Gemini decide di usare un tool
        let botReply = "";
        if (plan.tool === "get_weather") {
            botReply = await callMcpTool("get_weather", plan.args);
        } else if (plan.tool === "get_exchange_rate") {
            botReply = await callMcpTool("get_exchange_rate", plan.args);
        } else {
            // risposta normale del modello
            const chatResp = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: message
            });
            botReply = chatResp.text || "Mi dispiace, non ho capito.";
        }

        return new Response(JSON.stringify({reply: botReply}), {status: 200});

    } catch (err) {
        console.error("Gemini chat error:", err);
        return new Response(JSON.stringify({error: err.message}), {status: 500});
    }
}
