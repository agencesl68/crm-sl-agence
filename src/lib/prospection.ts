import { useCallback, useRef, useState } from 'react'
import { useAction } from '../components/ui'
import { DEMO } from './env'
import { addDays, isoDay } from './format'
import { callMake, GATEWAY_READY, MAKE_READY } from './make'
import {
  analysisPrompt, analysisRequest, API_ENTREPRISES, claudeText, cleanDashes, DEPARTEMENTS, describeEntreprise, dirigeantOf,
  EMAIL_RE, extractEmails, htmlToText, parseAnalyse, parseEntreprise, parseSiteAnswer, pickInternalPages, searchParams,
  siteDomain, siteRequest, siteText, type Analyse, type ClaudeResponse, type Entreprise, type Recherche,
} from './recherche'
import { use, type SampleApi } from './runtime'
import { useStore } from './store'
import type { Cible, Profile, Prospect, ProspectReject } from './types'

export { EMAIL_RE }

/**
 * Prospection par e-mail à froid.
 *
 * La séquence est fixe : un premier message personnalisé (J0), une relance avec un exemple concret (J+4),
 * un dernier message court (J+9). Seul le premier message passe par Claude : l'accroche et l'objet pour un
 * prospect importé, tout le corps pour un prospect trouvé par la recherche automatique (voir plus bas).
 * Les relances viennent des modèles ci-dessous, testés une fois pour toutes.
 */

// ───────────────────────────── Réglages ─────────────────────────────

/** Plafond d'envois par jour, tous associés confondus : protège la réputation de la boîte d'envoi. */
export const DAILY_LIMIT = 20
/** Jours après l'envoi précédent avant chaque relance (relance 1 à J+4, relance 2 à J+9). */
export const FOLLOWUP_GAPS = [4, 5]
/** Nombre de messages dans la séquence. */
export const SEQUENCE_LENGTH = 3

const PHONES: Record<string, string> = { loic: '06 01 16 07 62', sacha: '07 67 08 19 43' }

const STOP_LINE = 'Si vous ne souhaitez plus recevoir de message de notre part, répondez simplement « stop ».'

// ───────────────────────────── Cibles ─────────────────────────────

interface CibleDef {
  label: string
  /** Comment désigner le métier dans le texte. */
  metier: string
  /** Le constat du premier message : une phrase complète, au présent. */
  constat: string
  /** L'exemple concret de la relance. Aucun nom de client, uniquement des faits réels. */
  exemple: string
  /** Filtres de la recherche automatique dans la base officielle ; absent : cible non proposée. */
  recherche?: Recherche
}

const EXEMPLE_TERRAIN =
  'Chez une entreprise que nous accompagnons, un document rempli à la main puis ressaisi dans Excel par la secrétaire est maintenant rempli et signé une seule fois sur téléphone, puis envoyé directement. Plus de double saisie.'

export const CIBLES: Record<Cible, CibleDef> = {
  cgp: {
    label: 'Gestion de patrimoine',
    metier: 'cabinet de gestion de patrimoine',
    constat: 'Dans beaucoup de cabinets de gestion de patrimoine, le suivi des dossiers clients, la collecte des pièces et la conformité prennent encore des heures chaque semaine.',
    exemple: 'Pour un cabinet de gestion de patrimoine, nous avons remplacé un fichier Excel par client, qu’il fallait ouvrir et chercher dans les dossiers, par une seule application qui centralise tous les clients.',
    recherche: { naf: ['66.19B', '70.22Z'], q: 'patrimoine', independants: true },
  },
  formation: {
    label: 'Organisme de formation',
    metier: 'organisme de formation',
    constat: 'Dans beaucoup d’organismes de formation, les conventions, les feuilles d’émargement, les évaluations et le suivi qualité prennent encore des heures chaque semaine.',
    exemple: EXEMPLE_TERRAIN,
    recherche: { naf: ['85.59A'], qualiopi: true },
  },
  courtier: {
    label: 'Courtage en assurance',
    metier: 'cabinet de courtage',
    constat: 'Chez beaucoup de courtiers, la collecte des pièces, les relances clients et la saisie des dossiers prennent encore des heures chaque semaine.',
    exemple: EXEMPLE_TERRAIN,
    recherche: { naf: ['66.22Z'], independants: true },
  },
  immobilier: {
    label: 'Agence immobilière',
    metier: 'agence immobilière',
    constat: 'Dans beaucoup d’agences immobilières, la gestion des documents, les relances et la saisie des dossiers locataires prennent encore des heures chaque semaine.',
    exemple: EXEMPLE_TERRAIN,
    recherche: { naf: ['68.31Z'] },
  },
  comptable: {
    label: 'Cabinet comptable',
    metier: 'cabinet comptable',
    constat: 'Dans beaucoup de cabinets comptables, la collecte des pièces auprès des clients et les relances prennent encore des heures chaque semaine.',
    exemple: EXEMPLE_TERRAIN,
    recherche: { naf: ['69.20Z'] },
  },
  autre: {
    label: 'Autre activité',
    metier: 'entreprise',
    constat: 'Dans beaucoup d’entreprises, la saisie, les relances et les documents à remplir prennent encore des heures chaque semaine.',
    exemple: EXEMPLE_TERRAIN,
  },
}
export const CIBLE_IDS = Object.keys(CIBLES) as Cible[]
/** Cibles proposées dans la recherche automatique (« autre » n'a pas de code d'activité). */
export const AUTO_CIBLES = CIBLE_IDS.filter((c) => CIBLES[c].recherche)

// ───────────────────────────── État d'un prospect ─────────────────────────────

/** Date (AAAA-MM-JJ) à laquelle le prochain message est dû, ou null si la séquence est finie. */
export function nextDue(p: Prospect): string | null {
  if (p.status !== 'actif' || p.step >= SEQUENCE_LENGTH) return null
  const last = p.history.at(-1)
  const due = p.step === 0 || !last ? isoDay(new Date(p.created_at)) : addDays(isoDay(new Date(last.sent_at)), FOLLOWUP_GAPS[p.step - 1] ?? 5)
  return p.snooze_until && p.snooze_until > due ? p.snooze_until : due
}

export function isDue(p: Prospect, today = isoDay()): boolean {
  const d = nextDue(p)
  return !!d && d <= today
}

export function stepLabel(p: Prospect): string {
  if (p.status === 'repondu') return 'A répondu'
  if (p.status === 'pas_interesse') return 'Pas intéressé'
  if (p.status === 'stop') return 'Ne plus contacter'
  return ['À contacter', 'Premier mail envoyé', 'Relance envoyée', 'Terminé sans réponse'][p.step] ?? 'Terminé sans réponse'
}

/** Messages envoyés aujourd'hui, tous prospects et associés confondus. */
export function sentToday(prospects: Prospect[], today = isoDay()): number {
  return prospects.reduce((n, p) => n + p.history.filter((h) => isoDay(new Date(h.sent_at)) === today).length, 0)
}

// ───────────────────────────── Rédaction ─────────────────────────────

const firstName = (name: string | undefined) => (name ?? '').trim().split(/\s+/)[0] ?? ''

export function signature(me: Profile | null): string {
  const name = firstName(me?.full_name) || 'L’équipe'
  const phone = PHONES[name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')]
  return [name, 'SL Agence, automatisation des tâches administratives', [phone, 'slagence.fr'].filter(Boolean).join(' · ')].join('\n')
}

const hello = (p: Prospect) => (p.first_name.trim() ? `Bonjour ${p.first_name.trim()},` : 'Bonjour,')

/** Accroche de secours quand on ne sait rien de précis sur l'entreprise. */
const fallbackHook = (p: Prospect) =>
  `Je contacte quelques ${CIBLES[p.cible].metier === 'entreprise' ? 'dirigeants' : `dirigeants de ${CIBLES[p.cible].metier}`}${p.city ? ` autour de ${p.city}` : ''} au sujet d’une question précise : le temps perdu sur les tâches administratives.`

/** Ce que Claude rédige pour le premier message : accroche (prospect importé) ou corps entier (recherche automatique). */
export interface FirstMail { subject?: string; hook?: string; body?: string }

/** Les trois messages de la séquence. `ai` ne sert qu'au premier. */
export function compose(p: Prospect, step: number, me: Profile | null, ai?: FirstMail): { subject: string; body: string } {
  const def = CIBLES[p.cible]
  const sign = signature(me)
  const first = p.history.find((h) => h.step === 1)?.subject
  if (step === 0 && ai?.body?.trim()) {
    // Corps écrit par Claude : formule d'appel, signature et ligne « stop » ajoutées ici
    return { subject: ai.subject?.trim() || `Une question pour ${p.company}`, body: [hello(p), cleanDashes(ai.body), sign, STOP_LINE].join('\n\n') }
  }
  if (step === 0) {
    const body = [
      hello(p),
      ai?.hook?.trim() || fallbackHook(p),
      `${def.constat} Chez SL Agence, nous supprimons ces tâches : le premier outil est en place en 7 jours, et l’un de nos clients récupère jusqu’à 20 heures par semaine.`,
      'Est-ce un sujet chez vous en ce moment ?',
      sign,
      STOP_LINE,
    ].join('\n\n')
    return { subject: ai?.subject?.trim() || `Une question pour ${p.company}`, body }
  }
  if (step === 1) {
    const body = [
      hello(p),
      `Je reviens vers vous avec un exemple concret. ${def.exemple}`,
      `Si vous le souhaitez, je vous montre en 15 minutes ce que cela donnerait chez ${p.company}. Un créneau cette semaine vous conviendrait ?`,
      sign,
      STOP_LINE,
    ].join('\n\n')
    return { subject: first ? `Re: ${first}` : `Un exemple pour ${p.company}`, body }
  }
  const body = [
    hello(p),
    'Je ne veux pas encombrer votre boîte, c’est donc mon dernier message.',
    'Si un jour une tâche vous fait perdre plus de temps qu’elle ne devrait, répondez simplement à ce mail : nous vous envoyons un devis sous 24 h.',
    `Belle journée,\n\n${sign}`,
  ].join('\n\n')
  return { subject: first ? `Re: ${first}` : `Dernier message pour ${p.company}`, body }
}

function prompt(p: Prospect, site: string): string {
  const def = CIBLES[p.cible]
  const facts = {
    entreprise: p.company, ville: p.city, metier: def.metier, poste_du_dirigeant: p.job_title,
    ce_que_l_on_sait: p.info, site: p.website,
  }
  return [
    'Tu prépares le premier e-mail de prospection de SL Agence, une agence qui automatise les tâches administratives des petites entreprises.',
    'Écris deux éléments, en français, en vouvoyant le destinataire :',
    '1. "objet" : objet de l’e-mail, 3 à 6 mots, sans majuscules inutiles, sans point d’exclamation, sans emoji, qui donne envie d’ouvrir sans faire publicitaire. Il peut citer le nom de l’entreprise.',
    '2. "accroche" : UNE seule phrase de 25 mots maximum qui montre que l’on s’est intéressé à cette entreprise en particulier (son activité, sa spécialité, sa clientèle, sa ville). Elle sera suivie d’un paragraphe sur le temps perdu en tâches administratives : elle ne doit donc pas parler d’automatisation ni de l’agence.',
    'Règles strictes : n’utilise que les informations fournies ci-dessous, n’invente aucun fait, chiffre, nom ou actualité. Pas de compliment exagéré, pas de tiret long, pas d’emoji, pas de jargon. Si les informations sont trop pauvres pour une accroche sincère, renvoie une accroche vide.',
    'Réponds uniquement avec un objet JSON, sans texte autour : {"objet": "...", "accroche": "..."}',
    '',
    `Informations : ${JSON.stringify(facts)}`,
    site ? `\nTexte de la page d’accueil du site (extrait) :\n${site.replace(/\s+/g, ' ').slice(0, 3500)}` : '',
  ].join('\n')
}

function parseAi(text: string): { subject?: string; hook?: string } {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return {}
  try {
    const o = JSON.parse(m[0]) as { objet?: unknown; accroche?: unknown }
    const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s*[—–]\s*/g, ', ').trim() : '')
    return { subject: clean(o.objet).slice(0, 80), hook: clean(o.accroche) }
  } catch { return {} }
}

// ───────────────────────────── Passerelle : pages web et Claude ─────────────────────────────

const withScheme = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`)

/** Appel à l'API Messages d'Anthropic par la passerelle Make (la clé API reste dans Make). */
async function askClaude(requete: Record<string, unknown>): Promise<ClaudeResponse> {
  const out = await callMake('claude', { requete }) as ClaudeResponse
  if (out.type === 'error') throw new Error(`Claude a refusé la demande : ${out.error?.message ?? 'erreur inconnue'}`)
  if (!Array.isArray(out.content)) throw new Error('Réponse de Claude illisible.')
  return out
}

/** HTML d'une page ; vide si le site ne répond pas. Une panne de la passerelle, elle, remonte en erreur. */
async function readPage(url: string): Promise<string> {
  return String((await callMake('page', { url })).html ?? '')
}

/** Page d'accueil puis jusqu'à 3 pages internes (contact, mentions légales, à propos, services, recrutement). */
async function readSite(site: string): Promise<{ url: string; html: string }[]> {
  const home = await readPage(site)
  const pages = [{ url: site, html: home }]
  for (const url of pickInternalPages(home, site)) pages.push({ url, html: await readPage(url).catch(() => '') })
  return pages.filter((p) => p.html)
}

/** Texte renvoyé par Claude : passerelle Make (version GitHub) ou Claude de la visionneuse (claude.ai). */
async function sampleText(text: string): Promise<string> {
  const sample = await use<SampleApi>('sample')
  if (!sample) return ''
  return (await sample(text, { modelTier: 'quick', cache: false })).text
}

/** Objet et accroche personnalisés d'un prospect importé. */
async function personalize(p: Prospect): Promise<FirstMail> {
  if (GATEWAY_READY) {
    const site = p.website ? htmlToText(await readPage(withScheme(p.website)).catch(() => '')) : ''
    const r = await askClaude({ model: 'claude-haiku-4-5', max_tokens: 400, messages: [{ role: 'user', content: prompt(p, site) }] })
    return parseAi(claudeText(r))
  }
  return parseAi(await sampleText(prompt(p, '')))
}

/** Faits transmis à Claude pour un prospect déjà enregistré (les faits officiels sont gardés dans `info`). */
const factsOf = (p: Pick<Prospect, 'company' | 'city' | 'cible' | 'info' | 'website'>) =>
  ({ entreprise: p.company, ville: p.city, metier: CIBLES[p.cible].metier, informations: p.info, site: p.website })

/** Analyse et rédaction complètes (prospect de la recherche automatique) : relit le site, puis Claude. */
async function analyse(facts: Record<string, unknown>, email: string, text: string): Promise<Analyse> {
  const ask = analysisPrompt({ faits: facts, email, site: text })
  const reply = GATEWAY_READY ? claudeText(await askClaude(analysisRequest(ask))) : await sampleText(ask)
  const a = parseAnalyse(reply)
  if (!a) throw new Error('Claude n’a pas renvoyé une analyse lisible.')
  return a
}

/** Premier message : analyse complète pour un prospect trouvé automatiquement, accroche pour un prospect importé. */
async function writeFirst(p: Prospect): Promise<{ ai: FirstMail; analysis?: Analyse }> {
  if (p.source !== 'auto') return { ai: await personalize(p) }
  const pages = GATEWAY_READY && p.website ? await readSite(withScheme(p.website)) : []
  const a = await analyse(factsOf(p), p.email, siteText(pages))
  return { ai: { subject: a.objet, body: a.corps }, analysis: a }
}

const analysisPatch = (a?: Analyse) => (a ? { score: a.pertinence, reason: a.raison, signals: a.signaux } : {})

// ───────────────────────────── Actions ─────────────────────────────

/** File du jour : relances d'abord (le timing compte), puis les nouveaux contacts, les plus anciens en premier. */
export function queue(prospects: Prospect[], today = isoDay()): Prospect[] {
  return prospects
    .filter((p) => isDue(p, today))
    .sort((a, b) => b.step - a.step || a.created_at.localeCompare(b.created_at))
}

/** Prépare les brouillons du jour, dans la limite du plafond quotidien. */
export function usePrepareDrafts() {
  const { data, update, me } = useStore()
  const run = useAction()
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const prepare = useCallback(() => run(async () => {
    const today = isoDay()
    const waiting = data.prospects.filter((p) => p.draft_body && p.status === 'actif').length
    const room = DAILY_LIMIT - sentToday(data.prospects, today) - waiting
    if (room <= 0) throw new Error(waiting ? 'Les brouillons du jour sont prêts : relisez-les et envoyez-les.' : `Plafond de ${DAILY_LIMIT} e-mails atteint aujourd’hui. Reprise demain.`)
    const todo = queue(data.prospects, today).filter((p) => !p.draft_body).slice(0, room)
    if (todo.length === 0) throw new Error('Personne à contacter aujourd’hui : importez de nouveaux prospects.')
    setProgress({ done: 0, total: todo.length })
    let failed = 0
    for (const [i, p] of todo.entries()) {
      try {
        const first = p.step === 0 ? await writeFirst(p) : undefined
        const mail = compose(p, p.step, me, first?.ai)
        await update('prospects', p.id, { draft_subject: mail.subject, draft_body: mail.body, draft_step: p.step, error: null, ...analysisPatch(first?.analysis) })
      } catch (e) {
        failed += 1
        // Claude indisponible : on garde un brouillon sans personnalisation plutôt que rien
        const mail = compose(p, p.step, me)
        await update('prospects', p.id, { draft_subject: mail.subject, draft_body: mail.body, draft_step: p.step, error: e instanceof Error ? e.message : 'Personnalisation impossible' })
      }
      setProgress({ done: i + 1, total: todo.length })
    }
    setProgress(null)
    return { count: todo.length, failed }
  }).finally(() => setProgress(null)), [data.prospects, me, run, update])
  return { prepare, progress }
}

/** Régénère le brouillon d'un seul prospect : nouvelle accroche, ou nouvelle analyse du site pour un prospect automatique. */
export function useRedraft() {
  const { update, me } = useStore()
  const run = useAction()
  return useCallback((p: Prospect) => run(async () => {
    const first = p.step === 0 ? await writeFirst(p) : undefined
    const mail = compose(p, p.step, me, first?.ai)
    await update('prospects', p.id, { draft_subject: mail.subject, draft_body: mail.body, draft_step: p.step, error: null, ...analysisPatch(first?.analysis) })
  }, 'Nouveau brouillon prêt'), [me, run, update])
}

/** Envoie le brouillon depuis la boîte de l'agence et fait avancer le prospect dans la séquence. */
export function useSendDraft() {
  const { data, update, me } = useStore()
  const run = useAction()
  return useCallback((p: Prospect, edited: { subject: string; body: string }, silent = false) => run(async () => {
    if (sentToday(data.prospects) >= DAILY_LIMIT) throw new Error(`Plafond de ${DAILY_LIMIT} e-mails atteint aujourd’hui.`)
    const fresh = data.prospects.find((x) => x.id === p.id)
    if (!fresh || fresh.status !== 'actif' || fresh.draft_step !== fresh.step) throw new Error(`${p.company} a déjà été traité par votre associé.`)
    if (MAKE_READY) await callMake('email', { to: p.email.trim(), subject: edited.subject.trim(), body: edited.body })
    const step = fresh.step + 1
    await update('prospects', p.id, {
      step, history: [...fresh.history, { step, subject: edited.subject.trim(), sent_at: new Date().toISOString(), by: me?.id ?? null }],
      draft_subject: null, draft_body: null, draft_step: null, snooze_until: null, error: null,
    })
    return true
  }, silent ? undefined : `E-mail envoyé à ${p.company}`), [data.prospects, me, run, update])
}

/** Le prospect a répondu : il entre dans le pipeline comme lead « Contacté ». */
export function useConvert() {
  const { data, insert, update, me } = useStore()
  const run = useAction()
  return useCallback((p: Prospect) => run(async () => {
    const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()
    const company = data.companies.find((c) => norm(c.name) === norm(p.company))
      ?? await insert('companies', { name: p.company, city: p.city, website: p.website, sector: CIBLES[p.cible].label })
    const contact = data.contacts.find((c) => norm(c.email) === norm(p.email))
      ?? await insert('contacts', { company_id: company.id, first_name: p.first_name, last_name: p.last_name, email: p.email, job_title: p.job_title })
    const deal = await insert('deals', {
      title: `${p.company} : réponse à la prospection`, company_id: company.id, contact_id: contact.id,
      source: 'prospection', stage: 'contacte', owner_id: me?.id ?? null, need: CIBLES[p.cible].label,
    })
    await insert('activities', {
      type: 'email_recu', subject: 'Réponse à la prospection par e-mail',
      body: p.history.map((h) => `${h.sent_at.slice(0, 10)} : ${h.subject}`).join('\n') || null,
      deal_id: deal.id, company_id: company.id, contact_id: contact.id, author_id: me?.id ?? null,
    })
    await update('prospects', p.id, { status: 'repondu', deal_id: deal.id, draft_subject: null, draft_body: null, draft_step: null })
    return deal
  }, `${p.company} ajouté au pipeline`), [data.companies, data.contacts, insert, me, run, update])
}

// ───────────────────────────── Import ─────────────────────────────

/** Lit un CSV (séparateur virgule, point-virgule ou tabulation, guillemets gérés). */
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const sep = [';', '\t', ','].map((s) => [s, firstLine.split(s).length] as const).sort((a, b) => b[1] - a[1])[0]![0]
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === sep) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some((x) => x.trim())) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some((x) => x.trim())) rows.push(row)
  return rows
}

type Column = 'first_name' | 'last_name' | 'full_name' | 'email' | 'company' | 'website' | 'city' | 'job_title' | 'info'
const HEADERS: [Column, RegExp][] = [
  ['email', /e-?mail|courriel/],
  ['first_name', /pr[eé]nom|first.?name/],
  ['last_name', /^nom$|^nom de famille|last.?name|surname/],
  ['full_name', /^(nom complet|full.?name|name|contact|dirigeant)$/],
  ['company', /entreprise|soci[eé]t[eé]|company|business|raison sociale|organisation|cabinet/],
  ['website', /site|website|domain|url/],
  ['city', /ville|city|commune|localit/],
  ['job_title', /poste|fonction|titre|job|title|role/],
  ['info', /description|activit|industr|secteur|sp[eé]cialit|naf|info/],
]

/** Associe chaque colonne du fichier à un champ du prospect, d'après l'intitulé. */
export function mapColumns(header: string[]): Partial<Record<Column, number>> {
  const map: Partial<Record<Column, number>> = {}
  header.forEach((h, i) => {
    const k = h.trim().toLowerCase()
    const hit = HEADERS.find(([col, re]) => map[col] === undefined && re.test(k))
    if (hit) map[hit[0]] = i
  })
  return map
}

export function useImportProspects() {
  const { data, insert } = useStore()
  const run = useAction()
  return useCallback((text: string, cible: Cible) => run(async () => {
    const rows = parseCsv(text.trim())
    if (rows.length < 2) throw new Error('Le fichier doit contenir une ligne d’en-tête et au moins un prospect.')
    const cols = mapColumns(rows[0]!)
    if (cols.email === undefined) throw new Error('Aucune colonne « email » trouvée dans l’en-tête.')
    const get = (r: string[], c: Column) => (cols[c] === undefined ? '' : (r[cols[c]!] ?? '').trim())
    // Jamais deux fois la même adresse, et jamais un client ou un contact déjà connu
    const known = new Set([...data.prospects.map((p) => p.email), ...data.contacts.map((c) => c.email ?? '')].map((e) => e.trim().toLowerCase()).filter(Boolean))
    const batch = isoDay()
    let added = 0, skipped = 0
    for (const r of rows.slice(1)) {
      const email = get(r, 'email').toLowerCase()
      if (!EMAIL_RE.test(email) || known.has(email)) { skipped += 1; continue }
      known.add(email)
      let first = get(r, 'first_name'), last = get(r, 'last_name')
      if (!first && !last && get(r, 'full_name')) {
        const [f = '', ...rest] = get(r, 'full_name').split(/\s+/)
        first = f; last = rest.join(' ')
      }
      const company = get(r, 'company') || email.split('@')[1]!.split('.')[0]!
      await insert('prospects', {
        first_name: first, last_name: last, email, company, cible, batch,
        website: get(r, 'website') || null, city: get(r, 'city') || null, job_title: get(r, 'job_title') || null, info: get(r, 'info') || null,
      })
      added += 1
    }
    return { added, skipped }
  }), [data.contacts, data.prospects, insert, run])
}

// ───────────────────────────── Recherche automatique ─────────────────────────────
//
// Chaque matin : base officielle des entreprises (gratuite) → site officiel (Claude et la recherche web,
// environ 1 centime) → 4 pages du site (passerelle Make) → e-mail trouvé dans le code → analyse et
// rédaction (Claude, environ 1 centime) → prospect ajouté avec son brouillon, ou écarté avec la raison.

/** Au-delà de ce nombre d'erreurs d'affilée (réseau, Make, Claude), la recherche s'arrête. */
const MAX_ERRORS = 5
/** Intervalle minimal entre deux appels à la base officielle (limite de 7 requêtes par seconde). */
const API_GAP_MS = 200
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)]!

export type RejectKind = ProspectReject['kind']
export interface AutoProgress { checked: number; kept: number; target: number; budget: number; step: string }

/** Place du jour pour de nouveaux prospects : plafond d'envois moins les envois, les brouillons et la file (relances d'abord). */
export function roomToday(prospects: Prospect[], today = isoDay()): number {
  const waiting = prospects.filter((p) => p.status === 'actif' && p.draft_body).length
  const due = queue(prospects, today).filter((p) => !p.draft_body).length
  return Math.max(0, DAILY_LIMIT - sentToday(prospects, today) - waiting - due)
}

/** Entreprises vérifiées aujourd'hui (retenues ou écartées) : elles comptent dans le plafond quotidien. */
export function checkedToday(prospects: Prospect[], rejects: ProspectReject[], today = isoDay()): number {
  const day = (iso: string) => isoDay(new Date(iso)) === today
  return prospects.filter((p) => p.source === 'auto' && day(p.created_at)).length + rejects.filter((r) => day(r.created_at)).length
}

/** « 18 prospects prêts, 31 écartés (12 sans site, 11 sans email, 8 peu pertinents) ». */
export function summarize(kept: number, rejected: Record<RejectKind, number>): string {
  const total = Object.values(rejected).reduce((a, b) => a + b, 0)
  const s = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`
  const detail = [
    rejected.site && `${rejected.site} sans site`, rejected.email && `${rejected.email} sans email`,
    rejected.pertinence && `${rejected.pertinence} peu pertinent${rejected.pertinence > 1 ? 's' : ''}`,
    rejected.connu && `${rejected.connu} déjà connu${rejected.connu > 1 ? 's' : ''}`,
  ].filter(Boolean).join(', ')
  return `${s(kept, 'prospect')} prêt${kept > 1 ? 's' : ''}, ${s(total, 'écarté')}${detail ? ` (${detail})` : ''}`
}

/** Appel à la base officielle, en respectant sa limite de débit. */
let lastApiCall = 0
async function apiEntreprises(params: URLSearchParams): Promise<{ results: unknown[]; total_pages: number }> {
  for (let attempt = 0; ; attempt++) {
    const wait = lastApiCall + API_GAP_MS - Date.now()
    if (wait > 0) await pause(wait)
    lastApiCall = Date.now()
    let res: Response
    try { res = await fetch(`${API_ENTREPRISES}?${params}`) } catch { throw new Error('La base officielle des entreprises ne répond pas.') }
    if (res.status === 429 && attempt < 2) { await pause(1500); continue }
    if (!res.ok) throw new Error(`La base officielle des entreprises a répondu ${res.status}.`)
    const body = await res.json() as { results?: unknown[]; total_pages?: number }
    return { results: Array.isArray(body.results) ? body.results : [], total_pages: Number(body.total_pages) || 0 }
  }
}

/**
 * Entreprises de la base officielle, tirées au hasard (cible, département, page) pour ne pas retomber
 * toujours sur les mêmes. Renvoie null quand plus rien de neuf n'arrive.
 */
function companySource(targets: Cible[], departements: string[], skip: Set<string>) {
  const pages = new Map<string, { total: number; seen: Set<number> }>()
  const buffer: { e: Entreprise; cible: Cible }[] = []
  let dry = 0
  return async function next(): Promise<{ e: Entreprise; cible: Cible } | null> {
    while (!buffer.length) {
      if (dry >= 20) return null
      const cible = pick(targets)
      const dep = pick(departements.length ? departements : DEPARTEMENTS)
      const key = `${cible}/${dep}`
      const known = pages.get(key)
      const unseen = known ? Array.from({ length: known.total }, (_, i) => i + 1).filter((n) => !known.seen.has(n)) : [1]
      if (!unseen.length) { dry += 1; continue }
      const page = pick(unseen)
      const { results, total_pages } = await apiEntreprises(searchParams(CIBLES[cible].recherche!, dep, page))
      // L'API plafonne à 10 000 résultats (400 pages de 25)
      pages.set(key, { total: Math.min(total_pages, 400), seen: new Set([...(known?.seen ?? []), page]) })
      const fresh = results.map(parseEntreprise).filter((e): e is Entreprise =>
        !!e && !skip.has(e.siren) && (!departements.length || departements.includes(e.departement)))
      fresh.forEach((e) => skip.add(e.siren))
      fresh.sort(() => Math.random() - 0.5).forEach((e) => buffer.push({ e, cible }))
      dry = fresh.length ? 0 : dry + 1
    }
    return buffer.shift()!
  }
}

/** Fiche officielle d'une entreprise par son SIREN (pour remettre en file une entreprise écartée). */
async function fetchEntreprise(r: ProspectReject): Promise<Entreprise> {
  const params = new URLSearchParams({ q: r.siren, minimal: 'true', include: 'siege,dirigeants', per_page: '1' })
  const found = (await apiEntreprises(params)).results.map(parseEntreprise).find((e) => e?.siren === r.siren)
  return found ?? { siren: r.siren, nom: r.name, ville: r.city ?? '', code_postal: '', departement: '', naf: '', effectif: 'effectif inconnu', creation: null, dirigeants: [] }
}

type Outcome =
  | { kept: true; row: Partial<Prospect> & { email: string } }
  | { kept: false; kind: RejectKind; reason: string; website: string | null }

/** Le circuit complet pour une entreprise. Une panne (réseau, Make, Claude) remonte en erreur, sans écarter l'entreprise. */
async function examine(
  e: Entreprise, cible: Cible,
  ctx: { known: Set<string>; minScore: number; me: Profile | null; step: (s: string) => void; website?: string | null; email?: string },
): Promise<Outcome> {
  const def = CIBLES[cible]
  ctx.step(`${e.nom} : recherche du site`)
  const site = ctx.website ? withScheme(ctx.website) : parseSiteAnswer(await askClaude(siteRequest(e, def.metier)))
  if (!site) return { kept: false, kind: 'site', reason: 'Sans site', website: null }

  ctx.step(`${e.nom} : lecture du site`)
  const pages = await readSite(site)
  if (!pages.length) return { kept: false, kind: 'site', reason: 'Site illisible', website: site }
  const emails = ctx.email ? [ctx.email.trim().toLowerCase()] : extractEmails(pages.map((p) => p.html).join('\n'), siteDomain(site) ?? '', e.dirigeants)
  const email = emails.find((m) => EMAIL_RE.test(m) && !ctx.known.has(m))
  if (!email) {
    return emails.length
      ? { kept: false, kind: 'connu', reason: `Déjà connu (${emails[0]})`, website: site }
      : { kept: false, kind: 'email', reason: 'Sans email', website: site }
  }

  ctx.step(`${e.nom} : analyse et rédaction`)
  const info = describeEntreprise(e, def.metier)
  const a = await analyse(factsOf({ company: e.nom, city: e.ville || null, cible, info, website: site }), email, siteText(pages))
  if (a.pertinence < ctx.minScore) return { kept: false, kind: 'pertinence', reason: `Peu pertinent (${a.pertinence}/10) : ${a.raison}`, website: site }

  // « Bonjour Fanny, » seulement si l'adresse est celle d'un dirigeant (vérifié dans le code, pas confié à Claude)
  const boss = dirigeantOf(email, e.dirigeants)
  const row = {
    first_name: boss?.prenom ?? '', last_name: boss?.nom ?? '', email, company: e.nom, website: site, city: e.ville || null,
    job_title: boss?.qualite || null, info, cible, batch: isoDay(), siren: e.siren, source: 'auto' as const,
    score: a.pertinence, reason: a.raison, signals: a.signaux,
  }
  const mail = compose({ ...row, history: [], step: 0, status: 'actif' } as unknown as Prospect, 0, ctx.me, { subject: a.objet, body: a.corps })
  return { kept: true, row: { ...row, draft_subject: mail.subject, draft_body: mail.body, draft_step: 0 } }
}

/** Mode démo : trois prospects fictifs et deux entreprises écartées, sans aucun appel réseau. */
const DEMO_FINDS: ({ kept: true; row: Partial<Prospect> & { email: string }; body: string; subject: string } | { kept: false; name: string; city: string; cible: Cible; kind: RejectKind; reason: string })[] = [
  { kept: true, subject: 'vos dossiers retraite', body: 'Votre cabinet accompagne les professions libérales de Mulhouse sur la préparation de leur retraite, avec un bilan patrimonial offert au premier rendez-vous. Combien de temps passez-vous à réunir les relevés et justificatifs de chaque client avant ce bilan ? Chez SL Agence, nous construisons des outils simples qui collectent ces pièces à votre place : le premier outil est en place en 7 jours. Auriez-vous 15 minutes la semaine prochaine pour en parler ?', row: { first_name: 'Hélène', last_name: 'Weber', email: 'helene.weber@weber-patrimoine-demo.fr', company: 'Weber Patrimoine', website: 'https://weber-patrimoine-demo.fr/', city: 'Mulhouse', job_title: 'Gérante', info: 'Cabinet de gestion de patrimoine (code NAF 66.19B), 1 ou 2 salariés, créé en 2016, Mulhouse (68100). Dirigeants : Hélène Weber (Gérante).', cible: 'cgp', score: 8, reason: 'Cabinet indépendant de deux personnes, beaucoup de pièces à collecter auprès des clients.', signals: ['Bilan patrimonial sur rendez-vous', 'Prise de rendez-vous uniquement par téléphone'] } },
  { kept: true, subject: 'vos conventions de formation', body: 'Vous proposez des formations au management et à la prévention des risques pour les entreprises alsaciennes, en présentiel à Colmar et à distance. Comment gérez-vous aujourd’hui les conventions, les émargements et les évaluations pour chaque session ? L’un de nos clients récupère jusqu’à 20 heures par semaine depuis que ces documents se remplissent tout seuls. Seriez-vous disponible pour un échange de 15 minutes ?', row: { first_name: '', last_name: '', email: 'contact@cap-formation-demo.fr', company: 'Cap Formation Alsace', website: 'https://cap-formation-demo.fr/', city: 'Colmar', job_title: null, info: 'Organisme de formation (code NAF 85.59A), 3 à 5 salariés, créé en 2019, Colmar (68000). Dirigeants : Marc Haller (Président de SAS).', cible: 'formation', score: 7, reason: 'Organisme certifié Qualiopi avec plusieurs sessions par mois à documenter.', signals: ['Certification Qualiopi', 'Offre d’emploi : assistant(e) administratif(ve)'] } },
  { kept: false, name: 'Exemple Finance Conseil', city: 'Saint-Louis', cible: 'cgp', kind: 'site', reason: 'Sans site' },
  { kept: true, subject: 'la collecte des pièces', body: 'Votre cabinet de courtage accompagne les artisans et commerçants de Strasbourg pour leurs assurances professionnelles, avec un formulaire de demande de devis en ligne. Combien de relances faut-il pour obtenir toutes les pièces d’un dossier complet ? Nous pouvons automatiser cette collecte, avec un devis sous 24 h. Auriez-vous 15 minutes pour en parler ?', row: { first_name: 'Thomas', last_name: 'Kieffer', email: 't.kieffer@kieffer-courtage-demo.fr', company: 'Kieffer Courtage', website: 'https://kieffer-courtage-demo.fr/', city: 'Strasbourg', job_title: 'Gérant', info: 'Cabinet de courtage (code NAF 66.22Z), sans salarié, créé en 2021, Strasbourg (67000). Dirigeants : Thomas Kieffer (Gérant).', cible: 'courtier', score: 7, reason: 'Courtier indépendant qui gère seul la collecte des pièces et les relances.', signals: ['Formulaire de demande de devis en ligne'] } },
  { kept: false, name: 'Exemple Patrimoine Groupe', city: 'Strasbourg', cible: 'cgp', kind: 'pertinence', reason: 'Peu pertinent (3/10) : agence locale d’un réseau national géré par un siège.' },
]

let running = false

/** Le bouton « Trouver les prospects du jour » : progression, arrêt, message de fin. */
export function useAutoSearch() {
  const { data, insert, settings, me } = useStore()
  const run = useAction()
  const [progress, setProgress] = useState<AutoProgress | null>(null)
  const [last, setLast] = useState<string | null>(null)
  const stopped = useRef(false)
  const stop = useCallback(() => { stopped.current = true }, [])

  const start = useCallback(() => run(async () => {
    if (running) throw new Error('Une recherche est déjà en cours.')
    const target = roomToday(data.prospects)
    if (target <= 0) throw new Error(`La journée est déjà pleine : ${DAILY_LIMIT} envois, relances et brouillons compris. Reprise demain.`)
    const budget = settings.prospect_daily_checks - checkedToday(data.prospects, data.prospect_rejects)
    if (budget <= 0) throw new Error(`Plafond de ${settings.prospect_daily_checks} entreprises vérifiées atteint aujourd’hui. Reprise demain.`)
    const targets = settings.prospect_targets.filter((c) => CIBLES[c]?.recherche)
    if (!targets.length) throw new Error('Cochez au moins une cible dans « Recherche automatique ».')
    if (!DEMO && !GATEWAY_READY) throw new Error('La recherche automatique demande la version GitHub du CRM, reliée à la passerelle Make.')

    running = true
    stopped.current = false
    setLast(null)
    let checked = 0, kept = 0, streak = 0, end = ''
    const rejected: Record<RejectKind, number> = { site: 0, email: 0, pertinence: 0, connu: 0 }
    const show = (step: string) => setProgress({ checked, kept, target, budget, step })
    const reject = async (siren: string, name: string, city: string | null, cible: Cible, kind: RejectKind, reason: string, website: string | null) => {
      rejected[kind] += 1
      await insert('prospect_rejects', { id: siren, siren, name, city, cible, kind, reason, website })
    }
    try {
      if (DEMO) {
        for (const f of DEMO_FINDS) {
          if (stopped.current || kept >= target) break
          checked += 1
          show(`${f.kept ? f.row.company : f.name} : analyse`)
          await pause(700)
          const siren = String(Math.floor(100_000_000 + Math.random() * 899_999_999))
          if (f.kept) {
            const mail = compose({ ...f.row, history: [], step: 0 } as unknown as Prospect, 0, me, { subject: f.subject, body: f.body })
            await insert('prospects', { ...f.row, siren, source: 'auto', batch: isoDay(), draft_subject: mail.subject, draft_body: mail.body, draft_step: 0 })
            kept += 1
          } else await reject(siren, f.name, f.city, f.cible, f.kind, f.reason, null)
        }
        end = ' (démonstration : aucun appel réseau)'
      } else {
        const skip = new Set([...data.prospects.map((p) => p.siren), ...data.prospect_rejects.map((r) => r.siren)].filter((s): s is string => !!s))
        const known = new Set([...data.prospects.map((p) => p.email), ...data.contacts.map((c) => c.email ?? ''), ...data.companies.map((c) => c.billing_email ?? '')]
          .map((x) => x.trim().toLowerCase()).filter(Boolean))
        const next = companySource(targets, settings.prospect_departments, skip)
        const fail = (e: unknown) => {
          streak += 1
          if (streak >= MAX_ERRORS) throw new Error(`Recherche arrêtée après ${MAX_ERRORS} erreurs d’affilée (${e instanceof Error ? e.message : 'erreur inconnue'}). ${summarize(kept, rejected)}.`)
        }
        while (true) {
          if (stopped.current) { end = '. Recherche arrêtée'; break }
          if (kept >= target) break
          if (checked >= budget) { end = `. Plafond de ${settings.prospect_daily_checks} vérifications atteint`; break }
          show('Recherche d’entreprises dans la base officielle')
          let c: Awaited<ReturnType<typeof next>>
          try { c = await next() } catch (e) { fail(e); await pause(2000); continue }
          if (!c) { end = '. Plus d’entreprises nouvelles dans la zone choisie'; break }
          checked += 1
          try {
            const out = await examine(c.e, c.cible, { known, minScore: settings.prospect_min_score, me, step: show })
            streak = 0
            if (out.kept) {
              await insert('prospects', out.row)
              known.add(out.row.email)
              kept += 1
            } else await reject(c.e.siren, c.e.nom, c.e.ville || null, c.cible, out.kind, out.reason, out.website)
          } catch (e) { fail(e) }
        }
      }
    } finally {
      running = false
      setProgress(null)
    }
    const message = `${summarize(kept, rejected)}${end}.`
    setLast(message)
    return message
  }).then((message) => message && run(async () => message, message)),
  [data.companies, data.contacts, data.prospect_rejects, data.prospects, insert, me, run, settings])

  return { start, stop, progress, last }
}

/** « Remettre en file » une entreprise écartée : nouvelle vérification, sans note minimale, avec le site ou l'e-mail indiqués. */
export function useRequeue() {
  const { data, insert, update, remove, me } = useStore()
  const run = useAction()
  return useCallback((r: ProspectReject, given: { website?: string; email?: string }) => run(async () => {
    const email = given.email?.trim().toLowerCase()
    if (email && !EMAIL_RE.test(email)) throw new Error('Adresse e-mail invalide.')
    if (DEMO) {
      const address = email || `contact@${r.name.toLowerCase().normalize('NFD').replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '')}.fr`
      const p = { first_name: '', last_name: '', email: address, company: r.name, website: given.website || r.website, city: r.city, cible: r.cible, siren: r.siren, source: 'auto' as const, score: null, reason: 'Remis en file à la main.', signals: [] }
      const mail = compose({ ...p, history: [], step: 0 } as unknown as Prospect, 0, me)
      await insert('prospects', { ...p, batch: isoDay(), draft_subject: mail.subject, draft_body: mail.body, draft_step: 0 })
      await remove('prospect_rejects', r.id)
      return true
    }
    if (!GATEWAY_READY) throw new Error('La recherche automatique demande la version GitHub du CRM, reliée à la passerelle Make.')
    const known = new Set([...data.prospects.map((p) => p.email), ...data.contacts.map((c) => c.email ?? '')].map((x) => x.trim().toLowerCase()).filter(Boolean))
    const e = await fetchEntreprise(r)
    const out = await examine(e, r.cible, { known, minScore: 0, me, step: () => {}, website: given.website?.trim() || r.website, email })
    if (!out.kept) {
      await update('prospect_rejects', r.id, { kind: out.kind, reason: out.reason, website: out.website })
      throw new Error(`${r.name} : ${out.reason.toLowerCase()}. ${out.kind === 'site' ? 'Indiquez l’adresse du site.' : out.kind === 'email' ? 'Indiquez l’adresse e-mail.' : ''}`.trim())
    }
    await insert('prospects', out.row)
    await remove('prospect_rejects', r.id)
    return true
  }, `${r.name} remis en file : le brouillon est prêt`), [data.contacts, data.prospects, insert, me, remove, run, update])
}
