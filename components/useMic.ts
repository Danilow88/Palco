"use client";

import { useRef, useState } from "react";
import { detectPitch, describePitch, type PitchReading } from "@/lib/pitch";

export type MicStatus = "idle" | "asking" | "on" | "denied" | "error";

export function useMic() {
  const pitchRef = useRef<PitchReading | null>(null);
  const stopRef = useRef<() => void>(() => {});
  const [status, setStatus] = useState<MicStatus>("idle");

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      return;
    }
    setStatus("asking");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
          channelCount: 1,
        },
        video: false,
      });
      const ctx = new AudioContext();
      await ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      let smooth: PitchReading | null = null;
      const timer = window.setInterval(() => {
        analyser.getFloatTimeDomainData(buf);
        const freq = detectPitch(buf, ctx.sampleRate);
        if (!freq) {
          smooth = null;
          pitchRef.current = null;
          return;
        }
        const next = describePitch(freq);
        if (smooth && Math.abs(next.midiFloat - smooth.midiFloat) > 2.5) {
          pitchRef.current = next;
          smooth = next;
          return;
        }
        if (smooth) {
          const midiFloat = smooth.midiFloat * 0.55 + next.midiFloat * 0.45;
          smooth = describePitch(440 * 2 ** ((midiFloat - 69) / 12));
        } else {
          smooth = next;
        }
        pitchRef.current = smooth;
      }, 50);
      stopRef.current = () => {
        window.clearInterval(timer);
        stream.getTracks().forEach((track) => track.stop());
        void ctx.close();
        pitchRef.current = null;
      };
      setStatus("on");
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      setStatus(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "error");
    }
  }

  function stop() {
    stopRef.current();
    stopRef.current = () => {};
    setStatus("idle");
  }

  return { pitchRef, status, start, stop };
}
