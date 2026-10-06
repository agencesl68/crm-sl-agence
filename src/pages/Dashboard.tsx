import { useEffect, useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownRight, ArrowUpRight, AtSign, Bot, CalendarClock, Landmark, Mail, MailOpen, Phone, Receipt, RefreshCw,
  StickyNote, Target, Users, type LucideIcon,
} from 'lucide-react'
import { AgendaPanel } from '../components/AgendaPanel'
import { LineChart, Meter, Progress, SparkBars, SparkLine, type Point } from '../components/charts'
import { TaskRow } from '../components/shared'
import { Avatar, Badge, Button, Card, useAction } from '../components/ui'
import { BriefCard, EventsCard, FinanceCard, InstagramMini, NotesCard, WeatherCard } from '../components/widgets'
import { ACTIVITY_LABEL, OPEN_STAGES, PROJECT_STATUSES, STAGES, sourceLabel } from '../lib/constants'
import { CountUp } from '../lib/effects'
import { ago, daysSince, eur, eur0, fmtDate, isoDay } from '../lib/format'
import { followupDue, invoiceHt, isOverdue, useLookups } from '../lib/selectors'
import { useStore } from '../lib/store'
import { due, SYNC_ENABLED, useImportLeads, useQontoSync } from '../lib/sync'
import type { ActivityType, Profile } from '../lib/types'

const monthFmt = new Intl.DateTimeFormat('fr-FR', { month: 'short' })
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
/** Les n derniers mois, du plus ancien au mois en cours. */
function lastMonths(n: number) {
  const now = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1) + i, 1)
    return { key: monthKey(d), label: monthFmt.format(d).replace('.', '') }
  })
}
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`
const int = (n: number) => String(Math.round(n))

const ACTIVITY_ICON: Record<ActivityType, LucideIcon> = {
  note: StickyNote, appel: Phone, rdv: CalendarClock, email_recu: MailOpen, email_envoye: Mail,
  relance: RefreshCw, instagram: AtSign, systeme: Bot,
}

// ───────────────────────────── Cartes ─────────────────────────────

/** Évolution par rapport à la période précédente : flèche + valeur signée, jamais la couleur seule. */
function Delta({ value, label, format = String }: { value: number; label: string; format?: (n: number) => string }) {
  if (value === 0) return <span className="text-slate-500">= {label}</span>
  const up = value > 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className={`inline-flex items-center font-semibold ${up ? 'text-emerald-700' : 'text-rose-700'}`}><Icon size={13} aria-hidden />{up ? '+' : '−'}{format(Math.abs(value))}</span>
      <span className="text-slate-500">&nbsp;{label}</span>
    </span>
  )
}

function Kpi({ label, value, format, icon: Icon, to, visual, children }: { label: string; value: number; format: (n: number) => string; icon: LucideIcon; to: string; visual?: ReactNode; children?: ReactNode }) {
  return (
    <Link to={to} className="surface spot lift group flex min-w-0 flex-col rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[13px] font-medium text-slate-500">{label}</p>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors duration-300 group-hover:bg-vert group-hover:text-white"><Icon size={14} aria-hidden /></span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="whitespace-nowrap text-[26px] font-semibold leading-8 tracking-tight tabular-nums text-slate-900"><CountUp value={value} format={format} /></p>
        <div className="flex min-w-0 shrink justify-end">{visual}</div>
      </div>
      <div className="mt-2 min-h-4 truncate text-xs">{children}</div>
    </Link>
  )
}

function ActionCard({ label, count, detail, to, highlight }: { label: string; count: number; detail: string; to: string; highlight: boolean }) {
  return (
    <Link to={to} className={`surface spot lift flex min-w-0 items-center justify-between gap-3 overflow-hidden rounded-2xl p-4 shadow-sm ${highlight ? 'bg-gradient-to-br from-vert to-vert-fonce' : 'bg-white'}`}>
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${highlight ? 'text-white' : 'text-slate-900'}`}>{label}</p>
        <p className={`mt-0.5 truncate text-xs ${highlight ? 'text-pale' : 'text-slate-500'}`}>{detail}</p>
      </div>
      <span className={`flex h-11 min-w-11 shrink-0 items-center justify-center rounded-full px-2 text-lg font-semibold tabular-nums ${highlight ? 'bg-sauge text-noir' : 'bg-slate-100 text-slate-900'}`}>{count}</span>
    </Link>
  )
}

const SectionTitle = ({ children }: { children: ReactNode }) => <h2 className="eyebrow mb-3 mt-8 text-sauge">{children}</h2>

const CardLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link to={to} className="inline-flex items-center gap-1 text-[13px] font-medium text-link hover:underline">{children}<ArrowUpRight size={14} aria-hidden /></Link>
)

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs text-slate-500">{label}</dt>
      <dd className="truncate text-sm font-semibold tabular-nums text-slate-900">{value}{hint && <span className="ml-1 font-normal text-slate-500">{hint}</span>}</dd>
    </div>
  )
}

function greeting(): string {
  const h = new Date().getHours()
  return h < 5 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir'
}

// ───────────────────────────── Page ─────────────────────────────

export function Dashboard() {
  const { data, me, settings, online, update } = useStore()
  const { profile, deal: dealById, company } = useLookups()
  const run = useAction()
  const importLeads = useImportLeads()
  const syncQonto = useQontoSync()
  useEffect(() => {
    if (!SYNC_ENABLED) return
    if (due('demandes', 360)) void importLeads(true)
    if (due('qonto', 60)) void syncQonto(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const today = isoDay()
  const months = lastMonths(12)
  const thisMonth = months.at(-1)!.key
  const prevMonth = months.at(-2)!.key

  // Pipeline
  const open = data.deals.filter((d) => OPEN_STAGES.includes(d.stage))
  const fresh = data.deals.filter((d) => d.stage === 'nouveau')
  const unassigned = open.filter((d) => !d.owner_id)
  const followups = open.filter((d) => followupDue(d, settings))
  const createdIn = (key: string) => data.deals.filter((d) => isoDay(new Date(d.created_at)).startsWith(key)).length
  const closed = data.deals.filter((d) => d.closed_at && daysSince(d.closed_at) <= 90)
  const won = closed.filter((d) => d.stage === 'gagne')
  const conversion = closed.length ? Math.round((won.length / closed.length) * 100) : null
  const allWon = data.deals.filter((d) => d.stage === 'gagne' && d.amount != null)
  const basket = allWon.length ? allWon.reduce((s, d) => s + Number(d.amount), 0) / allWon.length : null
  const mrr = data.subscriptions.filter((x) => x.active).reduce((s, x) => s + Number(x.amount), 0)

  // Factures (Qonto)
  const invoices = data.qonto_invoices.filter((i) => i.status === 'unpaid' || i.status === 'paid')
  const invoicedIn = (key: string) => invoices.filter((i) => i.issue_date?.startsWith(key)).reduce((s, i) => s + invoiceHt(i), 0)
  const unpaid = invoices.filter((i) => i.status === 'unpaid')
  const overdue = unpaid.filter(isOverdue)
  const sum = (rows: typeof invoices) => rows.reduce((s, i) => s + Number(i.total_ttc), 0)
  const goalShare = settings.monthly_goal > 0 ? Math.round((invoicedIn(thisMonth) / settings.monthly_goal) * 100) : 0

  // Trésorerie
  const balance = data.qonto_accounts.reduce((s, a) => s + Number(a.balance), 0)
  const txTime = (t: (typeof data.qonto_transactions)[number]) => new Date(t.settled_at ?? t.emitted_at ?? t.created_at).getTime()
  const cashIn: Point[] = months.map((m) => ({
    label: m.label,
    value: data.qonto_transactions.filter((t) => t.side === 'credit' && isoDay(new Date(txTime(t))).startsWith(m.key)).reduce((s, t) => s + Number(t.amount), 0),
  }))
  const cashTotal = cashIn.reduce((s, p) => s + p.value, 0)
  // Solde reconstitué sur 30 jours : solde actuel moins les mouvements postérieurs à chaque date
  const balanceTrend = useMemo(() => Array.from({ length: 30 }, (_, i) => {
    const cutoff = Date.now() - (29 - i) * 86_400_000
    const later = data.qonto_transactions.filter((t) => new Date(t.settled_at ?? t.emitted_at ?? t.created_at).getTime() > cutoff).reduce((s, t) => s + (t.side === 'credit' ? 1 : -1) * Number(t.amount), 0)
    return balance - later
  }), [data.qonto_transactions, balance])

  const leadsPerWeek: Point[] = Array.from({ length: 8 }, (_, i) => {
    const weeksAgo = 7 - i
    return { label: weeksAgo === 0 ? 'Cette semaine' : `Il y a ${weeksAgo} sem.`, value: data.deals.filter((d) => Math.floor(daysSince(d.created_at) / 7) === weeksAgo).length }
  })
  const invoicedPerMonth: Point[] = months.slice(-6).map((m) => ({ label: m.label, value: invoicedIn(m.key) }))

  const myTasks = data.tasks
    .filter((t) => !t.done && t.assignee_id === me?.id && !!t.due_date && t.due_date <= today)
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!))
  const feed = data.activities.slice(0, 7)
  const activeProjects = data.projects.filter((p) => p.status === 'en_cours' || p.status === 'en_recette')
  const myEvents = data.calendar_events.filter((e) => e.owner_id === me?.id && isoDay(new Date(e.starts_at)) === today)

  const actions = [
    { label: 'Nouveaux leads', count: fresh.length, detail: fresh[0]?.title ?? 'Aucun lead en attente', to: fresh[0] ? `/pipeline?lead=${fresh[0].id}` : '/pipeline' },
    { label: 'Relances à faire', count: followups.length, detail: followups[0] ? `${followups[0].title} · ${daysSince(followups[0].last_activity_at)} j sans nouvelles` : 'Tout le monde a été relancé', to: followups[0] ? `/pipeline?lead=${followups[0].id}` : '/pipeline' },
    { label: 'Factures en retard', count: overdue.length, detail: overdue[0] ? `${overdue[0].number} · ${overdue[0].client_name} · ${eur(overdue[0].total_ttc)}` : 'Aucun retard de paiement', to: '/documents' },
  ]
  const firstUrgent = actions.findIndex((a) => a.count > 0)
  const attention = actions.reduce((s, a) => s + a.count, 0) + myTasks.length
  const stagePeak = Math.max(1, ...OPEN_STAGES.map((s) => open.filter((d) => d.stage === s).length))

  function member(p: Profile) {
    const deals = open.filter((d) => d.owner_id === p.id)
    const tasks = data.tasks.filter((t) => t.assignee_id === p.id && !t.done)
    const next = tasks.filter((t) => t.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!))[0]
    return {
      deals: deals.length, potential: deals.reduce((s, d) => s + Number(d.amount ?? 0), 0), tasks: tasks.length,
      late: tasks.filter((t) => !!t.due_date && t.due_date < today).length,
      projects: data.projects.filter((x) => x.owner_id === p.id && (x.status === 'en_cours' || x.status === 'en_recette')).length,
      next,
    }
  }

  return (
    <>
      {/* En-tête : salutation, et ce qui attend aujourd'hui */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-sauge first-letter:uppercase">{new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p>
          <h1 className="mt-1 text-3xl font-medium tracking-tight sm:text-4xl">
            {greeting()} {me?.full_name}<span className="text-fg-muted">, voici l'agence aujourd'hui.</span>
          </h1>
          <p className="mt-2 text-sm text-fg-muted">
            {attention ? <><span className="font-semibold text-fg">{plural(attention, 'point demande', 'points demandent')}</span> votre attention</> : 'Rien d’urgent : bonne journée de production'}
            {myEvents.length > 0 && <> · {plural(myEvents.length, 'rendez-vous', 'rendez-vous')} aujourd'hui</>}
            {online.filter((id) => id !== me?.id).map((id) => <span key={id}> · {profile.get(id)?.full_name} est en ligne</span>)}
          </p>
        </div>
      </header>

      <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi to="/pipeline" icon={Users} label="Leads en cours" value={open.length} format={int} visual={<SparkBars points={leadsPerWeek} format={(n) => plural(n, 'lead', 'leads')} />}>
          <Delta value={createdIn(thisMonth) - createdIn(prevMonth)} label="vs mois dernier" />
        </Kpi>
        <Kpi to="/documents" icon={Target} label="Facturé ce mois (HT)" value={invoicedIn(thisMonth)} format={eur0} visual={<SparkBars points={invoicedPerMonth} format={eur0} />}>
          <div className="flex items-center gap-2">
            <div className="w-16 shrink-0"><Progress value={invoicedIn(thisMonth)} total={settings.monthly_goal} label="Avancement vers l'objectif du mois" /></div>
            <span className="truncate text-slate-500" title={`Objectif : ${eur0(settings.monthly_goal)} HT`}><span className="font-semibold text-slate-900">{goalShare} %</span> de l'objectif</span>
          </div>
        </Kpi>
        <Kpi to="/documents" icon={Receipt} label="À encaisser" value={sum(unpaid)} format={eur0} visual={<div className="w-20 pb-1.5"><Meter value={sum(overdue)} total={sum(unpaid)} label="Part des factures en retard" /></div>}>
          {overdue.length
            ? <span className="font-semibold text-rose-700">dont {eur0(sum(overdue))} en retard</span>
            : <span className="text-slate-500">{plural(unpaid.length, 'facture', 'factures')}, aucune en retard</span>}
        </Kpi>
        <Kpi to="/finances" icon={Landmark} label="Solde Qonto" value={balance} format={eur0} visual={<SparkLine values={balanceTrend} label="Évolution du solde sur 30 jours" />}>
          <Delta value={Math.round(balance - balanceTrend[0])} label="en 30 jours" format={eur0} />
        </Kpi>
      </div>

      <SectionTitle>À traiter</SectionTitle>
      <div className="stagger grid gap-3 md:grid-cols-3">
        {actions.map((a, i) => <ActionCard key={a.label} {...a} highlight={i === firstUrgent} />)}
      </div>

      <SectionTitle>Votre journée</SectionTitle>
      <div className="stagger grid gap-3 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2"><BriefCard /></div>
        <div className="grid min-w-0 gap-3"><WeatherCard /><EventsCard /></div>
      </div>

      <SectionTitle>Activité commerciale</SectionTitle>
      <div className="stagger grid gap-3 lg:grid-cols-3">
        <Card title="Encaissements" className="lg:col-span-2" action={<CardLink to="/finances">Finances</CardLink>}>
          <dl className="mb-4 flex flex-wrap gap-x-8 gap-y-2">
            <Stat label="12 derniers mois" value={eur0(cashTotal)} />
            <Stat label="Moyenne mensuelle" value={eur0(cashTotal / 12)} />
            <Stat label="Ce mois" value={eur0(cashIn.at(-1)!.value)} />
          </dl>
          <LineChart points={cashIn} format={eur0} title="Encaissements par mois sur 12 mois" />
        </Card>
        <Card title="Pipeline" action={<CardLink to="/pipeline">Ouvrir</CardLink>}>
          <ul className="space-y-3">
            {STAGES.filter((s) => OPEN_STAGES.includes(s.id)).map((s) => {
              const deals = open.filter((d) => d.stage === s.id)
              return (
                <li key={s.id}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="text-slate-700">{s.label}</span>
                    <span className="tabular-nums text-slate-500"><span className="font-semibold text-slate-900">{deals.length}</span> · {eur0(deals.reduce((t, d) => t + Number(d.amount ?? 0), 0))}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="grow-x h-full rounded-full bg-vert" style={{ width: `${(deals.length / stagePeak) * 100}%` }} /></div>
                </li>
              )
            })}
          </ul>
          <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-200 pt-3">
            <Stat label="Transformation" value={conversion === null ? '—' : `${conversion} %`} hint="90 j" />
            <Stat label="Panier moyen" value={basket === null ? '—' : eur0(basket)} />
            <Stat label="Abonnements/mois" value={eur0(mrr)} />
          </dl>
        </Card>
      </div>

      <div className="stagger mt-3 grid gap-3 lg:grid-cols-3">
        <FinanceCard />
        <InstagramMini />
        <NotesCard />
      </div>

      <SectionTitle>L'équipe</SectionTitle>
      <div className="stagger grid gap-3 lg:grid-cols-3">
        {data.profiles.map((p) => {
          const m = member(p)
          return (
            <Card key={p.id}>
              <div className="flex items-center gap-3">
                <Avatar profile={p} size={40} online={online.includes(p.id)} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{p.full_name}{p.id === me?.id && <span className="ml-1.5 font-normal text-slate-500">(moi)</span>}</p>
                  <p className="text-xs text-slate-500">{online.includes(p.id) ? 'En ligne' : 'Hors ligne'}</p>
                </div>
                {m.late > 0 && <Badge tone="rose">{plural(m.late, 'tâche en retard', 'tâches en retard')}</Badge>}
              </div>
              <dl className="mt-4 grid grid-cols-4 gap-2">
                <Stat label="Leads" value={String(m.deals)} />
                <Stat label="Potentiel" value={eur0(m.potential)} />
                <Stat label="Tâches" value={String(m.tasks)} />
                <Stat label="Projets" value={String(m.projects)} />
              </dl>
              <p className="mt-3 truncate border-t border-slate-200 pt-3 text-xs text-slate-500">
                {m.next ? <>Prochaine échéance : <span className="font-medium text-slate-900">{m.next.title}</span> · {m.next.due_date === today ? "aujourd'hui" : fmtDate(m.next.due_date)}</> : 'Aucune échéance planifiée.'}
              </p>
            </Card>
          )
        })}

        <Card title={<>À attribuer <span className="font-normal text-slate-500">{unassigned.length}</span></>} flush>
          {unassigned.length === 0 ? <p className="p-4 text-sm text-slate-500">Tous les leads ont un responsable.</p> : (
            <ul className="divide-y divide-slate-100">
              {unassigned.map((d) => (
                <li key={d.id} className="flex items-center gap-2 px-4 py-2.5">
                  <Link to={`/pipeline?lead=${d.id}`} className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900 hover:underline">{d.title}</span>
                    <span className="text-xs text-slate-500">{sourceLabel(d.source)} · {ago(d.created_at)}</span>
                  </Link>
                  <Button small variant="primary" onClick={() => run(() => update('deals', d.id, { owner_id: me!.id }), 'Lead attribué')}>Je prends</Button>
                  {data.profiles.filter((p) => p.id !== me?.id).map((p) => (
                    <button key={p.id} type="button" aria-label={`Attribuer à ${p.full_name}`} title={`Attribuer à ${p.full_name}`} onClick={() => run(() => update('deals', d.id, { owner_id: p.id }), `Lead attribué à ${p.full_name}`)} className="rounded-full transition-transform hover:scale-110">
                      <Avatar profile={p} size={30} />
                    </button>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="stagger mt-3 grid gap-3 lg:grid-cols-3">
        <Card title="Fil de l'agence" className="lg:col-span-2" flush>
          {feed.length === 0 ? <p className="p-4 text-sm text-slate-500">Aucune activité pour l'instant.</p> : (
            <ol className="divide-y divide-slate-100">
              {feed.map((a) => {
                const Icon = ACTIVITY_ICON[a.type]
                const author = a.author_id ? profile.get(a.author_id) : undefined
                const d = a.deal_id ? dealById.get(a.deal_id) : undefined
                return (
                  <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                    {author ? <Avatar profile={author} size={30} /> : <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600"><Icon size={14} aria-hidden /></span>}
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="text-slate-900">
                        <span className="font-semibold">{author?.full_name ?? (a.type === 'systeme' || a.type === 'relance' ? 'Automatisation' : 'Prospect')}</span>
                        <span className="text-slate-500"> · {ACTIVITY_LABEL[a.type]}</span>
                        {a.subject && <span> — {a.subject}</span>}
                      </p>
                      {a.body && <p className="mt-0.5 line-clamp-1 text-slate-600">{a.body}</p>}
                      <p className="mt-0.5 text-xs text-slate-500">
                        {d ? <Link to={`/pipeline?lead=${d.id}`} className="font-medium text-link hover:underline">{d.title}</Link> : a.company_id && company.get(a.company_id)?.name}
                        {' · '}{ago(a.occurred_at)}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </Card>

        <div className="grid min-w-0 gap-3">
          <Card title="Mes tâches du jour" action={<CardLink to="/taches">Toutes</CardLink>}>
            {myTasks.length === 0 ? <p className="text-sm text-slate-500">Rien d'urgent aujourd'hui.</p> : <ul className="-my-2 divide-y divide-slate-100">{myTasks.map((t) => <TaskRow key={t.id} task={t} showContext />)}</ul>}
          </Card>
          <Card title="Projets en production" action={<CardLink to="/projets">Projets</CardLink>} flush>
            {activeProjects.length === 0 ? <p className="p-4 text-sm text-slate-500">Aucun projet en cours.</p> : (
              <ul className="divide-y divide-slate-100">
                {activeProjects.map((p) => {
                  const openTasks = data.tasks.filter((t) => t.project_id === p.id && !t.done).length
                  const late = !!p.due_date && p.due_date < today
                  return (
                    <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{p.name}</p>
                        <p className="truncate text-xs text-slate-500">
                          {p.company_id && company.get(p.company_id)?.name} · <span className={late ? 'font-semibold text-rose-700' : ''}>livraison {fmtDate(p.due_date)}</span>
                          {openTasks > 0 && ` · ${plural(openTasks, 'tâche ouverte', 'tâches ouvertes')}`}
                        </p>
                      </div>
                      <Badge tone={p.status === 'en_recette' ? 'amber' : 'sky'}>{PROJECT_STATUSES.find((s) => s.id === p.status)?.label}</Badge>
                      <Avatar profile={p.owner_id ? profile.get(p.owner_id) : null} size={24} />
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* Sur les écrans plus étroits, l'agenda passe sous le tableau de bord */}
      <div className="mt-8 rounded-3xl border border-white/[0.07] bg-white/[0.04] p-4 xl:hidden"><AgendaPanel /></div>
    </>
  )
}
