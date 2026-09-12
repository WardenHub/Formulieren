// /api/src/routes/offlineClient.ts
import { Router } from "express";

import { getLatestOfflineClient } from "../controllers/offlineClientController.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = Router();

/* De downloadlink van Ember Offline. Bewust geen vaste URL in de frontend: deze route leest
   het manifest bij elke vraag en maakt er dan pas een kortlevende link bij, zodat er geen
   moment bestaat waarop iemand een oudere versie aangeboden krijgt. */
router.get("/latest", requireRole("admin", "gebruiker"), getLatestOfflineClient);

export default router;
