// /api/src/controllers/homeNewsController.ts
import type { Request, Response } from "express";
import { fetchHomeNews, fetchHomeNewsImage } from "../services/homeNewsService.js";

export async function getHomeNews(req: Request, res: Response) {
  try {
    const items = await fetchHomeNews();
    res.json({ items });
  } catch (err) {
    console.warn("[home-news] returning empty result due to error");
    res.json({ items: [] });
  }
}

export async function getHomeNewsImage(req: Request, res: Response) {
  try {
    const url = String(req.query.url || "").trim();
    if (!url) {
      res.status(400).end();
      return;
    }

    const result = await fetchHomeNewsImage(url);
    if (!result) {
      res.status(404).end();
      return;
    }

    res.setHeader("Content-Type", result.contentType || "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=900");
    res.send(result.buffer);
  } catch (err) {
    console.warn("[home-news-image] failed");
    res.status(404).end();
  }
}