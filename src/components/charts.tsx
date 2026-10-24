import { activeLocale } from '../i18n/languages';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Width of an element, tracked with ResizeObserver (falls back to `initial` when there is no layout, e.g. in tests). */
export function useWidth<T extends HTMLElement>(initial = 640) {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => { const x = el.getBoundingClientRect().width; if (x > 0) setW(Math.round(x)); };
    set();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function niceMax(v: number, ticks = 4): { max: number; step: number } {
  if (!(v > 0)) return { max: 1, step: 1 };
  const raw = v / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  return { max: Math.ceil(v / step) * step, step };
}

export const eur0 = (n: number) => {
  const whole = Math.abs(n - Math.round(n)) < 0.005;
  return new Intl.NumberFormat(activeLocale(), { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(n);
};

/* ---------- horizontal bars (HTML, so labels wrap and it works at phone width) ---------- */
export interface BarRow {
  id: string;
  label: string;
  sub?: string;
  value: number | null;
  valueText: string;
  /** solid = verified figure; false = unverified estimate (lighter fill, dashed edge) */
  solid?: boolean;
  selected?: boolean;
  tip?: ReactNode;
  onClick?: () => void;
  badge?: ReactNode;
}
export function BarChart({ rows, ariaLabel, max }: { rows: BarRow[]; ariaLabel: string; max?: number }) {
  const m = max ?? Math.max(1e-9, ...rows.map((r) => r.value ?? 0));
  return (
    <div className="bars" role="list" aria-label={ariaLabel}>
      {rows.map((r) => {
        const pct = r.value === null ? 0 : Math.max(1.5, (r.value / m) * 100);
        const inner = (
          <>
            <span className="bar-label"><strong>{r.label}</strong>{r.sub && <span className="muted small"> {r.sub}</span>}</span>
            <span className="bar-track"><span className={`bar-fill ${r.solid === false ? 'est' : ''} ${r.selected ? 'sel' : ''}`} style={{ width: `${pct}%` }} /></span>
            <span className="bar-val">{r.valueText}</span>
            {r.badge}
            {r.tip && <span className="tip" role="tooltip">{r.tip}</span>}
          </>
        );
        return r.onClick ? (
          <button key={r.id} role="listitem" className={`bar-row ${r.selected ? 'selected' : ''}`} onClick={r.onClick}>{inner}</button>
        ) : (
          <div key={r.id} role="listitem" tabIndex={0} className={`bar-row ${r.selected ? 'selected' : ''}`}>{inner}</div>
        );
      })}
    </div>
  );
}

/* ---------- stacked single bar (parts of a whole) ---------- */
export interface Seg { id: string; label: string; value: number; color: string }
export function StackedBar({ segs, ariaLabel, fmt }: { segs: Seg[]; ariaLabel: string; fmt?: (n: number) => string }) {
  const total = segs.reduce((a, s) => a + s.value, 0);
  if (total <= 0) return null;
  return (
    <div>
      <div className="stack-bar" role="img" aria-label={ariaLabel}>
        {segs.filter((s) => s.value > 0).map((s) => (
          <span key={s.id} className="stack-seg" style={{ flexGrow: s.value, background: s.color }} tabIndex={0}>
            <span className="tip" role="tooltip">{s.label}: {fmt ? fmt(s.value) : s.value} ({Math.round((s.value / total) * 100)}%)</span>
          </span>
        ))}
      </div>
      <ul className="legend">{segs.filter((s) => s.value > 0).map((s) => <li key={s.id}><i style={{ background: s.color }} />{s.label} <span className="muted">{fmt ? fmt(s.value) : s.value}</span></li>)}</ul>
    </div>
  );
}

/* ---------- scatter: price vs transit time ---------- */
export interface Dot { id: string; x: number; y: number; label: string; solid: boolean; selected?: boolean; showLabel?: boolean; tip: ReactNode; onClick?: () => void }
export function ScatterChart({ dots, xTitle, yTitle, ariaLabel, xFmt, legend }: { dots: Dot[]; xTitle: string; yTitle: string; ariaLabel: string; xFmt?: (n: number) => string; legend?: ReactNode }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const H = 300, M = { l: 44, r: 16, t: 14, b: 42 };
  const iw = Math.max(120, w - M.l - M.r), ih = H - M.t - M.b;
  const xs = niceMax(Math.max(1, ...dots.map((d) => d.x)) * 1.05, 5);
  const ys = niceMax(Math.max(1, ...dots.map((d) => d.y)) * 1.08, 4);
  const sx = (v: number) => M.l + (v / xs.max) * iw, sy = (v: number) => M.t + ih - (v / ys.max) * ih;
  const yt: number[] = []; for (let v = 0; v <= ys.max + 1e-9; v += ys.step) yt.push(v);
  const xt: number[] = []; for (let v = 0; v <= xs.max + 1e-9; v += xs.step) xt.push(v);
  const h = dots.find((d) => d.id === hover);
  return (
    <div className="chart" ref={ref} style={{ position: 'relative' }}>
      <svg width={w} height={H} role="img" aria-label={ariaLabel}>
        {yt.map((v) => <g key={`y${v}`}><line x1={M.l} x2={M.l + iw} y1={sy(v)} y2={sy(v)} className="grid" /><text x={M.l - 6} y={sy(v) + 4} textAnchor="end" className="tick">{eur0(v)}</text></g>)}
        {xt.map((v) => <text key={`x${v}`} x={sx(v)} y={M.t + ih + 16} textAnchor="middle" className="tick">{xFmt ? xFmt(v) : v}</text>)}
        <text x={M.l + iw / 2} y={H - 6} textAnchor="middle" className="axis-title">{xTitle}</text>
        <text transform={`translate(12 ${M.t + ih / 2}) rotate(-90)`} textAnchor="middle" className="axis-title">{yTitle}</text>
        {dots.map((d) => (
          <g key={d.id}>
            <circle cx={sx(d.x)} cy={sy(d.y)} r={14} fill="transparent" style={{ cursor: d.onClick ? 'pointer' : 'default' }}
              onMouseEnter={() => setHover(d.id)} onMouseLeave={() => setHover(null)} onClick={d.onClick} />
            <circle cx={sx(d.x)} cy={sy(d.y)} r={d.selected || hover === d.id ? 8 : 6.5} className={`dot ${d.solid ? 'solid' : 'est'} ${d.selected ? 'sel' : ''}`} pointerEvents="none" />
            {(d.showLabel || hover === d.id) && <text x={Math.min(sx(d.x) + 10, M.l + iw - 4)} y={sy(d.y) - 10} textAnchor={sx(d.x) + 10 > M.l + iw - 80 ? 'end' : 'start'} className="dlabel">{d.label}</text>}
          </g>
        ))}
      </svg>
      {h && <div className="tipbox" style={{ left: Math.min(Math.max(sx(h.x), 70), w - 70), top: sy(h.y) + 14 }}>{h.tip}</div>}
      {legend}
    </div>
  );
}

/* ---------- line chart: stepwise price curves over weight ---------- */
export interface LineSeries { id: string; name: string; color: string; pts: { x: number; y: number | null }[] }
export function LineChart({ series, xTitle, yTitle, ariaLabel, marker, markerLabel, xFmt, tipFor }: { series: LineSeries[]; xTitle: string; yTitle: string; ariaLabel: string; marker?: number; markerLabel?: string; xFmt?: (n: number) => string; tipFor?: (x: number, vals: { name: string; color: string; y: number | null }[]) => ReactNode }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hx, setHx] = useState<number | null>(null);
  const H = 300, M = { l: 44, r: 14, t: 14, b: 42 };
  const iw = Math.max(120, w - M.l - M.r), ih = H - M.t - M.b;
  const all = series.flatMap((s) => s.pts);
  const xmax = Math.max(1, ...all.map((p) => p.x));
  const ys = niceMax(Math.max(1, ...all.map((p) => p.y ?? 0)) * 1.05, 4);
  const xs = niceMax(xmax, 5);
  const sx = (v: number) => M.l + (v / xs.max) * iw, sy = (v: number) => M.t + ih - (v / ys.max) * ih;
  const yt: number[] = []; for (let v = 0; v <= ys.max + 1e-9; v += ys.step) yt.push(v);
  const xt: number[] = []; for (let v = 0; v <= xs.max + 1e-9; v += xs.step) xt.push(v);
  // step-after path, broken where the price is missing
  const path = (s: LineSeries) => {
    let d = ''; let prev: { x: number; y: number } | null = null;
    for (const p of s.pts) {
      if (p.y === null) { prev = null; continue; }
      if (!prev) d += `M${sx(p.x)} ${sy(p.y)}`; else d += `L${sx(p.x)} ${sy(prev.y)}L${sx(p.x)} ${sy(p.y)}`;
      prev = { x: p.x, y: p.y };
    }
    return d;
  };
  const xsAll = [...new Set(all.map((p) => p.x))].sort((a, b) => a - b);
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const v = ((e.clientX - r.left) / r.width) * xs.max;
    setHx(xsAll.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), xsAll[0]));
  };
  const vals = hx === null ? [] : series.map((s) => ({ name: s.name, color: s.color, y: s.pts.find((p) => p.x === hx)?.y ?? null }));
  return (
    <div className="chart" ref={ref} style={{ position: 'relative' }}>
      <svg width={w} height={H} role="img" aria-label={ariaLabel}>
        {yt.map((v) => <g key={`y${v}`}><line x1={M.l} x2={M.l + iw} y1={sy(v)} y2={sy(v)} className="grid" /><text x={M.l - 6} y={sy(v) + 4} textAnchor="end" className="tick">{eur0(v)}</text></g>)}
        {xt.map((v) => <text key={`x${v}`} x={sx(v)} y={M.t + ih + 16} textAnchor="middle" className="tick">{xFmt ? xFmt(v) : v}</text>)}
        <text x={M.l + iw / 2} y={H - 6} textAnchor="middle" className="axis-title">{xTitle}</text>
        <text transform={`translate(12 ${M.t + ih / 2}) rotate(-90)`} textAnchor="middle" className="axis-title">{yTitle}</text>
        {marker !== undefined && marker <= xs.max && <g><line x1={sx(marker)} x2={sx(marker)} y1={M.t} y2={M.t + ih} className="marker" /><text x={sx(marker) + 4} y={M.t + 11} className="dlabel">{markerLabel}</text></g>}
        {series.map((s) => <path key={s.id} d={path(s)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />)}
        {hx !== null && <line x1={sx(hx)} x2={sx(hx)} y1={M.t} y2={M.t + ih} className="cross" />}
        {hx !== null && vals.filter((v) => v.y !== null).map((v) => <circle key={v.name} cx={sx(hx)} cy={sy(v.y!)} r={4.5} fill={v.color} className="ring" />)}
        <rect x={M.l} y={M.t} width={iw} height={ih} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHx(null)} style={{ touchAction: 'pan-y' }} />
      </svg>
      {hx !== null && <div className="tipbox" style={{ left: Math.min(Math.max(sx(hx), 90), w - 90), top: M.t + 8 }}>{tipFor ? tipFor(hx, vals) : null}</div>}
      <ul className="legend">{series.map((s) => <li key={s.id}><i style={{ background: s.color }} />{s.name}</li>)}</ul>
    </div>
  );
}
