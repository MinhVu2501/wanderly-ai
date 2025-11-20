import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function optimizeRoute(req, res) {
  try {
    const { stops = [], hotel } = req.body || {};

    if (!Array.isArray(stops) || !hotel) {
      return res.status(400).json({ error: "Missing hotel or stops" });
    }

    // Flatten to lightweight list for AI ordering
    const places = stops.map((b) => {
      const opt = Array.isArray(b?.options) ? b.options[0] : null;
      return {
        name: opt?.name || "",
        lat: opt?.lat,
        lng: opt?.lng,
        section: b?.section || "",
        time: b?.time || "",
      };
    });

    const prompt = `You are a routing expert. Reorder these stops into the optimal shortest realistic route. Start at the hotel, visit all places once, and end near the hotel. Return ONLY JSON in this exact shape: { "order": [ "stopName1", "stopName2", ... ] }\n\nHotel: ${JSON.stringify({ name: hotel?.name, lat: hotel?.lat, lng: hotel?.lng })}\n\nStops: ${JSON.stringify(places)}`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return only JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 2000,
    });

    const text = completion.choices?.[0]?.message?.content || "{}";
    let orderJson;
    try {
      orderJson = JSON.parse(text);
    } catch {
      orderJson = { order: places.map((p) => p.name) };
    }

    const order = Array.isArray(orderJson?.order) ? orderJson.order : places.map((p) => p.name);

    // Sort original blocks according to the ordered names
    const nameToBlock = new Map();
    stops.forEach((b) => {
      const opt = Array.isArray(b?.options) ? b.options[0] : null;
      const key = String(opt?.name || "").toLowerCase();
      if (key) nameToBlock.set(key, b);
    });

    const optimizedStops = order
      .map((n) => nameToBlock.get(String(n || "").toLowerCase()))
      .filter(Boolean);

    // Fallback: if AI returned mismatched names, keep original
    const result = optimizedStops.length ? optimizedStops : stops;

    return res.json({ optimizedStops: result });
  } catch (e) {
    console.error("optimizeRoute ERR:", e);
    return res.status(500).json({ error: "Failed to optimize route" });
  }
}
