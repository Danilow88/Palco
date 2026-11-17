"use client";

import { useEffect, useRef, useState } from "react";
import { playSong, type Performance } from "@/lib/backing";
import { pushHistory, pushRecent, readHistory, readRecent, type HistoryItem, type RecentVideo } from "@/lib/history";
import { saveLyricDraft } from "@/lib/lyrics";
import { getSong } from "@/lib/songs";
import type { Summary, Track } from "@/lib/types";
import HomeScreen from "./HomeScreen";
import ReadyScreen from "./ReadyScreen";
import ResultScreen from "./ResultScreen";
import StageScreen from "./StageScreen";
import { useMic } from "./useMic";

type Screen =
  | { name: "home" }
  | { name: "ready"; track: Track }
  | { name: "stage"; track: Track; lyrics: string; token: number }
  | { name: "result"; track: Track; lyrics: string; summary: Summary };

export default function PalcoApp() {
  const mic = useMic();
  const perfRef = useRef<Performance | null>(null);
  const wakeRef = useRef<WakeLockSentinel | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [recent, setRecent] = useState<RecentVideo[]>([]);
  const [audioError, setAudioError] = useState("");

  useEffect(() => {
    setHistory(readHistory());
    setRecent(readRecent());
  }, []);

  function stopSession() {
    perfRef.current?.stop();
    perfRef.current = null;
    mic.stop();
    void wakeRef.current?.release().catch(() => undefined);
    wakeRef.current = null;
  }

  function openOriginal(songId: string) {
    setAudioError("");
    setScreen({ name: "ready", track: { kind: "original", songId } });
  }

  function openYoutube(video: RecentVideo) {
    setAudioError("");
    setScreen({
      name: "ready",
      track: {
        kind: "youtube",
        videoId: video.videoId,
        title: video.title,
        channel: video.channel,
        karaokeLikely: video.karaokeLikely,
      },
    });
  }

  async function sing(track: Track, lyrics: string) {
    setAudioError("");
    try {
      perfRef.current?.stop();
      perfRef.current = null;
      if (track.kind === "original") {
        const song = getSong(track.songId);
        if (!song) return;
        perfRef.current = playSong(song);
      } else {
        saveLyricDraft(track.videoId, lyrics);
        pushRecent({
          videoId: track.videoId,
          title: track.title,
          channel: track.channel,
          karaokeLikely: track.karaokeLikely,
        });
        setRecent(readRecent());
      }
    } catch {
      setAudioError("Este navegador não tocou o instrumental.");
      return;
    }
    setScreen({ name: "stage", track, lyrics, token: Date.now() });
    void mic.start();
    try {
      wakeRef.current = await navigator.wakeLock?.request("screen");
    } catch {
      wakeRef.current = null;
    }
  }

  function finish(summary: Summary, track: Track, lyrics: string) {
    stopSession();
    if (summary.heard && summary.total != null) {
      setHistory(pushHistory({ title: summary.title, total: summary.total, at: Date.now(), kind: summary.kind }));
    }
    setScreen({ name: "result", summary, track, lyrics });
  }

  function home() {
    stopSession();
    setScreen({ name: "home" });
  }

  return (
    <div className="app">
      {screen.name === "home" && (
        <HomeScreen history={history} recent={recent} onOriginal={openOriginal} onYoutube={openYoutube} />
      )}
      {screen.name === "ready" && (
        <ReadyScreen
          track={screen.track}
          initialLyrics=""
          audioError={audioError}
          onBack={home}
          onSing={(lyrics) => void sing(screen.track, lyrics)}
        />
      )}
      {screen.name === "stage" && (
        <StageScreen
          key={screen.token}
          track={screen.track}
          lyricsText={screen.lyrics}
          backing={perfRef.current}
          pitchRef={mic.pitchRef}
          micStatus={mic.status}
          onExit={home}
          onFinish={(summary) => finish(summary, screen.track, screen.lyrics)}
        />
      )}
      {screen.name === "result" && (
        <ResultScreen
          summary={screen.summary}
          onHome={home}
          onAgain={() => void sing(screen.track, screen.lyrics)}
        />
      )}
    </div>
  );
}
