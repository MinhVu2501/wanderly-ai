import { Router } from 'express';
import {
	getAllPlaces,
	getPlaceById,
	createPlace,
	deletePlace,
} from '../controllers/placeController.js';

const router = Router();

router.get('/', getAllPlaces);
router.get('/:id', getPlaceById);
router.post('/', createPlace);
router.delete('/:id', deletePlace);

export default router;


