/*
 * Плоская задача трёх тел: уравнения в «рёберных» векторах и интегратор Грэгга — Булирша — Штёра.
 *
 * Адаптировано из formula-to-pixel (Kaiyuan Gong, MIT License),
 * https://github.com/KaiyuanGONG/formula-to-pixel, файл src/core/20-nb.js.
 * Изменения: перенос на TypeScript, комментарии на русском, метаданные пресетов вынесены отдельно.
 * Текст лицензии — services/portal/THIRD_PARTY_NOTICES.md.
 *
 * G = 1. Состояние — три вектора сторон треугольника q1 = x2 − x1, q2 = x3 − x2, q3 = x1 − x3
 * (q1 + q2 + q3 = 0) и их производные: s = [q1x, q1y, q2x, q2y, q3x, q3y, q̇1x, …, q̇3y].
 * При тесном сближении расстояние между телами — само переменная состояния, а не разность
 * двух больших координат, поэтому значащие цифры не теряются.
 */

export type Vec12 = Float64Array;
export type Rhs = ((s: Vec12, d: Vec12) => void) & { longest: number };

/** Сторона k соединяет тела k и k+1: q̈_k = −(m_k + m_{k+1})·Q_k + m_{k+2}·(Q_{k+1} + Q_{k+2}), Q = q/|q|³. */
export function rhs(m: readonly number[]): Rhs {
  const q = new Float64Array(6);
  const Q = new Float64Array(6);
  const f = ((s: Vec12, d: Vec12) => {
    // Самая длинная сторона не интегрируется, а выводится из двух других: сумма сторон точно равна нулю.
    const L = f.longest;
    const A = (L + 1) % 3;
    const B = (L + 2) % 3;
    for (let c = 0; c < 2; c++) {
      q[2 * A + c] = s[2 * A + c];
      q[2 * B + c] = s[2 * B + c];
      q[2 * L + c] = -(s[2 * A + c] + s[2 * B + c]);
    }
    for (let k = 0; k < 3; k++) {
      const r2 = q[2 * k] * q[2 * k] + q[2 * k + 1] * q[2 * k + 1];
      const w = 1 / (r2 * Math.sqrt(r2));
      Q[2 * k] = q[2 * k] * w;
      Q[2 * k + 1] = q[2 * k + 1] * w;
    }
    for (let c = 0; c < 2; c++) {
      for (let e = 0; e < 2; e++) {
        const k = e ? B : A;
        const k1 = (k + 1) % 3;
        const k2 = (k + 2) % 3;
        d[2 * k + c] = s[6 + 2 * k + c];
        d[6 + 2 * k + c] = -(m[k] + m[k1]) * Q[2 * k + c] + m[k2] * (Q[2 * k1 + c] + Q[2 * k2 + c]);
      }
      d[2 * L + c] = -(d[2 * A + c] + d[2 * B + c]);
      d[6 + 2 * L + c] = -(d[6 + 2 * A + c] + d[6 + 2 * B + c]);
    }
  }) as Rhs;
  f.longest = 0;
  return f;
}

/** Инерциальные координаты y = [x1, y1, x2, y2, x3, y3, vx1, …] → стороны и центр масс. */
export function toRelative(y: ArrayLike<number>, m: readonly number[]): { s: Vec12; cm: number[] } {
  const M = m[0] + m[1] + m[2];
  const s = new Float64Array(12);
  const cm = [0, 0, 0, 0];
  for (let o = 0; o < 12; o += 6) {
    for (let c = 0; c < 2; c++) {
      s[o + c] = y[o + 2 + c] - y[o + c];
      s[o + 2 + c] = y[o + 4 + c] - y[o + 2 + c];
      s[o + 4 + c] = y[o + c] - y[o + 4 + c];
      cm[(o ? 2 : 0) + c] = (m[0] * y[o + c] + m[1] * y[o + 2 + c] + m[2] * y[o + 4 + c]) / M;
    }
  }
  return { s, cm };
}

export function toInertial(s: Vec12, m: readonly number[], cm: number[], t: number, out: Vec12): Vec12 {
  const M = m[0] + m[1] + m[2];
  for (let o = 0; o < 12; o += 6) {
    for (let c = 0; c < 2; c++) {
      const base = o ? cm[2 + c] : cm[c] + cm[2 + c] * t;
      out[o + c] = base + (m[2] * s[o + 4 + c] - m[1] * s[o + c]) / M;
      out[o + 2 + c] = base + (m[0] * s[o + c] - m[2] * s[o + 2 + c]) / M;
      out[o + 4 + c] = base + (m[1] * s[o + 2 + c] - m[0] * s[o + 4 + c]) / M;
    }
  }
  return out;
}

/** Полная энергия в системе центра масс, прямо из сторон. */
export function energy(s: Vec12, m: readonly number[]): number {
  const M = m[0] + m[1] + m[2];
  const w = [m[0] * m[1], m[1] * m[2], m[2] * m[0]];
  let E = 0;
  for (let k = 0; k < 3; k++) {
    E += (w[k] * (s[6 + 2 * k] * s[6 + 2 * k] + s[7 + 2 * k] * s[7 + 2 * k])) / (2 * M);
    E -= w[k] / Math.sqrt(s[2 * k] * s[2 * k] + s[2 * k + 1] * s[2 * k + 1]);
  }
  return E;
}

export function angularMomentum(s: Vec12, m: readonly number[]): number {
  const M = m[0] + m[1] + m[2];
  const w = [m[0] * m[1], m[1] * m[2], m[2] * m[0]];
  let L = 0;
  for (let k = 0; k < 3; k++) L += (w[k] * (s[2 * k] * s[7 + 2 * k] - s[2 * k + 1] * s[6 + 2 * k])) / M;
  return L;
}

export interface StepResult {
  h: number;
  next: number;
}

export type Stepper = ((y: Float64Array, H: number) => StepResult) & { stats: { steps: number; evals: number; rejects: number } };

const SEQ = [2, 4, 6, 8, 10, 12, 14, 16];

/**
 * Экстраполяция Грэгга — Булирша — Штёра: шаг H модифицированным методом средней точки делится
 * на 2, 4, …, 16 подшагов, результаты экстраполируются к h → 0. Погрешность меряется относительно
 * каждого двумерного вектора, поэтому остаётся осмысленной при тесных сближениях.
 */
export function bulirschStoer(f: (y: Float64Array, d: Float64Array) => void, n: number, tol: number): Stepper {
  const K = SEQ.length;
  const tab: Float64Array[] = [];
  const f0 = new Float64Array(n);
  const za = new Float64Array(n);
  const zb = new Float64Array(n);
  const fz = new Float64Array(n);
  const cur = new Float64Array(n);
  const sc = new Float64Array(n);
  for (let k = 0; k < K; k++) tab.push(new Float64Array(n));
  const stats = { steps: 0, evals: 0, rejects: 0 };

  function midpoint(y: Float64Array, H: number, nSub: number) {
    const h = H / nSub;
    for (let i = 0; i < n; i++) {
      za[i] = y[i];
      zb[i] = y[i] + h * f0[i];
    }
    for (let j = 1; j < nSub; j++) {
      f(zb, fz);
      for (let i = 0; i < n; i++) {
        const t = za[i] + 2 * h * fz[i];
        za[i] = zb[i];
        zb[i] = t;
      }
    }
    f(zb, fz);
    for (let i = 0; i < n; i++) cur[i] = 0.5 * (za[i] + zb[i] + h * fz[i]);
    stats.evals += nSub;
  }

  const step = ((y: Float64Array, Hin: number): StepResult => {
    let H = Hin;
    f(y, f0);
    stats.evals++;
    for (;;) {
      for (let i = 0; i < n; i += 2) {
        sc[i] = sc[i + 1] = Math.sqrt(y[i] * y[i] + y[i + 1] * y[i + 1]) + Math.abs(H) * Math.sqrt(f0[i] * f0[i] + f0[i + 1] * f0[i + 1]) + 1e-300;
      }
      for (let k = 0; k < K; k++) {
        midpoint(y, H, SEQ[k]);
        let err = 0;
        for (let i = 0; i < n; i++) {
          // Схема Эйткена — Невилла: tab[j] ← T(k, j).
          let prev = tab[0][i];
          tab[0][i] = cur[i];
          for (let j = 1; j <= k; j++) {
            const q = SEQ[k] / SEQ[k - j];
            const v = tab[j - 1][i] + (tab[j - 1][i] - prev) / (q * q - 1);
            prev = tab[j][i];
            tab[j][i] = v;
          }
          if (k > 0) {
            const e = Math.abs(tab[k][i] - tab[k - 1][i]) / sc[i];
            if (e > err) err = e;
          }
        }
        if (k > 0 && err <= tol) {
          for (let i = 0; i < n; i++) y[i] = tab[k][i];
          stats.steps++;
          const grow = k <= 3 ? 1.6 : k === 4 ? 1.25 : k === 5 ? 1.0 : 0.7;
          return { h: H, next: H * grow };
        }
      }
      H *= 0.4;
      stats.rejects++;
    }
  }) as Stepper;
  step.stats = stats;
  return step;
}

/** Система трёх тел, которую можно продвинуть до любого момента времени. */
export class System {
  readonly m: number[];
  readonly s: Vec12;
  readonly cm: number[];
  t = 0;
  H = 0.01;
  collided = false;
  readonly E0: number;
  private readonly f: Rhs;
  private readonly step: Stepper;
  private keep = new Float64Array(12);

  constructor(y0: ArrayLike<number>, m: readonly number[], tol = 1e-13) {
    const relative = toRelative(y0, m);
    this.m = [...m];
    this.s = relative.s;
    this.cm = relative.cm;
    this.f = rhs(this.m);
    this.step = bulirschStoer(this.f, 12, tol);
    this.close();
    this.E0 = energy(this.s, this.m);
  }

  get stats() {
    return this.step.stats;
  }

  /** Самую длинную сторону приравниваем минус сумме двух других (меняется только она, на уровне округления). */
  private close(): void {
    const s = this.s;
    let L = 0;
    let best = -1;
    for (let k = 0; k < 3; k++) {
      const r2 = s[2 * k] * s[2 * k] + s[2 * k + 1] * s[2 * k + 1];
      if (r2 > best) {
        best = r2;
        L = k;
      }
    }
    const A = (L + 1) % 3;
    const B = (L + 2) % 3;
    for (let o = 0; o < 12; o += 6) for (let c = 0; c < 2; c++) s[o + 2 * L + c] = -(s[o + 2 * A + c] + s[o + 2 * B + c]);
    this.f.longest = L;
  }

  advance(tEnd: number, onStep?: (system: System) => void, budget = 500_000): this {
    let guard = 0;
    const s = this.s;
    while (!this.collided && this.t < tEnd && guard++ < budget) {
      const want = tEnd - this.t;
      const clipped = this.H >= want;
      this.keep.set(s);
      const r = this.step(s, clipped ? want : this.H);
      // Регуляризации столкновений нет: при сближении до 1e-9 или скачке энергии откатываемся и останавливаемся.
      let ok = Math.abs(energy(s, this.m) - this.E0) < 1e-5 * Math.abs(this.E0);
      for (let k = 0; k < 3; k++) if (!(s[2 * k] * s[2 * k] + s[2 * k + 1] * s[2 * k + 1] > 1e-18)) ok = false;
      if (!ok) {
        s.set(this.keep);
        this.collided = true;
        break;
      }
      const hit = clipped && r.h === want;
      this.t = hit ? tEnd : this.t + r.h;
      if (!hit) this.H = r.next;
      this.close();
      onStep?.(this);
    }
    return this;
  }

  inertial(out: Vec12 = new Float64Array(12)): Vec12 {
    return toInertial(this.s, this.m, this.cm, this.t, out);
  }

  energyError(): number {
    return Math.abs((energy(this.s, this.m) - this.E0) / this.E0);
  }
}

/** Расстояние в фазовом пространстве (координаты и скорости) между двумя состояниями. */
export function separation(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let d = 0;
  for (let i = 0; i < 12; i++) d += (a[i] - b[i]) * (a[i] - b[i]);
  return Math.sqrt(d);
}

/** Коллинеарное симметричное семейство: x1 = (−1, 0), x2 = (1, 0), x3 = (0, 0); v1 = v2 = (p1, p2), v3 = −2(p1, p2). */
export function collinear(p1: number, p2: number): number[] {
  return [-1, 0, 1, 0, 0, 0, p1, p2, p1, p2, -2 * p1, -2 * p2];
}

/** Равносторонний треугольник Лагранжа (m = 1, радиус описанной окружности 1): жёсткое вращение, ω² = 1/√3. */
export const LAGRANGE_OMEGA = Math.sqrt(1 / Math.sqrt(3));

export function lagrange(): number[] {
  const w = LAGRANGE_OMEGA;
  const c = Math.sqrt(3) / 2;
  return [0, 1, -c, -0.5, c, -0.5, -w, 0, 0.5 * w, -c * w, 0.5 * w, c * w];
}

/** Задача Пифагора (Burrau, 1913): массы 3, 4, 5 покоятся в вершинах прямоугольного треугольника 3-4-5. */
export function pythagorean(): { y: number[]; m: number[] } {
  return { y: [1, 3, -2, -1, 1, -1, 0, 0, 0, 0, 0, 0], m: [3, 4, 5] };
}

/**
 * Периодические орбиты коллинеарного семейства: p = (p1, p2), T — период. Исходные значения —
 * таблица Šuvakov & Dmitrašinović (2013) с пятью знаками; в formula-to-pixel они уточнены
 * методом Гаусса — Ньютона до невязки за период меньше 1e-11 (восьмёрка — 1e-12).
 */
export const ORBITS = {
  eight: { p: [0.3471168881192605, 0.5327249453878614], T: 6.325913982927317 },
  butterfly: { p: [0.306893420465725, 0.125506567014645], T: 6.23467483874541 },
  moth: { p: [0.464445172817446, 0.396060014653177], T: 14.8943051750252 },
  yinyang: { p: [0.282702090430065, 0.327208971522927], T: 10.9633030880288 },
  dragonfly: { p: [0.0805842255271152, 0.588836089763692], T: 21.2723373936997 },
} as const;

export type PresetKey = keyof typeof ORBITS | "lagrange" | "pythagorean";

export interface Preset {
  key: PresetKey;
  title: string;
  note: string;
  y: () => number[];
  m: number[];
  period: number;
  view: number;
  rate: number;
  trail: number;
  growth?: number;
}

const family = (key: keyof typeof ORBITS, title: string, note: string, view: number, rate: number): Preset => ({
  key,
  title,
  note,
  y: () => collinear(ORBITS[key].p[0], ORBITS[key].p[1]),
  m: [1, 1, 1],
  period: ORBITS[key].T,
  view,
  rate,
  trail: 0.97 * ORBITS[key].T,
});

export const PRESETS: Preset[] = [
  family("eight", "Восьмёрка", "Три равные массы бегут друг за другом по одной кривой (Мур, 1993; Шенсине и Монтгомери, 2000). Орбита устойчива: малое возмущение остаётся малым.", 1.45, 0.9),
  family("butterfly", "Бабочка", "Периодическая орбита из каталога Шувакова и Дмитрашиновича (2013).", 1.2, 0.75),
  family("moth", "Мотылёк", "Периодическая орбита Шувакова и Дмитрашиновича (2013) с периодом около 14,9.", 1.5, 1.4),
  family("yinyang", "Инь-ян", "Орбита Шувакова и Дмитрашиновича (2013): тела меняются местами в двух петлях.", 1.25, 1.3),
  family("dragonfly", "Стрекоза", "Длинная периодическая орбита (период около 21,3) из того же каталога.", 1.3, 1.6),
  {
    key: "lagrange",
    title: "Треугольник Лагранжа",
    note: "Точное решение: равносторонний треугольник вращается как целое. При равных массах оно неустойчиво — ошибка в девятом знаке растёт экспоненциально с показателем λ = ω/√2.",
    y: lagrange,
    m: [1, 1, 1],
    period: (2 * Math.PI) / LAGRANGE_OMEGA,
    view: 1.9,
    rate: 2.2,
    trail: 9,
    growth: LAGRANGE_OMEGA / Math.SQRT2,
  },
  {
    key: "pythagorean",
    title: "Задача Пифагора",
    note: "Массы 3, 4 и 5 отпускают без скорости в вершинах треугольника 3-4-5 (Буррау, 1913). После серии тесных сближений лёгкое тело выбрасывается, а пара оставшихся уходит в другую сторону.",
    y: () => pythagorean().y,
    m: [3, 4, 5],
    period: 0,
    view: 4.2,
    rate: 1.5,
    trail: 14,
  },
];
