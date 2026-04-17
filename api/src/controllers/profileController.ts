// /api/src/controllers/profileController.ts

import type { Request, Response } from "express";
import * as service from "../services/profileService.js";

export async function getMyProfile(req: any, res: Response) {
  try {
    const data = await service.getMyProfile(req.user);
    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "getMyProfile failed" });
  }
}

export async function updateMyProfile(req: any, res: Response) {
  try {
    const data = await service.updateMyProfile(req.body || {}, req.user);
    return res.json(data);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err?.message || "updateMyProfile failed" });
  }
}

export async function uploadMyAvatar(req: any, res: Response) {
  try {
    const data = await service.uploadMyAvatar(req.file, req.user);
    return res.json(data);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err?.message || "uploadMyAvatar failed" });
  }
}

export async function deleteMyAvatar(req: any, res: Response) {
  try {
    const data = await service.deleteMyAvatar(req.user);
    return res.json(data);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err?.message || "deleteMyAvatar failed" });
  }
}

export async function uploadMySignature(req: any, res: Response) {
  try {
    const data = await service.uploadMySignature(req.file, req.user);
    return res.json(data);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err?.message || "uploadMySignature failed" });
  }
}

export async function deleteMySignature(req: any, res: Response) {
  try {
    const data = await service.deleteMySignature(req.user);
    return res.json(data);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err?.message || "deleteMySignature failed" });
  }
}