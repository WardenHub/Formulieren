import { Router } from "express";

import { getMyFeedback, postMyFeedback } from "../controllers/feedbackController.js";

const router = Router();

router.get("/", getMyFeedback);
router.post("/", postMyFeedback);

export default router;
