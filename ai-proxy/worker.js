// Cloudflare Worker that proxies the e-learning AI assistant to Google Gemini.
// The API key lives only in the Worker's secret store (GEMINI_API_KEY), never in the page.
//
// Secrets / variables (Cloudflare dashboard → Worker → Settings → Variables):
//   GEMINI_API_KEY   secret, required
//   ALLOWED_ORIGINS  comma-separated, e.g. "https://elearning.safetyacademia.ge,https://safetyacademiacollege.github.io"
//   GEMINI_MODEL     optional, default "gemini-2.0-flash"

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0] || "null",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };
    const reply = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return reply({ error: "Use POST." }, 405);
    if (!allowed.includes(origin)) return reply({ error: "Origin not allowed." }, 403);

    let input;
    try {
      input = await request.json();
    } catch {
      return reply({ error: "Invalid request." }, 400);
    }
    const message = String(input.message || "").trim().slice(0, 2000);
    const lesson = String(input.lesson || "General").slice(0, 200);
    if (!message) return reply({ error: "Empty message." }, 400);

    const model = env.GEMINI_MODEL || "gemini-2.0-flash";
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: `You are Safety Academia's AI assistant for occupational safety training. Current lesson: "${lesson}". ` +
              "Always reply in the language the user writes in. Be concise and practical. " +
              "Do not invent legal requirements; say when the learner should check the regulation or ask their instructor.",
          }],
        },
        contents: [{ role: "user", parts: [{ text: message }] }],
        generationConfig: { maxOutputTokens: 800, temperature: 0.4 },
      }),
    });
    if (!r.ok) return reply({ error: "The AI service is unavailable. Try again later." }, 502);
    const d = await r.json();
    const text = d?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    return reply({ reply: text });
  },
};
