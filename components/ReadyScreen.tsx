"use client";

import { useEffect, useState } from "react";
import { loadLyricDraft } from "@/lib/lyrics";
import { getSong, lineText } from "@/lib/songs";
import type { Track } from "@/lib/types";

export default function ReadyScreen({
  track,
  initialLyrics,
  audioError,
  onBack,
  onSing,
}: {
  track: Track;
  initialLyrics: string;
  audioError: string;
  onBack: () => void;
  onSing: (lyrics: string) => void;
}) {
  const song = track.kind === "original" ? getSong(track.songId) : undefined;
  const [lyrics, setLyrics] = useState(initialLyrics);
  const title = song?.title ?? (track.kind === "youtube" ? track.title : "Palco");

  useEffect(() => {
    if (track.kind !== "youtube") return;
    const saved = loadLyricDraft(track.videoId);
    if (saved) setLyrics(saved);
  }, [track]);

  return (
    <main className="ready">
      <button className="ghost" type="button" onClick={onBack}>
        Voltar
      </button>
      <p className="eyebrow">{track.kind === "original" ? "banda palco" : "youtube"}</p>
      <h2>{title}</h2>
      {track.kind === "youtube" && track.channel && <p className="note">{track.channel}</p>}
      <p className="note">Usa fone. Se o microfone ouvir a caixa de som, a nota se perde no meio da música.</p>
      {track.kind === "youtube" && !track.karaokeLikely && (
        <p className="warn">
          Esse título não parece karaokê nem instrumental. Se a voz original estiver no vídeo, ela canta junto. Prefere uma versão
          playback.
        </p>
      )}
      {song && (
        <div className="song-list">
          {song.lines.map((line, index) => (
            <p key={index} className="note">
              {lineText(line)}
            </p>
          ))}
        </div>
      )}
      {track.kind === "youtube" && (
        <label className="stack">
          Letra, um verso por linha. Se já vier com tempo, no formato [00:12.00] verso.
          <textarea value={lyrics} onChange={(event) => setLyrics(event.target.value)} placeholder={"Primeiro verso\nSegundo verso"} />
        </label>
      )}
      {audioError && <p className="warn">{audioError}</p>}
      <div className="actions" style={{ marginTop: 16 }}>
        <button className="primary" type="button" onClick={() => onSing(lyrics)}>
          Cantar
        </button>
      </div>
    </main>
  );
}
