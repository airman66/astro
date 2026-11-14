import type { ComponentChildren, TargetedKeyboardEvent, TargetedMouseEvent, TargetedPointerEvent } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { quadtree } from "d3-quadtree";
import { scaleLinear, scaleLog, type ScaleContinuousNumeric } from "d3-scale";
import { useThemeColors, useWidth } from "../lib/hooks";

export type PointKind = "context" | "zone" | "candidate" | "highlight";

export interface ScatterPoint<T = unknown> {
  id: string;
  x: number;
  y: number;
  kind: PointKind;
  data: T;
}

export interface Scales {
  x: ScaleContinuousNumeric<number, number>;
  y: ScaleContinuousNumeric<number, number>;
  width: number;
  height: number;
  inner: { left: number; top: number; right: number; bottom: number };
}

interface Props<T> {
  points: ScatterPoint<T>[];
  xDomain: [number, number];
  yDomain: [number, number];
  xLog?: boolean;
  yLog?: boolean;
  xReverse?: boolean;
  xLabel: string;
  yLabel: string;
  /** Короткие подписи осей для экранов уже 560 px. */
  xLabelShort?: string;
  yLabelShort?: string;
  xTicks: number[];
  yTicks: number[];
  xFormat: (value: number) => string;
  yFormat: (value: number) => string;
  height?: number;
  ariaLabel: string;
  background?: (scales: Scales) => ComponentChildren;
  foreground?: (scales: Scales) => ComponentChildren;
  tooltip: (point: ScatterPoint<T>) => ComponentChildren;
  onSelect?: (point: ScatterPoint<T>) => void;
  keyboardKinds?: PointKind[];
}

const MARGIN = { top: 14, right: 18, bottom: 46, left: 58 };
const RADIUS: Record<PointKind, number> = { context: 1.7, zone: 2.6, candidate: 4.2, highlight: 6 };

export function Scatter<T>(props: Props<T>) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState<ScatterPoint<T> | null>(null);
  const [sticky, setSticky] = useState(false);
  const colors = useThemeColors(["--point-context", "--series-blue", "--ink", "--paper", "--zone-cons"]);
  const narrow = width > 0 && width < 560;
  const height = props.height ?? (narrow ? 360 : 460);
  const margin = narrow ? { ...MARGIN, left: 52, right: 10 } : MARGIN;

  const scales = useMemo<Scales | null>(() => {
    if (!width) return null;
    const range: [number, number] = props.xReverse ? [width - margin.right, margin.left] : [margin.left, width - margin.right];
    const x = (props.xLog ? scaleLog() : scaleLinear()).domain(props.xDomain).range(range).clamp(false);
    const y = (props.yLog ? scaleLog() : scaleLinear()).domain(props.yDomain).range([height - margin.bottom, margin.top]);
    return { x, y, width, height, inner: { left: margin.left, top: margin.top, right: width - margin.right, bottom: height - margin.bottom } };
  }, [width, height, props.xDomain[0], props.xDomain[1], props.yDomain[0], props.yDomain[1], props.xLog, props.yLog, props.xReverse, narrow]);

  const visible = useMemo(() => {
    if (!scales) return [];
    const [x0, x1] = props.xDomain;
    const [y0, y1] = props.yDomain;
    return props.points
      .filter((p) => p.x >= Math.min(x0, x1) && p.x <= Math.max(x0, x1) && p.y >= Math.min(y0, y1) && p.y <= Math.max(y0, y1))
      .map((p) => ({ point: p, px: scales.x(p.x), py: scales.y(p.y) }));
  }, [props.points, scales]);

  const tree = useMemo(
    () =>
      quadtree<(typeof visible)[number]>()
        .x((d) => d.px)
        .y((d) => d.py)
        .addAll(visible),
    [visible],
  );

  useEffect(() => {
    const element = canvas.current;
    if (!element || !scales) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    element.width = Math.round(scales.width * ratio);
    element.height = Math.round(scales.height * ratio);
    element.style.width = `${scales.width}px`;
    element.style.height = `${scales.height}px`;
    const ctx = element.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, scales.width, scales.height);
    const order: PointKind[] = ["context", "zone", "candidate", "highlight"];
    for (const kind of order) {
      const fill = kind === "context" ? colors["--point-context"] : kind === "zone" ? colors["--series-blue"] : colors["--ink"];
      ctx.fillStyle = fill;
      ctx.globalAlpha = kind === "context" ? 0.55 : 1;
      const r = RADIUS[kind] * (narrow && kind !== "context" ? 0.9 : 1);
      for (const item of visible) {
        if (item.point.kind !== kind) continue;
        ctx.beginPath();
        ctx.arc(item.px, item.py, r, 0, Math.PI * 2);
        if (kind === "candidate" || kind === "highlight") {
          // 2px кольцо цвета поверхности отделяет перекрывающиеся метки.
          ctx.lineWidth = 2;
          ctx.strokeStyle = colors["--paper"];
          ctx.stroke();
        }
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }, [visible, scales, colors, narrow]);

  const keyboardPoints = useMemo(() => {
    const kinds = props.keyboardKinds ?? ["candidate", "highlight"];
    return visible.filter((item) => kinds.includes(item.point.kind)).sort((a, b) => a.px - b.px);
  }, [visible, props.keyboardKinds]);

  if (!scales) return <div ref={ref} class="figure__plot" style={{ height: `${height}px` }} />;

  const nearest = (event: PointerEvent | MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const found = tree.find(event.clientX - rect.left, event.clientY - rect.top, 16);
    return found?.point ?? null;
  };

  const onMove = (event: TargetedPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" || sticky) return;
    setActive(nearest(event));
  };

  const onClick = (event: TargetedMouseEvent<HTMLDivElement>) => {
    const point = nearest(event);
    if (!point) {
      setActive(null);
      setSticky(false);
      return;
    }
    if (active?.id === point.id && props.onSelect) props.onSelect(point);
    else {
      setActive(point);
      setSticky((event as unknown as PointerEvent).pointerType === "touch");
    }
  };

  const onKey = (event: TargetedKeyboardEvent<HTMLDivElement>) => {
    if (!keyboardPoints.length) return;
    const index = active ? keyboardPoints.findIndex((item) => item.point.id === active.id) : -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      setActive(keyboardPoints[(index + 1) % keyboardPoints.length].point);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive(keyboardPoints[(index - 1 + keyboardPoints.length) % keyboardPoints.length].point);
    } else if (event.key === "Enter" && active && props.onSelect) {
      props.onSelect(active);
    } else if (event.key === "Escape") {
      setActive(null);
    }
  };

  const activePx = active ? { x: scales.x(active.x), y: scales.y(active.y) } : null;
  const tipLeft = activePx ? Math.min(Math.max(activePx.x + 14, 4), scales.width - 230) : 0;
  const tipTop = activePx ? (activePx.y > scales.height * 0.55 ? activePx.y - 150 : activePx.y + 14) : 0;

  return (
    <div
      ref={ref}
      class="figure__plot"
      style={{ height: `${height}px` }}
      tabIndex={0}
      role="group"
      aria-label={`${props.ariaLabel}. Стрелки перебирают выделенные точки, Enter открывает карточку.`}
      onPointerMove={onMove}
      onPointerLeave={() => !sticky && setActive(null)}
      onClick={onClick}
      onKeyDown={onKey}
      onBlur={() => !sticky && setActive(null)}
    >
      <svg class="layer" width={scales.width} height={scales.height} aria-hidden="true">
        <g class="grid">
          {props.xTicks.map((tick) => (
            <line key={`gx${tick}`} x1={scales.x(tick)} x2={scales.x(tick)} y1={scales.inner.top} y2={scales.inner.bottom} />
          ))}
          {props.yTicks.map((tick) => (
            <line key={`gy${tick}`} x1={scales.inner.left} x2={scales.inner.right} y1={scales.y(tick)} y2={scales.y(tick)} />
          ))}
        </g>
        {props.background?.(scales)}
        <g class="axis">
          <line x1={scales.inner.left} x2={scales.inner.right} y1={scales.inner.bottom} y2={scales.inner.bottom} />
          {props.xTicks.map((tick) => (
            <text key={`tx${tick}`} x={scales.x(tick)} y={scales.inner.bottom + 18} text-anchor="middle">
              {props.xFormat(tick)}
            </text>
          ))}
          {props.yTicks.map((tick) => (
            <text key={`ty${tick}`} x={scales.inner.left - 8} y={scales.y(tick) + 4} text-anchor="end">
              {props.yFormat(tick)}
            </text>
          ))}
        </g>
        <text class="axis-title" x={(scales.inner.left + scales.inner.right) / 2} y={scales.height - 6} text-anchor="middle">
          {narrow && props.xLabelShort ? props.xLabelShort : props.xLabel}
        </text>
        <text class="axis-title" transform={`translate(13 ${(scales.inner.top + scales.inner.bottom) / 2}) rotate(-90)`} text-anchor="middle">
          {narrow && props.yLabelShort ? props.yLabelShort : props.yLabel}
        </text>
      </svg>
      <canvas ref={canvas} class="layer" aria-hidden="true" />
      <svg class="layer" width={scales.width} height={scales.height} aria-hidden="true" style={{ pointerEvents: "none" }}>
        {props.foreground?.(scales)}
        {activePx && <circle cx={activePx.x} cy={activePx.y} r={9} fill="none" stroke="var(--focus)" stroke-width={2} />}
      </svg>
      {active && (
        <div class="tooltip" style={{ left: `${tipLeft}px`, top: `${Math.max(4, tipTop)}px` }} role="status">
          {props.tooltip(active)}
        </div>
      )}
    </div>
  );
}

/** Для логарифмических осей: «удобные» деления в пределах домена. */
export function logTicks(min: number, max: number, steps = [1, 2, 5]): number[] {
  const result: number[] = [];
  for (let exponent = Math.floor(Math.log10(min)); exponent <= Math.ceil(Math.log10(max)); exponent++) {
    for (const step of steps) {
      const value = step * 10 ** exponent;
      if (value >= min * 0.999 && value <= max * 1.001) result.push(Number(value.toPrecision(6)));
    }
  }
  return result;
}
