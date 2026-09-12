// /api/src/controllers/offlineClientController.ts
import type { Response } from "express";

import * as offlineClientService from "../services/offlineClientService.js";

export async function getLatestOfflineClient(_req: any, res: Response) {
  try {
    const result = await offlineClientService.getLatestOfflineClient();
    return res.json(result);
  } catch (err: any) {
    /* Geen release kunnen aanbieden is vervelend maar niet iets waar een scherm op hoort te
       breken; het menu-item toont dan gewoon dat het even niet lukt. */
    console.error("[OFFLINE CLIENT] manifest lezen mislukt", err?.message || err);
    return res.status(503).json({
      available: false,
      reason: "de downloadgegevens zijn nu niet op te halen; probeer het later opnieuw",
    });
  }
}
