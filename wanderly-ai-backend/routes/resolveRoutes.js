import express from 'express';
import { resolvePlace } from '../controllers/aiController.js';

const router = express.Router();

router.get('/', resolvePlace);

export default router;


