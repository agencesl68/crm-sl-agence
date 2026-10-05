import { ARTIFACT, CLOUD } from './env'
import { idToken } from './firebase'
import { use, type McpApi, type McpError } from './runtime'

/**
 * Scénarios Make « à la demande » appelés par le CRM (dossier « CRM SL Agence » dans Make).
 * Le nom d'outil est celui que le connecteur Make expose : s<identifiant>_<nom du scénario>.
 */
export const MAKE_TOOLS = {
  meteo: 's7743450_crm_meteo',
  qonto: 's7743454_crm_qonto_comptes_et_factures',
  email: 's7743455_crm_envoyer_un_email',
  demandes: 's7743456_crm_demandes_du_site',
  // Uniquement via la passerelle (version GitHub) : HTML d'une page web, appel à l'API Claude (Anthropic)
  page: 'passerelle_page',
  claude: 'passerelle_claude',
} as const
export type MakeTool = keyof typeof MAKE_TOOLS

/** Message clair selon la cause, pour que l'utilisateur sache quoi faire. */
function explain(e: McpError): string {
  switch (e.code) {
    case 'server_not_connected': return 'Ajoutez le connecteur Make dans claude.ai (Réglages → Connecteurs), puis rechargez la page.'
    case 'needs_reauth': return 'La connexion Make a expiré : reconnectez-la dans claude.ai (Réglages → Connecteurs).'
    case 'not_in_manifest': return 'Make n’est pas autorisé pour cette page : autorisez-le dans le menu Autorisations de la page.'
    case 'selection_required': return 'Plusieurs connecteurs Make existent : choisissez celui de SL Agence quand claude.ai le propose.'
    case 'blocked_by_policy': case 'approval_required': return 'Votre organisation bloque cet appel à Make.'
    case 'server_unavailable': return 'Make ne répond pas pour le moment, réessayez dans un instant.'
    case 'tool_error': return `Le scénario Make a échoué : ${e.message}`
    default: return `Appel à Make impossible (${e.message || e.code}).`
  }
}

/** Les sorties du scénario : texte JSON décodé quand c'en est. */
function outputs(payload: unknown): Record<string, unknown> {
  let p = payload
  if (typeof p === 'string') { try { p = JSON.parse(p) } catch { return { texte: p } } }
  if (!p || typeof p !== 'object') return {}
  const obj = p as Record<string, unknown>
  const inner = (obj.outputs ?? obj.output ?? obj.result ?? obj.data ?? obj) as Record<string, unknown>
  return Object.fromEntries(Object.entries(inner).map(([k, v]) => {
    if (typeof v === 'string' && /^\s*[[{]/.test(v)) { try { return [k, JSON.parse(v)] } catch { /* texte brut */ } }
    return [k, v]
  }))
}

// ───────────── Version GitHub : passerelle Make (webhook « CRM - Passerelle du site ») ─────────────

/** Adresse du webhook ; Make vérifie le jeton Google de l'associé avant d'appeler Qonto, Gmail ou Google Sheets. */
const GATEWAY = import.meta.env.VITE_MAKE_GATEWAY as string | undefined
/** Qonto, Gmail et les demandes du site sont branchés dans cette version du CRM. */
export const MAKE_READY = ARTIFACT || (CLOUD && !!GATEWAY)
/** Version GitHub : la passerelle sait aussi lire les pages d'un site et appeler Claude (recherche automatique de prospects). */
export const GATEWAY_READY = !ARTIFACT && CLOUD && !!GATEWAY

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? v as Obj : {})

/** La passerelle renvoie les réponses brutes de Qonto et Google : on les met au format des scénarios à la demande. */
const GATEWAY_OUTPUT: Partial<Record<MakeTool, (out: Obj) => Obj>> = {
  qonto: (out) => ({
    comptes: obj(out.organisation).bank_accounts ?? [],
    factures: (Array.isArray(obj(out.factures).client_invoices) ? obj(out.factures).client_invoices as Obj[] : []).map((f) => {
      const client = obj(f.client)
      return {
        id: f.id, number: f.number, status: f.status, issue_date: f.issue_date, due_date: f.due_date, paid_at: f.paid_at,
        total: obj(f.total_amount).value, vat: obj(f.vat_amount).value, invoice_url: f.invoice_url,
        client_id: client.id ?? null, client_email: client.email ?? f.contact_email ?? null,
        client_name: client.name || [client.first_name, client.last_name].filter(Boolean).join(' ') || null,
      }
    }),
  }),
  demandes: (out) => ({ lignes: Array.isArray(out.values) ? out.values : [] }),
  email: (out) => out,
  page: (out) => ({ html: typeof out.html === 'string' ? out.html : '' }),
  // Réponse brute de l'API Messages (ou son erreur, { type: 'error', error: { message } })
  claude: (out) => out,
}

async function viaGateway(tool: MakeTool, input: Obj): Promise<Obj> {
  const shape = GATEWAY_OUTPUT[tool]
  if (!shape) throw new Error('Ce branchement n’existe pas encore dans la version en ligne du CRM.')
  const body = new URLSearchParams({ action: tool, token: await idToken() })
  for (const [k, v] of Object.entries(input)) body.set(k, typeof v === 'string' ? v : JSON.stringify(v))
  let res: Response
  try {
    // Corps « formulaire » : pas de requête préalable CORS, Make lit directement les champs
    res = await fetch(GATEWAY!, { method: 'POST', body })
  } catch {
    throw new Error('Make ne répond pas pour le moment, réessayez dans un instant.')
  }
  let out: Obj | null = null
  try { out = obj(JSON.parse(await res.text())) } catch { /* réponse non JSON */ }
  if (res.status === 403) throw new Error('Make a refusé l’accès : reconnectez-vous avec le compte Google d’un associé.')
  if (!res.ok || !out) throw new Error(typeof out?.erreur === 'string' ? out.erreur : `Make n’a pas pu traiter la demande (${res.status}).`)
  return shape(out)
}

let mcpPromise: Promise<McpApi | null> | null = null
export const makeAvailable = () => (mcpPromise ??= use<McpApi>('mcp')).then((m) => !!m)

/** Lance un scénario Make et renvoie ses sorties. */
export async function callMake(tool: MakeTool, input: Record<string, unknown> = {}, cacheMinutes = 0): Promise<Record<string, unknown>> {
  if (!ARTIFACT && CLOUD && GATEWAY) return viaGateway(tool, input)
  const mcp = await (mcpPromise ??= use<McpApi>('mcp'))
  if (!mcp) throw new Error('Les branchements Make (Qonto, e-mails, demandes du site, météo) ne sont pas encore activés dans cette version du CRM.')
  try {
    const r = await mcp.callTool('Make', MAKE_TOOLS[tool], input, cacheMinutes ? { cache: { staleTime: Math.min(cacheMinutes * 60_000, 300_000), gcTime: cacheMinutes * 60_000 } } : { cache: false })
    return outputs(r.payload ?? r.content.find((c) => c.type === 'text')?.text)
  } catch (e) {
    throw new Error(explain(e as McpError))
  }
}
