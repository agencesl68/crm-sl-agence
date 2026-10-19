import { ask } from '../components/Confirm'
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileSpreadsheet, Kanban as KanbanIcon, Search, Trash2, Upload } from 'lucide-react'
import { Kanban } from '../components/Kanban'
import { Button, Field, Input, Modal, PageHeader, Select, Textarea, useAction } from '../components/ui'
import { prospectKey, prospectsFrom, readWorkbook, type ProspectRow } from '../lib/excel'
import { fmtDate } from '../lib/format'
import { useStore } from '../lib/store'
import type { Prospect, ProspectColor } from '../lib/types'

/** Les trois colonnes, dans l'ordre du code couleur du fichier Excel. */
const COLUMNS: { id: ProspectColor; label: string; hint: string; dot: string }[] = [
  { id: 'vert', label: 'Intéressés', hint: 'Rendez-vous, appel ou mail demandé', dot: 'bg-emerald-500' },
  { id: 'orange', label: 'Sans réponse', hint: 'Pas encore de retour', dot: 'bg-amber-500' },
  { id: 'rouge', label: 'Refus', hint: 'Pas intéressés', dot: 'bg-rose-500' },
]

export function Prospects() {
  const { data, update } = useStore()
  const run = useAction()
  const [search, setSearch] = useState('')
  const [importing, setImporting] = useState(false)
  const [open, setOpen] = useState<Prospect | null>(null)
  const q = search.trim().toLowerCase()
  const items = data.prospects.filter((p) => !q || [p.company, p.contact_name, p.email, p.sector, p.city].some((v) => v?.toLowerCase().includes(q)))
  const count = (c: ProspectColor) => data.prospects.filter((p) => p.color === c).length

  return (
    <>
      <PageHeader title="Prospects" subtitle={`${data.prospects.length} démarchés · ${count('vert')} intéressés · ${count('orange')} sans réponse · ${count('rouge')} refus`}>
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-3 z-10 text-slate-400" aria-hidden />
          <Input aria-label="Rechercher" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" className="!w-48 !rounded-full pl-9" />
        </div>
        <Button variant="primary" icon={Upload} onClick={() => setImporting(true)}>Importer un fichier Excel</Button>
      </PageHeader>

      <p className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-fg-muted">
        {COLUMNS.map((c) => <span key={c.id} className="inline-flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} aria-hidden />{c.label} : {c.hint.toLowerCase()}</span>)}
      </p>

      <Kanban
        columns={COLUMNS}
        items={items}
        columnOf={(p) => p.color}
        onMove={(id, color) => run(() => update('prospects', id, { color: color as ProspectColor, updated_at: new Date().toISOString() }))}
        onOpen={(p) => setOpen(p)}
        renderCard={(p) => (
          <>
            <p className="text-sm font-medium leading-snug text-slate-900">{p.company}</p>
            {(p.contact_name || p.email) && <p className="truncate text-xs text-slate-500">{[p.contact_name, p.email].filter(Boolean).join(' · ')}</p>}
            <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500">
              <span className="truncate">{[p.sector, p.city].filter(Boolean).join(' · ') || '—'}</span>
              {p.deal_id ? <span className="shrink-0 font-semibold text-vert">Lead</span> : p.followup_on && <span className="shrink-0">Relance {fmtDate(p.followup_on)}</span>}
            </div>
          </>
        )}
      />

      {importing && <ImportModal onClose={() => setImporting(false)} />}
      {open && <ProspectModal key={open.id} prospect={data.prospects.find((p) => p.id === open.id) ?? open} onClose={() => setOpen(null)} />}
    </>
  )
}

// ───────────────────────────── Import ─────────────────────────────

interface Plan { fresh: ProspectRow[]; changed: { prospect: Prospect; row: ProspectRow }[]; same: number; uncolored: number }

/** Ce que l'import va faire : nouveaux prospects, prospects connus qui changent de couleur ou gagnent des infos. */
function plan(rows: ProspectRow[], uncolored: number, existing: Prospect[]): Plan {
  const known = new Map(existing.map((p) => [prospectKey(p), p]))
  const byName = new Map(existing.map((p) => [prospectKey({ email: null, company: p.company }), p]))
  const seen = new Set<string>()
  const out: Plan = { fresh: [], changed: [], same: 0, uncolored }
  for (const row of rows) {
    const key = prospectKey(row)
    if (seen.has(key)) continue
    seen.add(key)
    const prospect = known.get(key) ?? byName.get(prospectKey({ email: null, company: row.company }))
    if (!prospect) out.fresh.push(row)
    else if (prospect.color !== row.color || fillable(prospect, row).length) out.changed.push({ prospect, row })
    else out.same += 1
  }
  return out
}

const FIELDS = ['sector', 'size', 'address', 'city', 'contact_name', 'email', 'phone', 'interest', 'notes', 'contacted_on', 'followup_on'] as const
/** Champs vides du prospect que le fichier remplit (le CRM ne remplace jamais une info déjà saisie). */
const fillable = (p: Prospect, row: ProspectRow) => FIELDS.filter((f) => !p[f] && row[f])

function ImportModal({ onClose }: { onClose: () => void }) {
  const { data, insert, update } = useStore()
  const run = useAction()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState('')
  const [result, setResult] = useState<Plan | null>(null)
  const [busy, setBusy] = useState(false)
  const colors = useMemo(() => {
    const rows = result ? [...result.fresh, ...result.changed.map((c) => c.row)] : []
    return COLUMNS.map((c) => ({ ...c, n: rows.filter((r) => r.color === c.id).length }))
  }, [result])

  async function pick(f: File | undefined) {
    if (!f) return
    setFile(f.name)
    setResult(null)
    await run(async () => {
      const { rows, uncolored } = prospectsFrom(readWorkbook(new Uint8Array(await f.arrayBuffer())))
      if (!rows.length) throw new Error(uncolored ? `Aucune ligne colorée en vert, orange ou rouge (${uncolored} lignes sans couleur).` : 'Aucun prospect trouvé : il faut une colonne « Entreprise ».')
      setResult(plan(rows, uncolored, data.prospects))
    })
  }

  async function confirm() {
    if (!result) return
    setBusy(true)
    const now = new Date().toISOString()
    const done = await run(async () => {
      for (const row of result.fresh) await insert('prospects', { ...row, deal_id: null, updated_at: now })
      for (const { prospect, row } of result.changed) {
        await update('prospects', prospect.id, { color: row.color, updated_at: now, ...Object.fromEntries(fillable(prospect, row).map((f) => [f, row[f]])) })
      }
      return true
    }, `${result.fresh.length} prospect${result.fresh.length > 1 ? 's' : ''} ajouté${result.fresh.length > 1 ? 's' : ''}, ${result.changed.length} mis à jour`)
    setBusy(false)
    if (done) onClose()
  }

  return (
    <Modal title="Importer un fichier Excel" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Le CRM lit la couleur de chaque ligne : <b className="text-emerald-700">vert</b> rendez-vous, appel ou mail demandé,
          <b className="text-amber-700"> orange</b> pas de réponse, <b className="text-rose-700">rouge</b> refus. Les lignes sans couleur sont ignorées.
          Réimporter le même fichier met à jour les couleurs, sans créer de doublon.
        </p>
        <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
        <Button icon={FileSpreadsheet} onClick={() => input.current?.click()}>{file || 'Choisir le fichier (.xlsx)'}</Button>
        <p className="text-xs text-slate-500">Depuis Google Sheets : Fichier → Télécharger → Microsoft Excel (.xlsx).</p>

        {result && (
          <div className="space-y-2 rounded-2xl border border-slate-200 p-3 text-sm">
            <p className="flex flex-wrap gap-x-4 gap-y-1">{colors.map((c) => <span key={c.id} className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} aria-hidden />{c.n} {c.label.toLowerCase()}</span>)}</p>
            <p className="text-slate-700">
              {result.fresh.length} nouveau{result.fresh.length > 1 ? 'x' : ''} · {result.changed.length} mis à jour · {result.same} déjà à jour
              {result.uncolored > 0 && ` · ${result.uncolored} ligne${result.uncolored > 1 ? 's' : ''} sans couleur ignorée${result.uncolored > 1 ? 's' : ''}`}
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" icon={Upload} disabled={busy || !result || !(result.fresh.length + result.changed.length)} onClick={() => void confirm()}>
            {busy ? 'Import…' : 'Importer'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ───────────────────────────── Fiche ─────────────────────────────

/** « Monsieur Frey » → { first: '', last: 'Frey' } ; « Valérie Tresch » → { first: 'Valérie', last: 'Tresch' }. */
function splitName(name: string | null): { first: string; last: string } {
  const words = (name ?? '').replace(/^(monsieur|madame|mme|mr|m\.|ma[iî]tre|me|docteur|dr\.?)\s+/i, '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return { first: '', last: '' }
  if (words.length === 1 || /^(monsieur|madame|ma[iî]tre|docteur)/i.test(name ?? '')) return { first: '', last: words.join(' ') }
  return { first: words[0]!, last: words.slice(1).join(' ') }
}

function ProspectModal({ prospect: p, onClose }: { prospect: Prospect; onClose: () => void }) {
  const { data, insert, update, remove, me } = useStore()
  const run = useAction()
  const [form, setForm] = useState({ contact_name: p.contact_name ?? '', email: p.email ?? '', phone: p.phone ?? '', notes: p.notes ?? '' })
  const save = (patch: Partial<Prospect>) => run(() => update('prospects', p.id, { ...patch, updated_at: new Date().toISOString() }))
  const blur = (f: keyof typeof form) => () => { if (form[f].trim() !== (p[f] ?? '')) void save({ [f]: form[f].trim() || null }) }
  const deal = data.deals.find((d) => d.id === p.deal_id)

  /** Le prospect intéressé entre dans le pipeline : entreprise, contact et lead « Contacté » (source Prospection). */
  const toLead = () => run(async () => {
    const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()
    const company = data.companies.find((c) => norm(c.name) === norm(p.company))
      ?? await insert('companies', { name: p.company, city: p.city?.replace(/^\d{5}\s*/, '') || null, postal_code: p.city?.match(/\d{5}/)?.[0] ?? null, address: p.address, sector: p.sector })
    const name = splitName(form.contact_name || null)
    const contact = (form.email && data.contacts.find((c) => norm(c.email) === norm(form.email)))
      || (name.first || name.last || form.email ? await insert('contacts', { company_id: company.id, first_name: name.first, last_name: name.last, email: form.email || null, phone: form.phone || null }) : null)
    const lead = await insert('deals', {
      title: `${p.company}${p.sector ? ` : ${p.sector}` : ''}`, company_id: company.id, contact_id: contact?.id ?? null,
      source: 'prospection', stage: 'contacte', owner_id: me?.id ?? null, need: p.interest ? `Intérêt ${p.interest.toLowerCase()}` : null, message: form.notes || null,
    })
    await update('prospects', p.id, { deal_id: lead.id, updated_at: new Date().toISOString() })
  }, `${p.company} ajouté au pipeline`)

  return (
    <Modal title={p.company} onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{[p.sector, p.size, [p.address, p.city].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || 'Aucune information sur l’entreprise.'}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Colonne">
            {(id) => (
              <Select id={id} value={p.color} onChange={(e) => void save({ color: e.target.value as ProspectColor })}>
                {COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.label} ({c.hint.toLowerCase()})</option>)}
              </Select>
            )}
          </Field>
          <Field label="Contact">{(id) => <Input id={id} value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} onBlur={blur('contact_name')} />}</Field>
          <Field label="E-mail">{(id) => <Input id={id} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} onBlur={blur('email')} />}</Field>
          <Field label="Téléphone">{(id) => <Input id={id} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} onBlur={blur('phone')} />}</Field>
          <Field label="Notes" className="sm:col-span-2">{(id) => <Textarea id={id} rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} onBlur={blur('notes')} />}</Field>
        </div>
        <p className="text-xs text-slate-500">
          {[p.interest && `Intérêt : ${p.interest}`, p.contacted_on && `Contacté : ${/^\d{4}-/.test(p.contacted_on) ? fmtDate(p.contacted_on) : p.contacted_on}`, p.followup_on && `Relance : ${/^\d{4}-/.test(p.followup_on) ? fmtDate(p.followup_on) : p.followup_on}`].filter(Boolean).join(' · ')}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="danger" icon={Trash2} onClick={() => void ask(`Supprimer ${p.company} des prospects ?`).then((ok): unknown => ok && run(() => remove('prospects', p.id), 'Prospect supprimé').then(onClose))}>Supprimer</Button>
          {deal
            ? <Link to={`/pipeline?lead=${deal.id}`} className="text-sm font-medium text-link hover:underline">Voir le lead dans le pipeline</Link>
            : <Button variant="primary" icon={KanbanIcon} onClick={() => void toLead()}>Passer en lead</Button>}
        </div>
      </div>
    </Modal>
  )
}
