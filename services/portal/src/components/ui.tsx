import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { describeError } from "../api/client";
import type { Candidate, HabitableZone } from "../api/types";
import { num } from "../lib/format";
import { ZONE_SHORT } from "../lib/science";

export function Loading({ children = "Загружаем данные…" }: { children?: ComponentChildren }) {
  return (
    <p class="loading" role="status">
      {children}
    </p>
  );
}

function useCountdown(seconds: number | null): number | null {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    setLeft(seconds);
    if (!seconds) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const rest = Math.max(0, seconds - Math.floor((Date.now() - started) / 1000));
      setLeft(rest);
      if (rest === 0) window.clearInterval(timer);
    }, 500);
    return () => window.clearInterval(timer);
  }, [seconds]);
  return left;
}

/** Ошибка, понятная человеку; для 503/429 — ожидание с отсчётом (повтор делает useResource). */
export function ErrorState({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const info = describeError(error);
  const left = useCountdown(info.retryAfter);
  const waiting = info.retryAfter !== null;
  return (
    <div class={`state ${waiting ? "state--wait" : "state--error"}`} role={waiting ? "status" : "alert"}>
      <h3>{info.title}</h3>
      {!compact && <p class="muted">{info.text}</p>}
      {waiting && left !== null && left > 0 && <p class="muted num">Повторим запрос через {left} с.</p>}
      {onRetry && (
        <div>
          <button class="btn" type="button" onClick={onRetry}>
            Повторить сейчас
          </button>
        </div>
      )}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ComponentChildren }) {
  return (
    <div class="state">
      <h3>{title}</h3>
      {children && <div class="muted">{children}</div>}
    </div>
  );
}

export function ZoneTag({ zone }: { zone: HabitableZone }) {
  if (zone === "outside") return <span class="tag">{ZONE_SHORT.outside}</span>;
  return (
    <span class={`tag ${zone === "conservative" ? "tag--cons" : "tag--opt"}`}>
      <span class="tag__mark" aria-hidden="true" />
      {ZONE_SHORT[zone]}
    </span>
  );
}

export const COMPONENT_COLORS = {
  zone: "var(--series-aqua)",
  size: "var(--series-blue)",
  orbit: "var(--series-orange)",
};

/** Состав балла: три сегмента и серый остаток до 100. Подписи — в title и рядом, не только цвет. */
export function ScoreBar({ candidate, labelled = false, compact = false }: { candidate: Candidate; labelled?: boolean; compact?: boolean }) {
  const parts = [
    { key: "zone", value: candidate.habitableZonePoints, label: "зона" },
    { key: "size", value: candidate.sizePoints, label: "размер" },
    { key: "orbit", value: candidate.orbitPoints, label: "орбита" },
  ] as const;
  const text = `Балл ${num(candidate.score, 1, 1)} из 100: зона ${num(candidate.habitableZonePoints, 1)}, размер ${num(candidate.sizePoints, 1)}, орбита ${num(candidate.orbitPoints, 1)}`;
  return (
    <div>
      <div class={`score-bar${compact ? " score-bar--compact" : ""}`} role="img" aria-label={text} title={text}>
        {parts.map((part) =>
          part.value > 0 ? <span key={part.key} class="score-bar__seg" style={{ width: `${part.value}%`, background: COMPONENT_COLORS[part.key] }} /> : null,
        )}
        <span class="score-bar__rest" />
      </div>
      {labelled && (
        <ul class="legend" style={{ marginTop: "8px" }}>
          {parts.map((part) => (
            <li key={part.key}>
              <span class="legend__band" style={{ background: COMPONENT_COLORS[part.key] }} aria-hidden="true" />
              {part.label} {num(part.value, 1)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface FigureProps {
  title: string;
  caption: ComponentChildren;
  legend?: ComponentChildren;
  table?: () => ComponentChildren;
  children: ComponentChildren;
  id?: string;
}

/** Рисунок: заголовок, легенда над графиком, подпись с описанием выборки и табличная альтернатива. */
export function Figure({ title, caption, legend, table, children, id }: FigureProps) {
  const [showTable, setShowTable] = useState(false);
  return (
    <figure class="figure" id={id}>
      <div class="figure__head">
        <h3 class="figure__title">{title}</h3>
        {table && (
          <button class="btn btn--quiet" type="button" aria-pressed={showTable} onClick={() => setShowTable(!showTable)}>
            {showTable ? "Показать график" : "Показать таблицей"}
          </button>
        )}
      </div>
      {legend && !showTable && legend}
      {showTable && table ? <div class="table-scroll">{table()}</div> : children}
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

export function ReviewNote({ status }: { status: string | null | undefined }) {
  if (status === "reviewed") return <span class="tag tag--ok">перевод проверен редактором</span>;
  return null;
}
