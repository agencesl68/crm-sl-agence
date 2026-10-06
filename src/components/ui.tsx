import {
  createContext, useCallback, useContext, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { X, type LucideIcon } from 'lucide-react'
import type { Tone } from '../lib/constants'
import { initials } from '../lib/format'
import type { Profile } from '../lib/types'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

// ───────────────────────────── Boutons ─────────────────────────────

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'bg-btn text-fg border border-btn-border hover:bg-hover',
  ghost: 'text-fg-muted hover:bg-hover hover:text-fg',
  danger: 'bg-white text-rose-700 border border-rose-200 hover:bg-rose-50',
}

export function Button({
  variant = 'secondary', icon: Icon, small, className, children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: LucideIcon; small?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-colors disabled:opacity-50',
        small ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-sm',
        VARIANTS[variant], className,
      )}
    >
      {Icon && <Icon size={16} aria-hidden />}
      {children}
    </button>
  )
}

export function IconButton({
  icon: Icon, label, className, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cx(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-hover hover:text-fg',
        className,
      )}
    >
      <Icon size={18} aria-hidden />
    </button>
  )
}

// ───────────────────────────── Formulaires ─────────────────────────────

const CONTROL =
  'surface w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-vert focus:outline-none focus:ring-2 focus:ring-vert/20 disabled:bg-slate-100 disabled:text-slate-500'

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: (id: string) => ReactNode; className?: string }) {
  const id = useId()
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      {children(id)}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx(CONTROL, 'h-10', className)} />
}
export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...rest} className={cx(CONTROL, 'py-2 leading-relaxed', className)} />
}
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...rest} className={cx(CONTROL, 'h-10 pr-8', className)}>{children}</select>
}

/** Champ texte lié à une clé d'un objet de formulaire. */
export function TextField<T extends Record<string, unknown>>({
  label, form, set, name, type = 'text', hint, className, required, placeholder,
}: {
  label: string; form: T; set: (patch: Partial<T>) => void; name: keyof T & string
  type?: string; hint?: string; className?: string; required?: boolean; placeholder?: string
}) {
  return (
    <Field label={label} hint={hint} className={className}>
      {(id) => (
        <Input
          id={id} type={type} required={required} placeholder={placeholder}
          value={(form[name] as string | number | null) ?? ''}
          onChange={(e) => set({ [name]: e.target.value } as Partial<T>)}
        />
      )}
    </Field>
  )
}

// ───────────────────────────── Fenêtres ─────────────────────────────

const escapeStack: (() => void)[] = []
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => e.key === 'Escape' && escapeStack.at(-1)?.())
}
/** Échap ferme uniquement la fenêtre ouverte en dernier (une modale par-dessus un panneau, par exemple). */
function useEscape(onClose: () => void) {
  const latest = useRef(onClose)
  latest.current = onClose
  useEffect(() => {
    const handler = () => latest.current()
    escapeStack.push(handler)
    return () => { escapeStack.splice(escapeStack.indexOf(handler), 1) }
  }, [])
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean | 'xl' }) {
  useEscape(onClose)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('input, select, textarea')?.focus()
  }, [])
  // Rendu hors des panneaux en verre : leur flou d'arrière-plan piégerait sinon le positionnement fixe.
  return createPortal(
    <div className="fade-in no-print fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={cx('surface pop-in flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl', wide === 'xl' ? 'sm:max-w-4xl' : wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <IconButton icon={X} label="Fermer" onClick={onClose} />
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

export function Drawer({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  useEscape(onClose)
  return createPortal(
    <div className="fade-in no-print fixed inset-0 z-40 flex justify-end bg-black/50 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside role="dialog" aria-modal="true" className="surface sheet-in flex h-full w-full max-w-xl flex-col bg-white shadow-2xl sm:rounded-l-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0 flex-1">{title}</div>
          <IconButton icon={X} label="Fermer" onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>,
    document.body,
  )
}

/** Pied de formulaire : Annuler / Enregistrer. */
export function FormActions({ onCancel, submitLabel = 'Enregistrer', busy, extra }: { onCancel: () => void; submitLabel?: string; busy?: boolean; extra?: ReactNode }) {
  return (
    <div className="mt-5 flex items-center justify-between gap-2">
      <div>{extra}</div>
      <div className="flex gap-2">
        <Button onClick={onCancel}>Annuler</Button>
        <Button type="submit" variant="primary" disabled={busy}>{submitLabel}</Button>
      </div>
    </div>
  )
}

// ───────────────────────────── Affichage ─────────────────────────────

const TONES: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700',
  sky: 'bg-sky-50 text-sky-800',
  emerald: 'bg-emerald-50 text-emerald-800',
  amber: 'bg-amber-50 text-amber-800',
  rose: 'bg-rose-50 text-rose-700',
  violet: 'bg-violet-50 text-violet-800',
}
export function Badge({ tone = 'slate', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', TONES[tone])}>{children}</span>
}

export function Card({ title, action, children, className, flush }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={cx('surface spot min-w-0 rounded-2xl bg-white shadow-sm', className)}>
      {title && (
        <div className="flex min-h-12 items-center justify-between gap-2 border-b border-slate-200 px-4 py-2">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {action}
        </div>
      )}
      <div className={flush ? '' : 'p-4'}>{children}</div>
    </section>
  )
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-medium tracking-tight text-fg">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-fg-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

export function Empty({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-hover text-fg-muted"><Icon size={20} aria-hidden /></div>
      <p className="text-sm font-medium text-fg">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-fg-muted">{children}</div>}
    </div>
  )
}

/** Texte sombre sur une couleur claire, clair sur une couleur sombre. */
function readableOn(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const luminance = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return luminance > 0.55 ? '#070907' : '#fff'
}

/** Pastille aux initiales du membre ; `online` ajoute le point de présence. */
export function Avatar({ profile, size = 24, online }: { profile: Profile | undefined | null; size?: number; online?: boolean }) {
  if (!profile) return null
  return (
    <span className="relative inline-flex shrink-0" title={online === undefined ? profile.full_name : `${profile.full_name} — ${online ? 'en ligne' : 'hors ligne'}`}>
      <span
        className="inline-flex items-center justify-center rounded-full font-semibold"
        style={{ width: size, height: size, fontSize: size * 0.4, background: profile.color, color: readableOn(profile.color) }}
      >
        {initials(profile.full_name)}
      </span>
      {online !== undefined && (
        <span aria-hidden className={cx('absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-ring-surface', online ? 'bg-sauge' : 'bg-slate-400')} style={{ width: size * 0.3, height: size * 0.3 }} />
      )}
    </span>
  )
}

/** Filtre « toute l'équipe / un associé » : chaque membre est un bouton à ses initiales. */
export function OwnerFilter({ profiles, value, onChange, allLabel = 'Tous' }: { profiles: Profile[]; value: string; onChange: (id: string) => void; allLabel?: string }) {
  const item = (active: boolean) => cx('flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium transition-colors', active ? 'bg-primary text-on-primary' : 'text-fg-muted hover:text-fg')
  return (
    <div role="group" aria-label="Filtrer par associé" className="inline-flex items-center gap-0.5 rounded-full border border-btn-border bg-btn p-1">
      <button type="button" aria-pressed={value === ''} onClick={() => onChange('')} className={item(value === '')}>{allLabel}</button>
      {profiles.map((p) => (
        <button key={p.id} type="button" aria-pressed={value === p.id} onClick={() => onChange(p.id)} className={item(value === p.id)}>
          <Avatar profile={p} size={18} />{p.full_name}
        </button>
      ))}
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { id: T; label: string; count?: number }[] }) {
  return (
    <div role="tablist" className="surface inline-flex max-w-full overflow-x-auto rounded-xl bg-white p-1">
      {tabs.map((t) => (
        <button
          key={t.id} role="tab" type="button" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cx('h-9 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors', value === t.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900')}
        >
          {t.label}
          {t.count !== undefined && <span className={cx('ml-1.5 text-xs', value === t.id ? 'text-slate-300' : 'text-slate-400')}>{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

// ───────────────────────────── Notifications ─────────────────────────────

interface Toast { id: number; message: string; error: boolean }
const ToastContext = createContext<(message: string, error?: boolean) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((message: string, error = false) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, message, error }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), error ? 7000 : 3000)
  }, [])
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="no-print pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role={t.error ? 'alert' : 'status'} className={cx('pop-in rounded-full px-4 py-2.5 text-center text-sm font-medium shadow-xl', t.error ? 'bg-rose-700 text-white' : 'bg-sauge text-noir')}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/** Exécute une action asynchrone : message de succès facultatif, message d'erreur systématique. */
/** Affiche un message éphémère (comme après une action). */
export const useToast = () => useContext(ToastContext)

export function useAction() {
  const toast = useContext(ToastContext)
  return useCallback(async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
    try {
      const result = await fn()
      if (success) toast(success)
      return result
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Une erreur est survenue', true)
      return undefined
    }
  }, [toast])
}
