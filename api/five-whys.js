// Vercel serverless function: AI coach for the 5 Whys investigation tool.
// The Anthropic API key lives only here, in the ANTHROPIC_API_KEY environment variable.
//
// POST /api/five-whys
//   { "mode": "ping" }                                   -> { ok: true }
//   { "mode": "coach",   "investigation": {...}, "index": n } -> feedback on why #n
//   { "mode": "summary", "investigation": {...} }        -> root cause + CAPA draft

import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5-5";
const MAX_BODY_CHARS = 20000;

const client = new Anthropic(); // reads ANTHROPIC_API_KEY

const SYSTEM = `You are a senior occupational safety and health (OSH) incident investigator coaching someone through a 5 Whys root cause analysis.

Principles you apply:
- Investigations look for system failures, not people to blame. "Human error", "carelessness", "didn't pay attention" or "didn't follow the procedure" are starting points for another why, never root causes. Ask what made the error likely or the violation normal.
- Each why must be a factual cause of the statement above it, supported by evidence (observation, records, interviews, photos, measurements). Unverified answers are assumptions and must be flagged.
- A root cause is reached when it sits in the organization's management system (planning, procedures, training, supervision, maintenance, design, procurement, resourcing, culture, change management), is within the organization's control, and fixing it would prevent recurrence across similar tasks, not only this event.
- Corrective and preventive actions follow the hierarchy of controls (ISO 45001 clause 8.1.2): elimination, substitution, engineering controls, administrative controls, PPE. Prefer higher-order controls and say so when the plan relies only on training, signage, reminders or PPE.
- Actions must be specific, owned by a role (never a named individual), dated, and have a way to verify effectiveness.

Write in plain, direct English that a supervisor on the shop floor would understand. Be concise. Do not invent facts that are not in the investigation; when information is missing, say what to find out.`;

const COACH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["assessment", "issues", "next_question", "evidence_to_collect", "root_cause_reached"],
  properties: {
    assessment: { type: "string", description: "One to three sentences on the quality of this why answer." },
    issues: { type: "array", items: { type: "string" }, description: "Specific problems: blame, vagueness, logic gaps, unsupported claims. Empty if none." },
    next_question: { type: "string", description: "The sharpest next 'why' question to ask, or a better rewording of the answer if it needs fixing first." },
    evidence_to_collect: { type: "array", items: { type: "string" }, description: "Evidence that would confirm or refute this answer." },
    root_cause_reached: { type: "boolean", description: "True only if this answer is a systemic, controllable management-system cause." },
  },
};

const SUMMARY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["problem_statement", "root_cause", "root_cause_category", "contributing_factors", "chain_gaps", "actions", "lessons_learned"],
  properties: {
    problem_statement: { type: "string", description: "Clear, factual problem statement: what, where, when, consequence." },
    root_cause: { type: "string", description: "Root cause statement at management-system level." },
    root_cause_category: {
      type: "string",
      enum: ["Procedures / work methods", "Training / competence", "Supervision", "Equipment / design", "Maintenance / inspection", "Communication", "Planning / resourcing", "Management of change", "Work environment", "Safety culture / leadership", "Contractor management", "Other"],
    },
    contributing_factors: { type: "array", items: { type: "string" } },
    chain_gaps: { type: "array", items: { type: "string" }, description: "Weak links, assumptions, or missing evidence in the why chain. Empty if solid." },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "control_level", "type", "owner_role", "timeframe", "verification"],
        properties: {
          description: { type: "string" },
          control_level: { type: "string", enum: ["Elimination", "Substitution", "Engineering", "Administrative", "PPE"] },
          type: { type: "string", enum: ["Corrective", "Preventive"] },
          owner_role: { type: "string" },
          timeframe: { type: "string", description: "e.g. 'Immediate', '30 days', '90 days'" },
          verification: { type: "string", description: "How effectiveness will be checked." },
        },
      },
    },
    lessons_learned: { type: "string" },
  },
};

function cors(req, res) {
  const allowed = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.origin;
  if (origin && (allowed.length === 0 || allowed.includes(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  return !origin || allowed.length === 0 || allowed.includes(origin);
}

function describe(inv) {
  const d = inv.details || {};
  const whys = (inv.whys || [])
    .map((w, i) => `Why ${i + 1}: ${w.answer || "(blank)"}\n  Evidence: ${w.evidence || "(none given)"}\n  Status: ${w.verified ? "verified" : "assumption / not yet verified"}`)
    .join("\n");
  const actions = (inv.actions || [])
    .map((a, i) => `${i + 1}. [${a.level || "?"} / ${a.kind || "?"}] ${a.desc || ""} (owner: ${a.owner || "?"}, due: ${a.due || "?"})`)
    .join("\n");
  return `INCIDENT
Title: ${d.title || ""}
Type: ${d.type || ""}   Severity: ${d.severity || ""}
Date/time: ${d.date || ""} ${d.time || ""}   Location: ${d.location || ""}   Department: ${d.dept || ""}
Description: ${d.description || ""}
Immediate actions taken: ${d.immediate || ""}

PROBLEM STATEMENT
${inv.problem || "(not written yet)"}

WHY CHAIN
${whys || "(no whys yet)"}

ROOT CAUSE (investigator's draft)
${inv.rootCause?.statement || "(not set)"}  Category: ${inv.rootCause?.category || ""}

CONTRIBUTING FACTORS
${inv.factors || "(none)"}

ACTIONS SO FAR
${actions || "(none)"}`;
}

export default async function handler(req, res) {
  const originOk = cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  if (!originOk) return res.status(403).json({ error: "Origin not allowed" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY" });

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "Invalid JSON" }); }
  }
  if (!body || typeof body !== "object") return res.status(400).json({ error: "Missing body" });
  if (body.mode === "ping") return res.status(200).json({ ok: true });

  const inv = body.investigation;
  if (!inv || typeof inv !== "object") return res.status(400).json({ error: "Missing investigation" });
  const context = describe(inv);
  if (context.length > MAX_BODY_CHARS) return res.status(413).json({ error: "Investigation too long" });

  let prompt, schema, effort;
  if (body.mode === "coach") {
    const i = Number.isInteger(body.index) ? body.index : (inv.whys || []).length - 1;
    if (i < 0 || !inv.whys?.[i]) return res.status(400).json({ error: "No why at that index" });
    prompt = `${context}\n\nReview Why ${i + 1} ("${inv.whys[i].answer}"). Does it logically explain the statement above it? Is it blame-oriented, vague, or unsupported? Suggest the next question to ask.`;
    schema = COACH_SCHEMA;
    effort = "low";
  } else if (body.mode === "summary") {
    prompt = `${context}\n\nReview the whole investigation. Draft the problem statement, the root cause at management-system level, contributing factors, gaps in the chain, and a corrective and preventive action plan of 3 to 6 actions that favours higher-order controls.`;
    schema = SUMMARY_SCHEMA;
    effort = "medium";
  } else {
    return res.status(400).json({ error: "Unknown mode" });
  }

  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      output_config: { effort, format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: prompt }],
    });

    if (response.stop_reason === "refusal") {
      return res.status(422).json({ error: "The AI declined this request. Rephrase the investigation text and try again." });
    }
    if (response.stop_reason === "max_tokens") {
      return res.status(502).json({ error: "The AI response was cut off. Try again." });
    }
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    return res.status(200).json({ mode: body.mode, result: JSON.parse(text) });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "AI is busy, try again in a minute." });
    if (err instanceof Anthropic.AuthenticationError) return res.status(500).json({ error: "Server API key is invalid." });
    if (err instanceof Anthropic.APIError) return res.status(502).json({ error: `AI service error (${err.status ?? "network"})` });
    if (err instanceof SyntaxError) return res.status(502).json({ error: "AI returned malformed output. Try again." });
    console.error(err);
    return res.status(500).json({ error: "Unexpected server error" });
  }
}
