/**
 * Version hébergée sur GitHub Pages : base Firestore et connexion Google (Firebase, offre gratuite).
 * La configuration web de Firebase n'est pas secrète : l'accès aux données est protégé par les
 * règles Firestore (firestore.rules), qui n'autorisent que les adresses des associés.
 */
import { initializeApp } from 'firebase/app'
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { collection, deleteDoc, doc, getFirestore, onSnapshot, setDoc } from 'firebase/firestore'
import type { Db, LiveContext, RoomApi, RoomPeer, UserApi } from './runtime'

const env = import.meta.env
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
}
import { CLOUD } from './env'
export { CLOUD }

const app = CLOUD ? initializeApp(config) : null
const auth = app ? getAuth(app) : null
const store = app ? getFirestore(app) : null

export const watchAuth = (fn: (user: User | null) => void) => (auth ? onAuthStateChanged(auth, fn) : () => {})
export const signIn = () => signInWithPopup(auth!, new GoogleAuthProvider())
export const signOutCloud = () => (auth ? signOut(auth) : Promise.resolve())
/** Jeton de connexion Google, vérifié par la passerelle Make avant tout appel. */
export const idToken = async () => {
  const token = await auth?.currentUser?.getIdToken()
  if (!token) throw new Error('Reconnectez-vous pour utiliser Qonto, Gmail et les demandes du site.')
  return token
}

/** Journal des synchronisations Make (dernier résultat par type), pour comprendre un échec silencieux. */
export function logSync(key: string, entry: { ok: boolean; detail: string }) {
  if (!store || !auth?.currentUser) return
  void setDoc(doc(store, 'sync_log', key), { ...entry, at: new Date().toISOString(), by: auth.currentUser.email ?? '' }).catch(() => {})
}

/** Messages lisibles pour les erreurs Firestore les plus courantes. */
function explain(code: string): string {
  if (code === 'permission-denied') return 'Ce compte Google n’a pas accès au CRM. Connectez-vous avec une adresse autorisée.'
  if (code === 'unavailable') return 'Connexion à la base impossible pour le moment (réseau ?).'
  return code
}

const db: Db = {
  collection: (path) => ({
    doc: (id) => {
      const ref = doc(store!, path, id!)
      return { set: (data) => setDoc(ref, data), delete: () => deleteDoc(ref) }
    },
    onSnapshot: (next, error) => onSnapshot(
      collection(store!, path),
      (snap) => next({ docs: snap.docs.map((d) => ({ id: d.id, data: () => d.data() })) }),
      (e) => error?.({ code: e.code === 'permission-denied' ? 'permission-denied' : e.code, message: explain(e.code) }),
    ),
  }),
}

/** Présence : chacun signale toutes les 45 s qu'il a le CRM ouvert. */
function presence(uid: string): RoomApi {
  return {
    presence: async () => {
      const beat = () => setDoc(doc(store!, 'presence', uid), { uid, at: Date.now() }).catch(() => {})
      void beat()
      const timer = setInterval(beat, 45_000)
      window.addEventListener('beforeunload', () => { clearInterval(timer); void deleteDoc(doc(store!, 'presence', uid)) })
    },
    onPeers: (handler) => onSnapshot(collection(store!, 'presence'), (snap) => {
      const recent = snap.docs.map((d) => d.data()).filter((p) => Date.now() - Number(p.at ?? 0) < 120_000)
      handler({ peers: recent.map((p): RoomPeer => ({ by: String(p.uid), presence: p })) })
    }, () => {}),
  }
}

/** Contexte « données réelles » pour le magasin du CRM, à partir de l'utilisateur Google connecté. */
export function cloudContext(user: User, person: Person): LiveContext {
  const id = person.id
  const userApi: UserApi = { id: async () => id, profiles: async () => ({}), can: async () => true }
  return { db, user: userApi, room: presence(id), me: { name: person.name, email: user.email ?? '' }, keepNames: true }
}

/** Chacun est reconnu par son compte Google ; sur le compte partagé de l'agence, il indique qui il est, une fois par appareil. */
export interface Person { id: string; name: string; email: string }
export const PEOPLE: Person[] = [
  { id: 'sacha', name: 'Sacha', email: 'sachamuller79@gmail.com' },
  { id: 'loic', name: 'Loïc', email: 'loic.bistch8@gmail.com' },
]
const KEY = 'crm-associe'
export function savedPerson(): Person | null {
  try { return PEOPLE.find((p) => p.id === localStorage.getItem(KEY)) ?? null } catch { return null }
}
export function personFor(user: User | null | undefined): Person | null {
  return PEOPLE.find((p) => p.email === user?.email?.toLowerCase()) ?? savedPerson()
}
export function savePerson(p: Person | null) {
  try { if (p) localStorage.setItem(KEY, p.id); else localStorage.removeItem(KEY) } catch { /* navigateur privé */ }
}
