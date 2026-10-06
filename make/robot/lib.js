// ───────────── Bibliothèque commune du robot du CRM (ajoutée en tête de chaque module « Code » de Make) ─────────────
// Le robot agit avec la session Firebase d'un associé, chiffrée dans robot/acces : les règles Firestore s'appliquent.
const crypto = require('crypto')
const API_KEY = 'AIzaSyBxNglyyDMlQutjYa52ESkcylA9NqhBBm4'
const ROOT = 'projects/sl-agence-crm/databases/(default)/documents'
const BASE = 'https://firestore.googleapis.com/v1/' + ROOT
const CLE = '__CLE__'
const AGENCE = 'agence.sl.68@gmail.com'

// ── Dates (heure de Paris) ──
const jour = (d = new Date()) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const plusJours = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const joursDepuis = (iso) => (Date.now() - new Date(iso).getTime()) / 86400000
const jourSemaine = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', weekday: 'short' }).format(new Date())
const dateFr = (iso) => iso ? new Date(iso + (iso.length === 10 ? 'T12:00:00Z' : '')).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric' }) : ''
const euros = (n) => Number(n || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
const maintenant = () => new Date().toISOString()

// ── Texte ──
const norm = (s) => String(s ?? '').trim().toLowerCase()
const adresses = (s) => (String(s ?? '').match(/[\w.+'-]+@[\w-]+(\.[\w-]+)+/g) || []).map((x) => x.toLowerCase())
const html = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r?\n/g, '<br>')
const tg = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const court = (t, n) => { const s = String(t ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s }
/** Corps d'un e-mail reçu sans la citation du message précédent. */
const sansCitation = (t) => String(t ?? '').split(/\r?\n(?:Le .{5,200}a écrit\s?:|On .{5,200}wrote:|-----Original Message-----|De ?: )/)[0].split(/\r?\n/).filter((l) => !l.startsWith('>')).join('\n').trim()
function refId(ref) { let h = 0x811c9dc5; for (let i = 0; i < ref.length; i++) h = Math.imul(h ^ ref.charCodeAt(i), 0x01000193); return `site-${(h >>> 0).toString(36)}-${ref.length}` }
const uid = () => crypto.randomUUID()

// ── Valeurs par défaut des fiches (identiques à celles du CRM) ──
const DEFAUTS = {
  deals: { stage: 'nouveau', source: 'autre', followup_count: 0, followups_paused: false, amount: null, owner_id: null, closed_at: null, lost_reason: null, need: null, message: null },
  tasks: { done: false, done_at: null, due_date: null, assignee_id: null, deal_id: null, company_id: null, project_id: null },
  companies: { client_type: 'entreprise', country: 'FR', qonto_client_id: null, billing_email: null, siret: null, vat_number: null, address: null, postal_code: null, city: null, website: null, sector: null, notes: null },
  contacts: { company_id: null, email: null, phone: null, job_title: null, instagram: null, notes: null },
  activities: { subject: null, body: null, deal_id: null, company_id: null, contact_id: null, author_id: null, external_id: null },
  outbox: { status: 'pending', kind: 'email', error: null, sent_at: null, deal_id: null, contact_id: null, created_by: null },
}
const fiche = (col, data) => { const now = maintenant(); return { id: uid(), created_at: now, ...DEFAUTS[col], ...(col === 'activities' ? { occurred_at: now } : {}), ...data } }
const REGLAGES = {
  followup_enabled: true, followup_delays: [3, 7, 14], followup_mode: 'envoi', lead_autoreply: 'envoi',
  payment_reminders: true, payment_delays: [3, 10, 20], notify_telegram: true, morning_brief: true, robot_paused: false,
  email_signature: 'Sacha et Loïc\nSL Agence — Applications métier, automatisation et IA', email: AGENCE,
}

// ── Firestore (API REST) ──
const enc = (v) => v === null || v === undefined ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }) : typeof v === 'string' ? { stringValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(enc) } } : { mapValue: { fields: champs(v) } }
const champs = (o) => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined).map(([k, x]) => [k, enc(x)]))
const dec = (v) => 'nullValue' in v ? null : 'stringValue' in v ? v.stringValue : 'integerValue' in v ? Number(v.integerValue) : 'doubleValue' in v ? v.doubleValue : 'booleanValue' in v ? v.booleanValue : 'timestampValue' in v ? v.timestampValue : 'arrayValue' in v ? (v.arrayValue.values || []).map(dec) : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, dec(x)])) : null
const lire = (doc) => Object.fromEntries(Object.entries(doc.fields || {}).map(([k, v]) => [k, dec(v)]))

/** Session du robot : jeton Firebase d'un associé, renouvelé à chaque passage. */
async function jeton() {
  const r = await fetch(`${BASE}/robot/acces?key=${API_KEY}`)
  if (!r.ok) throw new Error('Robot pas encore activé : ouvrez le CRM une fois pour l’activer.')
  const a = lire(await r.json())
  const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(CLE, 'hex'), Buffer.from(a.iv, 'base64'))
  d.setAuthTag(Buffer.from(a.tag, 'base64'))
  const refresh = Buffer.concat([d.update(Buffer.from(a.blob, 'base64')), d.final()]).toString('utf8')
  const t = await fetch(`https://securetoken.googleapis.com/v1/token?key=${API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(refresh) })
  const j = await t.json()
  if (!t.ok) throw new Error('La session du robot a expiré : reconnectez-vous une fois au CRM.')
  return j.id_token
}

function base(tok) {
  const h = { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }
  const ok = async (r) => { if (!r.ok) throw new Error(`Base du CRM (${r.status}) : ${(await r.text()).slice(0, 300)}`); return r.json() }
  return {
    async tout(col) {
      const out = []
      let page = ''
      do {
        const j = await ok(await fetch(`${BASE}/${col}?pageSize=300${page ? '&pageToken=' + encodeURIComponent(page) : ''}`, { headers: h }))
        for (const d of j.documents || []) out.push(lire(d))
        page = j.nextPageToken || ''
      } while (page)
      return out
    },
    async un(col, id) {
      const r = await fetch(`${BASE}/${col}/${encodeURIComponent(id)}`, { headers: h })
      return r.status === 404 ? null : lire(await ok(r))
    },
    /** ops : { col, id, data, partiel?: true (seulement ces champs), nouveau?: true (seulement s'il n'existe pas) } → réussite de chaque écriture */
    async ecrire(ops) {
      const res = []
      for (let i = 0; i < ops.length; i += 400) {
        const writes = ops.slice(i, i + 400).map((o) => ({
          update: { name: `${ROOT}/${o.col}/${o.id}`, fields: champs(o.data) },
          ...(o.partiel ? { updateMask: { fieldPaths: Object.keys(o.data) } } : {}),
          ...(o.nouveau ? { currentDocument: { exists: false } } : {}),
        }))
        const j = await ok(await fetch(`${BASE}:batchWrite`, { method: 'POST', headers: h, body: JSON.stringify({ writes }) }))
        for (const s of j.status || []) res.push(!s.code)
      }
      return res
    },
  }
}

const reglages = async (db) => ({ ...REGLAGES, ...((await db.un('settings', 'true')) || {}) })
const journal = (nom, ok, detail) => ({ col: 'sync_log', id: nom, data: { id: nom, ok, detail: String(detail).slice(0, 1500), at: maintenant(), by: 'robot' } })
const notif = (kind, title, body, link) => { const id = uid(); return { col: 'notifications', id, data: { id, kind, title, body: body || null, link: link || null, created_at: maintenant() } } }
const ecrireFiche = (col, row) => ({ col, id: row.id, data: row })
