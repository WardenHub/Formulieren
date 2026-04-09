// /api/src/routes/home.ts
import { Router } from "express";
import { getHomeNews, getHomeNewsImage } from "../controllers/homeNewsController.js";

const router = Router();

router.get("/news", getHomeNews);
router.get("/news/image", getHomeNewsImage);

export default router;