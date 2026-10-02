import { ask } from '../components/Confirm'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, BadgeCheck, Check, FileText, Plus, Printer, Receipt, RefreshCw, Trash2, X } from 'lucide-react'
import {
  Badge, Button, Card, Empty, Field, FormActions, IconButton, Input, Modal, PageHeader, Select, Tabs, Textarea,
  useAction,
} from '../components/ui'
import { useCreateQuote } from '../lib/actions'
import { INVOICE_STATUS, QUOTE_STATUS } from '../lib/constants'
import { contactName, eur, fmtDate, isoDay, parseNumber } from '../lib/format'
import { isOverdue, useLookups } from '../lib/selectors'
import { HOSTED, LOGO } from '../lib/env'
import { useStore } from '../lib/store'
import { SYNC_ENABLED, useQontoSync } from '../lib/sync'
import { InvoicesTab, SubscriptionForm, SubscriptionsTab, useCreateInvoice } from './Invoices'
import type { QontoInvoice, Quote, QuoteLine } from '../lib/types'

export function InvoiceBadge({ invoice }: { invoice: QontoInvoice }) {
  if (isOverdue(invoice)) return <Badge tone="rose">En retard</Badge>
  return <Badge tone={INVOICE_STATUS[invoice.status].tone}>{INVOICE_STATUS[invoice.status].label}</Badge>
}

const TH = 'eyebrow px-4 py-3 text-slate-500'
const numFmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const shortDate = (d: string | null) => (d ? numFmt.format(new Date(d)) : '—')
const lineTotal = (l: Pick<QuoteLine, 'quantity' | 'unit_price'>) => Number(l.quantity) * Number(l.unit_price)

// ───────────────────────────── Facturation ─────────────────────────────

type Tab = 'devis' | 'factures' | 'abonnements'

export function Documents() {
  const { data } = useStore()
  const { company } = useLookups()
  const navigate = useNavigate()
  const syncQonto = useQontoSync()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('onglet') as Tab | null) ?? 'devis'
  const setTab = (t: Tab) => setParams({ onglet: t }, { replace: true })
  const [creating, setCreating] = useState<'devis' | 'facture' | null>(params.get('nouveau') === '1' ? 'devis' : null)

  const unpaid = data.qonto_invoices.filter((i) => i.status === 'unpaid')
  const pending = data.quotes.filter((q) => q.status === 'envoye')
  const mrr = data.subscriptions.filter((x) => x.active).reduce((a, x) => a + Number(x.amount), 0)

  return (
    <>
      <PageHeader
        title="Facturation"
        subtitle={`${pending.length} devis en attente · ${eur(unpaid.reduce((s, i) => s + Number(i.total_ttc), 0))} à encaisser · ${eur(mrr)} d'abonnements par mois`}
      >
        {SYNC_ENABLED && <Button icon={RefreshCw} onClick={() => syncQonto()}>Synchroniser Qonto</Button>}
        <Button icon={Plus} onClick={() => setCreating('facture')}>Facture</Button>
        <Button variant="primary" icon={Plus} onClick={() => setCreating('devis')}>Devis</Button>
      </PageHeader>

      <div className="mb-4">
        <Tabs value={tab} onChange={setTab} tabs={[
          { id: 'devis', label: 'Devis', count: data.quotes.length },
          { id: 'factures', label: 'Factures', count: data.qonto_invoices.filter((i) => i.status !== 'canceled').length },
          { id: 'abonnements', label: 'Abonnements', count: data.subscriptions.filter((s) => s.active).length },
        ]} />
      </div>

      <div key={tab} className="page">
        {tab === 'factures' && <InvoicesTab onNew={() => setCreating('facture')} />}
        {tab === 'abonnements' && <SubscriptionsTab />}
        {tab === 'devis' && (
          <Card flush>
            {data.quotes.length === 0 ? <Empty icon={FileText} title="Aucun devis">Créez-en depuis un lead, une fiche client ou le bouton ci-dessus.</Empty> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200">
                    <tr><th className={TH}>Numéro</th><th className={TH}>Client</th><th className={TH}>Objet</th><th className={TH}>Date</th><th className={TH}>Validité</th><th className={`${TH} text-right`}>Mise en place</th><th className={`${TH} text-right`}>Abonnement</th><th className={TH}>Statut</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.quotes.map((q) => {
                      const expired = q.status === 'envoye' && !!q.valid_until && q.valid_until < isoDay()
                      return (
                        <tr key={q.id} onClick={() => navigate(`/devis/${q.id}`)} className="cursor-pointer hover:bg-slate-50">
                          <td className="whitespace-nowrap px-4 py-3"><Link to={`/devis/${q.id}`} className="font-semibold text-slate-900 hover:underline">{q.number ?? 'Brouillon'}</Link></td>
                          <td className="px-4 py-3 text-slate-700">{company.get(q.company_id)?.name ?? '—'}</td>
                          <td className="max-w-56 truncate px-4 py-3 text-slate-600">{q.title || '—'}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fmtDate(q.issue_date)}</td>
                          <td className={`whitespace-nowrap px-4 py-3 ${expired ? 'font-semibold text-rose-700' : 'text-slate-600'}`}>{expired ? 'Expiré · ' : ''}{fmtDate(q.valid_until)}</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums">{eur(q.total_ttc)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600">{Number(q.total_monthly) ? `${eur(q.total_monthly)} / mois` : '—'}</td>
                          <td className="px-4 py-3"><Badge tone={QUOTE_STATUS[q.status].tone}>{QUOTE_STATUS[q.status].label}</Badge></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </div>

      {creating && <NewDocument type={creating} onClose={() => setCreating(null)} />}
    </>
  )
}

function NewDocument({ type, onClose }: { type: 'devis' | 'facture'; onClose: () => void }) {
  const { data } = useStore()
  const createQuote = useCreateQuote()
  const createInvoice = useCreateInvoice()
  const [companyId, setCompanyId] = useState('')
  const [title, setTitle] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (type === 'facture') return void createInvoice(companyId, [])
    const contact = data.contacts.find((c) => c.company_id === companyId)
    await createQuote({ company_id: companyId, contact_id: contact?.id ?? null, title: title.trim() })
  }

  return (
    <Modal title={type === 'devis' ? 'Nouveau devis' : 'Nouvelle facture'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Client" hint={data.companies.length === 0 ? 'Créez d’abord une entreprise dans Clients.' : type === 'facture' ? 'La facture sera créée et envoyée par Qonto, à son format.' : undefined}>
          {(id) => (
            <Select id={id} required value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">Choisir…</option>
              {data.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
        </Field>
        {type === 'devis' && <Field label="Objet">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. : automatisation des relances" />}</Field>}
        <FormActions onCancel={onClose} submitLabel={type === 'devis' ? 'Créer le brouillon' : 'Préparer la facture'} busy={!companyId} />
      </form>
    </Modal>
  )
}

// ───────────────────────────── Éditeur de devis ─────────────────────────────

export function QuoteEditor() {
  const { id } = useParams()
  const { data, update, remove, insert, finalizeQuote, settings } = useStore()
  const navigate = useNavigate()
  const run = useAction()
  const createInvoice = useCreateInvoice()
  const [subscribing, setSubscribing] = useState(false)

  const quote = data.quotes.find((q) => q.id === id)
  const lines = data.quote_lines.filter((l) => l.quote_id === id).sort((a, b) => a.position - b.position)

  if (!quote) return <Empty icon={FileText} title="Devis introuvable"><Link to="/documents" className="text-link hover:underline">Retour aux devis</Link></Empty>

  const draft = quote.status === 'brouillon'
  const deal = data.deals.find((d) => d.id === quote.deal_id)
  const monthly = lines.filter((l) => l.billing === 'mensuel' && !l.offered)
  const invoiceQuote = () => createInvoice(quote.company_id, lines.filter((l) => l.billing === 'unique').map((l) => ({
    title: l.description.slice(0, 40), description: [l.details, `Devis ${quote.number}`].filter(Boolean).join(' — ').slice(0, 300),
    quantity: Number(l.quantity), unit: l.unit ?? 'forfait', unit_price: Number(l.unit_price), vat_rate: Number(quote.vat_rate) / 100, offered: l.offered,
  })), { quote_id: quote.id })
  const save = (patch: Partial<Quote>) => run(() => update('quotes', quote.id, patch))
  const addLine = (billing: QuoteLine['billing']) => run(() => insert('quote_lines', {
    quote_id: quote.id, position: (lines.at(-1)?.position ?? -1) + 1, quantity: 1, unit: null, billing, offered: false,
    description: billing === 'mensuel' ? 'Abonnement maintenance & hébergement' : '',
    details: billing === 'mensuel' ? 'Hébergement, opérations d’automatisation (Make), support, petites évolutions.' : null,
    unit_price: billing === 'mensuel' ? 39 : 0,
  }))

  const finalize = () => run(async () => {
    if (lines.every((l) => !l.description.trim())) throw new Error('Ajoutez au moins une ligne avec un intitulé.')
    if (!(await ask('Valider ce devis ? Il recevra son numéro et ses lignes ne seront plus modifiables.'))) return
    await finalizeQuote(quote.id)
    if (deal && ['nouveau', 'contacte', 'rdv'].includes(deal.stage)) await update('deals', deal.id, { stage: 'devis_envoye' })
  })

  const accept = () => run(async () => {
    await update('quotes', quote.id, { status: 'accepte' })
    if (deal && deal.stage !== 'gagne') await update('deals', deal.id, { stage: 'gagne' })
  }, deal ? 'Devis accepté — lead passé en « Gagné »' : 'Devis accepté')

  return (
    <>
      <div className="no-print">
        <Link to="/documents" className="mb-3 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"><ArrowLeft size={15} aria-hidden />Devis & factures</Link>
        <PageHeader title={`Devis ${quote.number ?? '(brouillon)'}`} subtitle={<Badge tone={QUOTE_STATUS[quote.status].tone}>{QUOTE_STATUS[quote.status].label}</Badge>}>
          {draft && <Button variant="primary" icon={BadgeCheck} onClick={finalize}>Valider le devis</Button>}
          {quote.status === 'envoye' && (
            <>
              <Button variant="primary" icon={Check} onClick={accept}>Accepté</Button>
              <Button icon={X} onClick={() => save({ status: 'refuse' })}>Refusé</Button>
            </>
          )}
          {!HOSTED && <Button icon={Printer} onClick={() => window.print()}>Imprimer / PDF</Button>}
          <IconButton
            icon={Trash2} label="Supprimer le devis"
            onClick={() => void ask('Supprimer ce devis ?').then((ok): unknown => ok && run(async () => { await remove('quotes', quote.id); navigate('/documents') }, 'Devis supprimé'))}
          />
        </PageHeader>

        {quote.status === 'accepte' && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sauge/40 bg-sauge/15 px-4 py-3 text-sm">
            <span>Devis accepté. La facture est créée par Qonto, à son format, puis envoyée au client.</span>
            <span className="flex flex-wrap gap-2">
              {monthly.length > 0 && !data.subscriptions.some((x) => x.company_id === quote.company_id && Number(x.amount) === Number(quote.total_monthly)) && (
                <Button small onClick={() => setSubscribing(true)}>Créer l'abonnement · {eur(quote.total_monthly)}/mois</Button>
              )}
              <Button small variant="primary" icon={Receipt} onClick={invoiceQuote}>Facturer ce devis</Button>
            </span>
          </div>
        )}

        {draft && (
          <Card className="mb-4">
            <QuoteFields key={quote.id} quote={quote} save={save} />
            <h3 className="eyebrow mb-2 mt-6 text-slate-500">Lignes du devis</h3>
            <ul className="space-y-2">{lines.map((l) => <LineRow key={l.id} line={l} />)}</ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button small icon={Plus} onClick={() => addLine('unique')}>Ajouter une prestation</Button>
              <Button small icon={Plus} onClick={() => addLine('mensuel')}>Ajouter un abonnement mensuel</Button>
            </div>
          </Card>
        )}
      </div>

      <Sheet quote={quote} lines={lines} settings={settings} />
      {subscribing && <SubscriptionForm companyId={quote.company_id} amount={Number(quote.total_monthly)} label={(monthly[0]?.description ?? 'Abonnement maintenance & hébergement').slice(0, 40)} onClose={() => setSubscribing(false)} />}
    </>
  )
}

function QuoteFields({ quote, save }: { quote: Quote; save: (patch: Partial<Quote>) => void }) {
  const { data, settings } = useStore()
  const [title, setTitle] = useState(quote.title)
  const [conditions, setConditions] = useState(quote.conditions ?? '')
  const [vat, setVat] = useState(String(quote.vat_rate))
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Client">
        {(id) => <Select id={id} value={quote.company_id} onChange={(e) => save({ company_id: e.target.value, contact_id: null })}>{data.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}
      </Field>
      <Field label="Interlocuteur">
        {(id) => (
          <Select id={id} value={quote.contact_id ?? ''} onChange={(e) => save({ contact_id: e.target.value || null })}>
            <option value="">Aucun</option>
            {data.contacts.filter((c) => c.company_id === quote.company_id).map((c) => <option key={c.id} value={c.id}>{contactName(c)}</option>)}
          </Select>
        )}
      </Field>
      <Field label="Date d'émission">{(id) => <Input id={id} type="date" value={quote.issue_date} onChange={(e) => e.target.value && save({ issue_date: e.target.value })} />}</Field>
      <Field label="Valable jusqu’au">{(id) => <Input id={id} type="date" value={quote.valid_until ?? ''} onChange={(e) => save({ valid_until: e.target.value || null })} />}</Field>
      <Field label="Objet" className="sm:col-span-2 lg:col-span-3">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== quote.title && save({ title })} />}</Field>
      {settings.vat_mode === 'assujetti' && (
        <Field label="TVA (%)">{(id) => <Input id={id} inputMode="decimal" value={vat} onChange={(e) => setVat(e.target.value)} onBlur={() => { const n = parseNumber(vat); if (n !== null && n !== Number(quote.vat_rate)) save({ vat_rate: n }) }} />}</Field>
      )}
      <Field label="Conditions" hint="Acompte, engagement, délais… Une ligne par condition." className="sm:col-span-2 lg:col-span-4">
        {(id) => <Textarea id={id} rows={3} value={conditions} onChange={(e) => setConditions(e.target.value)} onBlur={() => conditions !== (quote.conditions ?? '') && save({ conditions: conditions || null })} />}
      </Field>
    </div>
  )
}

function LineRow({ line }: { line: QuoteLine }) {
  const { update, remove } = useStore()
  const run = useAction()
  const initial = () => ({ description: line.description, details: line.details ?? '', quantity: String(line.quantity), unit_price: String(line.unit_price) })
  const [form, setForm] = useState(initial)
  useEffect(() => { setForm(initial()) }, [line.description, line.details, line.quantity, line.unit_price]) // eslint-disable-line react-hooks/exhaustive-deps

  function commit() {
    const patch = {
      description: form.description, details: form.details.trim() || null,
      quantity: parseNumber(form.quantity) ?? 0, unit_price: parseNumber(form.unit_price) ?? 0,
    }
    const changed = patch.description !== line.description || patch.details !== line.details || patch.quantity !== Number(line.quantity) || patch.unit_price !== Number(line.unit_price)
    if (changed) run(() => update('quote_lines', line.id, patch))
  }
  const bind = (name: keyof typeof form) => ({ value: form[name], onChange: (e: { target: { value: string } }) => setForm({ ...form, [name]: e.target.value }), onBlur: commit })
  const total = (parseNumber(form.quantity) ?? 0) * (parseNumber(form.unit_price) ?? 0)

  return (
    <li className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-48 flex-1 space-y-2">
          <Input aria-label="Intitulé de la ligne" placeholder="Intitulé (ex. : Application « Suivi des heures »)" {...bind('description')} className="font-medium" />
          <Textarea aria-label="Précisions" placeholder="Précisions affichées sous l'intitulé" rows={2} {...bind('details')} />
        </div>
        <div className="w-16"><Input aria-label="Quantité" inputMode="decimal" {...bind('quantity')} className="text-right" /></div>
        <div className="w-28"><Input aria-label="Prix unitaire hors taxes" inputMode="decimal" {...bind('unit_price')} className="text-right" /></div>
        <IconButton icon={Trash2} label="Supprimer la ligne" onClick={() => run(() => remove('quote_lines', line.id))} className="!h-10 !w-10" />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <Select aria-label="Type de facturation" value={line.billing} onChange={(e) => run(() => update('quote_lines', line.id, { billing: e.target.value as QuoteLine['billing'] }))} className="!h-8 !w-44 !text-[13px]">
            <option value="unique">Prestation (une fois)</option>
            <option value="mensuel">Abonnement mensuel</option>
          </Select>
          <label className="flex items-center gap-2 text-[13px] text-slate-700">
            <input type="checkbox" checked={line.offered} onChange={(e) => run(() => update('quote_lines', line.id, { offered: e.target.checked }))} className="h-4 w-4 accent-vert" />
            Offert (affiché, non compté)
          </label>
        </div>
        <p className="text-sm tabular-nums">
          {line.offered ? <><span className="text-slate-500 line-through">{eur(total)}</span> <span className="font-semibold text-vert">Offert</span></> : <span className="font-semibold text-slate-900">{eur(total)}{line.billing === 'mensuel' && ' / mois'}</span>}
        </p>
      </div>
    </li>
  )
}

// ───────────────────────────── Feuille imprimable ─────────────────────────────

const Eyebrow = ({ children }: { children: string }) => <p className="eyebrow mb-2 border-b border-slate-300 pb-1.5 text-vert">{children}</p>

function Sheet({ quote, lines, settings: s }: { quote: Quote; lines: QuoteLine[]; settings: ReturnType<typeof useStore>['settings'] }) {
  const { company, contact } = useLookups()
  const client = company.get(quote.company_id)
  const person = quote.contact_id ? contact.get(quote.contact_id) : undefined
  const franchise = Number(quote.vat_rate) === 0
  const offered = lines.filter((l) => l.offered && l.billing === 'unique').reduce((t, l) => t + lineTotal(l), 0)
  const monthly = Number(quote.total_monthly)
  const validity = quote.valid_until ? Math.round((new Date(quote.valid_until).getTime() - new Date(quote.issue_date).getTime()) / 86_400_000) : null
  const legal = [s.legal_form, [s.address, s.postal_code, s.city].filter(Boolean).join(', '), s.siret && `SIRET ${s.siret}`, s.ape && `APE ${s.ape}`].filter(Boolean).join(' · ')

  return (
    <article className="surface mx-auto flex min-h-[297mm] max-w-[210mm] flex-col overflow-hidden rounded-2xl bg-white text-[13px] leading-relaxed text-slate-700 shadow-xl print:max-w-none print:rounded-none print:shadow-none">
      <header className="flex items-center justify-between gap-6 bg-vert px-10 py-7 text-white">
        <img src={LOGO} alt={s.company_name} className="h-16 w-auto" />
        <div className="text-right">
          <p className="text-3xl font-semibold tracking-[0.18em]">DEVIS</p>
          <p className="mt-1 text-sm tracking-wide text-pale">{quote.number ? `N° ${quote.number}` : 'Brouillon'}</p>
        </div>
      </header>

      <div className="flex-1 px-10 py-8">
        <div className="grid grid-cols-2 gap-8">
          <section>
            <Eyebrow>Émetteur</Eyebrow>
            <p className="text-sm font-semibold text-slate-900">{s.company_name}</p>
            {s.legal_form && <p>{s.legal_form}</p>}
            {(s.address || s.city) && <p>{[s.address, [s.postal_code, s.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</p>}
            {(s.siret || s.ape) && <p>{[s.siret && `SIRET : ${s.siret}`, s.ape && `APE : ${s.ape}`].filter(Boolean).join(' · ')}</p>}
            <p>{[s.website, s.email, s.phone].filter(Boolean).join(' · ')}</p>
          </section>
          <section>
            <Eyebrow>Destinataire</Eyebrow>
            <p className="text-sm font-semibold uppercase text-slate-900">{client?.name}</p>
            {person && <p>À l'attention de {contactName(person)}</p>}
            {(client?.address || client?.city) && <p>{[client?.address, [client?.postal_code, client?.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</p>}
            {client?.siret && <p>SIRET : {client.siret}</p>}
            {client?.vat_number && <p>TVA : {client.vat_number}</p>}
          </section>
        </div>

        <p className="mt-6 flex flex-wrap gap-x-8 gap-y-1">
          <span><span className="font-semibold text-slate-900">Date d'émission :</span> {shortDate(quote.issue_date)}</span>
          {quote.valid_until && <span><span className="font-semibold text-slate-900">Validité :</span> {validity} jours (jusqu'au {shortDate(quote.valid_until)})</span>}
        </p>
        {quote.title && <p className="mt-1"><span className="font-semibold text-slate-900">Objet :</span> {quote.title}</p>}

        <table className="mt-6 w-full border-collapse">
          <thead>
            <tr className="bg-slate-900 text-left text-white">
              <th className="eyebrow px-3 py-2.5">Désignation</th><th className="eyebrow w-14 px-3 py-2.5 text-right">Qté</th><th className="eyebrow w-28 px-3 py-2.5 text-right">P.U. HT</th><th className="eyebrow w-32 px-3 py-2.5 text-right">Total HT</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const per = l.billing === 'mensuel' ? ' / mois' : ''
              return (
                <tr key={l.id} className={`border-b border-slate-200 align-top ${i % 2 ? 'bg-slate-50' : ''}`}>
                  <td className="px-3 py-3">
                    <p className="font-semibold text-slate-900">{l.description}</p>
                    {l.details && <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-slate-500">{l.details}</p>}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{l.billing === 'mensuel' ? '—' : Number(l.quantity).toLocaleString('fr-FR')}</td>
                  <td className={`whitespace-nowrap px-3 py-3 text-right tabular-nums ${l.offered ? 'text-slate-400 line-through' : ''}`}>{eur(l.unit_price)}{per}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums text-slate-900">{l.offered ? <span className="tracking-wide text-vert">OFFERTE</span> : `${eur(lineTotal(l))}${per}`}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <dl className="ml-auto mt-5 w-full max-w-[19rem] space-y-1.5">
          <div className="flex justify-between px-3"><dt>Total mise en place HT</dt><dd className="tabular-nums">{eur(quote.total_ht)}</dd></div>
          {offered > 0 && <div className="flex justify-between px-3"><dt>Dont offert</dt><dd className="tabular-nums">− {eur(offered)}</dd></div>}
          <div className="flex justify-between px-3"><dt>{franchise ? 'TVA (non applicable)' : `TVA ${Number(quote.vat_rate).toLocaleString('fr-FR')} %`}</dt><dd className="tabular-nums">{franchise ? '—' : eur(quote.total_vat)}</dd></div>
          <div className="flex justify-between bg-vert px-3 py-2.5 text-sm font-semibold text-white"><dt className="tracking-wider">NET À PAYER</dt><dd className="tabular-nums">{eur(quote.total_ttc)}</dd></div>
          {monthly > 0 && <div className="flex justify-between border border-vert px-3 py-2 font-semibold text-slate-900"><dt>Puis abonnement</dt><dd className="tabular-nums text-vert">{eur(monthly)} / mois</dd></div>}
        </dl>

        {(quote.conditions || franchise) && (
          <section className="mt-7 border-l-[3px] border-sauge bg-slate-50 px-5 py-4">
            <p className="eyebrow mb-1.5 text-vert">Conditions</p>
            {quote.conditions?.split('\n').filter(Boolean).map((c) => {
              const [head, ...rest] = c.split(' : ')
              return <p key={c}>{rest.length ? <><span className="font-semibold text-slate-900">{head} :</span> {rest.join(' : ')}</> : c}</p>
            })}
            {franchise && <p>TVA non applicable, art. 293 B du CGI.</p>}
          </section>
        )}

        <div className="mt-8 grid grid-cols-2 gap-8">
          {[`Le prestataire — ${s.company_name}`, 'Le client — bon pour accord'].map((label, i) => (
            <div key={label}>
              <p className="eyebrow mb-1.5 text-slate-500">{label}</p>
              <div className="h-24 rounded-lg border border-dashed border-slate-300" />
              {i === 1 && <p className="mt-1 text-xs text-slate-500">Date, signature et cachet</p>}
            </div>
          ))}
        </div>
      </div>

      <footer className="bg-vert px-10 py-4 text-center text-[11px] leading-relaxed text-pale">
        <p><span className="font-semibold text-white">{s.company_name}</span>{legal && ` — ${legal}`}</p>
        <p>{franchise && <span className="font-semibold text-white">TVA non applicable, art. 293 B du CGI</span>}{franchise && ' · '}Règlement par virement (RIB communiqué sur facture)</p>
      </footer>
    </article>
  )
}
