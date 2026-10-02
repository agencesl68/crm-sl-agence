import type { Contact } from './types'

const eurFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
const eur0Fmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
const dateLongFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export const eur = (n: number | null | undefined) => eurFmt.format(Number(n ?? 0))
export const eur0 = (n: number | null | undefined) => eur0Fmt.format(Number(n ?? 0))
export const fmtDate = (d: string | null | undefined) => (d ? dateFmt.format(new Date(d)) : '—')
export const fmtDateLong = (d: string | null | undefined) => (d ? dateLongFmt.format(new Date(d)) : '—')
export const fmtDateTime = (d: string | null | undefined) => (d ? dateTimeFmt.format(new Date(d)) : '—')

/** Date du jour au format AAAA-MM-JJ, dans le fuseau local. */
export function isoDay(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
export function addDays(day: string, n: number): string {
  const d = new Date(day + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return isoDay(d)
}
export function daysSince(d: string): number {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000)
}
export function ago(d: string): string {
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60_000)
  if (mins < 1) return "à l'instant"
  if (mins < 60) return `il y a ${mins} min`
  const h = Math.floor(mins / 60)
  if (h < 24) return `il y a ${h} h`
  const j = Math.floor(h / 24)
  return j === 1 ? 'hier' : `il y a ${j} j`
}

export const contactName = (c: Pick<Contact, 'first_name' | 'last_name'> | undefined | null) =>
  c ? `${c.first_name} ${c.last_name}`.trim() || 'Sans nom' : ''

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')

/** Convertit une saisie (« 1 250,50 ») en nombre, ou null si vide. */
export function parseNumber(v: string): number | null {
  const s = v.replace(/\s/g, '').replace(',', '.')
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
