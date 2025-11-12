import { Router } from 'express';
import {
	getCommentsByPlace,
	addComment,
	deleteComment,
} from '../controllers/commentController.js';

const router = Router();

router.get('/:placeId', getCommentsByPlace);
router.post('/', addComment);
router.delete('/:id', deleteComment);

export default router;


