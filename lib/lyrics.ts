import type { TimedLine } from "./types";

const LRC = /^\[(\d{1,2}):(\d{1,2}(?:[.,]\d{1,3})?)\]\s*(.*)$/;

export function linesFromText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 80);
}

export function parseLyricInput(text: string, duration: number): TimedLine[] {
  const raw = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 80);
  if (!raw.length) return [];
  const stamped: TimedLine[] = [];
  let lrcCount = 0;
  for (const line of raw) {
    const match = LRC.exec(line);
    if (!match) continue;
    lrcCount += 1;
    const minutes = Number(match[1]);
    const seconds = Number(match[2].replace(",", "."));
    const lyric = match[3].trim();
    if (!lyric) continue;
    stamped.push({ text: lyric, at: minutes * 60 + seconds });
  }
  if (lrcCount >= Math.ceil(raw.length / 2) && stamped.length) {
    return stamped.sort((a, b) => a.at - b.at);
  }
  const plain = raw
    .map((line) => {
      const match = LRC.exec(line);
      return (match ? match[3] : line).trim();
    })
    .filter(Boolean);
  return autoTime(plain, duration);
}

export function autoTime(lines: string[], duration: number): TimedLine[] {
  if (!lines.length) return [];
  const safeDuration = Number.isFinite(duration) && duration > 8 ? duration : Math.max(30, lines.length * 4);
  const start = Math.min(5, safeDuration * 0.1);
  const end = Math.max(start + lines.length, safeDuration * 0.9);
  const step = (end - start) / lines.length;
  return lines.map((text, index) => ({ text, at: round2(start + step * index) }));
}

export function shiftLines(lines: TimedLine[], delta: number): TimedLine[] {
  return lines.map((line) => ({ ...line, at: round2(Math.max(0, line.at + delta)) }));
}

export function anchorLine(lines: TimedLine[], index: number, time: number): TimedLine[] {
  if (!lines.length || index < 0 || index >= lines.length) return lines;
  const next = lines.map((line) => ({ ...line }));
  next[index] = { ...next[index], at: round2(Math.max(0, time)) };
  for (let i = index + 1; i < next.length; i++) {
    if (next[i].at <= next[i - 1].at + 0.35) next[i] = { ...next[i], at: round2(next[i - 1].at + 0.8) };
  }
  for (let i = index - 1; i >= 0; i--) {
    if (next[i].at >= next[i + 1].at - 0.35) next[i] = { ...next[i], at: round2(Math.max(0, next[i + 1].at - 0.8)) };
  }
  return next;
}

export function currentLineIndex(lines: TimedLine[], time: number): number {
  let index = -1;
  for (let i = 0; i < lines.length; i++) {
    if (time + 0.05 >= lines[i].at) index = i;
    else break;
  }
  return index;
}

const DRAFT_PREFIX = "palco-lyric:";

export function loadLyricDraft(videoId: string): string {
  if (typeof localStorage === "undefined") return "";
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + videoId);
    if (!raw) return "";
    const data = JSON.parse(raw) as { text?: unknown };
    return typeof data.text === "string" ? data.text.slice(0, 4000) : "";
  } catch {
    return "";
  }
}

export function saveLyricDraft(videoId: string, text: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(DRAFT_PREFIX + videoId, JSON.stringify({ text: text.slice(0, 4000) }));
  } catch {
    /* storage full or private mode */
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
