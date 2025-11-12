import { Router } from 'express';
import { searchAIPlaces, photoProxy } from '../controllers/aiController.js';

const router = Router();

router.post('/search', searchAIPlaces);
router.get('/photo', photoProxy);

export default router;


