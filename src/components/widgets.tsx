import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Droplets, ExternalLink, Eye, Heart, MapPin, Sparkles, Users, Wind } from 'lucide-react'
import { CountUp } from '../lib/effects'
import { financeSummary } from '../lib/finance'
import { useWriteBrief } from '../lib/sync'
import { ARTIFACT } from '../lib/env'
import { ago, eur0, isoDay } from '../lib/format'
import { useLookups } from '../lib/selectors'
import { useStore } from '../lib/store'
import type { NewsItem } from '../lib/types'
import { describe, useWeather } from '../lib/weather'
import { Progress } from './charts'
import { PostCover } from './PostCover'
import { Avatar, Button, Card, Tabs, useAction } from './ui'

const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' })
const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 })

const CardLink = ({ to, children }: { to: string; children: string }) => (
  <Link to={to} className="inline-flex items-center gap-1 text-[13px] font-medium text-link hover:underline">{children}<ArrowUpRight size={14} aria-hidden /></Link>
)

// ───────────────────────────── Météo ─────────────────────────────

export function WeatherCard() {
  const { settings } = useStore()
  const w = useWeather(settings.weather_lat, settings.weather_lon)
  if (!w) return <div className="skeleton h-full min-h-56 rounded-2xl" aria-label="Chargement de la météo" />
  const now = describe(w.code)
  return (
    <section className="spot relative min-w-0 overflow-hidden rounded-2xl bg-gradient-to-br from-vert via-[#33452f] to-[#1d281b] p-4 text-white shadow-sm">
      <div aria-hidden className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-sauge/25 blur-2xl" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1 text-[13px] text-pale"><MapPin size={13} aria-hidden />{settings.weather_city}</p>
          <p className="mt-1 text-5xl font-semibold tracking-tight tabular-nums">{w.temperature}°</p>
          <p className="mt-1 text-sm text-pale">{now.label} · ressenti {w.feelsLike}°</p>
        </div>
        <now.icon size={44} strokeWidth={1.5} className="text-sauge" aria-hidden />
      </div>
      <div className="relative mt-3 flex gap-4 text-xs text-pale">
        <span className="flex items-center gap-1"><Wind size={13} aria-hidden />{w.wind} km/h</span>
        <span className="flex items-center gap-1"><Droplets size={13} aria-hidden />{w.days[0]?.rain ?? 0} % de pluie</span>
      </div>
      <ul className="relative mt-4 grid grid-cols-6 gap-1 border-t border-white/15 pt-3 text-center text-xs">
        {w.hours.map((h) => { const d = describe(h.code); return (
          <li key={h.time}><p className="text-pale">{timeFmt.format(new Date(h.time)).replace(':00', ' h')}</p><d.icon size={16} className="mx-auto my-1 text-white/90" aria-label={d.label} /><p className="font-semibold tabular-nums">{h.temperature}°</p></li>
        ) })}
      </ul>
      <ul className="relative mt-3 grid grid-cols-3 gap-2 text-xs">
        {w.days.slice(1, 4).map((d) => { const x = describe(d.code); return (
          <li key={d.date} className="flex items-center justify-between rounded-xl bg-white/10 px-2.5 py-2">
            <span className="capitalize text-pale">{dayFmt.format(new Date(d.date)).replace('.', '')}</span>
            <x.icon size={15} aria-label={x.label} />
            <span className="tabular-nums">{d.min}° / <span className="font-semibold">{d.max}°</span></span>
          </li>
        ) })}
      </ul>
      {w.example && <p className="relative mt-2 text-[11px] text-pale/80">Exemple : la météo réelle s'affiche dans l'application en ligne.</p>}
    </section>
  )
}

// ───────────────────────────── Point du jour (actu) ─────────────────────────────

const CATEGORIES: ('Tout' | NewsItem['category'])[] = ['Tout', 'IA', 'Automatisation', 'Économie', 'Alsace']

export function BriefCard() {
  const { data, live } = useStore()
  const writeBrief = useWriteBrief()
  const [writing, setWriting] = useState(false)
  const today = data.daily_briefs.find((b) => b.day === isoDay())
  const [tab, setTab] = useState<(typeof CATEGORIES)[number]>('Tout')
  const brief = data.daily_briefs.find((b) => b.day === isoDay()) ?? data.daily_briefs[0]
  const news = data.news_items.filter((n) => tab === 'Tout' || n.category === tab).slice(0, 5)
  return (
    <Card title={<span className="flex items-center gap-2"><Sparkles size={15} className="text-vert" aria-hidden />Point du jour</span>} className="h-full">
      {live && ARTIFACT && !today && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-slate-300 p-4">
          <p className="text-sm text-slate-600">Claude résume ce qui compte aujourd'hui à partir de vos leads, devis, factures et tâches.</p>
          <Button small variant="primary" icon={Sparkles} disabled={writing} onClick={async () => { setWriting(true); await writeBrief(); setWriting(false) }}>{writing ? 'Rédaction…' : 'Rédiger le point du jour'}</Button>
        </div>
      )}
      {brief && (
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="eyebrow mb-1 text-vert">Résumé rédigé par Claude · {ago(brief.created_at)}</p>
          <p className="text-[15px] leading-relaxed text-slate-700">{brief.content}</p>
        </div>
      )}
      {data.news_items.length > 0 && <div className="mt-4 overflow-x-auto"><Tabs value={tab} onChange={setTab} tabs={CATEGORIES.map((c) => ({ id: c, label: c }))} /></div>}
      {data.news_items.length === 0 ? (!live || today) && !brief && <p className="text-sm text-slate-500">Aucun point du jour pour l'instant.</p> : news.length === 0 ? <p className="mt-3 text-sm text-slate-500">Pas d'actualité dans cette rubrique pour l'instant.</p> : (
        <ul className="mt-2 divide-y divide-slate-100">
          {news.map((n) => (
            <li key={n.id} className="py-2.5">
              <p className="flex items-center gap-2 text-xs text-slate-500"><span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">{n.category}</span>{n.source} · {ago(n.published_at)}</p>
              {n.url
                ? <a href={n.url} target="_blank" rel="noreferrer" className="mt-1 flex items-start gap-1 text-sm font-semibold text-slate-900 hover:underline">{n.title}<ExternalLink size={13} className="mt-1 shrink-0 text-slate-400" aria-hidden /></a>
                : <p className="mt-1 text-sm font-semibold text-slate-900">{n.title}</p>}
              {n.summary && <p className="mt-0.5 text-[13px] text-slate-600">{n.summary}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ───────────────────────────── Point finance ─────────────────────────────

export function FinanceCard() {
  const { data, settings } = useStore()
  const f = financeSummary(data, settings)
  const rows: [string, number, string?][] = [
    ['CA encaissé cette année', f.revenueYear],
    [`Cotisations estimées (${settings.urssaf_rate.toLocaleString('fr-FR')} %)`, -f.contributionsYear],
    ['Dépenses de l’année', -f.expensesYear],
  ]
  return (
    <Card title="Point finance" action={<CardLink to="/finances">Détails</CardLink>} className="h-full">
      <p className="text-xs text-slate-500">Résultat net estimé {new Date().getFullYear()}</p>
      <p className="text-3xl font-semibold tracking-tight tabular-nums text-slate-900"><CountUp value={f.netYear} format={eur0} /></p>
      <dl className="mt-3 space-y-1.5 text-sm">
        {rows.map(([label, v]) => (
          <div key={label} className="flex justify-between gap-3"><dt className="text-slate-600">{label}</dt><dd className={`tabular-nums ${v < 0 ? 'text-slate-600' : 'font-semibold text-slate-900'}`}>{v < 0 ? '− ' : ''}{eur0(Math.abs(v))}</dd></div>
        ))}
      </dl>
      <div className="mt-4 space-y-3 border-t border-slate-200 pt-3">
        <div>
          <div className="mb-1 flex justify-between text-xs"><span className="text-slate-600">Seuil de franchise TVA</span><span className="tabular-nums text-slate-900"><span className="font-semibold">{Math.round(f.vatShare * 100)} %</span> de {eur0(settings.vat_threshold)}</span></div>
          <Progress value={f.revenueYear} total={settings.vat_threshold} label="Part du seuil de franchise de TVA atteinte" />
        </div>
        <div className="flex justify-between text-xs"><span className="text-slate-600">À provisionner ce trimestre (URSSAF)</span><span className="font-semibold tabular-nums text-slate-900">{eur0(f.contributionsQuarter)}</span></div>
        <div className="flex justify-between text-xs"><span className="text-slate-600">Trésorerie prévue à 90 jours</span><span className="font-semibold tabular-nums text-slate-900">{eur0(f.forecast90)}</span></div>
      </div>
    </Card>
  )
}

// ───────────────────────────── Rendez-vous du jour ─────────────────────────────

export function EventsCard() {
  const { data } = useStore()
  const { profile } = useLookups()
  const today = isoDay()
  const events = data.calendar_events.filter((e) => isoDay(new Date(e.starts_at)) === today)
  const next = data.calendar_events.filter((e) => new Date(e.starts_at).getTime() > Date.now() && isoDay(new Date(e.starts_at)) !== today).slice(0, 2)
  const list = events.length ? events : next
  return (
    <Card title={events.length ? "Rendez-vous aujourd'hui" : 'Prochains rendez-vous'} className="h-full">
      {list.length === 0 ? <p className="text-sm text-slate-500">Aucun rendez-vous à venir dans les agendas.</p> : (
        <ul className="space-y-2">
          {list.map((e) => {
            const past = e.ends_at ? new Date(e.ends_at).getTime() < Date.now() : false
            return (
              <li key={e.id} className={`flex items-center gap-3 rounded-2xl border border-slate-200 p-3 ${past ? 'opacity-60' : ''}`}>
                <div className="w-14 shrink-0 text-center">
                  <p className="text-sm font-semibold tabular-nums text-slate-900">{e.all_day ? 'Journée' : timeFmt.format(new Date(e.starts_at))}</p>
                  {!events.length && <p className="text-[11px] capitalize text-slate-500">{dayFmt.format(new Date(e.starts_at))}</p>}
                </div>
                <div className="min-w-0 flex-1 border-l border-slate-200 pl-3">
                  <p className="truncate text-sm font-medium text-slate-900">{e.title}</p>
                  {e.location && <p className="truncate text-xs text-slate-500">{e.location}</p>}
                </div>
                <Avatar profile={e.owner_id ? profile.get(e.owner_id) : null} size={24} />
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

// ───────────────────────────── Bloc-notes d'équipe ─────────────────────────────

export function NotesCard() {
  const { data, update, me } = useStore()
  const { profile } = useLookups()
  const run = useAction()
  const note = data.team_notes[0]
  const [text, setText] = useState(note?.content ?? '')
  const [saved, setSaved] = useState(true)
  const editing = useRef(false)
  // Les modifications de l'associé arrivent en direct tant qu'on n'est pas en train d'écrire
  useEffect(() => { if (!editing.current && note) setText(note.content) }, [note])
  useEffect(() => {
    if (saved || !note) return
    const t = setTimeout(() => run(async () => { await update('team_notes', true, { content: text, updated_by: me?.id ?? null }); setSaved(true); editing.current = false }), 800)
    return () => clearTimeout(t)
  }, [text, saved, note, me, run, update])
  const author = note?.updated_by ? profile.get(note.updated_by) : undefined
  return (
    <Card title="Bloc-notes de l'équipe" action={<span className="text-xs text-slate-500">{saved ? (author ? `Modifié par ${author.full_name} ${ago(note!.updated_at)}` : 'Enregistré') : 'Enregistrement…'}</span>} className="h-full">
      <textarea
        aria-label="Bloc-notes partagé entre les associés" value={text}
        onChange={(e) => { editing.current = true; setSaved(false); setText(e.target.value) }}
        placeholder="Idées, priorités de la semaine, choses à se dire…"
        className="h-40 w-full resize-none rounded-xl bg-[repeating-linear-gradient(transparent,transparent_27px,var(--color-slate-200)_28px)] px-1 text-[15px] leading-7 text-slate-800 focus:outline-none"
      />
    </Card>
  )
}

// ───────────────────────────── Instagram (résumé) ─────────────────────────────

export function InstagramMini() {
  const { data } = useStore()
  const stats = [...data.instagram_stats].sort((a, b) => a.day.localeCompare(b.day))
  const last = stats.at(-1), first = stats[0]
  const views30 = stats.reduce((a, s) => a + (s.views ?? 0), 0)
  const latest = data.instagram_posts[0]
  const next = data.instagram_schedule.filter((s) => s.status === 'programme' && s.scheduled_at).sort((a, b) => a.scheduled_at!.localeCompare(b.scheduled_at!))[0]
  return (
    <Card title="Instagram" action={<CardLink to="/instagram">Ouvrir</CardLink>} className="h-full">
      <dl className="grid grid-cols-2 gap-3">
        <div><dt className="flex items-center gap-1 text-xs text-slate-500"><Users size={12} aria-hidden />Abonnés</dt><dd className="text-xl font-semibold tabular-nums text-slate-900"><CountUp value={last?.followers ?? 0} format={(n) => Math.round(n).toLocaleString('fr-FR')} /></dd>{last?.followers != null && first?.followers != null && <dd className="text-xs font-medium text-emerald-700">+{last.followers - first.followers} en 30 j</dd>}</div>
        <div><dt className="flex items-center gap-1 text-xs text-slate-500"><Eye size={12} aria-hidden />Vues (30 j)</dt><dd className="text-xl font-semibold tabular-nums text-slate-900"><CountUp value={views30} format={(n) => compact.format(Math.round(n))} /></dd></div>
      </dl>
      {latest && (
        <Link to="/instagram?onglet=publications" className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 p-2 transition-colors hover:bg-slate-50">
          <PostCover post={latest} className="h-14 w-14 shrink-0 rounded-xl" small />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-500">Dernière publication · {ago(latest.posted_at)}</p>
            <p className="truncate text-sm font-medium text-slate-900">{latest.caption}</p>
            <p className="mt-0.5 flex gap-3 text-xs tabular-nums text-slate-600"><span className="flex items-center gap-1"><Eye size={12} aria-hidden />{compact.format(latest.views)}</span><span className="flex items-center gap-1"><Heart size={12} aria-hidden />{latest.likes}</span></p>
          </div>
        </Link>
      )}
      {next && <p className="mt-3 text-xs text-slate-500">Prochaine publication programmée : <span className="font-medium text-slate-900">{new Intl.DateTimeFormat('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(next.scheduled_at!))}</span></p>}
    </Card>
  )
}
