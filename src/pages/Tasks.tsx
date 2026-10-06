import { useState } from 'react'
import { CheckSquare } from 'lucide-react'
import { TaskAdd, TaskRow } from '../components/shared'
import { Card, Empty, PageHeader, Select } from '../components/ui'
import { isoDay } from '../lib/format'
import { useStore } from '../lib/store'
import type { Task } from '../lib/types'

export function Tasks() {
  const { data, me } = useStore()
  const [assignee, setAssignee] = useState(me?.id ?? '')
  const [showDone, setShowDone] = useState(false)
  const today = isoDay()

  const tasks = data.tasks
    .filter((t) => (!assignee || t.assignee_id === assignee || !t.assignee_id) && (showDone || !t.done))
    .sort((a, b) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9'))

  const groups: [string, Task[]][] = [
    ['En retard', tasks.filter((t) => !t.done && !!t.due_date && t.due_date < today)],
    ["Aujourd'hui", tasks.filter((t) => !t.done && t.due_date === today)],
    ['À venir', tasks.filter((t) => !t.done && !!t.due_date && t.due_date > today)],
    ['Sans échéance', tasks.filter((t) => !t.done && !t.due_date)],
    ['Terminées', tasks.filter((t) => t.done)],
  ]

  return (
    <>
      <PageHeader title="Tâches" subtitle={`${tasks.filter((t) => !t.done).length} à faire`}>
        <label className="flex items-center gap-2 text-sm text-fg-muted">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="h-4 w-4 accent-vert" />
          Afficher les terminées
        </label>
        <Select aria-label="Filtrer par responsable" value={assignee} onChange={(e) => setAssignee(e.target.value)} className="!w-40">
          <option value="">Toute l'équipe</option>
          {data.profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </Select>
      </PageHeader>

      <Card className="mb-4"><TaskAdd link={{}} /></Card>

      {tasks.length === 0 ? <Card><Empty icon={CheckSquare} title="Rien à faire pour l'instant" /></Card> : (
        <div className="space-y-4">
          {groups.filter(([, list]) => list.length > 0).map(([label, list]) => (
            <Card key={label} title={<span className={label === 'En retard' ? 'text-rose-700' : ''}>{label} <span className="font-normal text-slate-500">{list.length}</span></span>}>
              <ul className="-my-2 divide-y divide-slate-100">{list.map((t) => <TaskRow key={t.id} task={t} showContext />)}</ul>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
