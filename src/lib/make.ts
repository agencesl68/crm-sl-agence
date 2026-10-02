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

let mcpPromise: Promise<McpApi | null> | null = null
export const makeAvailable = () => (mcpPromise ??= use<McpApi>('mcp')).then((m) => !!m)

/** Lance un scénario Make et renvoie ses sorties. */
export async function callMake(tool: MakeTool, input: Record<string, unknown> = {}, cacheMinutes = 0): Promise<Record<string, unknown>> {
  const mcp = await (mcpPromise ??= use<McpApi>('mcp'))
  if (!mcp) throw new Error('Les branchements Make (Qonto, e-mails, demandes du site, météo) ne sont pas encore activés dans cette version du CRM.')
  try {
    const r = await mcp.callTool('Make', MAKE_TOOLS[tool], input, cacheMinutes ? { cache: { staleTime: Math.min(cacheMinutes * 60_000, 300_000), gcTime: cacheMinutes * 60_000 } } : { cache: false })
    return outputs(r.payload ?? r.content.find((c) => c.type === 'text')?.text)
  } catch (e) {
    throw new Error(explain(e as McpError))
  }
}
