import { ask } from '../components/Confirm'
import { useState, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Kanban } from '../components/Kanban'
import { TaskList } from '../components/shared'
import { Avatar, Button, Field, FormActions, Modal, PageHeader, Select, TextField, Textarea, useAction } from '../components/ui'
import { PROJECT_STATUSES } from '../lib/constants'
import { eur0, fmtDate, isoDay, parseNumber } from '../lib/format'
import { useLookups } from '../lib/selectors'
import { useStore } from '../lib/store'
import type { Project, ProjectStatus } from '../lib/types'

export function Projects() {
  const { data, update } = useStore()
  const { company, profile } = useLookups()
  const run = useAction()
  const [modal, setModal] = useState<Project | 'new' | null>(null)
  const active = data.projects.filter((p) => p.status === 'en_cours' || p.status === 'en_recette').length

  return (
    <>
      <PageHeader title="Projets" subtitle={`${active} en production · ${data.projects.length} au total`}>
        <Button variant="primary" icon={Plus} onClick={() => setModal('new')}>Nouveau projet</Button>
      </PageHeader>

      <Kanban
        columns={PROJECT_STATUSES}
        items={data.projects}
        columnOf={(p) => p.status}
        onMove={(id, status) => run(() => update('projects', id, { status: status as ProjectStatus }))}
        onOpen={(p) => setModal(p)}
        renderCard={(p) => {
          const open = data.tasks.filter((t) => t.project_id === p.id && !t.done).length
          const late = !!p.due_date && p.due_date < isoDay() && p.status !== 'livre' && p.status !== 'maintenance'
          return (
            <>
              <p className="text-sm font-medium leading-snug text-slate-900">{p.name}</p>
              {p.company_id && <p className="text-xs text-slate-500">{company.get(p.company_id)?.name}</p>}
              <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                <span className={late ? 'font-semibold text-rose-700' : 'text-slate-500'}>{p.due_date ? `Livraison ${fmtDate(p.due_date)}` : 'Sans échéance'}</span>
                <span className="flex items-center gap-2">
                  {open > 0 && <span className="text-slate-500">{open} tâche{open > 1 ? 's' : ''}</span>}
                  {p.budget != null && <span className="font-semibold text-slate-700">{eur0(p.budget)}</span>}
                  <Avatar profile={p.owner_id ? profile.get(p.owner_id) : null} size={20} />
                </span>
              </div>
            </>
          )
        }}
      />

      {modal && <ProjectForm key={modal === 'new' ? 'new' : modal.id} project={modal === 'new' ? undefined : data.projects.find((p) => p.id === modal.id)} onClose={() => setModal(null)} />}
    </>
  )
}

function ProjectForm({ project, onClose }: { project?: Project; onClose: () => void }) {
  const { data, insert, update, remove, me } = useStore()
  const run = useAction()
  const [form, setFormState] = useState({
    name: project?.name ?? '', company_id: project?.company_id ?? '', status: project?.status ?? 'a_demarrer' as ProjectStatus,
    owner_id: project?.owner_id ?? me?.id ?? '', start_date: project?.start_date ?? '', due_date: project?.due_date ?? '',
    budget: project?.budget?.toString() ?? '', description: project?.description ?? '',
  })
  const set = (patch: Partial<typeof form>) => setFormState((f) => ({ ...f, ...patch }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const row = {
      name: form.name.trim(), company_id: form.company_id || null, status: form.status, owner_id: form.owner_id || null,
      start_date: form.start_date || null, due_date: form.due_date || null, budget: parseNumber(form.budget),
      description: form.description.trim() || null,
    }
    const saved = await run(() => (project ? update('projects', project.id, row) : insert('projects', row)), 'Projet enregistré')
    if (saved) onClose()
  }

  return (
    <Modal title={project ? project.name : 'Nouveau projet'} onClose={onClose} wide>
      <form onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Nom du projet" form={form} set={set} name="name" required className="sm:col-span-2" />
          <Field label="Client">
            {(id) => (
              <Select id={id} value={form.company_id} onChange={(e) => set({ company_id: e.target.value })}>
                <option value="">Interne</option>
                {data.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Responsable">
            {(id) => (
              <Select id={id} value={form.owner_id} onChange={(e) => set({ owner_id: e.target.value })}>
                <option value="">Non attribué</option>
                {data.profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="État">
            {(id) => <Select id={id} value={form.status} onChange={(e) => set({ status: e.target.value as ProjectStatus })}>{PROJECT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>}
          </Field>
          <TextField label="Budget HT (€)" form={form} set={set} name="budget" />
          <TextField label="Début" form={form} set={set} name="start_date" type="date" />
          <TextField label="Livraison prévue" form={form} set={set} name="due_date" type="date" />
          <Field label="Description" className="sm:col-span-2">{(id) => <Textarea id={id} value={form.description} onChange={(e) => set({ description: e.target.value })} />}</Field>
        </div>
        <FormActions
          onCancel={onClose}
          extra={project && <Button variant="danger" icon={Trash2} onClick={() => void ask('Supprimer ce projet et ses tâches ?').then((ok): unknown => ok && run(() => remove('projects', project.id), 'Projet supprimé').then(onClose))}>Supprimer</Button>}
        />
      </form>
      {project && (
        <div className="mt-5 border-t border-slate-200 pt-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Tâches du projet</h3>
          <TaskList tasks={data.tasks.filter((t) => t.project_id === project.id)} link={{ project_id: project.id, company_id: project.company_id }} />
        </div>
      )}
    </Modal>
  )
}
