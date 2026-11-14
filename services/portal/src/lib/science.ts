import type { BoundaryRow, HabitableZone } from "../api/types";

export const ZONE_LABEL: Record<HabitableZone, string> = {
  conservative: "консервативная зона",
  optimistic: "только расширенная зона",
  outside: "вне зоны обитаемости",
};

export const ZONE_SHORT: Record<HabitableZone, string> = {
  conservative: "консервативная",
  optimistic: "расширенная",
  outside: "вне зоны",
};

/** Этапы воронки отбора в том порядке, в каком их проверяет Planets API (Habitability.Evaluate). */
export const FUNNEL: { code: string; label: string; kept: string }[] = [
  { code: "controversial", label: "статус планеты оспаривается", kept: "Без спорного статуса" },
  { code: "circumbinary", label: "орбита вокруг двойной звезды", kept: "Одна звезда в центре орбиты" },
  { code: "starTemperatureUnknown", label: "нет измеренной температуры звезды", kept: "Температура звезды измерена" },
  { code: "starTemperatureOutOfRange", label: "звезда холоднее 2600 K или горячее 7200 K", kept: "Звезда 2600–7200 K" },
  { code: "fluxUnknown", label: "поток излучения неизвестен", kept: "Поток излучения известен" },
  { code: "outsideHabitableZone", label: "поток вне расширенной зоны обитаемости", kept: "В расширенной зоне обитаемости" },
  { code: "sizeUnknown", label: "нет ни радиуса, ни массы", kept: "Известен радиус или масса" },
  { code: "radiusOutOfRange", label: "радиус вне 0,5–2,5 радиуса Земли", kept: "Радиус 0,5–2,5 R⊕" },
  { code: "massOutOfRange", label: "масса вне 0,1–10 масс Земли", kept: "Масса 0,1–10 M⊕ — кандидаты" },
];

export const EXCLUSION_LABEL: Record<string, string> = Object.fromEntries(FUNNEL.map((stage) => [stage.code, stage.label]));
EXCLUSION_LABEL.missingName = "нет названия";

export const FLAG_TEXT: Record<string, { title: string; text: string }> = {
  fluxEstimatedFromStarLuminosityAndOrbit: {
    title: "Поток вычислен нами",
    text: "NASA не публикует поток для этой планеты; он оценён как светимость звезды, делённая на квадрат большой полуоси.",
  },
  eccentricityUnknownOrLimited: {
    title: "Эксцентриситет неизвестен",
    text: "Эксцентриситет не измерен или дан только как предел. Компонент «орбита» получает нейтральные 7,5 из 15 баллов.",
  },
  radiusMissingOrLimited: {
    title: "Радиус не измерен",
    text: "Балл за размер посчитан по массе, а не по радиусу.",
  },
  massMissingOrLimited: {
    title: "Масса не измерена",
    text: "Масса неизвестна или дана только как предел; размер оценивается по радиусу.",
  },
  radiusCalculatedByArchive: {
    title: "Радиус вычислен архивом",
    text: "Значение получено NASA расчётом (например, по соотношению масса — радиус), а не прямым измерением транзита.",
  },
  massCalculatedByArchive: {
    title: "Масса вычислена архивом",
    text: "Масса получена NASA по эмпирическому соотношению масса — радиус, а не измерена.",
  },
  fluxCalculatedByArchive: {
    title: "Поток вычислен архивом",
    text: "NASA вычислила поток по параметрам звезды и орбиты.",
  },
  massMayBeMinimum: {
    title: "Масса может быть минимальной",
    text: "Метод лучевых скоростей даёт M·sin i — нижнюю границу массы. Истинная масса может быть больше.",
  },
};

export const EARTH = {
  radiusEarth: 1,
  massEarth: 1,
  fluxEarth: 1,
  sunTemperatureK: 5772,
  orbitalPeriodDays: 365.256,
  semiMajorAxisAu: 1,
  eccentricity: 0.0167,
  equilibriumTemperatureK: 255,
  densityGramsCm3: 5.51,
};

/** Цвет спектрального класса для образца звезды (информационный, с подписью класса). */
export function spectralClass(spectralType: string | null | undefined, teff: number | null | undefined): string {
  const letter = spectralType?.trim()[0]?.toUpperCase();
  if (letter && "OBAFGKM".includes(letter)) return letter;
  if (!teff) return "?";
  if (teff >= 30000) return "O";
  if (teff >= 10000) return "B";
  if (teff >= 7500) return "A";
  if (teff >= 6000) return "F";
  if (teff >= 5200) return "G";
  if (teff >= 3700) return "K";
  return "M";
}

export const STAR_COLOR: Record<string, string> = {
  O: "#9bb0ff",
  B: "#aabfff",
  A: "#cad7ff",
  F: "#f8f7ff",
  G: "#fff4ea",
  K: "#ffd2a1",
  M: "#ffad66",
  "?": "#d9d9d9",
};

/** Линейная интерполяция таблицы границ Kopparapu 2014, которую отдаёт /api/methodology. */
export function boundariesAt(rows: BoundaryRow[] | undefined, teff: number): BoundaryRow | null {
  if (!rows?.length || teff < rows[0].teffK || teff > rows[rows.length - 1].teffK) return null;
  let index = rows.findIndex((row) => row.teffK >= teff);
  if (index <= 0) return rows[0];
  const a = rows[index - 1];
  const b = rows[index];
  const t = (teff - a.teffK) / (b.teffK - a.teffK);
  const mix = (x: number, y: number) => x + (y - x) * t;
  return {
    teffK: teff,
    recentVenus: mix(a.recentVenus, b.recentVenus),
    runawayGreenhouse: mix(a.runawayGreenhouse, b.runawayGreenhouse),
    maximumGreenhouse: mix(a.maximumGreenhouse, b.maximumGreenhouse),
    earlyMars: mix(a.earlyMars, b.earlyMars),
  };
}

export const SOURCE_STATUS: Record<string, string> = {
  available: "данные получены",
  not_found: "в каталоге нет записи",
  missing_id: "нет идентификатора для запроса",
  unavailable: "источник сейчас недоступен",
};

export const DISCOVERY_METHOD: Record<string, string> = {
  Transit: "транзитный",
  "Radial Velocity": "лучевых скоростей",
  Imaging: "прямое изображение",
  Microlensing: "микролинзирование",
  "Transit Timing Variations": "вариации времени транзитов",
  "Eclipse Timing Variations": "вариации времени затмений",
  Astrometry: "астрометрический",
  "Orbital Brightness Modulation": "модуляция яркости",
  "Pulsar Timing": "тайминг пульсара",
  "Pulsation Timing Variations": "вариации пульсаций",
  "Disk Kinematics": "кинематика диска",
};
