import {GoogleGenAI} from "@google/genai";

const MCP_URL = "https://mcp-ts-b-server.onrender.com/mcp";

// --- funzione generica per chiamare tool MCP ---
async function callMcpTool(toolName, args, progressToken = 1) {
    const body = {
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {name: toolName, arguments: args, _meta: {progressToken}}
    };

    const res = await fetch(MCP_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream"
        },
        body: JSON.stringify(body)
    });

    const rawText = await res.text();

    let data;
    try {
        const match = rawText.match(/data: (.+)/);
        data = match ? JSON.parse(match[1]) : JSON.parse(rawText);
    } catch (err) {
        throw new Error(`MCP response parse error: ${err.message} - raw: ${rawText}`);
    }

    if (!res.ok) {
        throw new Error(`MCP tool error: ${res.status} - ${rawText}`);
    }

    if (!data.result?.content) {
        console.warn("[WARN] MCP result empty or content missing:", data);
        return "";
    }

    return data.result.content.map(c => c.text).join("\n");
}

// --- fetch lista tool disponibili ---
// --- fetch lista tool disponibili ---
async function getAvailableTools() {
    const body = {jsonrpc: "2.0", id: Date.now(), method: "tools/list", params: {}};
    const res = await fetch(MCP_URL, {
        method: "POST",
        headers: {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"},
        body: JSON.stringify(body)
    });
    const rawText = await res.text();
    let data;
    try {
        const match = rawText.match(/data: (.+)/);
        data = match ? JSON.parse(match[1]) : JSON.parse(rawText);
    } catch (err) {
        console.error("Error parsing tools/list:", err, rawText);
        return [];
    }

    const tools = data.result?.tools || [];
    console.log("[DEBUG] Tools available:", tools.map(t => t.name).join(", ") || "none");

    return tools;
}


// --- endpoint chat ---
export async function POST(request, env) {
    try {
        const {username, message} = await request.json();
        const ai = new GoogleGenAI({apiKey: env.GEMINI_API_KEY});

        // --- recupera tool disponibili dal server MCP ---
        const availableTools = await getAvailableTools();

        // --- costruzione prompt dinamico ---
        const toolsInfo = availableTools.map(t => {
            return `NAME: ${t.name}
DESCRIPTION: ${t.description || ""}
INPUT_SCHEMA: ${JSON.stringify(t.inputSchema)}`;
        }).join("\n\n");

        const planningPrompt = `
You are an intelligent assistant. User asked: "${message}".

Available tools (name, description, inputSchema as JSON):
${toolsInfo}

INSTRUCTIONS:
1) If you choose to use a tool, respond EXACTLY as JSON:
   {"tool": "<tool_name>", "args": { ... }}
2) The args object MUST have keys that match EXACTLY the inputSchema property names for the chosen tool.
3) Ensure all required properties listed in the inputSchema are present and of the correct type.
   If any required property is missing or ambiguous, do NOT call the tool: respond with
   {"tool": null, "need": ["prop1","prop2"], "question": "..."}
4) If no tool is needed, respond: {"tool": null}
5) ALWAYS produce valid JSON only.
            `;

        // --- Gemini decide se usare un tool ---
        const planResp = await ai.models.generateContent({model: "gemini-2.5-flash", contents: planningPrompt});
        let plan;
        try {
            plan = JSON.parse(planResp.text);
        } catch {
            plan = {tool: null};
        }

        // --- validazione lato Worker ---
        if (plan.tool) {
            const selectedTool = availableTools.find(t => t.name === plan.tool);
            if (!selectedTool) throw new Error(`Tool ${plan.tool} non trovato`);

            const required = selectedTool.inputSchema?.required || [];
            const missing = required.filter(k => !(plan.args && Object.prototype.hasOwnProperty.call(plan.args, k)));
            if (missing.length > 0) {
                const question = `Mi servono queste informazioni per eseguire ${plan.tool}: ${missing.join(", ")}. Puoi fornirle?`;
                return new Response(JSON.stringify({reply: question}), {
                    status: 200,
                    headers: {"Content-Type": "application/json"}
                });
            }

            // --- chiama MCP se tutto ok ---
            const botReply = await callMcpTool(plan.tool, plan.args);

            // Prompt secondario per Gemini
            const followUpPrompt = `
Ho ricevuto questa risposta dal tool: "${botReply}"
Riformula in modo più chiaro e conciso per l'utente.
                `;

            const refinedResp = await ai.models.generateContent({model: "gemini-2.5-flash", contents: followUpPrompt});
            return new Response(JSON.stringify({reply: refinedResp.text}), {
                status: 200,
                headers: {"Content-Type": "application/json"}
            });
        }

        // --- risposta normale del modello ---
        const chatResp = await ai.models.generateContent({model: "gemini-2.5-flash", contents: message});
        return new Response(JSON.stringify({reply: chatResp.text || "Mi dispiace, non ho capito."}), {
            status: 200,
            headers: {"Content-Type": "application/json"}
        });

    } catch (err) {
        console.error("Gemini chat error:", err);
        return new Response(JSON.stringify({error: err.message}), {
            status: 500,
            headers: {"Content-Type": "application/json"}
        });
    }
}
