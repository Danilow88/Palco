export type YoutubeMode = "karaoke" | "instrumental" | "video";

const ID = /^[A-Za-z0-9_-]{11}$/;

export function parseYouTubeId(input: string): string | null {
  const text = input.trim();
  if (ID.test(text)) return text;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return ID.test(id) ? id : null;
  }
  const youtubeHost =
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtube-nocookie.com";
  if (!youtubeHost) return null;
  const fromQuery = url.searchParams.get("v") ?? "";
  if (ID.test(fromQuery)) return fromQuery;
  const parts = url.pathname.split("/").filter(Boolean);
  const marker = parts.findIndex((part) => part === "embed" || part === "shorts" || part === "live");
  const id = marker >= 0 ? parts[marker + 1] ?? "" : "";
  return ID.test(id) ? id : null;
}

export function watchUrl(videoId: string): string | null {
  if (!ID.test(videoId)) return null;
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function karaokeLikely(title: string): boolean {
  return /karaoke|karaok[eê]|instrumental|playback|sem voz|no vocal|backing|pista/i.test(title);
}

export function buildSearchQuery(q: string, mode: string): string | null {
  const clean = q.replace(/[\u0000-\u001F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (clean.length < 2) return null;
  if (mode === "instrumental") return `${clean} instrumental OR playback`;
  if (mode === "video") return clean;
  return `${clean} karaoke`;
}

export function safeThumbnail(videoId: string, candidate?: string): string {
  if (candidate && new RegExp(`^https://i\\.ytimg\\.com/vi/${videoId}/`).test(candidate)) return candidate;
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

export function decodeTitle(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}
