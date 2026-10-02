import { ask } from '../components/Confirm'
import { useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AtSign, CalendarClock, Check, FilePlus2, FolderPlus, Globe, Handshake, Mail, Megaphone, Phone, Plus, RefreshCw,
  Search, Trash2, UserRound, X, type LucideIcon,
} from 'lucide-react'
import { Kanban } from '../components/Kanban'
import { ComposeEmail, TaskList, Timeline } from '../components/shared'
import {
  Avatar, Badge, Button, Drawer, Field, FormActions, Input, Modal, OwnerFilter, PageHeader, Select, TextField, useAction,
} from '../components/ui'
import { useCreateQuote } from '../lib/actions'
import { celebrate } from '../lib/effects'
import { SYNC_ENABLED, useImportLeads } from '../lib/sync'
import { OPEN_STAGES, QUOTE_STATUS, SOURCES, STAGES, sourceLabel } from '../lib/constants'
import { ago, contactName, daysSince, eur0, fmtDate, isoDay, parseNumber } from '../lib/format'
import { followupDue, useLookups } from '../lib/selectors'
import { useStore } from '../lib/store'
import type { Deal, Source, Stage } from '../lib/types'

const SOURCE_ICON: Record<Source, LucideIcon> = {
  formulaire: Globe, instagram: AtSign, email: Mail, recommandation: Handshake, prospection: Megaphone, autre: UserRound,
}

export function Pipeline() {
  const { data, update, settings, me } = useStore()
  const { company, contact, profile } = useLookups()
  const run = useAction()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [owner, setOwner] = useState('')
  const [creating, setCreating] = useState(params.get('nouveau') === '1')
  const importLeads = useImportLeads()
  const toastNone = () => run(async () => { throw new Error('Aucune nouvelle demande sur le site.') })
  const today = isoDay()

  const openId = params.get('lead')
  const open = (id: string | null) => setParams(id ? { lead: id } : {}, { replace: true })

  const deals = useMemo(() => {
    const q = search.trim().toLowerCase()
    return data.deals.filter((d) =>
      (!owner || d.owner_id === owner) &&
      (!q || d.title.toLowerCase().includes(q) || (d.company_id && company.get(d.company_id)?.name.toLowerCase().includes(q))))
  }, [data.deals, search, owner, company])

  const inProgress = deals.filter((d) => OPEN_STAGES.includes(d.stage))
  const selected = data.deals.find((d) => d.id === openId)

  return (
    <>
      <PageHeader title="Pipeline" subtitle={`${inProgress.length} leads en cours · ${eur0(inProgress.reduce((s, d) => s + Number(d.amount ?? 0), 0))} de potentiel`}>
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-3 z-10 text-slate-400" aria-hidden />
          <Input aria-label="Rechercher un lead" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" className="!w-44 !rounded-full pl-9" />
        </div>
        <OwnerFilter profiles={data.profiles} value={owner} onChange={setOwner} />
        {SYNC_ENABLED && <Button icon={Globe} onClick={async () => { const n = await importLeads(); if (n === 0) toastNone() }}>Demandes du site</Button>}
        <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Nouveau lead</Button>
      </PageHeader>

      <Kanban
        columns={STAGES}
        items={deals}
        columnOf={(d) => d.stage}
        onMove={(id, stage) => { if (stage === 'gagne') celebrate(); run(() => update('deals', id, { stage: stage as Stage }), stage === 'gagne' ? 'Bravo, lead gagné !' : undefined) }}
        onOpen={(d) => open(d.id)}
        columnSummary={(items) => { const v = items.reduce((s, d) => s + Number(d.amount ?? 0), 0); return v ? eur0(v) : null }}
        renderCard={(d) => {
          const SourceIcon = SOURCE_ICON[d.source]
          const person = d.contact_id ? contact.get(d.contact_id) : undefined
          const [who, what] = d.title.split(' — ')
          const next = data.tasks.filter((t) => t.deal_id === d.id && !t.done && t.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!))[0]
          const closed = d.stage === 'gagne' || d.stage === 'perdu'
          return (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-xs text-slate-500"><SourceIcon size={12} aria-hidden />{sourceLabel(d.source)}</span>
                {d.owner_id
                  ? <Avatar profile={profile.get(d.owner_id)} size={22} />
                  : !closed && <span className="rounded-full border border-dashed border-rose-300 px-2 text-[11px] font-medium leading-5 text-rose-700">À attribuer</span>}
              </div>
              <p className="mt-2 text-sm font-semibold leading-snug text-slate-900">{who}</p>
              {what && <p className="text-[13px] leading-snug text-slate-600">{what}</p>}
              {person && <p className="mt-1.5 flex items-center gap-1 text-xs text-slate-500"><UserRound size={12} aria-hidden />{contactName(person)}</p>}
              {next && (
                <p className={`mt-1 flex items-center gap-1 text-xs ${next.due_date! < today ? 'font-semibold text-rose-700' : 'text-slate-500'}`}>
                  <CalendarClock size={12} className="shrink-0" aria-hidden /><span className="truncate">{next.title}</span><span className="shrink-0">· {next.due_date === today ? "aujourd'hui" : fmtDate(next.due_date)}</span>
                </p>
              )}
              <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
                <span className="text-xs text-slate-500">{closed ? fmtDate(d.closed_at) : ago(d.last_activity_at)}</span>
                <span className="flex min-w-0 items-center gap-2">
                  {followupDue(d, settings) && <Badge tone="amber">À relancer</Badge>}
                  {d.stage === 'perdu' && d.lost_reason && <span className="truncate text-xs text-slate-500">{d.lost_reason}</span>}
                  {d.amount != null && <span className="text-[13px] font-semibold tabular-nums text-slate-900">{eur0(d.amount)}</span>}
                </span>
              </div>
            </>
          )
        }}
      />

      {creating && <NewDeal defaultOwner={owner || me?.id || ''} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); open(id) }} />}
      {selected && <DealDrawer key={selected.id} deal={selected} onClose={() => open(null)} />}
    </>
  )
}

// ───────────────────────────── Nouveau lead ─────────────────────────────

function NewDeal({ defaultOwner, onClose, onCreated }: { defaultOwner: string; onClose: () => void; onCreated: (id: string) => void }) {
  const { data, insert } = useStore()
  const run = useAction()
  const [busy, setBusy] = useState(false)
  const [form, setFormState] = useState({
    company: '', first_name: '', last_name: '', email: '', phone: '', need: '',
    source: 'prospection' as Source, amount: '', owner_id: defaultOwner,
  })
  const set = (patch: Partial<typeof form>) => setFormState((f) => ({ ...f, ...patch }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const deal = await run(async () => {
      const name = form.company.trim()
      const email = form.email.trim().toLowerCase()
      let contact = email ? data.contacts.find((c) => c.email?.toLowerCase() === email) : undefined
      let companyId = contact?.company_id ?? null
      if (!companyId && name) {
        const existing = data.companies.find((c) => c.name.toLowerCase() === name.toLowerCase())
        companyId = (existing ?? await insert('companies', { name })).id
      }
      if (!contact && (form.first_name || form.last_name || email)) {
        contact = await insert('contacts', {
          company_id: companyId, first_name: form.first_name.trim(), last_name: form.last_name.trim(),
          email: email || null, phone: form.phone.trim() || null,
        })
      }
      const who = name || `${form.first_name} ${form.last_name}`.trim() || 'Nouveau lead'
      return insert('deals', {
        title: form.need.trim() ? `${who} — ${form.need.trim()}` : who,
        company_id: companyId, contact_id: contact?.id ?? null, source: form.source,
        need: form.need.trim() || null, amount: parseNumber(form.amount), owner_id: form.owner_id || null,
      })
    }, 'Lead créé')
    setBusy(false)
    if (deal) onCreated(deal.id)
  }

  return (
    <Modal title="Nouveau lead" onClose={onClose} wide>
      <form onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Entreprise" className="sm:col-span-2">
            {(id) => (
              <>
                <Input id={id} list="companies-list" value={form.company} onChange={(e) => set({ company: e.target.value })} placeholder="Nom de l'entreprise" />
                <datalist id="companies-list">{data.companies.map((c) => <option key={c.id} value={c.name} />)}</datalist>
              </>
            )}
          </Field>
          <TextField label="Prénom" form={form} set={set} name="first_name" />
          <TextField label="Nom" form={form} set={set} name="last_name" />
          <TextField label="E-mail" form={form} set={set} name="email" type="email" />
          <TextField label="Téléphone" form={form} set={set} name="phone" type="tel" />
          <TextField label="Besoin" form={form} set={set} name="need" className="sm:col-span-2" placeholder="Ex. : relances de devis automatiques" />
          <Field label="Source">
            {(id) => <Select id={id} value={form.source} onChange={(e) => set({ source: e.target.value as Source })}>{SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>}
          </Field>
          <TextField label="Montant estimé (€)" form={form} set={set} name="amount" />
          <Field label="Responsable" className="sm:col-span-2">
            {(id) => (
              <Select id={id} value={form.owner_id} onChange={(e) => set({ owner_id: e.target.value })}>
                <option value="">Non attribué</option>
                {data.profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <FormActions onCancel={onClose} submitLabel="Créer le lead" busy={busy || (!form.company.trim() && !form.first_name.trim() && !form.last_name.trim())} />
      </form>
    </Modal>
  )
}

// ───────────────────────────── Fiche lead ─────────────────────────────

/** Avancement du lead : chaque étape est un bouton, « Perdu » est à part. */
function StageStepper({ stage, onChange }: { stage: Stage; onChange: (s: Stage) => void }) {
  const steps = STAGES.filter((s) => s.id !== 'perdu')
  const current = steps.findIndex((s) => s.id === stage)
  return (
    <div className="flex items-stretch gap-2">
      <ol className="flex min-w-0 flex-1 gap-1" aria-label="Étape du lead">
        {steps.map((s, i) => {
          const done = stage !== 'perdu' && i < current
          const active = i === current
          return (
            <li key={s.id} className="min-w-0 flex-1">
              <button
                type="button" aria-current={active ? 'step' : undefined} onClick={() => onChange(s.id)} title={s.label}
                className={`flex h-9 w-full items-center justify-center gap-1 rounded-full px-2 text-xs font-medium transition-colors ${
                  active ? 'bg-vert text-white' : done ? 'bg-emerald-50 text-emerald-800 hover:bg-slate-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {done && <Check size={12} className="shrink-0" aria-hidden />}<span className="truncate">{s.label}</span>
              </button>
            </li>
          )
        })}
      </ol>
      <button
        type="button" aria-pressed={stage === 'perdu'} onClick={() => onChange('perdu')}
        className={`flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-medium transition-colors ${stage === 'perdu' ? 'bg-rose-700 text-white' : 'border border-slate-300 text-slate-600 hover:bg-rose-50 hover:text-rose-700'}`}
      >
        <X size={12} aria-hidden />Perdu
      </button>
    </div>
  )
}

function DealDrawer({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  const { data, update, remove, insert, settings, me } = useStore()
  const { company, contact } = useLookups()
  const run = useAction()
  const createQuote = useCreateQuote()
  const [title, setTitle] = useState(deal.title)
  const [amount, setAmount] = useState(deal.amount?.toString() ?? '')
  const [lostReason, setLostReason] = useState(deal.lost_reason ?? '')
  const [email, setEmail] = useState<'email' | 'relance' | null>(null)

  const co = deal.company_id ? company.get(deal.company_id) : undefined
  const person = deal.contact_id ? contact.get(deal.contact_id) : undefined
  const activities = data.activities.filter((a) => a.deal_id === deal.id)
  const tasks = data.tasks.filter((t) => t.deal_id === deal.id)
  const project = data.projects.find((p) => p.deal_id === deal.id)
  const quotes = data.quotes.filter((q) => q.deal_id === deal.id)
  const due = followupDue(deal, settings)
  const save = (patch: Partial<Deal>) => run(() => update('deals', deal.id, patch))

  return (
    <Drawer
      onClose={onClose}
      title={
        <>
          <input
            aria-label="Titre du lead" value={title} onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== deal.title && save({ title: title.trim() })}
            className="-ml-1 w-full rounded-lg px-1 text-base font-semibold text-slate-900 hover:bg-slate-100"
          />
          <p className="mt-0.5 text-sm text-slate-500">
            {co ? <Link to={`/clients/${co.id}`} className="font-medium text-link hover:underline">{co.name}</Link> : 'Sans entreprise'}
            {' · '}{sourceLabel(deal.source)} · créé {ago(deal.created_at)}
          </p>
        </>
      }
    >
      <div className="space-y-6 p-5">
        <StageStepper stage={deal.stage} onChange={(stage) => { if (stage === deal.stage) return; if (stage === 'gagne') celebrate(); save({ stage }) }} />

        {!deal.owner_id && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-dashed border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <span className="font-medium">Ce lead n'a pas encore de responsable.</span>
            <Button small variant="primary" onClick={() => save({ owner_id: me!.id })}>Je prends</Button>
          </div>
        )}

        {due && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span>Relance n° {deal.followup_count + 1} à faire : sans nouvelles depuis {daysSince(deal.last_activity_at)} jours.</span>
            {person?.email && <Button small icon={RefreshCw} onClick={() => setEmail('relance')}>Relancer</Button>}
          </div>
        )}

        {person && (
          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="eyebrow text-slate-500">Interlocuteur</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{contactName(person)}{person.job_title && <span className="font-normal text-slate-500"> · {person.job_title}</span>}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {person.phone && <a href={`tel:${person.phone.replace(/\s/g, '')}`} className="inline-flex h-8 items-center gap-2 rounded-full bg-vert px-3 text-[13px] font-medium text-white hover:bg-vert-fonce"><Phone size={14} aria-hidden />{person.phone}</a>}
              {person.email && <Button small icon={Mail} onClick={() => setEmail('email')}>Écrire un e-mail</Button>}
              <Button small icon={FilePlus2} disabled={!deal.company_id} title={deal.company_id ? undefined : 'Rattachez d’abord le lead à une entreprise'} onClick={() => createQuote({ company_id: deal.company_id!, contact_id: deal.contact_id, deal_id: deal.id, title: deal.need ?? '' })}>Créer un devis</Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Responsable">
            {(id) => (
              <Select id={id} value={deal.owner_id ?? ''} onChange={(e) => save({ owner_id: e.target.value || null })}>
                <option value="">Non attribué</option>
                {data.profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Montant estimé (€)">
            {(id) => <Input id={id} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} onBlur={() => parseNumber(amount) !== deal.amount && save({ amount: parseNumber(amount) })} />}
          </Field>
          <Field label="Source" className={deal.stage === 'perdu' ? '' : 'col-span-2'}>
            {(id) => <Select id={id} value={deal.source} onChange={(e) => save({ source: e.target.value as Source })}>{SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>}
          </Field>
          {deal.stage === 'perdu' && (
            <Field label="Raison de la perte">
              {(id) => <Input id={id} value={lostReason} onChange={(e) => setLostReason(e.target.value)} onBlur={() => lostReason !== (deal.lost_reason ?? '') && save({ lost_reason: lostReason || null })} placeholder="Prix, délai, pas de réponse…" />}
            </Field>
          )}
        </div>

        {(deal.need || deal.message) && (
          <div>
            <h3 className="eyebrow mb-1.5 text-slate-500">Besoin exprimé</h3>
            {deal.need && <p className="text-sm font-medium text-slate-900">{deal.need}</p>}
            {deal.message && <p className="mt-1.5 whitespace-pre-wrap rounded-2xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">« {deal.message} »</p>}
          </div>
        )}

        {(quotes.length > 0 || project || deal.stage === 'gagne') && (
          <div>
            <h3 className="eyebrow mb-1.5 text-slate-500">Devis et projet</h3>
            <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
              {quotes.map((q) => (
                <li key={q.id}>
                  <Link to={`/devis/${q.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-slate-50">
                    <span className="font-medium text-slate-900">{q.number ?? 'Devis (brouillon)'}</span>
                    <span className="flex items-center gap-3"><span className="tabular-nums text-slate-700">{eur0(q.total_ttc)}</span><Badge tone={QUOTE_STATUS[q.status].tone}>{QUOTE_STATUS[q.status].label}</Badge></span>
                  </Link>
                </li>
              ))}
              {project && <li><Link to="/projets" className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-slate-50"><span className="font-medium text-slate-900">Projet : {project.name}</span><Badge tone="sky">Ouvrir</Badge></Link></li>}
              {deal.stage === 'gagne' && !project && (
                <li className="px-4 py-2.5">
                  <Button small icon={FolderPlus} onClick={() => run(() => insert('projects', { name: deal.need || deal.title, company_id: deal.company_id, deal_id: deal.id, owner_id: deal.owner_id, budget: deal.amount, status: 'a_demarrer' }), 'Projet créé')}>Créer le projet</Button>
                </li>
              )}
            </ul>
          </div>
        )}

        <div>
          <h3 className="eyebrow mb-2 text-slate-500">Tâches</h3>
          <TaskList tasks={tasks} link={{ deal_id: deal.id, company_id: deal.company_id }} />
        </div>

        <div>
          <h3 className="eyebrow mb-2 text-slate-500">Historique</h3>
          <Timeline activities={activities} link={{ deal_id: deal.id, company_id: deal.company_id, contact_id: deal.contact_id }} />
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 pt-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={deal.followups_paused} onChange={(e) => save({ followups_paused: e.target.checked })} className="h-4 w-4 accent-vert" />
            Suspendre les relances automatiques
          </label>
          <Button
            variant="danger" small icon={Trash2}
            onClick={() => void ask('Supprimer ce lead et son historique ?').then((ok): unknown => ok && run(async () => { await remove('deals', deal.id); onClose() }, 'Lead supprimé'))}
          >
            Supprimer
          </Button>
        </div>
      </div>

      {email && person?.email && (
        <ComposeEmail
          to={person.email}
          kind={email}
          subject={email === 'relance' ? `Suite à notre échange${co ? ` — ${co.name}` : ''}` : ''}
          body={email === 'relance'
            ? `Bonjour ${person.first_name},\n\nJe me permets de revenir vers vous au sujet de votre projet${deal.need ? ` (${deal.need.toLowerCase()})` : ''}. Avez-vous pu avancer de votre côté ?\n\nJe reste disponible pour en reparler quand vous le souhaitez.\n\n${settings.email_signature}`
            : undefined}
          link={{ deal_id: deal.id, contact_id: person.id }}
          onClose={() => setEmail(null)}
        />
      )}
    </Drawer>
  )
}
