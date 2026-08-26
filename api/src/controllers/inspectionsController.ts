import type { Response } from "express";
import * as service from "../services/inspectionService.js";

function respondError(res: Response, error: any, fallback: string) {
  if (["TIMEOUT", "UNAVAILABLE", "CONFIGURATION", "BAD_RESPONSE"].includes(String(error?.category || ""))) return res.status(503).json({ error: "atrium reader unavailable" });
  if (String(error?.category || "") === "VALIDATION") return res.status(400).json({ error: "atrium reader request invalid" });
  const message = String(error?.message || error || "");
  const lower = message.toLowerCase();
  if (lower.includes("version conflict")) return res.status(409).json({ error: message });
  if (lower.includes("not found")) return res.status(404).json({ error: message });
  if (lower.includes("reader timeout") || lower.includes("reader query failed") || lower.includes("reader configuration")) return res.status(503).json({ error: message });
  if (lower.includes("required") || lower.includes("invalid") || lower.includes("missing") || lower.includes("remain open") || lower.includes("transition")) return res.status(400).json({ error: message });
  console.error(error);
  return res.status(500).json({ error: fallback });
}

export async function list(req: any, res: Response) { try { return res.json(await service.listInspectionCases(req.query)); } catch (e) { return respondError(res,e,"list inspections failed"); } }
export async function overview(req: any, res: Response) { try { return res.json(await service.listInspectionOverview(req.query)); } catch (e) { return respondError(res,e,"list inspection overview failed"); } }
export async function get(req: any, res: Response) { try { return res.json(await service.getInspectionCase(req.params.caseId)); } catch (e) { return respondError(res,e,"get inspection failed"); } }
export async function create(req: any, res: Response) { try { return res.status(201).json(await service.createInspectionCase(req.body,req.user)); } catch (e) { return respondError(res,e,"create inspection failed"); } }
export async function update(req: any, res: Response) { try { return res.json(await service.updateInspectionCase(req.params.caseId,req.body,req.user)); } catch (e) { return respondError(res,e,"update inspection failed"); } }
export async function assignment(req: any, res: Response) { try { return res.json(await service.updateInspectionAssignment(req.params.caseId,req.body,req.user)); } catch (e) { return respondError(res,e,"update inspection assignment failed"); } }
export async function refresh(req: any, res: Response) { try { return res.json(await service.refreshInspectionWorkOrders(req.params.caseId,req.user)); } catch (e) { return respondError(res,e,"refresh inspection work orders failed"); } }
export async function checklist(req: any, res: Response) { try { return res.json(await service.updateChecklistItem(req.params.caseId,req.params.requirementId,req.body,req.user)); } catch (e) { return respondError(res,e,"update inspection checklist failed"); } }
export async function preparePackage(req: any, res: Response) { try { return res.status(201).json(await service.preparePackage(req.params.caseId,req.body,req.user)); } catch (e) { return respondError(res,e,"prepare inspection package failed"); } }
export async function sendPackage(req: any, res: Response) { try { return res.json(await service.sendPackage(req.params.caseId,req.params.packageId,req.body,req.user)); } catch (e) { return respondError(res,e,"send inspection package failed"); } }
export async function report(req: any, res: Response) { try { return res.status(201).json(await service.registerReport(req.params.caseId,req.body,req.user)); } catch (e) { return respondError(res,e,"register inspection report failed"); } }
export async function conclusion(req: any, res: Response) { try { return res.json(await service.processConclusion(req.params.caseId,req.body,req.user)); } catch (e) { return respondError(res,e,"process inspection conclusion failed"); } }
export async function reinspection(req: any, res: Response) { try { return res.status(201).json(await service.createReinspection(req.params.caseId,req.body,req.user)); } catch (e) { return respondError(res,e,"create reinspection failed"); } }
export async function complete(req: any, res: Response) { try { return res.json(await service.completeInspectionCase(req.params.caseId,req.body,req.user)); } catch (e) { return respondError(res,e,"complete inspection failed"); } }
export async function signal(req: any, res: Response) { try { return res.json(await service.signalInspectionCases(req.user)); } catch (e) { return respondError(res,e,"signal inspections failed"); } }
export async function events(req: any, res: Response) { try { return res.json(await service.getInspectionCaseEvents(req.params.caseId)); } catch (e) { return respondError(res,e,"get inspection audit failed"); } }
