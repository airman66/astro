import { describe, expect, it } from "vitest";
import { angularMomentum, bulirschStoer, collinear, energy, lagrange, LAGRANGE_OMEGA, ORBITS, pythagorean, separation, System, toRelative } from "./physics";

/** Независимая реализация: ньютоновская гравитация в декартовых координатах, классический RK4. */
function rk4(y0: number[], m: number[], tEnd: number, steps: number): number[] {
  const accel = (y: number[]) => {
    const d = new Array(12).fill(0);
    for (let i = 0; i < 3; i++) {
      d[2 * i] = y[6 + 2 * i];
      d[2 * i + 1] = y[7 + 2 * i];
      for (let j = 0; j < 3; j++) {
        if (i === j) continue;
        const dx = y[2 * j] - y[2 * i];
        const dy = y[2 * j + 1] - y[2 * i + 1];
        const r3 = Math.pow(dx * dx + dy * dy, 1.5);
        d[6 + 2 * i] += (m[j] * dx) / r3;
        d[7 + 2 * i] += (m[j] * dy) / r3;
      }
    }
    return d;
  };
  let y = [...y0];
  const h = tEnd / steps;
  for (let n = 0; n < steps; n++) {
    const k1 = accel(y);
    const k2 = accel(y.map((v, i) => v + (h / 2) * k1[i]));
    const k3 = accel(y.map((v, i) => v + (h / 2) * k2[i]));
    const k4 = accel(y.map((v, i) => v + h * k3[i]));
    y = y.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
  }
  return y;
}

/** Энергия по определению: кинетическая в системе центра масс плюс попарная потенциальная. */
function inertialEnergy(y: number[], m: number[]): number {
  const M = m[0] + m[1] + m[2];
  const vx = (m[0] * y[6] + m[1] * y[8] + m[2] * y[10]) / M;
  const vy = (m[0] * y[7] + m[1] * y[9] + m[2] * y[11]) / M;
  let E = 0;
  for (let i = 0; i < 3; i++) E += 0.5 * m[i] * ((y[6 + 2 * i] - vx) ** 2 + (y[7 + 2 * i] - vy) ** 2);
  for (let i = 0; i < 3; i++)
    for (let j = i + 1; j < 3; j++) E -= (m[i] * m[j]) / Math.hypot(y[2 * i] - y[2 * j], y[2 * i + 1] - y[2 * j + 1]);
  return E;
}

const maxDiff = (a: ArrayLike<number>, b: ArrayLike<number>, n = 12) => {
  let d = 0;
  for (let i = 0; i < n; i++) d = Math.max(d, Math.abs(a[i] - b[i]));
  return d;
};

describe("интегратор Грэгга — Булирша — Штёра", () => {
  it("гармонический осциллятор за 10 периодов совпадает с cos t до 1e-11", () => {
    const step = bulirschStoer((y, d) => {
      d[0] = y[1];
      d[1] = -y[0];
    }, 2, 1e-13);
    const y = Float64Array.of(1, 0);
    const tEnd = 20 * Math.PI;
    let t = 0;
    let H = 0.1;
    while (t < tEnd) {
      const want = tEnd - t;
      const clip = H >= want;
      const r = step(y, clip ? want : H);
      t = clip && r.h === want ? tEnd : t + r.h;
      if (!(clip && r.h === want)) H = r.next;
    }
    expect(Math.max(Math.abs(y[0] - 1), Math.abs(y[1]))).toBeLessThan(1e-11);
  });
});

describe("восьмёрка", () => {
  const o = ORBITS.eight;
  const y0 = collinear(o.p[0], o.p[1]);

  it("возвращается в начальное состояние через период T", () => {
    const y = new System(y0, [1, 1, 1]).advance(o.T).inertial();
    expect(maxDiff(y, y0)).toBeLessThan(1e-10);
  });

  it("является хореографией: за T/3 тела 1, 2, 3 приходят в стартовые точки тел 2, 3, 1", () => {
    const y = new System(y0, [1, 1, 1]).advance(o.T / 3).inertial();
    const perm = [1, 2, 0];
    let dev = 0;
    for (let i = 0; i < 3; i++) for (let c = 0; c < 2; c++) dev = Math.max(dev, Math.abs(y[2 * i + c] - y0[2 * perm[i] + c]));
    expect(dev).toBeLessThan(1e-10);
  });

  it("за 100 периодов дрейф энергии меньше 1e-9, а момент импульса остаётся нулевым", () => {
    const s = new System(y0, [1, 1, 1]).advance(100 * o.T);
    expect(s.energyError()).toBeLessThan(1e-9);
    expect(Math.abs(angularMomentum(s.s, s.m))).toBeLessThan(1e-11);
  });

  it("совпадает с независимым решением ньютоновских уравнений методом RK4", () => {
    const reference = rk4(y0, [1, 1, 1], o.T / 2, 40000);
    const y = new System(y0, [1, 1, 1]).advance(o.T / 2).inertial();
    expect(maxDiff(y, reference, 6)).toBeLessThan(1e-8);
  });
});

describe("энергия", () => {
  it("формула через стороны треугольника равна определению в декартовых координатах", () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    for (let trial = 0; trial < 20; trial++) {
      const y = Array.from({ length: 12 }, random);
      const m = [0.5 + Math.abs(random()), 0.5 + Math.abs(random()), 0.5 + Math.abs(random())];
      const { s } = toRelative(y, m);
      expect(Math.abs(energy(s, m) - inertialEnergy(y, m))).toBeLessThan(1e-12 * Math.max(1, Math.abs(inertialEnergy(y, m))));
    }
  });
});

describe("треугольник Лагранжа", () => {
  it("до развития неустойчивости вращается как целое с угловой скоростью ω", () => {
    const y0 = lagrange();
    const t = 2;
    const y = new System(y0, [1, 1, 1]).advance(t).inertial();
    const angle = LAGRANGE_OMEGA * t;
    let dev = 0;
    for (let i = 0; i < 3; i++) {
      // Вращение против часовой стрелки: в точке (0, 1) скорость первого тела направлена по −x.
      const x = y0[2 * i] * Math.cos(angle) - y0[2 * i + 1] * Math.sin(angle);
      const z = y0[2 * i] * Math.sin(angle) + y0[2 * i + 1] * Math.cos(angle);
      dev = Math.max(dev, Math.abs(y[2 * i] - x), Math.abs(y[2 * i + 1] - z));
    }
    expect(dev).toBeLessThan(1e-9);
  });

  it("малое отклонение растёт с показателем λ = ω/√2 (в пределах 0,2 %)", () => {
    const a = new System(lagrange(), [1, 1, 1]);
    const yb = lagrange();
    yb[0] += 1e-9;
    yb[7] -= 3e-10;
    const b = new System(yb, [1, 1, 1]);
    let n = 0;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    for (let t = 0.5; t <= 34; t += 0.5) {
      a.advance(t);
      b.advance(t);
      const d = separation(a.inertial(), b.inertial());
      if (d > 1e-6 && d < 1e-2) {
        const l = Math.log(d);
        n++;
        sx += t;
        sy += l;
        sxx += t * t;
        sxy += t * l;
      }
    }
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    expect(Math.abs(slope / (LAGRANGE_OMEGA / Math.SQRT2) - 1)).toBeLessThan(2e-3);
  });
});

describe("задача Пифагора", () => {
  it("результат сходится при уменьшении допуска с 1e-13 до 1e-14", () => {
    const run = (tol: number) => {
      const p = pythagorean();
      const s = new System(p.y, p.m, tol);
      let dmin = Infinity;
      let tmin = 0;
      s.advance(70, (q) => {
        for (let k = 0; k < 3; k++) {
          const d = Math.hypot(q.s[2 * k], q.s[2 * k + 1]);
          if (d < dmin) {
            dmin = d;
            tmin = q.t;
          }
        }
      });
      const y = s.inertial();
      return { d: dmin, t: tmin, x: y[0], y: y[1], dE: s.energyError() };
    };
    const a = run(1e-13);
    const b = run(1e-14);
    const pos = Math.hypot(a.x - b.x, a.y - b.y) / Math.hypot(b.x, b.y);
    expect(Math.abs(a.d / b.d - 1)).toBeLessThan(5e-3);
    expect(Math.abs(a.t - b.t)).toBeLessThan(1e-4);
    expect(pos).toBeLessThan(0.01);
    expect(a.dE).toBeLessThan(1e-8);
    // Самое лёгкое тело (масса 3) выброшено далеко вверх.
    expect(b.y).toBeGreaterThan(15);
  });
});

describe("производительность", () => {
  it("десять периодов восьмёрки считаются быстрее, чем за секунду", () => {
    const o = ORBITS.eight;
    const started = performance.now();
    new System(collinear(o.p[0], o.p[1]), [1, 1, 1]).advance(10 * o.T);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
