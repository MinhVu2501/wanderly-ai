import "dotenv/config";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function generateJsonFromGroq(prompt) {
  const completion = await groq.chat.completions.create({
    model: "openai/gpt-oss-20b",
    messages: [
      {
        role: "system",
        content:
          "You are Wanderly AI, JSON-only, no extra text. Output MUST be a single valid JSON object.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.35,
    max_tokens: 4000,
  });

  return completion.choices?.[0]?.message?.content?.trim() || "{}";
}

async function repairJsonWithGroq(badText) {
  try {
    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",
      messages: [
        { role: "system", content: "Fix to STRICT valid JSON only. Return only JSON." },
        { role: "user", content: String(badText || "") },
      ],
      temperature: 0.2,
      max_tokens: 4000,
    });
    return completion.choices?.[0]?.message?.content?.trim() || "";
  } catch {
    return "";
  }
}

function sanitizePotentialJson(str) {
  if (!str || typeof str !== "string") return "";
  let t = str.trim();
  const m = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (m && m[1]) t = m[1];
  t = t.replace(/,\s*([}\]])/g, "$1");
  return t;
}

function buildHotelMock({ to = "Destination", travelType = "comfort", count = 5 }) {
  const areas = ["Shinjuku", "Shibuya", "Ginza", "Roppongi", "Asakusa", "Ueno"];

  const baseRange =
    travelType === "economy"
      ? [60, 160]
      : travelType === "comfort"
      ? [140, 260]
      : travelType === "premium"
      ? [280, 600]
      : [800, 2000]; // luxury

  const [min, max] = baseRange;

  const base = [];
  for (let i = 0; i < count; i++) {
    const t = i / Math.max(1, count - 1);
    const nightly = Math.round(min + (max - min) * t);

    base.push({
      id: `hotel_${i + 1}`,
      name: `${to} ${travelType} Hotel ${i + 1}`,
      address: `${areas[i % areas.length]} area, ${to}`,
      area: areas[i % areas.length],
      lat: 35.68 + i * 0.005,
      lng: 139.76 + i * 0.005,
      nightlyPrice: nightly,
      currency: "USD",
      rating: 4.0 + (i % 3) * 0.2,
      url: "https://example.com",
      description: `Comfortable base in ${areas[i % areas.length]} for exploring ${to}.`,
    });
  }
  return { hotels: base };
}

export async function suggestHotelsV3(req, res) {
  try {
    const {
      to = "",
      startDate = "",
      endDate = "",
      travelType = "comfort",
      budget = "",
      language = "en",
    } = req.body ?? {};

    if (!to || !startDate || !endDate) {
      return res.status(400).json({
        error: "Fields 'to', 'startDate', and 'endDate' are required.",
      });
    }

    if (!process.env.GROQ_API_KEY) {
      // return mock instead of 500 so UI can proceed
      return res.json(buildHotelMock({ to, travelType }));
    }

    const prompt = buildHotelPromptV3({ to, startDate, endDate, travelType, budget, language });

    const raw = await generateJsonFromGroq(prompt);

    let data;
    try {
      data = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (err) {
      console.warn("Hotel JSON parse failed → trying sanitizer");
      try {
        const cleaned = sanitizePotentialJson(raw);
        data = cleaned ? JSON.parse(cleaned) : null;
      } catch (e2) {
        try {
          // loose brace extraction
          const txt = String(raw || "");
          const first = txt.indexOf('{');
          const last = txt.lastIndexOf('}');
          if (first !== -1 && last > first) {
            const slice = txt.slice(first, last + 1).replace(/,\s*([}\]])/g, '$1');
            data = JSON.parse(slice);
          }
        } catch (e3) {
          const repaired = await repairJsonWithGroq(raw || "");
          const cleaned2 = sanitizePotentialJson(repaired) || repaired;
          try { data = JSON.parse(cleaned2); } catch { data = null; }
        }
      }
    }

    if (!data || !Array.isArray(data.hotels)) {
      // graceful mock fallback
      return res.json(buildHotelMock({ to, travelType }));
    }

    return res.json({ hotels: data.hotels });
  } catch (err) {
    console.error("suggestHotelsV3 Error:", err);
    // final fallback to mock to keep UX smooth
    try {
      const { to = "", travelType = "comfort" } = req.body ?? {};
      return res.json(buildHotelMock({ to, travelType }));
    } catch {
      return res.status(500).json({ error: "Failed to suggest hotels (V3)" });
    }
  }
}

function buildHotelPromptV3({ to, startDate, endDate, travelType, budget, language }) {
  return `
You are Wanderly AI, a JSON-only hotel recommendation engine.

STRICT RULES:
1. REAL hotels only: real names, real addresses, real areas in or near "${to}".
2. JSON-SAFE: single-line strings only, no line breaks, no bullets.
3. Match hotel class and prices to travelType (for major cities like NYC, Tokyo, London):
   - economy → 2–3★, approx 60–180 USD/night
   - comfort → 3–4★, approx 140–280 USD/night
   - premium → 4–5★, approx 280–700 USD/night
   - luxury → 5★, high-end only, approx 800–2500 USD/night
4. If the user's total trip budget is very high, it's OK for luxury hotels to be in the 1200–3000 USD/night range in expensive cities.
5. Prices must be realistic for "${to}" but clearly different between economy, comfort, premium, and luxury.
6. Output ONLY JSON matching the schema. No explanations.

TASK:
User is visiting "${to}" from ${startDate} to ${endDate}.
Travel type: "${travelType}".
Budget: ${budget || "unknown"} USD.
Language: "${language}".

Return 4–10 options.

Each hotel must include:
- id (unique string like "hotel_1")
- name
- address
- area (main neighborhood)
- lat (number)
- lng (number)
- nightlyPrice (USD, number)
- currency ("USD")
- rating (number)
- url (official or booking.com link)
- description (single line)

OUTPUT FORMAT:
{
  "hotels": [
    {
      "id": "hotel_1",
      "name": "Example Hotel",
      "address": "123 Main St, Example City",
      "area": "Shinjuku",
      "lat": 35.123,
      "lng": 139.456,
      "nightlyPrice": 120,
      "currency": "USD",
      "rating": 4.3,
      "url": "https://example.com",
      "description": "Short single-line description."
    }
  ]
}

ONLY output valid JSON.`;
}
