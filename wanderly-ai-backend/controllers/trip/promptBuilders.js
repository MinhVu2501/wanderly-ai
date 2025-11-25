/**
 * Build trip planning prompt (V1)
 */
export function buildTripPrompt({ destination, days, interests, travelStyle, budget, currency, language }) {
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

/**
 * Build SKELETON prompt for gpt-oss-20b (V3)
 */
export function buildTripSkeletonPromptV3({
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
- Each day MUST have these 8 blocks in this exact order:
  1) morning     ("08:00 - 10:30")
  2) midday      ("10:45 - 12:00")
  3) lunch       ("12:00 - 13:30")
  4) afternoon   ("14:00 - 17:00")
  5) evening     ("17:00 - 18:30")
  6) dinner      ("18:30 - 20:00")
  7) night       ("20:00 - 23:30")
  8) late_night  ("23:30 - 03:00")
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
        { "time": "08:00 - 10:30", "section": "morning",    "options": [] },
        { "time": "10:45 - 12:00", "section": "midday",     "options": [] },
        { "time": "12:00 - 13:30", "section": "lunch",      "options": [] },
        { "time": "14:00 - 17:00", "section": "afternoon",  "options": [] },
        { "time": "17:00 - 18:30", "section": "evening",    "options": [] },
        { "time": "18:30 - 20:00", "section": "dinner",     "options": [] },
        { "time": "20:00 - 23:30", "section": "night",      "options": [] },
        { "time": "23:30 - 03:00", "section": "late_night", "options": [] }
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

/**
 * Build REAL FILL prompt for llama-3.3-70b (V3)
 */
export function buildTripRealFillPromptV3({
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

CRITICAL RULES - PRESERVE SKELETON STRUCTURE:
- KEEP THE EXACT SAME TOP-LEVEL STRUCTURE from the skeleton.
- Do NOT modify "hotels" array - keep it exactly as provided in skeleton.
- Do NOT modify "flight" object - keep it exactly as provided in skeleton.
- Do NOT modify "travelStyle" object - keep it exactly as provided in skeleton.
- Do NOT modify day.hotel objects - keep them exactly as provided in skeleton.
- Do NOT remove or reorder days.
- Do NOT remove or reorder blocks.
- ONLY MODIFY: block.options - fill each block with 2–4 REAL places.
- NO free time, NO placeholders, NO mock, NO relax option, NO hotel-based fake.
- Every option must be a real verified POI inside the same city.
- NEVER repeat the same place twice.
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
- Blocks (morning, midday, lunch, afternoon, evening, dinner, night, late_night) are already defined in skeleton.
- For each block's "options", add 3–4 real places (ALWAYS generate 3-4 options, never fewer).
- MORNING/MIDDAY/AFTERNOON/EVENING: Activities, attractions, viewpoints, parks, museums, shopping areas (NOT restaurants)
- LUNCH/DINNER: Restaurants only
  * For LUXURY travel type: ONLY fine dining, Michelin-starred, or high-end acclaimed restaurants ($150-400+ per person)
    Examples: Alinea, Ever, Oriole, Kasama, Smyth, Indienne, Moody Tongue, Temporis, Next, Acadia
    NO casual restaurants, NO diners, NO budget options
    Research real prices: Capella Hanoi ~$500-1000/night, fine dining restaurants in Hanoi ~$150-300/person
  * For MODERATE: Mid-range restaurants ($30-100 per person)
  * For BUDGET: Casual restaurants ($10-30 per person)
- NIGHT/LATE_NIGHT: Nightlife activities, bars, speakeasies, night markets, live music venues (NOT dinner restaurants)
- ALL options MUST be specific real places (name + address). NO free time, NO placeholders.

RESTAURANT DEDUPLICATION RULE (CRITICAL):
- NEVER repeat the same restaurant name across ANY day or meal time.
- Each restaurant should appear ONLY ONCE in the entire trip itinerary.
- If you see a restaurant in lunch of Day 1, DO NOT use it in dinner of Day 2, or lunch of Day 3, or ANY other time.
- Generate 3-4 UNIQUE restaurants for EACH lunch/dinner block across all days.
- Example: If "La Badiane" is in Day 1 lunch, it must NOT appear in Day 2 dinner or Day 3 lunch.
- Track all restaurant names you've used and ensure each one is unique throughout the entire trip.

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
- estimatedCost (number in USD, per person - must match real-world pricing)
- cost_estimate (object: { amount: number, currency: "USD" }) - alternative format
- mustTryDish (required for restaurants, else "")
- recommendedDrink (required for cafes and bars, else "")
- tip (one-line practical tip, no line breaks)
- rating (number 1.0–5.0)
- label ("Top Pick" | "Very Popular" | "Relaxed Option" | "Best for Photos" | "Budget Option")
- tags (array of 1–4 short tags like ["ramen", "late night"]) 

COST RULES (based on Travel Type "${travelType}" - MUST MATCH REAL PRICES):
- Restaurants (lunch, dinner) must have realistic prices matching the travel type AND destination:
  * LUXURY/HIGH in major cities (Hanoi, Paris, NYC, Tokyo, etc.):
    - Fine dining restaurants: $150-400+ per person
    - Michelin-starred restaurants: $250-500+ per person
    - Research actual prices: La Badiane Hanoi ~$50-100/person, not $200+
    - Capella Hanoi hotel restaurants: ~$100-150/person
    - Match prices to the actual destination's cost of living
  * LUXURY/HIGH in mid-tier cities: $100-300 per person
  * MODERATE: Mid-range restaurants $30-100 per person (adjust for destination)
  * BUDGET/LOW: Casual restaurants $10-30 per person (adjust for destination)
- Cafes, bars: realistic drink/snack prices matching travel type and destination.
- Museums, attractions: realistic ticket prices for the destination.
- Only parks/streets/walks may have estimatedCost = 0.
- For luxury trips, dinner/lunch MUST be high-end restaurants, but prices should reflect the destination's actual cost of living.
- ALWAYS set both estimatedCost (number) AND cost_estimate: { amount: number, currency: "USD" } for consistency.
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

HOTELS ARRAY (PRESERVE FROM SKELETON):
- DO NOT modify the "hotels" array - copy it exactly as-is from the skeleton.
- DO NOT modify any hotel objects in skeleton.days[n].hotel - keep them exactly as provided.
- The hotels structure is already correct from the skeleton - preserve it completely.

DUPLICATE RULE (STRICT):
- Do NOT repeat the same place name in different blocks or days.
- RESTAURANTS: Each restaurant name must appear ONLY ONCE across the entire trip (all days, all meal times).
- If you must re-use a non-restaurant place, add a suffix like "— D2 Lunch" to the name, but avoid this for restaurants.
- Generate a diverse list of 3-4 unique options for each block.

SKELETON TO FILL (keep structure, fill options & costs):
${skeletonJson}

Return ONLY valid JSON. No markdown, no comments.
`.trim();
}

/**
 * Build trip prompt V3 (legacy)
 */
export function buildTripPromptV3({
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

9. EVENING block (17:00–18:30) must always include a real place:
   - MUST be a real restaurant, real cafe, real museum, real viewpoint, or real attraction.
   - NO "free time" placeholders.
   - NO "Free time in city" or generic activities.
   - Include real address, distance, transport, and cost estimate.
   - Must have valid coordinates (lat, lng).

10. LATE_NIGHT block (23:30–03:00) must always include a real nightlife spot:
   - MUST be a real bar, rooftop, club, lounge, comedy club, or late-night restaurant.
   - If the city has limited nightlife, use a real 24/7 cafe or real 24/7 diner.
   - Or use a famous viewpoint or landmark that stays open late (e.g., Times Square, observation decks).
   - NO placeholder activities.
   - NO "free time" placeholders.
   - Must include real address, distance, transport, and cost.
   - Must have valid coordinates (lat, lng).

BLOCK STRUCTURE (MANDATORY):
- morning:     08:00 – 10:30
- midday:      10:45 – 12:00
- lunch:       12:00 – 13:30
- afternoon:   14:00 – 17:00
- evening:     17:00 – 18:30  ← MUST be a REAL place (restaurant, cafe, museum, attraction). NO "free time".
- dinner:      18:30 – 20:00
- night:       20:00 – 23:30
- late_night:  23:30 – 03:00  ← MUST be a REAL nightlife spot (bar, club, lounge, 24/7 cafe/diner). NO placeholders.

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
- CRITICAL: EVENING (17:00–18:30) must be a REAL place with real address and coordinates. NO "free time".
- CRITICAL: LATE_NIGHT (23:30–03:00) must be a REAL nightlife spot, 24/7 cafe, or late-night diner. NO placeholders.

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

