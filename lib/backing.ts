import type { Song } from "./types";

export type Performance = {
  time: () => number;
  level: () => number;
  paused: () => boolean;
  setGuide: (on: boolean) => void;
  setVolume: (value: number) => void;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => void;
};

export function playSong(song: Song): Performance {
  if (typeof AudioContext === "undefined") {
    throw new Error("sem-audio");
  }
  const ctx = new AudioContext({ latencyHint: "interactive" });
  const t0 = ctx.currentTime + 0.08;
  const volume = ctx.createGain();
  volume.gain.value = 0.85;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, t0);
  master.gain.exponentialRampToValueAtTime(1, t0 + 0.08);
  const fadeAt = t0 + Math.max(0, song.duration - 0.7);
  master.gain.setValueAtTime(1, fadeAt);
  master.gain.exponentialRampToValueAtTime(0.0001, t0 + song.duration);

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 18;
  comp.ratio.value = 3.2;
  comp.attack.value = 0.008;
  comp.release.value = 0.22;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  master.connect(volume);
  volume.connect(comp);
  comp.connect(analyser);
  analyser.connect(ctx.destination);

  const wet = ctx.createGain();
  wet.gain.value = 0.16;
  const convolver = ctx.createConvolver();
  convolver.buffer = roomImpulse(ctx, 1.15, 2.4);
  convolver.connect(wet);
  wet.connect(master);

  const music = ctx.createGain();
  music.gain.value = 0.9;
  music.connect(master);
  music.connect(convolver);

  const guide = ctx.createGain();
  guide.gain.value = 0.0001;
  guide.connect(master);

  const noise = noiseBuffer(ctx);
  scheduleDrums(ctx, song, t0, music, noise);
  for (const chord of song.chords) {
    pluck(ctx, t0 + chord.at, midiHz(chord.bass), Math.min(0.46, chord.dur), 0.2, music, "triangle");
    for (const note of chord.notes) {
      pluck(ctx, t0 + chord.at, midiHz(note), Math.min(chord.dur, 1.35), 0.055, music, "triangle");
    }
  }
  for (const line of song.lines) {
    line.words.forEach((word, index) => {
      const next = line.words[index + 1]?.at ?? word.at + 0.7;
      const dur = Math.min(0.62, Math.max(0.22, next - word.at - 0.04));
      pluck(ctx, t0 + word.at, midiHz(word.midi), dur, 0.09, guide, "sine");
    });
  }

  void ctx.resume();
  const bins = new Uint8Array(analyser.frequencyBinCount);
  let paused = false;
  let closed = false;

  return {
    time: () => Math.max(0, ctx.currentTime - t0),
    level: () => {
      analyser.getByteFrequencyData(bins);
      let sum = 0;
      for (let i = 0; i < bins.length; i++) sum += bins[i];
      return sum / bins.length / 255;
    },
    paused: () => paused,
    setGuide: (on) => {
      const now = ctx.currentTime;
      guide.gain.cancelScheduledValues(now);
      guide.gain.setValueAtTime(Math.max(0.0001, guide.gain.value), now);
      guide.gain.exponentialRampToValueAtTime(on ? 0.9 : 0.0001, now + 0.05);
    },
    setVolume: (value) => {
      volume.gain.value = Math.min(1, Math.max(0, value));
    },
    pause: async () => {
      paused = true;
      if (ctx.state === "running") await ctx.suspend();
    },
    resume: async () => {
      paused = false;
      if (ctx.state === "suspended") await ctx.resume();
    },
    stop: () => {
      if (closed) return;
      closed = true;
      paused = true;
      void ctx.close();
    },
  };
}

function scheduleDrums(ctx: AudioContext, song: Song, t0: number, dest: AudioNode, noise: AudioBuffer): void {
  const beat = 60 / song.bpm;
  const steps = Math.floor(song.duration / (beat / 2));
  for (let step = 0; step < steps; step++) {
    const at = t0 + step * (beat / 2);
    const place = step % 8;
    const intro = at - t0 < beat * 8;
    const amp = intro ? 0.62 : 1;
    if (place === 0 || place === 4 || (song.style === "bounce" && place === 6)) {
      kick(ctx, at, dest, (place === 6 ? 0.45 : 0.85) * amp);
    }
    if (place === 2 || place === 6) snare(ctx, at, dest, noise, 0.18 * amp);
    if (place % 2 === 0) hat(ctx, at, dest, noise, (place % 4 === 0 ? 0.045 : 0.028) * amp);
  }
}

function pluck(
  ctx: AudioContext,
  when: number,
  freq: number,
  dur: number,
  amp: number,
  dest: AudioNode,
  type: OscillatorType,
): void {
  const osc = ctx.createOscillator();
  const overtone = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  osc.type = type;
  overtone.type = "sine";
  osc.frequency.setValueAtTime(freq, when);
  overtone.frequency.setValueAtTime(freq * 2.003, when);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(type === "sine" ? 2400 : 1600, when);
  filter.frequency.exponentialRampToValueAtTime(420, when + dur);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), when + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(filter);
  overtone.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  osc.start(when);
  overtone.start(when);
  osc.stop(when + dur + 0.03);
  overtone.stop(when + dur + 0.03);
}

function kick(ctx: AudioContext, when: number, dest: AudioNode, amp: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(148, when);
  osc.frequency.exponentialRampToValueAtTime(46, when + 0.12);
  gain.gain.setValueAtTime(amp, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(when);
  osc.stop(when + 0.24);
}

function snare(ctx: AudioContext, when: number, dest: AudioNode, noise: AudioBuffer, amp: number): void {
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  src.buffer = noise;
  filter.type = "highpass";
  filter.frequency.value = 1400;
  gain.gain.setValueAtTime(amp, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.14);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  src.start(when);
  src.stop(when + 0.16);

  const body = ctx.createOscillator();
  const bodyGain = ctx.createGain();
  body.type = "triangle";
  body.frequency.setValueAtTime(190, when);
  bodyGain.gain.setValueAtTime(amp * 0.7, when);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.1);
  body.connect(bodyGain);
  bodyGain.connect(dest);
  body.start(when);
  body.stop(when + 0.12);
}

function hat(ctx: AudioContext, when: number, dest: AudioNode, noise: AudioBuffer, amp: number): void {
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  src.buffer = noise;
  filter.type = "highpass";
  filter.frequency.value = 7000;
  gain.gain.setValueAtTime(amp, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  src.start(when);
  src.stop(when + 0.05);
}

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * 0.4);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function roomImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
    }
  }
  return buffer;
}

function midiHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}
