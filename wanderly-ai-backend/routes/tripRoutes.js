import { Router } from 'express';
import { createTripPlan } from '../controllers/tripController.js';

const router = Router();

router.post('/', createTripPlan);

export default router;


