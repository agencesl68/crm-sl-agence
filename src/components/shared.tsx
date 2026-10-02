import { useState, type FormEvent } from 'react'
import {
  AtSign, Bot, CalendarClock, Mail, MailOpen, Phone, Plus, RefreshCw, StickyNote, Trash2, type LucideIcon,
} from 'lucide-react'
import { ACTIVITY_LABEL } from '../lib/constants'
import { ago, fmtDate, isoDay } from '../lib/format'
import { useLookups } from '../lib/selectors'
import { ARTIFACT } from '../lib/env'
import { callMake } from '../lib/make'
import { useStore } from '../lib/store'
import type { Activity, ActivityType, Task } from '../lib/types'
import { Avatar, Button, Field, FormActions, IconButton, Input, Modal, Select, Textarea, useAction } from './ui'

const ACTIVITY_ICON: Record<ActivityType, LucideIcon> = {
  note: StickyNote, appel: Phone, rdv: CalendarClock, email_recu: MailOpen, email_envoye: Mail,
  relance: RefreshCw, instagram: AtSign, systeme: Bot,
}

type Link = { deal_id?: string | null; company_id?: string | null; contact_id?: string | null; project_id?: string | null }

// ───────────────────────────── Historique ─────────────────────────────

export function Timeline({ activities, link }: { activities: Activity[]; link: Link }) {
  const { insert, me } = useStore()
  const { profile } = useLookups()
  const run = useAction()
  const [type, setType] = useState<ActivityType>('note')
  const [body, setBody] = useState('')

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    const ok = await run(() => insert('activities', {
      type, body: body.trim(), author_id: me?.id ?? null,
      deal_id: link.deal_id ?? null, company_id: link.company_id ?? null, contact_id: link.contact_id ?? null,
    }))
    if (ok) setBody('')
  }

  return (
    <div>
      <form onSubmit={add} className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <Textarea aria-label="Nouvelle entrée dans l'historique" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Compte rendu d'appel, note, décision…" rows={2} />
        <div className="mt-2 flex items-center justify-between gap-2">
          <Select aria-label="Type d'entrée" value={type} onChange={(e) => setType(e.target.value as ActivityType)} className="!h-9 !w-auto">
            <option value="note">Note</option>
            <option value="appel">Appel</option>
            <option value="rdv">Rendez-vous</option>
          </Select>
          <Button type="submit" variant="primary" small icon={Plus} disabled={!body.trim()}>Ajouter</Button>
        </div>
      </form>
      {activities.length === 0 && <p className="py-2 text-sm text-slate-500">Aucun échange pour l'instant.</p>}
      <ol className="space-y-4">
        {activities.map((a) => {
          const Icon = ACTIVITY_ICON[a.type]
          return (
            <li key={a.id} className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600"><Icon size={15} aria-hidden /></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium text-slate-900">{a.subject || ACTIVITY_LABEL[a.type]}</span>
                  <span className="text-xs text-slate-500">
                    {a.subject ? `${ACTIVITY_LABEL[a.type]} · ` : ''}{ago(a.occurred_at)}
                    {a.author_id && profile.get(a.author_id) ? ` · ${profile.get(a.author_id)!.full_name}` : ''}
                  </span>
                </div>
                {a.body && <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{a.body}</p>}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// ───────────────────────────── Tâches ─────────────────────────────

export function TaskRow({ task, showContext }: { task: Task; showContext?: boolean }) {
  const { update, remove } = useStore()
  const { profile, deal, company, project } = useLookups()
  const run = useAction()
  const late = !task.done && !!task.due_date && task.due_date < isoDay()
  const context = showContext
    ? (task.deal_id && deal.get(task.deal_id)?.title) || (task.project_id && project.get(task.project_id)?.name) || (task.company_id && company.get(task.company_id)?.name)
    : null
  return (
    <li className="group flex items-center gap-3 py-2">
      <input
        type="checkbox" checked={task.done} aria-label={`Terminer : ${task.title}`}
        onChange={(e) => run(() => update('tasks', task.id, { done: e.target.checked, done_at: e.target.checked ? new Date().toISOString() : null }))}
        className="h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300 accent-vert"
      />
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium ${task.done ? 'text-slate-400 line-through' : 'text-slate-900'}`} title={task.title}>{task.title}</p>
        <p className="truncate text-xs text-slate-500">
          {task.due_date && <span className={late ? 'font-semibold text-rose-700' : ''}>{late ? 'En retard · ' : ''}{task.due_date === isoDay() ? "Aujourd'hui" : fmtDate(task.due_date)}</span>}
          {task.due_date && context && ' · '}
          {context}
        </p>
      </div>
      <Avatar profile={task.assignee_id ? profile.get(task.assignee_id) : null} size={22} />
      <IconButton icon={Trash2} label="Supprimer la tâche" className="!h-8 !w-8 opacity-0 focus:opacity-100 group-hover:opacity-100" onClick={() => run(() => remove('tasks', task.id))} />
    </li>
  )
}

export function TaskAdd({ link }: { link: Link }) {
  const { insert, me, data } = useStore()
  const run = useAction()
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [assignee, setAssignee] = useState(me?.id ?? '')

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const ok = await run(() => insert('tasks', {
      title: title.trim(), due_date: due || null, assignee_id: assignee || null,
      deal_id: link.deal_id ?? null, company_id: link.company_id ?? null, project_id: link.project_id ?? null,
    }))
    if (ok) { setTitle(''); setDue('') }
  }

  return (
    <form onSubmit={add} className="flex flex-wrap gap-2">
      <Input aria-label="Nouvelle tâche" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nouvelle tâche…" className="min-w-40 flex-1" />
      <Input aria-label="Échéance" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="!w-40" />
      <Select aria-label="Responsable" value={assignee} onChange={(e) => setAssignee(e.target.value)} className="!w-32">
        <option value="">Personne</option>
        {data.profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
      </Select>
      <Button type="submit" variant="primary" icon={Plus} disabled={!title.trim()}>Ajouter</Button>
    </form>
  )
}

export function TaskList({ tasks, link }: { tasks: Task[]; link: Link }) {
  const sorted = [...tasks].sort((a, b) => Number(a.done) - Number(b.done) || (a.due_date ?? '9').localeCompare(b.due_date ?? '9'))
  return (
    <div>
      <TaskAdd link={link} />
      <ul className="mt-2 divide-y divide-slate-100">{sorted.map((t) => <TaskRow key={t.id} task={t} />)}</ul>
    </div>
  )
}

// ───────────────────────────── E-mail ─────────────────────────────

export function ComposeEmail({
  to, subject = '', body, kind = 'email', link, onClose,
}: { to: string; subject?: string; body?: string; kind?: 'email' | 'relance'; link: Link; onClose: () => void }) {
  const { insert, me, settings } = useStore()
  const run = useAction()
  const [form, setForm] = useState({ to, subject, body: body ?? `Bonjour,\n\n\n\n${settings.email_signature}` })
  const [busy, setBusy] = useState(false)

  async function send(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const ok = await run(async () => {
      if (ARTIFACT) await callMake('email', { to: form.to.trim(), subject: form.subject.trim(), body: form.body })
      return insert('outbox', {
        to_email: form.to.trim(), subject: form.subject.trim(), body: form.body, kind, status: 'sent', sent_at: new Date().toISOString(),
        deal_id: link.deal_id ?? null, contact_id: link.contact_id ?? null, created_by: me?.id ?? null,
      })
    }, 'E-mail envoyé depuis la boîte de l’agence')
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <Modal title={kind === 'relance' ? 'Relancer par e-mail' : 'Écrire un e-mail'} onClose={onClose} wide>
      <form onSubmit={send} className="space-y-3">
        <Field label="Destinataire">{(id) => <Input id={id} type="email" required value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />}</Field>
        <Field label="Objet">{(id) => <Input id={id} required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />}</Field>
        <Field label="Message" hint="Envoyé depuis la boîte de l’agence (agence.sl.68@gmail.com), puis ajouté à l’historique.">
          {(id) => <Textarea id={id} required rows={10} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />}
        </Field>
        <FormActions onCancel={onClose} submitLabel="Envoyer" busy={busy} />
      </form>
    </Modal>
  )
}
