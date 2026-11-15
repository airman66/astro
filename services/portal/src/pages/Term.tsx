import { useState } from "preact/hooks";
import { api, astro4eduTermNumber, mediaFile } from "../api/endpoints";
import type { MediaDetail, Section, TermRecord } from "../api/types";
import { ErrorState, Loading, ReviewNote } from "../components/ui";
import { openAssistant } from "../lib/assistant";
import { useResource } from "../lib/hooks";
import { Link } from "../router";

function MediaItem({ item }: { item: MediaDetail }) {
  const [broken, setBroken] = useState(false);
  const caption = item.short_caption_ru || item.caption_ru || item.title_ru;
  const long = item.caption_ru && item.caption_ru !== caption ? item.caption_ru : "";
  return (
    <figure class="media">
      {broken ? (
        <div class="media__missing" role="img" aria-label={item.alt_ru || item.title_ru}>
          <span>Файл изображения не загружен на этот сервер.</span>
          {item.source_url && (
            <a href={item.source_url} rel="noopener">
              Открыть в Astro4Edu
            </a>
          )}
        </div>
      ) : (
        <img src={mediaFile(item.id)} alt={item.alt_ru || item.title_ru || ""} loading="lazy" decoding="async" onError={() => setBroken(true)} />
      )}
      <figcaption>
        {item.title_ru && <strong>{item.title_ru}. </strong>}
        {caption !== item.title_ru && caption}
        {long && (
          <details>
            <summary>Полная подпись</summary>
            <p style={{ whiteSpace: "pre-line" }}>{long}</p>
          </details>
        )}
        <span class="media__credit">
          {item.credit && <>Автор: {item.credit_url ? <a href={item.credit_url} rel="noopener">{item.credit}</a> : item.credit}. </>}
          {item.license && <>Лицензия: {item.license_url ? <a href={item.license_url} rel="noopener">{item.license}</a> : item.license}.</>}
        </span>
      </figcaption>
    </figure>
  );
}

function Gallery({ section, media, heading }: { section: Section; media: Map<string, MediaDetail>; heading: string }) {
  const items = section.media_ids.map((id) => media.get(id)).filter((item): item is MediaDetail => !!item);
  if (!items.length) return null;
  return (
    <section class="section" aria-label={heading}>
      <h2 style={{ marginBottom: "16px" }}>{heading}</h2>
      <div class="gallery">
        {items.map((item) => (
          <MediaItem key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

function Illustration({ record }: { record: TermRecord }) {
  const art = record.illustration;
  if (!art) {
    return (
      <div class="illustration illustration--empty">
        <p class="muted">Иллюстрация к этому термину ещё готовится.</p>
      </div>
    );
  }
  return (
    <figure class="illustration">
      <img src={art.url} alt={art.alt_ru} width={art.width ?? undefined} height={art.height ?? undefined} />
      <figcaption>
        {art.caption_ru && <>{art.caption_ru} </>}
        <span class="muted">
          {art.source_type && art.source_type !== "generated" ? (
            <>
              {art.file_page && <><a href={art.file_page} rel="noopener">{art.source_type === "wikimedia" ? "Файл в Wikimedia Commons" : "Исходное изображение"}</a>. </>}
              {art.author && <>Автор: {art.author}. </>}
              {art.license && <>Лицензия: {art.license_url ? <a href={art.license_url} rel="noopener">{art.license}</a> : art.license}.</>}
              {art.modified && <> Файл переведён в WebP; размер не более 960 px.</>}
            </>
          ) : (
            <>Иллюстрация команды портала.</>
          )}
        </span>
      </figcaption>
    </figure>
  );
}

function Body({ record }: { record: TermRecord }) {
  const [original, setOriginal] = useState(false);
  const ru = record.locales.ru;
  const en = record.locales.en;
  const definition = record.sections.find((s) => s.type === "definition");
  const media = new Map(record.media.map((m) => [m.id, m]));
  const related =
    definition?.links
      .map((link) => ({ link, number: astro4eduTermNumber(link.url) }))
      .filter((item): item is { link: Section["links"][number]; number: number } => item.number !== null && item.number !== record.source.term_number) ?? [];
  const other = record.sections.find((s) => s.type === "language_links");
  const blocks = record.sections.filter((s) => s.type === "source_block");
  const categories = record.metadata.categories_ru?.length ? record.metadata.categories_ru : record.metadata.categories ?? [];
  const text = (section: Section, locale: "ru" | "en") => record.locales[locale].blocks[section.id]?.body ?? "";
  const headingOf = (section: Section) => record.locales.ru.blocks[section.id]?.heading || section.heading_ru || section.heading;

  return (
    <>
      <header class="page-head">
        <p class="muted">
          <Link href="/glossary">Справочник</Link>
          {categories.length > 0 && <> / {categories.join(", ")}</>}
        </p>
        <h1>{ru.title}</h1>
        <div class="page-head__meta">
          <span lang="en">{en.title}</span>
          {ru.aliases.filter(Boolean).length > 0 && <span>Также: {ru.aliases.filter(Boolean).join(", ")}</span>}
          <ReviewNote status={record.review.status} />
        </div>
      </header>

      <div class="grid-main-side">
        <article>
          {definition && (
            <div class="prose" lang={original ? "en" : "ru"}>
              {(original ? text(definition, "en") : text(definition, "ru"))
                .split(/\n\s*\n/)
                .map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
            </div>
          )}
          <div class="toolbar" style={{ marginTop: "18px" }}>
            <button class="btn" type="button" aria-pressed={original} onClick={() => setOriginal(!original)}>
              {original ? "Показать перевод" : "Показать оригинал на английском"}
            </button>
            <button class="btn btn--quiet" type="button" onClick={() => openAssistant({ term: record.source.term_number })}>
              Спросить помощника
            </button>
          </div>
          {related.length > 0 && (
            <section style={{ marginTop: "32px" }} aria-labelledby="related-title">
              <h2 id="related-title" style={{ fontSize: "var(--fs-h3)", marginBottom: "10px" }}>
                Связанные термины
              </h2>
              <ul class="chips">
                {related.map(({ link, number }) => (
                  <li key={number}>
                    <Link href={`/glossary/${number}`}>{link.text_ru || link.text}</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>
        <aside>
          <Illustration record={record} />
        </aside>
      </div>

      {record.sections
        .filter((s) => s.type === "media_collection")
        .map((section) => (
          <Gallery key={section.id} section={section} media={media} heading={headingOf(section)} />
        ))}

      {blocks.map((section) =>
        text(section, "ru") ? (
          <section class="section" key={section.id}>
            <h2 style={{ marginBottom: "12px" }}>{headingOf(section)}</h2>
            <p class="prose muted" style={{ whiteSpace: "pre-line" }}>
              {text(section, "ru")}
            </p>
          </section>
        ) : null,
      )}

      {other && other.links.length > 0 && (
        <details class="section">
          <summary>Этот термин на других языках ({other.links.length})</summary>
          <ul class="chips" style={{ marginTop: "12px" }}>
            {other.links.map((link) => (
              <li key={link.url}>
                <a href={link.url} rel="noopener">
                  {link.text_ru || link.text}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p class="notice" style={{ marginTop: "40px" }}>
        Термин и определение: IAU Office of Astronomy for Education, Astronomy Glossary ({record.metadata.license ?? "CC BY 4.0"}),{" "}
        <a href={record.source.url} rel="noopener">
          исходная страница
        </a>
        .
      </p>
    </>
  );
}

export function Term({ number }: { number: number }) {
  const record = useResource(() => api.term(number), [number]);
  return (
    <div class="wrap">
      {record.error ? (
        <>
          <h1>Термин не найден</h1>
          <div style={{ marginTop: "20px" }}>
            <ErrorState error={record.error} onRetry={record.reload} />
          </div>
        </>
      ) : !record.data ? (
        <Loading>Загружаем термин…</Loading>
      ) : (
        <Body record={record.data} />
      )}
    </div>
  );
}
