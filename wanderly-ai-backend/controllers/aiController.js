import 'dotenv/config';
import OpenAI from 'openai';
import axios from 'axios'; // enable for Google Places
import { pool } from '../db.js';

const openaiApiKey = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: openaiApiKey });

export async function getAIRecommendations(req, res) {
	try {
		const { query, language = 'en' } = req.body ?? {};

		if (!openaiApiKey) {
			return res.status(500).json({ error: 'Missing OPENAI_API_KEY' });
		}
		if (!query || typeof query !== 'string') {
			return res.status(400).json({ error: 'query is required' });
		}

		const result = await pool.query('SELECT * FROM places LIMIT 10');

		const prompt = `
      You are a bilingual travel assistant.
      Respond in ${language === 'vi' ? 'Vietnamese' : 'English'}.
      The user asked: "${query}".
      Here are local results from our database: ${JSON.stringify(result.rows)}.
      Suggest a few relevant places with short descriptions.
    `;

		const completion = await openai.chat.completions.create({
			model: 'gpt-4o-mini',
			messages: [{ role: 'user', content: prompt }],
		});

		return res.json({ message: completion.choices[0]?.message?.content ?? '' });
	} catch (error) {
		console.error(error);
		return res.status(500).json({ error: 'Failed to fetch AI recommendations' });
	}
}

// 🧠 Combined AI search logic
export async function searchAIPlaces(req, res) {
	try {
		const { location, query, lang = 'en' } = req.body ?? {};

		// Prefer Google Places (then DB). Yelp remains disabled for now.
		const googleApiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY;
		const GOOGLE_TIMEOUT_MS = 3000;
		const OPENAI_TIMEOUT_MS = 7000;
		let places = [];
		let source = 'db';

		// 1) Google Places Text Search (if key + inputs are provided)
		if (googleApiKey && location && query) {
			try {
				const googleRes = await axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', {
					params: {
						query: `${query} in ${location}`,
						key: googleApiKey,
						language: lang,
					},
					timeout: GOOGLE_TIMEOUT_MS,
				});
				const results = googleRes?.data?.results ?? [];
				if (Array.isArray(results) && results.length > 0) {
					places = results.map((p) => ({
						id: p.place_id,
						name: p.name,
						name_en: p.name,
						name_vi: p.name,
						address: p.formatted_address,
						coordinates: {
							latitude: p.geometry?.location?.lat,
							longitude: p.geometry?.location?.lng,
						},
						photoRef: Array.isArray(p.photos) && p.photos.length > 0 ? p.photos[0]?.photo_reference : null,
						rating: p.rating ?? null,
						user_ratings_total: p.user_ratings_total ?? 0,
						comments: [],
						source: 'google',
					}));
					source = 'google';
				}
			} catch (googleErr) {
				console.warn('Google Places request failed:', googleErr?.message);
				// Will fallback to DB below
			}
		}

		// 2) Fallback to local DB (resilient if tables are not created yet)
		if (places.length === 0) {
			let dbPlaces;
			try {
				dbPlaces = await pool.query(
					`SELECT id, name_en, name_vi, category, latitude, longitude, created_at
         FROM places
         ORDER BY created_at DESC
         LIMIT 5`
				);
			} catch (dbErr) {
				console.warn('DB places query failed (likely tables not created yet):', dbErr?.message);
				dbPlaces = { rows: [] };
			}
			places = (dbPlaces.rows ?? []).map((p) => ({
					id: String(p.id),
					name: p.name_en ?? p.name_vi ?? 'Unknown',
					category: p.category ?? null,
					coordinates: { latitude: p.latitude, longitude: p.longitude },
					source: 'db',
				}));
			source = 'db';
		}

		// 3) Attach comments and avg_rating from local DB when the id is numeric (local places)
		for (const place of places) {
			let comments = [];
			let avg = null;
			try {
				// Only query comments if we have a numeric local place id
				if (/^\\d+$/.test(String(place.id))) {
					const pid = Number(place.id);
					const result = await pool.query(
						'SELECT user_name, comment, rating, created_at FROM comments WHERE place_id = $1 ORDER BY created_at DESC',
						[pid]
					);
					comments = result.rows;
					if (comments.length > 0) {
						const total = comments.reduce((sum, c) => sum + (c.rating || 0), 0);
						avg = Number((total / comments.length).toFixed(1));
					}
				}
			} catch (commentsErr) {
				console.warn('DB comments query failed:', commentsErr?.message);
			}
			place.comments = comments;
			place.avg_rating = avg;
		}

		// Build AI JSON details with estimated waiting time (EN + VI)
		let aiData = null;
		let aiSummaryEn = null;
		let aiSummaryVi = null;
		const withTimeout = (promise, ms) =>
			Promise.race([
				promise,
				new Promise((resolve) => setTimeout(() => resolve(null), ms)),
			]);
		if (openaiApiKey) {
			const prompt = `
You are Wanderly AI. For each place, generate:
- name_en, name_vi (you may copy the name for both if unknown)
- summary_en (2-3 concise sentences), summary_vi (Vietnamese translation, 2-3 sentences)
- estimated_wait_minutes (an integer, typical dining wait estimation based on category/city/peak hours)

Return ONLY valid JSON array, no code fences, no extra text. Shape:
[
  {
    "name_en": "...",
    "name_vi": "...",
    "summary_en": "...",
    "summary_vi": "...",
    "estimated_wait_minutes": 15
  }
]

User Query: "${query ?? ''}" in "${location ?? ''}"
Places Data: ${JSON.stringify(places, null, 2)}
`;
			try {
				const aiRes = await withTimeout(
					openai.chat.completions.create({
						model: 'gpt-4o-mini',
						messages: [{ role: 'user', content: prompt }],
						temperature: 0.6,
					}),
					OPENAI_TIMEOUT_MS
				);
				let raw = (aiRes?.choices?.[0]?.message?.content ?? '');
				raw = (raw || '').trim();
				// Try direct JSON parse, then fallback to extracting first JSON array/object
				try {
					aiData = JSON.parse(raw);
				} catch {
					const match = raw.match(/(\[.*\]|\{.*\})/s);
					if (match) {
						try {
							aiData = JSON.parse(match[0]);
						} catch {
							aiData = null;
						}
					}
				}
				// Ensure array
				if (!Array.isArray(aiData)) {
					aiData = null;
				}
			} catch (aiErr) {
				console.warn('OpenAI request failed:', aiErr?.message);
				aiData = null; // continue without failing the endpoint
			}

			// Also request a bilingual summary (2 short paragraphs)
			const summaryPrompt = `
You are Wanderly AI, a bilingual travel assistant.
Match the paragraph style in the reference screenshot: confident, natural English, proper sentences, bolded place names, ratings in parentheses, and mention review counts when available.

OUTPUT: EXACTLY two paragraphs (no headings, no bullets, no labels):
1) ENGLISH (2–4 sentences, ~55–90 words). Use this structure and tone:
   - Sentence 1: "For a great ${query ?? ''} in ${location ?? ''}, I recommend **{place1}** ( {rating1}/5{, from {reviews1} reviews} ), making it a standout for {cuisine/category if obvious}."
   - Sentence 2: "Another excellent choice is **{place2}** ( {rating2}/5{, from {reviews2} reviews} )."
   - Sentence 3–4 (optional): "If you're looking for more options, **{place3}** and **{place4}** both maintain strong ratings of {rating3} and {rating4}, respectively, and receive positive feedback."
   Fill curly‑brace fields with real data from the provided Places; omit unavailable pieces gracefully. Do NOT include tips like "arrive early".
2) VIETNAMESE: a natural translation of the English paragraph.

STYLE RULES:
- Paragraphs only; no labels like "English:" or "Vietnamese:".
- Bold names like **PhoLove**. Show ratings as (4.7/5) and, if present, include "from N reviews".
- Avoid repeating the city name more than once.
- Do not invent addresses; rely only on given data.
- Keep sentences tight, readable, and in active voice.

PLACES (use up to 6 most relevant):
${JSON.stringify(places.slice(0, 6), null, 2)}
`;
			try {
				const aiRes2 = await withTimeout(
					openai.chat.completions.create({
						model: 'gpt-4o-mini',
						messages: [{ role: 'user', content: summaryPrompt }],
						temperature: 0.4,
					}),
					OPENAI_TIMEOUT_MS
				);
				const text = ((aiRes2?.choices?.[0]?.message?.content) ?? '').trim();
				// naive split by double newline into two paragraphs
				const parts = text.split(/\n\s*\n/);
				if (parts.length >= 2) {
					aiSummaryEn = parts[0];
					aiSummaryVi = parts[1];
				} else {
					aiSummaryEn = text;
					aiSummaryVi = null;
				}
			} catch (errSummary) {
				console.warn('OpenAI summary failed:', errSummary?.message);
			}
		}

		return res.json({
			places,
			ai_details: Array.isArray(aiData) && aiData.length > 0 ? aiData : fallbackSummaries(places, lang, location),
			ai_summary_en: aiSummaryEn ?? fallbackSummaryText(places, location, 'en'),
			ai_summary_vi: aiSummaryVi ?? fallbackSummaryText(places, location, 'vi'),
			source,
		});
	} catch (error) {
		console.error(error);
		return res.status(500).json({ error: 'AI search failed' });
	}
}

function fallbackSummaries(places, lang, location) {
	// Basic heuristic for estimated wait time
	function estimateWait(rating, total) {
		const base = 10;
		const busyBonus = Math.min(20, Math.floor((total || 0) / 500) * 5); // more reviews -> busier
		const ratingAdj = rating ? Math.max(0, Math.floor((rating - 3.5) * 5)) : 0; // higher rating -> more demand
		const est = base + busyBonus + ratingAdj;
		return Math.max(5, Math.min(est, 45));
	}
	return (places || []).map((p) => {
		const name = p.name || p.name_en || p.name_vi || 'Unknown';
		const rating = p.rating ?? p.avg_rating ?? null;
		const total = p.user_ratings_total ?? null;
		const address = p.address || p.formatted_address || '';
		const wait = estimateWait(rating, total);
		const summaryEn = `Popular spot in ${location || 'this area'}${rating ? ` (rating ${rating}/5)` : ''}. Expect around ${wait} minutes of waiting during typical hours. ${address ? `Address: ${address}.` : ''}`;
		const summaryVi = `Địa điểm được ưa chuộng tại ${location || 'khu vực này'}${rating ? ` (điểm đánh giá ${rating}/5)` : ''}. Ước tính chờ khoảng ${wait} phút vào giờ cao điểm. ${address ? `Địa chỉ: ${address}.` : ''}`;
		return {
			name_en: name,
			name_vi: name,
			summary_en: summaryEn,
			summary_vi: summaryVi,
			estimated_wait_minutes: wait,
		};
	});
}

function fallbackSummaryText(places, location, lang = 'en') {
	const top = (places || []).slice(0, 5);
	const city = location || 'this area';
	const parts = top.map((p) => {
		const name = p.name || p.name_en || p.name_vi || 'Unknown';
		const rating = p.rating ?? p.avg_rating;
		return `**${name}**${rating ? ` (${Number(rating).toFixed(1)}/5)` : ''}`;
	});
	if (lang === 'vi') {
		return `Tại ${city}, các lựa chọn nổi bật gồm ${parts.join(', ')}. Đây đều là những địa điểm được đánh giá cao với hương vị ổn định và phục vụ thân thiện. Hãy đến sớm hoặc tránh giờ cao điểm để có trải nghiệm thoải mái hơn.`;
	}
	return `In ${city}, top picks include ${parts.join(', ')}. These spots are well‑rated for consistent flavors and friendly service. Arrive early or avoid peak hours for a smoother experience.`;
}

// Proxy Google Places photo to avoid exposing API key to the client
export async function photoProxy(req, res) {
	try {
		const ref = req.query.ref;
		if (!ref) return res.status(400).json({ error: 'ref is required' });
		const googleApiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY;
		if (!googleApiKey) return res.status(500).json({ error: 'Missing Google API key' });

		const upstream = await axios.get('https://maps.googleapis.com/maps/api/place/photo', {
			params: { maxwidth: 640, photo_reference: ref, key: googleApiKey },
			responseType: 'arraybuffer',
			validateStatus: () => true,
		});

		const contentType = upstream.headers['content-type'] || 'image/jpeg';
		res.set('Content-Type', contentType);
		res.set('Cache-Control', 'public, max-age=86400');
		return res.status(upstream.status || 200).send(Buffer.from(upstream.data));
	} catch (err) {
		console.error('photoProxy error:', err);
		return res.status(500).json({ error: 'Failed to fetch photo' });
	}
}


