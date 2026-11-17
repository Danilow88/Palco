"use client";

import { starsFor } from "@/lib/score";
import type { Summary } from "@/lib/types";

export default function ResultScreen({
  summary,
  onAgain,
  onHome,
}: {
  summary: Summary;
  onAgain: () => void;
  onHome: () => void;
}) {
  const stars = summary.total == null ? 0 : starsFor(summary.total);
  return (
    <main className="result">
      <p className="eyebrow">a nota</p>
      <h2>{summary.title}</h2>
      {summary.total == null ? (
        <p className="phrase">{summary.phrase}</p>
      ) : (
        <>
          <p className="grade" aria-label={`Nota ${summary.total}`}>
            {summary.total}
          </p>
          <p className="stars" aria-label={`${stars} de 5 estrelas`}>
            {"★".repeat(stars)}
            {"☆".repeat(5 - stars)}
          </p>
          <p className="phrase">{summary.phrase}</p>
          <div className="bars">
            <Meter label="Afinação" value={summary.tune} hint="Perto da nota certa, ou de alguma nota firme." />
            <Meter label="Firmeza" value={summary.firmness} hint="Sem oscilar demais entre uma sílaba e outra." />
            <Meter label="Presença" value={summary.presence} hint="Cantou quando a letra pedia voz." />
          </div>
          {summary.lineScores.length > 0 && (
            <div className="dots">
              <span className="fine">Por verso</span>
              {summary.lineScores.map((score, index) => (
                <i key={index}>{score}</i>
              ))}
            </div>
          )}
        </>
      )}
      <div className="actions">
        <button className="primary" type="button" onClick={onAgain}>
          Cantar de novo
        </button>
        <button className="ghost" type="button" onClick={onHome}>
          Outra música
        </button>
      </div>
    </main>
  );
}

function Meter({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="bar">
      <span>
        {label} · {value}
      </span>
      <b>
        <i style={{ width: `${value}%` }} />
      </b>
      <p className="fine">{hint}</p>
    </div>
  );
}
