import { useEffect, useState } from "preact/hooks";
import { api } from "../api/endpoints";
import type { TermListItem } from "../api/types";
import { ErrorState, Loading } from "../components/ui";
import { count } from "../lib/format";
import { useDebounced, useResource } from "../lib/hooks";
import { Link, navigate, setQuery, useLocation } from "../router";

function TermRow({ item }: { item: TermListItem }) {
  const number = item.url.split("/").pop();
  return (
    <li class={`term-row${item.illustration_url ? " term-row--art" : ""}`}>
      {item.illustration_url && <img src={item.illustration_url} alt="" width={56} height={56} loading="lazy" class="term-row__thumb" />}
      <div>
        <Link href={`/glossary/${number}`} class="term-row__title">
          {item.title}
        </Link>
        {item.title_en && item.title_en !== item.title && (
          <span class="term-row__en" lang="en">
            {item.title_en}
          </span>
        )}
        <div class="term-row__meta">{(item.categories_ru?.length ? item.categories_ru : item.categories).join(", ")}</div>
      </div>
    </li>
  );
}

export function Glossary() {
  const location = useLocation();
  const letter = location.query.get("letter") ?? "";
  const category = location.query.get("category") ?? "";
  const [text, setText] = useState(location.query.get("q") ?? "");
  const q = useDebounced(text.trim(), 300);
  const [pages, setPages] = useState(1);
  const facets = useResource(() => api.facets(), []);
  useEffect(() => setPages(1), [q, letter, category]);
  useEffect(() => {
    if ((location.query.get("q") ?? "") !== q) setQuery({ q: q || null });
  }, [q]);
  const list = useResource(
    () => Promise.all(Array.from({ length: pages }, (_, i) => api.terms({ page: i + 1, q, letter, category }))).then((parts) => ({ items: parts.flatMap((p) => p.items), total: parts[0]?.total ?? 0 })),
    [q, letter, category, pages],
  );

  return (
    <div class="wrap">
      <header class="page-head">
        <h1>Астрономический справочник</h1>
        <p class="lead">
          {facets.data ? `${count(facets.data.total, ["термин", "термина", "терминов"])}` : "Все термины"} глоссария Международного астрономического союза (IAU OAE): от абсолютной звёздной величины до зодиакального света.
          Определения переведены на русский; перевод — черновик, проверенный автоматически.
        </p>
      </header>

      <form
        class="toolbar"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim()) navigate(`/search?q=${encodeURIComponent(text.trim())}`);
        }}
      >
        <label class="visually-hidden" for="glossary-q">
          Название термина
        </label>
        <input id="glossary-q" class="input" style={{ maxWidth: "360px" }} type="search" placeholder="Название термина, например «квазар»" value={text} onInput={(e) => setText((e.target as HTMLInputElement).value)} />
        <button class="btn" type="submit">
          Искать в текстах определений
        </button>
        {facets.data && (
          <>
            <label class="field__label" for="glossary-category" style={{ display: "inline-flex", gap: "8px", alignItems: "center" }}>
              Раздел
            <select id="glossary-category" class="select" style={{ width: "auto", maxWidth: "260px" }} value={category} onChange={(e) => setQuery({ category: (e.target as HTMLSelectElement).value || null })}>
              <option value="">все разделы</option>
              {facets.data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.count})
                </option>
              ))}
            </select>
            </label>
          </>
        )}
      </form>

      {facets.data && (
        <nav class="alphabet" aria-label="Алфавитный указатель">
          <button type="button" aria-pressed={!letter} onClick={() => setQuery({ letter: null })}>
            все
          </button>
          {facets.data.letters.map((l) => (
            <button key={l.letter} type="button" aria-pressed={letter.toUpperCase() === l.letter} onClick={() => setQuery({ letter: l.letter })} title={count(l.count, ["термин", "термина", "терминов"])}>
              {l.letter}
            </button>
          ))}
        </nav>
      )}

      <div style={{ marginTop: "24px" }}>
        {list.error ? (
          <ErrorState error={list.error} onRetry={list.reload} />
        ) : !list.data ? (
          <Loading />
        ) : list.data.items.length === 0 ? (
          <div class="state">
            <h3>По названию ничего не нашлось</h3>
            <p class="muted">
              Попробуйте <Link href={`/search?q=${encodeURIComponent(q)}`}>поиск по текстам определений</Link> — он учитывает формы слова и смысл запроса.
            </p>
          </div>
        ) : (
          <>
            <p class="muted" aria-live="polite" style={{ marginBottom: "12px" }}>
              {count(list.data.total, ["термин", "термина", "терминов"])}
            </p>
            <ul class="term-list">
              {list.data.items.map((item) => (
                <TermRow key={item.id} item={item} />
              ))}
            </ul>
            {list.data.items.length < list.data.total && (
              <button class="btn" type="button" style={{ marginTop: "16px" }} onClick={() => setPages(pages + 1)} disabled={list.loading}>
                Показать ещё
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
