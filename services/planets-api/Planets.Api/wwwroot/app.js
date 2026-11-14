const state = { planets: [], selected: null, zone: "all", query: "", showAll: false, hwc: null, activeTab: "ranking" };
const byId = id => document.getElementById(id);
const number = (value, digits = 2) => value == null
  ? "—"
  : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(value);
const labels = {
  radiusCalculatedByArchive: "Радиус рассчитан архивом NASA",
  massCalculatedByArchive: "Масса рассчитана архивом NASA",
  fluxCalculatedByArchive: "Поток излучения рассчитан архивом NASA",
  fluxEstimatedFromStarLuminosityAndOrbit: "Поток оценён по светимости звезды и орбите",
  eccentricityUnknownOrLimited: "Эксцентриситет неизвестен или задан пределом",
  radiusMissingOrLimited: "Радиус неизвестен или задан пределом",
  massMissingOrLimited: "Масса неизвестна или задана пределом",
  massMayBeMinimum: "Масса может быть лишь нижней оценкой"
};

let loading = false;
let retryTimer;
let sourcesName;
let sourcesRequest;
let hwcRequested = false;
const normalizeName = name => name.toLocaleLowerCase("en-US").replace(/[^a-z0-9]/g, "");

function initializeFeaturePanels() {
  const moves = [
    ["feature-sky-body", ".sky-panel"],
    ["feature-passport-body", ".passport-section"],
    ["feature-stories-body", ".story-section"],
    ["feature-hwc-body", ".hwc-section"],
    ["feature-scene-body", ".scene-section"],
    ["feature-orbit-body", ".flux-section"],
    ["feature-parameters-body", "#metric-radius"],
    ["feature-parameters-body", ".detail-bottom"],
    ["feature-observations-body", ".source-section"]
  ];
  for (const [target, selector] of moves) {
    const element = document.querySelector(selector);
    byId(target).append(element.id === "metric-radius" ? element.closest(".detail-section") : element);
  }
  byId("feature-sky-body").querySelector(".sky-panel").hidden = false;

  const tabs = [...document.querySelectorAll("[data-tab]")];
  const names = new Set(tabs.map(tab => tab.dataset.tab));
  function activate(name) {
    state.activeTab = names.has(name) ? name : "ranking";
    for (const tab of tabs) {
      const selected = tab.dataset.tab === state.activeTab;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      byId(`panel-${tab.dataset.tab}`).hidden = !selected;
    }
    if (state.activeTab === "hwc" && !hwcRequested) {
      hwcRequested = true;
      loadHwc();
    }
    if (state.activeTab === "observations" && state.selected && sourcesName !== state.selected)
      loadSources(state.selected);
    if (state.activeTab === "scene") {
      const planet = state.planets.find(item => item.name === state.selected);
      if (planet) window.ExoScene?.setPlanet(planet);
    }
    if (state.activeTab === "world") {
      const planet = state.planets.find(item => item.name === state.selected);
      if (planet) window.ExoWorldLab?.setPlanet(planet);
    }
    if (state.activeTab === "sky" && state.selected) window.ExoSkyMap?.select(state.selected);
  }
  for (const [index, tab] of tabs.entries()) {
    tab.addEventListener("click", () => { location.hash = tab.dataset.tab; activate(tab.dataset.tab); });
    tab.addEventListener("keydown", event => {
      if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].focus();
      tabs[next].click();
    });
  }
  window.addEventListener("hashchange", () => activate(location.hash.slice(1)));
  activate(location.hash.slice(1));
}

function renderWorldOptions() {
  const select = byId("planet-select");
  select.replaceChildren();
  for (const [index, planet] of state.planets.entries()) {
    const option = document.createElement("option");
    option.value = planet.name;
    option.textContent = `${index + 1}. ${planet.name}`;
    select.append(option);
  }
  select.disabled = !state.planets.length;
  if (state.selected) select.value = state.selected;

  const choices = byId("story-choices");
  choices.replaceChildren();
  for (const planet of state.planets.filter(item => window.ExoStories?.[item.name])) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = planet.name;
    button.addEventListener("click", () => selectPlanet(planet.name));
    choices.append(button);
  }
}

function selectPlanet(name, preserveFilters = false) {
  if (!state.planets.some(planet => planet.name === name)) return;
  state.selected = name;
  if (!preserveFilters) {
    state.zone = "all";
    state.query = "";
    byId("search").value = "";
    state.showAll = state.planets.findIndex(planet => planet.name === name) >= 50;
  }
  render();
}

async function loadHwc() {
  try {
    const response = await fetch("/api/hwc", { cache: "no-store" });
    if (!response.ok) throw new Error("HWC unavailable");
    const result = await response.json();
    state.hwc = result.available
      ? new Map(result.worlds.map(world => [normalizeName(world.name), world]))
      : false;
  } catch { state.hwc = false; }
  renderHwc();
}

function setStatus(text, ready) {
  const element = byId("source-status");
  element.textContent = text;
  element.classList.toggle("is-ready", ready);
}

function scheduleRetry() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(load, 5000);
}

async function load() {
  if (loading) return;
  loading = true;
  try {
    const statusResponse = await fetch("/api/status", { cache: "no-store" });
    if (!statusResponse.ok) throw new Error("status unavailable");
    const status = await statusResponse.json();
    if (!status.ready) {
      setStatus("NASA загружается — подождите немного", false);
      scheduleRetry();
      return;
    }

    const response = await fetch("/api/candidates?limit=100", { cache: "no-store" });
    if (!response.ok) throw new Error("catalog unavailable");
    const catalog = await response.json();
    state.planets = catalog.items;
    window.ExoSkyMap?.setPlanets(state.planets);
    if (!state.planets.some(planet => planet.name === state.selected))
      state.selected = state.planets[0]?.name ?? null;
    renderWorldOptions();

    byId("candidate-count").textContent = number(status.candidateCount, 0);
    byId("planet-count").textContent = number(status.totalPlanets, 0);
    const date = new Date(catalog.fetchedAt);
    const updated = Number.isNaN(date.getTime())
      ? "снимок NASA загружен"
      : `NASA · обновлено ${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date)}`;
    setStatus(updated, true);
    clearTimeout(retryTimer);
    render();
  } catch {
    setStatus(state.planets.length ? "Связь прервана · показан последний список" : "Не удалось загрузить каталог · повторяем запрос", false);
    if (!state.planets.length) byId("list-message").textContent = "Проверяем соединение с сервером. Список появится автоматически.";
    scheduleRetry();
  } finally {
    loading = false;
  }
}

function filteredPlanets() {
  const query = state.query.trim().toLocaleLowerCase("ru-RU");
  return state.planets.filter(planet =>
    (state.zone === "all" || planet.zone === state.zone) &&
    (!query || `${planet.name} ${planet.hostName ?? ""}`.toLocaleLowerCase("ru-RU").includes(query))
  );
}

function render() {
  document.querySelectorAll("[data-zone]").forEach(button =>
    button.setAttribute("aria-pressed", String(button.dataset.zone === state.zone)));
  renderList();
  renderDetail();
}

function renderList() {
  const matches = filteredPlanets();
  const shown = state.showAll || state.query.trim() ? matches : matches.slice(0, 50);

  const list = byId("planet-list");
  list.replaceChildren();
  shown.forEach((planet, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = `planet-row${planet.zone === "optimistic" ? " is-optimistic" : ""}`;
    button.setAttribute("aria-pressed", String(planet.name === state.selected));

    const rank = document.createElement("span");
    rank.className = "planet-rank";
    rank.textContent = String(state.planets.indexOf(planet) + 1).padStart(2, "0");
    const names = document.createElement("span");
    const name = document.createElement("span");
    name.className = "planet-name";
    name.textContent = planet.name;
    const host = document.createElement("span");
    host.className = "planet-host";
    host.textContent = `${planet.hostName ?? "Звезда неизвестна"} · ${planet.zone === "conservative" ? "консервативная" : "расширенная"} зона`;
    names.append(name, host);
    if (window.ExoStories?.[planet.name]) {
      const storyLabel = document.createElement("span");
      storyLabel.className = "planet-story-label";
      storyLabel.textContent = "Есть история";
      names.append(storyLabel);
    }
    const score = document.createElement("span");
    score.className = "planet-score";
    score.textContent = number(planet.score, 1);
    const meter = document.createElement("span");
    meter.className = "mini-track";
    const fill = document.createElement("span");
    fill.style.width = `${planet.score}%`;
    meter.append(fill);
    score.append(meter);
    button.append(rank, names, score);
    button.addEventListener("click", () => {
      selectPlanet(planet.name, true);
      if (window.matchMedia("(max-width: 800px)").matches)
        byId("detail").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    item.append(button);
    list.append(item);
  });

  byId("results-meta").textContent = state.planets.length
    ? `Показаны ${shown.length} из ${matches.length} в выбранной группе`
    : "Загружаем список…";
  const message = byId("list-message");
  message.hidden = shown.length > 0;
  if (!shown.length && state.planets.length)
    message.textContent = "Совпадений нет. Попробуйте другое название или выберите все зоны.";
  const showAll = byId("show-all");
  showAll.hidden = Boolean(state.query.trim()) || matches.length <= 50;
  showAll.textContent = state.showAll ? "Показать топ-50" : `Показать все ${matches.length}`;
}

function setScorePart(name, points, max) {
  byId(`score-${name}-text`).textContent = `${number(points, 1)} / ${max}`;
  byId(`score-${name}-bar`).style.width = `${Math.max(0, Math.min(100, points / max * 100))}%`;
}

function renderStory(planet) {
  const story = window.ExoStories?.[planet.name];
  byId("planet-story").hidden = !story;
  byId("feature-stories-body").hidden = !story;
  byId("story-empty").hidden = Boolean(story);
  for (const button of byId("story-choices").children)
    button.setAttribute("aria-pressed", String(button.textContent === planet.name));
  if (!story) return;
  byId("story-heading").textContent = story.title;
  byId("story-body").textContent = story.body;
  byId("story-unknown").textContent = story.unknown;
  const sources = byId("story-sources");
  sources.replaceChildren();
  for (const source of story.sources) {
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `${source.label} ↗`;
    sources.append(link);
  }
}

function renderDetail() {
  const planet = state.planets.find(item => item.name === state.selected);
  byId("detail-empty").hidden = Boolean(planet);
  byId("detail-content").hidden = !planet;
  if (!planet) {
    sourcesRequest?.abort();
    sourcesName = null;
    return;
  }

  byId("detail-host").textContent = planet.hostName ?? "Звезда неизвестна";
  byId("detail-title").textContent = planet.name;
  byId("detail-score").textContent = number(planet.score, 1);
  const rank = state.planets.indexOf(planet) + 1;
  byId("planet-select").value = planet.name;
  byId("selected-context").textContent = `${planet.hostName ?? "Звезда неизвестна"} · ${rank}-е место в нашем отборе · ${planet.zone === "conservative" ? "консервативная" : "расширенная"} зона`;
  window.ExoSkyMap?.select(planet.name);
  byId("sky-selected").textContent = planet.hostName ?? planet.name;
  byId("sky-coordinates").textContent = Number.isFinite(planet.rightAscensionDegrees) && Number.isFinite(planet.declinationDegrees)
    ? `Прямое восхождение ${number(planet.rightAscensionDegrees, 2)}° · склонение ${number(planet.declinationDegrees, 2)}°`
    : "Координаты пока не получены от NASA";
  byId("sky-distance").textContent = planet.distanceParsec == null ? "Расстояние от Земли: неизвестно"
    : `Расстояние от Земли: ≈ ${number(planet.distanceParsec * 3.26156, 1)} световых лет`;
  const zone = byId("detail-zone");
  zone.textContent = planet.zone === "conservative" ? "Консервативная зона" : "Расширенная зона";
  zone.classList.toggle("is-optimistic", planet.zone === "optimistic");
  setScorePart("zone", planet.habitableZonePoints, 50);
  setScorePart("size", planet.sizePoints, 35);
  setScorePart("orbit", planet.orbitPoints, 15);
  byId("reason-zone").textContent = planet.zone === "conservative"
    ? `Получает ${number(planet.fluxEarth, 2)} земного потока: внутри консервативной зоны своей звезды. Это условие для возможной жидкой воды при подходящей атмосфере.`
    : `Получает ${number(planet.fluxEarth, 2)} земного потока: проходит только расширенный отбор, где допущения о климате менее строгие.`;
  byId("reason-size").textContent = planet.radiusEarth != null
    ? `Радиус ${number(planet.radiusEarth, 2)} R⊕. Чем ближе к земному размеру, тем больше балл; состав по одному радиусу неизвестен.`
    : `Радиус не указан: вместо него использована масса ${number(planet.massEarth, 2)} M⊕. Это менее прямое сравнение размера.`;
  byId("reason-orbit").textContent = planet.eccentricity == null
    ? "Форма орбиты неизвестна: за этот пункт начислена нейтральная половина баллов."
    : `Эксцентриситет ${number(planet.eccentricity, 3)}: чем он меньше, тем ровнее расстояние до звезды в течение года.`;
  byId("passport-year").textContent = planet.orbitalPeriodDays == null ? "Неизвестно" : `${number(planet.orbitalPeriodDays, 1)} суток`;
  byId("passport-light").textContent = `${number(planet.fluxEarth, 2)} × земного`;
  byId("passport-distance").textContent = planet.distanceParsec == null ? "Неизвестно" : `≈ ${number(planet.distanceParsec * 3.26156, 1)} св. лет`;
  const yearSource = byId("passport-year-source");
  yearSource.textContent = planet.orbitalPeriodDays == null ? "Данных нет" : planet.orbitalPeriodProvenance === "calculated" ? "Вычислено архивом" : "Измерено · NASA";
  yearSource.className = planet.orbitalPeriodDays == null ? "evidence"
    : `evidence ${planet.orbitalPeriodProvenance === "calculated" ? "is-derived" : "is-measured"}`;
  byId("passport-light-source").textContent = "Вычислено из данных о звезде и орбите";
  renderStory(planet);
  renderHwc();
  const stability = planet.stability;
  byId("stability-score").textContent = stability ? `${number(stability.scoreP10, 1)}–${number(stability.scoreP90, 1)}` : "—";
  byId("stability-rank").textContent = stability ? `${stability.rankP10}–${stability.rankP90}` : "—";
  byId("stability-top").textContent = stability ? `${number(stability.top50Percent, 1)}%` : "—";
  byId("stability-story").textContent = stability
    ? `Сейчас ${rank}-е место. Если повторить отбор с опубликованными погрешностями, место среди прошедших отбор обычно оказывается между ${stability.rankP10}-м и ${stability.rankP90}-м; в топ-50 планета попадает в ${number(stability.top50Percent, 0)}% пересчётов.`
    : "Пока нет расчёта устойчивости места.";
  byId("stability-note").textContent = stability
    ? `${stability.samples} пересчётов с погрешностями NASA; они указаны для ${stability.inputsWithErrors} из ${stability.scoredInputs} известных входных полей. Кандидат прошёл отбор в ${number(stability.eligiblePercent, 1)}% пересчётов. Диапазоны показывают 10–90% результатов и не учитывают неизвестные ошибки и зависимость измерений.`
    : "Расчёт погрешностей ещё не готов.";
  window.ExoScene?.setPlanet(planet);
  if (state.activeTab === "world") window.ExoWorldLab?.setPlanet(planet);
  byId("known-model-link").hidden = planet.name !== "Proxima Cen b";

  byId("flux-value").textContent = `${number(planet.fluxEarth, 3)} S⊕`;
  byId("flux-outer").textContent = `${number(planet.optimisticOuterFlux, 2)} S⊕`;
  byId("flux-inner").textContent = `${number(planet.optimisticInnerFlux, 2)} S⊕`;
  const scale = flux => Math.max(0, Math.min(100,
    Math.log(flux / planet.optimisticOuterFlux) /
    Math.log(planet.optimisticInnerFlux / planet.optimisticOuterFlux) * 100));
  const bandStart = scale(planet.conservativeOuterFlux);
  const bandEnd = scale(planet.conservativeInnerFlux);
  byId("conservative-band").style.left = `${bandStart}%`;
  byId("conservative-band").style.width = `${bandEnd - bandStart}%`;
  byId("flux-marker").style.left = `${scale(planet.fluxEarth)}%`;
  const orbitSlider = byId("orbit-distance");
  orbitSlider.value = "100";
  renderOrbitLab(planet);

  byId("metric-radius").textContent = planet.radiusEarth == null ? "—" : `${number(planet.radiusEarth)} R⊕`;
  byId("metric-mass").textContent = planet.massEarth == null ? "—" : `${number(planet.massEarth)} M⊕`;
  byId("metric-eccentricity").textContent = number(planet.eccentricity, 3);
  byId("metric-temperature").textContent = `${number(planet.stellarTemperatureK, 0)} K`;
  byId("metric-distance").textContent = planet.distanceParsec == null ? "—" : `${number(planet.distanceParsec, 1)} пк`;
  byId("metric-spectral").textContent = planet.spectralType || "—";
  byId("metric-period").textContent = planet.orbitalPeriodDays == null ? "—" : `${number(planet.orbitalPeriodDays, 2)} сут`;
  byId("metric-axis").textContent = planet.semiMajorAxisAu == null ? "—" : `${number(planet.semiMajorAxisAu, 3)} а.е.`;
  byId("metric-inclination").textContent = planet.inclinationDegrees == null ? "—" : `${number(planet.inclinationDegrees, 1)}°`;
  byId("metric-density").textContent = planet.densityGramsCm3 == null ? "—" : `${number(planet.densityGramsCm3, 2)} г/см³`;
  byId("metric-equilibrium").textContent = planet.equilibriumTemperatureK == null ? "—" : `${number(planet.equilibriumTemperatureK, 0)} K`;
  byId("metric-star-radius").textContent = planet.stellarRadiusSolar == null ? "—" : `${number(planet.stellarRadiusSolar, 2)} R☉`;

  const flags = byId("data-flags");
  flags.replaceChildren();
  const descriptions = planet.dataFlags.length
    ? planet.dataFlags.map(flag => labels[flag] ?? flag)
    : ["Особых пометок к этим полям нет"];
  descriptions.forEach(description => {
    const item = document.createElement("li");
    item.textContent = description;
    flags.append(item);
  });
  byId("nasa-link").href = `https://exoplanetarchive.ipac.caltech.edu/overview/${encodeURIComponent(planet.name)}`;
  if (state.activeTab === "observations" && sourcesName !== planet.name) loadSources(planet.name);
}

function renderHwc() {
  const planet = state.planets.find(item => item.name === state.selected);
  if (!planet) return;
  const result = byId("hwc-result");
  if (state.hwc === null) { result.textContent = "Сверяем с HWC…"; return; }
  if (state.hwc === false) { result.textContent = "HWC сейчас недоступен. Основной рейтинг NASA продолжает работать."; return; }
  const match = state.hwc.get(normalizeName(planet.name));
  result.textContent = match
    ? `Есть в HWC: ${match.category === 1 ? "консервативная" : "оптимистичная"} группа по размеру/массе. Наша ${planet.zone === "conservative" ? "консервативная" : "расширенная"} зона описывает получаемый свет — это другой критерий. ${match.esi == null ? "" : `ESI ${number(match.esi, 2)} — сходство с Землёй, не вероятность жизни.`}`
    : "В списке потенциально обитаемых HWC не найдено. Возможно, планета открыта позже или записана под другим именем.";
}

function renderOrbitLab(planet) {
  const factor = Number(byId("orbit-distance").value) / 100;
  const imaginedFlux = planet.fluxEarth / (factor * factor);
  byId("orbit-factor").textContent = `${number(factor, 2)}×`;
  const condition = imaginedFlux < planet.optimisticOuterFlux ? "за внешней границей — холоднее"
    : imaginedFlux > planet.optimisticInnerFlux ? "за внутренней границей — жарче"
    : imaginedFlux >= planet.conservativeOuterFlux && imaginedFlux <= planet.conservativeInnerFlux
      ? "в консервативной зоне" : "в расширенной зоне";
  byId("orbit-result").textContent = factor === 1
    ? `Реальная орбита: ${number(imaginedFlux, 2)} S⊕, ${condition}.`
    : `Если расстояние было бы ${number(factor, 2)}× от текущего: ${number(imaginedFlux, 2)} S⊕, ${condition}.`;
  const scale = flux => Math.max(0, Math.min(100,
    Math.log(flux / planet.optimisticOuterFlux) /
    Math.log(planet.optimisticInnerFlux / planet.optimisticOuterFlux) * 100));
  byId("flux-marker").style.left = `${scale(imaginedFlux)}%`;
}

async function loadSources(name) {
  sourcesRequest?.abort();
  sourcesRequest = new AbortController();
  sourcesName = name;
  for (const id of ["gaia-result", "tess-result", "spectra-result"])
    byId(id).textContent = "Загружаем…";
  byId("spectra-list").replaceChildren();
  try {
    const response = await fetch(`/api/candidates/${encodeURIComponent(name)}/sources`, { signal: sourcesRequest.signal });
    if (!response.ok) throw new Error("sources unavailable");
    const sources = await response.json();
    if (state.selected !== name) return;
    const fallback = source => ({ missing_id: "Нет идентификатора в каталоге NASA", not_found: "Данные не найдены", unavailable: "Источник сейчас недоступен" })[source.status] ?? "Данные не найдены";
    const gaia = sources.gaia;
    byId("gaia-result").textContent = gaia.status === "available"
      ? `Температура звезды ${number(gaia.value.temperatureK, 0)} K · светимость ${number(gaia.value.luminositySolar, 3)} L☉ · радиус ${number(gaia.value.radiusSolar, 2)} R☉. Параллакс ${number(gaia.value.parallaxMas, 2)} мсд.`
      : fallback(gaia);
    const tess = sources.tess;
    byId("tess-result").textContent = tess.status === "available"
      ? `${number(tess.value.observationCount, 0)} временных рядов TESS. Секторы: ${tess.value.sectors.length ? tess.value.sectors.join(", ") : "не указаны"}.`
      : fallback(tess);
    const spectra = sources.spectra;
    byId("spectra-result").textContent = spectra.status === "available"
      ? `${spectra.value.length} опубликованных наборов спектров:` : fallback(spectra);
    const list = byId("spectra-list");
    list.replaceChildren();
    for (const spectrum of spectra.value ?? []) {
      const item = document.createElement("li");
      item.textContent = [spectrum.type, spectrum.instrument].filter(Boolean).join(" · ");
      if (spectrum.bibcode) {
        const paper = document.createElement("a");
        paper.href = `https://ui.adsabs.harvard.edu/abs/${encodeURIComponent(spectrum.bibcode)}/abstract`;
        paper.target = "_blank";
        paper.rel = "noopener noreferrer";
        paper.textContent = ` · публикация ${spectrum.bibcode} ↗`;
        item.append(paper);
      }
      list.append(item);
    }
  } catch (error) {
    if (error.name !== "AbortError" && state.selected === name) {
      sourcesName = null;
      for (const id of ["gaia-result", "tess-result", "spectra-result"])
        byId(id).textContent = "Не удалось загрузить дополнительные источники";
    }
  }
}

byId("search").addEventListener("input", event => {
  state.query = event.target.value;
  state.showAll = false;
  render();
});
byId("planet-select").addEventListener("change", event => selectPlanet(event.target.value));
document.querySelectorAll("[data-zone]").forEach(button => button.addEventListener("click", () => {
  state.zone = button.dataset.zone;
  state.showAll = false;
  render();
}));
byId("show-all").addEventListener("click", () => {
  state.showAll = !state.showAll;
  renderList();
  renderDetail();
});
byId("orbit-distance").addEventListener("input", () => {
  const planet = state.planets.find(item => item.name === state.selected);
  if (planet) renderOrbitLab(planet);
});
byId("orbit-reset").addEventListener("click", () => {
  byId("orbit-distance").value = "100";
  const planet = state.planets.find(item => item.name === state.selected);
  if (planet) renderOrbitLab(planet);
});
window.addEventListener("exo-world-ready", () => {
  const planet = state.planets.find(item => item.name === state.selected);
  if (state.activeTab === "world" && planet) window.ExoWorldLab?.setPlanet(planet);
});
window.ExoSkyMap?.onSelect(name => {
  selectPlanet(name);
});

initializeFeaturePanels();
load();
setInterval(load, 5 * 60 * 1000);
