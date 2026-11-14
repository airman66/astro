import type { TargetedKeyboardEvent, TargetedPointerEvent } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { Link } from "../../router";
import { num } from "../../lib/format";
import { usePrefersReducedMotion, useThemeColors, useWidth } from "../../lib/hooks";
import { PRESETS, separation, System, type Preset } from "./physics";

const BODY_COLORS = ["--series-blue", "--series-orange", "--series-aqua"] as const;
const DELTAS = [1e-9, 1e-6, 1e-3];
const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];

interface Sim {
  preset: Preset;
  y0: number[];
  a: System;
  b: System;
  trails: number[][];
  history: { t: number; sep: number; dE: number }[];
  view: number;
  ya: Float64Array;
  yb: Float64Array;
}

function build(preset: Preset, y0: number[], delta: number): Sim {
  const y1 = [...y0];
  y1[0] += delta;
  y1[7] -= 0.3 * delta;
  const a = new System(y0, preset.m);
  const b = new System(y1, preset.m);
  const sim: Sim = { preset, y0, a, b, trails: [[], [], [], [], [], []], history: [], view: preset.view, ya: new Float64Array(12), yb: new Float64Array(12) };
  a.inertial(sim.ya);
  b.inertial(sim.yb);
  return sim;
}

function log10(value: number): number {
  return Math.log10(Math.max(1e-17, value));
}

function drawPlot(canvas: HTMLCanvasElement | null, sim: Sim, colors: Record<string, string>, key: "sep" | "dE", lo: number, hi: number, slope?: number) {
  if (!canvas) return;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width) return;
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(width * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const left = 40;
  const bottom = height - 20;
  const top = 8;
  const right = width - 8;
  const tMax = Math.max(sim.preset.period ? sim.preset.period * 3 : 20, sim.a.t);
  const x = (t: number) => left + ((right - left) * t) / tMax;
  const y = (v: number) => bottom - ((bottom - top) * (v - lo)) / (hi - lo);
  ctx.strokeStyle = colors["--rule"];
  ctx.fillStyle = colors["--ink-3"];
  ctx.font = "11px 'Golos Text Variable', system-ui, sans-serif";
  ctx.lineWidth = 1;
  for (let v = lo; v <= hi; v += 4) {
    ctx.beginPath();
    ctx.moveTo(left, y(v) + 0.5);
    ctx.lineTo(right, y(v) + 0.5);
    ctx.stroke();
    ctx.fillText(`10${superscript(v)}`, 2, y(v) + 4);
  }
  ctx.fillText(`t = ${num(tMax, 0)}`, right - 50, height - 4);
  if (slope !== undefined && sim.history.length) {
    // Теоретический наклон ln δ = λ t + const, совмещённый с первой точкой.
    const first = sim.history[0];
    ctx.strokeStyle = colors["--ink-3"];
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x(first.t), y(first.sep));
    const tEnd = tMax;
    ctx.lineTo(x(tEnd), y(first.sep + (slope * (tEnd - first.t)) / Math.LN10));
    ctx.stroke();
  }
  ctx.strokeStyle = colors["--ink"];
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  sim.history.forEach((point, index) => {
    const px = x(point.t);
    const py = y(Math.min(hi, Math.max(lo, point[key])));
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
}

/** 2.4e-12 → «2,4·10⁻¹²». */
function scientific(value: number): string {
  if (!value) return "0";
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  const mantissa = value / 10 ** exponent;
  return exponent === 0 ? num(value, 1) : `${num(mantissa, 1)}·10${superscript(exponent)}`;
}

function superscript(value: number): string {
  const map: Record<string, string> = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
  return String(Math.round(value))
    .split("")
    .map((c) => map[c] ?? c)
    .join("");
}

export function ThreeBodyPage() {
  const reduced = usePrefersReducedMotion();
  const [presetKey, setPresetKey] = useState<Preset["key"]>("eight");
  const [playing, setPlaying] = useState(!reduced);
  const [speed, setSpeed] = useState(1);
  const [delta, setDelta] = useState(1e-9);
  const [showTwin, setShowTwin] = useState(true);
  const [showTrails, setShowTrails] = useState(true);
  const [custom, setCustom] = useState(false);
  const [readout, setReadout] = useState({ t: 0, dE: 0, sep: 0, collided: false });
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const sepCanvas = useRef<HTMLCanvasElement>(null);
  const energyCanvas = useRef<HTMLCanvasElement>(null);
  const sim = useRef<Sim | null>(null);
  const drag = useRef(-1);
  const state = useRef({ playing, speed, showTwin, showTrails });
  state.current = { playing, speed, showTwin, showTrails };
  const colors = useThemeColors(["--ink", "--ink-3", "--rule", "--paper", "--plate", ...BODY_COLORS]);
  const colorsRef = useRef(colors);
  colorsRef.current = colors;
  const preset = PRESETS.find((p) => p.key === presetKey)!;
  const size = Math.max(280, Math.min(width, 640));

  const reset = (initial?: number[]) => {
    sim.current = build(preset, initial ?? preset.y(), delta);
    setCustom(!!initial);
    setReadout({ t: 0, dE: 0, sep: delta, collided: false });
  };

  useEffect(() => reset(), [presetKey, delta]);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let lastReadout = 0;
    const tmp = new Float64Array(12);
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const s = sim.current;
      const element = canvas.current;
      if (!s || !element) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { playing: run, speed: mult } = state.current;
      if (run && drag.current < 0 && !s.a.collided && !s.b.collided) {
        const target = s.a.t + s.preset.rate * mult * dt;
        const push = (system: System, offset: number) => {
          system.inertial(tmp);
          for (let i = 0; i < 3; i++) s.trails[offset + i].push(tmp[2 * i], tmp[2 * i + 1], system.t);
        };
        s.a.advance(target, (q) => push(q, 0), 4000);
        s.b.advance(target, (q) => push(q, 3), 4000);
        s.a.inertial(s.ya);
        s.b.inertial(s.yb);
        const cut = Math.min(s.a.t, s.b.t) - s.preset.trail;
        for (const trail of s.trails) {
          let n = 0;
          while (n < trail.length && trail[n + 2] < cut) n += 3;
          if (n > 300) trail.splice(0, n);
          if (trail.length > 9000) trail.splice(0, trail.length - 9000);
        }
        s.history.push({ t: s.a.t, sep: log10(separation(s.ya, s.yb)), dE: log10(s.a.energyError()) });
        if (s.history.length > 4000) s.history = s.history.filter((_, i) => i % 2 === 0);
        // Вид плавно расширяется, если тела уходят за край (выброс в задаче Пифагора).
        let extent = 0;
        for (let i = 0; i < 3; i++) extent = Math.max(extent, Math.abs(s.ya[2 * i]), Math.abs(s.ya[2 * i + 1]));
        const wanted = Math.max(s.preset.view, extent * 1.15);
        s.view += (Math.min(wanted, s.preset.view * 6) - s.view) * 0.05;
      }
      render(element, s);
      if (now - lastReadout > 200) {
        lastReadout = now;
        setReadout({ t: s.a.t, dE: s.a.energyError(), sep: separation(s.ya, s.yb), collided: s.a.collided || s.b.collided });
        drawPlot(sepCanvas.current, s, colorsRef.current, "sep", -12, 1, s.preset.growth);
        drawPlot(energyCanvas.current, s, colorsRef.current, "dE", -16, -4);
      }
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [size]);

  const render = (element: HTMLCanvasElement, s: Sim) => {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    if (element.width !== Math.round(size * ratio)) {
      element.width = Math.round(size * ratio);
      element.height = Math.round(size * ratio);
    }
    const ctx = element.getContext("2d")!;
    const c = colorsRef.current;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = c["--paper"];
    ctx.fillRect(0, 0, size, size);
    const scale = size / 2 / s.view;
    const px = (x: number) => size / 2 + x * scale;
    const py = (y: number) => size / 2 - y * scale;
    ctx.strokeStyle = c["--rule"];
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size / 2, 0);
    ctx.lineTo(size / 2, size);
    ctx.moveTo(0, size / 2);
    ctx.lineTo(size, size / 2);
    ctx.stroke();
    const { showTwin: twin, showTrails: trails } = state.current;
    if (trails) {
      for (let k = 0; k < 6; k++) {
        if (k >= 3 && !twin) continue;
        const q = s.trails[k];
        const n = q.length / 3;
        if (n < 2) continue;
        ctx.strokeStyle = c[BODY_COLORS[k % 3]];
        ctx.lineWidth = k >= 3 ? 1 : 1.8;
        const tNow = q[q.length - 1];
        const chunks = 12;
        for (let chunk = 0; chunk < chunks; chunk++) {
          const from = Math.floor((chunk * (n - 1)) / chunks);
          const to = Math.floor(((chunk + 1) * (n - 1)) / chunks);
          const age = (tNow - q[3 * to + 2]) / s.preset.trail;
          ctx.globalAlpha = (k >= 3 ? 0.45 : 1) * Math.max(0.08, 1 - age);
          ctx.beginPath();
          ctx.moveTo(px(q[3 * from]), py(q[3 * from + 1]));
          for (let i = from + 1; i <= to; i++) ctx.lineTo(px(q[3 * i]), py(q[3 * i + 1]));
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }
    const drawBodies = (y: Float64Array, ghost: boolean) => {
      for (let i = 0; i < 3; i++) {
        const r = (ghost ? 4 : 7) * Math.cbrt(s.preset.m[i] / Math.min(...s.preset.m));
        ctx.beginPath();
        ctx.arc(px(y[2 * i]), py(y[2 * i + 1]), r, 0, Math.PI * 2);
        ctx.fillStyle = c[BODY_COLORS[i]];
        ctx.globalAlpha = ghost ? 0.55 : 1;
        ctx.fill();
        if (!ghost) {
          ctx.lineWidth = 2;
          ctx.strokeStyle = c["--paper"];
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    };
    if (twin) drawBodies(s.yb, true);
    drawBodies(s.ya, false);
  };

  const toModel = (event: TargetedPointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = event.currentTarget.getBoundingClientRect();
    const s = sim.current!;
    const scale = size / 2 / s.view;
    return [(event.clientX - rect.left - size / 2) / scale, -(event.clientY - rect.top - size / 2) / scale];
  };

  const onDown = (event: TargetedPointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    if (!s) return;
    const [x, y] = toModel(event);
    const scale = size / 2 / s.view;
    let best = -1;
    let bestDistance = 26 / scale;
    for (let i = 0; i < 3; i++) {
      const d = Math.hypot(s.ya[2 * i] - x, s.ya[2 * i + 1] - y);
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    }
    if (best < 0) return;
    drag.current = best;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const onMove = (event: TargetedPointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    if (!s || drag.current < 0) return;
    const [x, y] = toModel(event);
    s.ya[2 * drag.current] = x;
    s.ya[2 * drag.current + 1] = y;
    s.yb.set(s.ya);
  };

  const onUp = () => {
    const s = sim.current;
    if (!s || drag.current < 0) return;
    drag.current = -1;
    // Новые начальные условия: текущие положения после перетаскивания и текущие скорости тел.
    const y0 = Array.from(s.ya);
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) if (Math.hypot(y0[2 * i] - y0[2 * j], y0[2 * i + 1] - y0[2 * j + 1]) < 1e-3) y0[2 * j] += 0.05;
    }
    reset(y0);
  };

  const onKey = (event: TargetedKeyboardEvent<HTMLCanvasElement>) => {
    if (event.key === " ") {
      event.preventDefault();
      setPlaying(!playing);
    } else if (event.key === "r" || event.key === "к") reset();
  };

  return (
    <div class="wrap">
      <header class="page-head">
        <p class="muted">
          <Link href="/experiments">Эксперименты</Link>
        </p>
        <h1>Задача трёх тел</h1>
        <p class="lead">
          Три точечные массы притягиваются по закону Ньютона и движутся в одной плоскости. Для двух тел орбиты решаются формулой, для трёх общего решения нет: поведение может быть и периодическим, и хаотическим.
        </p>
        <p class="notice">Это учебная модель с безразмерными единицами (G = 1), а не измеренная орбита какой-либо звезды или экзопланеты из каталога.</p>
      </header>

      <div class="tb">
        <div ref={wrapRef} class="tb__stage">
          <canvas
            ref={canvas}
            class="tb__canvas"
            style={{ width: `${size}px`, height: `${size}px` }}
            tabIndex={0}
            aria-label={`Моделирование: ${preset.title}. Пробел — пуск и пауза, R — сброс. Тела можно перетаскивать мышью или пальцем.`}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onKeyDown={onKey}
          />
          <ul class="legend" style={{ marginTop: "8px" }}>
            {[0, 1, 2].map((i) => (
              <li key={i}>
                <span class="legend__dot" style={{ background: `var(${BODY_COLORS[i]})` }} aria-hidden="true" />
                тело {i + 1}, масса {num(preset.m[i], 0)}
              </li>
            ))}
            {showTwin && <li>бледные метки — двойник с отклонением δ</li>}
          </ul>
        </div>

        <div class="tb__panel">
          <fieldset class="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend class="field__label">Начальные условия</legend>
            <div class="tb__presets">
              {PRESETS.map((p) => (
                <label key={p.key} class={`tb__preset${p.key === presetKey ? " is-active" : ""}`}>
                  <input type="radio" name="preset" value={p.key} checked={p.key === presetKey} onChange={() => setPresetKey(p.key)} />
                  {p.title}
                </label>
              ))}
            </div>
          </fieldset>
          <p class="muted" style={{ fontSize: "var(--fs-sm)" }}>
            {custom ? "Свои начальные условия: тело перетащено, скорости сохранены. Сброс вернёт пресет." : preset.note}
          </p>
          <div class="toolbar" style={{ marginBottom: 0 }}>
            <button class="btn btn--primary" type="button" onClick={() => setPlaying(!playing)} disabled={readout.collided}>
              {playing ? "Пауза" : "Пуск"}
            </button>
            <button class="btn" type="button" onClick={() => reset()}>
              Сбросить
            </button>
          </div>
          <div class="field">
            <label class="field__label" for="tb-speed">
              Скорость воспроизведения: ×{num(speed, 2)}
            </label>
            <input id="tb-speed" type="range" min={0} max={SPEEDS.length - 1} step={1} value={SPEEDS.indexOf(speed)} onInput={(e) => setSpeed(SPEEDS[Number((e.target as HTMLInputElement).value)])} />
          </div>
          <div class="field">
            <span class="field__label">Отклонение двойника δ</span>
            <div class="segmented" role="group" aria-label="Отклонение двойника">
              {DELTAS.map((d) => (
                <button key={d} type="button" aria-pressed={delta === d} onClick={() => setDelta(d)}>
                  10{superscript(Math.log10(d))}
                </button>
              ))}
            </div>
          </div>
          <label class="tag" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={showTwin} onChange={() => setShowTwin(!showTwin)} /> показывать двойника
          </label>
          <label class="tag" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={showTrails} onChange={() => setShowTrails(!showTrails)} /> следы траекторий
          </label>
          <dl class="facts" aria-live="off">
            <dt>Время t</dt>
            <dd>{num(readout.t, 2)}</dd>
            <dt>Дрейф энергии |ΔE/E₀|</dt>
            <dd>{scientific(readout.dE)}</dd>
            <dt>Расхождение с двойником</dt>
            <dd>{scientific(readout.sep)}</dd>
          </dl>
          {readout.collided && (
            <p class="state state--wait" role="status">
              Два тела сблизились почти до столкновения, и расчёт остановлен на t = {num(readout.t, 3)}. Модель не умеет проходить столкновения (нет регуляризации). Нажмите «Сбросить».
            </p>
          )}
        </div>
      </div>

      <section class="section grid-2">
        <figure class="figure">
          <h3 class="figure__title">Как расходятся основная система и двойник</h3>
          <canvas ref={sepCanvas} class="tb__plot" aria-label="График расстояния между системой и двойником в фазовом пространстве, логарифмическая шкала" />
          <figcaption>
            Расстояние в фазовом пространстве (координаты и скорости) между двумя копиями, которые различались на δ в начале. Шкала логарифмическая: прямая линия — экспоненциальный рост.
            {preset.growth ? ` Тонкая серая линия — теория для треугольника Лагранжа, λ = ω/√2 ≈ ${num(preset.growth, 4)}.` : ""} Для устойчивой восьмёрки расхождение растёт медленно; для задачи Пифагора — скачками при тесных сближениях.
          </figcaption>
        </figure>
        <figure class="figure">
          <h3 class="figure__title">Насколько точно сохраняется энергия</h3>
          <canvas ref={energyCanvas} class="tb__plot" aria-label="График относительной ошибки энергии, логарифмическая шкала" />
          <figcaption>
            Относительный дрейф полной энергии |ΔE/E₀| основной системы. Точное решение сохраняет энергию, поэтому дрейф показывает накопленную ошибку численного метода. При допуске интегратора 10⁻¹³ он обычно остаётся
            около 10⁻¹² и ниже; рост к 10⁻⁵ означает тесное сближение, и тогда расчёт останавливается.
          </figcaption>
        </figure>
      </section>

      <section class="section grid-main-side">
        <div class="prose">
          <h2 style={{ marginBottom: "14px" }}>Почему поведение хаотическое</h2>
          <p>
            В хаотической системе сколь угодно малое различие начальных условий растёт экспоненциально: удваивается за одно и то же время, пока не станет сравнимым с размером системы. Двойник стартует с отклонением в одну
            миллиардную, и график слева показывает, сколько времени нужно, чтобы эта разница стала видна глазом. После этого предсказать положения тел по приблизительным начальным данным уже нельзя, хотя законы движения
            остаются строго детерминированными.
          </p>
          <p>
            Восьмёрка — редкий пример устойчивого периодического решения: ошибки не растут экспоненциально, и тела снова и снова проходят одну кривую. Треугольник Лагранжа тоже точное решение, но при равных массах
            неустойчив: отклонение растёт с показателем, который можно вычислить аналитически, и тест портала проверяет это до 0,2 %.
          </p>
          <h2 style={{ margin: "28px 0 14px" }}>Как считается</h2>
          <p>
            Уравнения Ньютона записаны для сторон треугольника между телами, а не для координат: при тесном сближении расстояние между телами вычисляется без вычитания близких больших чисел. Интегрирование —
            экстраполяция Грэгга — Булирша — Штёра с относительным допуском 10⁻¹³ и переменным шагом. Модель плоская, тела точечные, столкновения не регуляризуются.
          </p>
          <p class="muted">
            Численные проверки при сборке портала: точность интегратора на гармоническом осцилляторе, возврат восьмёрки через период и её симметрия, сохранение энергии и момента за 100 периодов, совпадение с независимым решением
            методом Рунге — Кутты, показатель неустойчивости треугольника Лагранжа и сходимость задачи Пифагора.
          </p>
        </div>
        <aside class="notice">
          Ядро расчёта и начальные условия периодических орбит адаптированы из{" "}
          <a href="https://github.com/KaiyuanGONG/formula-to-pixel" rel="noopener">
            formula-to-pixel
          </a>{" "}
          (Kaiyuan Gong, лицензия MIT). Интерфейс, визуализация и тексты переработаны для портала. Орбиты: Moore (1993), Chenciner, Montgomery (2000), Šuvakov, Dmitrašinović (2013), Burrau (1913).
        </aside>
      </section>
    </div>
  );
}
