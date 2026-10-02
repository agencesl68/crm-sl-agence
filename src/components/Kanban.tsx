import { useState, type ReactNode } from 'react'

interface Column { id: string; label: string; dot: string }

/** Tableau en colonnes avec glisser-déposer. Le changement de colonne reste possible au clavier depuis la fiche. */
export function Kanban<T extends { id: string }>({
  columns, items, columnOf, onMove, onOpen, renderCard, columnSummary,
}: {
  columns: Column[]
  items: T[]
  columnOf: (item: T) => string
  onMove: (id: string, column: string) => void
  onOpen: (item: T) => void
  renderCard: (item: T) => ReactNode
  columnSummary?: (items: T[]) => ReactNode
}) {
  const [over, setOver] = useState<string | null>(null)
  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 lg:-mx-7 lg:px-7">
      {columns.map((col) => {
        const colItems = items.filter((i) => columnOf(i) === col.id)
        return (
          <div
            key={col.id}
            onDragOver={(e) => { e.preventDefault(); setOver(col.id) }}
            onDragLeave={() => setOver((o) => (o === col.id ? null : o))}
            onDrop={(e) => {
              e.preventDefault()
              setOver(null)
              const id = e.dataTransfer.getData('text/plain')
              if (id) onMove(id, col.id)
            }}
            className={`flex w-72 shrink-0 flex-col rounded-2xl border p-2 transition-colors ${over === col.id ? 'border-sauge bg-white/15' : 'border-white/10 bg-white/[0.06]'}`}
          >
            <div className="flex items-center justify-between px-2 py-1.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-fg">
                <span className={`h-2 w-2 rounded-full ${col.dot}`} aria-hidden />
                {col.label}
                <span className="font-normal text-fg-muted">{colItems.length}</span>
              </div>
              {columnSummary && <div className="text-xs font-medium text-fg-muted">{columnSummary(colItems)}</div>}
            </div>
            <div className="flex min-h-16 flex-col gap-2">
              {colItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData('text/plain', item.id); e.dataTransfer.effectAllowed = 'move' }}
                  onClick={() => onOpen(item)}
                  className="surface rounded-xl bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md"
                >
                  {renderCard(item)}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
