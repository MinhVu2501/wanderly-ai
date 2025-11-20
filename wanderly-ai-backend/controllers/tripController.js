import "dotenv/config";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * POST /api/trip-plan
 */
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

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: "Missing GROQ_API_KEY in .env" });
    }

    const prompt = buildTripPrompt({
      destination,
      days,
      interests,
      travelStyle,
      budget,
      currency,
      language,
    });

    

    const raw = await generateJsonFromGroq(prompt);

    

    if (!raw) {
      return res.json({ plan: buildMockPlan({ destination, days, currency, language, budget }), mock: true });
    }

    // ---- Try Parse JSON ----
    let plan;
    try {
      plan = JSON.parse(raw);
    } catch (e) {
      console.warn("JSON parse failed → trying sanitizer");
      const cleaned = sanitizePotentialJson(raw);
      try {
        plan = JSON.parse(cleaned);
      } catch (e2) {
        console.warn("Sanitizer failed → attempting Groq JSON repair");
        try {
          const repaired = await repairJsonWithGroq(raw);
          const repairedClean = sanitizePotentialJson(repaired);
          plan = JSON.parse(repairedClean || repaired);
          
        } catch (e3) {
          console.warn("JSON repair failed → fallback mock");
          return res.json({
            plan: buildMockPlan({ destination, days, currency, language, budget }),
            mock: true,
          });
        }
      }
    }

    plan = postProcessPlan(plan, { destination, currency, days, budget });

    return res.json({ plan, mock: false });
  } catch (err) {
    console.error("createTripPlan ERROR:", err);
    return res.status(500).json({ error: "Failed to generate trip plan." });
  }
}

// Backup alias so we always retain the original behavior
export async function createTripPlanV1(req, res) {
  return createTripPlan(req, res);
}

/* ============================================================
 * CALL GROQ (FREE)
 * ========================================================== */
async function generateJsonFromGroq(prompt, { model = "llama-3.3-70b-versatile" } = {}) {
  console.log("🔥 Using Groq model:", model);
  try {
    const isOss = model.startsWith("openai/");
    const completion = await groq.chat.completions.create({
      model,
      ...(isOss ? {} : { response_format: { type: "json_object" } }),
      messages: [
        {
          role: "system",
          content:
            "Respond ONLY with a single valid JSON object. No markdown, no comments.",
        },
        { role: "user", content: prompt },
      ],
      temperature: isOss ? 0.3 : 0.4,
      max_tokens: isOss ? 8000 : 18000,
    });

    const text = completion.choices?.[0]?.message?.content?.trim() || "";
    try {
      console.log("Groq response length:", text.length);
    } catch {}
    return text;
  } catch (err) {
    console.error("Groq ERROR:", err);
    return "";
  }
}

// ---- JSON repair using Groq ----
async function repairJsonWithGroq(badText) {
  const prompt = `
You are a JSON repair tool.

TASK:
- Input is broken or partial JSON.
- Your job is to output ONE (1) valid JSON object.
- Do not add explanations or markdown.

BROKEN INPUT:
${String(badText || "")}
`.trim();

  const fixed = await generateJsonFromGroq(prompt, {
    model: "openai/gpt-oss-20b",
  });

  return fixed?.trim() || "";
}

/* ============================================================
 * PROMPT BUILDER
 * ========================================================== */
function buildTripPrompt({ destination, days, interests, travelStyle, budget, currency, language }) {
  const interestsList = Array.isArray(interests)
    ? interests.join(", ")
    : String(interests || "");

  return `
You are Wanderly AI — a professional travel planner.
Create a realistic ${days}-day itinerary for ${destination}.

STRICT RULES:
1. REAL places only (no fakes).
2. REAL addresses only.
3. ALL descriptions must be 1–3 sentences ON ONE LINE (no newlines).
4. NO lists, bullets, or markdown.
5. NO duplicate place names.
6. Mandatory blocks: morning, lunch, afternoon, dinner, optional_evening.
7. Each block must have 2–4 REAL options.
8. Each option MUST include:
   - name
   - type
   - description (ONE-LINE)
   - duration_min
   - distance_from_previous
   - transport
   - cost_estimate { amount, currency }
   - address

JSON OUTPUT SHAPE:
{
  "destination": "${destination}",
  "days": ${days},
  "summary": "",
  "daily": [],
  "hotels": [],
  "tips": [],
  "meta": {
    "generated_at": "",
    "language": "${language}",
    "currency": "${currency}"
  }
}
9. EACH of the ${days} days must include ALL blocks:
   - morning
   - lunch
   - afternoon
   - dinner
   - optional_evening
10. NEVER omit a block. NEVER skip dinner or optional_evening.
11. NEVER end a day's JSON early. Return the FULL item list for all ${days} days.
12. Do NOT repeat the exact same options on different days.

USER INPUT:
Destination: ${destination}
Days: ${days}
Interests: ${interestsList}
Budget: ${budget} ${currency}
Travel style: ${travelStyle}
Language: ${language}


Return ONLY JSON.
  `.trim();
}

/* ============================================================
 * TRIP V3: NEW TWO-STAGE PIPELINE
 *  - Stage 1: GPT-OSS 20B builds skeleton (days + 6 blocks)
 *  - Stage 2: Llama 3.3 70B fills real places + costs
 * ========================================================== */
export async function createTripPlanV3(req, res) {
  try {
    const {
      from = "",
      to = "",
      startDate = "",
      endDate = "",
      travelType = "comfort",
      transportPreference = "mixed",
      budget = "",
      language = "en",
      hotelPerDay = [],
    } = req.body ?? {};

    if (!from || !to || !startDate || !endDate) {
      return res.status(400).json({
        error: "Fields 'from', 'to', 'startDate', and 'endDate' are required.",
      });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: "Missing GROQ_API_KEY in .env" });
    }

    // -----------------------------
    // 1) SKELETON with GPT-OSS 20B
    // -----------------------------
    const skeletonPrompt = buildTripSkeletonPromptV3({
      from,
      to,
      startDate,
      endDate,
      travelType,
      transportPreference,
      budget,
      language,
      hotelPerDay,
    });

    console.log("\n=== TRIP V3: SKELETON (gpt-oss-20b) ===\n");

    let skeletonRaw = await generateJsonFromGroq(skeletonPrompt, {
      model: "openai/gpt-oss-20b",
    });

    let skeleton;
    try {
      skeleton = skeletonRaw
        ? JSON.parse(typeof skeletonRaw === "string" ? skeletonRaw : String(skeletonRaw))
        : null;
    } catch (e1) {
      console.warn("Skeleton JSON parse failed, trying sanitizer…", e1);
      try {
        const cleaned = sanitizePotentialJson(String(skeletonRaw || ""));
        skeleton = cleaned ? JSON.parse(cleaned) : null;
      } catch (e2) {
        console.warn("Skeleton sanitizer failed, using local mock skeleton…", e2);
        skeleton = buildTripPlanV3Mock({
          from,
          to,
          startDate,
          endDate,
          travelType,
          transportPreference,
          budget,
          language,
          hotelPerDay,
        });
      }
    }

    if (!skeleton || !Array.isArray(skeleton?.days) || skeleton.days.length === 0) {
      console.warn("Skeleton has no days, rebuilding from local mock…");
      skeleton = buildTripPlanV3Mock({
        from,
        to,
        startDate,
        endDate,
        travelType,
        transportPreference,
        budget,
        language,
        hotelPerDay,
      });
    }

    try {
      skeleton = normalizeSkeletonToSixBlocks(skeleton, hotelPerDay);
    } catch (eNorm) {
      console.warn("normalizeSkeletonToSixBlocks failed, keeping original skeleton:", eNorm);
    }

    // -----------------------------------------------------
    // 2) REAL CONTENT FILLING with LLAMA 3.3 70B Versatile
    // -----------------------------------------------------
    const realFillPrompt = buildTripRealFillPromptV3({
      from,
      to,
      startDate,
      endDate,
      travelType,
      transportPreference,
      budget,
      language,
      hotelPerDay,
      skeleton,
    });

    console.log("\n=== TRIP V3: REAL FILL (llama-3.3-70b-versatile) ===\n");

    const raw = await generateJsonFromGroq(realFillPrompt); // default model is llama-3.3-70b-versatile

    let data;
    try {
      data = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : null;
    } catch (err) {
      console.warn("Real-fill JSON parse failed, trying sanitizer…", err);
      try {
        const cleaned = sanitizePotentialJson(String(raw || ""));
        data = cleaned ? JSON.parse(cleaned) : null;
      } catch (e2) {
        console.warn("Real-fill sanitizer failed, falling back to skeleton as trip…", e2);
        data = skeleton;
      }
    }

    try {
      console.log(
        "Trip V3 AFTER REAL FILL:",
        {
          days: Array.isArray(data?.days) ? data.days.length : 0,
          firstDayBlocks:
            Array.isArray(data?.days?.[0]?.blocks) ? data.days[0].blocks.length : 0,
        }
      );
    } catch {}

    // ---------------------------------------
    // 3) Post-process & de-duplicate places
    // ---------------------------------------
    const processed = postProcessTripV3(data);
    const deduped = enforceUniquePlaces(processed);

    return res.json(deduped);
  } catch (err) {
    console.error("Error in createTripPlanV3:", err);
    try {
      const {
        from = "",
        to = "",
        startDate = "",
        endDate = "",
        travelType = "comfort",
        transportPreference = "mixed",
        budget = "",
        language = "en",
        hotelPerDay = [],
      } = req.body ?? {};
      const mock = buildTripPlanV3Mock({
        from,
        to,
        startDate,
        endDate,
        travelType,
        transportPreference,
        budget,
        language,
        hotelPerDay,
      });
      console.warn("Trip V3: global error, returning mock plan");
      return res.json(mock);
    } catch {
      return res.status(500).json({ error: "Failed to generate trip plan V3." });
    }
  }
}

// ----------------------------------------------------------
// Build SKELETON prompt for gpt-oss-20b
// ----------------------------------------------------------
function buildTripSkeletonPromptV3({
  from,
  to,
  startDate,
  endDate,
  travelType,
  transportPreference,
  budget,
  language,
  hotelPerDay,
}) {
  const hotelJson = JSON.stringify(hotelPerDay || []);

  return `
You are a JSON-only planner.

TASK:
- Build a TRIP SKELETON for ${from} → ${to}.
- Do NOT invent any real place names.
- Do NOT add any activity options.
- Your job is ONLY the structure: days, dates, hotels, and 6 empty blocks per day.

RULES:
- Output ONLY valid JSON, no markdown, no comments.
- ALL text fields must be single-line strings.
- Each day MUST have these 6 blocks in this exact order:
  1) morning   ("08:00 - 10:30")
  2) midday    ("10:45 - 12:00")
  3) lunch     ("12:00 - 13:30")
  4) afternoon ("14:00 - 17:00")
  5) dinner    ("18:00 - 20:00")
  6) night     ("20:00 - 23:30")
- For this skeleton, set "options": [] for every block.
- Use the USER-SELECTED HOTELS exactly as given.

TRIP INFO:
- From: "${from}"
- To: "${to}"
- Start date: "${startDate}"
- End date: "${endDate}"
- Travel type: "${travelType}"
- Transport preference: "${transportPreference}"
- Budget: "${budget || "unknown"} USD"
- Language: "${language}"

USER-SELECTED HOTELS (one per day, index 0 = day 1):
${hotelJson}

REQUIRED JSON SHAPE:
{
  "flight": {
    "averageCost": 0,
    "currency": "USD",
    "duration": "",
    "departureAirport": "",
    "arrivalAirport": "",
    "notes": ""
  },
  "travelStyle": {
    "type": "${travelType}",
    "summary": ""
  },
  "hotels": [ ...copy unique hotels from hotelPerDay... ],
  "days": [
    {
      "day": 1,
      "date": "YYYY-MM-DD",
      "hotel": { ...hotelPerDay[0]... },
      "blocks": [
        { "time": "08:00 - 10:30", "section": "morning",   "options": [] },
        { "time": "10:45 - 12:00", "section": "midday",    "options": [] },
        { "time": "12:00 - 13:30", "section": "lunch",     "options": [] },
        { "time": "14:00 - 17:00", "section": "afternoon", "options": [] },
        { "time": "18:00 - 20:00", "section": "dinner",    "options": [] },
        { "time": "20:00 - 23:30", "section": "night",     "options": [] }
      ]
    }
  ],
  "costSummary": {
    "totalFlightCost": 0,
    "totalHotelCost": 0,
    "totalTransportCost": 0,
    "totalFoodCost": 0,
    "totalActivitiesCost": 0,
    "totalEstimatedCost": 0,
    "budget": ${Number(budget) || 0},
    "budgetUsedPercent": 0,
    "budgetStatus": "on_track"
  }
}

Return ONLY JSON.
`.trim();
}

// ----------------------------------------------------------
// Build REAL FILL prompt for llama-3.3-70b
// ----------------------------------------------------------
function buildTripRealFillPromptV3({
  from,
  to,
  startDate,
  endDate,
  travelType,
  transportPreference,
  budget,
  language,
  hotelPerDay,
  skeleton,
}) {
  const skeletonJson = JSON.stringify(skeleton || {}, null, 2);

  return `
You are Wanderly AI — a professional travel planner.

You are given a TRIP SKELETON in JSON. Your job is to FILL it with
REAL PLACES and realistic costs.

IMPORTANT:
- KEEP THE SAME TOP-LEVEL STRUCTURE.
- Do NOT remove or reorder days.
- Do NOT remove or reorder blocks.
- For every block, you MUST fill "options" with 2–4 REAL places.
- NEVER leave "options": [].
- NEVER use fake names or placeholders.

DESTINATION INFO:
- From: "${from}"
- To: "${to}"
- Start date: "${startDate}"
- End date: "${endDate}"
- Travel type: "${travelType}"
- Transport preference: "${transportPreference}"
- Budget: "${budget || "unknown"} USD"
- Language: "${language}"

HOTEL RULES:
- Each day starts from that day's hotel (already inside skeleton.days[n].hotel).
- All option.coordinates (lat,lng) must be realistic and near the real place.
- Prefer activities within a sensible distance from the hotel and from previous stop.

BLOCK RULES:
- Blocks (morning, midday, lunch, afternoon, dinner, night) are already defined in skeleton.
- For each block's "options", add 2–4 real places.
- Night must include nightlife: bars, speakeasies, night markets, live music, etc.
- At most 1 option PER DAY may be a generic "free time near your hotel".
  All other options MUST be specific places (name + address).

OPTION FORMAT (for EVERY option):
- name (real place, no emojis in the name)
- type ("restaurant" | "cafe" | "museum" | "bar" | "market" | "activity" | "viewpoint" | "street" | "garden" | "landmark")
- description (1–3 sentences, ONE LINE only, no line breaks)
- famousFor (one line, what makes it special)
- whatToDo (one line, what the visitor actually does there)
- address (real-world formatted address)
- lat (number)
- lng (number)
- distanceFromPrevious (string, like "0.4 mi" or "1.2 km")
- transport (string, like "walk", "metro", "bus", "taxi/Uber")
- estimatedCost (number, 0 only for truly free locations)
- mustTryDish (required for restaurants, else "")
- recommendedDrink (required for cafes and bars, else "")
- tip (one-line practical tip, no line breaks)
- rating (number 1.0–5.0)
- label ("Top Pick" | "Very Popular" | "Relaxed Option" | "Best for Photos" | "Budget Option")
- tags (array of 1–4 short tags like ["ramen", "late night"]) 

COST RULES:
- Restaurants (lunch, dinner) must have realistic prices, not 0.
- Cafes, bars: realistic drink/snack prices.
- Museums, attractions: realistic ticket prices.
- Only parks/streets/walks may have estimatedCost = 0.
- For the entire trip, compute costSummary:
  - totalFlightCost
  - totalHotelCost
  - totalTransportCost
  - totalFoodCost
  - totalActivitiesCost
  - totalEstimatedCost
  - budget (number from user if provided)
  - budgetUsedPercent
  - budgetStatus = "under" | "on_track" | "over" | "way_over"

HOTELS ARRAY:
- "hotels" must list each distinct hotel used in the days.
- Each hotel MUST include:
  - name
  - address
  - lat
  - lng
  - rating (3.5–5.0)
  - area (neighborhood)
  - nightlyPrice (number > 0, realistic for the city, e.g. 80–600 USD)
  - url (official or booking-like URL if you know it, else "")

DUPLICATE RULE:
- Do NOT repeat the same place name in different blocks or days.
- If you must re-use, add a suffix like "— D2 Lunch" to the name.

SKELETON TO FILL (keep structure, fill options & costs):
${skeletonJson}

Return ONLY valid JSON. No markdown, no comments.
`.trim();
}

// Ensure skeleton has 6 blocks per day with the correct sections & times.
// If GPT-OSS did something weird, we repair it here.
function normalizeSkeletonToSixBlocks(trip, hotelPerDay = []) {
  if (!trip || !Array.isArray(trip.days)) return trip;

  const required = [
    { section: "morning",   time: "08:00 - 10:30" },
    { section: "midday",    time: "10:45 - 12:00" },
    { section: "lunch",     time: "12:00 - 13:30" },
    { section: "afternoon", time: "14:00 - 17:00" },
    { section: "dinner",    time: "18:00 - 20:00" },
    { section: "night",     time: "20:00 - 23:30" },
  ];

  trip.days.forEach((day, idx) => {
    if (!Array.isArray(day.blocks)) day.blocks = [];

    const bySection = new Map();
    day.blocks.forEach((b) => {
      const key = String(b.section || "").toLowerCase();
      if (!bySection.has(key)) bySection.set(key, b);
    });

    const hotel = day.hotel || hotelPerDay[idx] || hotelPerDay[0] || null;

    const fixedBlocks = required.map((sec) => {
      const existing = bySection.get(sec.section) || {};
      return {
        time: existing.time || sec.time,
        section: sec.section,
        options: Array.isArray(existing.options) ? existing.options : [],
      };
    });

    day.blocks = fixedBlocks;
    if (!day.hotel && hotel) day.hotel = hotel;
  });

  return trip;
}

function buildTripPromptV3({
  destination,
  days,
  interests,
  travelStyle,
  budget,
  currency,
  language,
  selectedHotels
}) {
  return `
You are Wanderly AI, a JSON-only travel-planning engine.

STRICT GLOBAL RULES:
1. REAL places only – absolutely no made-up names.
2. JSON-SAFE: all text must be SINGLE-LINE strings. No line breaks.
3. No duplicates across ANY day. Once a place is used on Day 1, NEVER reuse it again for Day 2/3/4...
4. All places must have valid addresses, coordinates, and phone-verified locations.
5. Transportation must be a short sentence:
   - Format: "Distance: X km. Recommended transport: walk/taxi/subway/bus."
6. Each block MUST have **2–4 options**.
7. Every place must include:
   - name
   - type
   - description (1–2 single-line sentences)
   - address
   - lat, lng
   - tags
   - rating (1–5)
   - estimatedCost
   - distanceFromPrevious (string full sentence)
8. Absolutely no bullet lists, no newlines inside JSON fields.

BLOCK STRUCTURE (MANDATORY):
- morning:     08:00 – 10:30
- midday:      10:45 – 12:00
- lunch:       12:00 – 13:30
- afternoon:   14:00 – 17:00
- evening:     17:00 – 19:00  ← MUST have REAL activity, NOT free time unless city has no options.
- dinner:      18:00 – 20:00
- night:       20:00 – 23:30
- late_night:  23:30 – 03:00  ← ALWAYS REAL nightlife in big cities.

NIGHTLIFE CITIES (strong nightlife rules apply):
New York, Tokyo, Seoul, Bangkok, London, Las Vegas, Berlin.
If destination matches one of these:
- late_night MUST include 2–3 real bars/clubs, each open until 2–4am.

USER INPUT:
Destination: ${destination}
Days: ${days}
Interests: ${interests.join(", ") || "none"}
Travel Style: ${travelStyle}
User Budget: ${budget} ${currency}
Language: ${language}

USER-SELECTED HOTELS PER DAY:
${JSON.stringify(selectedHotels, null, 2)}

TASK:
Create a complete multi-day itinerary with the block structure above.
Follow these rules:
- Start each day from the user's selected hotel.
- Never repeat a place across days.
- Use realistic prices for ${destination}.
- Respect travel style:
   * economy → local food, free attractions, transit
   * comfort → mix of paid/free attractions, mid-range restaurants
   * premium → nicer restaurants, paid museums, rooftop bars
   * luxury → Michelin restaurants, high-end experiences, premium bars

OUTPUT FORMAT (MANDATORY):
{
  "flight": { ... realistic flight JSON ... },
  "hotels": [],
  "costSummary": {
     "flight": number,
     "hotels": number,
     "food": number,
     "activities": number,
     "transport": number
  },
  "days": [
    {
      "day": 1,
      "date": "YYYY-MM-DD",
      "hotel": { ... selected hotel ... },
      "blocks": [
        {
          "section": "morning",
          "time": "08:00 - 10:30",
          "options": [
            {
              "name": "",
              "type": "",
              "description": "",
              "address": "",
              "lat": 0,
              "lng": 0,
              "distanceFromPrevious": "Distance: X km. Recommended transport: walk/taxi/subway.",
              "estimatedCost": 0,
              "rating": 4.3,
              "tags": ["tag1", "tag2"]
            }
          ]
        }
      ]
    }
  ]
}

OUTPUT ONLY VALID JSON. NO EXTRA TEXT.`;
}

// Minimal deterministic mock for V3 to avoid 500s when model fails
function buildTripPlanV3Mock({ from, to, startDate, endDate, travelType, transportPreference, budget, language, hotelPerDay }) {
  const daysCount = (() => {
    const s = new Date(startDate);
    const e = new Date(endDate);
    const diff = Math.ceil((e - s) / (1000 * 60 * 60 * 24));
    return Math.max(1, diff || 1);
  })();

  const mkTime = (h1, m1, dur) => {
    const pad = (n) => String(n).padStart(2, '0');
    const start = `${pad(h1)}:${pad(m1)}`;
    let endM = h1 * 60 + m1 + dur;
    const eh = Math.floor(endM / 60) % 24;
    const em = endM % 60;
    return `${start} - ${pad(eh)}:${pad(em)}`;
  };

  const sections = ['morning', 'midday', 'afternoon', 'evening'];
  const seeds = {
    landmark: ['Landmark', 'Memorial', 'Tower', 'Gate', 'Square'],
    museum: ['Museum', 'Gallery', 'Exhibition Hall', 'Heritage Center'],
    restaurant: ['Bistro', 'Grill', 'Kitchen', 'Ramen', 'Sushi Bar'],
    cafe: ['Cafe', 'Coffee Roasters', 'Tea House', 'Bakery'],
    bar: ['Bar', 'Lounge', 'Jazz Club', 'Rooftop'],
    viewpoint: ['Skydeck', 'Viewpoint', 'Scenic Point'],
  };
  const makeName = (base, idx) => `${to} ${base} D${idx + 1}`;
  const baseOptions = (lat, lng, dayIdx) => [
    { name: makeName(seeds.landmark[dayIdx % seeds.landmark.length], dayIdx), type: 'landmark', description: `Famous sight in ${to}.`, famousFor: 'Iconic view', whatToDo: 'Photos and walk', address: `${to} center`, lat, lng, distanceFromPrevious: '1.0 km', transport: transportPreference, estimatedCost: 0, rating: 4.5, label: 'Top Pick', tags: ['photogenic'] },
    { name: makeName(seeds.museum[dayIdx % seeds.museum.length], dayIdx), type: 'museum', description: `Popular museum in ${to}.`, famousFor: 'Collections', whatToDo: 'Exhibitions', address: `${to}`, lat, lng, distanceFromPrevious: '0.8 km', transport: transportPreference, estimatedCost: 15, rating: 4.3, label: 'Very Popular', tags: ['culture'] },
  ];

  const days = Array.from({ length: daysCount }, (_, i) => {
    const hotel = hotelPerDay[i] || hotelPerDay[0] || { name: `${to} Hotel`, address: `${to}`, lat: 0, lng: 0 };
    const blocks = sections.map((sec, si) => ({
      time: mkTime(9 + si * 2, 0, 60),
      section: sec,
      options: baseOptions(hotel.lat || 0, hotel.lng || 0, i),
    }));
    // Add lunch and dinner blocks per rules
    blocks.splice(2, 0, {
      time: mkTime(12, 0, 60),
      section: 'midday',
      options: [
        { name: makeName(seeds.restaurant[i % seeds.restaurant.length], i), type: 'restaurant', description: `Well-rated restaurant.`, famousFor: 'Local dishes', whatToDo: 'Lunch', address: `${to}`, lat: hotel.lat || 0, lng: hotel.lng || 0, distanceFromPrevious: '0.5 km', transport: transportPreference, estimatedCost: 30, mustTryDish: 'Chef special', rating: 4.2, label: 'Very Popular', tags: ['food'] },
      ],
    });
    blocks.push({
      time: mkTime(18, 0, 90),
      section: 'evening',
      options: [
        { name: makeName(seeds.restaurant[(i + 1) % seeds.restaurant.length], i), type: 'restaurant', description: `Dinner spot.`, famousFor: 'Steak', whatToDo: 'Dinner', address: `${to}`, lat: hotel.lat || 0, lng: hotel.lng || 0, distanceFromPrevious: '0.7 km', transport: transportPreference, estimatedCost: 45, mustTryDish: 'Steak', rating: 4.3, label: 'Top Pick', tags: ['food'] },
        { name: makeName(seeds.cafe[i % seeds.cafe.length], i), type: 'cafe', description: `Cozy cafe.`, famousFor: 'Coffee', whatToDo: 'Dessert', address: `${to}`, lat: hotel.lat || 0, lng: hotel.lng || 0, distanceFromPrevious: '0.3 km', transport: transportPreference, estimatedCost: 8, recommendedDrink: 'Latte', rating: 4.1, label: 'Relaxed Option', tags: ['coffee'] },
      ],
    });

    return {
      day: i + 1,
      date: new Date(new Date(startDate || Date.now()).getTime() + i * 86400000).toISOString().split('T')[0],
      hotel,
      blocks,
    };
  });

  return {
    flight: { averageCost: 1200, currency: 'USD', duration: '11h 45m', airports: { departure: from.split(',')[0] || 'DEP', arrival: to.split(',')[0] || 'ARR' }, notes: 'Mock flight estimate.' },
    travelStyle: { type: travelType, summary: 'Mock summary.' },
    hotels: hotelPerDay.filter(Boolean),
    days,
    costSummary: { totalFlightCost: 1200, totalHotelCost: 0, totalTransportCost: 150, totalFoodCost: 300, totalActivitiesCost: 200, totalEstimatedCost: 1850, budget: Number(budget) || 0, budgetUsedPercent: budget ? Math.round((1850 / Number(budget)) * 100) : 0, budgetStatus: 'on_track' },
  };
}

function postProcessTripV3(trip) {
  try {
    if (!trip || !Array.isArray(trip.days)) return trip;

    // Required block order for strict UI control
    const BLOCK_ORDER = [
      "morning",
      "midday",
      "lunch",
      "afternoon",
      "evening",
      "dinner",
      "night",
      "late_night"
    ];

    const NIGHTLIFE_CITIES = [
      "new york", "nyc", "manhattan",
      "tokyo", "shinjuku", "shibuya",
      "london", "soho",
      "berlin",
      "bangkok",
      "las vegas"
    ];

    const isNightlifeCity = (trip.to || trip.destination || "")
      .toLowerCase()
      .includes("new york") ||
      NIGHTLIFE_CITIES.some((c) =>
        (trip.to || trip.destination || "").toLowerCase().includes(c)
      );

    const seen = new Set();

    trip.days.forEach((day, di) => {
      if (!Array.isArray(day.blocks)) day.blocks = [];

      // Fill missing blocks with empty placeholders
      const requiredBlocks = [
        "morning",
        "midday",
        "lunch",
        "afternoon",
        "evening",
        "dinner",
        "night",
        "late_night"
      ];

      const existingSections = new Set(
        day.blocks.map((b) => String(b.section).toLowerCase())
      );

      requiredBlocks.forEach((sec) => {
        if (!existingSections.has(sec)) {
          day.blocks.push({
            time:
              sec === "morning"
                ? "08:00 - 10:30"
                : sec === "midday"
                ? "10:45 - 12:00"
                : sec === "lunch"
                ? "12:00 - 13:30"
                : sec === "afternoon"
                ? "14:00 - 17:00"
                : sec === "evening"
                ? "17:00 - 19:00"
                : sec === "dinner"
                ? "18:00 - 20:00"
                : sec === "night"
                ? "20:00 - 23:30"
                : "23:30 - 03:00",

            section: sec,
            options: []
          });
        }
      });

      // Deduplicate globally but preserve one option per block
      day.blocks.forEach((block) => {
        if (!Array.isArray(block.options)) block.options = [];

        const clean = [];
        block.options.forEach((opt) => {
          const name = (opt?.name || "").trim().toLowerCase();
          if (!name) return;

          if (!seen.has(name)) {
            clean.push(opt);
            seen.add(name);
          }
        });

        block.options = clean;

        // Ensure every block has at least 1 option
        if (block.options.length === 0) {
          const hotel = day.hotel || {};
          block.options.push({
            name: `Free time in ${trip.to || trip.destination || "city"}`,
            type: "activity",
            description:
              "Flexible time to explore nearby sights, cafes, or neighborhoods.",
            address: hotel.address || "",
            lat: hotel.lat || 0,
            lng: hotel.lng || 0,
            distanceFromPrevious: "0.5 km",
            transport: "walk",
            estimatedCost: 0,
            rating: 4.0,
            label: "Relaxed Option",
            tags: ["flexible"]
          });
        }
      });

      // ENFORCE REAL NIGHTLIFE for major cities
      if (isNightlifeCity) {
        const ln = day.blocks.find((b) => b.section === "late_night");
        if (ln && ln.options.length <= 1) {
          // overwrite fallback with real nightlife template
          ln.options = [
            {
              name: "230 Fifth Rooftop Bar",
              type: "bar",
              description:
                "Iconic rooftop bar with skyline views, popular late-night hangout.",
              address: "230 5th Ave, New York, NY 10001",
              lat: 40.744678,
              lng: -73.987482,
              distanceFromPrevious: "1.5 km",
              transport: "walk or taxi",
              estimatedCost: 25,
              rating: 4.4,
              label: "Top Pick",
              tags: ["rooftop", "late-night"]
            },
            {
              name: "The Top of The Standard",
              type: "bar",
              description:
                "Elegant high-rise cocktail lounge with views, open late.",
              address: "848 Washington St, New York, NY 10014",
              lat: 40.739208,
              lng: -74.008728,
              distanceFromPrevious: "2.3 km",
              transport: "taxi/Uber",
              estimatedCost: 30,
              rating: 4.6,
              label: "Very Popular",
              tags: ["cocktail", "nightlife"]
            }
          ];
        }
      }

      // FULL SORT: fix evening/dinner/night ordering issues
      day.blocks = day.blocks.sort((a, b) => {
        const ai = BLOCK_ORDER.indexOf((a.section || "").toLowerCase());
        const bi = BLOCK_ORDER.indexOf((b.section || "").toLowerCase());
        return ai - bi;
      });
    });

    return trip;
  } catch (e) {
    console.warn("postProcessTripV3 failed:", e);
    return trip;
  }
}

// Remove duplicate place names within each block, keep blocks non-empty
function enforceUniquePlaces(trip) {
  try {
    if (!trip || !Array.isArray(trip.days)) return trip;

    trip.days.forEach((day) => {
      if (!Array.isArray(day.blocks)) return;

      day.blocks.forEach((block) => {
        if (!Array.isArray(block.options)) block.options = [];

        const seenInBlock = new Set();
        const newOptions = [];

        block.options.forEach((opt) => {
          const name = (opt?.name || "").trim();
          if (!name) return;

          const key = name.toLowerCase();
          if (seenInBlock.has(key)) return; // skip duplicates within the same block

          seenInBlock.add(key);
          newOptions.push(opt);
        });

        if (!newOptions.length) {
          // If AI failed or all options were duplicates, add a good fallback
          const sec = String(block.section || "").toLowerCase();
          const isLateNight = sec === "late_night";
          const isNight = sec === "night";

          const title = isLateNight
            ? "Late-night option near your hotel"
            : "Free time near your hotel";

          const desc = isLateNight
            ? "Explore nearby late-night bars, clubs or lounges that stay open past midnight near your hotel."
            : "Flexible time to explore nearby sights, cafes or shops around your hotel.";

          newOptions.push({
            name: title,
            type: isLateNight || isNight ? "bar" : "activity",
            description: desc,
            address: day.hotel?.address || "",
            lat: day.hotel?.lat || 0,
            lng: day.hotel?.lng || 0,
            distanceFromPrevious: "Distance: within 1 km. Recommended transport: walk.",
            estimatedCost: 0,
            rating: 4.0,
            label: "Relaxed Option",
            tags: ["flexible", "near hotel"],
          });
        }

        block.options = newOptions;
      });
    });

    return trip;
  } catch (e) {
    console.warn("enforceUniquePlaces failed, returning original trip:", e);
    return trip;
  }
}

/* ============================================================
 * SANITIZER
 * ========================================================== */
function sanitizePotentialJson(str) {
  if (!str || typeof str !== "string") return "";
  let t = str.trim();

  t = t.replace(/^```json/i, "").replace(/```$/i, "");

  // Fix unfinished arrays like:
  // "afternoon": [
  t = t.replace(/"\s*:\s*\[\s*$/gm, '" : []');

  // Fix trailing commas
  t = t.replace(/,\s*([}\]])/g, "$1");

  return t;
}




/* ============================================================
 * POST-PROCESSING
 * ========================================================== */
function postProcessPlan(plan, { destination, currency, days, budget }) {
  if (!plan || typeof plan !== "object") return plan;

  // --- Normalize meta ---
  if (!plan.meta) plan.meta = {};
  plan.meta.generated_at = new Date().toISOString();
  plan.meta.language = plan.meta.language || "en";
  plan.meta.currency = plan.meta.currency || currency || "USD";

  // Attach budget into plan.meta/plan.budget for reference
  const numericBudgetFromInput = Number(budget);
  if (!Number.isNaN(numericBudgetFromInput) && numericBudgetFromInput > 0) {
    if (!plan.budget) {
      plan.budget = {
        amount: numericBudgetFromInput,
        currency: plan.meta.currency,
      };
    }
  }

  const cur = plan.meta.currency;
  const targetDays = Number(plan.days || days || 0);

  // --- Ensure daily exists & has correct number of days ---
  if (!Array.isArray(plan.daily)) plan.daily = [];

  if (targetDays > 0) {
    // Pad missing days by cloning last day (better than nothing)
    while (plan.daily.length < targetDays) {
      const idx = plan.daily.length;
      const last = plan.daily[idx - 1];

const valid = last && Array.isArray(last.items) && last.items.length === 5;

let next;

if (valid) {
  next = JSON.parse(JSON.stringify(last));
  next.day = idx + 1;
  next.title = `Flexible day ${next.day}`;
} else {
  next = {
    day: idx + 1,
    title: `Flexible day ${idx + 1}`,
    items: [
      { block_type: "morning", time: "07:00–11:00", label: "morning", options: [] },
      { block_type: "lunch", time: "11:00–14:00", label: "lunch", options: [] },
      { block_type: "afternoon", time: "14:00–17:00", label: "afternoon", options: [] },
      { block_type: "dinner", time: "17:00–21:00", label: "dinner", options: [] },
      { block_type: "optional_evening", time: "20:00–23:30", label: "optional evening", options: [] },
    ],
  };
}

      plan.daily.push(next);
    }

    // Trim extra days if Groq returned too many
    if (plan.daily.length > targetDays) {
      plan.daily = plan.daily.slice(0, targetDays);
    }

    plan.days = targetDays;
  }

  // --- Helpers for transport + realistic costs ---
  const deriveTransport = (distanceStr, blockType) => {
    const d = parseFloat(String(distanceStr || "").replace(",", ".")) || 0;
    const distUnit = /km/i.test(distanceStr || "") ? "km" : "miles";

    if (d === 0) return "Walk (same location or very close)";

    if (distUnit === "miles") {
      if (d <= 0.6) return "Walk 5–10 minutes (best option)";
      if (d <= 2) return "Walk or short public transit ride";
      if (d <= 5) return "Taxi/Uber or public transit ~10–20 minutes";
      return "Taxi/Uber ~20–30 minutes";
    } else {
      // km
      if (d <= 1) return "Walk 10–15 minutes (best option)";
      if (d <= 3) return "Walk or short public transit ride";
      if (d <= 8) return "Taxi/Uber or public transit ~10–25 minutes";
      return "Taxi/Uber ~20–30 minutes";
    }
  };

  const baseCostForType = (optType, blockType) => {
    const t = (optType || "").toLowerCase();

    if (t.includes("cafe") || t.includes("coffee") || t.includes("bakery")) {
      return 12; // casual drink/snack
    }
    if (t.includes("restaurant") || t.includes("bistro") || blockType === "dinner") {
      return 40; // decent sit-down meal
    }
    if (blockType === "lunch") {
      return 25;
    }
    if (t.includes("museum") || t.includes("gallery")) {
      return 25; // typical Chicago museum ticket
    }
    if (t.includes("tour") || t.includes("cruise")) {
      return 60; // boat tours, guided tours
    }
    if (t.includes("bar") || t.includes("lounge")) {
      return 30;
    }

    return 20; // generic attraction
  };

  const costRangeForType = (optType, blockType) => {
    const t = (optType || "").toLowerCase();

    if (t.includes("cafe") || t.includes("coffee") || t.includes("bakery")) {
      return [5, 25];
    }
    if (t.includes("restaurant") || t.includes("bistro") || blockType === "dinner") {
      return [15, 120]; // cheap diner → fancy tasting menu
    }
    if (blockType === "lunch") {
      return [10, 50];
    }
    if (t.includes("museum") || t.includes("gallery")) {
      return [10, 40]; // e.g. Field Museum 26–30
    }
    if (t.includes("tour") || t.includes("cruise")) {
      return [30, 200];
    }
    if (t.includes("bar") || t.includes("lounge")) {
      return [15, 80];
    }
    return [10, 80];
  };

  // --- Normalize day blocks + option details ---
  for (const day of plan.daily || []) {
    // Some Groq outputs may use morning/lunch/afternoon keys => normalize
    if (!Array.isArray(day.items) || day.items.length === 0) {
      const blocks = [];
      for (const key of ["morning", "lunch", "afternoon", "dinner", "optional_evening"]) {
        const arr = Array.isArray(day[key]) ? day[key] : null;
        if (!arr || arr.length === 0) continue;

        const timeMap = {
          morning: "07:00–11:00",
          lunch: "11:00–14:00",
          afternoon: "14:00–17:00",
          dinner: "17:00–21:00",
          optional_evening: "20:00–23:30",
        };

        blocks.push({
          time: timeMap[key] || "",
          block_type: key,
          label: key.replace("_", " "),
          options: arr,
        });

        delete day[key]; // drop raw arrays
      }
      if (blocks.length > 0) {
        day.items = blocks;
      }
    }

    for (const block of day.items || []) {
      const blockType = (block.block_type || "").toLowerCase();

      for (const opt of block.options || []) {
        // --- Duration sane defaults ---
        if (!opt.duration_min) {
          if (blockType === "lunch") opt.duration_min = 60;
          else if (blockType === "dinner") opt.duration_min = 90;
          else if (blockType === "afternoon" || blockType === "morning") opt.duration_min = 90;
          else opt.duration_min = 60;
        }

        // --- Transport best guess if missing ---
        if (!opt.transport || !opt.transport.trim()) {
          opt.transport = deriveTransport(opt.distance_from_previous, blockType);
        }

        // --- Cost: realistic, NOT over-scaled ---
        const t = opt.type || "";
        const base = baseCostForType(t, blockType);
        const [minCost, maxCost] = costRangeForType(t, blockType);

        if (!opt.cost_estimate || opt.cost_estimate.amount == null) {
          let amount = base;
          amount = Math.max(minCost, Math.min(maxCost, amount));
          amount = Math.round(amount / 5) * 5;

          opt.cost_estimate = {
            amount,
            currency: cur,
          };
        } else {
          let amount = Number(opt.cost_estimate.amount);

          if (!Number.isFinite(amount)) {
            amount = base;
          }

          // If model gave something crazy (like 1260), clamp to sensible range
          if (amount < minCost || amount > maxCost) {
            amount = Math.max(minCost, Math.min(maxCost, amount));
          }

          amount = Math.round(amount / 5) * 5;

          opt.cost_estimate = {
            amount,
            currency: opt.cost_estimate.currency || cur,
          };
        }

        // --- Fix missing unit in distance_from_previous ---
        if (opt.distance_from_previous && typeof opt.distance_from_previous === "number") {
          opt.distance_from_previous = `${opt.distance_from_previous} mi`;
        }
        if (typeof opt.distance_from_previous === "string") {
          const d = opt.distance_from_previous.trim();
          if (/^\d+(?:\.\d+)?$/.test(d)) {
            opt.distance_from_previous = `${d} mi`;
          }
        }
      }
    }
  }

  /* -----------------------------------------------
   * BUDGET SCALING (soft scaling, 0.7–1.6 range)
   * --------------------------------------------- */
  try {
    const totalDays = plan.days || 1;
    const tripBudget = Number(plan.budget?.amount || 0);

    if (tripBudget > 0) {
      // Estimate sensible per-day cost
      const targetPerDay = tripBudget / totalDays;

      // Compute current per-day cost
      let actualPerDay = 0;
      let count = 0;

      for (const day of plan.daily) {
        for (const block of (day.items || [])) {
          for (const opt of (block.options || [])) {
            const amt = Number(opt.cost_estimate?.amount || 0);
            if (amt > 0) {
              actualPerDay += amt;
              count++;
            }
          }
        }
      }

      if (count > 0) {
        const basePerDay = actualPerDay / count;
        let scale = basePerDay > 0 ? targetPerDay / basePerDay : 1;

        // Soft limits so costs never explode
        scale = Math.max(0.7, Math.min(1.6, scale));

        for (const day of plan.daily) {
          for (const block of day.items || []) {
            for (const opt of block.options || []) {
              const amt = Number(opt.cost_estimate?.amount || 0);
              if (amt > 0) {
                const scaled = Math.round(amt * scale);
                opt.cost_estimate.amount = scaled;
              }
            }
          }
        }
      }
    }
  } catch (e) {
    console.log("Soft scaling error:", e);
  }

  /* ==========================================================
   * HOTELS — budget scaling + ratings & amenities
   * ======================================================== */
  const numericBudget =
    (!Number.isNaN(numericBudgetFromInput) && numericBudgetFromInput) ||
    Number(plan.budget?.amount) ||
    0;

  const nights = targetDays || 1;
  let perNightTarget = 0;
  if (numericBudget > 0 && nights > 0) {
    // Assume ~40% of total trip budget goes to lodging
    perNightTarget = (numericBudget * 0.4) / nights;
  }

  // Ensure we have 3–4 hotels
  if (!Array.isArray(plan.hotels) || plan.hotels.length === 0) {
    plan.hotels = [
      {
        name: `Central Hotel ${destination}`,
        nightly_price: { amount: 140, currency: cur },
        price_level: "moderate",
        check_in: "15:00",
        reason: `Good location for exploring ${destination}.`,
      },
      {
        name: `Budget Stay ${destination}`,
        nightly_price: { amount: 90, currency: cur },
        price_level: "low",
        check_in: "15:00",
        reason: `Budget-friendly, clean rooms with easy transit around ${destination}.`,
      },
      {
        name: `Boutique View ${destination}`,
        nightly_price: { amount: 190, currency: cur },
        price_level: "high",
        check_in: "15:00",
        reason: `Stylish boutique hotel with great reviews and atmosphere in ${destination}.`,
      },
      {
        name: `Family Suites ${destination}`,
        nightly_price: { amount: 150, currency: cur },
        price_level: "moderate",
        check_in: "15:00",
        reason: `Spacious rooms and family-friendly amenities, convenient for exploring ${destination}.`,
      },
    ];
  }

  for (const h of plan.hotels) {
    const level = String(h.price_level || "moderate").toLowerCase();

    // --- Determine realistic range + multiplier by level ---
    let min = 80;
    let max = 220;
    let mult = 1.0;

    if (level === "low") {
      min = 50;
      max = 150;
      mult = 0.7;
    } else if (level === "high") {
      min = 180;
      max = 400;
      mult = 1.4;
    } else if (level === "luxury") {
      min = 250;
      max = 600;
      mult = 1.8;
    }

    // --- Compute nightly price with budget in mind ---
    let amount;

    if (perNightTarget > 0) {
      amount = perNightTarget * mult;
    } else if (h.nightly_price && h.nightly_price.amount != null) {
      amount = Number(h.nightly_price.amount);
    } else {
      amount = (min + max) / 2;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      amount = (min + max) / 2;
    }

    amount = Math.max(min, Math.min(max, amount));
    amount = Math.round(amount / 10) * 10;

    h.nightly_price = {
      amount,
      currency: h.nightly_price?.currency || cur,
    };

    // --- Ratings ---
    if (!h.rating) {
      if (level === "low") h.rating = 3.8;
      else if (level === "high" || level === "luxury") h.rating = 4.6;
      else h.rating = 4.3;
    }

    // --- Amenities ---
    if (!Array.isArray(h.amenities) || h.amenities.length === 0) {
      if (/family/i.test(h.name)) {
        h.amenities = [
          "Free Wi-Fi",
          "Complimentary breakfast",
          "Family rooms",
          "Cribs available on request",
          "On-site parking",
        ];
      } else if (level === "low") {
        h.amenities = [
          "Free Wi-Fi",
          "Complimentary breakfast",
          "24/7 front desk",
        ];
      } else if (level === "high" || level === "luxury") {
        h.amenities = [
          "Free Wi-Fi",
          "On-site restaurant & bar",
          "Fitness center",
          "Spa / wellness services",
          "Concierge service",
          "City views",
        ];
      } else {
        // moderate
        h.amenities = [
          "Free Wi-Fi",
          "On-site restaurant",
          "Fitness center",
          "24/7 front desk",
        ];
      }
    }

    if (!h.check_in) {
      h.check_in = "15:00";
    }

    if (!h.reason) {
      h.reason = `Good base for exploring ${destination}.`;
    }
  }

  return plan;
}


/* ============================================================
 * MOCK PLAN
 * ========================================================== */
function buildMockPlan({ destination, days, currency, language, budget }) {
  const d = Math.max(1, Number(days) || 1);
  const blocks = [
    { key: "morning", time: "07:00–11:00", label: "morning" },
    { key: "lunch", time: "11:00–14:00", label: "lunch" },
    { key: "afternoon", time: "14:00–17:00", label: "afternoon" },
    { key: "dinner", time: "17:00–21:00", label: "dinner" },
    { key: "optional_evening", time: "20:00–23:30", label: "optional evening" },
  ];

  const nameSeeds = {
    morning: ["Museum", "Botanical Garden", "Old Town Walk", "City Park"],
    lunch: ["Famous Diner", "Local Noodle House", "Riverfront Cafe", "Seafood Shack"],
    afternoon: ["Riverwalk", "Observation Deck", "Historic Quarter", "Art District"],
    dinner: ["Steakhouse", "Modern Bistro", "Popular Pizzeria", "Seafood Grill"],
    optional_evening: ["Jazz Club", "Sky Bar", "Night Market", "Rooftop Lounge"],
  };

  const mkOptions = (blockKey) => {
    const seeds = nameSeeds[blockKey] || ["Spot A", "Spot B", "Spot C"]; 
    return [0, 1].map((i) => {
      const name = `${destination} ${seeds[(i) % seeds.length]}`;
      const type =
        blockKey === "lunch" || blockKey === "dinner" ? "restaurant" : blockKey === "optional_evening" ? "bar" : "activity";
      const desc = `A popular ${type} in ${destination} with good reviews.`;
      const dur = blockKey === "dinner" ? 120 : blockKey === "lunch" ? 60 : 90;
      const dist = i === 0 ? "0.5 mi" : "1 mi";
      const transport = i === 0 ? "Walk 8–12 min" : "Taxi 10–15 min";
      const baseCost = type === "restaurant" ? (blockKey === "dinner" ? 45 : 25) : type === "bar" ? 15 : 20;
      return {
        name,
        type,
        description: desc,
        duration_min: dur,
        distance_from_previous: dist,
        transport,
        cost_estimate: { amount: baseCost, currency },
        address: "", // will be resolved on demand
      };
    });
  };

  const daily = Array.from({ length: d }, (_v, idx) => {
    return {
      day: idx + 1,
      title: `Flexible day ${idx + 1}`,
      items: blocks.map((b) => ({ time: b.time, block_type: b.key, label: b.label, options: mkOptions(b.key) })),
    };
  });

  const hotels = [
    {
      name: `${destination} Central Hotel`,
      nightly_price: { amount: 140, currency },
      price_level: "moderate",
      check_in: "15:00",
      reason: `Convenient base for ${destination}.`,
      rating: 4.3,
      amenities: ["Free Wi‑Fi", "On-site restaurant", "Fitness center", "24/7 front desk"],
    },
    {
      name: `${destination} Budget Inn`,
      nightly_price: { amount: 90, currency },
      price_level: "low",
      check_in: "15:00",
      reason: `Affordable choice near transit in ${destination}.`,
      rating: 3.9,
      amenities: ["Free Wi‑Fi", "Complimentary breakfast", "Front desk"],
    },
    {
      name: `${destination} Boutique View`,
      nightly_price: { amount: 190, currency },
      price_level: "high",
      check_in: "15:00",
      reason: `Stylish boutique hotel with views in ${destination}.`,
      rating: 4.6,
      amenities: ["Free Wi‑Fi", "Bar & lounge", "Fitness center"],
    },
  ];

  const tips = [
    "Use cash/card as accepted locally.",
    "Check the weather and pack layers.",
    "Book popular restaurants in advance.",
  ];

  const plan = {
    destination,
    days: d,
    summary: `A ${d}-day plan in ${destination} (fallback mock).`,
    daily,
    hotels,
    tips,
    meta: {
      generated_at: new Date().toISOString(),
      language,
      currency,
    },
    budget: Number(budget) ? { amount: Number(budget), currency } : undefined,
  };

  return plan;
}
