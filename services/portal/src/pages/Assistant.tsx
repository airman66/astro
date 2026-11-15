import { useEffect, useRef, useState } from "preact/hooks";
import { ApiError, describeError } from "../api/client";
import { api, portalUrlForApi } from "../api/endpoints";
import type { AnswerResponse, AssistantMode } from "../api/types";
import { useResource } from "../lib/hooks";
import { ASSISTANT_OPEN, type AssistantContext } from "../lib/assistant";
import { Link, match, navigate, type Location } from "../router";

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

export function AssistantWidget({ location }: { location: Location }) {
  const [open, setOpen] = useState(location.path === "/assistant");
  const [context, setContext] = useState<AssistantContext>({
    planet: location.query.get("planet") ?? undefined,
    term: Number(location.query.get("term")) || undefined,
  });
  const planet = context.planet;
  const term = context.term;
  const termRecord = useResource(term ? () => api.term(term) : null, [term]);
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<AssistantMode>("auto");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const counter = useRef(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const messages = useRef<HTMLDivElement>(null);

  const show = (next: AssistantContext = {}) => {
    setContext(next);
    if (next.planet) setQuestion(`Что известно о планете ${next.planet}?`);
    else if (!next.term) setQuestion("");
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    if (location.path === "/assistant") navigate("/", { replace: true, keepScroll: true });
    requestAnimationFrame(() => trigger.current?.focus());
  };

  useEffect(() => {
    const onOpen = (event: Event) => show((event as CustomEvent<AssistantContext>).detail ?? {});
    window.addEventListener(ASSISTANT_OPEN, onOpen);
    return () => window.removeEventListener(ASSISTANT_OPEN, onOpen);
  }, []);
  useEffect(() => {
    if (location.path !== "/assistant") return;
    show({ planet: location.query.get("planet") ?? undefined, term: Number(location.query.get("term")) || undefined });
  }, [location.path, location.query.toString()]);
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, location.path]);
  useEffect(() => {
    if (open && messages.current) messages.current.scrollTop = messages.current.scrollHeight;
  }, [open, turns]);

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
    setTurns((previous) => [...previous, { id, question: text }]);
    setQuestion("");
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

  const pageContext = match("/planets/:name", location.path);
  const termContext = match("/glossary/:number", location.path);
  return (
    <>
      {!open && (
        <button
          ref={trigger}
          class="assistant-trigger"
          type="button"
          aria-label="Открыть ИИ-помощника"
          onClick={() => show(pageContext ? { planet: pageContext.name } : termContext ? { term: Number(termContext.number) } : {})}
        >
          <span aria-hidden="true">✦</span> ИИ-помощник
        </button>
      )}
      {open && (
        <section class="assistant-chat" role="dialog" aria-label="ИИ-помощник">
          <header class="assistant-chat__header">
            <div>
              <h2>ИИ-помощник</h2>
              <p>Астрономия простыми словами</p>
            </div>
            <button class="assistant-chat__close" type="button" aria-label="Закрыть помощника" onClick={close}>×</button>
          </header>
          <div ref={messages} class="assistant-chat__messages" aria-live="polite">
            <p class="assistant-chat__welcome">Спросите о планете или термине. Ответы по справочнику содержат ссылки.</p>
            {unavailable && (
              <div class="state state--error" role="alert">
                <strong>Помощник сейчас недоступен</strong>
                <p>{unavailable}. Можно воспользоваться <Link href="/glossary">справочником</Link>.</p>
              </div>
            )}
            {turns.map((turn) => (
              <div key={turn.id} class="assistant-chat__turn">
                <p class="assistant-chat__question">{turn.question}</p>
                <div class="assistant-chat__answer">
                  {turn.answer ? (
                    <AnswerView answer={turn.answer} />
                  ) : turn.error ? (
                    <div role="alert">
                      <strong>{describeError(turn.error).title}</strong>
                      <p>{describeError(turn.error).text}</p>
                    </div>
                  ) : (
                    <p role="status">Ищу ответ…</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <form class="assistant-chat__composer" onSubmit={ask}>
            {(planet || termRecord.data) && <p class="assistant-chat__context">Контекст: {planet ? planet : termRecord.data!.locales.ru.title}</p>}
            <label class="visually-hidden" for="assistant-question">Вопрос помощнику</label>
            <textarea
              ref={input}
              id="assistant-question"
              class="textarea"
              rows={2}
              maxLength={2000}
              value={question}
              onInput={(event) => setQuestion((event.target as HTMLTextAreaElement).value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (question.trim().length >= 2) (event.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
                }
              }}
              placeholder="Спросите об астрономии…"
            />
            <div class="assistant-chat__actions">
              <label>
                <span class="visually-hidden">Режим ответа</span>
                <select class="select" value={mode} onChange={(event) => setMode((event.target as HTMLSelectElement).value as AssistantMode)}>
                  {MODES.map((item) => <option key={item.mode} value={item.mode}>{item.label}</option>)}
                </select>
              </label>
              <button class="btn btn--primary" type="submit" disabled={busy || left > 0 || question.trim().length < 2}>
                {busy ? "Отвечает…" : left > 0 ? `Через ${left} с` : "Отправить"}
              </button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}
