import { useId } from 'react'
import { cn } from '@/lib/cn'
import { formatDuration } from '@/lib/format'

export interface TrendPoint {
  label: string
  active_s: number
  idle_s: number
  today?: boolean
}

const W = 1000
const H = 300
const PAD = { left: 44, right: 16, top: 44, bottom: 40 }

/** Monotone cubic path (Fritsch–Carlson), so the curve never dips below zero between points. */
function smoothPath(pts: [number, number][]): string {
  const n = pts.length
  if (n < 2) return ''
  const dx: number[] = []
  const slope: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0])
    slope.push((pts[i + 1][1] - pts[i][1]) / dx[i])
  }
  const m: number[] = [slope[0]]
  for (let i = 1; i < n - 1; i++) m.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2)
  m.push(slope[n - 2])
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = m[i] / slope[i]
    const b = m[i + 1] / slope[i]
    const s = a * a + b * b
    if (s > 9) {
      const t = 3 / Math.sqrt(s)
      m[i] = t * a * slope[i]
      m[i + 1] = t * b * slope[i]
    }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    d += ` C${pts[i][0] + h},${pts[i][1] + m[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - m[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`
  }
  return d
}

/** Active vs idle per day as a glass-card area chart (plain SVG). */
export function TrendChart({ title, subtitle, points }: { title: string; subtitle?: string; points: TrendPoint[] }) {
  const gid = useId()
  const maxS = Math.max(0, ...points.flatMap((p) => [p.active_s, p.idle_s]))
  const hours = Math.max(1, Math.ceil(maxS / 3600))
  const step = hours > 8 ? 2 : 1
  const top = Math.ceil(hours / step) * step
  const x = (i: number) => PAD.left + ((W - PAD.left - PAD.right) * (points.length === 1 ? 0.5 : i / (points.length - 1)))
  const y = (s: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - s / (top * 3600))
  const active: [number, number][] = points.map((p, i) => [x(i), y(p.active_s)])
  const idle: [number, number][] = points.map((p, i) => [x(i), y(p.idle_s)])
  const activeD = smoothPath(active)
  const base = y(0)
  const areaD = activeD ? `${activeD} L${active[active.length - 1][0]},${base} L${active[0][0]},${base} Z` : ''
  const peak = points.reduce((best, p, i) => (p.active_s > (points[best]?.active_s ?? 0) ? i : best), -1)
  const todayIdx = points.findIndex((p) => p.today)
  const ticks = Array.from({ length: top / step + 1 }, (_, k) => k * step)
  const summary = points.map((p) => `${p.label}: active ${formatDuration(p.active_s)}, idle ${formatDuration(p.idle_s)}`).join('; ')

  return (
    <div className="glass-card min-w-0 px-5 py-[22px] @3xl/page:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-ink-900">{title}</h2>
          {subtitle && <p className="text-[12.5px] text-ink-500">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-4 text-[12.5px] text-ink-500" aria-hidden>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-[3px] w-3.5 rounded-full bg-[var(--brand-500)]" /> Active
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 border-t-2 border-dashed border-[var(--warning)]" /> Idle
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 block h-auto w-full" role="img" aria-label={`${title}. ${summary}`}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand-500)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--brand-500)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t * 3600)}
              y2={y(t * 3600)}
              stroke={t === 0 ? 'var(--line-strong)' : 'var(--chart-grid)'}
              strokeDasharray={t === 0 ? undefined : '4 6'}
            />
            <text x={0} y={y(t * 3600) + 4} fontSize="12" fill="var(--ink-400)" className="@max-4xl/page:text-[15px]">
              {t}h
            </text>
          </g>
        ))}
        {points.map((p, i) => (
          <text
            key={p.label}
            x={x(i)}
            y={H - 10}
            textAnchor="middle"
            fontSize="13"
            fontWeight={p.today ? 700 : 400}
            fill={p.today ? 'var(--brand-700)' : 'var(--ink-400)'}
            className={cn('@max-4xl/page:text-[16px]', p.today && 'dark:fill-indigo-300')}
          >
            {p.today ? `${p.label} · today` : p.label}
          </text>
        ))}
        {areaD && <path d={areaD} fill={`url(#${gid})`} />}
        <path d={smoothPath(idle)} fill="none" stroke="var(--warning)" strokeWidth="2.4" strokeDasharray="6 6" strokeLinecap="round" />
        <path d={activeD} fill="none" stroke="var(--brand-500)" strokeWidth="3" strokeLinecap="round" />
        {todayIdx >= 0 && todayIdx !== peak && <circle cx={active[todayIdx][0]} cy={active[todayIdx][1]} r="6" fill="var(--brand-500)" />}
        {peak >= 0 && (
          <g>
            <circle cx={active[peak][0]} cy={active[peak][1]} r="8" fill="white" stroke="var(--brand-500)" strokeWidth="3" />
            <g transform={`translate(${Math.min(Math.max(active[peak][0], PAD.left + 50), W - 60)}, ${Math.max(active[peak][1] - 34, 18)})`}>
              <rect x="-50" y="-17" width="100" height="32" rx="16" fill="var(--tooltip-bg)" />
              <text y="5" textAnchor="middle" fontSize="14" fontWeight="600" fill="white" className="@max-4xl/page:text-[17px]">
                {formatDuration(points[peak].active_s)}
              </text>
            </g>
          </g>
        )}
      </svg>
    </div>
  )
}
