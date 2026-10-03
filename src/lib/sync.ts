import { useCallback } from 'react'
import { useAction } from '../components/ui'
import { isoDay } from './format'
import { logSync } from './firebase'
import { callMake, MAKE_READY } from './make'
import { use, type SampleApi } from './runtime'
import { useStore } from './store'
import type { InvoiceStatus } from './types'

/** Identifiant stable d'une demande : les deux associés peuvent l'importer en même temps sans doublon. */
function refId(ref: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < ref.length; i++) h = Math.imul(h ^ ref.charCodeAt(i), 0x01000193)
  return `site-${(h >>> 0).toString(36)}-${ref.length}`
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase()
const same = (a: Record<string, unknown>, b: Record<string, unknown>) => Object.keys(b).every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null))

/** Synchronisation automatique : sans message, ni en cas de succès ni d'échec. */
function quiet<T>(key: string, silent: boolean, run: ReturnType<typeof useAction>, fn: () => Promise<T>, success: string): Promise<T | undefined> {
  const logged = () => fn().then(
    (r) => { logSync(key, { ok: true, detail: JSON.stringify(r ?? null) }); return r },
    (e: unknown) => { logSync(key, { ok: false, detail: e instanceof Error ? `${e.message}\n${e.stack ?? ''}`.slice(0, 1500) : String(e) }); throw e },
  )
  return silent ? logged().catch(() => undefined) : run(logged, success)
}

/** Dernière exécution d'une synchronisation, mémorisée dans ce navigateur. */
export function due(key: string, minutes: number): boolean {
  try {
    const last = Number(localStorage.getItem(`crm-sync-${key}`) ?? 0)
    if (Date.now() - last < minutes * 60_000) return false
    localStorage.setItem(`crm-sync-${key}`, String(Date.now()))
  } catch { /* stockage indisponible : on synchronise */ }
  return true
}

/** Qonto → CRM : solde des comptes et factures clients (statut de paiement compris). */
export function useQontoSync() {
  const { data, insert, update } = useStore()
  const run = useAction()
  return useCallback((silent = false) => quiet('qonto', silent, run, async () => {
    const out = await callMake('qonto')
    const accounts = Array.isArray(out.comptes) ? out.comptes as Record<string, unknown>[] : []
    const invoices = Array.isArray(out.factures) ? out.factures as Record<string, unknown>[] : []
    const now = new Date().toISOString()

    for (const a of accounts) {
      const iban = String(a.iban ?? '')
      const row = { name: `Compte ${iban.slice(-4)}`, iban, balance: Number(a.balance ?? 0), currency: String(a.currency ?? 'EUR'), updated_at: now }
      const id = String(a.slug ?? iban)
      const existing = data.qonto_accounts.find((x) => x.id === id)
      if (!existing) await insert('qonto_accounts', { id, ...row })
      else if (existing.balance !== row.balance) await update('qonto_accounts', id, row)
    }

    let added = 0
    for (const f of invoices) {
      const id = String(f.id ?? '')
      if (!id) continue
      const existing = data.qonto_invoices.find((x) => x.id === id)
      const company = existing?.company_id ?? data.companies.find((c) =>
        (f.client_id && c.qonto_client_id === f.client_id) || norm(c.name) === norm(f.client_name) || (f.client_email && norm(c.billing_email) === norm(f.client_email)),
      )?.id ?? data.contacts.find((c) => f.client_email && norm(c.email) === norm(f.client_email))?.company_id ?? null
      const total = Number(f.total ?? 0), vat = Number(f.vat ?? 0)
      const row = {
        number: (f.number as string) || null, status: (String(f.status ?? 'unpaid') as InvoiceStatus),
        issue_date: (f.issue_date as string) || null, due_date: (f.due_date as string) || null, paid_at: (f.paid_at as string) || null,
        total_ttc: total, vat_amount: vat, client_name: (f.client_name as string) || null, client_email: (f.client_email as string) || null,
        qonto_client_id: (f.client_id as string) || null, invoice_url: (f.invoice_url as string) || null, company_id: company,
      }
      if (!existing) { await insert('qonto_invoices', { id, ...row, updated_at: now }); added += 1 }
      else if (!same(existing as unknown as Record<string, unknown>, row)) await update('qonto_invoices', id, { ...row, updated_at: now })
    }
    return { accounts: accounts.length, invoices: invoices.length, added }
  }, 'Qonto synchronisé'), [data, insert, run, update])
}

/** Parse les dates du tableau des demandes (ISO, « 02/10/2026 14:32 »…). */
function parseDate(v: unknown): Date | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  const fr = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/)
  const d = fr ? new Date(Number(fr[3]), Number(fr[2]) - 1, Number(fr[1]), Number(fr[4] ?? 12), Number(fr[5] ?? 0)) : new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Formulaire du site → nouveaux leads (dédoublonnés, demandes des 60 derniers jours). */
export function useImportLeads() {
  const { data, insert } = useStore()
  const run = useAction()
  return useCallback((silent = false) => quiet('demandes', silent, run, async () => {
    const out = await callMake('demandes')
    const rows = Array.isArray(out.lignes) ? out.lignes as unknown[][] : []
    const known = new Set(data.deals.map((d) => d.external_ref).filter(Boolean))
    const companies = [...data.companies], contacts = [...data.contacts]
    let added = 0
    for (const r of rows) {
      const [date, prenom, nom, entreprise, email, telephone, theme, message, source] = r.map((x) => String(x ?? '').trim())
      const when = parseDate(date)
      if (when && Date.now() - when.getTime() > 60 * 86_400_000) continue
      const ref = `site:${date}:${email.toLowerCase()}`
      if (known.has(ref) || (!email && !nom && !entreprise)) continue
      known.add(ref)

      let contact = email ? contacts.find((c) => norm(c.email) === norm(email)) : undefined
      let companyId = contact?.company_id ?? null
      if (!companyId && entreprise) {
        const co = companies.find((c) => norm(c.name) === norm(entreprise)) ?? await insert('companies', { name: entreprise })
        if (!companies.includes(co)) companies.push(co)
        companyId = co.id
      }
      if (!contact) {
        contact = await insert('contacts', { company_id: companyId, first_name: prenom, last_name: nom, email: email || null, phone: telephone || null })
        contacts.push(contact)
      }
      const who = entreprise || `${prenom} ${nom}`.trim() || 'Demande du site'
      const deal = await insert('deals', {
        id: refId(ref), title: theme ? `${who} — ${theme}` : who, company_id: companyId, contact_id: contact.id, source: 'formulaire',
        need: theme || null, message: message || null, external_ref: ref, ...(when ? { created_at: when.toISOString() } : {}),
      })
      await insert('activities', { type: 'systeme', subject: `Demande reçue via le site${source ? ` (${source})` : ''}`, deal_id: deal.id, company_id: companyId, contact_id: contact.id })
      added += 1
    }
    return added
  }, 'Demandes du site importées'), [data, insert, run])
}

/** Point du jour rédigé par Claude à partir des chiffres du CRM, partagé entre les associés. */
export function useWriteBrief() {
  const { data, insert, settings } = useStore()
  const run = useAction()
  return useCallback(() => run(async () => {
    const sample = await use<SampleApi>('sample')
    if (!sample) throw new Error('Claude n’est pas disponible dans cette vue.')
    const today = isoDay()
    const open = data.deals.filter((d) => ['nouveau', 'contacte', 'rdv', 'devis_envoye'].includes(d.stage))
    const facts = {
      date: today,
      leads_en_cours: open.length, nouveaux: data.deals.filter((d) => d.stage === 'nouveau').map((d) => d.title),
      potentiel_euros: open.reduce((s, d) => s + Number(d.amount ?? 0), 0),
      devis_en_attente: data.quotes.filter((q) => q.status === 'envoye').map((q) => `${q.number} ${q.title}`),
      factures_impayees: data.qonto_invoices.filter((i) => i.status === 'unpaid').map((i) => `${i.number} ${i.client_name} ${i.total_ttc} € échéance ${i.due_date}`),
      taches_du_jour: data.tasks.filter((t) => !t.done && t.due_date && t.due_date <= today).map((t) => t.title),
      solde_qonto: data.qonto_accounts.reduce((s, a) => s + Number(a.balance), 0),
      objectif_mensuel: settings.monthly_goal,
    }
    const { text } = await sample(
      `Tu es l'assistant de SL Agence (automatisation et IA pour les TPE d'Alsace), dirigée par Sacha et Loïc. ` +
      `Rédige le point du jour en français : 3 à 4 phrases, ton direct et concret, sans liste ni titre, sans formule de politesse. ` +
      `Commence par ce qui demande une action aujourd'hui, puis l'état commercial et financier. N'invente aucun chiffre.\n\nDonnées du CRM :\n${JSON.stringify(facts)}`,
      { modelTier: 'quick', cache: false },
    )
    const existing = data.daily_briefs.find((b) => b.day === today)
    if (existing) return text
    await insert('daily_briefs', { day: today, content: text.trim(), created_at: new Date().toISOString() })
    return text
  }, 'Point du jour rédigé'), [data, insert, run, settings])
}

/** Synchronisations Qonto et demandes du site : actives dès que Make est branché. */
export const SYNC_ENABLED = MAKE_READY
