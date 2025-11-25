import "dotenv/config";
import Groq from "groq-sdk";
import axios from "axios";

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
  // Use generic area names based on the destination city
  const cityName = to.split(',')[0].trim(); // Get just the city name
  const areas = [
    "Downtown",
    "City Center", 
    "Historic District",
    "Waterfront",
    "Business District",
    "Cultural Quarter"
  ];

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
    const area = areas[i % areas.length];

    base.push({
      id: `hotel_${i + 1}`,
      name: `${cityName} ${travelType} Hotel ${i + 1}`,
      address: `${area}, ${cityName}`,
      area: area,
      lat: 0, // Will be set by actual hotel search
      lng: 0, // Will be set by actual hotel search
      nightlyPrice: nightly,
      currency: "USD",
      rating: 4.0 + (i % 3) * 0.2,
      url: "https://example.com",
      description: `Comfortable base in ${area} for exploring ${cityName}.`,
    });
  }
  return { hotels: base };
}

function estimatePriceFromRating(rating, travelType) {
  // Estimate price based on rating and travel type
  const baseRanges = {
    economy: [60, 160],
    comfort: [140, 280],
    premium: [280, 700],
    luxury: [800, 2000],
  };
  
  const [min, max] = baseRanges[travelType] || baseRanges.comfort;
  const ratingFactor = (rating || 4.0) / 5.0;
  return Math.round(min + (max - min) * ratingFactor);
}

async function searchRealHotelsFromGoogle({ to, travelType, count = 5 }) {
  const googleKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY;
  if (!googleKey) return null;

  try {
    // Map travelType to hotel quality search terms
    const qualityTerms = {
      economy: "budget hotel",
      comfort: "3 star hotel",
      premium: "4 star hotel",
      luxury: "5 star luxury hotel"
    };
    
    const searchTerm = `${qualityTerms[travelType] || "hotel"} in ${to}`;
    
    const response = await axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', {
      params: {
        query: searchTerm,
        type: 'lodging',
        key: googleKey,
        language: 'en',
      },
      timeout: 5000,
    });

    const results = response?.data?.results || [];
    
    if (results.length === 0) return null;

    const hotels = results.slice(0, count).map((place, idx) => {
      // Extract neighborhood/area from address or use city center
      const addressParts = (place.formatted_address || "").split(",");
      const area = addressParts.length > 1 ? addressParts[addressParts.length - 2].trim() : to.split(',')[0].trim();
      
      return {
        id: place.place_id || `hotel_${idx + 1}`,
        name: place.name || `Hotel ${idx + 1}`,
        address: place.formatted_address || `${area}, ${to}`,
        area: area,
        lat: place.geometry?.location?.lat || 0,
        lng: place.geometry?.location?.lng || 0,
        nightlyPrice: estimatePriceFromRating(place.rating, travelType),
        currency: "USD",
        rating: place.rating || 4.0,
        url: place.website || `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
        description: place.name ? `${place.name} located in ${area}` : `Hotel in ${area}`,
      };
    });

    return { hotels };
  } catch (err) {
    console.warn("Google Places hotel search failed:", err?.message);
    return null;
  }
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

    // Try Google Places API first for real hotels
    const realHotels = await searchRealHotelsFromGoogle({ to, travelType, count: 8 });
    if (realHotels && Array.isArray(realHotels.hotels) && realHotels.hotels.length > 0) {
      return res.json({ hotels: realHotels.hotels });
    }

    // Fallback to LLM-based hotel generation with strict real hotel requirements
    if (!process.env.GROQ_API_KEY) {
      return res.json(buildHotelMock({ to, travelType }));
    }

    const prompt = buildHotelPromptV3({ to, startDate, endDate, travelType, budget, language });

    const raw = await generateJsonFromGroq(prompt);

    let data;
    try {
      data = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (err) {
      try {
        const cleaned = sanitizePotentialJson(raw);
        data = cleaned ? JSON.parse(cleaned) : null;
      } catch (e2) {
        try {
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
      return res.json(buildHotelMock({ to, travelType }));
    }

    return res.json({ hotels: data.hotels });
  } catch (err) {
    console.error("suggestHotelsV3 Error:", err);
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

CRITICAL RULES - REAL HOTELS ONLY:
1. ONLY return VERIFIED REAL hotels that exist in "${to}". NO made-up names. NO generic placeholders like "Hotel 1", "Hotel 2".
2. Use ONLY actual hotel names that can be found on Google Maps, Booking.com, or official hotel websites.
3. Real addresses must be actual street addresses in "${to}", not generic locations.
4. Use actual neighborhoods/districts from "${to}" - e.g., for Chicago use "Loop", "River North", "Gold Coast", "Magnificent Mile", "Lincoln Park", etc.
5. NO fictional hotels. NO generic names. If you don't know a real hotel name, DO NOT make one up.
6. JSON-SAFE: single-line strings only, no line breaks, no bullets.
7. Match hotel class and prices to travelType:
   - economy → 2–3★, approx 60–180 USD/night
   - comfort → 3–4★, approx 140–280 USD/night
   - premium → 4–5★, approx 280–700 USD/night
   - luxury → 5★, high-end only, approx 800–2500 USD/night
8. Prices must be realistic for "${to}" but clearly different between economy, comfort, premium, and luxury.
9. Output ONLY JSON matching the schema. No explanations.

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
      "area": "Downtown",
      "lat": 41.8781,
      "lng": -87.6298,
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
