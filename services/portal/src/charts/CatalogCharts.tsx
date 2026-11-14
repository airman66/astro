import { useMemo } from "preact/hooks";
import { area, curveMonotoneY } from "d3-shape";
import type { BoundaryRow, CatalogPoint } from "../api/types";
import { navigate } from "../router";
import { count, int, num, sig } from "../lib/format";
import { EARTH, EXCLUSION_LABEL, ZONE_LABEL } from "../lib/science";
import { logTicks, Scatter, type PointKind, type Scales, type ScatterPoint } from "./Scatter";

export function classify(point: CatalogPoint, highlight?: Set<string>): PointKind {
  if (highlight?.has(point.name)) return "highlight";
  if (point.eligible) return "candidate";
  if (point.habitableZone === "conservative" || point.habitableZone === "optimistic") return "zone";
  return "context";
}

export function PointLegend({ highlightLabel }: { highlightLabel?: string }) {
  return (
    <ul class="legend">
      <li>
        <span class="legend__dot" style={{ background: "var(--ink)" }} aria-hidden="true" />
        прошли отбор (кандидаты)
      </li>
      <li>
        <span class="legend__dot" style={{ background: "var(--series-blue)" }} aria-hidden="true" />в зоне обитаемости, но отсеяны по другому признаку
      </li>
      <li>
        <span class="legend__dot" style={{ background: "var(--point-context)" }} aria-hidden="true" />
        остальные планеты
      </li>
      {highlightLabel && (
        <li>
          <span class="legend__dot" style={{ background: "var(--ink)", boxShadow: "0 0 0 2px var(--paper), 0 0 0 3.5px var(--ink)" }} aria-hidden="true" />
          {highlightLabel}
        </li>
      )}
    </ul>
  );
}

function PointTooltip({ point }: { point: CatalogPoint }) {
  return (
    <>
      <strong>{point.name}</strong>
      <dl>
        <dt>Поток</dt>
        <dd>{point.fluxEarth !== null ? `${sig(point.fluxEarth)} S⊕` : "—"}</dd>
        <dt>Звезда</dt>
        <dd>{point.stellarTemperatureK !== null ? `${int(point.stellarTemperatureK)} K` : "—"}</dd>
        <dt>Радиус</dt>
        <dd>{point.radiusEarth !== null ? `${sig(point.radiusEarth)} R⊕${point.radiusCalculated ? ", вычислен архивом" : ""}` : "не измерен"}</dd>
        {point.radiusEarth === null && point.massEarth !== null && (
          <>
            <dt>Масса</dt>
            <dd>
              {sig(point.massEarth)} M⊕{point.massMayBeMinimum ? " (минимум)" : ""}
            </dd>
          </>
        )}
      </dl>
      <p style={{ marginTop: "6px" }}>
        {point.eligible
          ? `Кандидат, балл ${num(point.score, 1, 1)}. Нажмите ещё раз, чтобы открыть карточку.`
          : point.exclusion
            ? `Не прошла: ${EXCLUSION_LABEL[point.exclusion] ?? point.exclusion}.`
            : ""}
        {!point.eligible && point.habitableZone ? ` Поток: ${ZONE_LABEL[point.habitableZone]}.` : ""}
      </p>
    </>
  );
}

function open(point: ScatterPoint<CatalogPoint>) {
  if (point.data.eligible) navigate(`/planets/${encodeURIComponent(point.data.name)}`);
}

const FLUX_DOMAIN: [number, number] = [30, 0.05];

function bandPath(rows: BoundaryRow[], scales: Scales, inner: keyof BoundaryRow, outer: keyof BoundaryRow): string {
  const generator = area<BoundaryRow>()
    .y((row) => scales.y(row.teffK))
    .x0((row) => scales.x(row[inner]))
    .x1((row) => scales.x(row[outer]))
    .curve(curveMonotoneY);
  return generator(rows) ?? "";
}

function EarthMark({ scales, x, y }: { scales: Scales; x: number; y: number }) {
  const cx = scales.x(x);
  const cy = scales.y(y);
  return (
    <g>
      <circle cx={cx} cy={cy} r={6} fill="var(--paper)" stroke="var(--ink)" stroke-width={1.5} />
      <line x1={cx - 6} x2={cx + 6} y1={cy} y2={cy} stroke="var(--ink)" stroke-width={1.2} />
      <line x1={cx} x2={cx} y1={cy - 6} y2={cy + 6} stroke="var(--ink)" stroke-width={1.2} />
      <text class="chart-label chart-label--strong" x={cx + 10} y={cy - 8}>
        Земля
      </text>
    </g>
  );
}

function topLabels(points: CatalogPoint[], scales: Scales, y: (p: CatalogPoint) => number | null, limit: number) {
  const chosen = points
    .filter((p) => p.eligible && p.fluxEarth !== null && y(p) !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit * 3);
  const placed: { x: number; y: number }[] = [];
  const labels = [];
  for (const point of chosen) {
    const px = scales.x(point.fluxEarth!);
    const py = scales.y(y(point)!);
    if (px < scales.inner.left || px > scales.inner.right - 60) continue;
    if (placed.some((other) => Math.abs(other.x - px) < 90 && Math.abs(other.y - py) < 16)) continue;
    placed.push({ x: px, y: py });
    labels.push(
      <text key={point.name} class="chart-label chart-label--strong" x={px + 8} y={py + 4}>
        {point.name}
      </text>,
    );
    if (labels.length >= limit) break;
  }
  return labels;
}

interface CatalogChartProps {
  points: CatalogPoint[];
  boundaries?: BoundaryRow[];
  highlight?: Set<string>;
  labels?: number;
  height?: number;
}

/** Поток излучения (ось X, убывает вправо) и температура звезды (ось Y) с зонами Kopparapu 2014. */
export function ZoneDiagram({ points, boundaries, highlight, labels = 4, height }: CatalogChartProps) {
  const data = useMemo(
    () =>
      points
        .filter((p) => p.fluxEarth !== null && p.stellarTemperatureK !== null)
        .map<ScatterPoint<CatalogPoint>>((p) => ({ id: p.name, x: p.fluxEarth!, y: p.stellarTemperatureK!, kind: classify(p, highlight), data: p })),
    [points, highlight],
  );
  return (
    <Scatter
      points={data}
      xDomain={FLUX_DOMAIN}
      yDomain={[2300, 7600]}
      xLog
      xLabel="Поток излучения от звезды, в долях земного (S⊕) — вправо холоднее"
      yLabel="Температура звезды, K"
      xLabelShort="Поток, S⊕ (вправо холоднее)"
      yLabelShort="Звезда, K"
      xTicks={logTicks(0.05, 30, [1, 3])}
      yTicks={[3000, 4000, 5000, 6000, 7000]}
      xFormat={(v) => num(v, 2)}
      yFormat={(v) => int(v)}
      height={height}
      ariaLabel="Диаграмма: поток излучения и температура звезды для подтверждённых экзопланет с зонами обитаемости"
      onSelect={open}
      tooltip={(p) => <PointTooltip point={p.data} />}
      background={(scales) =>
        boundaries?.length ? (
          <g>
            <rect x={scales.inner.left} width={scales.inner.right - scales.inner.left} y={scales.y(7600)} height={scales.y(7200) - scales.y(7600)} fill="var(--plate)" />
            <rect x={scales.inner.left} width={scales.inner.right - scales.inner.left} y={scales.y(2600)} height={scales.y(2300) - scales.y(2600)} fill="var(--plate)" />
            <path d={bandPath(boundaries, scales, "recentVenus", "earlyMars")} fill="var(--zone-opt-fill)" />
            <path d={bandPath(boundaries, scales, "runawayGreenhouse", "maximumGreenhouse")} fill="var(--zone-cons-fill)" />
            <text class="chart-label chart-label--zone" x={scales.x(boundaries[boundaries.length - 3].runawayGreenhouse) + 6} y={scales.y(7050)}>
              консервативная зона
            </text>
            <text class="chart-label" x={scales.inner.right - 6} y={scales.y(7400) + 4} text-anchor="end">
              вне диапазона модели Kopparapu
            </text>
          </g>
        ) : null
      }
      foreground={(scales) => (
        <g>
          <EarthMark scales={scales} x={EARTH.fluxEarth} y={EARTH.sunTemperatureK} />
          {topLabels(points, scales, (p) => p.stellarTemperatureK, labels)}
        </g>
      )}
    />
  );
}

/** Радиус планеты и поток: коридор размера 0,5–2,5 R⊕ и ориентиры Нептуна и Юпитера. */
export function RadiusFluxChart({ points, highlight, labels = 3, height }: CatalogChartProps) {
  const data = useMemo(
    () =>
      points
        .filter((p) => p.fluxEarth !== null && p.radiusEarth !== null && p.radiusEarth > 0)
        .map<ScatterPoint<CatalogPoint>>((p) => ({ id: p.name, x: p.fluxEarth!, y: p.radiusEarth!, kind: classify(p, highlight), data: p })),
    [points, highlight],
  );
  return (
    <Scatter
      points={data}
      xDomain={FLUX_DOMAIN}
      yDomain={[0.3, 30]}
      xLog
      yLog
      xLabel="Поток излучения, S⊕ — вправо холоднее"
      yLabel="Радиус планеты, R⊕"
      xLabelShort="Поток, S⊕"
      yLabelShort="Радиус, R⊕"
      xTicks={logTicks(0.05, 30, [1, 3])}
      yTicks={[0.5, 1, 2, 4, 10, 20]}
      xFormat={(v) => num(v, 2)}
      yFormat={(v) => num(v, 1)}
      height={height}
      ariaLabel="Диаграмма: радиус планеты и поток излучения"
      onSelect={open}
      tooltip={(p) => <PointTooltip point={p.data} />}
      background={(scales) => (
        <g>
          <rect x={scales.inner.left} width={scales.inner.right - scales.inner.left} y={scales.y(2.5)} height={scales.y(0.5) - scales.y(2.5)} fill="var(--zone-opt-fill)" />
          <text class="chart-label chart-label--zone" x={scales.inner.left + 6} y={scales.y(2.5) + 14}>
            допустимый размер 0,5–2,5 R⊕
          </text>
          {[
            { r: 3.88, label: "Нептун" },
            { r: 11.21, label: "Юпитер" },
          ].map((ref) => (
            <g key={ref.label}>
              <line x1={scales.inner.left} x2={scales.inner.right} y1={scales.y(ref.r)} y2={scales.y(ref.r)} stroke="var(--rule-strong)" />
              <text class="chart-label" x={scales.inner.right - 4} y={scales.y(ref.r) - 5} text-anchor="end">
                {ref.label}
              </text>
            </g>
          ))}
        </g>
      )}
      foreground={(scales) => (
        <g>
          <EarthMark scales={scales} x={1} y={1} />
          {topLabels(points, scales, (p) => p.radiusEarth, labels)}
        </g>
      )}
    />
  );
}

/** Масса планеты и поток: коридор 0,1–10 M⊕; массы из метода лучевых скоростей — нижние оценки (M·sin i). */
export function MassFluxChart({ points, highlight, labels = 3, height }: CatalogChartProps) {
  const data = useMemo(
    () =>
      points
        .filter((p) => p.fluxEarth !== null && p.massEarth !== null && p.massEarth > 0)
        .map<ScatterPoint<CatalogPoint>>((p) => ({ id: p.name, x: p.fluxEarth!, y: p.massEarth!, kind: classify(p, highlight), data: p })),
    [points, highlight],
  );
  return (
    <Scatter
      points={data}
      xDomain={FLUX_DOMAIN}
      yDomain={[0.05, 10000]}
      xLog
      yLog
      xLabel="Поток излучения, S⊕ — вправо холоднее"
      yLabel="Масса планеты, M⊕"
      xLabelShort="Поток, S⊕"
      yLabelShort="Масса, M⊕"
      xTicks={logTicks(0.05, 30, [1, 3])}
      yTicks={[0.1, 1, 10, 100, 1000]}
      xFormat={(v) => num(v, 2)}
      yFormat={(v) => num(v, 1)}
      height={height}
      ariaLabel="Диаграмма: масса планеты и поток излучения"
      onSelect={open}
      tooltip={(p) => <PointTooltip point={p.data} />}
      background={(scales) => (
        <g>
          <rect x={scales.inner.left} width={scales.inner.right - scales.inner.left} y={scales.y(10)} height={scales.y(0.1) - scales.y(10)} fill="var(--zone-opt-fill)" />
          <text class="chart-label chart-label--zone" x={scales.inner.left + 6} y={scales.y(10) + 14}>
            допустимая масса 0,1–10 M⊕
          </text>
          {[
            { m: 17.15, label: "Нептун" },
            { m: 317.8, label: "Юпитер" },
          ].map((ref) => (
            <g key={ref.label}>
              <line x1={scales.inner.left} x2={scales.inner.right} y1={scales.y(ref.m)} y2={scales.y(ref.m)} stroke="var(--rule-strong)" />
              <text class="chart-label" x={scales.inner.right - 4} y={scales.y(ref.m) - 5} text-anchor="end">
                {ref.label}
              </text>
            </g>
          ))}
        </g>
      )}
      foreground={(scales) => (
        <g>
          <EarthMark scales={scales} x={1} y={1} />
          {topLabels(points, scales, (p) => p.massEarth, labels)}
        </g>
      )}
    />
  );
}

export function SizeTable({ points, metric }: { points: CatalogPoint[]; metric: "radius" | "mass" }) {
  const rows = points.filter((p) => p.eligible).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return (
    <table class="data-table">
      <caption>Кандидаты: размер и поток</caption>
      <thead>
        <tr>
          <th scope="col">Планета</th>
          <th class="r" scope="col">
            {metric === "radius" ? "Радиус, R⊕" : "Масса, M⊕"}
          </th>
          <th class="r" scope="col">
            Поток, S⊕
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.name}>
            <td>{p.name}</td>
            <td class="r">
              {metric === "radius"
                ? p.radiusEarth !== null
                  ? `${sig(p.radiusEarth)}${p.radiusCalculated ? " (вычислен)" : ""}`
                  : "—"
                : p.massEarth !== null
                  ? `${sig(p.massEarth)}${p.massMayBeMinimum ? " (минимум)" : ""}`
                  : "—"}
            </td>
            <td class="r">{sig(p.fluxEarth)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function radiusSummary(points: CatalogPoint[]) {
  const withRadius = points.filter((p) => p.radiusEarth !== null && p.fluxEarth !== null);
  return { total: withRadius.length, calculated: withRadius.filter((p) => p.radiusCalculated).length };
}

export function catalogSummary(points: CatalogPoint[]) {
  const withFluxTeff = points.filter((p) => p.fluxEarth !== null && p.stellarTemperatureK !== null);
  const shown = withFluxTeff.filter((p) => p.fluxEarth! <= 30 && p.fluxEarth! >= 0.05 && p.stellarTemperatureK! >= 2300 && p.stellarTemperatureK! <= 7600);
  const hot = withFluxTeff.filter((p) => p.fluxEarth! > 30).length;
  return {
    total: points.length,
    plotted: shown.length,
    hot,
    noData: points.length - withFluxTeff.length,
    candidates: points.filter((p) => p.eligible).length,
    inZone: points.filter((p) => p.habitableZone === "conservative" || p.habitableZone === "optimistic").length,
  };
}

export function SummaryTable({ points }: { points: CatalogPoint[] }) {
  const s = catalogSummary(points);
  const rows: [string, number][] = [
    ["Подтверждённых планет в снимке NASA", s.total],
    ["С известными потоком и температурой звезды", s.total - s.noData],
    ["Показано на графике (0,05–30 S⊕, 2300–7600 K)", s.plotted],
    ["Получают больше 30 S⊕ (не показаны, горячее Меркурия)", s.hot],
    ["В расширенной зоне обитаемости", s.inZone],
    ["Прошли весь отбор", s.candidates],
  ];
  return (
    <table class="data-table">
      <caption>Состав выборки на графике</caption>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            <td class="r">{count(value, ["планета", "планеты", "планет"])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
