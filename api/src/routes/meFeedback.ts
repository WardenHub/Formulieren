import { Router } from "express";

import { deleteMyFeedback, getMyFeedback, postMyFeedback, putMyFeedback } from "../controllers/feedbackController.js";

const router = Router();

router.get("/", getMyFeedback);
router.post("/", postMyFeedback);
router.put("/:feedbackId", putMyFeedback);
router.delete("/:feedbackId", deleteMyFeedback);

export default router;
