import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { ApiError } from "../api/client";

export interface Resource<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
}

/**
 * Загружает ресурс; при 503 «каталог ещё не готов» и 429 повторяет запрос сам через Retry-After
 * (до 30 попыток), оставляя на экране понятное состояние ожидания.
 */
export function useResource<T>(load: (() => Promise<T>) | null, deps: unknown[]): Resource<T> {
  const [state, setState] = useState<{ data?: T; error?: unknown; loading: boolean }>({ loading: !!load });
  const [tick, setTick] = useState(0);
  const attempts = useRef(0);

  useEffect(() => {
    if (!load) {
      setState({ loading: false });
      return;
    }
    let alive = true;
    let timer: number | undefined;
    setState((previous) => ({ data: previous.data, loading: true }));
    load().then(
      (data) => {
        if (!alive) return;
        attempts.current = 0;
        setState({ data, loading: false });
      },
      (error) => {
        if (!alive || (error as Error)?.name === "AbortError") return;
        setState({ error, loading: false });
        const retriable = error instanceof ApiError && (error.status === 503 || error.status === 429) && error.code !== "assistant_unavailable";
        if (retriable && attempts.current < 30) {
          attempts.current += 1;
          timer = window.setTimeout(() => setTick((value) => value + 1), 1000 * (error.retryAfter ?? 8));
        }
      },
    );
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => {
    attempts.current = 0;
    setTick((value) => value + 1);
  }, []);
  return { data: state.data, error: state.error, loading: state.loading, reload };
}

export function useDebounced<T>(value: T, delay: number): T {
  const [current, setCurrent] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setCurrent(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return current;
}

/** Ширина контейнера (ResizeObserver) — графики перерисовываются под мобильный и настольный размер. */
export function useWidth<E extends HTMLElement>(): [(element: E | null) => void, number] {
  const [width, setWidth] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((element: E | null) => {
    observer.current?.disconnect();
    if (!element) return;
    setWidth(element.getBoundingClientRect().width);
    observer.current = new ResizeObserver((entries) => {
      const next = Math.round(entries[0].contentRect.width);
      setWidth((previous) => (Math.abs(previous - next) >= 1 ? next : previous));
    });
    observer.current.observe(element);
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);
  return [ref, width];
}

/** Ставит флаг, когда элемент впервые появился в окне: тяжёлые графики не рисуются заранее. */
export function useVisible<E extends HTMLElement>(margin = "200px"): [(element: E | null) => void, boolean] {
  const [visible, setVisible] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);
  const ref = useCallback(
    (element: E | null) => {
      observer.current?.disconnect();
      if (!element || visible) return;
      if (!("IntersectionObserver" in window)) {
        setVisible(true);
        return;
      }
      observer.current = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setVisible(true);
            observer.current?.disconnect();
          }
        },
        { rootMargin: margin },
      );
      observer.current.observe(element);
    },
    [visible, margin],
  );
  return [ref, visible];
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const listener = () => setReduced(query.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);
  return reduced;
}

/** Текущие значения CSS-переменных темы: canvas не умеет читать var(). Пересчитывается при смене темы. */
export function useThemeColors(names: string[]): Record<string, string> {
  const read = () => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name).trim()]));
  };
  const [colors, setColors] = useState<Record<string, string>>(read);
  useEffect(() => {
    const update = () => setColors(read());
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    query.addEventListener("change", update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      query.removeEventListener("change", update);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return colors;
}
