import { useEffect, useRef, useState } from "preact/hooks";
import { ApiError, describeError } from "../api/client";
import { api, portalUrlForApi } from "../api/endpoints";
import type { AnswerResponse, AssistantMode } from "../api/types";
import { useResource } from "../lib/hooks";
import { Link, useLocation } from "../router";

const MODES: { mode: AssistantMode; label: string; hint: string }[] = [
  { mode: "auto", label: "Автоматически", hint: "помощник сам выберет: короткое определение, объяснение по нескольким статьям или общий ответ" },
  { mode: "term", label: "Определение", hint: "коротко, по одному термину справочника" },
  { mode: "explain", label: "Объяснение", hint: "развёрнуто, по нескольким найденным материалам" },
  { mode: "general", label: "Общий ответ", hint: "знания модели без ссылок на справочник" },
];

const MODE_LABEL: Record<string, string> = { term: "определение", article: "статья", explain: "объяснение", general: "общий ответ" };

interface Turn {
  id: number;
  question: string;
  answer?: AnswerResponse;
  error?: unknown;
}

function SourceLink({ url, recordId }: { url: string; recordId: string }) {
  const number = recordId.match(/^term:(\d+)$/)?.[1];
  const term = useResource(number ? () => api.term(Number(number)) : null, [number]);
  return <Link href={portalUrlForApi(url, recordId)}>{term.data?.locales.ru.title ?? (number ? `термин ${number}` : recordId)}</Link>;
}

function AnswerView({ answer }: { answer: AnswerResponse }) {
  const grounded = answer.grounding !== "model";
  return (
    <div class="answer">
      <p class="answer__meta">
        <span class={`tag ${grounded ? "tag--ok" : "tag--warn"}`}>{grounded ? "по материалам справочника" : "общий ответ модели, без источников"}</span>
        <span class="tag">режим: {MODE_LABEL[answer.mode] ?? answer.mode}</span>
      </p>
      <div class="prose">
        {answer.answer.split(/\n\s*\n|\n(?=[-•*] )/).map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
      {answer.images?.length > 0 && (
        <div class="answer__images">
          {answer.images.map((item) => (
            <figure class="media" key={`${item.record_id}/${item.url}`}>
              <img src={item.url} alt={item.alt} loading="lazy" decoding="async" />
              <figcaption>
                {item.kind === "illustration" ? "Иллюстрация к материалу справочника. " : "Изображение из материала справочника. "}{item.caption}
                {(item.credit || item.license) && (
                  <span class="media__credit">
                    {item.credit && <>Автор: {item.credit_url ? <a href={item.credit_url} rel="noopener">{item.credit}</a> : item.credit}. </>}
                    {item.license && <>Лицензия: {item.license_url ? <a href={item.license_url} rel="noopener">{item.license}</a> : item.license}.</>}
                    {item.modified && <> Файл переведён в WebP; размер не более 960 px.</>}
                  </span>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {answer.sources.length > 0 && (
        <div style={{ marginTop: "14px" }}>
          <p class="muted" style={{ fontSize: "var(--fs-sm)" }}>
            Источники:
          </p>
          <ul class="chips">
            {answer.sources.map((source) => (
              <li key={`${source.record_id}/${source.section_id}`}>
                <SourceLink url={source.url} recordId={source.record_id} />
              </li>
            ))}
          </ul>
        </div>
      )}
      <p class="muted" style={{ fontSize: "var(--fs-xs)", marginTop: "10px" }}>
        Модель {answer.diagnostics.model ?? "—"}, промпт {answer.diagnostics.prompt_version ?? "—"}
      </p>
    </div>
  );
}

export function Assistant() {
  const location = useLocation();
  const planet = location.query.get("planet");
  const term = location.query.get("term");
  const termRecord = useResource(term ? () => api.term(Number(term)) : null, [term]);
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<AssistantMode>("auto");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const counter = useRef(0);

  useEffect(() => {
    if (planet) setQuestion(`Что известно о планете ${planet} и почему она могла бы быть похожа на Землю?`);
  }, [planet]);
  useEffect(() => {
    if (termRecord.data) setQuestion(`Объясни простыми словами, что такое «${termRecord.data.locales.ru.title}».`);
  }, [termRecord.data]);
  useEffect(() => {
    if (waitUntil <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [waitUntil]);

  const left = Math.max(0, Math.ceil((waitUntil - now) / 1000));

  const ask = async (event: Event) => {
    event.preventDefault();
    const text = question.trim();
    if (text.length < 2 || busy || left > 0) return;
    const id = ++counter.current;
    setTurns((previous) => [{ id, question: text }, ...previous]);
    setBusy(true);
    const context: Record<string, unknown> = { page: "portal" };
    if (planet) context.planet = planet;
    if (term) context.term_number = Number(term);
    try {
      const answer = await api.ask(text, mode, context);
      setTurns((previous) => previous.map((turn) => (turn.id === id ? { ...turn, answer } : turn)));
      setUnavailable(null);
    } catch (error) {
      setTurns((previous) => previous.map((turn) => (turn.id === id ? { ...turn, error } : turn)));
      if (error instanceof ApiError && error.code === "assistant_unavailable") setUnavailable(error.message);
      if (error instanceof ApiError && error.retryAfter) setWaitUntil(Date.now() + error.retryAfter * 1000);
    } finally {
      setBusy(false);
      // Сервер принимает один запрос к помощнику за 10 секунд; кнопка показывает это заранее.
      setWaitUntil((previous) => Math.max(previous, Date.now() + 10_000));
      setNow(Date.now());
    }
  };

  return (
    <div class="wrap">
      <header class="page-head">
        <h1>Помощник по астрономии</h1>
        <p class="lead">
          Отвечает по материалам справочника и показывает, на какие термины опирался. Если подходящих материалов нет, честно отвечает от себя — такой ответ помечен и идёт без ссылок.
        </p>
      </header>

      {unavailable && (
        <div class="state state--error" role="alert" style={{ marginBottom: "24px" }}>
          <h3>Помощник сейчас недоступен</h3>
          <p class="muted">
            {unavailable}. <Link href="/glossary">Справочник</Link> и{" "}
            <Link href="/search">поиск</Link> работают без помощника.
          </p>
        </div>
      )}

      <form class="ask" onSubmit={ask}>
        {(planet || termRecord.data) && (
          <p class="notice">
            Контекст: {planet ? `планета ${planet}` : `термин «${termRecord.data!.locales.ru.title}»`}. Помощник получит его вместе с вопросом.
          </p>
        )}
        <div class="field">
          <label for="question">Вопрос</label>
          <textarea id="question" class="textarea" maxLength={2000} value={question} onInput={(e) => setQuestion((e.target as HTMLTextAreaElement).value)} placeholder="Например: чем звезда отличается от планеты?" />
        </div>
        <fieldset class="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend class="field__label">Как отвечать</legend>
          <div class="segmented" role="group" aria-label="Режим ответа">
            {MODES.map((item) => (
              <button key={item.mode} type="button" aria-pressed={mode === item.mode} title={item.hint} onClick={() => setMode(item.mode)}>
                {item.label}
              </button>
            ))}
          </div>
          <p class="muted" style={{ fontSize: "var(--fs-sm)" }}>
            {MODES.find((item) => item.mode === mode)?.hint}.
          </p>
        </fieldset>
        <div class="toolbar">
          <button class="btn btn--primary" type="submit" disabled={busy || left > 0 || question.trim().length < 2}>
            {busy ? "Помощник отвечает…" : left > 0 ? `Можно спросить через ${left} с` : "Спросить"}
          </button>
          <span class="muted" style={{ fontSize: "var(--fs-sm)" }}>
            Один вопрос в 10 секунд. Ответ обычно занимает 5–30 секунд.
          </span>
        </div>
      </form>

      <section class="section" aria-live="polite">
        {turns.map((turn) => (
          <article key={turn.id} class="turn">
            <h2 class="turn__question">{turn.question}</h2>
            {turn.answer ? (
              <AnswerView answer={turn.answer} />
            ) : turn.error ? (
              <div class="state state--error">
                <h3>{describeError(turn.error).title}</h3>
                <p class="muted">
                  {turn.error instanceof ApiError && turn.error.code === "assistant_timeout"
                    ? "Помощник не уложился в отведённое время. Попробуйте сформулировать короче или выбрать режим «Определение»."
                    : turn.error instanceof ApiError && turn.error.code === "assistant_error"
                      ? "Сервис LLM вернул ошибку. Повторите вопрос через несколько секунд."
                      : describeError(turn.error).text}
                </p>
              </div>
            ) : (
              <p class="loading" role="status">
                Ищем материалы и формулируем ответ…
              </p>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
