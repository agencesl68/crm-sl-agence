/**
 * Lecture d'un fichier Excel (.xlsx) de prospection, couleurs de remplissage comprises.
 * Fonctions pures (pas de navigateur), testées dans tests/excel.test.ts : `npm test`.
 *
 * Code couleur des lignes : vert = rendez-vous, appel ou mail demandé ; orange = pas de réponse ;
 * rouge = refus. Une ligne sans couleur n'est pas importée.
 */
import { strFromU8, unzipSync } from 'fflate'

export type Couleur = 'vert' | 'orange' | 'rouge'
export interface Ligne { cells: string[]; color: Couleur | null }
export interface Feuille { name: string; rows: Ligne[] }

// ───────────────────────────── XML ─────────────────────────────

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'' }
const unescape = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
  return ENTITIES[e] ?? m
})
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]
/** Texte d'un élément : toutes ses balises <t> mises bout à bout (texte enrichi compris). */
const texts = (xml: string) => [...xml.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((m) => unescape(m[1]!)).join('')

// ───────────────────────────── Couleurs ─────────────────────────────

/** Palette historique d'Excel (couleurs « indexées »). */
const INDEXED = [
  '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '000000', 'FFFFFF', 'FF0000', '00FF00',
  '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080',
  '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF', '000080', 'FF00FF', 'FFFF00', '00FFFF',
  '800080', '800000', '008080', '0000FF', '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99',
  '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696', '003366', '339966', '003300', '333300',
  '993300', '993366', '333399', '333333',
]

/** Couleur de thème éclaircie (teinte > 0) ou assombrie (teinte < 0), comme le fait Excel. */
function applyTint(hex: string, tint: number): string {
  if (!tint) return hex
  return [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16)
    const v = tint < 0 ? c * (1 + tint) : c + (255 - c) * tint
    return Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')
  }).join('').toUpperCase()
}

/** Vert, orange (jaune compris) ou rouge d'après la teinte ; null pour blanc, gris, bleu ou violet. */
export function classify(hex: string): Couleur | null {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  if (l > 0.97 || l < 0.08 || s < 0.15) return null
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h = (h * 60 + 360) % 360
  if (h < 18 || h >= 330) return 'rouge'
  if (h < 66) return 'orange'
  if (h < 175) return 'vert'
  return null
}

/** Couleur de thème : ordre du fichier dk1, lt1, dk2, lt2, accent1…6 ; Excel inverse clair et foncé (0 = lt1). */
function themeColors(xml: string): string[] {
  const scheme = xml.match(/<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/)?.[0] ?? ''
  const list = [...scheme.matchAll(/<a:(dk1|lt1|dk2|lt2|accent\d|hlink|folHlink)>([\s\S]*?)<\/a:\1>/g)]
    .map((m) => (attr(m[2]!, 'val') && /srgbClr/.test(m[2]!) ? attr(m[2]!, 'val')! : attr(m[2]!, 'lastClr') ?? '000000'))
  if (list.length >= 4) [list[0], list[1], list[2], list[3]] = [list[1]!, list[0]!, list[3]!, list[2]!]
  return list
}

function colorOf(tag: string | undefined, theme: string[]): string | null {
  if (!tag) return null
  const rgb = attr(tag, 'rgb')
  if (rgb) return rgb.slice(-6).toUpperCase()
  const tint = Number(attr(tag, 'tint') ?? 0)
  const t = attr(tag, 'theme')
  if (t !== undefined && theme[Number(t)]) return applyTint(theme[Number(t)]!, tint)
  const ix = attr(tag, 'indexed')
  if (ix !== undefined && INDEXED[Number(ix)]) return applyTint(INDEXED[Number(ix)]!, tint)
  return null
}

/** Couleur de remplissage de chaque style de cellule (index « s » des cellules). */
function styleColors(xml: string, theme: string[]): (Couleur | null)[] {
  const fills = [...(xml.match(/<fills\b[\s\S]*?<\/fills>/)?.[0] ?? '').matchAll(/<fill>([\s\S]*?)<\/fill>|<fill\/>/g)].map((m) => {
    const pattern = m[1]?.match(/<patternFill\b[^>]*>([\s\S]*?)<\/patternFill>|<patternFill\b[^>]*\/>/)
    if (!pattern || /patternType="none"/.test(pattern[0])) return null
    const hex = colorOf(pattern[0].match(/<fgColor\b[^>]*\/?>/)?.[0], theme) ?? colorOf(pattern[0].match(/<bgColor\b[^>]*\/?>/)?.[0], theme)
    return hex ? classify(hex) : null
  })
  const xfs = xml.match(/<cellXfs\b[\s\S]*?<\/cellXfs>/)?.[0] ?? ''
  return [...xfs.matchAll(/<xf\b[^>]*\/?>/g)].map((m) => fills[Number(attr(m[0], 'fillId') ?? 0)] ?? null)
}

// ───────────────────────────── Classeur ─────────────────────────────

const colIndex = (ref: string) => [...(ref.match(/^[A-Z]+/)?.[0] ?? 'A')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1

/** Couleur dominante d'une ligne : celle que portent le plus de cellules. */
function dominant(colors: (Couleur | null)[]): Couleur | null {
  const count = new Map<Couleur, number>()
  for (const c of colors) if (c) count.set(c, (count.get(c) ?? 0) + 1)
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

/** Toutes les feuilles du classeur, avec le texte des cellules et la couleur de chaque ligne. */
export function readWorkbook(data: Uint8Array): Feuille[] {
  let files: Record<string, Uint8Array>
  try { files = unzipSync(data) } catch { throw new Error('Ce fichier n’est pas un fichier Excel (.xlsx) lisible.') }
  const read = (path: string) => (files[path] ? strFromU8(files[path]) : '')
  const workbook = read('xl/workbook.xml')
  if (!workbook) throw new Error('Ce fichier n’est pas un fichier Excel (.xlsx) lisible.')

  const shared = [...read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]!))
  const themeFile = Object.keys(files).find((f) => /^xl\/theme\/theme\d*\.xml$/.test(f))
  const styles = styleColors(read('xl/styles.xml'), themeFile ? themeColors(read(themeFile)) : [])
  const rels = new Map([...read('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)]
    .map((m) => [attr(m[0], 'Id') ?? '', (attr(m[0], 'Target') ?? '').replace(/^\/?(xl\/)?/, 'xl/')]))

  return [...workbook.matchAll(/<sheet\b[^>]*>/g)].map((m) => {
    const name = unescape(attr(m[0], 'name') ?? '')
    const xml = read(rels.get(attr(m[0], 'r:id') ?? '') ?? '')
    const rows: Ligne[] = []
    for (const row of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const cells: string[] = []
      const colors: (Couleur | null)[] = []
      const rowStyle = /customFormat="1"/.test(row[1]!) ? styles[Number(attr(row[1]!, 's') ?? 0)] ?? null : null
      for (const c of (row[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const a = c[1]!, body = c[2] ?? ''
        const i = colIndex(attr(a, 'r') ?? `${String.fromCharCode(65 + cells.length)}1`)
        const type = attr(a, 't')
        const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1]
        cells[i] = (type === 's' ? shared[Number(v)] ?? '' : type === 'inlineStr' ? texts(body) : unescape(v ?? '')).trim()
        colors.push(styles[Number(attr(a, 's') ?? 0)] ?? null)
      }
      rows.push({ cells: Array.from(cells, (x) => x ?? ''), color: dominant(colors) ?? rowStyle })
    }
    return { name, rows }
  })
}

// ───────────────────────────── Prospects ─────────────────────────────

export interface ProspectRow {
  company: string; sector: string | null; size: string | null; address: string | null; city: string | null
  contact_name: string | null; email: string | null; phone: string | null; interest: string | null
  notes: string | null; contacted_on: string | null; followup_on: string | null; color: Couleur
}

type Champ = Exclude<keyof ProspectRow, 'color'>
const HEADERS: [Champ, RegExp][] = [
  ['company', /^(entreprise|soci[eé]t[eé]|raison sociale|nom de l.?entreprise|structure|cabinet|nom)$/],
  ['sector', /secteur|activit[eé]|m[eé]tier/],
  ['size', /taille|effectif/],
  ['address', /adresse/],
  ['city', /commune|ville|localit|code postal/],
  ['contact_name', /contact|interlocuteur|dirigeant|g[eé]rant/],
  ['email', /e.?mail|courriel|mail/],
  ['phone', /t[eé]l[eé]phone|t[eé]l\b|portable|mobile/],
  ['interest', /int[eé]r[eê]t|potentiel/],
  ['contacted_on', /date du contact|date de contact|contact[eé] le/],
  ['followup_on', /relance/],
  ['notes', /notes?|commentaires?|remarques?|besoins?|probl[eè]mes?/],
]

/** Associe chaque colonne à un champ d'après l'intitulé (« Nom du contact » → contact, « E- Mail » → email…). */
export function mapHeader(header: string[]): Partial<Record<Champ, number>> {
  const map: Partial<Record<Champ, number>> = {}
  header.forEach((h, i) => {
    const k = h.toLowerCase().replace(/\s+/g, ' ').trim()
    if (!k) return
    // Les dates passent avant « contact » : « Date du contact » n'est pas le nom du contact
    const order: Champ[] = /date|relance/.test(k) ? ['contacted_on', 'followup_on'] : HEADERS.map(([c]) => c)
    const hit = order.find((c) => map[c] === undefined && HEADERS.find(([x]) => x === c)![1].test(k))
    if (hit) map[hit] = i
  })
  return map
}

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i
/** Date Excel (nombre de jours depuis 1899-12-30) ou texte tel quel. */
const day = (v: string) => (/^\d{5}(\.\d+)?$/.test(v) ? new Date(Date.UTC(1899, 11, 30) + Number(v) * 86_400_000).toISOString().slice(0, 10) : v)

/**
 * Lignes colorées de toutes les feuilles. L'en-tête (ligne contenant « Entreprise ») est cherché dans les
 * premières lignes ; une feuille sans en-tête reprend les colonnes de la première feuille qui en a un.
 */
export function prospectsFrom(feuilles: Feuille[]): { rows: ProspectRow[]; uncolored: number } {
  let fallback: Partial<Record<Champ, number>> | null = null
  const rows: ProspectRow[] = []
  let uncolored = 0
  for (const f of feuilles) {
    const at = f.rows.slice(0, 5).findIndex((r) => mapHeader(r.cells).company !== undefined)
    const map: Partial<Record<Champ, number>> | null = at >= 0 ? mapHeader(f.rows[at]!.cells) : fallback
    if (!map || map.company === undefined) continue
    fallback ??= map
    for (const r of f.rows.slice(at + 1)) {
      const get = (c: Champ) => (map[c] === undefined ? '' : (r.cells[map[c]!] ?? '').trim())
      const company = get('company').replace(/\s+/g, ' ')
      if (!company) continue
      if (!r.color) { uncolored += 1; continue }
      const or = (v: string) => (v && v !== '/' ? v : null)
      const email = get('email').match(EMAIL)?.[0].toLowerCase() ?? null
      rows.push({
        company, sector: or(get('sector')), size: or(get('size')), address: or(get('address')), city: or(get('city')),
        contact_name: or(get('contact_name')), email, phone: or(get('phone')), interest: or(get('interest')),
        notes: or(get('notes')), contacted_on: or(day(get('contacted_on'))), followup_on: or(day(get('followup_on'))), color: r.color,
      })
    }
  }
  return { rows, uncolored }
}

/** Clé de dédoublonnage : l'e-mail s'il existe, sinon le nom de l'entreprise sans accents ni ponctuation. */
export const prospectKey = (p: { email: string | null; company: string }) =>
  p.email?.toLowerCase() || p.company.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')
