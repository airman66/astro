const formats = new Map<string, Intl.NumberFormat>();

function formatter(min: number, max: number): Intl.NumberFormat {
  const key = `${min}:${max}`;
  let value = formats.get(key);
  if (!value) {
    value = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: min, maximumFractionDigits: max });
    formats.set(key, value);
  }
  return value;
}

/** Число по-русски: десятичная запятая, неразрывные пробелы в разрядах. null → «—». */
export function num(value: number | null | undefined, digits = 2, minDigits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return formatter(minDigits, digits).format(value);
}

/** Значащие цифры для величин разных порядков (поток 0,0004 … 4000). */
export function sig(value: number | null | undefined, significant = 3): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  const digits = Math.max(0, significant - 1 - magnitude);
  return num(value, Math.min(digits, 6));
}

export function int(value: number | null | undefined): string {
  return num(value, 0);
}

export function percent(value: number | null | undefined, digits = 0): string {
  return value === null || value === undefined ? "—" : `${num(value, digits)} %`;
}

const dateTime = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dateOnly = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

const shortFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function shortDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : shortFormat.format(date);
}

export function dateTimeRu(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : dateTime.format(date);
}

export function dateRu(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : dateOnly.format(date);
}

/** Русские формы слова для числа: plural(5, ["планета", "планеты", "планет"]). */
export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

export function count(n: number, forms: [string, string, string]): string {
  return `${int(n)} ${plural(n, forms)}`;
}

export const PARSEC_IN_LIGHT_YEARS = 3.261563777;

export function lightYears(parsec: number | null | undefined): string {
  return parsec === null || parsec === undefined ? "—" : `${sig(parsec * PARSEC_IN_LIGHT_YEARS, 3)} св. лет`;
}

/** Прямое восхождение в часах и минутах. */
export function rightAscension(degrees: number | null | undefined): string {
  if (degrees === null || degrees === undefined) return "—";
  const hours = degrees / 15;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h} ч ${m === 60 ? 59 : m} мин`;
}

export function declination(degrees: number | null | undefined): string {
  if (degrees === null || degrees === undefined) return "—";
  return `${degrees >= 0 ? "+" : "−"}${num(Math.abs(degrees), 1)}°`;
}
