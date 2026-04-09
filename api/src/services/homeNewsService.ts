// /api/src/services/homeNewsService.ts

type HomeNewsItem = {
  title: string,
  link: string,
  date: string | null,
  image_url: string | null,
};

function decodeXmlEntities(input: string): string {
  if (!input) return "";

  return input
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : "";
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : "";
    })
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function extractTag(block: string, tagName: string): string {
  const rx = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, "i");
  const m = block.match(rx);
  return decodeXmlEntities((m?.[1] || "").trim());
}

function parseItems(xml: string, take: number): HomeNewsItem[] {
  const itemBlocks = Array.from(
    xml.matchAll(/<item\b[\s\S]*?<\/item>/gi),
    m => m[0]
  );

  return itemBlocks
    .slice(0, take)
    .map((block) => {
      const title = extractTag(block, "title");
      const link = extractTag(block, "link");
      const date = extractTag(block, "dc:date") || null;
      const imageUrl = extractTag(block, "xwiki:image") || null;

      return {
        title,
        link,
        date,
        image_url: imageUrl,
      };
    })
    .filter((x) => x.title && x.link);
}

function getRssAuthHeader() {
  const user = process.env.HOME_NEWS_RSS_USER || "";
  const password = process.env.HOME_NEWS_RSS_PASSWORD || "";

  if (!user || !password) return null;
  return `Basic ${Buffer.from(`${user}:${password}`, "utf8").toString("base64")}`;
}

export async function fetchHomeNews(): Promise<HomeNewsItem[]> {
  const url = process.env.HOME_NEWS_RSS_URL || "";
  const take = Number(process.env.HOME_NEWS_TAKE || 5);
  const timeoutMs = Number(process.env.HOME_NEWS_TIMEOUT_MS || 2500);
  const auth = getRssAuthHeader();

  if (!url || !auth) {
    console.warn("[home-news] missing rss env config");
    return [];
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: auth,
        Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn("[home-news] upstream rss failed", res.status);
      return [];
    }

    const xml = await res.text();
    return parseItems(xml, take);
  } catch (err: any) {
    console.warn("[home-news] fetch failed", {
      message: err?.message || String(err),
      cause: err?.cause?.message || null,
      name: err?.name || null,
      url,
    });
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchHomeNewsImage(url: string): Promise<{ buffer: Buffer, contentType: string | null } | null> {
  const auth = getRssAuthHeader();
  const timeoutMs = Number(process.env.HOME_NEWS_TIMEOUT_MS || 2500);

  if (!auth) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: auth,
        Accept: "image/*,*/*;q=0.8",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn("[home-news-image] upstream image failed", res.status);
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = res.headers.get("content-type");

    return { buffer, contentType };
  } catch (err: any) {
    console.warn("[home-news-image] fetch failed", {
      message: err?.message || String(err),
      cause: err?.cause?.message || null,
      name: err?.name || null,
      url,
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}