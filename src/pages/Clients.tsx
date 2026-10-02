import { ask } from '../components/Confirm'
import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Building2, FilePlus2, Pencil, Plus, Search, Trash2, Users } from 'lucide-react'
import { TaskList, Timeline } from '../components/shared'
import {
  Avatar, Badge, Button, Card, Empty, Field, FormActions, IconButton, Input, Modal, PageHeader, Select, Tabs, TextField,
  Textarea, useAction,
} from '../components/ui'
import { useCreateQuote } from '../lib/actions'
import { OPEN_STAGES, PROJECT_STATUSES, QUOTE_STATUS, stageLabel } from '../lib/constants'
import { ago, contactName, eur, eur0, fmtDate, initials } from '../lib/format'
import { invoiceHt, useLookups } from '../lib/selectors'
import { useStore } from '../lib/store'
import type { Company, Contact } from '../lib/types'
import { InvoiceBadge } from './Documents'
import { ClientBilling } from './Invoices'

const nullable = <T extends Record<string, string>>(form: T) =>
  Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || null])) as { [K in keyof T]: string | null }

// ───────────────────────────── Liste ─────────────────────────────

export function Clients() {
  const { data } = useStore()
  const { company, profile } = useLookups()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'companies' | 'contacts'>('companies')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<'company' | 'contact' | Contact | null>(null)
  const q = search.trim().toLowerCase()

  const companies = useMemo(() => data.companies
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.city?.toLowerCase().includes(q))
    .map((c) => ({
      ...c,
      contacts: data.contacts.filter((p) => p.company_id === c.id).length,
      openDeals: data.deals.filter((d) => d.company_id === c.id && OPEN_STAGES.includes(d.stage)).length,
      invoiced: data.qonto_invoices.filter((i) => i.company_id === c.id && (i.status === 'unpaid' || i.status === 'paid')).reduce((s, i) => s + invoiceHt(i), 0),
      due: data.qonto_invoices.filter((i) => i.company_id === c.id && i.status === 'unpaid').reduce((s, i) => s + Number(i.total_ttc), 0),
      isClient: data.deals.some((d) => d.company_id === c.id && d.stage === 'gagne') || data.qonto_invoices.some((i) => i.company_id === c.id),
      lastContact: data.activities.find((a) => a.company_id === c.id)?.occurred_at ?? null,
      owners: [...new Set(data.deals.filter((d) => d.company_id === c.id && d.owner_id).map((d) => d.owner_id!))],
    })), [data, q])

  const contacts = data.contacts.filter((p) => !q || contactName(p).toLowerCase().includes(q) || p.email?.toLowerCase().includes(q))

  return (
    <>
      <PageHeader title="Clients" subtitle={`${data.companies.length} entreprises · ${data.contacts.length} contacts`}>
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-3 z-10 text-slate-400" aria-hidden />
          <Input aria-label="Rechercher" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" className="!w-48 !rounded-full pl-9" />
        </div>
        <Button icon={Plus} onClick={() => setModal('contact')}>Contact</Button>
        <Button variant="primary" icon={Plus} onClick={() => setModal('company')}>Entreprise</Button>
      </PageHeader>

      <div className="mb-3">
        <Tabs value={tab} onChange={setTab} tabs={[{ id: 'companies', label: 'Entreprises', count: companies.length }, { id: 'contacts', label: 'Contacts', count: contacts.length }]} />
      </div>

      <Card flush>
        {tab === 'companies' ? (
          companies.length === 0 ? <Empty icon={Building2} title="Aucune entreprise">Les entreprises sont créées automatiquement à l'arrivée d'un lead, ou à la main ici.</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200">
                  <tr>{['Entreprise', 'Statut', 'Ville', 'Leads en cours', 'Suivi par', 'Dernier échange'].map((h) => <th key={h} className="eyebrow px-4 py-3 text-slate-500">{h}</th>)}<th className="eyebrow px-4 py-3 text-right text-slate-500">Facturé HT</th><th className="eyebrow px-4 py-3 text-right text-slate-500">À encaisser</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {companies.map((c) => (
                    <tr key={c.id} onClick={() => navigate(`/clients/${c.id}`)} className="cursor-pointer hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-semibold text-slate-700">{initials(c.name)}</span>
                          <div className="min-w-0"><Link to={`/clients/${c.id}`} className="block truncate font-semibold text-slate-900 hover:underline">{c.name}</Link><span className="text-xs text-slate-500">{c.sector ?? '—'} · {c.contacts} contact{c.contacts > 1 ? 's' : ''}</span></div>
                        </div>
                      </td>
                      <td className="px-4 py-3">{c.isClient ? <Badge tone="emerald">Client</Badge> : <Badge>Prospect</Badge>}</td>
                      <td className="px-4 py-3 text-slate-600">{c.city ?? '—'}</td>
                      <td className="px-4 py-3">{c.openDeals ? <Badge tone="sky">{c.openDeals}</Badge> : <span className="text-slate-400">—</span>}</td>
                      <td className="px-4 py-3"><span className="flex -space-x-1.5">{c.owners.map((o) => <Avatar key={o} profile={profile.get(o)} size={24} />)}{c.owners.length === 0 && <span className="text-slate-400">—</span>}</span></td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{c.lastContact ? ago(c.lastContact) : '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{c.invoiced ? eur0(c.invoiced) : <span className="font-normal text-slate-400">—</span>}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${c.due ? 'font-semibold text-slate-900' : 'text-slate-400'}`}>{c.due ? eur0(c.due) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : contacts.length === 0 ? <Empty icon={Users} title="Aucun contact" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200">
                <tr>{['Nom', 'Entreprise', 'E-mail', 'Téléphone'].map((h) => <th key={h} className="eyebrow px-4 py-3 text-slate-500">{h}</th>)}<th className="w-12" /></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contacts.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{contactName(p)}{p.job_title && <span className="ml-2 font-normal text-slate-500">{p.job_title}</span>}</td>
                    <td className="px-4 py-3">{p.company_id && company.get(p.company_id) ? <Link to={`/clients/${p.company_id}`} className="text-link hover:underline">{company.get(p.company_id)!.name}</Link> : <span className="text-slate-400">—</span>}</td>
                    <td className="px-4 py-3 text-slate-600">{p.email ? <a href={`mailto:${p.email}`} className="hover:underline">{p.email}</a> : '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{p.phone ?? '—'}</td>
                    <td className="px-2"><IconButton icon={Pencil} label={`Modifier ${contactName(p)}`} onClick={() => setModal(p)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modal === 'company' && <CompanyForm onClose={() => setModal(null)} onSaved={(c) => navigate(`/clients/${c.id}`)} />}
      {modal === 'contact' && <ContactForm onClose={() => setModal(null)} />}
      {modal && typeof modal === 'object' && <ContactForm contact={modal} onClose={() => setModal(null)} />}
    </>
  )
}

// ───────────────────────────── Formulaires ─────────────────────────────

export function CompanyForm({ company, onClose, onSaved }: { company?: Company; onClose: () => void; onSaved?: (c: Company) => void }) {
  const { insert, update } = useStore()
  const run = useAction()
  const [clientType, setClientType] = useState<Company['client_type']>(company?.client_type ?? 'entreprise')
  const [form, setFormState] = useState({
    name: company?.name ?? '', sector: company?.sector ?? '', address: company?.address ?? '',
    billing_email: company?.billing_email ?? '', country: company?.country ?? 'FR',
    postal_code: company?.postal_code ?? '', city: company?.city ?? '', siret: company?.siret ?? '',
    vat_number: company?.vat_number ?? '', website: company?.website ?? '', notes: company?.notes ?? '',
  })
  const set = (patch: Partial<typeof form>) => setFormState((f) => ({ ...f, ...patch }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const row = { ...nullable(form), name: form.name.trim(), client_type: clientType, country: form.country.trim().toUpperCase() || 'FR' }
    const saved = await run(() => (company ? update('companies', company.id, row) : insert('companies', row)), 'Client enregistré')
    if (saved) { onClose(); onSaved?.(saved) }
  }

  return (
    <Modal title={company ? 'Modifier le client' : 'Nouveau client'} onClose={onClose} wide>
      <form onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div role="group" aria-label="Type de client" className="inline-flex w-fit rounded-full bg-slate-100 p-1 sm:col-span-2">
            {(['entreprise', 'particulier'] as const).map((t) => (
              <button key={t} type="button" aria-pressed={clientType === t} onClick={() => setClientType(t)} className={`h-8 rounded-full px-4 text-[13px] font-medium transition-colors ${clientType === t ? 'bg-vert text-white' : 'text-slate-600 hover:text-slate-900'}`}>{t === 'entreprise' ? 'Entreprise' : 'Particulier'}</button>
            ))}
          </div>
          <TextField label={clientType === 'entreprise' ? 'Raison sociale' : 'Nom et prénom'} form={form} set={set} name="name" required className="sm:col-span-2" />
          <TextField label="E-mail de facturation" form={form} set={set} name="billing_email" type="email" hint="Reçoit les factures envoyées par Qonto." className="sm:col-span-2" />
          <TextField label="Secteur" form={form} set={set} name="sector" />
          <TextField label="Site web" form={form} set={set} name="website" />
          <TextField label="Adresse" form={form} set={set} name="address" className="sm:col-span-2" />
          <TextField label="Code postal" form={form} set={set} name="postal_code" />
          <TextField label="Ville" form={form} set={set} name="city" />
          <TextField label="Pays (code)" form={form} set={set} name="country" placeholder="FR" />
          {clientType === 'entreprise' && <TextField label="SIREN / SIRET" form={form} set={set} name="siret" hint="Obligatoire sur les factures entre professionnels." />}
          {clientType === 'entreprise' && <TextField label="N° TVA intracommunautaire" form={form} set={set} name="vat_number" />}
          <Field label="Notes" className="sm:col-span-2">{(id) => <Textarea id={id} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />}</Field>
        </div>
        <FormActions onCancel={onClose} />
      </form>
    </Modal>
  )
}

export function ContactForm({ contact, companyId, onClose }: { contact?: Contact; companyId?: string; onClose: () => void }) {
  const { data, insert, update, remove } = useStore()
  const run = useAction()
  const [form, setFormState] = useState({
    first_name: contact?.first_name ?? '', last_name: contact?.last_name ?? '', email: contact?.email ?? '',
    phone: contact?.phone ?? '', job_title: contact?.job_title ?? '', instagram: contact?.instagram ?? '',
    company_id: contact?.company_id ?? companyId ?? '',
  })
  const set = (patch: Partial<typeof form>) => setFormState((f) => ({ ...f, ...patch }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const row = { ...nullable(form), first_name: form.first_name.trim(), last_name: form.last_name.trim() }
    const saved = await run(() => (contact ? update('contacts', contact.id, row) : insert('contacts', row)), 'Contact enregistré')
    if (saved) onClose()
  }

  return (
    <Modal title={contact ? 'Modifier le contact' : 'Nouveau contact'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Prénom" form={form} set={set} name="first_name" />
          <TextField label="Nom" form={form} set={set} name="last_name" />
          <TextField label="E-mail" form={form} set={set} name="email" type="email" />
          <TextField label="Téléphone" form={form} set={set} name="phone" type="tel" />
          <TextField label="Fonction" form={form} set={set} name="job_title" />
          <TextField label="Instagram" form={form} set={set} name="instagram" placeholder="@compte" />
          <Field label="Entreprise" className="sm:col-span-2">
            {(id) => (
              <Select id={id} value={form.company_id} onChange={(e) => set({ company_id: e.target.value })}>
                <option value="">Aucune</option>
                {data.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <FormActions
          onCancel={onClose}
          busy={!form.first_name.trim() && !form.last_name.trim()}
          extra={contact && (
            <Button variant="danger" icon={Trash2} onClick={() => void ask('Supprimer ce contact ?').then((ok): unknown => ok && run(() => remove('contacts', contact.id), 'Contact supprimé').then(onClose))}>Supprimer</Button>
          )}
        />
      </form>
    </Modal>
  )
}

// ───────────────────────────── Fiche entreprise ─────────────────────────────

export function ClientDetail() {
  const { id } = useParams()
  const { data, remove } = useStore()
  const navigate = useNavigate()
  const run = useAction()
  const createQuote = useCreateQuote()
  const [editing, setEditing] = useState(false)
  const [contactModal, setContactModal] = useState<Contact | 'new' | null>(null)

  const company = data.companies.find((c) => c.id === id)
  if (!company) return <Empty icon={Building2} title="Entreprise introuvable"><Link to="/clients" className="text-link hover:underline">Retour aux clients</Link></Empty>

  const contacts = data.contacts.filter((p) => p.company_id === company.id)
  const deals = data.deals.filter((d) => d.company_id === company.id)
  const projects = data.projects.filter((p) => p.company_id === company.id)
  const quotes = data.quotes.filter((q) => q.company_id === company.id)
  const invoices = data.qonto_invoices.filter((i) => i.company_id === company.id && i.status !== 'canceled')
  const activities = data.activities.filter((a) => a.company_id === company.id)
  const tasks = data.tasks.filter((t) => t.company_id === company.id)
  const address = [company.address, [company.postal_code, company.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')

  return (
    <>
      <Link to="/clients" className="mb-3 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"><ArrowLeft size={15} aria-hidden />Clients</Link>
      <PageHeader title={company.name} subtitle={[company.sector, address].filter(Boolean).join(' · ') || undefined}>
        <Button icon={FilePlus2} onClick={() => createQuote({ company_id: company.id, contact_id: contacts[0]?.id ?? null })}>Nouveau devis</Button>
        <Button icon={Pencil} onClick={() => setEditing(true)}>Modifier</Button>
        <IconButton
          icon={Trash2} label="Supprimer l'entreprise"
          onClick={async () => {
            if (quotes.length) return void run(async () => { throw new Error('Cette entreprise a des devis : elle ne peut pas être supprimée.') })
            if (!(await ask(`Supprimer ${company.name} et son historique ?`))) return
            run(async () => { await remove('companies', company.id); navigate('/clients') }, 'Entreprise supprimée')
          }}
        />
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Leads" flush>
            {deals.length === 0 ? <p className="p-4 text-sm text-slate-500">Aucun lead.</p> : (
              <ul className="divide-y divide-slate-100">
                {deals.map((d) => (
                  <li key={d.id}>
                    <Link to={`/pipeline?lead=${d.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-slate-50">
                      <span className="font-medium text-slate-900">{d.title}</span>
                      <span className="flex items-center gap-3">{d.amount != null && <span className="tabular-nums text-slate-600">{eur0(d.amount)}</span>}<Badge tone={d.stage === 'gagne' ? 'emerald' : d.stage === 'perdu' ? 'slate' : 'sky'}>{stageLabel(d.stage)}</Badge></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Devis" flush>
            {quotes.length === 0 ? <p className="p-4 text-sm text-slate-500">Aucun devis.</p> : (
              <ul className="divide-y divide-slate-100">
                {quotes.map((q) => (
                  <li key={q.id}>
                    <Link to={`/devis/${q.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-slate-50">
                      <span><span className="font-medium text-slate-900">{q.number ?? 'Brouillon'}</span><span className="ml-2 text-slate-500">{q.title} · {fmtDate(q.issue_date)}</span></span>
                      <span className="flex items-center gap-3"><span className="tabular-nums text-slate-700">{eur(q.total_ttc)}</span><Badge tone={QUOTE_STATUS[q.status].tone}>{QUOTE_STATUS[q.status].label}</Badge></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Factures (Qonto)" flush>
            {invoices.length === 0 ? <p className="p-4 text-sm text-slate-500">Aucune facture.</p> : (
              <ul className="divide-y divide-slate-100">
                {invoices.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <span>
                      {i.invoice_url ? <a href={i.invoice_url} target="_blank" rel="noreferrer" className="font-medium text-link hover:underline">{i.number}</a> : <span className="font-medium text-slate-900">{i.number}</span>}
                      <span className="ml-2 text-slate-500">{fmtDate(i.issue_date)} · échéance {fmtDate(i.due_date)}</span>
                    </span>
                    <span className="flex items-center gap-3"><span className="tabular-nums text-slate-700">{eur(i.total_ttc)}</span><InvoiceBadge invoice={i} /></span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {projects.length > 0 && (
            <Card title="Projets" flush>
              <ul className="divide-y divide-slate-100">
                {projects.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <Link to="/projets" className="font-medium text-slate-900 hover:underline">{p.name}</Link>
                    <Badge>{PROJECT_STATUSES.find((s) => s.id === p.status)?.label}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Historique"><Timeline activities={activities} link={{ company_id: company.id }} /></Card>
        </div>

        <div className="space-y-4">
          <ClientBilling company={company} />
          <Card title="Contacts" action={<Button small icon={Plus} onClick={() => setContactModal('new')}>Ajouter</Button>} flush>
            {contacts.length === 0 ? <p className="p-4 text-sm text-slate-500">Aucun contact.</p> : (
              <ul className="divide-y divide-slate-100">
                {contacts.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-2 px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{contactName(p)}</p>
                      {p.job_title && <p className="text-slate-500">{p.job_title}</p>}
                      {p.email && <a href={`mailto:${p.email}`} className="block truncate text-link hover:underline">{p.email}</a>}
                      {p.phone && <a href={`tel:${p.phone.replace(/\s/g, '')}`} className="block text-slate-600 hover:underline">{p.phone}</a>}
                    </div>
                    <IconButton icon={Pencil} label={`Modifier ${contactName(p)}`} onClick={() => setContactModal(p)} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Informations">
            <dl className="space-y-2 text-sm">
              {([['SIRET', company.siret], ['N° TVA', company.vat_number], ['Site web', company.website], ['Adresse', address]] as const).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3"><dt className="text-slate-500">{k}</dt><dd className="text-right text-slate-900">{v || '—'}</dd></div>
              ))}
            </dl>
            {company.notes && <p className="mt-3 whitespace-pre-wrap border-t border-slate-100 pt-3 text-sm text-slate-600">{company.notes}</p>}
          </Card>

          <Card title="Tâches"><TaskList tasks={tasks} link={{ company_id: company.id }} /></Card>
        </div>
      </div>

      {editing && <CompanyForm company={company} onClose={() => setEditing(false)} />}
      {contactModal === 'new' && <ContactForm companyId={company.id} onClose={() => setContactModal(null)} />}
      {contactModal && contactModal !== 'new' && <ContactForm contact={contactModal} onClose={() => setContactModal(null)} />}
    </>
  )
}
