import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

import aiRoutes from './routes/aiRoutes.js';
import placeRoutes from './routes/placeRoutes.js';
import commentRoutes from './routes/commentRoutes.js';
import waitRoutes from './routes/waitRoutes.js';
import tripRoutes from './routes/tripRoutes.js';
import resolveRoutes from './routes/resolveRoutes.js';
import pool from './db.js';

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Healthcheck
app.get('/health', async (_req, res) => {
	try {
		await pool.query('SELECT 1');
		res.status(200).json({ status: 'ok', db: 'connected' });
	} catch {
		res.status(500).json({ status: 'error', db: 'disconnected' });
	}
});

// Routes
app.use('/api/ai', aiRoutes);
app.use('/api/places', placeRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/wait-time', waitRoutes);
app.use('/api/trip-plan', tripRoutes);
app.use('/api/resolve-place', resolveRoutes);

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
	console.log(`Wanderly AI backend listening on port ${PORT}`);
});


