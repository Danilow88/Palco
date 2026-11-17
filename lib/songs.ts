import type { ChordHit, LyricLine, Song } from "./types";

const VOICING: Record<string, { bass: number; notes: number[] }> = {
  C: { bass: 48, notes: [60, 64, 67] },
  G: { bass: 55, notes: [59, 62, 67] },
  Am: { bass: 57, notes: [60, 64, 69] },
  F: { bass: 53, notes: [57, 60, 65] },
};

type WordDef = { text: string; midi: number };

function barsOf(intro: string[], cycle: string[], times: number, outro: string[]): string[] {
  const body = Array.from({ length: times }, () => cycle).flat();
  return [...intro, ...body, ...outro];
}

function makeSong(opts: {
  id: string;
  title: string;
  bpm: number;
  key: string;
  style: Song["style"];
  bars: string[];
  lineStartBar: number;
  barsPerLine: number;
  lines: WordDef[][];
}): Song {
  const beat = 60 / opts.bpm;
  const bar = beat * 4;
  const chords: ChordHit[] = opts.bars.map((name, index) => {
    const voice = VOICING[name] ?? VOICING.C;
    return { at: round3(index * bar), dur: round3(bar * 0.96), bass: voice.bass, notes: voice.notes };
  });
  const lines: LyricLine[] = opts.lines.map((words, index) => {
    const lineAt = (opts.lineStartBar + index * opts.barsPerLine) * bar;
    const span = opts.barsPerLine * bar;
    const last = Math.max(words.length - 1, 1);
    return {
      words: words.map((word, wordIndex) => ({
        text: word.text,
        midi: word.midi,
        at: round3(lineAt + span * (words.length === 1 ? 0.18 : 0.1 + 0.72 * (wordIndex / last))),
      })),
    };
  });
  return {
    id: opts.id,
    title: opts.title,
    artist: "Banda Palco",
    bpm: opts.bpm,
    key: opts.key,
    style: opts.style,
    duration: round3(opts.bars.length * bar),
    lines,
    chords,
  };
}

const luz = makeSong({
  id: "luz-do-palco",
  title: "Luz do Palco",
  bpm: 96,
  key: "Dó maior",
  style: "straight",
  bars: barsOf(["C", "C"], ["C", "G", "Am", "F"], 4, ["C", "C"]),
  lineStartBar: 2,
  barsPerLine: 2,
  lines: [
    [
      { text: "Abre", midi: 60 },
      { text: "a", midi: 64 },
      { text: "cortina", midi: 67 },
      { text: "agora", midi: 64 },
    ],
    [
      { text: "Segura", midi: 65 },
      { text: "o", midi: 67 },
      { text: "microfone", midi: 69 },
      { text: "comigo", midi: 67 },
    ],
    [
      { text: "A", midi: 69 },
      { text: "luz", midi: 71 },
      { text: "desce", midi: 69 },
      { text: "no", midi: 67 },
      { text: "rosto", midi: 64 },
    ],
    [
      { text: "E", midi: 64 },
      { text: "o", midi: 64 },
      { text: "palco", midi: 67 },
      { text: "acende", midi: 69 },
      { text: "o", midi: 67 },
      { text: "chão", midi: 64 },
    ],
    [
      { text: "Pode", midi: 67 },
      { text: "errar", midi: 69 },
      { text: "o", midi: 71 },
      { text: "agudo", midi: 72 },
    ],
    [
      { text: "Que", midi: 71 },
      { text: "o", midi: 69 },
      { text: "peito", midi: 67 },
      { text: "acerta", midi: 64 },
      { text: "o", midi: 62 },
      { text: "tom", midi: 60 },
    ],
    [
      { text: "Se", midi: 62 },
      { text: "a", midi: 64 },
      { text: "voz", midi: 67 },
      { text: "desafinar", midi: 69 },
    ],
    [
      { text: "A", midi: 67 },
      { text: "festa", midi: 65 },
      { text: "segue", midi: 64 },
      { text: "inteira", midi: 60 },
    ],
  ],
});

const janela = makeSong({
  id: "janela-aberta",
  title: "Janela Aberta",
  bpm: 104,
  key: "Lá menor",
  style: "bounce",
  bars: barsOf(["Am", "Am"], ["Am", "F", "C", "G"], 4, ["Am", "Am"]),
  lineStartBar: 2,
  barsPerLine: 2,
  lines: [
    [
      { text: "Deixa", midi: 57 },
      { text: "a", midi: 60 },
      { text: "janela", midi: 64 },
      { text: "aberta", midi: 62 },
    ],
    [
      { text: "A", midi: 64 },
      { text: "voz", midi: 65 },
      { text: "quer", midi: 64 },
      { text: "atravessar", midi: 60 },
    ],
    [
      { text: "O", midi: 57 },
      { text: "vizinho", midi: 60 },
      { text: "faz", midi: 62 },
      { text: "careta", midi: 64 },
    ],
    [
      { text: "E", midi: 64 },
      { text: "eu", midi: 62 },
      { text: "canto", midi: 60 },
      { text: "mesmo", midi: 59 },
      { text: "assim", midi: 57 },
    ],
    [
      { text: "Não", midi: 60 },
      { text: "canto", midi: 64 },
      { text: "pra", midi: 67 },
      { text: "plateia", midi: 64 },
    ],
    [
      { text: "Canto", midi: 64 },
      { text: "pra", midi: 62 },
      { text: "me", midi: 60 },
      { text: "encontrar", midi: 57 },
    ],
    [
      { text: "Se", midi: 59 },
      { text: "a", midi: 60 },
      { text: "nota", midi: 64 },
      { text: "sair", midi: 65 },
      { text: "torta", midi: 64 },
    ],
    [
      { text: "A", midi: 62 },
      { text: "gente", midi: 60 },
      { text: "canta", midi: 64 },
      { text: "outra", midi: 59 },
      { text: "vez", midi: 57 },
    ],
  ],
});

const SONGS = [luz, janela];

export function listSongs(): Song[] {
  return SONGS;
}

export function getSong(id: string): Song | undefined {
  return SONGS.find((song) => song.id === id);
}

export function lineText(line: LyricLine): string {
  return line.words.map((word) => word.text).join(" ");
}

export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
