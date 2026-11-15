import { useState } from "preact/hooks";
import { api } from "../api/endpoints";
import type { Candidate, CandidateSources } from "../api/types";
import { PointLegend, ZoneDiagram } from "../charts/CatalogCharts";
import { OrbitSketch, ZoneStrip } from "../charts/Detail";
import { COMPONENT_COLORS, ErrorState, Figure, Loading, ScoreBar, ZoneTag } from "../components/ui";
import { COMPARE_LIMIT, toggleCompare, useCompare } from "../lib/compare";
import { openAssistant } from "../lib/assistant";
import { declination, int, lightYears, num, rightAscension, sig } from "../lib/format";
import { useResource, useVisible } from "../lib/hooks";
import { DISCOVERY_METHOD, EARTH, FLAG_TEXT, SOURCE_STATUS, spectralClass, STAR_COLOR } from "../lib/science";
import { Link } from "../router";

function provenanceOf(c: Candidate, field: "radius" | "mass" | "flux" | "period"): string {
  const flags = c.dataFlags;
  if (field === "radius") return flags.includes("radiusCalculatedByArchive") ? "вычислено архивом NASA" : "опубликовано";
  if (field === "mass") {
    if (flags.includes("massCalculatedByArchive")) return "вычислено архивом NASA";
    return flags.includes("massMayBeMinimum") ? "минимальная масса (M·sin i)" : "опубликовано";
  }
  if (field === "flux") {
    if (flags.includes("fluxEstimatedFromStarLuminosityAndOrbit")) return "вычислено нами";
    return flags.includes("fluxCalculatedByArchive") ? "вычислено архивом NASA" : "опубликовано";
  }
  return c.orbitalPeriodProvenance === "calculated" ? "вычислено архивом NASA" : "опубликовано";
}

function Components({ c }: { c: Candidate }) {
  const derived = c.dataFlags.includes("radiusCalculatedByArchive")
    ? " Радиус не измерен напрямую, а вычислен архивом NASA по массе" + (c.dataFlags.includes("massMayBeMinimum") ? ", которая сама может быть лишь нижней оценкой" : "") + ", поэтому этот компонент условен."
    : "";
  const radiusLine =
    c.radiusEarth !== null
      ? `радиус ${num(c.radiusEarth, 2)} R⊕: 35 × (1 − |ln R| / ln 2,5) = ${num(c.sizePoints, 1)}. Ровно земной радиус дал бы 35, 2,5 R⊕ и больше — 0.${derived}`
      : `радиус не измерен, считаем по массе ${num(c.massEarth, 2)} M⊕: 35 × (1 − |ln M| / ln 10) = ${num(c.sizePoints, 1)}.`;
  const orbitLine =
    c.eccentricity !== null
      ? `эксцентриситет ${num(c.eccentricity, 3)}: 15 × (1 − e / 0,5) = ${num(c.orbitPoints, 1)}. Круговая орбита дала бы 15, e ≥ 0,5 — 0.`
      : "эксцентриситет неизвестен: нейтральные 7,5 балла, чтобы пропуск не поднимал и не опускал планету.";
  const zoneLine =
    c.zone === "conservative"
      ? `поток ${sig(c.fluxEarth)} S⊕ лежит в консервативной зоне этой звезды (${sig(c.conservativeOuterFlux)}–${sig(c.conservativeInnerFlux)} S⊕): 50 баллов.`
      : `поток ${sig(c.fluxEarth)} S⊕ лежит только в расширенной зоне (${sig(c.optimisticOuterFlux)}–${sig(c.optimisticInnerFlux)} S⊕), вне консервативной: 25 баллов.`;
  const rows = [
    { key: "zone" as const, title: "Зона обитаемости", points: c.habitableZonePoints, max: 50, text: zoneLine },
    { key: "size" as const, title: "Размер", points: c.sizePoints, max: 35, text: radiusLine },
    { key: "orbit" as const, title: "Орбита", points: c.orbitPoints, max: 15, text: orbitLine },
  ];
  return (
    <div style={{ display: "grid", gap: "18px" }}>
      <ScoreBar candidate={c} labelled />
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th scope="col">Компонент</th>
              <th class="r" scope="col">
                Баллы
              </th>
              <th scope="col">Откуда</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row" style={{ whiteSpace: "nowrap" }}>
                  <span class="legend__band" style={{ display: "inline-block", background: COMPONENT_COLORS[row.key], marginRight: "8px", verticalAlign: "middle" }} aria-hidden="true" />
                  {row.title}
                </th>
                <td class="r" style={{ whiteSpace: "nowrap" }}>
                  {num(row.points, 1)} из {row.max}
                </td>
                <td>{row.text[0].toUpperCase() + row.text.slice(1)}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">Итого</th>
              <td class="r">
                <strong>{num(c.score, 1, 1)}</strong> из 100
              </td>
              <td class="muted">Сумма компонентов. TSM, ESM и данные HWC в балл не входят.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Parameters({ c }: { c: Candidate }) {
  const rows: [string, string, string, string][] = [
    ["Радиус", c.radiusEarth !== null ? `${num(c.radiusEarth, 3)} R⊕` : "нет данных", c.radiusEarth !== null ? provenanceOf(c, "radius") : "", "1 R⊕"],
    ["Масса", c.massEarth !== null ? `${sig(c.massEarth)} M⊕` : "нет данных", c.massEarth !== null ? provenanceOf(c, "mass") : "", "1 M⊕"],
    ["Поток излучения", `${sig(c.fluxEarth)} S⊕`, provenanceOf(c, "flux"), "1 S⊕"],
    ["Равновесная температура", c.equilibriumTemperatureK !== null ? `${int(c.equilibriumTemperatureK)} K` : "нет данных", c.equilibriumTemperatureK !== null ? "оценка NASA, без атмосферы" : "", "≈ 255 K"],
    ["Период обращения", c.orbitalPeriodDays !== null ? `${sig(c.orbitalPeriodDays, 4)} сут` : "нет данных", c.orbitalPeriodDays !== null ? provenanceOf(c, "period") : "", "365,26 сут"],
    ["Большая полуось", c.semiMajorAxisAu !== null ? `${sig(c.semiMajorAxisAu)} а. е.` : "нет данных", "", "1 а. е."],
    ["Эксцентриситет", c.eccentricity !== null ? num(c.eccentricity, 3) : "нет данных", "", num(EARTH.eccentricity, 4)],
    ["Плотность", c.densityGramsCm3 !== null ? `${num(c.densityGramsCm3, 2)} г/см³` : "нет данных", "", "5,51 г/см³"],
    ["Температура звезды", `${int(c.stellarTemperatureK)} K`, "", "5772 K (Солнце)"],
    ["Спектральный класс", c.spectralType ?? "нет данных", "", "G2 V"],
    ["Радиус звезды", c.stellarRadiusSolar !== null ? `${sig(c.stellarRadiusSolar)} R☉` : "нет данных", "", "1 R☉"],
    ["Возраст звезды", c.starAgeGyr !== null ? `${num(c.starAgeGyr, 1)} млрд лет` : "нет данных", "", "4,6 млрд лет"],
    ["Расстояние", c.distanceParsec !== null ? `${num(c.distanceParsec, 2)} пк, ${lightYears(c.distanceParsec)}` : "нет данных", "", ""],
    ["Координаты системы", `${rightAscension(c.rightAscensionDegrees)}, ${declination(c.declinationDegrees)}`, "экваториальные, J2000", ""],
    ["Открытие", c.discoveryYear ? `${c.discoveryYear}, метод ${DISCOVERY_METHOD[c.discoveryMethod ?? ""] ?? c.discoveryMethod ?? "—"}` : "нет данных", "", ""],
    ["Планет в системе", c.systemPlanetCount ? String(c.systemPlanetCount) : "нет данных", "", "8"],
  ];
  return (
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th scope="col">Величина</th>
            <th class="r" scope="col">
              Значение
            </th>
            <th scope="col">Происхождение</th>
            <th class="r" scope="col">
              Земля и Солнце
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, value, origin, earth]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td class="r" style={value === "нет данных" ? { color: "var(--ink-3)" } : undefined}>
                {value}
              </td>
              <td class="muted">{origin}</td>
              <td class="r muted">{earth}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Spectroscopy({ c }: { c: Candidate }) {
  const small = (c.radiusEarth ?? 0) < 1.5;
  return (
    <div class="prose" style={{ maxWidth: "62ch" }}>
      <dl class="facts" style={{ marginBottom: "12px" }}>
        <dt>TSM, пропускание</dt>
        <dd>{c.transmissionSpectroscopyMetric !== null ? num(c.transmissionSpectroscopyMetric, 1) : "не рассчитан"}</dd>
        <dt>ESM, излучение</dt>
        <dd>{c.emissionSpectroscopyMetric !== null ? num(c.emissionSpectroscopyMetric, 1) : "не рассчитан"}</dd>
      </dl>
      <p>
        Это показатели того, насколько удобно изучать атмосферу планеты спектрографом (Kempton и др., 2018). Они зависят от яркости звезды и размеров планеты и не говорят об обитаемости. Для планет меньше 1,5 R⊕ авторы
        предлагают считать перспективными TSM выше 10 и ESM выше 7,5{small ? "" : "; для более крупных планет порог TSM выше"}. В балл рейтинга они не входят.
      </p>
    </div>
  );
}

function Hwc({ name }: { name: string }) {
  const hwc = useResource(() => api.hwc(), []);
  if (hwc.error) return <ErrorState error={hwc.error} onRetry={hwc.reload} compact />;
  if (!hwc.data) return <Loading>Загружаем каталог HWC…</Loading>;
  if (!hwc.data.available) return <p class="muted">Каталог PHL HWC сейчас недоступен, и сохранённого снимка нет.</p>;
  const world = hwc.data.worlds.find((w) => w.name.toLowerCase() === name.toLowerCase());
  return (
    <div class="prose">
      {world ? (
        <p>
          В каталоге потенциально обитаемых миров PHL эта планета отнесена к {world.category === 1 ? "консервативной" : "оптимистичной"} выборке{world.esi !== null ? `, индекс подобия Земле ESI = ${num(world.esi, 2)}` : ""}.
        </p>
      ) : (
        <p>В снимке HWC нет записи с таким названием. Это не значит, что HWC её исключил: каталог обновлялся {hwc.data.catalogUpdatedAt.split("-").reverse().join(".")}, новые открытия и другие имена в нём могут отсутствовать.</p>
      )}
      <p class="muted">HWC — отдельная методика с другими критериями (вероятный размер и состав). Она показана для сравнения и не влияет на наш балл. ESI показывает сходство с Землёй по набору параметров.</p>
    </div>
  );
}

function Observations({ name }: { name: string }) {
  const [ref, visible] = useVisible<HTMLDivElement>("0px");
  const sources = useResource<CandidateSources>(visible ? () => api.sources(name) : null, [visible, name]);
  return (
    <div ref={ref}>
      {!visible || sources.loading ? (
        <Loading>Запрашиваем Gaia, MAST и NASA spectra…</Loading>
      ) : sources.error ? (
        <ErrorState error={sources.error} onRetry={sources.reload} compact />
      ) : sources.data ? (
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th scope="col">Источник</th>
                <th scope="col">Статус</th>
                <th scope="col">Что известно</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Gaia DR3</th>
                <td>{SOURCE_STATUS[sources.data.gaia.status]}</td>
                <td>
                  {sources.data.gaia.value
                    ? `параллакс ${num(sources.data.gaia.value.parallaxMas, 3)} ± ${num(sources.data.gaia.value.parallaxErrorMas, 3)} мсек дуги; температура ${int(sources.data.gaia.value.temperatureK)} K; радиус звезды ${num(sources.data.gaia.value.radiusSolar, 3)} R☉. Независимая оценка, в балл не входит.`
                    : "—"}
                </td>
              </tr>
              <tr>
                <th scope="row">TESS (MAST)</th>
                <td>{SOURCE_STATUS[sources.data.tess.status]}</td>
                <td>
                  {sources.data.tess.value
                    ? `${sources.data.tess.value.observationCount} временных рядов; секторы ${sources.data.tess.value.sectors.join(", ") || "—"}. Наличие ряда не означает, что транзит этой планеты в нём виден.`
                    : "—"}
                </td>
              </tr>
              <tr>
                <th scope="row">Спектры атмосферы</th>
                <td>{SOURCE_STATUS[sources.data.spectra.status]}</td>
                <td>
                  {sources.data.spectra.value?.length
                    ? sources.data.spectra.value.map((s, i) => (
                        <span key={i}>
                          {i > 0 && "; "}
                          {s.type}
                          {s.instrument ? `, ${s.instrument}` : ""}
                          {s.bibcode && (
                            <>
                              {" "}
                              (<a href={`https://ui.adsabs.harvard.edu/abs/${encodeURIComponent(s.bibcode)}`} rel="noopener">
                                публикация
                              </a>
                              )
                            </>
                          )}
                        </span>
                      ))
                    : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function Body({ c }: { c: Candidate }) {
  const selected = useCompare();
  const planets = useResource(() => api.planets(), []);
  const methodology = useResource(() => api.methodology(), []);
  const [highlight] = useState(() => new Set([c.name]));
  const inCompare = selected.includes(c.name);
  const s = c.stability;
  const gaps = c.dataFlags.filter((flag) => FLAG_TEXT[flag]);
  const cls = spectralClass(c.spectralType, c.stellarTemperatureK);

  return (
    <>
      <header class="page-head">
        <p class="muted">
          <Link href="/">Рейтинг кандидатов</Link>
        </p>
        <h1>{c.name}</h1>
        <div class="page-head__meta">
          <span>
            Звезда {c.hostName ?? "—"}
            {c.spectralType ? `, класс ${c.spectralType}` : ""}{" "}
            <span aria-hidden="true" style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", background: STAR_COLOR[cls], boxShadow: "inset 0 0 0 1px var(--rule-strong)", verticalAlign: "-1px" }} />
          </span>
          <span>{lightYears(c.distanceParsec)} от Солнца</span>
          <ZoneTag zone={c.zone} />
          <span>Место {c.rank ?? "—"} в рейтинге</span>
        </div>
        <p class="lead">
          Балл <strong>{num(c.score, 1, 1)}</strong> из 100 — порядок в списке по выбранным параметрам. Поток излучения попадает {c.zone === "conservative" ? "в консервативную зону обитаемости" : "только в расширенную зону обитаемости"}, {c.radiusEarth !== null ? `радиус — ${num(c.radiusEarth, 2)} земного` : `радиус не измерен, масса — ${num(c.massEarth, 2)} земной`}.
        </p>
        <div class="toolbar" style={{ marginBottom: 0 }}>
          <button class="btn" type="button" aria-pressed={inCompare} disabled={!inCompare && selected.length >= COMPARE_LIMIT} onClick={() => toggleCompare(c.name)}>
            {inCompare ? "Убрать из сравнения" : "Добавить к сравнению"}
          </button>
          <button class="btn btn--quiet" type="button" onClick={() => openAssistant({ planet: c.name })}>
            Спросить помощника об этой планете
          </button>
        </div>
      </header>

      <section class="section grid-2" aria-labelledby="score-title">
        <div>
          <h2 id="score-title" style={{ marginBottom: "16px" }}>
            Из чего сложился балл
          </h2>
          <Components c={c} />
        </div>
        <div style={{ display: "grid", gap: "28px", alignContent: "start" }}>
          <Figure
            title="Где планета в зоне обитаемости своей звезды"
            legend={
              <ul class="legend">
                <li>
                  <span class="legend__band" style={{ background: "var(--zone-cons-fill)" }} aria-hidden="true" />
                  консервативная зона
                </li>
                <li>
                  <span class="legend__band" style={{ background: "var(--zone-opt-fill)", boxShadow: "inset 0 0 0 1px var(--zone-cons)" }} aria-hidden="true" />
                  расширенная
                </li>
              </ul>
            }
            caption={`Границы Kopparapu и др. (2014) для звезды ${int(c.stellarTemperatureK)} K и планеты массой с Землю: консервативная зона ${sig(c.conservativeOuterFlux)}–${sig(c.conservativeInnerFlux)} S⊕, расширенная ${sig(c.optimisticOuterFlux)}–${sig(c.optimisticInnerFlux)} S⊕. Изменение потока вдоль эксцентричной орбиты не учитывается.`}
          >
            <ZoneStrip candidate={c} />
          </Figure>
          <Figure
            title="Орбита в масштабе"
            caption="Вид сверху: орбита по большой полуоси и эксцентриситету NASA, зелёные кольца — зоны обитаемости на тех же расстояниях. Звезда и планета показаны точками, не в масштабе. Наклон орбиты к лучу зрения не показан."
          >
            <OrbitSketch candidate={c} />
          </Figure>
        </div>
      </section>

      <section class="section grid-main-side" aria-labelledby="params-title">
        <div>
          <h2 id="params-title" style={{ marginBottom: "16px" }}>
            Исходные данные NASA
          </h2>
          <Parameters c={c} />
          <p class="notice" style={{ marginTop: "12px" }}>
            Значения взяты из сводной таблицы pscomppars: в одной строке NASA может объединять результаты разных публикаций, поэтому они не всегда согласованы между собой.
          </p>
        </div>
        <aside>
          <h2 style={{ marginBottom: "16px" }}>Пропуски и оговорки</h2>
          {gaps.length === 0 ? (
            <p class="muted">Для этой планеты все поля балла измерены и опубликованы; оговорок нет.</p>
          ) : (
            <ul style={{ display: "grid", gap: "12px", padding: 0, margin: 0, listStyle: "none" }}>
              {gaps.map((flag) => (
                <li key={flag}>
                  <strong class="tag tag--warn" style={{ whiteSpace: "normal" }}>
                    <span aria-hidden="true">△</span> {FLAG_TEXT[flag].title}
                  </strong>
                  <p class="muted" style={{ marginTop: "2px" }}>
                    {FLAG_TEXT[flag].text}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </section>

      <section class="section grid-2" aria-labelledby="stability-title">
        <div>
          <h2 id="stability-title" style={{ marginBottom: "16px" }}>
            Насколько устойчиво место
          </h2>
          {s ? (
            <div class="prose">
              <p>
                В {s.samples} пересчётах с опубликованными погрешностями NASA планета занимала места с {s.rankP10}-го по {s.rankP90}-е (10–90-й процентили), балл — от {num(s.scoreP10, 1)} до {num(s.scoreP90, 1)}. В первую
                полусотню она попадала в {num(s.top50Percent, 0)} % пересчётов, отбор проходила в {num(s.eligiblePercent, 0)} %.
              </p>
              <p class="muted">
                Погрешности известны для {s.inputsWithErrors} из {s.scoredInputs} входных величин; остальные пересчёты не сдвигают. Систематические ошибки, связи между величинами и разные публикации не моделируются, поэтому это
                чувствительность к опубликованным погрешностям, а не полная научная неопределённость.
              </p>
            </div>
          ) : (
            <p class="muted">Оценка устойчивости недоступна.</p>
          )}
        </div>
        <div>
          <h2 style={{ marginBottom: "16px" }}>Удобство спектроскопии</h2>
          <Spectroscopy c={c} />
        </div>
      </section>

      <section class="section" aria-labelledby="context-title">
        <h2 id="context-title" style={{ marginBottom: "16px" }}>
          Планета среди всего каталога
        </h2>
        {planets.data ? (
          <Figure title="Поток и температура звезды" legend={<PointLegend highlightLabel={c.name} />} caption="Та же диаграмма, что на главной: выделена эта планета. Наведите на соседние точки, чтобы сравнить.">
            <ZoneDiagram points={planets.data.items} boundaries={methodology.data?.boundaries} highlight={highlight} labels={1} height={380} />
          </Figure>
        ) : planets.error ? (
          <ErrorState error={planets.error} onRetry={planets.reload} compact />
        ) : (
          <Loading />
        )}
      </section>

      <section class="section grid-2">
        <div>
          <h2 style={{ marginBottom: "16px" }}>Сравнение с каталогом HWC</h2>
          <Hwc name={c.name} />
        </div>
        <div>
          <h2 style={{ marginBottom: "16px" }}>Наблюдения в других архивах</h2>
          <Observations name={c.name} />
        </div>
      </section>
    </>
  );
}

export function Planet({ name }: { name: string }) {
  const candidate = useResource(() => api.candidate(name), [name]);
  return (
    <div class="wrap">
      {candidate.error ? (
        <>
          <h1>{name}</h1>
          <div style={{ marginTop: "20px" }}>
            {(candidate.error as { status?: number }).status === 404 ? (
              <div class="state">
                <h3>Этой планеты нет среди кандидатов</h3>
                <p class="muted">Карточки есть только у планет, прошедших отбор. Найдите её на диаграмме на главной: подсказка покажет, на каком этапе она отсеяна.</p>
                <p>
                  <Link href="/">Вернуться к рейтингу</Link>
                </p>
              </div>
            ) : (
              <ErrorState error={candidate.error} onRetry={candidate.reload} />
            )}
          </div>
        </>
      ) : !candidate.data ? (
        <Loading>Загружаем карточку {name}…</Loading>
      ) : (
        <>
          <Body c={candidate.data} />
        </>
      )}
    </div>
  );
}
