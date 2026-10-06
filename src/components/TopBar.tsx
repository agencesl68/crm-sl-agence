import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight, AtSign, Bell, Bot, Building2, CheckSquare, CornerDownLeft, Euro, FileText, FolderKanban, Inbox, Kanban, Landmark,
  LayoutDashboard, Mail, Plus, Search, Settings, TriangleAlert, UserRound, type LucideIcon,
} from 'lucide-react'
import { ago, contactName, isoDay } from '../lib/format'
import { followupDue, isOverdue, useLookups } from '../lib/selectors'
import { useStore } from '../lib/store'
import type { NotificationItem } from '../lib/types'
import { describe, useWeather } from '../lib/weather'
import { useToast } from './ui'

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

interface Command { key: string; label: string; hint: string; icon: LucideIcon; to: string }

const ACTIONS: Command[] = [
  { key: 'a-lead', label: 'Nouveau lead', hint: 'Action', icon: Plus, to: '/pipeline?nouveau=1' },
  { key: 'a-devis', label: 'Nouveau devis', hint: 'Action', icon: Plus, to: '/documents?nouveau=1' },
  { key: 'a-facture', label: 'Nouvelle facture', hint: 'Action', icon: Plus, to: '/documents?onglet=factures' },
  { key: 'a-post', label: 'Préparer une publication Instagram', hint: 'Action', icon: Plus, to: '/instagram?onglet=planning&nouveau=1' },
  { key: 'a-tache', label: 'Ajouter une tâche', hint: 'Action', icon: Plus, to: '/taches' },
]
const PAGES: Command[] = [
  { key: 'p-home', label: 'Tableau de bord', hint: 'Page', icon: LayoutDashboard, to: '/' },
  { key: 'p-pipe', label: 'Pipeline', hint: 'Page', icon: Kanban, to: '/pipeline' },
  { key: 'p-mail', label: 'Boîte mail', hint: 'Page', icon: Mail, to: '/mails' },
  { key: 'p-cli', label: 'Clients', hint: 'Page', icon: Building2, to: '/clients' },
  { key: 'p-proj', label: 'Projets', hint: 'Page', icon: FolderKanban, to: '/projets' },
  { key: 'p-doc', label: 'Facturation', hint: 'Page', icon: FileText, to: '/documents' },
  { key: 'p-abo', label: 'Abonnements — envoyer les factures du mois', hint: 'Page', icon: FileText, to: '/documents?onglet=abonnements' },
  { key: 'p-fin', label: 'Finances', hint: 'Page', icon: Landmark, to: '/finances' },
  { key: 'p-ig', label: 'Instagram', hint: 'Page', icon: AtSign, to: '/instagram' },
  { key: 'p-task', label: 'Tâches', hint: 'Page', icon: CheckSquare, to: '/taches' },
  { key: 'p-set', label: 'Réglages', hint: 'Page', icon: Settings, to: '/reglages' },
]

/** Palette de commandes (⌘K) : aller n'importe où, retrouver n'importe quoi, lancer une action. */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const { data } = useStore()
  const { company } = useLookups()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])

  const results = useMemo<Command[]>(() => {
    const s = q.trim().toLowerCase()
    const has = (v: string | null | undefined) => !!v && v.toLowerCase().includes(s)
    const base = [...ACTIONS, ...PAGES].filter((c) => !s || has(c.label))
    if (s.length < 2) return base
    return [
      ...base,
      ...data.deals.filter((d) => has(d.title)).map((d) => ({ key: `d${d.id}`, label: d.title, hint: 'Lead', icon: Kanban, to: `/pipeline?lead=${d.id}` })),
      ...data.companies.filter((c) => has(c.name)).map((c) => ({ key: `c${c.id}`, label: c.name, hint: 'Client', icon: Building2, to: `/clients/${c.id}` })),
      ...data.contacts.filter((c) => has(contactName(c)) || has(c.email)).map((c) => ({ key: `p${c.id}`, label: `${contactName(c)}${c.company_id ? ` · ${company.get(c.company_id)?.name ?? ''}` : ''}`, hint: 'Contact', icon: UserRound, to: c.company_id ? `/clients/${c.company_id}` : '/clients' })),
      ...data.quotes.filter((d) => has(d.number) || has(d.title)).map((d) => ({ key: `q${d.id}`, label: `${d.number ?? 'Brouillon'} · ${d.title}`, hint: 'Devis', icon: FileText, to: `/devis/${d.id}` })),
      ...data.instagram_posts.filter((p) => has(p.caption)).map((p) => ({ key: `i${p.id}`, label: p.caption ?? '', hint: 'Publication', icon: AtSign, to: `/instagram?onglet=publications&post=${p.id}` })),
    ].slice(0, 14)
  }, [q, data, company])

  useEffect(() => setActive(0), [q])
  const go = (c: Command | undefined) => { if (!c) return; onClose(); navigate(c.to) }

  return createPortal(
    <div className="fade-in fixed inset-0 z-[60] flex items-start justify-center bg-black/55 p-4 pt-[12vh] backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Palette de commandes" className="surface pop-in w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-200 px-5">
          <Search size={18} className="text-slate-400" aria-hidden />
          <input
            ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un lead, un client, un devis, une page…"
            aria-label="Rechercher ou lancer une action" role="combobox" aria-expanded="true" aria-controls="palette-resultats"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
              if (e.key === 'Enter') { e.preventDefault(); go(results[active]) }
              if (e.key === 'Escape') onClose()
            }}
            className="h-14 flex-1 bg-transparent text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          <kbd className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-500">Échap</kbd>
        </div>
        <ul id="palette-resultats" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">Aucun résultat pour « {q} ».</li>}
          {results.map((c, i) => (
            <li key={c.key} role="option" aria-selected={i === active}>
              <button
                type="button" onMouseEnter={() => setActive(i)} onClick={() => go(c)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${i === active ? 'bg-vert text-white' : 'text-slate-800'}`}
              >
                <c.icon size={16} className={i === active ? 'text-sauge' : 'text-slate-400'} aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium">{c.label}</span>
                <span className={`eyebrow ${i === active ? 'text-pale' : 'text-slate-400'}`}>{c.hint}</span>
                {i === active && <CornerDownLeft size={14} aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  )
}

function useAlerts() {
  const { data, me, settings } = useStore()
  const today = isoDay()
  const open = data.deals.filter((d) => ['nouveau', 'contacte', 'rdv', 'devis_envoye'].includes(d.stage))
  return [
    { n: open.filter((d) => !d.owner_id).length, one: 'lead à attribuer', many: 'leads à attribuer', to: '/pipeline' },
    { n: open.filter((d) => followupDue(d, settings)).length, one: 'relance à faire', many: 'relances à faire', to: '/pipeline' },
    { n: data.qonto_invoices.filter(isOverdue).length, one: 'facture en retard', many: 'factures en retard', to: '/documents' },
    { n: data.tasks.filter((t) => !t.done && (!t.assignee_id || t.assignee_id === me?.id) && !!t.due_date && t.due_date <= today).length, one: 'tâche pour aujourd’hui', many: 'tâches pour aujourd’hui', to: '/taches' },
    { n: data.instagram_messages.filter((m) => !m.handled).length, one: 'commentaire Instagram à traiter', many: 'commentaires Instagram à traiter', to: '/instagram?onglet=commentaires' },
  ].filter((a) => a.n > 0).map((a) => ({ label: plural(a.n, a.one, a.many), to: a.to }))
}

const NOTIF_ICON: Record<NotificationItem['kind'], LucideIcon> = { lead: Inbox, reponse: Mail, paiement: Euro, robot: Bot, erreur: TriangleAlert }
const SEEN_KEY = 'crm-notifications-vues'
const readSeen = () => { try { return localStorage.getItem(SEEN_KEY) ?? '' } catch { return '' } }

/** Activité du robot : non lues depuis la dernière ouverture de la cloche, et message à l'écran à l'arrivée. */
function useRobotNotifications() {
  const { data } = useStore()
  const toast = useToast()
  const [seen, setSeen] = useState(readSeen)
  const list = useMemo(() => [...data.notifications].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 12), [data.notifications])
  const known = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (known.current === null) { known.current = new Set(list.map((n) => n.id)); return }
    for (const n of list) {
      if (!known.current.has(n.id) && Date.now() - new Date(n.created_at).getTime() < 5 * 60_000) toast(n.title)
      known.current.add(n.id)
    }
  }, [list, toast])
  const markSeen = () => {
    const now = new Date().toISOString()
    try { localStorage.setItem(SEEN_KEY, now) } catch { /* navigateur privé */ }
    setSeen(now)
  }
  return { list, unread: list.filter((n) => n.created_at > seen).length, markSeen }
}

function Popover({ label, icon: Icon, dot, onOpen, wide, children }: { label: string; icon: LucideIcon; dot?: boolean; onOpen?: () => void; wide?: boolean; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}>
      <button type="button" aria-expanded={open} aria-label={label} title={label} onClick={() => { if (!open) onOpen?.(); setOpen(!open) }} className="relative flex h-10 w-10 items-center justify-center rounded-full border border-btn-border bg-btn text-fg transition-colors hover:bg-hover">
        <Icon size={17} aria-hidden />
        {dot && <span aria-hidden className="ping absolute right-2 top-2 h-2 w-2 rounded-full bg-corail" />}
      </button>
      {open && <div className={`surface pop-in absolute right-0 top-full z-30 mt-2 max-h-[75vh] overflow-y-auto rounded-2xl bg-white py-1 shadow-2xl ${wide ? 'w-[min(22rem,calc(100vw-2rem))]' : 'w-72'}`}>{children(() => setOpen(false))}</div>}
    </div>
  )
}

/** Barre du haut : palette de commandes, météo, heure, alertes et création rapide. */
export function TopBar({ onPalette }: { onPalette: () => void }) {
  const { settings } = useStore()
  const weather = useWeather(settings.weather_lat, settings.weather_lon)
  const alerts = useAlerts()
  const robot = useRobotNotifications()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(t) }, [])
  const w = weather ? describe(weather.code) : null
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

  return (
    <div className="no-print sticky top-0 z-20 flex items-center gap-2 border-b border-white/[0.06] bg-[rgb(15_20_14/0.55)] px-4 py-3 backdrop-blur-xl lg:px-7">
      <button type="button" onClick={onPalette} className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-btn-border bg-btn px-4 text-left text-sm text-fg-muted transition-colors hover:bg-hover sm:max-w-md">
        <Search size={16} aria-hidden />
        <span className="flex-1 truncate">Rechercher ou lancer une action…</span>
        <kbd className="hidden rounded-md border border-white/15 px-1.5 text-[11px] sm:inline">{mac ? '⌘' : 'Ctrl'} K</kbd>
      </button>
      <div className="ml-auto flex items-center gap-2">
        {w && weather && (
          <span className="hidden items-center gap-1.5 rounded-full border border-btn-border bg-btn px-3 py-2 text-sm md:flex" title={`${settings.weather_city} : ${w.label}`}>
            <w.icon size={16} className="text-sauge" aria-hidden /><span className="tabular-nums">{weather.temperature}°</span>
          </span>
        )}
        <span className="hidden rounded-full border border-btn-border bg-btn px-3 py-2 text-sm tabular-nums md:block">{now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
        <Popover label={`Alertes : ${alerts.length}${robot.unread ? `, ${robot.unread} nouveautés` : ''}`} icon={Bell} dot={alerts.length > 0 || robot.unread > 0} onOpen={robot.markSeen} wide>
          {(close) => (
            <>
              <p className="eyebrow px-4 pb-1 pt-2.5 text-slate-500">À faire</p>
              {alerts.length === 0 ? <p className="px-4 pb-2 text-sm text-slate-500">Rien à signaler.</p> : alerts.map((a) => (
                <Link key={a.label} to={a.to} onClick={close} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-50">{a.label}<ArrowRight size={14} aria-hidden /></Link>
              ))}
              {robot.list.length > 0 && <p className="eyebrow mt-1 border-t border-slate-100 px-4 pb-1 pt-3 text-slate-500">Fait par le robot</p>}
              {robot.list.map((n) => {
                const Icon = NOTIF_ICON[n.kind] ?? Bot
                const body = (
                  <>
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-hover text-fg-muted"><Icon size={14} aria-hidden /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-900">{n.title}</span>
                      {n.body && <span className="line-clamp-2 block text-xs text-slate-500">{n.body}</span>}
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-400">{ago(n.created_at)}</span>
                  </>
                )
                return n.link
                  ? <Link key={n.id} to={n.link} onClick={close} className="flex gap-3 px-4 py-2.5 hover:bg-slate-50">{body}</Link>
                  : <div key={n.id} className="flex gap-3 px-4 py-2.5">{body}</div>
              })}
            </>
          )}
        </Popover>
        <Popover label="Créer" icon={Plus}>
          {(close) => ACTIONS.map((a) => (
            <Link key={a.key} to={a.to} onClick={close} className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-50"><Plus size={15} className="text-vert" aria-hidden />{a.label}</Link>
          ))}
        </Popover>
      </div>
    </div>
  )
}
