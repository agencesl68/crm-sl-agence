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
export function cloudContext(user: User): LiveContext {
  const userApi: UserApi = { id: async () => user.uid, profiles: async () => ({}), can: async () => true }
  return { db, user: userApi, room: presence(user.uid), me: { name: user.displayName ?? user.email ?? '', email: user.email ?? '' }, keepNames: true }
}
