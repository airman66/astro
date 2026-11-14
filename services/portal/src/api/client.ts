// Все запросы идут на относительные URL того же origin (gateway). Ошибки приводятся к одному виду.

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfter: number | null;

  constructor(status: number, code: string, message: string, retryAfter: number | null) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

function retryAfterSeconds(response: Response): number | null {
  const header = response.headers.get("Retry-After");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(1, Math.round(seconds));
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(1, Math.round((date - Date.now()) / 1000)) : null;
}

async function toError(response: Response): Promise<ApiError> {
  let code = `http_${response.status}`;
  let message = response.statusText || "Ошибка запроса";
  try {
    const body = await response.json();
    // RAG: {code, message, details}; Planets: ProblemDetails {title, detail} или {error}.
    if (body && typeof body === "object") {
      if (typeof body.code === "string") code = body.code;
      message = body.message ?? body.detail ?? body.title ?? body.error ?? message;
    }
  } catch {
    /* тело не JSON */
  }
  if (response.status === 503 && code === "http_503") code = "not_ready";
  return new ApiError(response.status, code, String(message), retryAfterSeconds(response));
}

export async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers: { Accept: "application/json", ...(init.headers ?? {}) } });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError(0, "network", "Сервер недоступен. Проверьте подключение или запущен ли портал.", null);
  }
  if (!response.ok) throw await toError(response);
  return (await response.json()) as T;
}

interface CacheEntry {
  at: number;
  promise: Promise<unknown>;
}

const cache = new Map<string, CacheEntry>();

/** Повторно использует ответ в пределах ttl; неудачный запрос из кэша удаляется. */
export function cached<T>(url: string, ttlMs = 5 * 60_000): Promise<T> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttlMs) return hit.promise as Promise<T>;
  const promise = request<T>(url).catch((error) => {
    cache.delete(url);
    throw error;
  });
  cache.set(url, { at: Date.now(), promise });
  return promise;
}

export function invalidate(prefix: string): void {
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
}

export function describeError(error: unknown): { title: string; text: string; retryAfter: number | null } {
  if (error instanceof ApiError) {
    if (error.status === 0) return { title: "Нет связи с сервером", text: error.message, retryAfter: null };
    if (error.code === "not_ready" || (error.status === 503 && /not loaded/i.test(error.message)))
      return {
        title: "Каталог NASA ещё загружается",
        text: "Сервис только что запущен и получает первый снимок NASA Exoplanet Archive. Обычно это занимает до минуты; страница обновится сама.",
        retryAfter: 10,
      };
    if (error.status === 429)
      return { title: "Слишком много запросов", text: "Сервер ограничивает частоту запросов. Подождите немного.", retryAfter: error.retryAfter ?? 10 };
    if (error.status === 404) return { title: "Не найдено", text: error.message, retryAfter: null };
    return { title: `Ошибка ${error.status}`, text: error.message, retryAfter: error.retryAfter };
  }
  return { title: "Неожиданная ошибка", text: String((error as Error)?.message ?? error), retryAfter: null };
}
