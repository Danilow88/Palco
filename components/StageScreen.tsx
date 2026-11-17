"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Performance } from "@/lib/backing";
import { anchorLine, currentLineIndex, parseLyricInput, shiftLines } from "@/lib/lyrics";
import { noteLabel } from "@/lib/pitch";
import type { PitchReading } from "@/lib/pitch";
import { closeLine, createAcc, finalize, pushFrame, snapshot } from "@/lib/score";
import { getSong, lineText } from "@/lib/songs";
import type { Song, Summary, TimedLine, Track } from "@/lib/types";
import { watchUrl } from "@/lib/youtube";
import type { MicStatus } from "./useMic";

type Hud = {
  time: number;
  duration: number;
  lineIndex: number;
  wordIndex: number;
  total: number | null;
  signed: number | null;
  pitchLabel: string;
  targetLabel: string;
  level: number;
  pop: number | null;
};

export default function StageScreen({
  track,
  lyricsText,
  backing,
  pitchRef,
  micStatus,
  onExit,
  onFinish,
}: {
  track: Track;
  lyricsText: string;
  backing: Performance | null;
  pitchRef: RefObject<PitchReading | null>;
  micStatus: MicStatus;
  onExit: () => void;
  onFinish: (summary: Summary) => void;
}) {
  const song = track.kind === "original" ? getSong(track.songId) : undefined;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const playingRef = useRef(track.kind === "original");
  const timeRef = useRef(0);
  const durationRef = useRef(song?.duration ?? 0);
  const [title, setTitle] = useState(song?.title ?? (track.kind === "youtube" ? track.title : "Palco"));
  const [guide, setGuide] = useState(false);
  const [paused, setPaused] = useState(track.kind === "youtube");
  const [lyricOpen, setLyricOpen] = useState(false);
  const [playerError, setPlayerError] = useState("");
  const [lines, setLines] = useState<TimedLine[]>(() =>
    track.kind === "youtube" ? parseLyricInput(lyricsText, 180) : [],
  );
  const [hud, setHud] = useState<Hud>({
    time: 0,
    duration: song?.duration ?? 0,
    lineIndex: -1,
    wordIndex: -1,
    total: null,
    signed: null,
    pitchLabel: "ouvindo",
    targetLabel: "",
    level: 0,
    pop: null,
  });

  useEffect(() => {
    if (track.kind !== "youtube") return;
    const parent = hostRef.current;
    if (!parent) return;
    const mount = document.createElement("div");
    mount.style.width = "100%";
    mount.style.height = "100%";
    parent.appendChild(mount);
    let timer = 0;
    let cancelled = false;
    loadYouTube(mount, track.videoId, {
      onReady: (player) => {
        if (cancelled) {
          player.destroy();
          return;
        }
        playerRef.current = player;
        const data = player.getVideoData?.();
        if (data?.title) setTitle(data.title);
        const duration = player.getDuration?.() || 0;
        if (duration > 0) {
          durationRef.current = duration;
          setLines(parseLyricInput(lyricsText, duration));
        }
        player.playVideo();
      },
      onState: (state) => {
        playingRef.current = state === 1;
        setPaused(state !== 1);
        if (state === 1) setPlayerError("");
        if (state === 0) finish();
      },
      onError: () =>
        setPlayerError("O YouTube não deixou este vídeo tocar aqui. Se a tela pedir confirmação, abre no YouTube."),
    }).catch(() => {
      if (!cancelled) setPlayerError("Não consegui carregar o player do YouTube.");
    });
    timer = window.setInterval(() => {
      const player = playerRef.current;
      if (!player?.getCurrentTime) return;
      timeRef.current = player.getCurrentTime() || 0;
      const duration = player.getDuration?.() || 0;
      if (duration > 0) durationRef.current = duration;
    }, 100);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      playerRef.current?.destroy();
      playerRef.current = null;
      parent.replaceChildren();
    };
    // finish is stable via ref below; lyrics are captured at mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track]);

  const finishRef = useRef<() => void>(() => {});
  finishRef.current = () => {
    const summary = finalize(
      accRef.current,
      title,
      track.kind,
      micStatus === "on",
    );
    onFinish(summary);
  };
  function finish() {
    if (done.current) return;
    done.current = true;
    finishRef.current();
  }

  const accRef = useRef(createAcc(track.kind === "original" || lines.length > 0));
  const done = useRef(false);
  const prevLine = useRef(-1);
  const lastT = useRef(0);
  const lastUi = useRef(0);
  const popRef = useRef<{ score: number; until: number } | null>(null);
  const linesRef = useRef(lines);
  linesRef.current = lines;

  useEffect(() => {
    let frame = 0;
    const loop = () => {
      if (done.current) return;
      const now = globalThis.performance.now();
      const activeSong = track.kind === "original" ? song : undefined;
      const live = activeSong && backing ? backing : null;
      const time = live ? live.time() : timeRef.current;
      const duration = activeSong?.duration ?? durationRef.current;
      const playing = live ? !live.paused() : playingRef.current;
      const located = activeSong && live
        ? locateSong(activeSong, time)
        : {
            lineIndex: currentLineIndex(linesRef.current, time),
            wordIndex: -1,
            target: null as number | null,
            noteActive: youtubeActive(linesRef.current, time),
          };

      if (located.lineIndex !== prevLine.current) {
        if (prevLine.current >= 0) {
          popRef.current = { score: closeLine(accRef.current), until: now + 1200 };
        }
        prevLine.current = located.lineIndex;
      }

      const pitch = pitchRef.current;
      if (playing && Math.abs(time - lastT.current) > 0.001) {
        lastT.current = time;
        const target = located.target;
        pushFrame(accRef.current, {
          voiced: Boolean(pitch),
          centsAbs: pitch ? Math.abs(target == null ? pitch.cents : (pitch.midiFloat - target) * 100) : null,
          noteActive: located.noteActive,
          midiFloat: pitch?.midiFloat ?? null,
        });
      }

      if (activeSong && live && time >= activeSong.duration - 0.05) {
        finish();
        return;
      }

      frame = requestAnimationFrame(loop);
      if (now - lastUi.current < 70) return;
      lastUi.current = now;
      const shot = snapshot(accRef.current);
      const signed = pitch ? Math.round(located.target == null ? pitch.cents : (pitch.midiFloat - located.target) * 100) : null;
      setHud({
        time,
        duration,
        lineIndex: located.lineIndex,
        wordIndex: located.wordIndex,
        total: shot?.total ?? null,
        signed,
        pitchLabel: pitch?.label ?? (micStatus === "on" ? "ouvindo" : "sem mic"),
        targetLabel: located.target == null ? "" : `alvo ${noteLabel(located.target)}`,
        level: live ? live.level() : 0,
        pop: popRef.current && now < popRef.current.until ? popRef.current.score : null,
      });
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [backing, micStatus, pitchRef, song, track.kind]);

  function togglePause() {
    if (track.kind === "original" && backing) {
      if (backing.paused()) {
        void backing.resume();
        setPaused(false);
      } else {
        void backing.pause();
        setPaused(true);
      }
      return;
    }
    const player = playerRef.current;
    if (!player) return;
    if (playingRef.current) player.pauseVideo();
    else player.playVideo();
  }

  const pct = hud.duration > 0 ? Math.min(100, (hud.time / hud.duration) * 100) : 0;
  const youtubeUrl = track.kind === "youtube" ? watchUrl(track.videoId) : null;
  const tone = hud.signed == null ? "" : Math.abs(hud.signed) < 20 ? "no tom" : hud.signed > 0 ? `${hud.signed} cents acima` : `${Math.abs(hud.signed)} cents abaixo`;

  return (
    <main className="stage">
      <header className="topbar">
        <button className="icon-btn tiny" type="button" onClick={onExit}>
          Sair
        </button>
        <h2>{title}</h2>
        <div className="score-pill" aria-live="polite">
          {hud.total == null ? "–" : hud.total}
        </div>
      </header>
      <div className="progress" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </div>
      {track.kind === "original" && song ? (
        <div className="visual" style={{ ["--level" as string]: String(hud.level) }}>
          <div className="spotlight" />
          <p>{song.artist}</p>
        </div>
      ) : (
        <div className="video-frame" ref={hostRef} />
      )}
      {playerError && <p className="warn">{playerError}</p>}
      <section className="lyric-block">
        <p className="pop">{hud.pop == null ? "" : `verso ${hud.pop}`}</p>
        {song ? (
          <OriginalLyrics song={song} lineIndex={hud.lineIndex} wordIndex={hud.wordIndex} />
        ) : (
          <YoutubeLyrics lines={lines} lineIndex={hud.lineIndex} />
        )}
      </section>
      {lyricOpen && track.kind === "youtube" && (
        <div className="sheet">
          {lines.length === 0 && <p className="note">Cola a letra antes de cantar para marcar o tempo.</p>}
          {lines.map((line, index) => (
            <button
              key={`${line.at}-${index}`}
              type="button"
              className={index === hud.lineIndex ? "on" : ""}
              onClick={() => setLines((current) => anchorLine(current, index, timeRef.current))}
            >
              {line.text}
            </button>
          ))}
          <div className="offset-row">
            <button className="ghost" type="button" onClick={() => setLines((current) => shiftLines(current, -0.5))}>
              Letra mais cedo
            </button>
            <button className="ghost" type="button" onClick={() => setLines((current) => shiftLines(current, 0.5))}>
              Letra mais tarde
            </button>
          </div>
        </div>
      )}
      <div className="meter">
        <div className="meter-head">
          <strong>{hud.pitchLabel}</strong>
          <span>{hud.targetLabel || tone || "canta uma nota"}</span>
        </div>
        <div className="tune-track" aria-hidden="true">
          <i />
          {hud.signed != null && (
            <em
              className="tune-dot"
              style={{ left: `${((Math.max(-50, Math.min(50, hud.signed)) + 50) / 100) * 100}%` }}
            />
          )}
        </div>
        <p className="fine">
          {micStatus === "denied" && "Microfone bloqueado. Dá para acompanhar a letra, sem nota."}
          {micStatus === "error" && "Este aparelho não abriu o microfone."}
          {micStatus === "asking" && "Pode pedir o microfone agora."}
          {micStatus === "on" && (tone || "Segura a nota no centro da faixa.")}
          {micStatus === "idle" && "Microfone ainda não entrou."}
        </p>
      </div>
      <div className="transport">
        {track.kind === "original" && (
          <button
            className={guide ? "chip on" : "chip"}
            type="button"
            onClick={() => {
              const next = !guide;
              setGuide(next);
              backing?.setGuide(next);
            }}
          >
            Guia
          </button>
        )}
        {track.kind === "youtube" && (
          <button className={lyricOpen ? "chip on" : "chip"} type="button" onClick={() => setLyricOpen((open) => !open)}>
            Letra
          </button>
        )}
        <button className="ghost" type="button" onClick={togglePause}>
          {paused ? "Seguir" : "Pausar"}
        </button>
        <button className="ghost" type="button" onClick={finish}>
          Ver nota
        </button>
      </div>
      {youtubeUrl && (
        <p className="fine">
          <a href={youtubeUrl} target="_blank" rel="noreferrer">
            Abrir no YouTube
          </a>
        </p>
      )}
      <label className="fine">
        Volume
        <input
          type="range"
          min={0}
          max={100}
          defaultValue={85}
          onChange={(event) => {
            const value = Number(event.target.value);
            backing?.setVolume(value / 100);
            playerRef.current?.setVolume?.(value);
          }}
        />
      </label>
    </main>
  );
}

function OriginalLyrics({ song, lineIndex, wordIndex }: { song: Song; lineIndex: number; wordIndex: number }) {
  if (lineIndex < 0) {
    return (
      <div className="lyric-wait">
        <p className="eyebrow">prepara a voz</p>
        <p className="lyric-next">{lineText(song.lines[0])}</p>
      </div>
    );
  }
  const line = song.lines[lineIndex];
  const next = song.lines[lineIndex + 1];
  return (
    <>
      <p className="lyric-line" aria-label={lineText(line)}>
        {line.words.map((word, index) => (
          <span key={index} className={index === wordIndex ? "word on" : index < wordIndex ? "word sung" : "word"}>
            {word.text}
          </span>
        ))}
      </p>
      <p className="lyric-next">{next ? lineText(next) : "segura até o fim"}</p>
    </>
  );
}

function YoutubeLyrics({ lines, lineIndex }: { lines: TimedLine[]; lineIndex: number }) {
  if (!lines.length) {
    return (
      <div>
        <p className="eyebrow">sem letra colada</p>
        <p className="lyric-next">Acompanha a do vídeo, ou volta e cola a sua.</p>
      </div>
    );
  }
  if (lineIndex < 0) {
    return (
      <div>
        <p className="eyebrow">prepara a voz</p>
        <p className="lyric-next">{lines[0].text}</p>
      </div>
    );
  }
  return (
    <>
      <p className="lyric-line">{lines[lineIndex].text}</p>
      <p className="lyric-next">{lines[lineIndex + 1]?.text ?? "último verso"}</p>
    </>
  );
}

function locateSong(song: Song, time: number) {
  let lineIndex = -1;
  let wordIndex = -1;
  let target: number | null = null;
  let noteActive = false;
  for (let i = 0; i < song.lines.length; i++) {
    const words = song.lines[i].words;
    const start = words[0]?.at ?? 0;
    const nextLine = song.lines[i + 1]?.words[0]?.at ?? song.duration;
    if (time < start || time >= nextLine) continue;
    lineIndex = i;
    for (let w = 0; w < words.length; w++) {
      const word = words[w];
      const nextAt = words[w + 1]?.at ?? nextLine;
      if (time >= word.at && time < nextAt) wordIndex = w;
      if (time >= word.at && time < Math.min(nextAt, word.at + 1.05)) {
        target = word.midi;
        noteActive = true;
      }
    }
    break;
  }
  return { lineIndex, wordIndex, target, noteActive };
}

function youtubeActive(lines: TimedLine[], time: number): boolean {
  if (!lines.length) return true;
  const index = currentLineIndex(lines, time);
  if (index < 0) return false;
  const end = lines[index + 1]?.at ?? lines[index].at + 4;
  return time < end - 0.12;
}

type YouTubePlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  destroy: () => void;
  getCurrentTime?: () => number;
  getDuration?: () => number;
  getVideoData?: () => { title?: string };
  setVolume?: (volume: number) => void;
};

function loadYouTube(
  host: HTMLDivElement,
  videoId: string,
  handlers: {
    onReady: (player: YouTubePlayer) => void;
    onState: (state: number) => void;
    onError: () => void;
  },
): Promise<void> {
  return loadApi().then(
    () =>
      new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("yt")), 12000);
        const YT = window.YT;
        if (!YT?.Player) {
          window.clearTimeout(timeout);
          reject(new Error("yt"));
          return;
        }
        new YT.Player(host, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 1,
            rel: 0,
            playsinline: 1,
            cc_load_policy: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event: { target: YouTubePlayer }) => {
              window.clearTimeout(timeout);
              handlers.onReady(event.target);
              resolve();
            },
            onStateChange: (event: { data: number }) => handlers.onState(event.data),
            onError: () => {
              window.clearTimeout(timeout);
              handlers.onError();
              resolve();
            },
          },
        });
      }),
  );
}

let apiPromise: Promise<void> | null = null;

function loadApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => reject(new Error("yt"));
    document.head.appendChild(script);
    window.setTimeout(() => reject(new Error("yt")), 12000);
  });
  return apiPromise;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement,
        options: {
          videoId: string;
          width?: string;
          height?: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (event: { target: YouTubePlayer }) => void;
            onStateChange?: (event: { data: number }) => void;
            onError?: () => void;
          };
        },
      ) => YouTubePlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}
