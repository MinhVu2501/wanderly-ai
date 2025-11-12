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

		// Build single-language summary prompt
		let aiText = null;
		if (openaiApiKey) {
			const languageName = lang === 'vi' ? 'Vietnamese' : 'English';
			const prompt = `
You are Wanderly AI, a travel assistant. Respond ONLY in ${languageName}.
Summarize and recommend the following places based on ratings and any available comments.
Keep it concise (2–4 sentences).

User Query: "${query ?? ''}" in "${location ?? ''}"

Places data:
${JSON.stringify(places, null, 2)}

Output: One short paragraph in ${languageName} only.
`;
			try {
				const aiRes = await openai.chat.completions.create({
					model: 'gpt-4o-mini',
					messages: [{ role: 'user', content: prompt }],
				});
				aiText = aiRes.choices?.[0]?.message?.content ?? null;
			} catch (aiErr) {
				console.warn('OpenAI request failed:', aiErr?.message);
				aiText = null; // continue without failing the endpoint
			}
		}

		return res.json({
			places,
			ai_summary: aiText,
			source,
		});
	} catch (error) {
		console.error(error);
		return res.status(500).json({ error: 'AI search failed' });
	}
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


