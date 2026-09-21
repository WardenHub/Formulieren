import { DefaultAzureCredential } from "@azure/identity";

const credential = new DefaultAzureCredential();
const cache = new Map<string, { jobTitle: string | null; expiresAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function isDevAuthEnabled() {
  return String(process.env.NODE_ENV || "").toLowerCase() === "development"
    && String(process.env.DEV_AUTH || "").trim() === "1";
}

export async function getEntraJobTitle(userObjectId: string) {
  const cleanUserObjectId = clean(userObjectId);
  if (!cleanUserObjectId) throw new Error("user object id missing");

  if (isDevAuthEnabled()) {
    return clean(process.env.DEV_USER_JOB_TITLE);
  }

  const cached = cache.get(cleanUserObjectId);
  if (cached && cached.expiresAt > Date.now()) return cached.jobTitle;

  const token = await credential.getToken("https://graph.microsoft.com/.default");
  if (!token?.token) throw new Error("entra profile unavailable");

  let response: Response;
  try {
    response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cleanUserObjectId)}?$select=id,jobTitle`,
      { headers: { Authorization: `Bearer ${token.token}` } }
    );
  } catch {
    throw new Error("entra profile unavailable");
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[GRAPH] jobTitle lookup failed", response.status, detail);
    throw new Error("entra profile unavailable");
  }

  const body = await response.json();
  const jobTitle = clean(body?.jobTitle);
  cache.set(cleanUserObjectId, { jobTitle, expiresAt: Date.now() + CACHE_TTL_MS });
  return jobTitle;
}
