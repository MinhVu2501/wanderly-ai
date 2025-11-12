import { pool } from '../db.js';

// 🟢 Get comments for a place
export async function getCommentsByPlace(req, res) {
	try {
		const { placeId } = req.params;
		const result = await pool.query(
			'SELECT * FROM comments WHERE place_id = $1 ORDER BY created_at DESC',
			[placeId]
		);
		return res.json(result.rows);
	} catch (error) {
		console.error(error);
		return res.status(500).json({ error: 'Failed to fetch comments' });
	}
}

// 🟢 Add new comment
export async function addComment(req, res) {
	try {
		const { place_id, user_name, comment, rating } = req.body ?? {};
		if (!place_id || !user_name || !comment) {
			return res.status(400).json({ error: 'Missing required fields' });
		}
		const query = `
      INSERT INTO comments (place_id, user_name, comment, rating)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
		const result = await pool.query(query, [place_id, user_name, comment, rating || null]);
		return res.status(201).json(result.rows[0]);
	} catch (error) {
		console.error(error);
		return res.status(500).json({ error: 'Failed to add comment' });
	}
}

// 🟢 Delete a comment (only by author)
export async function deleteComment(req, res) {
	try {
		const { id } = req.params;
		const { user_name } = req.body ?? {};
		const check = await pool.query('SELECT * FROM comments WHERE id = $1', [id]);
		if (check.rows.length === 0) return res.status(404).json({ error: 'Comment not found' });
		if (check.rows[0].user_name !== user_name) {
			return res.status(403).json({ error: 'You can delete only your own comment' });
		}
		await pool.query('DELETE FROM comments WHERE id = $1', [id]);
		return res.json({ message: 'Comment deleted successfully' });
	} catch (error) {
		console.error(error);
		return res.status(500).json({ error: 'Failed to delete comment' });
	}
}


