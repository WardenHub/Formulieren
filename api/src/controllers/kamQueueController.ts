import type { Response } from "express";
import * as service from "../services/kamQueueService.js";

export async function getKamQueue(req: any, res: Response) {
  try {
    const data = await service.getKamQueue({ query: req.query || {} });
    return res.json(data);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: "getKamQueue failed" });
  }
}
