import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { OPEN_STAGES } from '../lib/constants'
import { eur0, fmtDate, isoDay } from '../lib/format'
import { useLookups } from '../lib/selectors'
import { useStore } from '../lib/store'
import { Avatar, IconButton, OwnerFilter } from './ui'

interface Item { id: string; day: string; title: string; context: string; kind: 'Tâche' | 'Livraison' | 'Rendez-vous'; to: string; owner: string | null; time?: string }

const monthFmt = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
const WEEKDAYS = ['lu', 'ma', 'me', 'je', 've', 'sa', 'di']

/** Profil, calendrier du mois et prochaines échéances — pour soi, pour son associé ou pour toute l'agence. */
export function AgendaPanel() {
  const { data, me, online } = useStore()
  const { company, deal, project, profile } = useLookups()
  const today = isoDay()
  const [who, setWho] = useState(me?.id ?? '')
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [selected, setSelected] = useState<string | null>(null)

  const person = who ? profile.get(who) : undefined
  const mine = (id: string | null) => !who || id === who

  const items = useMemo<Item[]>(() => ([
    ...data.tasks.filter((t) => !t.done && t.due_date).map((t) => ({
      id: t.id, day: t.due_date!, title: t.title, kind: 'Tâche' as const, owner: t.assignee_id,
      context: (t.deal_id && deal.get(t.deal_id)?.title) || (t.project_id && project.get(t.project_id)?.name) || (t.company_id && company.get(t.company_id)?.name) || '',
      to: t.deal_id ? `/pipeline?lead=${t.deal_id}` : '/taches',
    })),
    ...data.projects.filter((p) => p.due_date && p.status !== 'livre' && p.status !== 'maintenance').map((p) => ({
      id: p.id, day: p.due_date!, title: p.name, kind: 'Livraison' as const, owner: p.owner_id,
      context: (p.company_id && company.get(p.company_id)?.name) || '', to: '/projets',
    })),
    ...data.calendar_events.filter((e) => new Date(e.ends_at ?? e.starts_at).getTime() >= Date.now() - 3_600_000).map((e) => ({
      id: e.id, day: isoDay(new Date(e.starts_at)), title: e.title, kind: 'Rendez-vous' as const, owner: e.owner_id,
      context: e.location ?? '', to: '/', time: e.all_day ? undefined : new Date(e.starts_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    })),
  ] as Item[]).filter((i) => !who || i.owner === who).sort((a, b) => a.day.localeCompare(b.day) || (a.time ?? '99').localeCompare(b.time ?? '99')), [data.tasks, data.projects, data.calendar_events, who, deal, project, company])

  const counts = new Map<string, number>()
  items.forEach((i) => counts.set(i.day, (counts.get(i.day) ?? 0) + 1))

  // Grille du mois, semaine commençant le lundi
  const first = (month.getDay() + 6) % 7
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells = [...Array(first).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => isoDay(new Date(month.getFullYear(), month.getMonth(), i + 1)))]
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))

  const list = selected ? items.filter((i) => i.day === selected) : items.slice(0, 6)
  const openDeals = data.deals.filter((d) => mine(d.owner_id) && OPEN_STAGES.includes(d.stage))
  const stats = [
    { label: 'Leads', value: String(openDeals.length) },
    { label: 'Potentiel', value: eur0(openDeals.reduce((s, d) => s + Number(d.amount ?? 0), 0)) },
    { label: 'Tâches', value: String(data.tasks.filter((t) => mine(t.assignee_id) && !t.done).length) },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {person
          ? <Avatar profile={person} size={42} online={online.includes(person.id)} />
          : <span className="flex -space-x-2">{data.profiles.map((p) => <Avatar key={p.id} profile={p} size={36} />)}</span>}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{person ? person.full_name : 'Toute l’agence'}</p>
          <p className="truncate text-xs text-fg-muted">{person ? (online.includes(person.id) ? 'En ligne' : 'Hors ligne') : `${data.profiles.length} associés`}</p>
        </div>
      </div>

      <OwnerFilter profiles={data.profiles} value={who} onChange={(id) => { setWho(id); setSelected(null) }} allLabel="Agence" />

      <dl className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-white/[0.07] bg-white/[0.06] px-2 py-2.5 text-center">
            <dd className="truncate text-base font-semibold tabular-nums">{s.value}</dd>
            <dt className="text-xs text-fg-muted">{s.label}</dt>
          </div>
        ))}
      </dl>

      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.06] p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold first-letter:uppercase">{monthFmt.format(month)}</p>
          <div className="flex">
            <IconButton icon={ChevronLeft} label="Mois précédent" onClick={() => shift(-1)} className="!h-8 !w-8" />
            <IconButton icon={ChevronRight} label="Mois suivant" onClick={() => shift(1)} className="!h-8 !w-8" />
          </div>
        </div>
        <div className="grid grid-cols-7 gap-y-1 text-center text-xs">
          {WEEKDAYS.map((d) => <span key={d} className="eyebrow pb-1 text-fg-muted">{d}</span>)}
          {cells.map((day, i) => {
            if (!day) return <span key={`vide-${i}`} />
            const n = counts.get(day) ?? 0
            const isToday = day === today
            return (
              <button
                key={day} type="button" disabled={!n && !isToday}
                aria-pressed={selected === day}
                aria-label={`${fmtDate(day)}${n ? ` : ${n} échéance${n > 1 ? 's' : ''}` : ''}`}
                onClick={() => setSelected(selected === day ? null : day)}
                className={`relative mx-auto flex h-8 w-8 items-center justify-center rounded-full tabular-nums transition-colors disabled:cursor-default ${
                  isToday ? 'bg-sauge font-semibold text-noir' : n ? 'bg-white/[0.12] font-semibold hover:bg-white/20' : 'text-fg-muted'
                } ${selected === day ? 'ring-2 ring-white' : ''}`}
              >
                {Number(day.slice(8))}
                {n > 0 && <span aria-hidden className={`absolute bottom-1 h-1 w-1 rounded-full ${isToday ? 'bg-noir' : day < today ? 'bg-corail' : 'bg-sauge'}`} />}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="eyebrow text-sauge">{selected ? fmtDate(selected) : 'À venir'}</h2>
          {selected
            ? <button type="button" onClick={() => setSelected(null)} className="text-xs text-fg-muted hover:text-fg">Tout afficher</button>
            : <Link to="/taches" className="text-xs text-fg-muted hover:text-fg">Tout voir</Link>}
        </div>
        {list.length === 0 ? <p className="rounded-2xl border border-white/[0.07] bg-white/[0.06] p-3 text-sm text-fg-muted">Rien de prévu.</p> : (
          <ul className="space-y-2">
            {list.map((i) => (
              <li key={i.id}>
                <Link to={i.to} className="flex gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.06] p-3 transition-colors hover:bg-white/[0.11]">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-xs text-fg-muted">
                      <span>{i.kind}</span>·
                      <span className={i.day < today ? 'font-semibold text-corail' : ''}>{i.day < today ? 'En retard · ' : ''}{i.day === today ? "Aujourd'hui" : fmtDate(i.day)}{i.time && ` · ${i.time}`}</span>
                    </p>
                    <p className="mt-0.5 truncate text-sm font-medium">{i.title}</p>
                    {i.context && <p className="truncate text-xs text-fg-muted">{i.context}</p>}
                  </div>
                  {!who && <Avatar profile={i.owner ? profile.get(i.owner) : null} size={22} />}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
