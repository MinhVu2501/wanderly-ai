import { Router } from 'express';
import { submitWaitTime } from '../controllers/waitController.js';

const router = Router();

router.post('/', submitWaitTime);

export default router;


