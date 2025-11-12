import { pool } from '../db.js';

// 🟢 Get all places
export async function getAllPlaces(_req, res) {
	try {
		const result = await pool.query('SELECT * FROM places ORDER BY created_at DESC');
		return res.json(result.rows);
	} catch (error) {
		console.error(error);
		return res.status(500).json({ error: 'Failed to fetch places' });
	}
}

// 🟢 Get single place
export async function getPlaceById(req, res) {
	try {
		const { id } = req.params;
		const result = await pool.query('SELECT * FROM places WHERE id = $1', [id]);
		if (result.rows.length === 0) return res.status(404).json({ error: 'Place not found' });
		return res.json(result.rows[0]);
	} catch (error) {
		console.error(error);
		return res.status(500).json({ error: 'Failed to fetch place' });
	}
}

// 🟢 Add new place
export async function createPlace(req, res) {
	try {
		const {
			name_en,
			name_vi,
			category,
			description_en,
			description_vi,
			latitude,
			longitude,
			created_by,
		} = req.body ?? {};

		if (!name_en || latitude == null || longitude == null) {
			return res.status(400).json({ error: 'Missing required fields' });
		}

		const query = `
      INSERT INTO places (name_en, name_vi, category, description_en, description_vi, latitude, longitude, user_created, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8)
      RETURNING *;
    `;

		const values = [
			name_en,
			name_vi ?? null,
			category ?? null,
			description_en ?? null,
			description_vi ?? null,
			latitude,
			longitude,
			created_by ?? null,
		];

		const result = await pool.query(query, values);
		return res.status(201).json(result.rows[0]);
	} catch (error) {
		console.error(error);
		return res.status(500).json({ error: 'Failed to create place' });
	}
}

// 🟢 Delete user-created place
export async function deletePlace(req, res) {
	try {
		const { id } = req.params;
		const check = await pool.query('SELECT * FROM places WHERE id = $1', [id]);
		if (check.rows.length === 0) return res.status(404).json({ error: 'Place not found' });
		if (!check.rows[0].user_created) {
			return res.status(403).json({ error: 'Cannot delete non-user-created place' });
		}
		await pool.query('DELETE FROM places WHERE id = $1', [id]);
		return res.json({ message: 'Place deleted successfully' });
	} catch (error) {
		console.error(error);
		return res.status(500).json({ error: 'Failed to delete place' });
	}
}


