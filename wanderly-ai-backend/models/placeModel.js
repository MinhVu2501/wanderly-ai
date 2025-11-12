import { query } from '../db.js';

export async function getAllPlaces() {
	const result = await query(
		`SELECT
       id,
       name_en AS "nameEn",
       name_vi AS "nameVi",
       category,
       description_en AS "descriptionEn",
       description_vi AS "descriptionVi",
       latitude,
       longitude,
       user_created AS "userCreated",
       created_by AS "createdBy",
       created_at AS "createdAt"
     FROM places
     ORDER BY id DESC`
	);
	return result.rows;
}

export async function getPlaceById(id) {
	const result = await query(
		`SELECT
       id,
       name_en AS "nameEn",
       name_vi AS "nameVi",
       category,
       description_en AS "descriptionEn",
       description_vi AS "descriptionVi",
       latitude,
       longitude,
       user_created AS "userCreated",
       created_by AS "createdBy",
       created_at AS "createdAt"
     FROM places
     WHERE id = $1`,
		[id]
	);
	return result.rows[0] ?? null;
}

export async function createPlace({
	nameEn,
	nameVi,
	category,
	descriptionEn,
	descriptionVi,
	latitude,
	longitude,
	userCreated = false,
	createdBy,
}) {
	const result = await query(
		`INSERT INTO places (
       name_en, name_vi, category, description_en, description_vi,
       latitude, longitude, user_created, created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING
       id,
       name_en AS "nameEn",
       name_vi AS "nameVi",
       category,
       description_en AS "descriptionEn",
       description_vi AS "descriptionVi",
       latitude,
       longitude,
       user_created AS "userCreated",
       created_by AS "createdBy",
       created_at AS "createdAt"`,
		[
			nameEn ?? null,
			nameVi ?? null,
			category ?? null,
			descriptionEn ?? null,
			descriptionVi ?? null,
			latitude ?? null,
			longitude ?? null,
			userCreated ?? false,
			createdBy ?? null,
		]
	);
	return result.rows[0];
}

export async function updatePlace(
	id,
	{
		nameEn,
		nameVi,
		category,
		descriptionEn,
		descriptionVi,
		latitude,
		longitude,
		userCreated,
		createdBy,
	}
) {
	const result = await query(
		`UPDATE places
     SET
       name_en = COALESCE($2, name_en),
       name_vi = COALESCE($3, name_vi),
       category = COALESCE($4, category),
       description_en = COALESCE($5, description_en),
       description_vi = COALESCE($6, description_vi),
       latitude = COALESCE($7, latitude),
       longitude = COALESCE($8, longitude),
       user_created = COALESCE($9, user_created),
       created_by = COALESCE($10, created_by)
     WHERE id = $1
     RETURNING
       id,
       name_en AS \"nameEn\",
       name_vi AS \"nameVi\",
       category,
       description_en AS \"descriptionEn\",
       description_vi AS \"descriptionVi\",
       latitude,
       longitude,
       user_created AS \"userCreated\",
       created_by AS \"createdBy\",
       created_at AS \"createdAt\"`,
		[
			id,
			nameEn ?? null,
			nameVi ?? null,
			category ?? null,
			descriptionEn ?? null,
			descriptionVi ?? null,
			latitude ?? null,
			longitude ?? null,
			userCreated ?? null,
			createdBy ?? null,
		]
	);
	return result.rows[0] ?? null;
}

export async function deletePlace(id) {
	const result = await query(`DELETE FROM places WHERE id = $1`, [id]);
	return result.rowCount > 0;
}


