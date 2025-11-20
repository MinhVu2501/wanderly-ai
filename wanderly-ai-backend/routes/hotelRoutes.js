import express from 'express';
import { suggestHotelsV3 } from '../controllers/hotelController.js';

const router = express.Router();

router.post('/hotels-v3', suggestHotelsV3);

export default router;
