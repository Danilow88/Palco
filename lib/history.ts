export type HistoryItem = {
  title: string;
  total: number;
  at: number;
  kind: "original" | "youtube";
};

export type RecentVideo = {
  videoId: string;
  title: string;
  channel: string;
  karaokeLikely: boolean;
};

const HISTORY = "palco-history";
const RECENT = "palco-recent";

export function readHistory(): HistoryItem[] {
  return readList(HISTORY)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Partial<HistoryItem>;
      if (typeof row.title !== "string" || typeof row.total !== "number" || typeof row.at !== "number") return null;
      if (row.kind !== "original" && row.kind !== "youtube") return null;
      return { title: row.title.slice(0, 140), total: Math.max(0, Math.min(100, row.total)), at: row.at, kind: row.kind };
    })
    .filter((item): item is HistoryItem => item !== null)
    .slice(0, 8);
}

export function pushHistory(item: HistoryItem): HistoryItem[] {
  const next = [item, ...readHistory()].slice(0, 8);
  write(HISTORY, next);
  return next;
}

export function readRecent(): RecentVideo[] {
  return readList(RECENT)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Partial<RecentVideo>;
      if (typeof row.videoId !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(row.videoId)) return null;
      if (typeof row.title !== "string") return null;
      return {
        videoId: row.videoId,
        title: row.title.slice(0, 140),
        channel: typeof row.channel === "string" ? row.channel.slice(0, 80) : "",
        karaokeLikely: Boolean(row.karaokeLikely),
      };
    })
    .filter((item): item is RecentVideo => item !== null)
    .slice(0, 6);
}

export function pushRecent(video: RecentVideo): void {
  const next = [video, ...readRecent().filter((item) => item.videoId !== video.videoId)].slice(0, 6);
  write(RECENT, next);
}

function readList(key: string): unknown[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function write(key: string, value: unknown): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}
