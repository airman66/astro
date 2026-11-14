import type { TargetedKeyboardEvent } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { quadtree } from "d3-quadtree";
import type { CatalogPoint } from "../api/types";
import { navigate } from "../router";
import { declination, lightYears, num, rightAscension } from "../lib/format";
import { useThemeColors, useWidth } from "../lib/hooks";

interface System {
  host: string;
  ra: number;
  dec: number;
  distance: number | null;
  planets: CatalogPoint[];
  candidates: CatalogPoint[];
}

/** Проекция Хаммера (равновеликая). λ отсчитывается так, что прямое восхождение растёт влево, как на небе. */
function hammer(raDeg: number, decDeg: number): [number, number] {
  const lambda = (-(raDeg - 180) * Math.PI) / 180;
  const phi = (decDeg * Math.PI) / 180;
  const d = Math.sqrt(1 + Math.cos(phi) * Math.cos(lambda / 2));
  return [(2 * Math.SQRT2 * Math.cos(phi) * Math.sin(lambda / 2)) / d, (Math.SQRT2 * Math.sin(phi)) / d];
}

export function SkyMap({ points }: { points: CatalogPoint[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState<System | null>(null);
  const colors = useThemeColors(["--point-context", "--ink", "--paper"]);
  const height = Math.round(Math.max(200, Math.min(width / 2, 520)));
  const systems = useMemo(() => {
    const map = new Map<string, System>();
    for (const p of points) {
      if (p.rightAscensionDegrees === null || p.declinationDegrees === null) continue;
      const key = p.hostName ?? p.name;
      const system = map.get(key) ?? { host: key, ra: p.rightAscensionDegrees, dec: p.declinationDegrees, distance: p.distanceParsec, planets: [], candidates: [] };
      system.planets.push(p);
      if (p.eligible) system.candidates.push(p);
      map.set(key, system);
    }
    return [...map.values()];
  }, [points]);

  const project = useMemo(() => {
    const sx = (width - 8) / (4 * Math.SQRT2);
    const sy = (height - 8) / (2 * Math.SQRT2);
    const s = Math.min(sx, sy);
    return (ra: number, dec: number): [number, number] => {
      const [x, y] = hammer(ra, dec);
      return [width / 2 + x * s, height / 2 - y * s];
    };
  }, [width, height]);

  const placed = useMemo(() => systems.map((system) => ({ system, xy: project(system.ra, system.dec) })), [systems, project]);
  const tree = useMemo(
    () =>
      quadtree<(typeof placed)[number]>()
        .x((d) => d.xy[0])
        .y((d) => d.xy[1])
        .addAll(placed),
    [placed],
  );

  useEffect(() => {
    const element = canvas.current;
    if (!element || !width) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    element.width = Math.round(width * ratio);
    element.height = Math.round(height * ratio);
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    const ctx = element.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = colors["--point-context"];
    for (const item of placed) {
      if (item.system.candidates.length) continue;
      ctx.beginPath();
      ctx.arc(item.xy[0], item.xy[1], 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const item of placed) {
      if (!item.system.candidates.length) continue;
      ctx.beginPath();
      ctx.arc(item.xy[0], item.xy[1], 4.5, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = colors["--paper"];
      ctx.stroke();
      ctx.fillStyle = colors["--ink"];
      ctx.fill();
    }
  }, [placed, width, height, colors]);

  const graticule = useMemo(() => {
    if (!width) return [];
    const lines: string[] = [];
    for (let dec = -60; dec <= 60; dec += 30) {
      const parts: string[] = [];
      for (let ra = 0; ra <= 360; ra += 4) {
        const [x, y] = project(Math.min(ra, 359.999), dec);
        parts.push(`${parts.length ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`);
      }
      lines.push(parts.join(" "));
    }
    for (let ra = 0; ra < 360; ra += 30) {
      const parts: string[] = [];
      for (let dec = -90; dec <= 90; dec += 3) {
        const [x, y] = project(ra === 0 ? 0.001 : ra, dec);
        parts.push(`${parts.length ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`);
      }
      lines.push(parts.join(" "));
    }
    return lines;
  }, [project, width]);

  const candidates = useMemo(() => placed.filter((item) => item.system.candidates.length).sort((a, b) => a.xy[0] - b.xy[0]), [placed]);

  if (!width) return <div ref={ref} class="figure__plot" style={{ height: "280px" }} />;

  const pick = (event: PointerEvent | MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return tree.find(event.clientX - rect.left, event.clientY - rect.top, 14)?.system ?? null;
  };
  const onKey = (event: TargetedKeyboardEvent<HTMLDivElement>) => {
    if (!candidates.length) return;
    const index = active ? candidates.findIndex((item) => item.system.host === active.host) : -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      setActive(candidates[(index + 1) % candidates.length].system);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive(candidates[(index - 1 + candidates.length) % candidates.length].system);
    } else if (event.key === "Enter" && active?.candidates[0]) {
      navigate(`/planets/${encodeURIComponent(active.candidates[0].name)}`);
    } else if (event.key === "Escape") setActive(null);
  };
  const xy = active ? project(active.ra, active.dec) : null;
  const outline = (() => {
    const parts: string[] = [];
    for (let dec = -90; dec <= 90; dec += 2) {
      const [x, y] = project(359.999, dec);
      parts.push(`${parts.length ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    for (let dec = 90; dec >= -90; dec -= 2) {
      const [x, y] = project(0.001, dec);
      parts.push(`L${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return `${parts.join(" ")} Z`;
  })();

  return (
    <div
      ref={ref}
      class="figure__plot"
      style={{ height: `${height}px` }}
      tabIndex={0}
      role="group"
      aria-label="Карта неба: направления на звёздные системы с экзопланетами. Стрелки перебирают системы с кандидатами."
      onPointerMove={(event) => event.pointerType !== "touch" && setActive(pick(event))}
      onPointerLeave={() => setActive(null)}
      onClick={(event) => {
        const system = pick(event);
        if (system && active?.host === system.host && system.candidates[0]) navigate(`/planets/${encodeURIComponent(system.candidates[0].name)}`);
        else setActive(system);
      }}
      onKeyDown={onKey}
    >
      <svg class="layer" width={width} height={height} aria-hidden="true">
        <path d={outline} fill="var(--plate)" stroke="var(--rule-strong)" />
        <g class="grid">
          {graticule.map((d, index) => (
            <path key={index} d={d} fill="none" stroke="var(--rule)" />
          ))}
        </g>
        {[0, 6, 12, 18].map((hours) => {
          const [x, y] = project(hours === 0 ? 0.01 : hours * 15, 0);
          return (
            <text key={hours} class="chart-label" x={x + (hours === 0 ? -4 : 4)} y={y - 4} text-anchor={hours === 0 ? "end" : "start"}>
              {hours} ч
            </text>
          );
        })}
        {[-60, -30, 30, 60].map((dec) => {
          const [x, y] = project(180, dec);
          return (
            <text key={dec} class="chart-label" x={x + 4} y={y + 4}>
              {dec > 0 ? `+${dec}°` : `−${-dec}°`}
            </text>
          );
        })}
      </svg>
      <canvas ref={canvas} class="layer" aria-hidden="true" />
      {xy && <svg class="layer" width={width} height={height} aria-hidden="true" style={{ pointerEvents: "none" }}><circle cx={xy[0]} cy={xy[1]} r={9} fill="none" stroke="var(--focus)" stroke-width={2} /></svg>}
      {active && xy && (
        <div class="tooltip" role="status" style={{ left: `${Math.min(Math.max(4, xy[0] + 12), width - 240)}px`, top: `${xy[1] > height / 2 ? xy[1] - 130 : xy[1] + 12}px` }}>
          <strong>{active.host}</strong>
          <dl>
            <dt>Прямое восхождение</dt>
            <dd>{rightAscension(active.ra)}</dd>
            <dt>Склонение</dt>
            <dd>{declination(active.dec)}</dd>
            <dt>Расстояние</dt>
            <dd>{active.distance !== null ? `${num(active.distance, 1)} пк, ${lightYears(active.distance)}` : "—"}</dd>
            <dt>Планет</dt>
            <dd>{active.planets.length}</dd>
          </dl>
          {active.candidates.length > 0 && <p style={{ marginTop: "6px" }}>Кандидаты: {active.candidates.map((c) => c.name).join(", ")}</p>}
        </div>
      )}
    </div>
  );
}
