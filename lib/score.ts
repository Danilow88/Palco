import type { Summary, TrackKind } from "./types";

export type FrameInput = {
  voiced: boolean;
  centsAbs: number | null;
  noteActive: boolean;
  midiFloat: number | null;
};

export type Acc = {
  tuneSum: number;
  tuneN: number;
  stabSum: number;
  stabN: number;
  prevSemi: number | null;
  active: number;
  activeVoiced: number;
  lineTuneSum: number;
  lineTuneN: number;
  lineActive: number;
  lineVoiced: number;
  lineScores: number[];
  tight: boolean;
};

export function createAcc(tight: boolean): Acc {
  return {
    tuneSum: 0,
    tuneN: 0,
    stabSum: 0,
    stabN: 0,
    prevSemi: null,
    active: 0,
    activeVoiced: 0,
    lineTuneSum: 0,
    lineTuneN: 0,
    lineActive: 0,
    lineVoiced: 0,
    lineScores: [],
    tight,
  };
}

export function pushFrame(acc: Acc, frame: FrameInput): void {
  if (frame.noteActive) {
    acc.active += 1;
    acc.lineActive += 1;
  }

  if (!frame.voiced || frame.midiFloat == null) {
    acc.prevSemi = null;
    return;
  }

  if (frame.noteActive) {
    acc.activeVoiced += 1;
    acc.lineVoiced += 1;
  }

  if (frame.centsAbs != null && frame.noteActive) {
    const tune = 1 - Math.min(frame.centsAbs, 100) / 100;
    acc.tuneSum += tune;
    acc.tuneN += 1;
    acc.lineTuneSum += tune;
    acc.lineTuneN += 1;
  }

  if (acc.prevSemi != null) {
    const jump = Math.abs(frame.midiFloat - acc.prevSemi);
    acc.stabSum += 1 - Math.min(jump, 2) / 2;
    acc.stabN += 1;
  }
  acc.prevSemi = frame.midiFloat;
}

export function closeLine(acc: Acc): number {
  if (acc.lineActive === 0 && acc.lineTuneN === 0) {
    acc.lineTuneSum = 0;
    acc.lineTuneN = 0;
    acc.lineActive = 0;
    acc.lineVoiced = 0;
    return 0;
  }
  const tune = acc.lineTuneN ? acc.lineTuneSum / acc.lineTuneN : 0;
  const presence = acc.lineActive ? Math.min(1, acc.lineVoiced / acc.lineActive / (acc.tight ? 0.65 : 0.4)) : 0;
  const score = Math.round(100 * (0.7 * tune + 0.3 * presence));
  acc.lineScores.push(score);
  acc.lineTuneSum = 0;
  acc.lineTuneN = 0;
  acc.lineActive = 0;
  acc.lineVoiced = 0;
  return score;
}

export function snapshot(acc: Acc): { total: number; tune: number; firmness: number; presence: number } | null {
  if (acc.tuneN < 4) return null;
  const tune = acc.tuneSum / acc.tuneN;
  const firmness = acc.stabN ? acc.stabSum / acc.stabN : tune;
  const ratio = acc.active ? acc.activeVoiced / acc.active : 0;
  const presence = Math.min(1, ratio / (acc.tight ? 0.62 : 0.32));
  const total = Math.round(100 * (0.55 * tune + 0.2 * firmness + 0.25 * presence));
  return {
    total: clampScore(total),
    tune: clampScore(Math.round(tune * 100)),
    firmness: clampScore(Math.round(firmness * 100)),
    presence: clampScore(Math.round(presence * 100)),
  };
}

export function phraseFor(total: number): string {
  if (total >= 92) return "Estrela do palco";
  if (total >= 80) return "A plateia pediu bis";
  if (total >= 68) return "Boa voz de sexta-feira";
  if (total >= 52) return "O microfone gostou de você";
  return "A coragem já subiu no palco";
}

export function starsFor(total: number): number {
  if (total >= 90) return 5;
  if (total >= 75) return 4;
  if (total >= 60) return 3;
  if (total >= 45) return 2;
  return 1;
}

export function finalize(acc: Acc, title: string, kind: TrackKind, heardMic: boolean): Summary {
  if (acc.lineActive > 0 || acc.lineTuneN > 0) closeLine(acc);
  const shot = snapshot(acc);
  if (!heardMic || !shot) {
    return {
      title,
      kind,
      total: null,
      tune: 0,
      firmness: 0,
      presence: 0,
      phrase: "Não ouvi sua voz. Libera o microfone, de preferência com fone, e canta de novo.",
      lineScores: acc.lineScores,
      heard: false,
    };
  }
  return {
    title,
    kind,
    total: shot.total,
    tune: shot.tune,
    firmness: shot.firmness,
    presence: shot.presence,
    phrase: phraseFor(shot.total),
    lineScores: acc.lineScores,
    heard: true,
  };
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}
