import { cached, request } from "./client";
import type {
  AnswerResponse,
  AssistantMode,
  CandidatesResponse,
  Candidate,
  CandidateSources,
  FacetsResponse,
  HwcResponse,
  ListResponse,
  Methodology,
  PlanetsResponse,
  SearchResponse,
  StatusResponse,
  TermListItem,
  TermRecord,
} from "./types";

const enc = encodeURIComponent;

export const api = {
  status: () => request<StatusResponse>("/api/status"),
  candidates: () => cached<CandidatesResponse>("/api/candidates?limit=1000", 60_000),
  candidate: (name: string) => cached<Candidate>(`/api/candidates/${enc(name)}`, 60_000),
  sources: (name: string) => cached<CandidateSources>(`/api/candidates/${enc(name)}/sources`, 10 * 60_000),
  planets: () => cached<PlanetsResponse>("/api/planets", 5 * 60_000),
  methodology: () => cached<Methodology>("/api/methodology", 60 * 60_000),
  hwc: () => cached<HwcResponse>("/api/hwc", 30 * 60_000),

  terms: (params: { page?: number; pageSize?: number; q?: string; letter?: string; category?: string }) => {
    const query = new URLSearchParams({ locale: "ru", page: String(params.page ?? 1), page_size: String(params.pageSize ?? 60) });
    if (params.q) query.set("q", params.q);
    if (params.letter) query.set("letter", params.letter);
    if (params.category) query.set("category", params.category);
    return cached<ListResponse<TermListItem>>(`/api/v1/terms?${query}`, 5 * 60_000);
  },
  facets: () => cached<FacetsResponse>("/api/v1/terms/facets?locale=ru", 30 * 60_000),
  term: (number: number) => cached<TermRecord>(`/api/v1/terms/${number}`, 10 * 60_000),
  search: (q: string, page = 1) =>
    cached<SearchResponse>(`/api/v1/search?${new URLSearchParams({ q, locale: "ru", page: String(page), page_size: "20" })}`, 2 * 60_000),
  ask: (question: string, mode: AssistantMode, context?: Record<string, unknown>) =>
    request<AnswerResponse>("/api/v1/assistant/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, mode, locale: "ru", context }),
    }),
};

export const mediaFile = (id: string) => `/api/v1/media/${enc(id)}/file?locale=ru`;

/** /api/v1/terms/43 → /glossary/43; ссылки на медиа ведут на страницу термина-источника. */
export function portalUrlForApi(url: string, recordId?: string): string {
  const term = url.match(/^\/api\/v1\/terms\/(\d+)/);
  if (term) return `/glossary/${term[1]}`;
  const record = recordId?.match(/^term:(\d+)$/);
  if (record) return `/glossary/${record[1]}`;
  return url;
}

export function astro4eduTermNumber(url: string): number | null {
  const match = url.match(/astro4edu\.org\/(?:[a-z-]+\/)?resources\/glossary\/term\/(\d+)\/?$/);
  return match ? Number(match[1]) : null;
}
