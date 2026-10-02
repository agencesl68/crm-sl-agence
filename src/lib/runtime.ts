/**
 * Accès aux capacités de la page publiée sur claude.ai (base partagée, identité, présence,
 * connecteurs, Claude). Types réduits aux appels réellement utilisés par le CRM.
 */

export interface DbSnapshot { docs: { id: string; data(): Record<string, unknown> | undefined }[] }
export interface DbError { code: string; message: string }
export interface DbDoc {
  set(data: Record<string, unknown>): Promise<void>
  delete(): Promise<void>
}
export interface DbCollection {
  doc(id: string): DbDoc
  onSnapshot(next: (snap: DbSnapshot) => void, error?: (e: DbError) => void): () => void
}
export interface Db { collection(path: string): DbCollection }

export interface UserApi {
  id(): Promise<string | null>
  profiles(ids: readonly string[]): Promise<Record<string, { id: string; name: string }>>
  can(name: string): Promise<boolean | null>
}

export interface RoomPeer { by: string | null; presence: Record<string, unknown> }
export interface RoomApi {
  presence(patch: Record<string, unknown>): Promise<void>
  onPeers(handler: (change: { peers: readonly RoomPeer[] }) => void, onError?: (e: DbError) => void): () => void
}

export interface McpError { code: string; message: string; retryable?: boolean }
export interface McpApi {
  callTool(server: string, tool: string, input?: unknown, options?: { cache?: false | { staleTime?: number; gcTime?: number; refresh?: boolean } }): Promise<{ payload?: unknown; content: { type: string; text?: string }[] }>
}

export interface SampleApi {
  (input: string, opts?: { modelTier?: 'quick' | 'default' | 'complex'; cache?: boolean }): Promise<{ text: string; truncated: boolean }>
}

export interface AssetsApi { upload(blob: Blob): Promise<{ id: string; url: string }> }

declare global {
  interface Window { claude?: { use(name: string): Promise<unknown> } }
}

/** `null` quand la page ne tourne pas dans la visionneuse claude.ai, ou que la capacité n'est pas accordée. */
export function use<T>(name: string): Promise<T | null> {
  const claude = window.claude
  if (!claude?.use) return Promise.resolve(null)
  return claude.use(name).then((x) => (x as T) ?? null, () => null)
}

/** Ce dont le CRM a besoin pour tourner avec les vraies données. */
export interface LiveContext {
  db: Db; user: UserApi; room: RoomApi | null
  /** Version GitHub (Firebase) : nom et e-mail du compte Google, gardés dans la fiche de l'associé. */
  me?: { name: string; email: string }
  keepNames?: boolean
}
