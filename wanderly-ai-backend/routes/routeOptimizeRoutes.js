import express from "express";
import { optimizeRoute } from "../controllers/routeOptimizeController.js";

const router = express.Router();

router.post("/optimize-route", optimizeRoute);

export default router;
