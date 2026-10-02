import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DEFAULT_CONDITIONS, DEFAULT_INVOICE_TERMS, demoData } from './demo'
import { isoDay } from './format'
import type { LiveContext } from './runtime'
import type { Profile, Quote, Row, Settings, TableName, Tables } from './types'

const TABLE_CONFIG: Record<TableName, { pk: string; order: string; asc: boolean }> = {
  profiles: { pk: 'id', order: 'created_at', asc: true },
  companies: { pk: 'id', order: 'name', asc: true },
  contacts: { pk: 'id', order: 'last_name', asc: true },
  deals: { pk: 'id', order: 'created_at', asc: false },
  projects: { pk: 'id', order: 'created_at', asc: false },
  activities: { pk: 'id', order: 'occurred_at', asc: false },
  tasks: { pk: 'id', order: 'created_at', asc: false },
  quotes: { pk: 'id', order: 'created_at', asc: false },
  quote_lines: { pk: 'id', order: 'position', asc: true },
  qonto_accounts: { pk: 'id', order: 'name', asc: true },
  qonto_transactions: { pk: 'id', order: 'emitted_at', asc: false },
  qonto_invoices: { pk: 'id', order: 'issue_date', asc: false },
  subscriptions: { pk: 'id', order: 'created_at', asc: true },
  invoice_requests: { pk: 'id', order: 'created_at', asc: false },
  instagram_posts: { pk: 'id', order: 'posted_at', asc: false },
  instagram_messages: { pk: 'id', order: 'received_at', asc: false },
  instagram_schedule: { pk: 'id', order: 'scheduled_at', asc: true },
  instagram_stats: { pk: 'day', order: 'day', asc: false },
  news_items: { pk: 'id', order: 'published_at', asc: false },
  daily_briefs: { pk: 'day', order: 'day', asc: false },
  calendar_events: { pk: 'id', order: 'starts_at', asc: true },
  team_notes: { pk: 'id', order: 'id', asc: true },
  settings: { pk: 'id', order: 'id', asc: true },
  outbox: { pk: 'id', order: 'created_at', asc: false },
}
const TABLE_NAMES = Object.keys(TABLE_CONFIG) as TableName[]

type AnyRow = Record<string, unknown>

/** Où partent les écritures : rien en démo, la base partagée de l'artifact en production. */
interface Sink {
  put(table: TableName, row: AnyRow): Promise<void>
  del(table: TableName, id: string): Promise<void>
}

const DEFAULTS: Partial<Record<TableName, AnyRow>> = {
  deals: { stage: 'nouveau', source: 'autre', followup_count: 0, followups_paused: false, amount: null, owner_id: null, closed_at: null, lost_reason: null, need: null, message: null },
  tasks: { done: false, done_at: null, due_date: null, assignee_id: null, deal_id: null, company_id: null, project_id: null },
  quotes: { number: null, status: 'brouillon', total_ht: 0, total_vat: 0, total_ttc: 0, total_monthly: 0, notes: null },
  quote_lines: { details: null, billing: 'unique', offered: false, unit: null },
  invoice_requests: { status: 'brouillon', error: null, qonto_invoice_id: null, sent_at: null, terms: null, email_message: null, quote_id: null, subscription_id: null, period: null },
  subscriptions: { active: true, last_invoiced_month: null, project_id: null },
  companies: { client_type: 'entreprise', country: 'FR', qonto_client_id: null, billing_email: null, siret: null, vat_number: null, address: null, postal_code: null, city: null, website: null, sector: null, notes: null },
  contacts: { company_id: null, email: null, phone: null, job_title: null, instagram: null, notes: null },
  projects: { status: 'a_demarrer', company_id: null, deal_id: null, owner_id: null, start_date: null, due_date: null, budget: null, description: null },
  activities: { subject: null, body: null, deal_id: null, company_id: null, contact_id: null, author_id: null, external_id: null },
  outbox: { status: 'pending', kind: 'email', error: null, sent_at: null },
  instagram_messages: { handled: false, reply: null, reply_status: null },
  instagram_schedule: { status: 'brouillon', media_urls: [], error: null, post_id: null },
}

// Suppressions en cascade : ce que faisaient les clés étrangères d'une base SQL
const CASCADE: Partial<Record<TableName, { table: TableName; field: string; action: 'null' | 'delete' }[]>> = {
  companies: [
    { table: 'contacts', field: 'company_id', action: 'null' }, { table: 'deals', field: 'company_id', action: 'null' },
    { table: 'projects', field: 'company_id', action: 'null' }, { table: 'activities', field: 'company_id', action: 'delete' },
    { table: 'tasks', field: 'company_id', action: 'delete' }, { table: 'subscriptions', field: 'company_id', action: 'delete' },
    { table: 'qonto_invoices', field: 'company_id', action: 'null' },
  ],
  contacts: [{ table: 'deals', field: 'contact_id', action: 'null' }, { table: 'activities', field: 'contact_id', action: 'null' }],
  deals: [
    { table: 'activities', field: 'deal_id', action: 'delete' }, { table: 'tasks', field: 'deal_id', action: 'delete' },
    { table: 'projects', field: 'deal_id', action: 'null' }, { table: 'quotes', field: 'deal_id', action: 'null' },
    { table: 'instagram_messages', field: 'deal_id', action: 'null' },
  ],
  projects: [{ table: 'tasks', field: 'project_id', action: 'delete' }, { table: 'quotes', field: 'project_id', action: 'null' }, { table: 'subscriptions', field: 'project_id', action: 'null' }],
  quotes: [{ table: 'quote_lines', field: 'quote_id', action: 'delete' }, { table: 'invoice_requests', field: 'quote_id', action: 'null' }],
}

/**
 * Les règles métier du CRM (totaux des devis, numérotation SLA, suivi des relances, cascades),
 * appliquées en mémoire. En démo tout reste en mémoire ; en production chaque ligne modifiée
 * est recopiée dans la base partagée de l'artifact.
 */
function createBackend(initial: Tables, opts: { sink?: Sink; simulate: boolean }) {
  const db = initial as unknown as Record<TableName, AnyRow[]>
  const now = () => new Date().toISOString()
  const pk = (t: TableName) => TABLE_CONFIG[t].pk
  const find = (table: TableName, id: unknown) => db[table].find((r) => r[pk(table)] === id)
  let dirty = new Map<string, { table: TableName; row: AnyRow }>()
  let gone: { table: TableName; id: string }[] = []
  const touch = (table: TableName, row: AnyRow) => dirty.set(`${table}/${String(row[pk(table)])}`, { table, row })
  const drop = (table: TableName, row: AnyRow) => {
    db[table] = db[table].filter((x) => x !== row)
    dirty.delete(`${table}/${String(row[pk(table)])}`)
    gone.push({ table, id: String(row[pk(table)]) })
  }

  async function flush() {
    const writes = [...dirty.values()], deletions = gone
    dirty = new Map(); gone = []
    if (!opts.sink) return
    for (const w of writes) await opts.sink.put(w.table, w.row)
    for (const d of deletions) await opts.sink.del(d.table, d.id)
  }

  function totals(quoteId: unknown) {
    const doc = find('quotes', quoteId)
    if (!doc) return
    const sum = (billing: string) => db.quote_lines
      .filter((l) => l.quote_id === quoteId && l.billing === billing && !l.offered)
      .reduce((s, l) => s + Math.round(Number(l.quantity) * Number(l.unit_price) * 100) / 100, 0)
    const ht = sum('unique')
    Object.assign(doc, { total_ht: ht, total_monthly: sum('mensuel'), total_vat: Math.round(ht * Number(doc.vat_rate)) / 100 })
    doc.total_ttc = ht + Number(doc.total_vat)
    touch('quotes', doc)
  }

  function activityTouchesDeal(a: AnyRow) {
    const deal = find('deals', a.deal_id)
    if (!deal || a.type === 'systeme') return
    deal.last_activity_at = a.occurred_at
    if (a.type === 'relance') deal.followup_count = Number(deal.followup_count) + 1
    if (a.type === 'email_recu') deal.followup_count = 0
    touch('deals', deal)
  }

  function addActivity(row: AnyRow) {
    const a: AnyRow = { id: crypto.randomUUID(), created_at: now(), occurred_at: now(), ...DEFAULTS.activities, ...row }
    db.activities.push(a)
    touch('activities', a)
    activityTouchesDeal(a)
  }

  /** Démo uniquement : simule la création de la facture dans Qonto par Make. */
  function simulateInvoice(r: AnyRow) {
    const items = (r.items as { quantity: number; unit_price: number; vat_rate: number; offered?: boolean }[]) ?? []
    const ht = items.reduce((s, i) => s + (i.offered ? 0 : Number(i.quantity) * Number(i.unit_price)), 0)
    const vat = items.reduce((s, i) => s + (i.offered ? 0 : Number(i.quantity) * Number(i.unit_price) * Number(i.vat_rate)), 0)
    const year = String(r.issue_date).slice(0, 4)
    const count = db.qonto_invoices.filter((x) => String(x.number ?? '').startsWith(`F-${year}-`)).length
    const co = find('companies', r.company_id)
    const invoice = {
      id: crypto.randomUUID(), number: `F-${year}-${String(count + 1).padStart(3, '0')}`, status: 'unpaid',
      issue_date: r.issue_date, due_date: r.due_date, paid_at: null, total_ttc: Math.round((ht + vat) * 100) / 100,
      vat_amount: Math.round(vat * 100) / 100, client_name: co?.name ?? null, client_email: r.recipient_email ?? null,
      qonto_client_id: null, invoice_url: null, company_id: r.company_id, updated_at: now(),
    }
    db.qonto_invoices.unshift(invoice)
    markInvoiceSent(r, invoice.id)
    addActivity({ type: 'email_envoye', subject: `Facture ${invoice.number} envoyée`, company_id: r.company_id, author_id: r.created_by ?? null })
  }

  function markInvoiceSent(r: AnyRow, qontoId: string) {
    Object.assign(r, { status: 'envoyee', qonto_invoice_id: qontoId, sent_at: now(), error: null })
    touch('invoice_requests', r)
    const sub = find('subscriptions', r.subscription_id)
    if (sub && r.period) { sub.last_invoiced_month = r.period; touch('subscriptions', sub) }
  }

  const sorted = (table: TableName) => {
    const c = TABLE_CONFIG[table]
    return [...db[table]].sort((a, b) => {
      const x = String(a[c.order] ?? ''), y = String(b[c.order] ?? '')
      return c.asc ? x.localeCompare(y) : y.localeCompare(x)
    }).map((r) => ({ ...r }))
  }

  const api = {
    load: <T extends TableName>(table: T) => sorted(table) as unknown as Tables[T],
    /** Production : remplace une table par l'état reçu de la base partagée. */
    replace(table: TableName, rows: AnyRow[]) { db[table] = rows },
    async insert(table: TableName, row: AnyRow): Promise<AnyRow> {
      const r: AnyRow = { id: crypto.randomUUID(), created_at: now(), ...DEFAULTS[table], ...row }
      if (table === 'deals') r.last_activity_at ??= now()
      if (table === 'activities') r.occurred_at ??= now()
      if (table === 'quotes') r.issue_date ??= isoDay()
      db[table].push(r)
      touch(table, r)
      if (table === 'activities') activityTouchesDeal(r)
      if (table === 'quote_lines') totals(r.quote_id)
      if (table === 'quotes') totals(r.id)
      if (opts.simulate && table === 'invoice_requests' && r.status === 'a_envoyer') simulateInvoice(r)
      if (table === 'outbox' && r.status === 'sent') {
        addActivity({ type: r.kind === 'relance' ? 'relance' : 'email_envoye', subject: r.subject, body: r.body, deal_id: r.deal_id ?? null, contact_id: r.contact_id ?? null, author_id: r.created_by ?? null, company_id: find('contacts', r.contact_id)?.company_id ?? null })
      }
      await flush()
      return { ...r }
    },
    async update(table: TableName, id: unknown, patch: AnyRow): Promise<AnyRow> {
      const r = find(table, id)
      if (!r && (table === 'settings' || table === 'team_notes')) return api.insert(table, { id: true, ...patch })
      if (!r) throw new Error('Élément introuvable : il a peut-être été supprimé par votre associé.')
      if (table === 'deals' && patch.stage && patch.stage !== r.stage) {
        Object.assign(r, { followup_count: 0, last_activity_at: now(), closed_at: patch.stage === 'gagne' || patch.stage === 'perdu' ? now() : null })
      }
      Object.assign(r, patch)
      if (table === 'team_notes') r.updated_at = now()
      touch(table, r)
      if (table === 'quote_lines') totals(r.quote_id)
      if (table === 'quotes') totals(r.id)
      if (opts.simulate && table === 'instagram_messages' && patch.reply_status === 'pending') r.reply_status = 'sent'
      if (opts.simulate && table === 'invoice_requests' && patch.status === 'a_envoyer') simulateInvoice(r)
      await flush()
      return { ...r }
    },
    async remove(table: TableName, id: string) {
      const r = find(table, id)
      if (!r) return
      drop(table, r)
      for (const c of CASCADE[table] ?? []) {
        for (const child of db[c.table].filter((x) => x[c.field] === id)) {
          if (c.action === 'delete') drop(c.table, child)
          else { child[c.field] = null; touch(c.table, child) }
        }
      }
      if (table === 'quote_lines') totals(r.quote_id)
      await flush()
    },
    async finalize(id: string) {
      const d = find('quotes', id)
      if (!d) throw new Error('Devis introuvable')
      if (!d.number) {
        // Numérotation continue SLA-AAAA-NNN ; SLA-2026-001 et 002 ont été émis avant le CRM
        const year = String(d.issue_date).slice(0, 4)
        const prefix = `SLA-${year}-`
        const last = Math.max(year === '2026' ? 2 : 0, ...db.quotes
          .filter((x) => typeof x.number === 'string' && x.number.startsWith(prefix))
          .map((x) => Number(String(x.number).slice(prefix.length))))
        Object.assign(d, { number: prefix + String(last + 1).padStart(3, '0'), status: 'envoye' })
        touch('quotes', d)
      }
      await flush()
      return { ...d } as unknown as Quote
    },
    /** Production : facture créée dans Qonto par Make, on enregistre le résultat. */
    async recordInvoice(requestId: string, invoice: AnyRow) {
      const r = find('invoice_requests', requestId)
      const existing = find('qonto_invoices', invoice.id)
      if (existing) Object.assign(existing, invoice); else db.qonto_invoices.unshift(invoice)
      touch('qonto_invoices', existing ?? invoice)
      if (r) markInvoiceSent(r, String(invoice.id))
      await flush()
    },
  }
  return api
}
type Backend = ReturnType<typeof createBackend>

// ───────────────────────────── Store ─────────────────────────────

const EMPTY = () => Object.fromEntries(TABLE_NAMES.map((t) => [t, []])) as unknown as Tables

const DEFAULT_SETTINGS: Settings = {
  id: true, company_name: 'SL Agence', legal_form: null, address: null, postal_code: null, city: null,
  siret: null, ape: null, vat_number: null, email: null, phone: null, website: null,
  vat_mode: 'franchise', vat_rate: 20, quote_validity_days: 30, quote_conditions: DEFAULT_CONDITIONS, invoice_terms: DEFAULT_INVOICE_TERMS, monthly_goal: 5000,
  urssaf_rate: 24.6, vat_threshold: 37500, revenue_ceiling: 77700, weather_city: 'Friesen', weather_lat: 47.56, weather_lon: 7.15,
  followup_enabled: true, followup_delays: [3, 7, 14], followup_mode: 'brouillon', email_signature: 'Sacha et Loïc\nSL Agence — Applications métier, automatisation et IA',
}
const MEMBER_COLORS = ['#a9c49f', '#f0a58a', '#dfe8d8', '#7fa672']

interface Store {
  data: Tables
  me: Profile | null
  settings: Settings
  /** Identifiants des membres actuellement connectés au CRM. */
  online: string[]
  /** Vrai quand les données sont réelles et partagées (sinon : démonstration). */
  live: boolean
  loading: boolean
  error: string | null
  insert<T extends TableName>(table: T, row: Partial<Row<T>>): Promise<Row<T>>
  update<T extends TableName>(table: T, id: string | boolean, patch: Partial<Row<T>>): Promise<Row<T>>
  remove(table: TableName, id: string): Promise<void>
  finalizeQuote(id: string): Promise<Quote>
  /** Enregistre la facture renvoyée par Qonto pour une demande de facture. */
  recordInvoice(requestId: string, invoice: Record<string, unknown>): Promise<void>
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ userId, live, children }: { userId: string; live?: LiveContext; children: ReactNode }) {
  const backend = useMemo<Backend>(() => {
    if (!live) return createBackend(demoData(), { simulate: true })
    // Copie fidèle dans la base partagée : un document par ligne, sous « table/identifiant »
    const sink: Sink = {
      put: async (table, row) => {
        const body = JSON.parse(JSON.stringify(row)) as AnyRow
        if (table === 'profiles' && !live.keepNames) { delete body.full_name; delete body.email } // les noms viennent du compte claude.ai
        await live.db.collection(table).doc(String(row[TABLE_CONFIG[table].pk])).set(body)
      },
      del: (table, id) => live.db.collection(table).doc(id).delete(),
    }
    return createBackend(EMPTY(), { sink, simulate: false })
  }, [live])

  const [data, setData] = useState<Tables>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [present, setPresent] = useState<string[]>([])

  const refresh = useCallback((tables: TableName[]) => {
    setData((d) => {
      const next = { ...d } as Record<TableName, unknown>
      tables.forEach((t) => { next[t] = backend.load(t) })
      return next as unknown as Tables
    })
  }, [backend])

  // Démo : tout est déjà en mémoire. Production : une écoute en direct par table.
  useEffect(() => {
    if (!live) { refresh(TABLE_NAMES); setLoading(false); return }
    const pending = new Set<TableName>(TABLE_NAMES)
    const stops = TABLE_NAMES.map((t) => live.db.collection(t).onSnapshot(
      (snap) => {
        backend.replace(t, snap.docs.map((d) => ({ ...(d.data() ?? {}) })))
        refresh([t])
        if (pending.delete(t) && pending.size === 0) setLoading(false)
      },
      (e) => { setError(e.code === 'quota_exceeded' ? 'La base du CRM est pleine : supprimez d’anciens éléments.' : e.code === 'permission-denied' ? e.message : `Connexion à la base impossible (${e.message || e.code}).`); setLoading(false) },
    ))
    return () => stops.forEach((stop) => stop())
  }, [backend, live, refresh])

  // Production : chaque associé a sa fiche (couleur), créée à sa première visite
  const created = useRef(false)
  useEffect(() => {
    if (!live || loading || created.current || data.profiles.some((p) => p.id === userId)) return
    created.current = true
    backend.insert('profiles', { id: userId, color: MEMBER_COLORS[data.profiles.length % MEMBER_COLORS.length], email: live.me?.email ?? '', full_name: live.me?.name ?? '' })
      .then(() => refresh(['profiles'])).catch(() => {})
  }, [backend, data.profiles, live, loading, refresh, userId])

  // Production : les noms viennent du compte claude.ai de chacun (jamais stockés)
  const ids = data.profiles.map((p) => p.id).join(',')
  useEffect(() => {
    if (!live?.user || !ids) return
    live.user.profiles(ids.split(',')).then((ps) => setNames(Object.fromEntries(Object.entries(ps).map(([id, p]) => [id, p.name])))).catch(() => {})
  }, [ids, live])

  // Production : présence en direct de l'associé
  useEffect(() => {
    if (!live?.room) return
    const room = live.room
    void room.presence({ uid: userId }).catch(() => {})
    const stop = room.onPeers((change) => {
      setPresent([...new Set(change.peers.map((p) => p.by ?? (typeof p.presence.uid === 'string' ? p.presence.uid : null)).filter((x): x is string => !!x))])
    }, () => {})
    return stop
  }, [live, userId])

  const store = useMemo<Store>(() => {
    const profiles = data.profiles.map((p) => ({ ...p, full_name: names[p.id] || p.full_name || 'Associé' }))
    const view = { ...data, profiles }
    const run = async <R,>(fn: () => Promise<R>, tables: TableName[]): Promise<R> => {
      try { return await fn() } finally { refresh(tables) }
    }
    return {
      data: view,
      me: profiles.find((p) => p.id === userId) ?? null,
      settings: { ...DEFAULT_SETTINGS, ...(data.settings[0] ?? {}) },
      online: live ? present : profiles.map((p) => p.id),
      live: !!live,
      loading,
      error,
      insert: (table, row) => run(() => backend.insert(table, row as AnyRow) as never, TABLE_NAMES),
      update: (table, id, patch) => run(() => backend.update(table, id, patch as AnyRow) as never, TABLE_NAMES),
      remove: (table, id) => run(() => backend.remove(table, id), TABLE_NAMES),
      finalizeQuote: (id) => run(() => backend.finalize(id), ['quotes']),
      recordInvoice: (requestId, invoice) => run(() => backend.recordInvoice(requestId, invoice), TABLE_NAMES),
    }
  }, [backend, data, error, live, loading, names, present, refresh, userId])

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const s = useContext(StoreContext)
  if (!s) throw new Error('useStore doit être utilisé dans StoreProvider')
  return s
}
