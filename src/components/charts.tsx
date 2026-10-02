import { useState } from 'react'

// Une seule série par graphique : la marque porte le vert de la marque, le reste est en gris de retrait.
const SERIES = 'var(--color-vert)'

export interface Point { label: string; value: number }

/** Mini-histogramme d'une carte chiffre : périodes passées en gris, période en cours en couleur. */
export function SparkBars({ points, format }: { points: Point[]; format: (n: number) => string }) {
  const peak = Math.max(1, ...points.map((p) => p.value))
  return (
    <div className="flex h-10 items-end gap-[3px]" role="img" aria-label={points.map((p) => `${p.label} : ${format(p.value)}`).join(', ')}>
      {points.map((p, i) => (
        <div
          key={p.label}
          title={`${p.label} : ${format(p.value)}`}
          className={`grow-y w-1.5 rounded-t-[3px] ${i === points.length - 1 ? 'bg-vert' : 'bg-slate-300'}`}
          style={{ height: `${Math.max(6, (p.value / peak) * 100)}%` }}
        />
      ))}
    </div>
  )
}

/** Mini-courbe d'une carte chiffre, avec le dernier point marqué. */
export function SparkLine({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null
  const min = Math.min(...values), max = Math.max(...values)
  const y = (v: number) => 4 + (1 - (v - min) / Math.max(1, max - min)) * 32
  const x = (i: number) => (i / (values.length - 1)) * 100
  return (
    <div className="relative h-10 w-24 min-w-14 shrink" role="img" aria-label={label}>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="reveal-x h-full w-full overflow-visible">
        <polyline points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={SERIES} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-vert ring-2 ring-white" style={{ left: '100%', top: `${(y(values.at(-1)!) / 40) * 100}%` }} />
    </div>
  )
}

/** Jauge d'alerte : part d'un total en difficulté (corail). */
export function Meter({ value, total, label }: { value: number; total: number; label: string }) {
  const share = total > 0 ? Math.min(1, value / total) : 0
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-rose-100" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)} aria-label={label}>
      <div className="grow-x h-full rounded-full bg-rose-600" style={{ width: `${share * 100}%` }} />
    </div>
  )
}

/** Barre d'avancement vers un objectif. */
export function Progress({ value, total, label }: { value: number; total: number; label: string }) {
  const share = total > 0 ? Math.min(1, value / total) : 0
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)} aria-label={label}>
      <div className="grow-x h-full rounded-full bg-vert" style={{ width: `${share * 100}%` }} />
    </div>
  )
}

/** Arrondit un maximum vers une graduation lisible (1, 2, 2,5 ou 5 × 10ⁿ). */
function niceMax(v: number): number {
  if (v <= 0) return 1
  const pow = 10 ** Math.floor(Math.log10(v))
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((m) => m >= v)!
}

/** Courbe d'évolution avec repère et info-bulle au survol. */
export function LineChart({ points, format, title, labelEvery = 1, height = 'h-44' }: { points: Point[]; format: (n: number) => string; title: string; labelEvery?: number; height?: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = niceMax(Math.max(...points.map((p) => p.value)))
  const x = (i: number) => (points.length > 1 ? (i / (points.length - 1)) * 100 : 50)
  const y = (v: number) => (1 - v / max) * 100
  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')
  const active = hover ?? points.length - 1
  const ticks = [max, max / 2, 0]

  function pick(clientX: number, el: HTMLElement) {
    const { left, width } = el.getBoundingClientRect()
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(((clientX - left) / width) * (points.length - 1)))))
  }

  return (
    <div>
      <div className="flex gap-3">
        <div className={`flex ${height} w-12 shrink-0 flex-col justify-between text-right text-xs tabular-nums text-slate-500`} aria-hidden>
          {ticks.map((t) => <span key={t} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">{format(t)}</span>)}
        </div>
        <div
          className={`relative ${height} min-w-0 flex-1 cursor-crosshair touch-none`}
          role="img" aria-label={title}
          onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
          onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((t) => <div key={t} className="absolute inset-x-0 border-t border-slate-200" style={{ top: `${y(t)}%` }} />)}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="reveal-x absolute inset-0 h-full w-full overflow-visible">
            <polygon points={`0,100 ${line} 100,100`} fill={SERIES} opacity="0.1" />
            <polyline points={line} fill="none" stroke={SERIES} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {hover !== null && <div className="absolute inset-y-0 w-px bg-slate-300" style={{ left: `${x(hover)}%` }} />}
          <span className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-vert ring-2 ring-white" style={{ left: `${x(active)}%`, top: `${y(points[active].value)}%` }} />
          {hover !== null && (
            <div
              className="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg"
              style={{
                left: `${x(active)}%`, top: `calc(${y(points[active].value)}% - 10px)`,
                transform: `translate(${active < 2 ? '0' : active > points.length - 3 ? '-100%' : '-50%'}, -100%)`,
              }}
            >
              <span className="font-semibold tabular-nums">{format(points[active].value)}</span>
              <span className="ml-1.5 text-slate-300">{points[active].label}</span>
            </div>
          )}
        </div>
      </div>
      <div className="ml-15 mt-2 flex justify-between text-xs text-slate-500" aria-hidden>
        {points.filter((_, i) => i % labelEvery === 0 || i === points.length - 1).map((p, i) => <span key={p.label} className={points.length / labelEvery > 8 && i % 2 === 1 ? 'hidden sm:inline' : ''}>{p.label}</span>)}
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>{points.map((p) => <tr key={p.label}><th scope="row">{p.label}</th><td>{format(p.value)}</td></tr>)}</tbody>
      </table>
    </div>
  )
}
