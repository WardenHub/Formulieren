import { Router } from "express";
import { requireRole } from "../middleware/roleMiddleware.js";
import * as controller from "../controllers/kamQueueController.js";

const router = Router();

// De werklijst is van de KAM-coördinator. Beheerders mogen meekijken; dat is toezicht en
// geen verwerking, want het definitief maken zit achter de afrondrol van de definitie.
router.get(
  "/queue",
  requireRole("kam_coordinator", "admin", "documentbeheerder"),
  controller.getKamQueue
);

export default router;
