import { ask } from '../components/Confirm'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle, ArrowLeft, Check, ExternalLink, FileText, Landmark, Mail, Pause, Pencil, Play, Plus, Receipt, Repeat, Send,
  Trash2,
} from 'lucide-react'
import { ComposeEmail } from '../components/shared'
import {
  Badge, Button, Card, Empty, Field, FormActions, IconButton, Input, Modal, PageHeader, Select, Textarea, useAction,
} from '../components/ui'
import { contactName, daysSince, eur, eur0, fmtDate, fmtDateLong, isoDay, addDays, parseNumber } from '../lib/format'
import { isOverdue, useLookups } from '../lib/selectors'
import { LIVE } from '../lib/env'
import { useStore } from '../lib/store'
import type { Company, InvoiceItem, InvoiceRequest, QontoInvoice, Subscription } from '../lib/types'
import { CompanyForm } from './Clients'
import { InvoiceBadge } from './Documents'

const monthLabel = (period: string) => new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(`${period}-01T12:00:00`))
export const currentPeriod = () => isoDay().slice(0, 7)

export const itemsTotal = (items: InvoiceItem[]) => {
  const ht = items.reduce((s, i) => s + (i.offered ? 0 : Number(i.quantity) * Number(i.unit_price)), 0)
  const vat = items.reduce((s, i) => s + (i.offered ? 0 : Number(i.quantity) * Number(i.unit_price) * Number(i.vat_rate)), 0)
  return { ht, vat, ttc: ht + vat }
}

/** Adresse qui recevra la facture : e-mail de facturation du client, sinon son premier contact. */
function useRecipient() {
  const { data } = useStore()
  return (company: Company | undefined) =>
    company?.billing_email ?? data.contacts.find((c) => c.company_id === company?.id && c.email)?.email ?? null
}

/** Prépare une facture : brouillon dans le CRM, puis Qonto la crée et l'envoie à son format. */
export function useCreateInvoice() {
  const { insert, me, settings } = useStore()
  const { company } = useLookups()
  const recipient = useRecipient()
  const navigate = useNavigate()
  const run = useAction()
  return (companyId: string, items: InvoiceItem[], extra: Partial<InvoiceRequest> = {}) => run(async () => {
    const vat = settings.vat_mode === 'assujetti' ? settings.vat_rate / 100 : 0
    const today = isoDay()
    const request = await insert('invoice_requests', {
      company_id: companyId, recipient_email: recipient(company.get(companyId)),
      items: items.length ? items : [{ title: '', description: '', quantity: 1, unit: 'forfait', unit_price: 0, vat_rate: vat }],
      issue_date: today, due_date: addDays(today, 30), terms: settings.invoice_terms, status: 'brouillon', created_by: me?.id ?? null, ...extra,
    })
    navigate(`/factures/${request.id}`)
    return request
  })
}

/** Envoie la facture du mois d'un abonnement, en un clic. */
/** Tant que la connexion Qonto en écriture n'est pas autorisée dans Make, rien ne part. */
export const QONTO_INVOICING_READY = !LIVE
const NOT_READY = 'La création des factures dans Qonto sera active dès que l’autorisation « Qonto facturation » sera validée dans Make (lien envoyé par Claude). Votre brouillon est gardé.'

export function useSendSubscription() {
  const { insert, me, settings, data } = useStore()
  const { company } = useLookups()
  const recipient = useRecipient()
  const run = useAction()
  return (s: Subscription, period = currentPeriod()) => {
    if (!QONTO_INVOICING_READY) return run(async () => { throw new Error(NOT_READY) })
    const co = company.get(s.company_id)
    const to = recipient(co)
    if (!to) return run(async () => { throw new Error(`Ajoutez l'e-mail de facturation de ${co?.name ?? 'ce client'} dans sa fiche.`) })
    if (data.invoice_requests.some((r) => r.subscription_id === s.id && r.period === period && r.status !== 'erreur')) {
      return run(async () => { throw new Error(`La facture de ${monthLabel(period)} est déjà partie.`) })
    }
    const today = isoDay()
    return run(() => insert('invoice_requests', {
      company_id: s.company_id, recipient_email: to, subscription_id: s.id, period, status: 'a_envoyer', created_by: me?.id ?? null,
      issue_date: today, due_date: addDays(today, 15), terms: settings.invoice_terms,
      items: [{ title: s.label.slice(0, 40), description: `Abonnement mensuel — ${monthLabel(period)}`, quantity: 1, unit: 'mois', unit_price: Number(s.amount), vat_rate: settings.vat_mode === 'assujetti' ? settings.vat_rate / 100 : 0 }],
    }), `Facture de ${eur(s.amount)} envoyée à ${co?.name}`)
  }
}

// ───────────────────────────── Onglet Factures ─────────────────────────────

const TH = 'eyebrow px-4 py-3 text-slate-500'

export function InvoicesTab({ onNew }: { onNew: () => void }) {
  const { data, update } = useStore()
  const { company } = useLookups()
  const run = useAction()
  const [reminder, setReminder] = useState<QontoInvoice | null>(null)
  const pending = data.invoice_requests.filter((r) => r.status !== 'envoyee')
  const invoices = data.qonto_invoices.filter((i) => i.status !== 'canceled')
  const month = currentPeriod()
  const unpaid = invoices.filter((i) => i.status === 'unpaid')
  const overdue = unpaid.filter(isOverdue)
  const sum = (rows: QontoInvoice[]) => rows.reduce((s, i) => s + Number(i.total_ttc), 0)

  return (
    <>
      <div className="stagger mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([['Émis ce mois', sum(invoices.filter((i) => i.issue_date?.startsWith(month)))], ['En attente de paiement', sum(unpaid)], ['En retard', sum(overdue)], ['Encaissé ce mois', sum(invoices.filter((i) => i.status === 'paid' && i.paid_at?.startsWith(month)))]] as const).map(([label, v]) => (
          <div key={label} className="surface spot rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-[13px] text-slate-500">{label}</p>
            <p className={`mt-1 text-xl font-semibold tabular-nums ${label === 'En retard' && v > 0 ? 'text-rose-700' : 'text-slate-900'}`}>{eur0(v)}</p>
          </div>
        ))}
      </div>

      {pending.length > 0 && (
        <Card title={<>À envoyer <span className="font-normal text-slate-500">{pending.length}</span></>} className="mb-4" flush>
          <ul className="divide-y divide-slate-100">
            {pending.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{company.get(r.company_id)?.name}</p>
                  <p className="truncate text-xs text-slate-500">{r.items.map((i) => i.title).filter(Boolean).join(' · ') || 'Facture sans ligne'} · préparée {fmtDate(r.created_at)}</p>
                  {r.error && <p className="mt-0.5 text-xs font-medium text-rose-700">{r.error}</p>}
                </div>
                <span className="font-semibold tabular-nums text-slate-900">{eur(itemsTotal(r.items).ttc)}</span>
                {r.status === 'a_envoyer' ? <Badge tone="sky">Envoi en cours</Badge> : r.status === 'erreur' ? <Badge tone="rose">Erreur</Badge> : <Badge>Brouillon</Badge>}
                <Link to={`/factures/${r.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-btn-border px-3 text-[13px] font-medium text-slate-800 hover:bg-slate-50"><Pencil size={13} aria-hidden />Ouvrir</Link>
                {r.status === 'erreur' && <Button small icon={Send} onClick={() => run(() => update('invoice_requests', r.id, { status: 'a_envoyer', error: null }))}>Réessayer</Button>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Factures émises par Qonto" action={<Button small variant="primary" icon={Plus} onClick={onNew}>Nouvelle facture</Button>} flush>
        {invoices.length === 0 ? <Empty icon={Receipt} title="Aucune facture pour l'instant">Créez une facture ici : Qonto la génère à son format et l'envoie à votre client.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200">
                <tr><th className={TH}>Numéro</th><th className={TH}>Client</th><th className={TH}>Date</th><th className={TH}>Échéance</th><th className={`${TH} text-right`}>Total TTC</th><th className={TH}>Statut</th><th className="w-44" /></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((i) => (
                  <tr key={i.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">{i.number ?? '—'}</td>
                    <td className="px-4 py-3">
                      {i.company_id && company.get(i.company_id) ? (
                        <Link to={`/clients/${i.company_id}`} className="font-medium text-link hover:underline">{company.get(i.company_id)!.name}</Link>
                      ) : (
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-slate-700">{i.client_name ?? '—'}</span>
                          <Select aria-label={`Rattacher ${i.number ?? 'la facture'} à un client`} value="" onChange={(e) => e.target.value && run(() => update('qonto_invoices', i.id, { company_id: e.target.value }), 'Facture rattachée')} className="!h-8 !w-40">
                            <option value="">Rattacher…</option>
                            {data.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </Select>
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fmtDate(i.issue_date)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fmtDate(i.due_date)}{isOverdue(i) && <span className="ml-1.5 font-semibold text-rose-700">+{daysSince(i.due_date!)} j</span>}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{eur(i.total_ttc)}</td>
                    <td className="px-4 py-3"><InvoiceBadge invoice={i} /></td>
                    <td className="px-4 py-3">
                      <span className="flex justify-end gap-2">
                        {i.status === 'unpaid' && <Button small icon={Mail} onClick={() => setReminder(i)}>Relancer</Button>}
                        {i.invoice_url && <a href={i.invoice_url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-[13px] font-medium text-link hover:underline">Voir<ExternalLink size={13} aria-hidden /></a>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {reminder && <InvoiceReminder invoice={reminder} onClose={() => setReminder(null)} />}
    </>
  )
}

/** Relance d'une facture impayée : e-mail prêt à partir, avec le lien Qonto de la facture. */
export function InvoiceReminder({ invoice: i, onClose }: { invoice: QontoInvoice; onClose: () => void }) {
  const { data, settings } = useStore()
  const contact = data.contacts.find((c) => c.company_id === i.company_id && c.email)
  const co = data.companies.find((c) => c.id === i.company_id)
  const late = isOverdue(i)
  return (
    <ComposeEmail
      to={co?.billing_email ?? i.client_email ?? contact?.email ?? ''}
      kind="relance"
      subject={`${late ? 'Relance' : 'Rappel'} — facture ${i.number}`}
      body={`Bonjour${contact ? ` ${contact.first_name}` : ''},\n\n${late ? `Sauf erreur de notre part, la facture ${i.number} d'un montant de ${eur(i.total_ttc)}, arrivée à échéance le ${fmtDateLong(i.due_date)}, n'a pas encore été réglée.` : `Petit rappel : la facture ${i.number} d'un montant de ${eur(i.total_ttc)} arrive à échéance le ${fmtDateLong(i.due_date)}.`}\n\nVous pouvez la consulter et la régler ici : ${i.invoice_url ?? '(lien de la facture Qonto)'}\n\nSi le paiement est déjà parti, merci de ne pas tenir compte de ce message.\n\n${settings.email_signature}`}
      link={{ contact_id: contact?.id ?? null }}
      onClose={onClose}
    />
  )
}

// ───────────────────────────── Onglet Abonnements ─────────────────────────────

export function SubscriptionsTab() {
  const { data, update, remove } = useStore()
  const { company } = useLookups()
  const run = useAction()
  const send = useSendSubscription()
  const [editing, setEditing] = useState<Subscription | 'new' | null>(null)
  const period = currentPeriod()
  const active = data.subscriptions.filter((s) => s.active)
  const sentFor = (s: Subscription) => data.invoice_requests.find((r) => r.subscription_id === s.id && r.period === period && r.status !== 'erreur')
  const toSend = active.filter((s) => !sentFor(s) && s.last_invoiced_month !== period)
  const mrr = active.reduce((a, s) => a + Number(s.amount), 0)

  async function sendAll() {
    if (!(await ask(`Envoyer ${toSend.length} facture${toSend.length > 1 ? 's' : ''} (${eur(toSend.reduce((a, s) => a + Number(s.amount), 0))}) via Qonto ?`))) return
    for (const s of toSend) await send(s)
  }

  return (
    <>
      <div className="surface spot mb-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-5 shadow-sm">
        <div>
          <p className="text-[13px] text-slate-500 first-letter:uppercase">{monthLabel(period)}</p>
          <p className="text-2xl font-semibold tabular-nums text-slate-900">{eur0(mrr)} <span className="text-base font-normal text-slate-500">/ mois · {active.length} abonnement{active.length > 1 ? 's' : ''}</span></p>
          <p className="mt-0.5 text-sm text-slate-600">{active.length - toSend.length} facture{active.length - toSend.length > 1 ? 's' : ''} envoyée{active.length - toSend.length > 1 ? 's' : ''} sur {active.length} ce mois-ci</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={Plus} onClick={() => setEditing('new')}>Nouvel abonnement</Button>
          {toSend.length > 0 && <Button variant="primary" icon={Send} onClick={sendAll}>Tout envoyer · {eur(toSend.reduce((a, s) => a + Number(s.amount), 0))}</Button>}
        </div>
      </div>

      {data.subscriptions.length === 0 ? <Card><Empty icon={Repeat} title="Aucun abonnement">Ajoutez la maintenance ou l'hébergement d'un client : sa facture mensuelle partira en un clic.</Empty></Card> : (
        <ul className="stagger space-y-2">
          {data.subscriptions.map((s) => {
            const sent = sentFor(s) ?? (s.last_invoiced_month === period ? true : undefined)
            const invoice = typeof sent === 'object' && sent.qonto_invoice_id ? data.qonto_invoices.find((i) => i.id === sent.qonto_invoice_id) : undefined
            return (
              <li key={s.id} className={`surface spot lift flex flex-wrap items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ${s.active ? '' : 'opacity-60'}`}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-vert"><Repeat size={18} aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{company.get(s.company_id)?.name}</p>
                  <p className="truncate text-sm text-slate-600">{s.label}</p>
                  <p className="text-xs text-slate-500">Le {s.billing_day} de chaque mois · depuis {fmtDate(s.started_on)}{!s.active && ' · suspendu'}</p>
                </div>
                <p className="text-lg font-semibold tabular-nums text-slate-900">{eur(s.amount)}<span className="text-sm font-normal text-slate-500"> / mois</span></p>
                {!s.active ? <Badge>Suspendu</Badge> : sent ? (
                  <span className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-[13px] font-medium text-emerald-800">
                    <Check size={14} aria-hidden />{typeof sent === 'object' && sent.status === 'a_envoyer' ? 'Envoi en cours' : `Envoyée${invoice?.number ? ` · ${invoice.number}` : ''}`}
                  </span>
                ) : (
                  <Button variant="primary" icon={Send} onClick={() => void ask(`Envoyer la facture de ${eur(s.amount)} à ${company.get(s.company_id)?.name} ?`).then((ok): unknown => ok && send(s))}>Envoyer la facture</Button>
                )}
                <div className="flex">
                  <IconButton icon={Pencil} label="Modifier l'abonnement" onClick={() => setEditing(s)} />
                  <IconButton icon={s.active ? Pause : Play} label={s.active ? 'Suspendre' : 'Réactiver'} onClick={() => run(() => update('subscriptions', s.id, { active: !s.active }))} />
                  <IconButton icon={Trash2} label="Supprimer l'abonnement" onClick={() => void ask('Supprimer cet abonnement ? Les factures déjà émises restent dans Qonto.').then((ok): unknown => ok && run(() => remove('subscriptions', s.id), 'Abonnement supprimé'))} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <p className="mt-3 text-sm text-fg-muted">Chaque facture est créée par Qonto, à son format et avec sa numérotation, puis envoyée au client avec le lien pour la consulter et la régler.</p>
      {editing && <SubscriptionForm subscription={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

export function SubscriptionForm({ subscription, companyId, amount, label, onClose }: { subscription?: Subscription; companyId?: string; amount?: number; label?: string; onClose: () => void }) {
  const { data, insert, update } = useStore()
  const run = useAction()
  const [form, setForm] = useState({
    company_id: subscription?.company_id ?? companyId ?? '', label: subscription?.label ?? label ?? 'Abonnement maintenance & hébergement',
    amount: String(subscription?.amount ?? amount ?? ''), billing_day: String(subscription?.billing_day ?? 1),
  })
  async function submit(e: FormEvent) {
    e.preventDefault()
    const row = { company_id: form.company_id, label: form.label.trim(), amount: parseNumber(form.amount) ?? 0, billing_day: Math.min(28, Math.max(1, Number(form.billing_day) || 1)) }
    const ok = await run(() => (subscription ? update('subscriptions', subscription.id, row) : insert('subscriptions', { ...row, started_on: isoDay() })), 'Abonnement enregistré')
    if (ok) onClose()
  }
  return (
    <Modal title={subscription ? "Modifier l'abonnement" : 'Nouvel abonnement'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Client">
          {(id) => <Select id={id} required value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })}><option value="">Choisir…</option>{data.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}
        </Field>
        <Field label="Libellé sur la facture" hint={`${form.label.length} / 40 caractères (limite de Qonto)`}>
          {(id) => <Input id={id} required maxLength={40} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Montant mensuel HT (€)">{(id) => <Input id={id} required inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />}</Field>
          <Field label="Jour de facturation">{(id) => <Input id={id} type="number" min={1} max={28} value={form.billing_day} onChange={(e) => setForm({ ...form, billing_day: e.target.value })} />}</Field>
        </div>
        <FormActions onCancel={onClose} busy={!form.company_id || !parseNumber(form.amount)} />
      </form>
    </Modal>
  )
}

// ───────────────────────────── Préparation d'une facture ─────────────────────────────

const UNITS = ['forfait', 'heure', 'jour', 'mois', 'unité']

export function InvoiceEditor() {
  const { id } = useParams()
  const { data, update, remove, settings } = useStore()
  const { company } = useLookups()
  const navigate = useNavigate()
  const run = useAction()
  const [editingClient, setEditingClient] = useState(false)
  const request = data.invoice_requests.find((r) => r.id === id)
  const [items, setItems] = useState<InvoiceItem[]>(request?.items ?? [])
  const [form, setForm] = useState({ terms: request?.terms ?? '', email_message: request?.email_message ?? '', recipient_email: request?.recipient_email ?? '' })
  useEffect(() => { if (request) setItems(request.items) }, [request?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!request) return <Empty icon={FileText} title="Facture introuvable"><Link to="/documents" className="text-link hover:underline">Retour à la facturation</Link></Empty>

  const co = company.get(request.company_id)
  const editable = request.status === 'brouillon' || request.status === 'erreur'
  const total = itemsTotal(items)
  const invoice = request.qonto_invoice_id ? data.qonto_invoices.find((i) => i.id === request.qonto_invoice_id) : undefined
  const assujetti = settings.vat_mode === 'assujetti'
  const save = (patch: Partial<InvoiceRequest>) => run(() => update('invoice_requests', request.id, patch))
  const saveItems = (next: InvoiceItem[]) => { setItems(next); save({ items: next }) }
  const setItem = (i: number, patch: Partial<InvoiceItem>) => setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)))

  // Points bloquants avant l'envoi à Qonto
  const problems = [
    !form.recipient_email.trim() && 'Indiquez l’adresse e-mail qui recevra la facture.',
    items.length === 0 && 'Ajoutez au moins une ligne.',
    items.some((i) => !i.title.trim()) && 'Chaque ligne doit avoir un intitulé.',
    items.some((i) => i.title.length > 40) && 'Les intitulés sont limités à 40 caractères chez Qonto.',
    co?.client_type === 'entreprise' && !co.address && 'L’adresse du client est requise sur une facture entre professionnels.',
  ].filter(Boolean) as string[]

  const sendToQonto = () => run(async () => {
    if (problems.length) throw new Error(problems[0])
    if (!QONTO_INVOICING_READY) throw new Error(NOT_READY)
    if (!(await ask(`Créer cette facture de ${eur(total.ttc)} dans Qonto et l'envoyer à ${form.recipient_email} ?`))) return
    await update('invoice_requests', request.id, { items, ...form, recipient_email: form.recipient_email.trim(), status: 'a_envoyer', error: null })
  }, 'Facture transmise à Qonto')

  return (
    <>
      <Link to="/documents?onglet=factures" className="mb-3 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"><ArrowLeft size={15} aria-hidden />Facturation</Link>
      <PageHeader title={invoice?.number ? `Facture ${invoice.number}` : 'Nouvelle facture'} subtitle={co?.name}>
        {editable && <Button variant="primary" icon={Send} onClick={sendToQonto}>Créer dans Qonto et envoyer</Button>}
        {editable && <IconButton icon={Trash2} label="Supprimer le brouillon" onClick={() => void ask('Supprimer ce brouillon de facture ?').then((ok): unknown => ok && run(async () => { await remove('invoice_requests', request.id); navigate('/documents?onglet=factures') }, 'Brouillon supprimé'))} />}
      </PageHeader>

      {!editable && (
        <div className="surface mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <p className="flex items-center gap-2 text-sm text-slate-700">
            <Check size={16} className="text-emerald-700" aria-hidden />
            {request.status === 'a_envoyer' ? 'Transmise à Qonto, création en cours.' : <>Créée par Qonto{invoice?.number && <> sous le numéro <span className="font-semibold text-slate-900">{invoice.number}</span></>} et envoyée à {request.recipient_email} {request.sent_at && fmtDate(request.sent_at)}.</>}
          </p>
          <span className="flex items-center gap-2">{invoice && <InvoiceBadge invoice={invoice} />}{invoice?.invoice_url && <a href={invoice.invoice_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-link hover:underline">Voir la facture Qonto<ExternalLink size={13} aria-hidden /></a>}</span>
        </div>
      )}
      {request.error && <p className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Qonto a refusé la facture : {request.error}</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Client">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Client">
                {(fid) => (
                  <Select id={fid} disabled={!editable} value={request.company_id} onChange={(e) => {
                    const c = company.get(e.target.value)
                    const to = c?.billing_email ?? data.contacts.find((x) => x.company_id === c?.id && x.email)?.email ?? ''
                    setForm({ ...form, recipient_email: to }); save({ company_id: e.target.value, recipient_email: to || null })
                  }}>{data.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
                )}
              </Field>
              <Field label="Envoyer à">
                {(fid) => <Input id={fid} type="email" disabled={!editable} value={form.recipient_email} onChange={(e) => setForm({ ...form, recipient_email: e.target.value })} onBlur={() => save({ recipient_email: form.recipient_email.trim() || null })} />}
              </Field>
            </div>
            {co && (
              <div className="mt-3 flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-slate-50 p-3 text-sm">
                <div className="text-slate-600">
                  <p className="font-medium text-slate-900">{co.name} <span className="font-normal text-slate-500">· {co.client_type === 'particulier' ? 'Particulier' : 'Entreprise'}</span></p>
                  <p>{[co.address, [co.postal_code, co.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || <span className="text-rose-700">Adresse manquante</span>}</p>
                  <p>{[co.siret && `SIRET ${co.siret}`, co.vat_number && `TVA ${co.vat_number}`].filter(Boolean).join(' · ') || (co.client_type === 'entreprise' ? 'SIRET non renseigné' : '')}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Landmark size={12} aria-hidden />{co.qonto_client_id ? 'Client déjà présent dans Qonto' : 'Sera ajouté aux clients Qonto à l’envoi'}</p>
                </div>
                {editable && <Button small icon={Pencil} onClick={() => setEditingClient(true)}>Compléter la fiche</Button>}
              </div>
            )}
          </Card>

          <Card title="Lignes de la facture">
            <ul className="space-y-2">
              {items.map((it, i) => (
                <li key={i} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-48 flex-1 space-y-2">
                      <Input aria-label="Intitulé" disabled={!editable} maxLength={40} value={it.title} placeholder="Intitulé (40 caractères max.)" onChange={(e) => setItem(i, { title: e.target.value })} onBlur={() => save({ items })} className="font-medium" />
                      <Textarea aria-label="Description" disabled={!editable} maxLength={300} rows={2} value={it.description} placeholder="Description affichée sous l'intitulé" onChange={(e) => setItem(i, { description: e.target.value })} onBlur={() => save({ items })} />
                    </div>
                    <div className="w-16"><Input aria-label="Quantité" disabled={!editable} inputMode="decimal" value={String(it.quantity)} onChange={(e) => setItem(i, { quantity: parseNumber(e.target.value) ?? 0 })} onBlur={() => save({ items })} className="text-right" /></div>
                    <div className="w-28"><Select aria-label="Unité" disabled={!editable} value={it.unit} onChange={(e) => saveItems(items.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))}>{UNITS.map((u) => <option key={u}>{u}</option>)}</Select></div>
                    <div className="w-28"><Input aria-label="Prix unitaire HT" disabled={!editable} inputMode="decimal" value={String(it.unit_price)} onChange={(e) => setItem(i, { unit_price: parseNumber(e.target.value) ?? 0 })} onBlur={() => save({ items })} className="text-right" /></div>
                    {editable && <IconButton icon={Trash2} label="Supprimer la ligne" onClick={() => saveItems(items.filter((_, j) => j !== i))} className="!h-10 !w-10" />}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-[13px]">
                    <div className="flex flex-wrap items-center gap-4">
                      {assujetti && (
                        <Select aria-label="Taux de TVA" disabled={!editable} value={String(it.vat_rate)} onChange={(e) => saveItems(items.map((x, j) => (j === i ? { ...x, vat_rate: Number(e.target.value) } : x)))} className="!h-8 !w-32 !text-[13px]">
                          {[0, 0.055, 0.1, 0.2].map((r) => <option key={r} value={r}>TVA {(r * 100).toLocaleString('fr-FR')} %</option>)}
                        </Select>
                      )}
                      <label className="flex items-center gap-2 text-slate-700"><input type="checkbox" disabled={!editable} checked={!!it.offered} onChange={(e) => saveItems(items.map((x, j) => (j === i ? { ...x, offered: e.target.checked } : x)))} className="h-4 w-4 accent-vert" />Offert (remise de 100 %)</label>
                    </div>
                    <span className="tabular-nums">{it.offered ? <><span className="text-slate-500 line-through">{eur(it.quantity * it.unit_price)}</span> <span className="font-semibold text-vert">Offert</span></> : <span className="font-semibold text-slate-900">{eur(it.quantity * it.unit_price)} HT</span>}</span>
                  </div>
                </li>
              ))}
            </ul>
            {editable && <Button small icon={Plus} className="mt-3" onClick={() => saveItems([...items, { title: '', description: '', quantity: 1, unit: 'forfait', unit_price: 0, vat_rate: assujetti ? settings.vat_rate / 100 : 0 }])}>Ajouter une ligne</Button>}
          </Card>

          <Card title="Conditions et message">
            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Date d'émission">{(fid) => <Input id={fid} type="date" disabled={!editable} value={request.issue_date} onChange={(e) => e.target.value && save({ issue_date: e.target.value })} />}</Field>
                <Field label="Échéance">{(fid) => <Input id={fid} type="date" disabled={!editable} value={request.due_date} onChange={(e) => e.target.value && save({ due_date: e.target.value })} />}</Field>
              </div>
              {editable && (
                <div className="flex flex-wrap gap-1.5">
                  {[['À réception', 0], ['15 jours', 15], ['30 jours', 30], ['45 jours', 45]].map(([label, d]) => (
                    <button key={label} type="button" onClick={() => save({ due_date: addDays(request.issue_date, Number(d)) })} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-pale">{label}</button>
                  ))}
                </div>
              )}
              <Field label="Conditions inscrites sur la facture" hint={`${form.terms.length} / 525 caractères`}>
                {(fid) => <Textarea id={fid} disabled={!editable} maxLength={525} rows={3} value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} onBlur={() => save({ terms: form.terms || null })} />}
              </Field>
              <Field label="Message de l'e-mail (facultatif)" hint="Le lien vers la facture Qonto est ajouté automatiquement à la fin.">
                {(fid) => <Textarea id={fid} disabled={!editable} rows={4} value={form.email_message} placeholder={`Bonjour,\n\nVeuillez trouver votre facture ci-dessous. Merci pour votre confiance.`} onChange={(e) => setForm({ ...form, email_message: e.target.value })} onBlur={() => save({ email_message: form.email_message || null })} />}
              </Field>
            </div>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card title="Récapitulatif">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-slate-600">Total HT</dt><dd className="tabular-nums">{eur(total.ht)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-600">{assujetti ? 'TVA' : 'TVA (non applicable)'}</dt><dd className="tabular-nums">{assujetti ? eur(total.vat) : '—'}</dd></div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900"><dt>Total TTC</dt><dd className="tabular-nums">{eur(total.ttc)}</dd></div>
            </dl>
            <p className="mt-2 text-xs text-slate-500">Échéance le {fmtDateLong(request.due_date)}</p>
          </Card>
          {editable && problems.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="mb-1 flex items-center gap-1.5 font-semibold"><AlertTriangle size={14} aria-hidden />Avant l'envoi</p>
              <ul className="list-disc space-y-0.5 pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          )}
          <Card title="Ce qui se passe à l'envoi">
            <ol className="list-decimal space-y-1.5 pl-4 text-sm text-slate-600">
              <li>Qonto crée la facture à son format, avec son numéro, ses mentions légales et votre IBAN.</li>
              <li>Le client reçoit l'e-mail avec le lien pour la consulter, la télécharger et la régler.</li>
              <li>Le paiement est rapproché automatiquement par Qonto ; le statut se met à jour ici.</li>
            </ol>
          </Card>
        </aside>
      </div>

      {editingClient && co && <CompanyForm company={co} onClose={() => setEditingClient(false)} />}
    </>
  )
}

/** Résumé de facturation d'un client, pour sa fiche. */
export function ClientBilling({ company: co }: { company: Company }) {
  const { data } = useStore()
  const createInvoice = useCreateInvoice()
  const send = useSendSubscription()
  const [reminder, setReminder] = useState<QontoInvoice | null>(null)
  const invoices = data.qonto_invoices.filter((i) => i.company_id === co.id && i.status !== 'canceled')
  const subs = data.subscriptions.filter((s) => s.company_id === co.id)
  const sum = (rows: QontoInvoice[]) => rows.reduce((s, i) => s + Number(i.total_ttc), 0)
  const unpaid = invoices.filter((i) => i.status === 'unpaid')
  const period = currentPeriod()
  const contact = data.contacts.find((c) => c.company_id === co.id)

  return (
    <Card title="Facturation" action={<Button small variant="primary" icon={Plus} onClick={() => createInvoice(co.id, [])}>Nouvelle facture</Button>}>
      <dl className="grid grid-cols-3 gap-3">
        {([['Facturé', sum(invoices)], ['Payé', sum(invoices.filter((i) => i.status === 'paid'))], ['En attente', sum(unpaid)]] as const).map(([k, v]) => (
          <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="font-semibold tabular-nums text-slate-900">{eur0(v)}</dd></div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-slate-500">
        Factures envoyées à <span className="font-medium text-slate-900">{co.billing_email ?? contact?.email ?? 'adresse à renseigner'}</span>{contact && !co.billing_email && ` (${contactName(contact)})`}
        {' · '}{co.qonto_client_id ? 'client synchronisé avec Qonto' : 'sera créé dans Qonto à la première facture'}
      </p>
      {subs.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-slate-200 pt-3">
          {subs.map((s) => {
            const done = s.last_invoiced_month === period || data.invoice_requests.some((r) => r.subscription_id === s.id && r.period === period && r.status !== 'erreur')
            return (
              <li key={s.id} className="flex items-center gap-2 text-sm">
                <Repeat size={14} className="shrink-0 text-vert" aria-hidden />
                <div className="min-w-0 flex-1"><p className="truncate text-slate-700">{s.label}</p><p className="text-xs tabular-nums text-slate-500">{eur(s.amount)} / mois</p></div>
                {done ? <Badge tone="emerald">Envoyée</Badge> : s.active && <Button small variant="primary" icon={Send} onClick={() => void ask(`Envoyer la facture de ${eur(s.amount)} ?`).then((ok): unknown => ok && send(s))}>Envoyer</Button>}
              </li>
            )
          })}
        </ul>
      )}
      {unpaid.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-slate-200 pt-3">
          {unpaid.map((i) => (
            <li key={i.id} className="flex items-center gap-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">{i.number} <span className="font-normal tabular-nums text-slate-600">· {eur(i.total_ttc)}</span></p>
                <p className={`text-xs ${isOverdue(i) ? 'font-semibold text-rose-700' : 'text-slate-500'}`}>{isOverdue(i) ? `En retard depuis ${daysSince(i.due_date!)} j` : `Échéance ${fmtDate(i.due_date)}`}</p>
              </div>
              <Button small icon={Mail} onClick={() => setReminder(i)}>Relancer</Button>
            </li>
          ))}
        </ul>
      )}
      {reminder && <InvoiceReminder invoice={reminder} onClose={() => setReminder(null)} />}
    </Card>
  )
}
