import { scaleLinear, scaleLog } from "d3-scale";
import { line } from "d3-shape";
import { api } from "../api/endpoints";
import type { BoundaryRow, Methodology } from "../api/types";
import { logTicks } from "../charts/Scatter";
import { ErrorState, Figure, Loading } from "../components/ui";
import { dateTimeRu, int, num } from "../lib/format";
import { useResource, useWidth } from "../lib/hooks";
import { FUNNEL } from "../lib/science";
import { Link } from "../router";

const CURVES: { key: keyof BoundaryRow; label: string; strong: boolean }[] = [
  { key: "recentVenus", label: "недавняя Венера", strong: false },
  { key: "runawayGreenhouse", label: "неуправляемый парниковый эффект", strong: true },
  { key: "maximumGreenhouse", label: "максимальный парниковый эффект", strong: true },
  { key: "earlyMars", label: "ранний Марс", strong: false },
];

function BoundaryChart({ rows }: { rows: BoundaryRow[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const height = 340;
  const margin = { top: 16, right: 16, bottom: 44, left: 56 };
  const x = scaleLog().domain([2.6, 0.15]).range([margin.left, Math.max(margin.left + 120, width - margin.right)]);
  const y = scaleLinear().domain([2600, 7200]).range([height - margin.bottom, margin.top]);
  const path = (key: keyof BoundaryRow) =>
    line<BoundaryRow>()
      .x((row) => x(row[key]))
      .y((row) => y(row.teffK))(rows) ?? "";
  return (
    <div ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Четыре границы зоны обитаемости Kopparapu 2014 в зависимости от температуры звезды">
          <g class="grid">
            {logTicks(0.15, 2.6, [1, 2, 5]).map((t) => (
              <line key={t} x1={x(t)} x2={x(t)} y1={margin.top} y2={height - margin.bottom} />
            ))}
            {[3000, 4000, 5000, 6000, 7000].map((t) => (
              <line key={t} x1={margin.left} x2={x.range()[1]} y1={y(t)} y2={y(t)} />
            ))}
          </g>
          <g class="axis">
            {logTicks(0.15, 2.6, [1, 2, 5]).map((t) => (
              <text key={t} x={x(t)} y={height - margin.bottom + 18} text-anchor="middle">
                {num(t, 1)}
              </text>
            ))}
            {[3000, 4000, 5000, 6000, 7000].map((t) => (
              <text key={t} x={margin.left - 8} y={y(t) + 4} text-anchor="end">
                {int(t)}
              </text>
            ))}
          </g>
          <text class="axis-title" x={(margin.left + x.range()[1]) / 2} y={height - 6} text-anchor="middle">
            Эффективный поток, S⊕
          </text>
          <text class="axis-title" transform={`translate(13 ${(margin.top + height - margin.bottom) / 2}) rotate(-90)`} text-anchor="middle">
            Температура звезды, K
          </text>
          {CURVES.map((curve) => (
            <path key={curve.key} d={path(curve.key)} fill="none" stroke={curve.strong ? "var(--zone-cons)" : "var(--ink-2)"} stroke-width={2} />
          ))}
          <circle cx={x(1)} cy={y(5772)} r={4.5} fill="var(--ink)" stroke="var(--paper)" stroke-width={2} />
          <text class="chart-label chart-label--strong" x={x(1) + 8} y={y(5772) - 6}>
            Земля
          </text>
        </svg>
      )}
    </div>
  );
}

function Body({ m }: { m: Methodology }) {
  const w = m.weights;
  const t = m.thresholds;
  return (
    <>
      <section class="section grid-main-side">
        <div class="prose">
          <h2 style={{ marginBottom: "14px" }}>Что делает балл</h2>
          <p>
            Балл помогает просматривать кандидатов по порядку: сначала планеты, которые получают от звезды поток в консервативной зоне обитаемости, ближе к Земле по размеру и на почти круговой орбите. Он не оценивает вероятность
            жизни, не равен индексу подобия Земле ESI и не доказывает, что планета обитаема. Для таких выводов нужны данные об атмосфере и поверхности, которых в каталоге нет.
          </p>
          <h2 style={{ margin: "32px 0 14px" }}>Отбор</h2>
          <p>Планета попадает в рейтинг, только если проходит все условия:</p>
          <ul>
            {FUNNEL.map((stage) => (
              <li key={stage.code}>{stage.kept}.</li>
            ))}
          </ul>
          <p>
            Если известны и радиус, и масса, проходить должны оба. Значения, которые NASA публикует только как верхний или нижний предел, не считаются измерениями: по пределу температуры, светимости или полуоси планета в рейтинг не
            попадёт. Если поток не опубликован, мы оцениваем его как светимость звезды, делённую на квадрат большой полуоси, и помечаем это в карточке.
          </p>
          <h2 style={{ margin: "32px 0 14px" }}>Три компонента</h2>
          <p>
            <strong>Зона обитаемости:</strong> {w?.conservativeZone ?? 50} баллов в консервативной зоне, {w?.optimisticZone ?? 25} — если поток попадает только в расширенную. Границы взяты из работы Kopparapu и др. (2014) для
            планеты массой с Землю и зависят от температуры звезды.
          </p>
          <p>
            <strong>Размер:</strong> до {w?.sizeMax ?? 35} баллов. Радиус R в земных: 35 × (1 − |ln R| / ln 2,5); радиус ровно земной даёт 35, 2,5 радиуса Земли — ноль. Если радиус не измерен, так же оценивается масса с
            границей 10 масс Земли.
          </p>
          <p>
            <strong>Орбита:</strong> до {w?.orbitMax ?? 15} баллов, 15 × (1 − e / 0,5): круговая орбита — 15, эксцентриситет 0,5 и больше — ноль. Неизвестный эксцентриситет получает нейтральные {num(w?.orbitUnknown ?? 7.5, 1)}{" "}
            балла.
          </p>
          <h2 style={{ margin: "32px 0 14px" }}>Устойчивость места</h2>
          <p>
            Каталог {m.stabilitySamples ?? 160} раз пересчитывается целиком: каждое входное значение сдвигается случайно в пределах опубликованной погрешности NASA (отдельно вверх и вниз), а отбор и балл считаются заново. В
            карточке показаны 10-й и 90-й процентили места и балла, доля попаданий в первую полусотню и доля пересчётов, в которых планета вообще прошла отбор. Это чувствительность к опубликованным погрешностям при допущении,
            что они независимы. Систематические ошибки, связи между величинами и расхождения публикаций не моделируются.
          </p>
          <h2 style={{ margin: "32px 0 14px" }}>Что показано отдельно</h2>
          <p>
            TSM и ESM — показатели удобства наблюдения атмосферы спектрографом; они не входят в балл. Каталог PHL HWC — независимая методика отбора, датированная 21 марта 2024 года; показан только для сравнения. Gaia DR3, TESS и
            спектры атмосферы — дополнительные наблюдения в карточке; балл по ним не пересчитывается.
          </p>
        </div>
        <aside>
          <h2 style={{ marginBottom: "14px" }}>Пороги отбора</h2>
          <dl class="facts">
            <dt>Температура звезды</dt>
            <dd>
              {int(t?.stellarTemperatureK[0] ?? 2600)}–{int(t?.stellarTemperatureK[1] ?? 7200)} K
            </dd>
            <dt>Радиус</dt>
            <dd>
              {num(t?.radiusEarth[0] ?? 0.5, 1)}–{num(t?.radiusEarth[1] ?? 2.5, 1)} R⊕
            </dd>
            <dt>Масса</dt>
            <dd>
              {num(t?.massEarth[0] ?? 0.1, 1)}–{num(t?.massEarth[1] ?? 10, 0)} M⊕
            </dd>
            <dt>Пересчётов</dt>
            <dd>{m.stabilitySamples ?? 160}</dd>
          </dl>
          <h2 style={{ margin: "32px 0 14px" }}>Версии методики</h2>
          <ol style={{ display: "grid", gap: "12px", paddingLeft: "1.2em", margin: 0 }}>
            {(m.versions ?? []).map((version) => (
              <li key={version.version}>
                <strong>Версия {version.version}.</strong>{" "}
                <span class="muted">
                  {version.version === "1"
                    ? "Исходная эвристика: зона 50/25, размер до 35, орбита до 15."
                    : version.version === "1.1"
                      ? "Веса и границы те же. Значения, которые NASA даёт как пределы (температура звезды, светимость, большая полуось), больше не используются как измерения."
                      : version.note}
                </span>
              </li>
            ))}
          </ol>
          <p class="notice" style={{ marginTop: "24px" }}>
            Текущая версия: {m.scoreVersion}. Изменение формулы оформляется новой версией с объяснением, старые результаты не подменяются молча.
          </p>
        </aside>
      </section>
      {m.boundaries && (
        <section class="section">
          <Figure
            title="Границы зоны обитаемости в зависимости от температуры звезды"
            legend={
              <ul class="legend">
                <li>
                  <span class="legend__line" style={{ color: "var(--zone-cons)" }} aria-hidden="true" />
                  консервативная зона: неуправляемый (слева) и максимальный (справа) парниковый эффект
                </li>
                <li>
                  <span class="legend__line" style={{ color: "var(--ink-2)" }} aria-hidden="true" />
                  расширенная зона: недавняя Венера (слева) и ранний Марс (справа)
                </li>
              </ul>
            }
            caption={
              <>
                Kopparapu и др. (2014), табл. 1, планета массой с Землю. Между «неуправляемым» и «максимальным» парниковым эффектом — консервативная зона (зелёные линии), между «недавней Венерой» и «ранним Марсом» —
                расширенная. Для холодных звёзд зона сдвигается к меньшему потоку: их красный свет сильнее поглощается атмосферой и слабее рассеивается. Таблица границ отдаётся <code>/api/methodology</code>.
              </>
            }
            table={() => (
              <table class="data-table">
                <thead>
                  <tr>
                    <th class="r" scope="col">
                      Звезда, K
                    </th>
                    {CURVES.map((c) => (
                      <th key={c.key} class="r" scope="col">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {m.boundaries!.filter((_, i) => i % 3 === 0).map((row) => (
                    <tr key={row.teffK}>
                      <td class="r">{int(row.teffK)}</td>
                      {CURVES.map((c) => (
                        <td key={c.key} class="r">
                          {num(row[c.key], 3)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          >
            <BoundaryChart rows={m.boundaries} />
          </Figure>
        </section>
      )}
    </>
  );
}

export function Method() {
  const methodology = useResource(() => api.methodology(), []);
  const status = useResource(() => api.status(), []);
  return (
    <div class="wrap">
      <header class="page-head">
        <h1>Как отбираются и сортируются кандидаты</h1>
        <p class="lead">Простые правила по данным NASA, которые можно проверить. Ниже — что именно считается, какие пороги и чего балл не утверждает.</p>
        <div class="page-head__meta">
          <span>Снимок NASA: {dateTimeRu(status.data?.fetchedAt)}</span>
          <Link href="/">К рейтингу</Link>
        </div>
      </header>
      {methodology.error ? <ErrorState error={methodology.error} onRetry={methodology.reload} /> : !methodology.data ? <Loading /> : <Body m={methodology.data} />}
    </div>
  );
}
