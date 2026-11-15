import { useMemo, useState } from "preact/hooks";
import { api } from "../api/endpoints";
import type { Candidate, CatalogPoint, PlanetsResponse } from "../api/types";
import { catalogSummary, MassFluxChart, PointLegend, RadiusFluxChart, radiusSummary, SizeTable, SummaryTable, ZoneDiagram } from "../charts/CatalogCharts";
import { ScoreHistogram, StabilityChart } from "../charts/Detail";
import { SkyMap } from "../charts/SkyMap";
import { ErrorState, Figure, Loading, ScoreBar, ZoneTag } from "../components/ui";
import { COMPARE_LIMIT, toggleCompare, useCompare } from "../lib/compare";
import { count, int, lightYears, num, sig } from "../lib/format";
import { useResource, useVisible, useWidth } from "../lib/hooks";
import { FUNNEL } from "../lib/science";
import { Link } from "../router";

type SortKey = "score" | "radius" | "flux" | "distance" | "spread";

const SORTS: Record<SortKey, { label: string; value: (c: Candidate) => number; desc: boolean }> = {
  score: { label: "Балл", value: (c) => c.score, desc: true },
  radius: { label: "Радиус", value: (c) => c.radiusEarth ?? Infinity, desc: false },
  flux: { label: "Поток", value: (c) => Math.abs(Math.log(c.fluxEarth)), desc: false },
  distance: { label: "Расстояние", value: (c) => c.distanceParsec ?? Infinity, desc: false },
  spread: { label: "Разброс места", value: (c) => (c.stability ? c.stability.rankP90 - c.stability.rankP10 : Infinity), desc: false },
};

function Funnel({ planets }: { planets: PlanetsResponse }) {
  let remaining = planets.total;
  const stages = FUNNEL.map((stage) => {
    const removed = planets.exclusions[stage.code] ?? 0;
    remaining -= removed;
    return { ...stage, removed, remaining };
  });
  return (
    <div>
      <ol class="funnel" aria-label="Этапы отбора и число оставшихся планет">
        <li>
          <span class="funnel__label">Все подтверждённые планеты</span>
          <span class="funnel__count">{int(planets.total)}</span>
          <span class="funnel__bar" aria-hidden="true">
            <span style={{ width: "100%" }} />
          </span>
        </li>
        {stages.map((stage) => (
          <li key={stage.code}>
            <span class="funnel__label">
              {stage.kept}
              {stage.removed > 0 && <span class="muted"> (−{int(stage.removed)}: {stage.label})</span>}
            </span>
            <span class="funnel__count">{int(stage.remaining)}</span>
            <span class="funnel__bar" aria-hidden="true">
              <span style={{ width: `${Math.max(0.4, (100 * stage.remaining) / planets.total)}%` }} />
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function RankingTable({ candidates }: { candidates: Candidate[] }) {
  const [zone, setZone] = useState<"all" | "conservative" | "optimistic">("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("score");
  const [limit, setLimit] = useState(25);
  const selected = useCompare();
  const [ref, width] = useWidth<HTMLDivElement>();
  const compact = width > 0 && width < 760;
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = candidates.filter((c) => (zone === "all" || c.zone === zone) && (!needle || c.name.toLowerCase().includes(needle) || (c.hostName ?? "").toLowerCase().includes(needle)));
    const { value, desc } = SORTS[sort];
    return [...filtered].sort((a, b) => (desc ? value(b) - value(a) : value(a) - value(b)) || (a.rank ?? 0) - (b.rank ?? 0));
  }, [candidates, zone, query, sort]);

  return (
    <div ref={ref}>
      <div class="toolbar" role="group" aria-label="Фильтры рейтинга">
        <div class="segmented" role="group" aria-label="Зона обитаемости">
          {(
            [
              ["all", "Все"],
              ["conservative", "Консервативная зона"],
              ["optimistic", "Только расширенная"],
            ] as const
          ).map(([key, label]) => (
            <button key={key} type="button" aria-pressed={zone === key} onClick={() => setZone(key)}>
              {label}
            </button>
          ))}
        </div>
        <label class="visually-hidden" for="ranking-search">
          Найти планету или звезду
        </label>
        <input id="ranking-search" class="input" type="search" placeholder="Найти планету или звезду" value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
        <label class="field__label" for="ranking-sort" style={{ display: "inline-flex", gap: "8px", alignItems: "center" }}>
          Порядок
        <select id="ranking-sort" class="select" style={{ width: "auto" }} value={sort} onChange={(e) => setSort((e.target as HTMLSelectElement).value as SortKey)}>
          <option value="score">по баллу</option>
          <option value="radius">по радиусу, от меньшего</option>
          <option value="flux">по близости потока к земному</option>
          <option value="distance">по расстоянию, от ближних</option>
          <option value="spread">по устойчивости места</option>
        </select>
        </label>
      </div>
      <p class="muted" style={{ marginBottom: "10px" }} aria-live="polite">
        {count(rows.length, ["планета", "планеты", "планет"])} в выборке. Интервал места — результат 80 % пересчётов с погрешностями NASA.
      </p>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th class="r" scope="col">
                Место
              </th>
              <th scope="col">Планета</th>
              <th scope="col" style={{ minWidth: compact ? "0" : "150px" }}>
                Балл
              </th>
              {!compact && (
                <>
                  <th scope="col">Зона</th>
                  <th class="r" scope="col">
                    Радиус, R⊕
                  </th>
                  <th class="r" scope="col">
                    Поток, S⊕
                  </th>
                  <th class="r" scope="col">
                    Звезда, K
                  </th>
                  <th class="r" scope="col">
                    Расстояние
                  </th>
                  <th class="r" scope="col">
                    Место в 80 % пересчётов
                  </th>
                </>
              )}
              <th scope="col">
                <span class="visually-hidden">Сравнение</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((c) => {
              const checked = selected.includes(c.name);
              return (
                <tr key={c.name}>
                  <td class="r">{c.rank ?? "—"}</td>
                  <td>
                    <Link href={`/planets/${encodeURIComponent(c.name)}`}>{c.name}</Link>
                    {compact && (
                      <div class="muted" style={{ fontSize: "var(--fs-xs)", marginTop: "2px" }}>
                        <ZoneTag zone={c.zone} /> R {c.radiusEarth !== null ? `${num(c.radiusEarth, 2)} R⊕` : "—"}, S {sig(c.fluxEarth)} S⊕
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                      <span class="num" style={{ minWidth: "3ch", fontWeight: 600 }}>
                        {num(c.score, 1, 1)}
                      </span>
                      <ScoreBar candidate={c} compact={compact} />
                    </div>
                  </td>
                  {!compact && (
                    <>
                      <td>
                        <ZoneTag zone={c.zone} />
                      </td>
                      <td class="r">{c.radiusEarth !== null ? num(c.radiusEarth, 2) : <span class="muted">нет</span>}</td>
                      <td class="r">{sig(c.fluxEarth)}</td>
                      <td class="r">{int(c.stellarTemperatureK)}</td>
                      <td class="r">{lightYears(c.distanceParsec)}</td>
                      <td class="r">{c.stability ? (c.stability.rankP10 === c.stability.rankP90 ? int(c.stability.rankP10) : `${int(c.stability.rankP10)}–${int(c.stability.rankP90)}`) : "—"}</td>
                    </>
                  )}
                  <td>
                    <label class="tag" style={{ cursor: "pointer" }}>
                      <input type="checkbox" checked={checked} disabled={!checked && selected.length >= COMPARE_LIMIT} onChange={() => toggleCompare(c.name)} />
                      <span class={compact ? "visually-hidden" : ""}>сравнить</span>
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button class="btn" type="button" style={{ marginTop: "12px" }} onClick={() => setLimit(rows.length)}>
          Показать все {rows.length}
        </button>
      )}
    </div>
  );
}

function Lazy({ children, height = 360 }: { children: () => preact.ComponentChildren; height?: number }) {
  const [ref, visible] = useVisible<HTMLDivElement>();
  return <div ref={ref}>{visible ? children() : <div class="placeholder" style={{ height: `${height}px` }} />}</div>;
}

function CandidatesTable({ points }: { points: CatalogPoint[] }) {
  return (
    <table class="data-table">
      <caption>Кандидаты с координатами систем</caption>
      <thead>
        <tr>
          <th scope="col">Планета</th>
          <th scope="col">Звезда</th>
          <th class="r" scope="col">
            Прямое восхождение, °
          </th>
          <th class="r" scope="col">
            Склонение, °
          </th>
          <th class="r" scope="col">
            Расстояние, пк
          </th>
        </tr>
      </thead>
      <tbody>
        {points
          .filter((p) => p.eligible)
          .map((p) => (
            <tr key={p.name}>
              <td>
                <Link href={`/planets/${encodeURIComponent(p.name)}`}>{p.name}</Link>
              </td>
              <td>{p.hostName}</td>
              <td class="r">{num(p.rightAscensionDegrees, 2)}</td>
              <td class="r">{num(p.declinationDegrees, 2)}</td>
              <td class="r">{num(p.distanceParsec, 1)}</td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}

export function Dashboard() {
  const planets = useResource(() => api.planets(), []);
  const candidates = useResource(() => api.candidates(), []);
  const methodology = useResource(() => api.methodology(), []);
  const [metric, setMetric] = useState<"rank" | "score">("rank");
  const [size, setSize] = useState<"radius" | "mass">("radius");
  const error = planets.error ?? candidates.error;
  const summary = planets.data ? catalogSummary(planets.data.items) : null;
  const list = candidates.data?.items ?? [];

  return (
    <div class="wrap">
      <header class="page-head">
        <h1>Планеты, похожие на Землю</h1>
        <p class="lead">
          {summary ? `Из ${int(summary.total)} подтверждённых экзопланет ${int(summary.candidates)} проходят отбор по размеру и получаемому излучению.` : "Отбираем подтверждённые экзопланеты по размеру и получаемому излучению."} Балл помогает сравнить кандидатов.
        </p>
        <div class="page-head__meta">
          <span>Методика версии {planets.data?.scoreVersion ?? "—"}</span>
          <Link href="/method">Как считается балл</Link>
        </div>
      </header>

      {error && !planets.data ? (
        <ErrorState error={error} onRetry={() => (planets.reload(), candidates.reload())} />
      ) : !planets.data ? (
        <Loading>Загружаем каталог NASA…</Loading>
      ) : (
        <>
          <section class="section" aria-labelledby="zone-figure">
            <Figure
              id="zone-figure"
              title="Сколько излучения получает каждая планета и насколько горяча её звезда"
              legend={<PointLegend />}
              table={() => <SummaryTable points={planets.data!.items} />}
              caption={
                <>
                  Точки — подтверждённые планеты: {int(summary!.plotted)} из {int(summary!.total)} видны в пределах осей, {int(summary!.hot)} с потоком выше 30 S⊕ — вне шкалы. Зелёные полосы — зоны обитаемости по Kopparapu и др. (2014) для массы Земли; модель применима к звёздам 2600–7200 K. Ось потока логарифмическая.
                </>
              }
            >
              <ZoneDiagram points={planets.data.items} boundaries={methodology.data?.boundaries} />
            </Figure>
          </section>

          <section class="section grid-main-side" aria-labelledby="ranking-title">
            <div>
              <div class="section__head">
                <h2 id="ranking-title">Рейтинг кандидатов</h2>
              </div>
              {candidates.error ? <ErrorState error={candidates.error} onRetry={candidates.reload} /> : !candidates.data ? <Loading /> : <RankingTable candidates={list} />}
            </div>
            <aside aria-labelledby="funnel-title">
              <div class="section__head">
                <h2 id="funnel-title">Как устроен отбор</h2>
              </div>
              <p class="muted" style={{ marginBottom: "14px" }}>Числа в скобках — сколько планет отсеяно.</p>
              <Funnel planets={planets.data} />
            </aside>
          </section>

          <section class="section" aria-labelledby="size-title">
            <div class="section__head">
              <h2 id="size-title">Размер и излучение</h2>
              <p class="muted">Отбор исключает газовые гиганты и мини-нептуны по размеру.</p>
            </div>
            <Figure
              title={size === "radius" ? "Радиус планеты и получаемый поток" : "Масса планеты и получаемый поток"}
              legend={
                <div class="toolbar" style={{ marginBottom: 0 }}>
                  <div class="segmented" role="group" aria-label="Мера размера">
                    <button type="button" aria-pressed={size === "radius"} onClick={() => setSize("radius")}>
                      Радиус
                    </button>
                    <button type="button" aria-pressed={size === "mass"} onClick={() => setSize("mass")}>
                      Масса
                    </button>
                  </div>
                  <PointLegend />
                </div>
              }
              table={() => <SizeTable points={planets.data!.items} metric={size} />}
              caption={
                size === "mass" ? (
                  <>
                    Показаны планеты с массой и потоком. Метод лучевых скоростей даёт только нижнюю оценку массы (M·sin i), поэтому часть точек на самом деле выше. Зелёная полоса — допустимая масса 0,1–10 масс Земли; в
                    рейтинге масса используется, только если радиус неизвестен. Обе оси логарифмические.
                  </>
                ) : (
                <>
                  Показаны {int(radiusSummary(planets.data!.items).total)} планет с радиусом и потоком. У {int(radiusSummary(planets.data!.items).calculated)} из них радиус не измерен транзитом, а вычислен архивом NASA по массе
                  через эмпирическое соотношение масса — радиус; такие планеты образуют горизонтальную полосу около 12–13 R⊕. Зелёная полоса — допустимый размер 0,5–2,5 радиуса Земли. Обе оси логарифмические.
                </>
                )
              }
            >
              <Lazy>{() => (size === "radius" ? <RadiusFluxChart points={planets.data!.items} /> : <MassFluxChart points={planets.data!.items} />)}</Lazy>
            </Figure>
          </section>

          {list.length > 0 && (
            <section class="section grid-2">
              <Figure
                title={metric === "rank" ? "Насколько устойчиво место в рейтинге" : "Насколько устойчив балл"}
                legend={
                  <div class="toolbar" style={{ marginBottom: 0 }}>
                    <div class="segmented" role="group" aria-label="Что показать">
                      <button type="button" aria-pressed={metric === "rank"} onClick={() => setMetric("rank")}>
                        Место
                      </button>
                      <button type="button" aria-pressed={metric === "score"} onClick={() => setMetric("score")}>
                        Балл
                      </button>
                    </div>
                    <ul class="legend">
                      <li>
                        <span class="legend__dot" style={{ background: "var(--ink)" }} aria-hidden="true" />
                        опубликованное значение
                      </li>
                      <li>
                        <span class="legend__band" style={{ background: "var(--series-blue)", height: "4px" }} aria-hidden="true" />
                        10–90-й процентили
                      </li>
                    </ul>
                  </div>
                }
                table={() => (
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th scope="col">Планета</th>
                        <th class="r" scope="col">
                          Место
                        </th>
                        <th class="r" scope="col">
                          Место, 10–90 %
                        </th>
                        <th class="r" scope="col">
                          Балл, 10–90 %
                        </th>
                        <th class="r" scope="col">
                          В топ-50
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((c) => (
                        <tr key={c.name}>
                          <td>{c.name}</td>
                          <td class="r">{c.rank}</td>
                          <td class="r">{c.stability ? `${c.stability.rankP10}–${c.stability.rankP90}` : "—"}</td>
                          <td class="r">{c.stability ? `${num(c.stability.scoreP10, 1)}–${num(c.stability.scoreP90, 1)}` : "—"}</td>
                          <td class="r">{c.stability ? `${num(c.stability.top50Percent, 0)} %` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                caption="160 пересчётов всего каталога: каждое входное значение сдвигается в пределах опубликованной погрешности NASA, отбор и балл считаются заново. Узкий отрезок — место почти не зависит от погрешностей. Систематические ошибки и корреляции не моделируются."
              >
                <StabilityChart candidates={list} metric={metric} />
              </Figure>
              <div style={{ display: "grid", gap: "40px", alignContent: "start" }}>
                <Figure
                  title="Распределение баллов"
                  legend={
                    <ul class="legend">
                      <li>
                        <span class="legend__band" style={{ background: "var(--zone-cons)" }} aria-hidden="true" />
                        консервативная зона
                      </li>
                      <li>
                        <span class="legend__band" style={{ background: "var(--zone-cons-fill)", boxShadow: "inset 0 0 0 1px var(--zone-cons)" }} aria-hidden="true" />
                        только расширенная
                      </li>
                    </ul>
                  }
                  caption="Планеты консервативной зоны получают 50 баллов за зону, расширенной — 25, поэтому они образуют две группы. Число над столбцом — количество планет в интервале 5 баллов."
                >
                  <ScoreHistogram candidates={list} />
                </Figure>
              </div>
            </section>
          )}

          <section class="section" aria-labelledby="sky-title">
            <div class="section__head">
              <h2 id="sky-title">Где они на небе</h2>
            </div>
            <Figure
              title="Направления на звёздные системы с подтверждёнными планетами"
              legend={
                <ul class="legend">
                  <li>
                    <span class="legend__dot" style={{ background: "var(--ink)" }} aria-hidden="true" />
                    система с кандидатом
                  </li>
                  <li>
                    <span class="legend__dot" style={{ background: "var(--point-context)" }} aria-hidden="true" />
                    остальные системы
                  </li>
                </ul>
              }
              table={() => <CandidatesTable points={planets.data!.items} />}
              caption="Равновеликая проекция Хаммера в экваториальных координатах: прямое восхождение растёт влево, как на небе для наблюдателя. Показано направление на звезду, а не положение планеты на орбите; расстояние указано в подсказке. Плотное пятно в Лебеде и Лире — поле зрения телескопа «Кеплер», скопление в Стрельце — обзоры микролинзирования в сторону центра Галактики."
            >
              <Lazy height={320}>{() => <SkyMap points={planets.data!.items} />}</Lazy>
            </Figure>
          </section>
        </>
      )}
    </div>
  );
}
