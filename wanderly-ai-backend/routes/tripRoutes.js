import { Router } from 'express';
import { createTripPlan, createTripPlanV3 } from '../controllers/tripController.js';

const router = Router();

router.post('/', createTripPlan);
router.post('/plan-v3', createTripPlanV3);

export default router;


