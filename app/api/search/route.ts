import { requireIdentity } from "../../../cursor/identity.js";
import { buildSearchQuery, decodeTitle, karaokeLikely, safeThumbnail } from "@/lib/youtube";
import type { SearchHit } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const buckets = new Map<string, { n: number; reset: number }>();
const cache = new Map<string, { at: number; results: SearchHit[] }>();
const WINDOW_MS = 60_000;
const LIMIT = 20;
const CACHE_MS = 10 * 60_000;

export async function GET(request: Request) {
  const identity = await requireIdentity(request);
  if (identity instanceof Response) return identity;

  const key = process.env.YOUTUBE_API_KEY?.trim() ?? "";
  const url = new URL(request.url);
  const rawQuery = url.searchParams.get("q") ?? "";
  const mode = url.searchParams.get("mode") ?? "karaoke";
  if (!rawQuery.trim()) {
    return Response.json({ configured: key.length > 0, results: [] });
  }
  if (!key) {
    return Response.json({ configured: false, results: [], error: "missing-key" });
  }

  const query = buildSearchQuery(rawQuery, mode);
  if (!query) {
    return Response.json({ configured: true, results: [], error: "short-query" }, { status: 400 });
  }

  const actor = identity.sub || String(identity.userId || "anon");
  if (!allow(actor)) {
    return Response.json({ configured: true, results: [], error: "rate" }, { status: 429 });
  }

  const cacheKey = `${mode}:${query.toLowerCase()}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return Response.json({ configured: true, results: hit.results });
  }

  const endpoint = new URL("https://www.googleapis.com/youtube/v3/search");
  endpoint.searchParams.set("part", "snippet");
  endpoint.searchParams.set("type", "video");
  endpoint.searchParams.set("videoEmbeddable", "true");
  endpoint.searchParams.set("safeSearch", "moderate");
  endpoint.searchParams.set("maxResults", "8");
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("key", key);

  let response: Response;
  try {
    response = await fetch(endpoint, { signal: AbortSignal.timeout(8000), cache: "no-store" });
  } catch {
    return Response.json({ configured: true, results: [], error: "upstream" }, { status: 502 });
  }
  if (!response.ok) {
    const status = response.status === 403 || response.status === 400 ? "rejected" : "upstream";
    return Response.json({ configured: true, results: [], error: status }, { status: 502 });
  }

  const payload = (await response.json()) as {
    items?: Array<{
      id?: { videoId?: string };
      snippet?: {
        title?: string;
        channelTitle?: string;
        thumbnails?: { medium?: { url?: string }; high?: { url?: string } };
      };
    }>;
  };

  const results: SearchHit[] = [];
  for (const item of payload.items ?? []) {
    const videoId = item.id?.videoId ?? "";
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) continue;
    const title = decodeTitle(item.snippet?.title ?? "Vídeo do YouTube");
    const thumb = item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.high?.url;
    results.push({
      videoId,
      title,
      channel: decodeTitle(item.snippet?.channelTitle ?? ""),
      thumbnail: safeThumbnail(videoId, thumb),
      karaokeLikely: karaokeLikely(title),
    });
  }
  cache.set(cacheKey, { at: Date.now(), results });
  if (cache.size > 200) cache.clear();
  return Response.json({ configured: true, results });
}

function allow(id: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(id);
  if (!bucket || now > bucket.reset) {
    buckets.set(id, { n: 1, reset: now + WINDOW_MS });
    if (buckets.size > 2000) buckets.clear();
    return true;
  }
  if (bucket.n >= LIMIT) return false;
  bucket.n += 1;
  return true;
}
