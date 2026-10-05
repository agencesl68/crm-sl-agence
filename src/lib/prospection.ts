import { useCallback, useState } from 'react'
import { useAction } from '../components/ui'
import { addDays, isoDay } from './format'
import { callMake, GATEWAY_READY, MAKE_READY } from './make'
import { use, type SampleApi } from './runtime'
import { useStore } from './store'
import type { Cible, Profile, Prospect } from './types'

/**
 * Prospection par e-mail à froid.
 *
 * La séquence est fixe : un premier message personnalisé (J0), une relance avec un exemple concret (J+4),
 * un dernier message court (J+9). Seule la phrase d'accroche et l'objet du premier message sont rédigés
 * par Claude ; tout le reste vient des modèles ci-dessous, testés une fois pour toutes.
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
}

const EXEMPLE_TERRAIN =
  'Chez une entreprise que nous accompagnons, un document rempli à la main puis ressaisi dans Excel par la secrétaire est maintenant rempli et signé une seule fois sur téléphone, puis envoyé directement. Plus de double saisie.'

export const CIBLES: Record<Cible, CibleDef> = {
  cgp: {
    label: 'Gestion de patrimoine',
    metier: 'cabinet de gestion de patrimoine',
    constat: 'Dans beaucoup de cabinets de gestion de patrimoine, le suivi des dossiers clients, la collecte des pièces et la conformité prennent encore des heures chaque semaine.',
    exemple: 'Pour un cabinet de gestion de patrimoine, nous avons remplacé un fichier Excel par client, qu’il fallait ouvrir et chercher dans les dossiers, par une seule application qui centralise tous les clients.',
  },
  formation: {
    label: 'Organisme de formation',
    metier: 'organisme de formation',
    constat: 'Dans beaucoup d’organismes de formation, les conventions, les feuilles d’émargement, les évaluations et le suivi qualité prennent encore des heures chaque semaine.',
    exemple: EXEMPLE_TERRAIN,
  },
  courtier: {
    label: 'Courtage en assurance',
    metier: 'cabinet de courtage',
    constat: 'Chez beaucoup de courtiers, la collecte des pièces, les relances clients et la saisie des dossiers prennent encore des heures chaque semaine.',
    exemple: EXEMPLE_TERRAIN,
  },
  immobilier: {
    label: 'Agence immobilière',
    metier: 'agence immobilière',
    constat: 'Dans beaucoup d’agences immobilières, la gestion des documents, les relances et la saisie des dossiers locataires prennent encore des heures chaque semaine.',
    exemple: EXEMPLE_TERRAIN,
  },
  comptable: {
    label: 'Cabinet comptable',
    metier: 'cabinet comptable',
    constat: 'Dans beaucoup de cabinets comptables, la collecte des pièces auprès des clients et les relances prennent encore des heures chaque semaine.',
    exemple: EXEMPLE_TERRAIN,
  },
  autre: {
    label: 'Autre activité',
    metier: 'entreprise',
    constat: 'Dans beaucoup d’entreprises, la saisie, les relances et les documents à remplir prennent encore des heures chaque semaine.',
    exemple: EXEMPLE_TERRAIN,
  },
}
export const CIBLE_IDS = Object.keys(CIBLES) as Cible[]

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

/** Les trois messages de la séquence. `hook` et `subject` ne servent qu'au premier. */
export function compose(p: Prospect, step: number, me: Profile | null, ai?: { subject?: string; hook?: string }): { subject: string; body: string } {
  const def = CIBLES[p.cible]
  const sign = signature(me)
  const first = p.history.find((h) => h.step === 1)?.subject
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

/** Objet et accroche personnalisés : passerelle Make (version GitHub) ou Claude de la visionneuse (claude.ai). */
async function personalize(p: Prospect): Promise<{ subject?: string; hook?: string }> {
  if (GATEWAY_READY) {
    let site = ''
    if (p.website) {
      const url = /^https?:\/\//i.test(p.website) ? p.website : `https://${p.website}`
      site = String((await callMake('site', { site: url }).catch(() => ({ texte: '' }))).texte ?? '')
    }
    const out = await callMake('rediger', { prompt: prompt(p, site) })
    return parseAi(String(out.texte ?? ''))
  }
  const sample = await use<SampleApi>('sample')
  if (!sample) return {}
  const { text } = await sample(prompt(p, ''), { modelTier: 'quick', cache: false })
  return parseAi(text)
}

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
        const ai = p.step === 0 ? await personalize(p) : undefined
        const mail = compose(p, p.step, me, ai)
        await update('prospects', p.id, { draft_subject: mail.subject, draft_body: mail.body, draft_step: p.step, error: null })
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

/** Régénère le brouillon d'un seul prospect (nouvelle accroche). */
export function useRedraft() {
  const { update, me } = useStore()
  const run = useAction()
  return useCallback((p: Prospect) => run(async () => {
    const ai = p.step === 0 ? await personalize(p) : undefined
    const mail = compose(p, p.step, me, ai)
    await update('prospects', p.id, { draft_subject: mail.subject, draft_body: mail.body, draft_step: p.step, error: null })
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

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
