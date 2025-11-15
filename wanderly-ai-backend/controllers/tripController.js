// controllers/tripController.js
import "dotenv/config";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ============================================================
 * MAIN ROUTE — POST /api/trip-plan
 * ========================================================== */
export async function createTripPlan(req, res) {
  try {
    const {
      destination = "",
      days = 3,
      interests = [],
      travelStyle = "balanced",
      budget = "",
      currency = "USD",
      language = "en",
    } = req.body ?? {};

    if (!destination || !days) {
      return res.status(400).json({ error: "Destination and days are required." });
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY missing.");
      return res.status(500).json({ error: "OpenAI key not found" });
    }

    // ---------- Build Prompt ----------
    const prompt = buildTripPrompt({
      destination,
      days,
      interests,
      travelStyle,
      budget,
      currency,
      language,
    });

    // ---------- Call OpenAI (Responses API) ----------
    const rawPlan = await generateJsonWithResponsesAPI(prompt);

    console.log("=== RAW OPENAI OUTPUT ===");
    console.log(rawPlan);

    if (!rawPlan || typeof rawPlan !== "object") {
      console.error("Invalid OpenAI output — using mock.");
      return res.json({
        plan: buildMockPlan({ destination, days, currency, language }),
        mock: true,
      });
    }

    let plan = rawPlan;

    // ---------- Post-process ----------
    plan = postProcessPlan(plan, { destination, currency, language });

    return res.json({ plan, source: "openai" });
  } catch (err) {
    console.error("createTripPlan ERROR:", err);
    return res.status(500).json({ error: "Failed to generate trip plan." });
  }
}

/* ============================================================
 * RESPONSES API — STRICT JSON
 * ========================================================== */
async function generateJsonWithResponsesAPI(prompt) {
  try {
    const rr = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: "Respond ONLY with valid JSON. No markdown, no comments." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 3000,
      response_format: { type: "json_object" },
    });
    const content = (rr?.choices?.[0]?.message?.content || "").trim();
    if (!content) return null;
    try {
      return JSON.parse(content);
    } catch {
      const cleaned = sanitizePotentialJson(content);
      return cleaned ? JSON.parse(cleaned) : null;
    }
  } catch (err) {
    console.error("OpenAI chat.completions failed:", err?.message || String(err));
    return null;
  }
}

/* ============================================================
 * STRICT PROMPT — NO MULTILINE TEXT ALLOWED
 * ========================================================== */
function buildTripPrompt({
  destination,
  days,
  interests,
  travelStyle,
  budget,
  currency,
  language,
}) {
  const interestsList = Array.isArray(interests)
    ? interests.join(", ")
    : String(interests || "");

  return `
You are Wanderly AI — a professional travel planner producing realistic itineraries using ONLY real places, real addresses, and real navigation details.

===========================
STRICT RULES
===========================
1. REAL places only — real museums, restaurants, cafes, attractions.
2. JSON-SAFE TEXT ONLY — ALL text fields must be single-line JSON strings.
   - No new lines
   - No paragraph breaks
   - No unescaped quotes
   - No unfinished sentences
   - No bullets or list-style text
   - NO MULTILINE DESCRIPTION UNDER ANY CIRCUMSTANCE.
3. DESCRIPTIONS must be 1–3 sentences on ONE LINE.
4. TRANSPORTATION must be real — include distance + method + time.
5. DURATION realistic — coffee 30–60m, museums 60–180m, lunch 60–90m, dinner 90–120m.
6. COST realistic in ${currency}.
7. NO DUPLICATE NAMES — all options must be globally unique.
8. EXACT BLOCK STRUCTURE:
   morning (07:00–11:00)
   lunch (11:00–14:00)
   afternoon (14:00–17:00)
   dinner (17:00–21:00)
   optional_evening (20:00–23:30)
9. Each block must have 2–4 REAL options.
10. OUTPUT MUST BE 100% VALID JSON — no markdown, no comments.

===========================
OUTPUT FORMAT
===========================
{
  "destination": "${destination}",
  "days": ${days},
  "summary": "",
  "daily": [
    {
      "day": 1,
      "title": "",
      "items": [
        {
          "time": "07:00–11:00",
          "block_type": "morning",
          "label": "",
          "options": [
            {
              "name": "",
              "type": "",
              "description": "",
              "duration_min": 0,
              "distance_from_previous": "",
              "transport": "",
              "cost_estimate": { "amount": 0, "currency": "${currency}" },
              "address": ""
            }
          ]
        }
      ]
    }
  ],
  "hotels": [],
  "tips": [],
  "meta": {
    "generated_at": "",
    "language": "${language}",
    "currency": "${currency}"
  }
}

===========================
USER INPUT
===========================
Destination: ${destination}
Days: ${days}
Interests: ${interestsList}
Budget: ${budget} ${currency}
Travel style: ${travelStyle}
Language: ${language}

Return ONLY JSON. No markdown.
`.trim();
}

/* ============================================================
 * POST-PROCESSING
 * ========================================================== */
function postProcessPlan(plan, { destination, currency }) {
  sanitizeAllStrings(plan);
  enforceUniqueOptionNames(plan);

  // Fill missing costs/transport
  for (const day of plan.daily || []) {
    for (const block of day.items || []) {
      for (const opt of block.options || []) {
        if (!opt.cost_estimate) {
          opt.cost_estimate = { amount: 20, currency };
        }
        if (!opt.transport) {
          opt.transport = "walk or transit (5–15 min)";
        }
        if (!opt.distance_from_previous) {
          opt.distance_from_previous = "~1 km";
        }
      }
    }
  }

  // Fill hotels if missing
  if (!Array.isArray(plan.hotels) || plan.hotels.length === 0) {
    plan.hotels = [
      {
        name: `Central Hotel ${destination}`,
        nightly_price: { amount: 120, currency },
        reason: `Convenient base for exploring ${destination}.`,
      },
    ];
  }

  plan.meta.generated_at = new Date().toISOString();
  return plan;
}

/* ============================================================
 * Sanitize strings (remove line breaks)
 * ========================================================== */
function sanitizeAllStrings(obj) {
  if (!obj) return;
  if (typeof obj === "string") {
    return obj.replace(/\s+/g, " ").trim();
  }
  if (Array.isArray(obj)) {
    return obj.map((v) => sanitizeAllStrings(v));
  }
  if (typeof obj === "object") {
    for (const key of Object.keys(obj)) {
      obj[key] = sanitizeAllStrings(obj[key]);
    }
    return obj;
  }
  return obj;
}

/* ============================================================
 * Ensure globally unique option names
 * ========================================================== */
function enforceUniqueOptionNames(plan) {
  const seen = new Set();
  for (const day of plan.daily || []) {
    for (const block of day.items || []) {
      for (const opt of block.options || []) {
        let name = opt.name || "Place";
        let key = name.toLowerCase();
        if (seen.has(key)) {
          let n = 2;
          while (seen.has(`${key}_${n}`)) n++;
          name = `${name} ${n}`;
          opt.name = name;
          key = name.toLowerCase();
        }
        seen.add(key);
      }
    }
  }
}

/* ============================================================
 * MOCK FALLBACK
 * ========================================================== */
function buildMockPlan({ destination, days, currency, language }) {
  return {
    destination,
    days,
    summary: `A ${days}-day plan in ${destination} (fallback mock).`,
    daily: [],
    hotels: [],
    tips: [],
    meta: {
      generated_at: new Date().toISOString(),
      language,
      currency,
    },
  };
}

export default {};
