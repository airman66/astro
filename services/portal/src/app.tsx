import type { ComponentChildren } from "preact";
import { lazy, Suspense } from "preact/compat";
import { useEffect, useState } from "preact/hooks";
import { api } from "./api/endpoints";
import type { StatusResponse } from "./api/types";
import { Loading } from "./components/ui";
import { clearCompare, useCompare } from "./lib/compare";
import { dateTimeRu, shortDateTime } from "./lib/format";
import { Link, match, useLocation } from "./router";
import { Dashboard } from "./pages/Dashboard";

const Planet = lazy(() => import("./pages/Planet").then((m) => ({ default: m.Planet })));
const Compare = lazy(() => import("./pages/Compare").then((m) => ({ default: m.Compare })));
const Method = lazy(() => import("./pages/Method").then((m) => ({ default: m.Method })));
const Glossary = lazy(() => import("./pages/Glossary").then((m) => ({ default: m.Glossary })));
const Term = lazy(() => import("./pages/Term").then((m) => ({ default: m.Term })));
const Search = lazy(() => import("./pages/Search").then((m) => ({ default: m.Search })));
const Assistant = lazy(() => import("./pages/Assistant").then((m) => ({ default: m.Assistant })));
const Experiments = lazy(() => import("./pages/Experiments").then((m) => ({ default: m.Experiments })));
const ThreeBody = lazy(() => import("./experiments/threebody/ThreeBodyPage").then((m) => ({ default: m.ThreeBodyPage })));

const NAV = [
  { href: "/", label: "Кандидаты", section: (p: string) => p === "/" || p.startsWith("/planets") || p.startsWith("/compare") },
  { href: "/method", label: "Методика", section: (p: string) => p.startsWith("/method") },
  { href: "/glossary", label: "Справочник", section: (p: string) => p.startsWith("/glossary") || p.startsWith("/search") },
  { href: "/assistant", label: "Помощник", section: (p: string) => p.startsWith("/assistant") },
  { href: "/experiments", label: "Эксперименты", section: (p: string) => p.startsWith("/experiments") },
];

function Mark() {
  // Знак: смещение близкой звезды на фоне далёких — суть метода параллакса.
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <circle cx="13" cy="13" r="11.5" fill="none" stroke="currentColor" stroke-width="1.5" />
      <circle cx="9" cy="13" r="2.6" fill="currentColor" />
      <circle cx="17" cy="13" r="2.6" fill="none" stroke="currentColor" stroke-width="1.5" />
    </svg>
  );
}

function DataStatus() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    let timer = 0;
    const poll = () =>
      api.status().then(
        (value) => {
          if (!alive) return;
          setStatus(value);
          setFailed(false);
          timer = window.setTimeout(poll, value.ready ? 5 * 60_000 : 5000);
        },
        () => {
          if (!alive) return;
          setFailed(true);
          timer = window.setTimeout(poll, 15000);
        },
      );
    poll();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, []);
  if (failed) return <span class="tag tag--danger">API каталога недоступен</span>;
  if (!status) return <span class="tag">Проверяем данные NASA…</span>;
  if (!status.ready) return <span class="tag tag--warn">Каталог NASA загружается</span>;
  const stale = status.refreshError ? ", обновление не удалось" : "";
  return (
    <span class={`tag${status.refreshError ? " tag--warn" : " status-ok"}`} title={`Снимок NASA Exoplanet Archive от ${dateTimeRu(status.fetchedAt)}${status.refreshError ? `. Последняя попытка обновления не удалась: ${status.refreshError}` : ""}`}>
      Данные NASA от {shortDateTime(status.fetchedAt)}
      {stale}
    </span>
  );
}

function CompareTray({ path }: { path: string }) {
  const names = useCompare();
  if (!names.length || path.startsWith("/compare")) return null;
  return (
    <div class="compare-tray" role="region" aria-label="Выбранные для сравнения планеты">
      <span class="compare-tray__names">
        Сравнение: {names.join(", ")}
      </span>
      <Link class="btn btn--primary" href={`/compare?${names.map((n) => `p=${encodeURIComponent(n)}`).join("&")}`}>
        Сравнить {names.length}
      </Link>
      <button class="btn btn--quiet" type="button" onClick={clearCompare}>
        Очистить
      </button>
    </div>
  );
}

function route(path: string): ComponentChildren {
  if (path === "/") return <Dashboard />;
  let params = match("/planets/:name", path);
  if (params) return <Planet name={params.name} />;
  if (path === "/compare") return <Compare />;
  if (path === "/method") return <Method />;
  if (path === "/glossary") return <Glossary />;
  params = match("/glossary/:number", path);
  if (params && /^\d+$/.test(params.number)) return <Term number={Number(params.number)} />;
  if (path === "/search") return <Search />;
  if (path === "/assistant") return <Assistant />;
  if (path === "/experiments") return <Experiments />;
  if (path === "/experiments/three-body") return <ThreeBody />;
  return <NotFound />;
}

function NotFound() {
  return (
    <div class="wrap">
      <h1>Такой страницы нет</h1>
      <p class="lead" style={{ marginTop: "16px" }}>
        Проверьте адрес или начните с <Link href="/">рейтинга кандидатов</Link> или <Link href="/glossary">справочника</Link>.
      </p>
    </div>
  );
}

export function App() {
  const location = useLocation();
  return (
    <div class="shell">
      <a class="skip-link" href="#main">
        Перейти к содержанию
      </a>
      <header class="site-header">
        <div class="wrap site-header__row">
          <Link class="wordmark" href="/">
            <Mark />
            Параллакс
          </Link>
          <nav class="nav" aria-label="Разделы портала">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} aria-current={item.section(location.path) ? "page" : undefined}>
                {item.label}
              </Link>
            ))}
          </nav>
          <div class="site-header__status">
            <DataStatus />
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <Suspense
          fallback={
            <div class="wrap">
              <Loading>Открываем раздел…</Loading>
            </div>
          }
        >
          {route(location.path)}
        </Suspense>
      </main>
      <footer class="site-footer">
        <div class="wrap site-footer__cols">
          <section>
            <h2>Данные</h2>
            <ul>
              <li>
                <a href="https://exoplanetarchive.ipac.caltech.edu/" rel="noopener">
                  NASA Exoplanet Archive
                </a>
                , таблица pscomppars
              </li>
              <li>
                Границы зоны:{" "}
                <a href="https://doi.org/10.1088/2041-8205/787/2/L29" rel="noopener">
                  Kopparapu и др., 2014
                </a>
              </li>
              <li>
                Сравнение:{" "}
                <a href="https://phl.upr.edu/hwc/data" rel="noopener">
                  PHL Habitable Worlds Catalog
                </a>
              </li>
            </ul>
          </section>
          <section>
            <h2>Справочник</h2>
            <ul>
              <li>
                Определения:{" "}
                <a href="https://astro4edu.org/resources/glossary/" rel="noopener">
                  IAU OAE Astronomy Glossary
                </a>
                , CC BY 4.0
              </li>
              <li>Русский перевод — черновик, проверенный автоматически, не редактором.</li>
            </ul>
          </section>
          <section>
            <h2>О портале</h2>
            <ul>
              <li>TulaHack 2026. Балл — эвристика для сортировки, не вероятность жизни.</li>
              <li>
                Задача трёх тел основана на коде{" "}
                <a href="https://github.com/KaiyuanGONG/formula-to-pixel" rel="noopener">
                  formula-to-pixel
                </a>{" "}
                (MIT).
              </li>
            </ul>
          </section>
        </div>
      </footer>
      <CompareTray path={location.path} />
    </div>
  );
}
