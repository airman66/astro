import { useEffect, useState } from "preact/hooks";
import { api, portalUrlForApi } from "../api/endpoints";
import { ErrorState, Loading } from "../components/ui";
import { count } from "../lib/format";
import { useResource } from "../lib/hooks";
import { Link, setQuery, useLocation } from "../router";

const KIND: Record<string, string> = { term: "термин", media: "изображение", diagram: "схема", article: "статья" };

export function Search() {
  const location = useLocation();
  const q = location.query.get("q") ?? "";
  const page = Number(location.query.get("page") ?? "1") || 1;
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  const result = useResource(q ? () => api.search(q, page) : null, [q, page]);

  return (
    <div class="wrap">
      <header class="page-head">
        <h1>Поиск по справочнику</h1>
        <p class="lead">Ищет по названиям, определениям и подписям к изображениям. Учитывает формы слова и смысл запроса, если доступен семантический индекс.</p>
      </header>
      <form
        class="toolbar"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery({ q: text.trim() || null, page: null }, false);
        }}
      >
        <label class="visually-hidden" for="search-q">
          Запрос
        </label>
        <input id="search-q" class="input" style={{ maxWidth: "460px" }} type="search" value={text} placeholder="Например: почему звёзды мерцают" onInput={(e) => setText((e.target as HTMLInputElement).value)} />
        <button class="btn btn--primary" type="submit">
          Найти
        </button>
      </form>
      {!q ? (
        <p class="muted">Введите запрос. Вопрос целиком тоже подойдёт: служебные слова вроде «что такое» не мешают поиску.</p>
      ) : result.error ? (
        <ErrorState error={result.error} onRetry={result.reload} />
      ) : !result.data ? (
        <Loading>Ищем…</Loading>
      ) : (
        <>
          <p class="muted" aria-live="polite" style={{ marginBottom: "8px" }}>
            {result.data.total >= 200
              ? `Больше 200 результатов по запросу «${q}», сначала самые подходящие`
              : result.data.total
                ? `${count(result.data.total, ["результат", "результата", "результатов"])} по запросу «${q}»`
                : `По запросу «${q}» ничего не нашлось`}
          </p>
          {result.data.mode === "lexical" && (
            <p class="notice" style={{ marginBottom: "16px" }}>
              Семантический поиск сейчас недоступен (не запущен сервер эмбеддингов), поэтому показаны только совпадения слов.
            </p>
          )}
          <ol class="results">
            {result.data.items.map((item) => (
              <li key={`${item.record_id}/${item.section_id}`}>
                <Link href={portalUrlForApi(item.url, item.record_id)} class="results__title">
                  {item.title}
                </Link>
                <span class="results__kind">{KIND[item.kind] ?? item.kind}</span>
                <p class="results__excerpt">{item.excerpt}</p>
              </li>
            ))}
          </ol>
          {result.data.total > page * result.data.page_size && (
            <div class="toolbar" style={{ marginTop: "20px" }}>
              {page > 1 && (
                <button class="btn" type="button" onClick={() => setQuery({ page: String(page - 1) }, false)}>
                  Предыдущая страница
                </button>
              )}
              <button class="btn" type="button" onClick={() => setQuery({ page: String(page + 1) }, false)}>
                Следующая страница
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
