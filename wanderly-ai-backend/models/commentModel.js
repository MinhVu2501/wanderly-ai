import { query } from '../db.js';

export async function getCommentsByPlaceId(placeId) {
	const result = await query(
		`SELECT
       id,
       place_id AS "placeId",
       user_name AS "userName",
       comment,
       rating,
       created_at AS "createdAt"
     FROM comments
     WHERE place_id = $1
     ORDER BY created_at DESC`,
		[placeId]
	);
	return result.rows;
}

export async function addComment({ placeId, userName, comment, rating }) {
	const result = await query(
		`INSERT INTO comments (place_id, user_name, comment, rating)
     VALUES ($1, $2, $3, $4)
     RETURNING
       id,
       place_id AS "placeId",
       user_name AS "userName",
       comment,
       rating,
       created_at AS "createdAt"`,
		[placeId, userName ?? null, comment, rating ?? null]
	);
	return result.rows[0];
}

export async function updateComment(id, { userName, comment, rating }) {
	const result = await query(
		`UPDATE comments
     SET
       user_name = COALESCE($2, user_name),
       comment = COALESCE($3, comment),
       rating = COALESCE($4, rating)
     WHERE id = $1
     RETURNING
       id,
       place_id AS "placeId",
       user_name AS "userName",
       comment,
       rating,
       created_at AS "createdAt"`,
		[id, userName ?? null, comment ?? null, rating ?? null]
	);
	return result.rows[0] ?? null;
}

export async function deleteComment(id) {
	const result = await query(`DELETE FROM comments WHERE id = $1`, [id]);
	return result.rowCount > 0;
}


