import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { n } from '../lib.jsx';

// Smooth path through points (monotone-ish cubic using Catmull-Rom → Bézier).
function smooth(pts) {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const t = 0.18;
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t];
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t];
    // clamp control points between neighbours so the curve never overshoots below zero
    const lo = Math.min(p1[1], p2[1]), hi = Math.max(p1[1], p2[1]);
    const cl = (v) => Math.max(lo, Math.min(hi, v));
    d += ` C${c1[0]},${cl(c1[1])} ${c2[0]},${cl(c2[1])} ${p2[0]},${p2[1]}`;
  }
  return d;
}

const niceMax = (v) => {
  if (v <= 5) return 5;
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p) * p;
};

/** Area chart for a daily series: [{ label, value }] */
export function AreaChart({ data, height = 220, color = '#3b4ce0', label = 'Sent' }) {
  const id = useId().replace(/:/g, '');
  const [hover, setHover] = useState(null);
  const box = useRef();
  const [W, setW] = useState(640);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const H = height, padL = 34, padR = 8, padT = 12, padB = 26;
  const max = niceMax(Math.max(1, ...data.map((d) => d.value)));
  const x = (i) => padL + (i * (W - padL - padR)) / Math.max(1, data.length - 1);
  const y = (v) => padT + (1 - v / max) * (H - padT - padB);
  const pts = useMemo(() => data.map((d, i) => [x(i), y(d.value)]), [data, max, W]); // eslint-disable-line react-hooks/exhaustive-deps
  const line = smooth(pts);
  const area = `${line} L${x(data.length - 1)},${H - padB} L${x(0)},${H - padB} Z`;
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - padL) / (W - padL - padR)) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  };

  return (
    <div className="chart" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} per day, peak ${n(Math.max(...data.map((d) => d.value)))}`}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)} style={{ height }}>
        <defs>
          <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity=".28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#e9ebf3" strokeDasharray={t ? '3 4' : ''} vectorEffect="non-scaling-stroke" />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#8c91ae" fontFamily="Instrument Sans">{n(t)}</text>
          </g>
        ))}
        <path d={area} fill={`url(#g${id})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {data.map((d, i) => (i % Math.ceil(data.length / (W < 480 ? 4 : 7)) === 0 || i === data.length - 1) && (
          <text key={d.label} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="#8c91ae" fontFamily="Instrument Sans">{d.label}</text>
        ))}
        {hover !== null && (
          <g>
            <line x1={pts[hover][0]} x2={pts[hover][0]} y1={padT} y2={H - padB} stroke={color} strokeOpacity=".3" vectorEffect="non-scaling-stroke" />
            <circle cx={pts[hover][0]} cy={pts[hover][1]} r="5" fill="#fff" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className="tip" style={{ left: `${(pts[hover][0] / W) * 100}%`, top: `${(pts[hover][1] / H) * 100}%` }}>
          {data[hover].full || data[hover].label} · <b>{n(data[hover].value)}</b> {label.toLowerCase()}
        </div>
      )}
    </div>
  );
}

/** Progress ring. value 0..1 */
export function Ring({ value, size = 56, stroke = 6, color = '#3b4ce0', track = '#e9ebf3', label }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, value))} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset .7s cubic-bezier(.2,.8,.2,1)' }} />
      </svg>
      {label !== undefined && <span>{label}</span>}
    </div>
  );
}

/** Donut with segments: [{ value, color, label }] */
export function Donut({ segments, size = 168, stroke = 20, center, sub }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label={segments.map((s) => `${s.label} ${n(s.value)}`).join(', ')}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef0f6" strokeWidth={stroke} />
        {segments.map((s) => {
          const len = (s.value / total) * c;
          const el = s.value > 0 && (
            <circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={stroke}
              strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-acc} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
          );
          acc += len;
          return el;
        })}
      </svg>
      <span style={{ display: 'grid', textAlign: 'center' }}>
        <b style={{ font: '700 26px var(--f-display)', letterSpacing: '-0.03em' }}>{center}</b>
        {sub && <small style={{ font: '500 12px var(--f-body)', color: 'var(--ink-3)' }}>{sub}</small>}
      </span>
    </div>
  );
}

/** Horizontal funnel: [{ label, value, color }] relative to the first value. */
export function Funnel({ steps }) {
  const base = steps[0]?.value || 0;
  return (
    <div className="funnel">
      {steps.map((s) => (
        <div className="f-row" key={s.label}>
          <span className="muted" style={{ fontWeight: 500 }}>{s.label}</span>
          <div className="f-bar"><i style={{ width: `${base ? (100 * s.value) / base : 0}%`, background: s.color }} /></div>
          <span className="f-val"><b>{n(s.value)}</b><small>{base ? `${((100 * s.value) / base).toFixed(1)}%` : '—'}</small></span>
        </div>
      ))}
    </div>
  );
}
