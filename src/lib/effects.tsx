import { useEffect, useRef, useState } from 'react'

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Le reflet des cartes suit le pointeur : un seul écouteur pour toute l'application. */
export function installSpotlight() {
  document.addEventListener('pointermove', (e) => {
    const el = (e.target as Element | null)?.closest?.('.spot') as HTMLElement | null
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - r.left}px`)
    el.style.setProperty('--my', `${e.clientY - r.top}px`)
  }, { passive: true })
}

/** Chiffre qui défile jusqu'à sa valeur (une fois au chargement, puis à chaque changement). */
export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown, setShown] = useState(reduced() ? value : 0)
  const from = useRef(0)
  useEffect(() => {
    if (reduced()) { setShown(value); return }
    const start = performance.now(), origin = from.current, duration = 900
    let frame = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - k, 4)
      setShown(origin + (value - origin) * eased)
      if (k < 1) frame = requestAnimationFrame(tick)
      else from.current = value
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])
  return <>{format(shown)}</>
}

/** Petite pluie de confettis aux couleurs de l'agence, pour un lead gagné. */
export function celebrate() {
  if (reduced()) return
  const colors = ['#a9c49f', '#dfe8d8', '#3c4f3b', '#f0a58a', '#ffffff']
  const layer = document.createElement('div')
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:70;overflow:hidden'
  document.body.appendChild(layer)
  for (let i = 0; i < 70; i++) {
    const p = document.createElement('i')
    const size = 6 + Math.random() * 6
    p.style.cssText = `position:absolute;left:${50 + (Math.random() - 0.5) * 20}%;top:38%;width:${size}px;height:${size * 0.45}px;background:${colors[i % colors.length]};border-radius:2px`
    layer.appendChild(p)
    const angle = Math.random() * Math.PI * 2, speed = 220 + Math.random() * 380
    p.animate([
      { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${Math.cos(angle) * speed}px, ${Math.sin(angle) * speed * 0.6 + 420}px) rotate(${720 * Math.random()}deg)`, opacity: 0 },
    ], { duration: 1400 + Math.random() * 900, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' })
  }
  setTimeout(() => layer.remove(), 2600)
}
