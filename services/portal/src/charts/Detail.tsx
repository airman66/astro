import { useMemo, useState } from "preact/hooks";
import { bin } from "d3-array";
import { scaleLinear, scaleLog } from "d3-scale";
import type { Candidate } from "../api/types";
import { Link } from "../router";
import { int, num, sig } from "../lib/format";
import { useWidth } from "../lib/hooks";
import { logTicks } from "./Scatter";

/** Интервалы 10–90-го процентиля места (или балла) по 160 пересчётам с погрешностями NASA. */
export function StabilityChart({ candidates, metric }: { candidates: Candidate[]; metric: "rank" | "score" }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [all, setAll] = useState(false);
  const rows = candidates.filter((c) => c.stability).slice(0, all ? candidates.length : 25);
  const rowHeight = 22;
  const margin = { top: 26, right: 24, bottom: 8, left: Math.min(170, Math.max(118, width * 0.28)) };
  const height = margin.top + rows.length * rowHeight + margin.bottom;
  const maxRank = Math.max(...candidates.map((c) => c.stability?.rankP90 ?? 0), candidates.length, 10);
  const x = metric === "rank" ? scaleLinear().domain([1, maxRank]).nice() : scaleLinear().domain([0, 100]);
  x.range([margin.left, Math.max(margin.left + 100, width - margin.right)]);
  const ticks = x.ticks(width < 520 ? 4 : 8);
  return (
    <div ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`Интервалы устойчивости ${metric === "rank" ? "места" : "балла"} для ${rows.length} кандидатов`}>
          <g class="grid">
            {ticks.map((tick) => (
              <line key={tick} x1={x(tick)} x2={x(tick)} y1={margin.top - 4} y2={height - margin.bottom} />
            ))}
          </g>
          <g class="axis">
            {ticks.map((tick) => (
              <text key={tick} x={x(tick)} y={14} text-anchor="middle">
                {int(tick)}
              </text>
            ))}
          </g>
          {rows.map((candidate, index) => {
            const s = candidate.stability!;
            const y = margin.top + index * rowHeight + rowHeight / 2;
            const low = metric === "rank" ? s.rankP10 : s.scoreP10;
            const high = metric === "rank" ? s.rankP90 : s.scoreP90;
            const value = metric === "rank" ? candidate.rank ?? index + 1 : candidate.score;
            return (
              <g key={candidate.name}>
                <title>{`${candidate.name}: ${metric === "rank" ? "место" : "балл"} ${num(value, 1)}, 10–90-й процентили ${num(low, 1)}–${num(high, 1)}`}</title>
                <text class="chart-label" x={margin.left - 10} y={y + 4} text-anchor="end">
                  {candidate.name.length > 22 ? `${candidate.name.slice(0, 21)}…` : candidate.name}
                </text>
                <line x1={x(low)} x2={x(Math.max(high, low + (metric === "rank" ? 0.2 : 0.4)))} y1={y} y2={y} stroke="var(--series-blue)" stroke-width={4} stroke-linecap="round" />
                <circle cx={x(value)} cy={y} r={4.5} fill="var(--ink)" stroke="var(--paper)" stroke-width={2} />
              </g>
            );
          })}
        </svg>
      )}
      {candidates.length > 25 && (
        <button class="btn btn--quiet" type="button" onClick={() => setAll(!all)}>
          {all ? "Показать первые 25" : `Показать всех ${candidates.length}`}
        </button>
      )}
    </div>
  );
}

/** Распределение баллов кандидатов по зонам: столбцы с промежутком 2px, подписи числа сверху. */
export function ScoreHistogram({ candidates }: { candidates: Candidate[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const bins = useMemo(() => {
    const make = bin<Candidate, number>()
      .value((c) => c.score)
      .domain([20, 100])
      .thresholds([25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95]);
    return make(candidates).map((group) => ({
      x0: group.x0 ?? 0,
      x1: group.x1 ?? 0,
      conservative: group.filter((c) => c.zone === "conservative").length,
      optimistic: group.filter((c) => c.zone === "optimistic").length,
    }));
  }, [candidates]);
  const height = 220;
  const margin = { top: 18, right: 8, bottom: 40, left: 36 };
  const maxCount = Math.max(1, ...bins.map((b) => b.conservative + b.optimistic));
  const x = scaleLinear().domain([20, 100]).range([margin.left, Math.max(margin.left + 100, width - margin.right)]);
  const y = scaleLinear().domain([0, maxCount]).nice().range([height - margin.bottom, margin.top]);
  return (
    <div ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Распределение баллов кандидатов по интервалам в 5 баллов, по зонам">
          <g class="grid">
            {y.ticks(4).map((tick) => (
              <line key={tick} x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} />
            ))}
          </g>
          <g class="axis">
            {y.ticks(4).map((tick) => (
              <text key={tick} x={margin.left - 8} y={y(tick) + 4} text-anchor="end">
                {int(tick)}
              </text>
            ))}
            {[20, 40, 60, 80, 100].map((tick) => (
              <text key={tick} x={x(tick)} y={height - margin.bottom + 18} text-anchor="middle">
                {tick}
              </text>
            ))}
          </g>
          <text class="axis-title" x={(margin.left + width) / 2} y={height - 4} text-anchor="middle">
            Балл (из 100)
          </text>
          {bins.map((b) => {
            const left = x(b.x0) + 1;
            const w = Math.max(1, x(b.x1) - x(b.x0) - 2);
            const total = b.conservative + b.optimistic;
            const yCons = y(b.conservative);
            const yTop = y(total);
            return (
              <g key={b.x0}>
                <title>{`${b.x0}–${b.x1} баллов: ${total} (консервативная ${b.conservative}, расширенная ${b.optimistic})`}</title>
                {b.conservative > 0 && <rect x={left} width={w} y={yCons} height={y(0) - yCons} fill="var(--zone-cons)" rx={1} />}
                {b.optimistic > 0 && <rect x={left} width={w} y={yTop} height={Math.max(0, yCons - yTop - (b.conservative ? 2 : 0))} fill="var(--zone-cons-fill)" stroke="var(--zone-cons)" stroke-width={1} rx={1} />}
                {total > 0 && (
                  <text class="chart-label" x={left + w / 2} y={yTop - 5} text-anchor="middle">
                    {total}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/** Положение планеты относительно зоны обитаемости её звезды на логарифмической оси потока. */
export function ZoneStrip({ candidate, domain }: { candidate: Candidate; domain?: [number, number] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  // domain = [наибольший, наименьший] поток; фиксированная ось не «плывёт», когда меняется поток планеты.
  const lo = domain ? domain[1] : Math.min(candidate.optimisticOuterFlux, candidate.fluxEarth, 1) / 1.8;
  const hi = domain ? domain[0] : Math.max(candidate.optimisticInnerFlux, candidate.fluxEarth, 1) * 1.8;
  const height = 112;
  const margin = { left: 12, right: 12 };
  const x = scaleLog().domain([hi, lo]).range([margin.left, Math.max(margin.left + 100, width - margin.right)]);
  const bandY = 34;
  const bandH = 26;
  const ticks = logTicks(lo, hi, [1, 2, 5]);
  const planetX = x(candidate.fluxEarth);
  return (
    <div ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`Поток ${sig(candidate.fluxEarth)} S⊕ при зоне ${sig(candidate.optimisticOuterFlux)}–${sig(candidate.optimisticInnerFlux)} S⊕`}>
          <rect x={x(candidate.optimisticInnerFlux)} width={x(candidate.optimisticOuterFlux) - x(candidate.optimisticInnerFlux)} y={bandY} height={bandH} fill="var(--zone-opt-fill)" stroke="var(--zone-cons)" stroke-width={1} rx={2} />
          <rect x={x(candidate.conservativeInnerFlux)} width={x(candidate.conservativeOuterFlux) - x(candidate.conservativeInnerFlux)} y={bandY} height={bandH} fill="var(--zone-cons-fill)" rx={2} />
          <g class="axis">
            <line x1={margin.left} x2={width - margin.right} y1={bandY + bandH} y2={bandY + bandH} />
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={x(tick)} x2={x(tick)} y1={bandY + bandH} y2={bandY + bandH + 5} />
                <text x={x(tick)} y={bandY + bandH + 18} text-anchor="middle">
                  {num(tick, 2)}
                </text>
              </g>
            ))}
          </g>
          <text class="axis-title" x={margin.left} y={height - 4}>
            горячее
          </text>
          <text class="axis-title" x={width - margin.right} y={height - 4} text-anchor="end">
            холоднее
          </text>
          <text class="axis-title" x={width / 2} y={height - 4} text-anchor="middle">
            поток, S⊕
          </text>
          <line x1={x(1)} x2={x(1)} y1={bandY - 6} y2={bandY + bandH} stroke="var(--ink-2)" stroke-width={1.5} />
          <text class="chart-label" x={x(1)} y={bandY - 10} text-anchor="middle">
            Земля
          </text>
          <line x1={planetX} x2={planetX} y1={bandY - 18} y2={bandY + bandH} stroke="var(--ink)" stroke-width={2.5} />
          <text class="chart-label chart-label--strong" x={Math.min(Math.max(planetX, 60), width - 60)} y={14} text-anchor="middle">
            {candidate.name}: {sig(candidate.fluxEarth)} S⊕
          </text>
        </svg>
      )}
    </div>
  );
}

/** Схема орбиты сверху в масштабе: зона обитаемости и орбита по данным NASA; тела не в масштабе. */
export function OrbitSketch({ candidate }: { candidate: Candidate }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const a = candidate.semiMajorAxisAu;
  if (!a) return <p class="muted">Большая полуось не опубликована — схему орбиты в масштабе построить нельзя.</p>;
  // Поток падает как 1/d²: граница с потоком S лежит на расстоянии a·√(S_планеты / S).
  const radius = (flux: number) => a * Math.sqrt(candidate.fluxEarth / flux);
  const e = candidate.eccentricity ?? 0;
  const outer = Math.max(radius(candidate.optimisticOuterFlux), a * (1 + e)) * 1.08;
  const size = Math.min(width || 320, 440);
  const scale = (size / 2 - 16) / outer;
  const c = size / 2;
  const ring = (inner: number, outerR: number, fill: string) => (
    <path
      d={`M ${c - outerR * scale} ${c} a ${outerR * scale} ${outerR * scale} 0 1 0 ${2 * outerR * scale} 0 a ${outerR * scale} ${outerR * scale} 0 1 0 ${-2 * outerR * scale} 0 M ${c - inner * scale} ${c} a ${inner * scale} ${inner * scale} 0 1 1 ${2 * inner * scale} 0 a ${inner * scale} ${inner * scale} 0 1 1 ${-2 * inner * scale} 0`}
      fill={fill}
      fill-rule="evenodd"
    />
  );
  const semiMinor = a * Math.sqrt(1 - e * e);
  const focusOffset = a * e;
  const barAu = outer > 2 ? 1 : outer > 0.5 ? 0.1 : outer > 0.1 ? 0.05 : 0.01;
  return (
    <div ref={ref}>
      {width > 0 && (
        <svg width={size} height={size} role="img" aria-label={`Орбита с большой полуосью ${sig(a)} а. е. и зона обитаемости звезды в масштабе`}>
          {ring(radius(candidate.optimisticInnerFlux), radius(candidate.optimisticOuterFlux), "var(--zone-opt-fill)")}
          {ring(radius(candidate.conservativeInnerFlux), radius(candidate.conservativeOuterFlux), "var(--zone-cons-fill)")}
          <ellipse cx={c - focusOffset * scale} cy={c} rx={a * scale} ry={semiMinor * scale} fill="none" stroke="var(--ink)" stroke-width={1.5} />
          <circle cx={c} cy={c} r={5} fill="var(--warn)" stroke="var(--paper)" stroke-width={2} />
          <circle cx={c + a * (1 - e) * scale} cy={c} r={4.5} fill="var(--ink)" stroke="var(--paper)" stroke-width={2} />
          <g transform={`translate(12 ${size - 14})`}>
            <line x1={0} x2={barAu * scale} y1={0} y2={0} stroke="var(--ink-2)" stroke-width={2} />
            <text class="chart-label" x={0} y={-6}>
              {num(barAu, 2)} а. е.
            </text>
          </g>
        </svg>
      )}
    </div>
  );
}

export function CandidateLinks({ names }: { names: string[] }) {
  return (
    <>
      {names.map((name, index) => (
        <span key={name}>
          {index > 0 && ", "}
          <Link href={`/planets/${encodeURIComponent(name)}`}>{name}</Link>
        </span>
      ))}
    </>
  );
}
