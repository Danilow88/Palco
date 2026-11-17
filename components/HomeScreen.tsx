"use client";

import { useEffect, useState } from "react";
import type { HistoryItem, RecentVideo } from "@/lib/history";
import { formatDuration, lineText, listSongs } from "@/lib/songs";
import type { SearchHit } from "@/lib/types";
import { parseYouTubeId, type YoutubeMode } from "@/lib/youtube";
import type { FormEvent } from "react";

const MODES: { id: YoutubeMode; label: string }[] = [
  { id: "karaoke", label: "Karaokê" },
  { id: "instrumental", label: "Instrumental" },
  { id: "video", label: "Clipe" },
];

export default function HomeScreen({
  history,
  recent,
  onOriginal,
  onYoutube,
}: {
  history: HistoryItem[];
  recent: RecentVideo[];
  onOriginal: (songId: string) => void;
  onYoutube: (video: RecentVideo) => void;
}) {
  const songs = listSongs();
  const [mode, setMode] = useState<YoutubeMode>("karaoke");
  const [query, setQuery] = useState("");
  const [link, setLink] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [connected, setConnected] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let gone = false;
    const flag = new URLSearchParams(window.location.search).get("youtube");
    if (flag === "denied") setMessage("A conexão com o YouTube foi cancelada.");
    if (flag === "failed") setMessage("Não consegui concluir a conexão com o YouTube.");
    if (flag === "auth") setMessage("Entra no Palco de novo e conecta a conta do YouTube.");
    if (flag === "setup") {
      setMessage("O Google ainda não reconhece este Palco. O login da conta precisa do cliente OAuth, cadastrado uma vez.");
    }
    if (flag) {
      const clean = new URL(window.location.href);
      clean.searchParams.delete("youtube");
      window.history.replaceState(null, "", clean.pathname + clean.search);
    }
    fetch("/api/youtube/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { configured?: boolean; connected?: boolean }) => {
        if (gone) return;
        setConfigured(Boolean(data.configured));
        setConnected(Boolean(data.connected));
      })
      .catch(() => {
        if (!gone) setConfigured(false);
      });
    return () => {
      gone = true;
    };
  }, []);

  async function search(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setSearching(true);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&mode=${mode}`, { cache: "no-store" });
      const data = (await response.json()) as {
        configured?: boolean;
        connected?: boolean;
        results?: SearchHit[];
        error?: string;
      };
      setConfigured(Boolean(data.configured));
      setConnected(Boolean(data.connected));
      setHits(data.results ?? []);
      if (data.error) setMessage(searchMessage(data.error));
      else if ((data.results ?? []).length === 0) setMessage("Nada com esse nome. Tenta outro jeito de escrever ou cola o link.");
    } catch {
      setMessage("A busca não saiu daqui. Confere a rede ou cola o link do vídeo.");
    } finally {
      setSearching(false);
    }
  }

  function openLink(event: FormEvent) {
    event.preventDefault();
    const videoId = parseYouTubeId(link);
    if (!videoId) {
      setMessage("Não reconheci esse link do YouTube.");
      return;
    }
    onYoutube({ videoId, title: "Vídeo do YouTube", channel: "", karaokeLikely: false });
  }

  async function disconnect() {
    await fetch("/api/youtube/session", { method: "POST" });
    setConnected(false);
    setHits([]);
  }

  return (
    <main className="home">
      <p className="eyebrow">hoje tem palco</p>
      <h1 className="logo">Palco</h1>
      <p className="tag">Karaokê de bolso. A letra na tela, o instrumental no fone, a nota na hora.</p>

      <section className="hero">
        <h2>Músicas do Palco</h2>
        <p>Instrumental feito aqui, sem voz, com a melodia que a nota compara. Dá para cantar sem sair do app.</p>
        <div className="song-list">
          {songs.map((song) => (
            <button key={song.id} className="song" type="button" onClick={() => onOriginal(song.id)}>
              <strong>{song.title}</strong>
              <span>
                {song.key} · {formatDuration(song.duration)} · {lineText(song.lines[0])}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="block">
        <h2>YouTube</h2>
        <p className="note">
          O vídeo toca no player oficial. A busca usa a conta do YouTube que você conectar e pede a versão karaokê ou instrumental.
          Um clipe comum continua com a voz, porque o player não entrega o áudio para separar.
        </p>
        <div className="stack">
          <a className="primary" href="/api/youtube/connect">
            {connected ? "Trocar a conta do YouTube" : "Conectar conta do YouTube"}
          </a>
          {connected && (
            <button className="ghost" type="button" onClick={() => void disconnect()}>
              Desconectar
            </button>
          )}
        </div>
        {connected && <p className="note">Conta conectada. A busca sai por ela.</p>}
        {configured === false && (
          <p className="note">O botão abre o login do Google. Falta o cliente desse login para o Google aceitar o Palco.</p>
        )}
        <div className="row" role="group" aria-label="Tipo de vídeo">
          {MODES.map((item) => (
            <button key={item.id} type="button" className={mode === item.id ? "chip on" : "chip"} onClick={() => setMode(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        <form className="search" onSubmit={search}>
          <label className="sr" htmlFor="q">
            Nome da música
          </label>
          <input
            id="q"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nome da música"
            autoComplete="off"
            enterKeyHint="search"
          />
          <button className="primary" type="submit" disabled={searching || query.trim().length < 2}>
            {searching ? "Procurando…" : "Buscar versão"}
          </button>
        </form>
        <form className="search" onSubmit={openLink}>
          <label className="sr" htmlFor="link">
            Link do YouTube
          </label>
          <input
            id="link"
            type="url"
            inputMode="url"
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="Cola o link do YouTube"
            autoComplete="off"
          />
          <button className="ghost" type="submit">
            Abrir esse vídeo
          </button>
        </form>
        {message && <p className="warn">{message}</p>}
        <div className="hits">
          {hits.map((hit) => (
            <button
              key={hit.videoId}
              className="hit"
              type="button"
              onClick={() =>
                onYoutube({
                  videoId: hit.videoId,
                  title: hit.title,
                  channel: hit.channel,
                  karaokeLikely: hit.karaokeLikely,
                })
              }
            >
              <img src={hit.thumbnail} alt="" />
              <span>
                <strong>{hit.title}</strong>
                <span>
                  {hit.channel}
                  {hit.karaokeLikely ? " · versão de cantar" : ""}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {recent.length > 0 && (
        <section className="block">
          <h2>Vídeos recentes</h2>
          <div className="recent">
            {recent.map((video) => (
              <button key={video.videoId} type="button" onClick={() => onYoutube(video)}>
                <strong>{video.title}</strong>
                <span>{video.channel || "YouTube"}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {history.length > 0 && (
        <section className="block">
          <h2>Suas notas</h2>
          <div className="history">
            {history.map((item, index) => (
              <article key={`${item.at}-${index}`}>
                <strong>
                  {item.total} · {item.title}
                </strong>
                <span>
                  {item.kind === "original" ? "Palco" : "YouTube"} ·{" "}
                  {new Date(item.at).toLocaleString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function searchMessage(code: string): string {
  if (code === "connect") return "Conecta a conta do YouTube para buscar. O link do vídeo continua valendo.";
  if (code === "setup") return "O login do Google ainda não está cadastrado neste Palco.";
  if (code === "rate") return "Muitas buscas seguidas. Espera um instante.";
  if (code === "rejected") return "O YouTube recusou a busca desta conta.";
  if (code === "short-query") return "Escreve pelo menos duas letras.";
  return "A busca do YouTube não respondeu. Tenta de novo ou cola o link.";
}
