import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  AtSign, Building2, CheckSquare, FileText, FolderKanban, Kanban, Landmark, LayoutDashboard, LogOut, Menu,
  Send, Settings, X, type LucideIcon,
} from 'lucide-react'
import { isoDay } from '../lib/format'
import { queue } from '../lib/prospection'
import { isOverdue } from '../lib/selectors'
import { useStore } from '../lib/store'
import { CLOUD, DEMO, LOGO } from '../lib/env'
import { savePerson, signOutCloud } from '../lib/firebase'
import { AgendaPanel } from './AgendaPanel'
import { CommandPalette, TopBar } from './TopBar'
import { Avatar, IconButton } from './ui'

interface NavItem { to: string; label: string; icon: LucideIcon; badge?: number }

export function Layout() {
  const { data, me, online } = useStore()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [palette, setPalette] = useState(false)
  // ⌘K / Ctrl+K ouvre la palette de commandes depuis n'importe quel écran
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p) } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const today = isoDay()
  const nav: NavItem[] = [
    { to: '/', label: 'Tableau de bord', icon: LayoutDashboard },
    { to: '/pipeline', label: 'Pipeline', icon: Kanban, badge: data.deals.filter((d) => d.stage === 'nouveau').length },
    { to: '/prospection', label: 'Prospection', icon: Send, badge: queue(data.prospects, today).length },
    { to: '/clients', label: 'Clients', icon: Building2 },
    { to: '/projets', label: 'Projets', icon: FolderKanban },
    { to: '/documents', label: 'Facturation', icon: FileText, badge: data.qonto_invoices.filter(isOverdue).length },
    { to: '/finances', label: 'Finances', icon: Landmark },
    { to: '/instagram', label: 'Instagram', icon: AtSign, badge: data.instagram_messages.filter((m) => !m.handled).length },
    { to: '/taches', label: 'Tâches', icon: CheckSquare, badge: data.tasks.filter((t) => !t.done && t.assignee_id === me?.id && !!t.due_date && t.due_date <= today).length },
    { to: '/reglages', label: 'Réglages', icon: Settings },
  ]
  // Moi d'abord, puis mon associé
  const team = [...data.profiles].sort((a, b) => Number(b.id === me?.id) - Number(a.id === me?.id))

  return (
    <div className="flex h-full flex-col gap-3 p-3 lg:flex-row lg:p-4 print:block print:h-auto print:p-0">
      <div className="ambient" aria-hidden><span /><span /><span /></div>
      <header className="glass no-print flex items-center justify-between rounded-2xl py-1.5 pl-4 pr-2 lg:hidden">
        <span className="flex items-center gap-2.5 text-sm font-semibold"><img src={LOGO} alt="" className="h-7 w-auto" />SL Agence</span>
        <IconButton icon={open ? X : Menu} label={open ? 'Fermer le menu' : 'Ouvrir le menu'} onClick={() => setOpen(!open)} className="!h-11 !w-11" />
      </header>

      {/* Barre d'icônes : libellés visibles sur mobile, en info-bulle sur grand écran */}
      <nav className={`glass no-print relative z-30 ${open ? 'flex' : 'hidden'} shrink-0 flex-col rounded-3xl p-2 lg:flex lg:w-[68px] lg:items-center lg:py-4`} aria-label="Navigation principale">
        <img src={LOGO} alt="SL Agence" className="mb-5 hidden h-10 w-auto lg:block" />
        <ul className="flex-1 space-y-1">
          {nav.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to} end={item.to === '/'} onClick={() => setOpen(false)}
                className={({ isActive }) => `group relative flex h-11 items-center gap-3 rounded-2xl px-3 text-sm font-medium transition-colors lg:w-11 lg:justify-center lg:px-0 ${isActive ? 'bg-sauge text-noir' : 'text-fg-muted hover:bg-hover hover:text-fg'}`}
              >
                <item.icon size={19} aria-hidden />
                <span className="flex-1 lg:sr-only">{item.label}</span>
                {!!item.badge && (
                  <span className="rounded-full bg-corail px-1.5 text-xs font-bold text-noir lg:absolute lg:-right-1 lg:-top-1 lg:min-w-[18px] lg:text-center lg:text-[11px] lg:leading-[18px]">
                    {item.badge}<span className="sr-only"> à traiter</span>
                  </span>
                )}
                <span aria-hidden className="pointer-events-none absolute left-full z-50 ml-3 hidden whitespace-nowrap rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-noir shadow-lg lg:group-hover:block lg:group-focus-visible:block">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        {/* Les deux associés, avec leur présence */}
        <div className="mt-2 flex items-center gap-3 border-t border-white/10 px-2 pt-3 lg:flex-col lg:gap-2.5 lg:px-0">
          <div className="flex items-center gap-2 lg:flex-col">
            {team.map((p) => <Avatar key={p.id} profile={p} size={32} online={online.includes(p.id)} />)}
          </div>
          <div className="min-w-0 flex-1 lg:hidden">
            <p className="truncate text-sm font-medium">{me?.full_name}</p>
            <p className="truncate text-xs text-fg-muted">{me?.email}</p>
          </div>
          {CLOUD && <IconButton icon={LogOut} label="Se déconnecter" onClick={() => { savePerson(null); void signOutCloud() }} className="!h-11 !w-11" />}
        </div>
      </nav>

      <main className="glass min-w-0 flex-1 overflow-y-auto rounded-3xl print:overflow-visible print:rounded-none">
        <TopBar onPalette={() => setPalette(true)} />
        {DEMO && (
          <p className="no-print mx-4 mt-4 rounded-full border border-white/10 bg-white/[0.06] px-4 py-1.5 text-center text-[13px] text-fg-muted lg:mx-7">
            Mode démonstration : données fictives, rien n'est enregistré.
          </p>
        )}
        <div key={pathname} className="page px-4 py-5 lg:px-7 print:p-0">
          <Outlet />
        </div>
      </main>

      {palette && <CommandPalette onClose={() => setPalette(false)} />}

      {pathname === '/' && (
        <aside className="glass no-print hidden w-80 shrink-0 overflow-y-auto rounded-3xl p-4 xl:block" aria-label="Agenda de l'équipe">
          <AgendaPanel />
        </aside>
      )}
    </div>
  )
}
