import { useMemo } from "preact/hooks";
import { api } from "../api/endpoints";
import type { Candidate } from "../api/types";
import { PointLegend, RadiusFluxChart } from "../charts/CatalogCharts";
import { ZoneStrip } from "../charts/Detail";
import { ErrorState, Figure, Loading, ScoreBar, ZoneTag } from "../components/ui";
import { toggleCompare, useCompare } from "../lib/compare";
import { int, lightYears, num, sig } from "../lib/format";
import { useResource } from "../lib/hooks";
import { Link, useLocation } from "../router";

const ROWS: { label: string; earth: string; value: (c: Candidate) => string }[] = [
  { label: "Место в рейтинге", earth: "—", value: (c) => String(c.rank ?? "—") },
  { label: "Балл", earth: "—", value: (c) => num(c.score, 1, 1) },
  { label: "Радиус, R⊕", earth: "1", value: (c) => (c.radiusEarth !== null ? num(c.radiusEarth, 2) : "нет данных") },
  { label: "Масса, M⊕", earth: "1", value: (c) => (c.massEarth !== null ? `${sig(c.massEarth)}${c.dataFlags.includes("massMayBeMinimum") ? " (минимум)" : ""}` : "нет данных") },
  { label: "Поток, S⊕", earth: "1", value: (c) => sig(c.fluxEarth) },
  { label: "Равновесная температура, K", earth: "≈ 255", value: (c) => (c.equilibriumTemperatureK !== null ? int(c.equilibriumTemperatureK) : "нет данных") },
  { label: "Период, сут", earth: "365,26", value: (c) => (c.orbitalPeriodDays !== null ? sig(c.orbitalPeriodDays, 4) : "нет данных") },
  { label: "Эксцентриситет", earth: "0,017", value: (c) => (c.eccentricity !== null ? num(c.eccentricity, 3) : "нет данных") },
  { label: "Температура звезды, K", earth: "5772", value: (c) => int(c.stellarTemperatureK) },
  { label: "Расстояние", earth: "—", value: (c) => lightYears(c.distanceParsec) },
  { label: "Место в 80 % пересчётов", earth: "—", value: (c) => (c.stability ? `${c.stability.rankP10}–${c.stability.rankP90}` : "—") },
];

export function Compare() {
  const location = useLocation();
  const stored = useCompare();
  const names = useMemo(() => {
    const fromUrl = location.query.getAll("p");
    return (fromUrl.length ? fromUrl : stored).slice(0, 4);
  }, [location.query.toString(), stored.join("|")]);
  const candidates = useResource(() => api.candidates(), []);
  const planets = useResource(() => api.planets(), []);
  const chosen = (candidates.data?.items ?? []).filter((c) => names.includes(c.name));
  const highlight = useMemo(() => new Set(names), [names.join("|")]);

  return (
    <div class="wrap">
      <header class="page-head">
        <h1>Сравнение кандидатов</h1>
        <p class="lead">До четырёх планет рядом с Землёй. Значения NASA, балл и устойчивость места; пустые ячейки — величина не опубликована.</p>
      </header>
      {candidates.error ? (
        <ErrorState error={candidates.error} onRetry={candidates.reload} />
      ) : !candidates.data ? (
        <Loading />
      ) : (
        <>
          {names.filter((n) => !chosen.some((c) => c.name === n)).length > 0 && (
            <p class="notice" style={{ marginBottom: "20px" }}>
              Нет среди кандидатов: {names.filter((n) => !chosen.some((c) => c.name === n)).join(", ")}. Такие планеты не прошли отбор; причину показывает подсказка на диаграмме на главной.
            </p>
          )}
        </>
      )}
      {!candidates.data || candidates.error ? null : chosen.length === 0 ? (
        <div class="state">
          <h3>Планеты для сравнения не выбраны</h3>
          <p class="muted">
            Отметьте «сравнить» в <Link href="/">рейтинге</Link> или нажмите «Добавить к сравнению» в карточке планеты.
          </p>
        </div>
      ) : (
        <>
          <div class="table-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  <th scope="col">Величина</th>
                  {chosen.map((c) => (
                    <th key={c.name} scope="col" class="r">
                      <Link href={`/planets/${encodeURIComponent(c.name)}`}>{c.name}</Link>
                      <div>
                        <button class="btn btn--quiet" type="button" onClick={() => toggleCompare(c.name)}>
                          убрать
                        </button>
                      </div>
                    </th>
                  ))}
                  <th scope="col" class="r">
                    Земля
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Зона</th>
                  {chosen.map((c) => (
                    <td key={c.name} class="r">
                      <ZoneTag zone={c.zone} />
                    </td>
                  ))}
                  <td class="r muted">консервативная</td>
                </tr>
                <tr>
                  <th scope="row">Состав балла</th>
                  {chosen.map((c) => (
                    <td key={c.name}>
                      <ScoreBar candidate={c} />
                    </td>
                  ))}
                  <td />
                </tr>
                {ROWS.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    {chosen.map((c) => (
                      <td key={c.name} class="r">
                        {row.value(c)}
                      </td>
                    ))}
                    <td class="r muted">{row.earth}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section class="section">
            <h2 style={{ marginBottom: "16px" }}>Положение в зоне обитаемости своей звезды</h2>
            <div class="grid-2">
              {chosen.map((c) => (
                <Figure key={c.name} title={c.name} caption={`Звезда ${int(c.stellarTemperatureK)} K. Зона рассчитана для этой звезды, поэтому полосы у планет разные.`}>
                  <ZoneStrip candidate={c} />
                </Figure>
              ))}
            </div>
          </section>

          {planets.data && (
            <section class="section">
              <Figure title="Выбранные планеты на диаграмме «радиус и поток»" legend={<PointLegend highlightLabel="выбранные для сравнения" />} caption="Выделенные точки — планеты из таблицы; планеты без измеренного радиуса на этой диаграмме не показаны.">
                <RadiusFluxChart points={planets.data.items} highlight={highlight} labels={0} height={380} />
              </Figure>
            </section>
          )}
        </>
      )}
    </div>
  );
}
