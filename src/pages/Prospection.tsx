import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Ban, Clock, ExternalLink, Mail, MailCheck, Reply, RotateCcw, Search, Send, Settings2, Sparkles, Square, Trash2, Upload, Users } from 'lucide-react'
import { ask } from '../components/Confirm'
import { Badge, Button, Card, Empty, Field, IconButton, Input, Modal, PageHeader, Select, Tabs, Textarea, useAction } from '../components/ui'
import { DEMO } from '../lib/env'
import { addDays, fmtDate, isoDay } from '../lib/format'
import { GATEWAY_READY, MAKE_READY } from '../lib/make'
import {
  AUTO_CIBLES, checkedToday, CIBLE_IDS, CIBLES, DAILY_LIMIT, isDue, nextDue, queue, roomToday, SEQUENCE_LENGTH, sentToday, stepLabel,
  useAutoSearch, useConvert, useImportProspects, usePrepareDrafts, useRedraft, useRequeue, useSendDraft,
} from '../lib/prospection'
import { parseDepartements } from '../lib/recherche'
import { useStore } from '../lib/store'
import type { Cible, Prospect, ProspectReject, ProspectStatus, Settings } from '../lib/types'
import type { Tone } from '../lib/constants'

/** La recherche automatique passe par la passerelle Make (version GitHub) ; la démo la simule. */
const AUTO_READY = GATEWAY_READY || DEMO

const STEP_NAME = ['Premier mail', 'Relance', 'Dernier message']

function statusTone(p: Prospect): Tone {
  if (p.status === 'repondu') return 'emerald'
  if (p.status === 'stop' || p.status === 'pas_interesse') return 'rose'
  if (p.step >= SEQUENCE_LENGTH) return 'slate'
  return p.step === 0 ? 'sky' : 'amber'
}

export function Prospection() {
  const { data } = useStore()
  const [tab, setTab] = useState<'jour' | 'liste' | 'ecartes'>('jour')
  const [importing, setImporting] = useState(false)
  const { prepare, progress } = usePrepareDrafts()
  const auto = useAutoSearch()
  const send = useSendDraft()
  const run = useAction()

  const today = isoDay()
  const prospects = data.prospects
  const sent = sentToday(prospects, today)
  const drafts = prospects.filter((p) => p.status === 'actif' && p.draft_body)
  const waiting = queue(prospects, today).filter((p) => !p.draft_body).length
  const contacted = prospects.filter((p) => p.step > 0)
  const replied = prospects.filter((p) => p.status === 'repondu').length
  const rate = contacted.length ? Math.round((replied / contacted.length) * 100) : 0

  async function sendAll() {
    const room = DAILY_LIMIT - sent
    const list = drafts.slice(0, room)
    if (!list.length) return
    if (!(await ask(`Envoyer ${list.length} e-mail${list.length > 1 ? 's' : ''} maintenant, depuis la boîte de l’agence ?`))) return
    let ok = 0
    for (const p of list) if (await send(p, { subject: p.draft_subject ?? '', body: p.draft_body ?? '' }, true)) ok += 1
    await run(async () => ok, `${ok} e-mail${ok > 1 ? 's' : ''} envoyé${ok > 1 ? 's' : ''}`)
  }

  return (
    <>
      <PageHeader title="Prospection" subtitle={`${sent} / ${DAILY_LIMIT} e-mails envoyés aujourd’hui`}>
        <Button icon={Upload} onClick={() => setImporting(true)}>Importer</Button>
        {AUTO_READY && (auto.progress
          ? <Button icon={Square} onClick={auto.stop}>Arrêter ({auto.progress.checked} vérifiées, {auto.progress.kept} / {auto.progress.target})</Button>
          : <Button variant="primary" icon={Search} disabled={!!progress} onClick={() => void auto.start()}>Trouver les prospects du jour</Button>)}
        <Button variant={AUTO_READY ? 'secondary' : 'primary'} icon={Sparkles} disabled={!!progress || !!auto.progress} onClick={() => void prepare()}>
          {progress ? `Rédaction ${progress.done} / ${progress.total}` : 'Préparer les mails du jour'}
        </Button>
      </PageHeader>

      {!MAKE_READY && (
        <p className="mb-4 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm text-fg-muted">
          Make n’est pas branché ici : les e-mails sont enregistrés dans le CRM mais ne partent pas réellement.
        </p>
      )}

      <AutoPanel auto={auto} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Send} label="Envoyés aujourd’hui" value={`${sent} / ${DAILY_LIMIT}`} />
        <Stat icon={Clock} label="À traiter aujourd’hui" value={String(drafts.length + waiting)} />
        <Stat icon={Reply} label="Réponses" value={String(replied)} />
        <Stat icon={MailCheck} label="Taux de réponse" value={contacted.length ? `${rate} %` : '–'} />
      </div>

      <div className="mb-4">
        <Tabs value={tab} onChange={setTab} tabs={[
          { id: 'jour', label: 'À envoyer', count: drafts.length },
          { id: 'liste', label: 'Tous les prospects', count: prospects.length },
          { id: 'ecartes', label: 'Écartés', count: data.prospect_rejects.length },
        ]} />
      </div>

      {tab === 'jour' ? (
        drafts.length === 0 ? (
          <Card>
            <Empty icon={Mail} title={prospects.length === 0 ? 'Aucun prospect pour l’instant' : waiting ? `${waiting} prospect${waiting > 1 ? 's' : ''} à contacter aujourd’hui` : 'Rien à envoyer aujourd’hui'}>
              {prospects.length === 0
                ? AUTO_READY
                  ? <>Cliquez sur « Trouver les prospects du jour » : le CRM cherche des entreprises, lit leur site, trouve leur e-mail et prépare un premier mail. Chaque matin : trouver, relire, envoyer.</>
                  : <>Importez un fichier de prospects (CSV), puis cliquez sur « Préparer les mails du jour ». Chaque matin : préparer, relire, envoyer.</>
                : waiting
                  ? <>Cliquez sur « Préparer les mails du jour » : {GATEWAY_READY ? 'Claude lit le site de chaque entreprise et' : 'Claude'} rédige l’objet et l’accroche du premier mail, les relances partent du modèle.</>
                  : <>Les relances reviendront toutes seules à J+4 et J+9. Pensez à importer de nouveaux prospects pour garder le rythme.</>}
            </Empty>
          </Card>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-fg-muted">Relisez chaque message : vous pouvez tout modifier avant l’envoi.</p>
              <Button variant="primary" icon={Send} onClick={() => void sendAll()} disabled={sent >= DAILY_LIMIT}>
                Tout envoyer ({Math.min(drafts.length, DAILY_LIMIT - sent)})
              </Button>
            </div>
            <div className="space-y-4">
              {drafts.map((p) => <DraftCard key={`${p.id}-${p.draft_step}-${p.draft_subject}`} prospect={p} limitReached={sent >= DAILY_LIMIT} />)}
            </div>
          </>
        )
      ) : tab === 'liste' ? <ProspectTable prospects={prospects} /> : <RejectTable rejects={data.prospect_rejects} />}

      {importing && <ImportModal onClose={() => setImporting(false)} />}
    </>
  )
}

function Stat({ icon: Icon, label, value }: { icon: typeof Send; label: string; value: string }) {
  return (
    <Card>
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><Icon size={14} aria-hidden />{label}</div>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
    </Card>
  )
}

function DraftCard({ prospect: p, limitReached }: { prospect: Prospect; limitReached: boolean }) {
  const { update } = useStore()
  const send = useSendDraft()
  const redraft = useRedraft()
  const run = useAction()
  const [subject, setSubject] = useState(p.draft_subject ?? '')
  const [body, setBody] = useState(p.draft_body ?? '')
  const [busy, setBusy] = useState(false)

  const save = () => {
    if (subject !== p.draft_subject || body !== p.draft_body) void run(() => update('prospects', p.id, { draft_subject: subject, draft_body: body }))
  }
  const act = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn() } finally { setBusy(false) } }

  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          {p.company}
          <span className="font-normal text-slate-500">{[p.first_name, p.last_name].join(' ').trim()} · {p.email}</span>
        </span>
      }
      action={<span className="flex gap-1.5"><Badge tone="violet">{CIBLES[p.cible].label}</Badge><Badge tone={p.step === 0 ? 'sky' : 'amber'}>{STEP_NAME[p.step] ?? 'Message'}</Badge></span>}
    >
      {(p.source === 'auto' || p.score !== null) && <WhyLine prospect={p} />}
      {p.error && <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">Accroche non personnalisée ({p.error}). Ajoutez une phrase sur l’entreprise ou cliquez sur « Nouvelle accroche ».</p>}
      <div className="space-y-3">
        <Field label="Objet">{(id) => <Input id={id} value={subject} onChange={(e) => setSubject(e.target.value)} onBlur={save} />}</Field>
        <Field label="Message">{(id) => <Textarea id={id} rows={13} value={body} onChange={(e) => setBody(e.target.value)} onBlur={save} />}</Field>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {p.step === 0 && <Button small icon={Sparkles} disabled={busy} onClick={() => act(() => redraft(p))}>Nouvelle accroche</Button>}
          <Button small icon={Clock} disabled={busy} onClick={() => act(() => run(() => update('prospects', p.id, { snooze_until: addDays(isoDay(), 1), draft_subject: null, draft_body: null, draft_step: null }), 'Reporté à demain'))}>Demain</Button>
          <Button small icon={Ban} disabled={busy} onClick={() => act(async () => { if (await ask(`Ne plus jamais contacter ${p.company} ?`)) await run(() => update('prospects', p.id, { status: 'stop', draft_subject: null, draft_body: null, draft_step: null }), 'Prospect retiré') })}>Ne plus contacter</Button>
        </div>
        <Button variant="primary" icon={Send} disabled={busy || limitReached || !subject.trim() || !body.trim()} onClick={() => act(() => send(p, { subject, body }))}>Envoyer</Button>
      </div>
    </Card>
  )
}

/** « Pourquoi ce prospect » : note, raison et signaux de l'analyse, et le site pour vérifier en un clic. */
function WhyLine({ prospect: p }: { prospect: Prospect }) {
  return (
    <div className="mb-3 space-y-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-600">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium text-slate-800">Pourquoi ce prospect</span>
        {p.score !== null && <Badge tone={p.score >= 8 ? 'emerald' : 'sky'}>{p.score} / 10</Badge>}
        {p.reason && <span>{p.reason}</span>}
        {p.website && <a href={p.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-link hover:underline">Voir le site<ExternalLink size={12} aria-hidden /></a>}
      </p>
      {p.signals.length > 0 && <div className="flex flex-wrap gap-1">{p.signals.map((s) => <Badge key={s} tone="violet">{s}</Badge>)}</div>}
    </div>
  )
}

/** Panneau « Recherche automatique » : réglages (enregistrés pour les deux associés), progression, bilan. */
function AutoPanel({ auto }: { auto: ReturnType<typeof useAutoSearch> }) {
  const { data, settings, update } = useStore()
  const run = useAction()
  const [open, setOpen] = useState(false)
  const [deps, setDeps] = useState(settings.prospect_departments.join(', '))
  const save = (patch: Partial<Settings>) => run(() => update('settings', true, patch))
  const checked = checkedToday(data.prospects, data.prospect_rejects)
  const room = roomToday(data.prospects)
  const zone = settings.prospect_departments.length ? `départements ${settings.prospect_departments.join(', ')}` : 'France entière'
  const targets = settings.prospect_targets.filter((c) => AUTO_CIBLES.includes(c))
  const progress = auto.progress

  function toggle(c: Cible, on: boolean) {
    void save({ prospect_targets: on ? [...targets, c] : targets.filter((x) => x !== c) })
  }
  function saveDeps(text: string) {
    const list = parseDepartements(text)
    setDeps(list.join(', '))
    void save({ prospect_departments: list })
  }
  const saveNumber = (key: 'prospect_min_score' | 'prospect_daily_checks', value: string, min: number, max: number) => {
    const n = Math.round(Number(value))
    if (Number.isFinite(n) && n !== settings[key]) void save({ [key]: Math.min(max, Math.max(min, n)) })
  }

  return (
    <Card className="mb-4" title="Recherche automatique" action={<Button small icon={Settings2} onClick={() => setOpen(!open)}>{open ? 'Fermer' : 'Réglages'}</Button>}>
      {!AUTO_READY && (
        <p className="mb-3 text-sm text-fg-muted">
          La recherche automatique fonctionne dans la version GitHub du CRM (agencesl68.github.io), reliée à la passerelle Make qui lit les sites et interroge Claude. Les réglages ci-dessous restent partagés.
        </p>
      )}
      <p className="text-sm text-slate-700">
        {targets.length ? targets.map((c) => CIBLES[c].label).join(', ') : 'Aucune cible cochée'} · {zone} · note minimale {settings.prospect_min_score} / 10
      </p>
      <p className="mt-0.5 text-xs text-slate-500">
        {checked} / {settings.prospect_daily_checks} entreprises vérifiées aujourd’hui · place pour {room} nouveau{room > 1 ? 'x' : ''} prospect{room > 1 ? 's' : ''} (les relances passent en premier)
      </p>

      {progress && (
        <div className="mt-3" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium text-slate-900">Vérifiées {progress.checked}, retenues {progress.kept} / {progress.target}</span>
            <Button small icon={Square} onClick={auto.stop}>Arrêter</Button>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-vert transition-all" style={{ width: `${Math.min(100, (progress.kept / Math.max(1, progress.target)) * 100)}%` }} />
          </div>
          <p className="mt-1 truncate text-xs text-slate-500">{progress.step}</p>
        </div>
      )}
      {!progress && auto.last && <p className="mt-3 text-sm font-medium text-slate-900">{auto.last}</p>}

      {open && (
        <div className="mt-4 grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
          <fieldset>
            <legend className="mb-1 block text-sm font-medium text-slate-700">Cibles</legend>
            <div className="space-y-1.5">
              {AUTO_CIBLES.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={targets.includes(c)} onChange={(e) => toggle(c, e.target.checked)} className="h-4 w-4 accent-vert" />
                  {CIBLES[c].label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="space-y-4">
            <fieldset>
              <legend className="mb-1 block text-sm font-medium text-slate-700">Zone</legend>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="radio" name="zone" checked={!settings.prospect_departments.length} onChange={() => { setDeps(''); void save({ prospect_departments: [] }) }} className="h-4 w-4 accent-vert" />
                France entière
              </label>
              <label className="mt-1.5 flex items-center gap-2 text-sm text-slate-700">
                <input type="radio" name="zone" checked={!!settings.prospect_departments.length} onChange={() => saveDeps(deps || '68')} className="h-4 w-4 accent-vert" />
                Départements
              </label>
              <Input aria-label="Départements" className="mt-1.5" placeholder="68, 67, 90" value={deps} onChange={(e) => setDeps(e.target.value)} onBlur={(e) => saveDeps(e.target.value)} />
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Note minimale" hint="Sur 10, 6 par défaut.">
                {(id) => <Input id={id} type="number" min={0} max={10} defaultValue={settings.prospect_min_score} onBlur={(e) => saveNumber('prospect_min_score', e.target.value, 0, 10)} />}
              </Field>
              <Field label="Vérifications par jour" hint="Plafond du coût, 60 par défaut.">
                {(id) => <Input id={id} type="number" min={1} max={500} defaultValue={settings.prospect_daily_checks} onBlur={(e) => saveNumber('prospect_daily_checks', e.target.value, 1, 500)} />}
              </Field>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

const REJECT_LABEL: Record<ProspectReject['kind'], string> = { site: 'Sans site', email: 'Sans email', pertinence: 'Peu pertinent', connu: 'Déjà connu' }

/** Onglet « Écartés » : entreprises vérifiées puis écartées, jamais revérifiées sauf remise en file. */
function RejectTable({ rejects }: { rejects: ProspectReject[] }) {
  const [requeue, setRequeue] = useState<ProspectReject | null>(null)
  const [kind, setKind] = useState('')
  const rows = rejects.filter((r) => !kind || r.kind === kind)
  return (
    <Card flush title={`${rows.length} entreprise${rows.length > 1 ? 's' : ''} écartée${rows.length > 1 ? 's' : ''}`} action={
      <Select aria-label="Raison" value={kind} onChange={(e) => setKind(e.target.value)} className="!h-9 !w-48">
        <option value="">Toutes les raisons</option>
        {Object.entries(REJECT_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </Select>
    }>
      {rows.length === 0 ? <Empty icon={Ban} title="Aucune entreprise écartée">La recherche automatique range ici les entreprises sans site, sans email ou peu pertinentes, pour ne jamais les vérifier deux fois.</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="px-4 py-2 font-medium">Entreprise</th>
                <th className="px-4 py-2 font-medium">Raison</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-slate-900">{r.name}</p>
                    <p className="text-xs text-slate-500">
                      {[CIBLES[r.cible]?.label, r.city, `SIREN ${r.siren}`].filter(Boolean).join(' · ')}
                      {r.website && <> · <a href={r.website} target="_blank" rel="noreferrer" className="text-link hover:underline">site</a></>}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700"><Badge tone={r.kind === 'pertinence' ? 'amber' : 'slate'}>{REJECT_LABEL[r.kind]}</Badge><p className="mt-1 text-xs text-slate-500">{r.reason}</p></td>
                  <td className="px-4 py-2.5 text-slate-700">{fmtDate(r.created_at)}</td>
                  <td className="px-4 py-2.5 text-right"><Button small icon={RotateCcw} onClick={() => setRequeue(r)}>Remettre en file</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {requeue && <RequeueModal reject={requeue} onClose={() => setRequeue(null)} />}
    </Card>
  )
}

function RequeueModal({ reject: r, onClose }: { reject: ProspectReject; onClose: () => void }) {
  const requeue = useRequeue()
  const [website, setWebsite] = useState(r.website ?? '')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit() {
    setBusy(true)
    const ok = await requeue(r, { website, email })
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <Modal title={`Remettre ${r.name} en file`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Écartée : {r.reason}. L’entreprise est revérifiée sans note minimale ; indiquez le site ou l’adresse e-mail si la recherche les a manqués.</p>
        <Field label="Site internet" hint="Laisser vide pour le chercher à nouveau.">{(id) => <Input id={id} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" />}</Field>
        <Field label="Adresse e-mail" hint="Facultatif : seulement une adresse publiée par l’entreprise.">{(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" icon={RotateCcw} disabled={busy} onClick={() => void submit()}>{busy ? 'Vérification…' : 'Vérifier et préparer le brouillon'}</Button>
        </div>
      </div>
    </Modal>
  )
}

const STATUS_FILTERS: { id: string; label: string }[] = [
  { id: '', label: 'Tous les statuts' },
  { id: 'a_contacter', label: 'À contacter' },
  { id: 'sequence', label: 'En séquence' },
  { id: 'termine', label: 'Terminé sans réponse' },
  { id: 'repondu', label: 'A répondu' },
  { id: 'sortis', label: 'Pas intéressé ou stop' },
]

function matchStatus(p: Prospect, f: string): boolean {
  switch (f) {
    case 'a_contacter': return p.status === 'actif' && p.step === 0
    case 'sequence': return p.status === 'actif' && p.step > 0 && p.step < SEQUENCE_LENGTH
    case 'termine': return p.status === 'actif' && p.step >= SEQUENCE_LENGTH
    case 'repondu': return p.status === 'repondu'
    case 'sortis': return p.status === 'stop' || p.status === 'pas_interesse'
    default: return true
  }
}

function ProspectTable({ prospects }: { prospects: Prospect[] }) {
  const { update, remove } = useStore()
  const convert = useConvert()
  const run = useAction()
  const [q, setQ] = useState('')
  const [cible, setCible] = useState('')
  const [status, setStatus] = useState('')

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return prospects.filter((p) =>
      (!cible || p.cible === cible) && matchStatus(p, status)
      && (!s || [p.company, p.first_name, p.last_name, p.email, p.city].some((v) => (v ?? '').toLowerCase().includes(s))))
  }, [cible, prospects, q, status])

  const setStatusOf = (p: Prospect, st: ProspectStatus, msg: string) =>
    run(() => update('prospects', p.id, { status: st, draft_subject: null, draft_body: null, draft_step: null }), msg)

  return (
    <Card flush title={`${rows.length} prospect${rows.length > 1 ? 's' : ''}`} action={
      <div className="flex flex-wrap gap-2">
        <Input aria-label="Rechercher" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} className="!h-9 !w-44" />
        <Select aria-label="Cible" value={cible} onChange={(e) => setCible(e.target.value)} className="!h-9 !w-48">
          <option value="">Toutes les cibles</option>
          {CIBLE_IDS.map((c) => <option key={c} value={c}>{CIBLES[c].label}</option>)}
        </Select>
        <Select aria-label="Statut" value={status} onChange={(e) => setStatus(e.target.value)} className="!h-9 !w-48">
          {STATUS_FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </Select>
      </div>
    }>
      {rows.length === 0 ? <Empty icon={Users} title="Aucun prospect ici" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="px-4 py-2 font-medium">Entreprise</th>
                <th className="px-4 py-2 font-medium">Cible</th>
                <th className="px-4 py-2 font-medium">Statut</th>
                <th className="px-4 py-2 font-medium">Dernier envoi</th>
                <th className="px-4 py-2 font-medium">Prochain</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((p) => {
                const next = nextDue(p)
                return (
                  <tr key={p.id} className="align-top">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-slate-900">{p.company}</p>
                      <p className="text-xs text-slate-500">{[p.first_name, p.last_name].join(' ').trim() || 'Sans nom'} · {p.email}{p.city ? ` · ${p.city}` : ''}</p>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{CIBLES[p.cible].label}</td>
                    <td className="px-4 py-2.5"><Badge tone={statusTone(p)}>{stepLabel(p)}</Badge></td>
                    <td className="px-4 py-2.5 text-slate-700">{fmtDate(p.history.at(-1)?.sent_at)}</td>
                    <td className="px-4 py-2.5 text-slate-700">{next ? (isDue(p) ? 'Aujourd’hui' : fmtDate(next)) : '–'}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        {p.status === 'repondu' && p.deal_id && <Link to={`/pipeline?lead=${p.deal_id}`} className="rounded-full px-3 py-1.5 text-[13px] font-medium text-vert hover:bg-slate-100">Voir le lead</Link>}
                        {p.status === 'actif' && p.step > 0 && <Button small icon={Reply} onClick={() => void convert(p)}>A répondu</Button>}
                        {p.status === 'actif' && p.step > 0 && <Button small variant="ghost" onClick={() => void setStatusOf(p, 'pas_interesse', 'Noté : pas intéressé')}>Pas intéressé</Button>}
                        {p.status === 'actif' && <IconButton icon={Ban} label="Ne plus contacter" onClick={async () => { if (await ask(`Ne plus jamais contacter ${p.company} ?`)) void setStatusOf(p, 'stop', 'Prospect retiré') }} />}
                        <IconButton icon={Trash2} label="Supprimer" onClick={async () => { if (await ask(`Supprimer ${p.company} ? Son adresse pourra être réimportée plus tard. Pour ne plus jamais le contacter, utilisez plutôt « Ne plus contacter ».`)) void run(() => remove('prospects', p.id), 'Prospect supprimé') }} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const importProspects = useImportProspects()
  const run = useAction()
  const [cible, setCible] = useState<Cible>('cgp')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  async function submit() {
    setBusy(true)
    const res = await importProspects(text, cible)
    setBusy(false)
    if (!res) return
    await run(async () => res, `${res.added} prospect${res.added > 1 ? 's' : ''} importé${res.added > 1 ? 's' : ''}${res.skipped ? `, ${res.skipped} ignoré${res.skipped > 1 ? 's' : ''} (doublon, client connu ou sans e-mail)` : ''}`)
    if (res.added) onClose()
  }

  return (
    <Modal title="Importer des prospects" onClose={onClose} wide>
      <div className="space-y-4">
        <Field label="Cible de ce fichier" hint="Elle décide du message envoyé. Un fichier par cible.">
          {(id) => (
            <Select id={id} value={cible} onChange={(e) => setCible(e.target.value as Cible)}>
              {CIBLE_IDS.map((c) => <option key={c} value={c}>{CIBLES[c].label}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Fichier CSV" hint="Colonnes reconnues : prénom, nom, email, entreprise, site, ville, poste, description (ou activité). Seule la colonne email est obligatoire.">
          {(id) => (
            <div className="space-y-2">
              <input
                ref={file} id={id} type="file" accept=".csv,.tsv,.txt,text/csv"
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-full file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-medium"
                onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()) }}
              />
              <Textarea aria-label="Ou collez le contenu" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Ou collez le contenu ici, en-tête compris :\nprénom;nom;email;entreprise;site;ville'} className="font-mono text-xs" />
            </div>
          )}
        </Field>
        <p className="text-xs text-slate-500">Les adresses déjà présentes dans la prospection ou dans vos contacts clients sont ignorées automatiquement.</p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" icon={Upload} disabled={busy || !text.trim()} onClick={() => void submit()}>Importer</Button>
        </div>
      </div>
    </Modal>
  )
}
