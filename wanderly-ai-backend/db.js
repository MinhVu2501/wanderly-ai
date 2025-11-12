import 'dotenv/config';
import { Pool } from 'pg';

const { DATABASE_URL } = process.env;

let pool;

if (DATABASE_URL) {
	pool = new Pool({
		connectionString: DATABASE_URL,
		ssl: { rejectUnauthorized: false },
	});
} else {
	const {
		DB_HOST = 'localhost',
		DB_PORT = '5432',
		DB_USER,
		DB_PASSWORD,
		DB_NAME,
		DB_SSL = 'false',
	} = process.env;

	pool = new Pool({
		host: DB_HOST,
		port: Number(DB_PORT),
		user: DB_USER,
		password: DB_PASSWORD,
		database: DB_NAME,
		ssl: DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
	});
}

export const query = (text, params) => pool.query(text, params);
export { pool };
export default pool;


