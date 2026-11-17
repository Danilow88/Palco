const NAMES = ["Dó", "Dó#", "Ré", "Ré#", "Mi", "Fá", "Fá#", "Sol", "Sol#", "Lá", "Lá#", "Si"];

export type PitchReading = {
  freq: number;
  midiFloat: number;
  midi: number;
  cents: number;
  label: string;
};

export function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function describePitch(freq: number): PitchReading {
  const midiFloat = 69 + 12 * Math.log2(freq / 440);
  const midi = Math.round(midiFloat);
  const cents = Math.round((midiFloat - midi) * 100);
  const name = NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return { freq, midiFloat, midi, cents, label: `${name} ${octave}` };
}

export function noteLabel(midi: number): string {
  const name = NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name} ${octave}`;
}

/**
 * YIN pitch detector. Returns null when the buffer is quiet or not a clear tone.
 * Singing range is limited to 80–900 Hz so noise and rumble do not become a note.
 */
export function detectPitch(buf: Float32Array, sampleRate: number): number | null {
  const size = buf.length;
  if (size < 256 || sampleRate < 8000) return null;

  let rms = 0;
  for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / size);
  if (rms < 0.012) return null;

  const minF = 80;
  const maxF = 900;
  const minLag = Math.max(2, Math.floor(sampleRate / maxF));
  const maxLag = Math.min(Math.floor(sampleRate / minF), size - 2);
  if (maxLag <= minLag) return null;

  const yin = new Float32Array(maxLag + 1);
  for (let tau = 1; tau <= maxLag; tau++) {
    let sum = 0;
    for (let i = 0; i < size - tau; i++) {
      const diff = buf[i] - buf[i + tau];
      sum += diff * diff;
    }
    yin[tau] = sum;
  }

  let running = 0;
  yin[0] = 1;
  for (let tau = 1; tau <= maxLag; tau++) {
    running += yin[tau];
    yin[tau] = running === 0 ? 1 : (yin[tau] * tau) / running;
  }

  const threshold = 0.15;
  let tau = minLag;
  while (tau <= maxLag && yin[tau] > threshold) tau++;
  if (tau > maxLag || yin[tau] > threshold) {
    let best = minLag;
    for (let i = minLag + 1; i <= maxLag; i++) if (yin[i] < yin[best]) best = i;
    if (yin[best] > 0.3) return null;
    tau = best;
  }
  while (tau + 1 <= maxLag && yin[tau + 1] < yin[tau]) tau++;

  const x0 = yin[tau - 1] ?? yin[tau];
  const x1 = yin[tau];
  const x2 = yin[tau + 1] ?? yin[tau];
  const denom = 2 * x1 - x2 - x0;
  const better = denom === 0 ? tau : tau + (x2 - x0) / (2 * denom);
  if (!Number.isFinite(better) || better <= 0) return null;
  const freq = sampleRate / better;
  if (freq < minF || freq > maxF) return null;
  return freq;
}
