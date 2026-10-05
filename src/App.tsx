import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { DEMO_USER_ID } from './lib/demo'
import { ARTIFACT, CLOUD } from './lib/env'
import { cloudContext, PEOPLE, personFor, savedPerson, savePerson, signIn, signOutCloud, watchAuth, type Person } from './lib/firebase'
import type { User } from 'firebase/auth'
import { Button } from './components/ui'
import { LOGO } from './lib/env'
import { use, type Db, type LiveContext, type RoomApi, type UserApi } from './lib/runtime'
import { StoreProvider, useStore } from './lib/store'
import { ClientDetail, Clients } from './pages/Clients'
import { Dashboard } from './pages/Dashboard'
import { Documents, QuoteEditor } from './pages/Documents'
import { Finances } from './pages/Finances'
import { Instagram } from './pages/Instagram'
import { InvoiceEditor } from './pages/Invoices'
import { Pipeline } from './pages/Pipeline'
import { Projects } from './pages/Projects'
import { Prospection } from './pages/Prospection'
import { SettingsPage } from './pages/Settings'
import { Tasks } from './pages/Tasks'

function Screen({ children }: { children: ReactNode }) {
  return <div className="flex h-full items-center justify-center p-6 text-center text-sm text-fg-muted">{children}</div>
}

/** Écran de chargement : la silhouette de l'application scintille le temps de récupérer les données. */
function Loading() {
  return (
    <div className="flex h-full gap-4 p-4" aria-label="Chargement">
      <div className="skeleton hidden w-[68px] rounded-3xl lg:block" />
      <div className="flex flex-1 flex-col gap-4">
        <div className="skeleton h-12 rounded-full" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-32 rounded-2xl" />)}</div>
        <div className="skeleton flex-1 rounded-2xl" />
      </div>
    </div>
  )
}

function Workspace() {
  const { loading, error } = useStore()
  if (loading) return <Loading />
  if (error) return <Screen><div><p className="font-medium text-rose-300">Impossible de charger les données</p><p className="mt-1">{error}</p>{CLOUD && <Button className="mt-4" onClick={() => signOutCloud()}>Changer de compte</Button>}</div></Screen>
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="pipeline" element={<Pipeline />} />
        <Route path="prospection" element={<Prospection />} />
        <Route path="clients" element={<Clients />} />
        <Route path="clients/:id" element={<ClientDetail />} />
        <Route path="projets" element={<Projects />} />
        <Route path="documents" element={<Documents />} />
        <Route path="devis/:id" element={<QuoteEditor />} />
        <Route path="factures/:id" element={<InvoiceEditor />} />
        <Route path="finances" element={<Finances />} />
        <Route path="tresorerie" element={<Navigate to="/finances" replace />} />
        <Route path="instagram" element={<Instagram />} />
        <Route path="taches" element={<Tasks />} />
        <Route path="reglages" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

type Boot = { state: 'loading' } | { state: 'ready'; userId: string; live: LiveContext } | { state: 'blocked'; reason: string }

/** Le vrai CRM : base partagée, identité et présence fournies par claude.ai. */
function LiveApp() {
  const [boot, setBoot] = useState<Boot>({ state: 'loading' })
  useEffect(() => {
    (async () => {
      const [db, user, room] = await Promise.all([use<Db>('db'), use<UserApi>('user'), use<RoomApi>('room')])
      if (!db || !user) return setBoot({ state: 'blocked', reason: 'Ouvrez le CRM depuis claude.ai, connecté à votre compte : la base partagée n’est pas accessible ici.' })
      const userId = await user.id()
      if (!userId) return setBoot({ state: 'blocked', reason: 'Connectez-vous à claude.ai pour accéder au CRM.' })
      setBoot({ state: 'ready', userId, live: { db, user, room } })
    })()
  }, [])
  if (boot.state === 'loading') return <Loading />
  if (boot.state === 'blocked') return <Screen><p className="max-w-sm">{boot.reason}</p></Screen>
  return <StoreProvider userId={boot.userId} live={boot.live}><Workspace /></StoreProvider>
}

/** Version GitHub Pages : connexion Google, puis base Firestore partagée. */
function CloudApp() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [failed, setFailed] = useState<string | null>(null)
  const [person, setPerson] = useState<Person | null>(savedPerson)
  useEffect(() => watchAuth((u) => { setUser(u); setPerson(personFor(u)) }), [])
  if (user === undefined) return <Loading />
  if (!user) {
    return (
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="glass w-full max-w-sm rounded-3xl p-8 text-center">
          <img src={LOGO} alt="SL Agence" className="mx-auto h-16 w-auto" />
          <h1 className="mt-5 text-xl font-medium tracking-tight">CRM SL Agence</h1>
          <p className="mt-1 text-sm text-fg-muted">Réservé à Sacha et Loïc.</p>
          <Button variant="primary" className="mt-6 w-full" onClick={() => signIn().catch((e: { code?: string }) => setFailed(e.code === 'auth/popup-closed-by-user' ? null : 'Connexion impossible, réessayez.'))}>Se connecter avec Google</Button>
          {failed && <p role="alert" className="mt-3 text-sm text-corail">{failed}</p>}
        </div>
      </div>
    )
  }
  if (!person) {
    return (
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="glass w-full max-w-sm rounded-3xl p-8 text-center">
          <img src={LOGO} alt="SL Agence" className="mx-auto h-16 w-auto" />
          <h1 className="mt-5 text-xl font-medium tracking-tight">Qui êtes-vous ?</h1>
          <p className="mt-1 text-sm text-fg-muted">Mémorisé sur cet appareil.</p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {PEOPLE.map((p) => <Button key={p.id} variant="primary" onClick={() => { savePerson(p); setPerson(p) }}>Je suis {p.name}</Button>)}
          </div>
        </div>
      </div>
    )
  }
  return <StoreProvider key={person.id} userId={person.id} live={cloudContext(user, person)}><Workspace /></StoreProvider>
}

export default function App() {
  if (CLOUD) return <CloudApp />
  if (ARTIFACT) return <LiveApp />
  return <StoreProvider userId={DEMO_USER_ID}><Workspace /></StoreProvider>
}
