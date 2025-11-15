import 'dotenv/config';
import OpenAI from 'openai';
import axios from 'axios';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Main AI search endpoint: returns places, bilingual summaries, and estimated wait times
export async function searchAIPlaces(req, res) {
  try {
    const { location, query, lang: uiLang } = req.body ?? {};
    if (!query || !location) {
      return res.status(400).json({ error: 'query is required' });
    }

    const googleKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY;
    let places = [];

    // 1) Google Places Text Search
    try {
      const g = await axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', {
        params: { query: `${query} in ${location}`, key: googleKey, language: 'en' },
        timeout: 4000,
      });
      const results = g?.data?.results ?? [];
      places = results.slice(0, 8).map((p) => ({
        id: p?.place_id,
        name: p?.name,
        address: p?.formatted_address,
        rating: p?.rating ?? null,
        user_ratings_total: p?.user_ratings_total ?? 0,
        coordinates: {
          latitude: p?.geometry?.location?.lat,
          longitude: p?.geometry?.location?.lng,
        },
        // include photoRef for map hover image
        photoRef: Array.isArray(p?.photos) && p.photos.length > 0 ? p.photos[0]?.photo_reference : null,
      }));
    } catch (err) {
      console.error('Google Places request failed:', err?.message);
    }

    // 2) Estimated wait time (simple heuristic)
    const estimate = (rating, reviews) => {
      const r = Number(rating || 0);
      const rev = Number(reviews || 0);
      const minutes = Math.max(5, Math.min(40, Math.round(8 + Math.max(0, r - 3.8) * 6 + Math.min(20, Math.floor(rev / 300) * 4))));
      return minutes;
    };

    const ai_details = (places || []).map((p) => ({
      name_en: p?.name || '',
      estimated_wait_minutes: estimate(p?.rating, p?.user_ratings_total),
    }));

    // 3) Build summaries (EN primary, VI via translation; if UI=vi and translation fails, try direct VI)
    let ai_summary_en = '';
    let ai_summary_vi = '';

    const compact = (places || []).map((p) => ({
      name: p?.name,
      rating: p?.rating,
      reviews: p?.user_ratings_total,
    }));

    try {
      const enPrompt = `You are a concise travel writer. Write ONE English paragraph (70–110 words) describing the best ${query} options in ${location}.
Strictly follow this style:
- Mention 3–5 standout places with names in bold, e.g., **PhoLove**.
- Show ratings in parentheses and review counts when available, e.g., (4.7/5 from 120 reviews).
- No lists or bullets. No extra labels. No tips.
Use ONLY the data provided:\n${JSON.stringify(compact, null, 2)}`;

      const r = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: enPrompt }],
        temperature: 0.4,
      });
      ai_summary_en = (r?.choices?.[0]?.message?.content || '').trim();
    } catch (e) {
      console.error('EN summary error:', e?.message);
    }

    try {
      if (ai_summary_en) {
        const rv = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'Translate the user content into natural Vietnamese. Return only the translated paragraph.' },
            { role: 'user', content: ai_summary_en },
          ],
          temperature: 0.2,
        });
        ai_summary_vi = (rv?.client ? rv.client : rv)?.choices?.[0]?.message?.content?.trim?.() || '';
        if (!ai_summary_vi) {
          ai_summary_vi = (rv?.choices?.[0]?.message?.content || '').trim();
        }
      }
    } catch (e) {
      console.error('VI translation error:', e?.message);
    }

    if ((!ai_summary_vi || ai_summary_vi.length < 8) && uiLang === 'vi') {
      try {
        const viPrompt = `Bạn là biên tập viên du lịch. Viết MỘT đoạn văn tiếng Việt (70–110 từ) giới thiệu các quán ${query} nổi bật tại ${location}.
Yêu cầu định dạng:
- Nêu 3–5 quán tiêu biểu, tên in đậm (Markdown) ví dụ **PhoLove**.
- Ghi điểm đánh giá trong ngoặc và số lượt đánh giá nếu có, ví dụ (4.7/5 từ 120 lượt đánh giá).
- Không dùng gạch đầu dòng, không tiêu đề, không mẹo vặt. Chỉ một đoạn văn.
Chỉ dùng dữ liệu sau:\n${JSON.stringify(compact, null, 2)}`;
        const rv2 = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: viPrompt }],
          temperature: 0.4,
        });
        ai_summary_vi = (rv2?.choices?.[0]?.message?.content || '').trim();
      } catch (e) {
        console.error('VI direct summary error:', e?.message);
      }
    }

    // Fallbacks
    if (!ai_summary_en) {
      const picks = (places || []).slice(0, 4).map((p) => {
        const rr = p?.rating ? `${p.rating.toFixed ? p.rating.toFixed(1) : p.rating}/5` : '';
        const rv = p?.user_ratings_total ? ` from ${p.user_ratings_total} reviews` : '';
        return `**${p?.name || ''}**${rr ? ` (${rr}${rv})` : ''}`;
      });
      ai_summary_en = picks.length
        ? `Top picks include ${picks.join(', ')}. These spots are well‑rated for consistent flavors and friendly service.`
        : 'No AI summary available.';
    }
    if (!ai_summary_vi && ai_summary_en) {
      ai_summary_vi = ai_summary_en; // last-resort fallback
    }

    return res.json({ places, ai_summary_en, ai_summary_vi, ai_details });
  } catch (e) {
    console.error('searchAIPlaces error:', e);
    return res.status(500).json({ error: 'AI search failed' });
  }
}

// Proxy Google Places photos so the client can preview images without exposing the API key
export async function photoProxy(req, res) {
  try {
    const ref = req.query.ref;
    const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY;
    if (!ref || !key) return res.status(400).json({ error: 'missing parameters' });

    const upstream = await axios.get('https://maps.googleapis.com/maps/api/place/photo', {
      params: { maxwidth: 480, photo_reference: ref, key },
      responseType: 'arraybuffer',
      validateStatus: () => true,
    });

    const ct = upstream.headers['content-type'] || 'image/jpeg';
    res.set('Content-Type', ct);
    res.set('Cache-Control', 'public, max-age=86400');
    return res.status(upstream.status || 200).send(Buffer.from(upstream.data));
  } catch (err) {
    console.error('photoProxy error:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch photo' });
  }
}

// Resolve a free-text place name to coordinates and details using Google Places
export async function resolvePlace(req, res) {
  try {
    const query = (req.query.query || '').toString();
    const location = (req.query.location || '').toString();
    const language = (req.query.lang || 'en').toString();
    const reqType = (req.query.type || '').toString().toLowerCase();
    const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY;
    if (!key) return res.status(400).json({ error: 'Missing Google API key' });
    if (!query) return res.status(400).json({ error: 'Missing query' });

    // Optional: find a city center for the provided location to bias results
    let center = null;
    if (location) {
      try {
        const centerRes = await axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', {
          params: { query: location, key, language },
          timeout: 4000,
          validateStatus: () => true,
        });
        const firstCity = Array.isArray(centerRes?.data?.results) ? centerRes.data.results[0] : null;
        if (firstCity?.geometry?.location?.lat && firstCity?.geometry?.location?.lng) {
          center = {
            lat: firstCity.geometry.location.lat,
            lng: firstCity.geometry.location.lng,
          };
        }
      } catch {
        // ignore
      }
    }

    // Map requested type to Places type if possible
    const allowedTypes = {
      restaurant: 'restaurant',
      hotel: 'lodging',
      lodging: 'lodging',
      cafe: 'cafe',
      bar: 'bar',
      park: 'park',
      museum: 'museum',
      attraction: 'tourist_attraction',
      activity: 'tourist_attraction',
    };
    const mappedType = allowedTypes[reqType] || undefined;

    // 1) Text Search to find top candidate, biased to destination center if known
    const tsParams = {
      query: location ? `${query} in ${location}` : query,
      key,
      language,
    };
    if (center) {
      tsParams.location = `${center.lat},${center.lng}`;
      tsParams.radius = 30000; // 30km bias around destination
    }
    if (mappedType) {
      tsParams.type = mappedType;
    }
    const ts = await axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', {
      params: tsParams,
      timeout: 4000,
      validateStatus: () => true,
    });
    const first = Array.isArray(ts?.data?.results) ? ts.data.results[0] : null;
    if (!first) return res.status(404).json({ error: 'No results' });

    const base = {
      place_id: first.place_id,
      name: first.name,
      address: first.formatted_address,
      rating: first.rating ?? null,
      user_ratings_total: first.user_ratings_total ?? 0,
      price_level: typeof first.price_level === 'number' ? first.price_level : null,
      coordinates: {
        latitude: first?.geometry?.location?.lat ?? null,
        longitude: first?.geometry?.location?.lng ?? null,
      },
      photoRef: Array.isArray(first?.photos) && first.photos.length > 0 ? first.photos[0]?.photo_reference : null,
    };

    // 2) Optional details lookup for website/phone/hours
    let details = {};
    try {
      if (base.place_id) {
        const det = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
          params: {
            place_id: base.place_id,
            key,
            language,
            fields: 'formatted_phone_number,international_phone_number,website,opening_hours,price_level',
          },
          timeout: 3000,
          validateStatus: () => true,
        });
        const d = det?.data?.result || {};
        details = {
          phone: d.international_phone_number || d.formatted_phone_number || null,
          website: d.website || null,
          price_level: typeof d.price_level === 'number' ? d.price_level : base.price_level ?? null,
          opening_hours: d.opening_hours?.weekday_text || null,
        };
      }
    } catch (e) {
      // best-effort; ignore details failure
    }

    return res.json({ ...base, ...details });
  } catch (err) {
    console.error('resolvePlace error:', err?.message);
    return res.status(500).json({ error: 'Failed to resolve place' });
  }
}

