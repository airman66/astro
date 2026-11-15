// Контракт ответов, описанный в docs/API.md. Поля, которых нет в старом снимке, необязательны.

export type Zone = "conservative" | "optimistic";
export type HabitableZone = Zone | "outside";

export interface RankStability {
  samples: number;
  inputsWithErrors: number;
  scoredInputs: number;
  scoreP10: number;
  scoreP90: number;
  rankP10: number;
  rankP90: number;
  top50Percent: number;
  eligiblePercent: number;
}

export interface Candidate {
  name: string;
  hostName: string | null;
  score: number;
  habitableZonePoints: number;
  sizePoints: number;
  orbitPoints: number;
  zone: Zone;
  radiusEarth: number | null;
  massEarth: number | null;
  fluxEarth: number;
  stellarTemperatureK: number;
  eccentricity: number | null;
  conservativeOuterFlux: number;
  conservativeInnerFlux: number;
  optimisticOuterFlux: number;
  optimisticInnerFlux: number;
  distanceParsec: number | null;
  spectralType: string | null;
  gaiaDr3Id: string | null;
  ticId: string | null;
  starAgeGyr: number | null;
  starRotationDays: number | null;
  transmissionSpectroscopyMetric: number | null;
  emissionSpectroscopyMetric: number | null;
  dataFlags: string[];
  semiMajorAxisAu: number | null;
  orbitalPeriodDays: number | null;
  inclinationDegrees: number | null;
  densityGramsCm3: number | null;
  equilibriumTemperatureK: number | null;
  stellarRadiusSolar: number | null;
  rightAscensionDegrees: number | null;
  declinationDegrees: number | null;
  orbitalPeriodProvenance: string | null;
  fluxProvenance: string | null;
  discoveryYear?: number | null;
  discoveryMethod?: string | null;
  systemPlanetCount?: number | null;
  rank?: number;
  stability: RankStability | null;
}

export interface CandidatesResponse {
  fetchedAt: string;
  scoreVersion?: string;
  total?: number;
  items: Candidate[];
}

export interface CatalogPoint {
  name: string;
  hostName: string | null;
  radiusEarth: number | null;
  radiusCalculated?: boolean;
  massEarth: number | null;
  massMayBeMinimum: boolean;
  fluxEarth: number | null;
  fluxProvenance: string | null;
  stellarTemperatureK: number | null;
  distanceParsec: number | null;
  rightAscensionDegrees: number | null;
  declinationDegrees: number | null;
  discoveryYear: number | null;
  discoveryMethod: string | null;
  habitableZone: HabitableZone | null;
  eligible: boolean;
  exclusion: string | null;
  score: number | null;
}

export interface PlanetsResponse {
  fetchedAt: string;
  scoreVersion: string;
  total: number;
  exclusions: Record<string, number>;
  items: CatalogPoint[];
}

export interface StatusResponse {
  ready: boolean;
  fetchedAt: string | null;
  totalPlanets: number;
  candidateCount: number;
  source: string;
  scoreVersion: string;
  fromCache?: boolean;
  lastAttemptAt?: string | null;
  refreshError?: string | null;
  nextAttemptAt?: string | null;
  refreshIntervalHours?: number;
}

export interface BoundaryRow {
  teffK: number;
  recentVenus: number;
  runawayGreenhouse: number;
  maximumGreenhouse: number;
  earlyMars: number;
}

export interface Methodology {
  scoreVersion: string;
  description: string;
  weights?: {
    conservativeZone: number;
    optimisticZone: number;
    sizeMax: number;
    orbitMax: number;
    orbitUnknown: number;
    eccentricityForZeroPoints: number;
    sizeFormula: string;
    orbitFormula: string;
  };
  thresholds?: {
    stellarTemperatureK: [number, number];
    radiusEarth: [number, number];
    massEarth: [number, number];
  };
  stabilitySamples?: number;
  boundaries?: BoundaryRow[];
  versions?: { version: string; note: string }[];
  sources: string[];
}

export interface HwcWorld {
  name: string;
  category: number;
  esi: number | null;
}

export interface HwcResponse {
  available: boolean;
  fetchedAt: string | null;
  catalogUpdatedAt: string;
  source: string;
  worlds: HwcWorld[];
}

export type SourceStatus = "available" | "not_found" | "missing_id" | "unavailable";

export interface SourceResult<T> {
  status: SourceStatus;
  value: T | null;
}

export interface CandidateSources {
  gaia: SourceResult<{
    sourceId: number;
    parallaxMas: number | null;
    parallaxErrorMas: number | null;
    temperatureK: number | null;
    luminositySolar: number | null;
    luminosityLowerSolar: number | null;
    luminosityUpperSolar: number | null;
    radiusSolar: number | null;
  }>;
  tess: SourceResult<{ observationCount: number; sectors: number[] }>;
  spectra: SourceResult<{ type: string; facility: string | null; instrument: string | null; bibcode: string | null }[]>;
}

// ── Справочник (glossary-rag) ──

export type ReviewStatus = "draft" | "reviewed";

export interface TermListItem {
  id: string;
  title: string;
  title_en?: string | null;
  url: string;
  review_status: ReviewStatus;
  categories: string[];
  categories_ru?: string[];
  illustration_url?: string | null;
}

export interface ListResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface FacetsResponse {
  locale: "ru" | "en";
  total: number;
  letters: { letter: string; count: number }[];
  categories: { id: string; title: string; count: number }[];
}

export interface Section {
  id: string;
  type: string;
  heading: string;
  body: string;
  heading_ru?: string | null;
  body_ru?: string | null;
  links: { text: string; url: string; text_ru?: string }[];
  media_ids: string[];
}

export interface MediaDetail {
  id: string;
  kind: string;
  file_type?: string | null;
  source_url?: string | null;
  record_url?: string | null;
  original_path?: string | null;
  ru_path?: string | null;
  title_en: string;
  title_ru: string;
  short_caption_en: string;
  short_caption_ru: string;
  caption_en: string;
  caption_ru: string;
  alt_en: string;
  alt_ru: string;
  credit?: string | null;
  credit_url?: string | null;
  license?: string | null;
  license_url?: string | null;
  review: { status: ReviewStatus };
}

export interface Illustration {
  term_number: number;
  url: string;
  width?: number | null;
  height?: number | null;
  alt_ru: string;
  alt_en: string;
  caption_ru: string;
  kind: "conceptual" | "diagram";
  status: "generated" | "approved";
  generator: string;
  source_type?: string;
  file_page?: string | null;
  article_url?: string | null;
  author?: string | null;
  license?: string | null;
  license_url?: string | null;
  modified?: string | null;
}

export interface TermRecord {
  id: string;
  kind: string;
  source: { term_number: number; url: string; fetched_at?: string };
  metadata: {
    approval_level?: string;
    categories?: string[];
    categories_ru?: string[];
    related_term_numbers?: number[];
    credit?: string;
    license?: string;
    license_url?: string;
  };
  sections: Section[];
  locales: Record<"en" | "ru", { title: string; aliases: string[]; blocks: Record<string, { heading?: string; body?: string }> }>;
  media: MediaDetail[];
  illustration?: Illustration | null;
  review: { status: ReviewStatus; reviewer?: string | null; notes?: string | null };
}

export interface SearchItem {
  record_id: string;
  section_id: string;
  kind: string;
  title: string;
  excerpt: string;
  url: string;
  review_status: string;
  score: number;
}

export interface SearchResponse extends ListResponse<SearchItem> {
  mode?: "hybrid" | "lexical";
}

export type AssistantMode = "auto" | "term" | "article" | "explain" | "general";

export interface AnswerResponse {
  mode: "term" | "article" | "explain" | "general" | "out_of_scope";
  grounding: "knowledge_base" | "model" | "mixed" | "policy";
  answer: string;
  primary_url: string | null;
  sources: { record_id: string; section_id: string; url: string; review_status: string }[];
  images: {
    record_id: string;
    url: string;
    alt: string;
    caption: string;
    kind: "illustration" | "source_media";
    credit?: string | null;
    credit_url?: string | null;
    license?: string | null;
    license_url?: string | null;
    modified?: string | null;
  }[];
  review_status: string | null;
  diagnostics: Record<string, string>;
}
