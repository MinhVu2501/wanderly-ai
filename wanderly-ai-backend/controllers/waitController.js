import { pool } from '../db.js';

export async function submitWaitTime(req, res) {
	try {
		const { place_id, wait_minutes } = req.body ?? {};
		const minutesNum = Number(wait_minutes);
		if (!place_id) return res.status(400).json({ error: 'place_id is required' });
		if (!minutesNum || minutesNum <= 0) return res.status(400).json({ error: 'wait_minutes must be > 0' });

		console.log(`Wait time submitted: place=${place_id} minutes=${minutesNum}`);

		// Optional: try saving if a table exists, but ignore failures in MVP
		try {
			await pool.query(
				'INSERT INTO wait_times (place_id, wait_minutes, submitted_at) VALUES ($1, $2, NOW())',
				[place_id, minutesNum]
			);
		} catch (dbErr) {
			// Table may not exist yet – ignore for MVP
		}

		return res.json({ success: true, message: 'Thank you for submitting your wait time!' });
	} catch (err) {
		console.error('submitWaitTime error:', err);
		return res.status(500).json({ error: 'Failed to submit wait time' });
	}
}


