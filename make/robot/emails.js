// Robot « e-mails » : toutes les 30 minutes, range dans le CRM les e-mails échangés avec les contacts.
// Réponse d'un lead → historique, compteur de relances remis à zéro, tâche « Répondre », notification.
const mails = Array.isArray(input.mails) ? input.mails : []
if (!mails.length) return { telegram: '' }
const db = base(await jeton())
const r = await reglages(db)
const agence = norm(r.email) || AGENCE
const [contacts, deals, outbox, tasks] = await Promise.all([db.tout('contacts'), db.tout('deals'), db.tout('outbox'), db.tout('tasks')])
const parEmail = new Map(contacts.filter((c) => c.email).map((c) => [norm(c.email), c]))
const OUVERTS = ['nouveau', 'contacte', 'rdv', 'devis_envoye']
const dealDe = (c) => deals.filter((d) => d.contact_id === c.id || (c.company_id && d.company_id === c.company_id))
  .sort((a, b) => Number(OUVERTS.includes(b.stage)) - Number(OUVERTS.includes(a.stage)) || String(b.created_at).localeCompare(String(a.created_at)))[0]

// 1. Historique : une entrée par e-mail (identifiant Gmail → jamais en double)
const candidats = []
const fils = []
for (const m of mails) {
  const de = adresses(m.from)[0] || ''
  const sortant = de === agence
  const autres = sortant ? adresses(`${m.to} ${m.cc}`) : [de]
  const contact = autres.map((a) => parEmail.get(a)).find(Boolean)
  if (!contact || !m.id) continue
  const date = new Date(m.date || Date.now()).toISOString()
  // Déjà enregistré par le CRM ou le robot (envoi depuis le CRM) : même destinataire, même objet, à 3 h près
  const envoi = sortant && outbox.find((o) => norm(o.to_email) === norm(contact.email) && norm(o.subject).replace(/^re:\s*/, '') === norm(m.subject).replace(/^re:\s*/, '') && Math.abs(new Date(o.sent_at || o.created_at) - new Date(date)) < 3 * 3600e3)
  if (envoi) {
    // Le fil Gmail sert aux relances suivantes, qui répondent dans la même conversation
    if (!envoi.thread_id && m.thread) fils.push({ col: 'outbox', id: envoi.id, data: { thread_id: m.thread, gmail_id: m.id }, partiel: true })
    continue
  }
  const deal = dealDe(contact)
  candidats.push({ m, contact, deal, sortant, date })
}
if (fils.length) await db.ecrire(fils)
if (!candidats.length) return { telegram: '' }
const crees = await db.ecrire(candidats.map(({ m, contact, deal, sortant, date }) => ({
  col: 'activities', id: `gmail-${m.id}`, nouveau: true,
  data: {
    ...DEFAUTS.activities, id: `gmail-${m.id}`, type: sortant ? 'email_envoye' : 'email_recu', subject: court(m.subject, 200) || '(sans objet)',
    body: court(sansCitation(m.body) || m.snippet, 3000), deal_id: deal?.id ?? null, company_id: contact.company_id ?? null, contact_id: contact.id,
    external_id: `gmail:${m.id}`, thread_id: m.thread || null, occurred_at: date, created_at: maintenant(),
  },
})))

// 2. Effets des nouveaux e-mails seulement
const ops = []
const lignes = []
const vus = new Set()
candidats.forEach((c, i) => {
  if (!crees[i]) return
  const { m, contact, deal, sortant, date } = c
  const nom = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email
  if (deal && OUVERTS.includes(deal.stage) && date > String(deal.last_activity_at || '')) {
    const maj = { last_activity_at: date, ...(sortant ? {} : { followup_count: 0 }), ...(deal.stage === 'nouveau' ? { stage: 'contacte' } : {}) }
    Object.assign(deal, maj)
    ops.push({ col: 'deals', id: deal.id, data: maj, partiel: true })
  }
  const ouvertes = tasks.filter((t) => !t.done && t.title.startsWith('Répondre à ') && (t.deal_id === deal?.id || t.title.includes(nom)))
  if (sortant) {
    for (const t of ouvertes) ops.push({ col: 'tasks', id: t.id, data: { done: true, done_at: maintenant() }, partiel: true })
    return
  }
  if (!ouvertes.length && !vus.has(contact.id)) {
    vus.add(contact.id)
    ops.push(ecrireFiche('tasks', fiche('tasks', { title: `Répondre à ${nom} : ${court(m.subject, 60)}`, due_date: jour(), deal_id: deal?.id ?? null, company_id: contact.company_id ?? null })))
  }
  ops.push(notif('reponse', `${nom} a écrit`, court(m.subject, 120), deal ? `/pipeline?lead=${deal.id}` : '/mails'))
  lignes.push(`📩 <b>${tg(nom)}</b>${deal ? ` (${tg(court(deal.title, 60))})` : ''}\n${tg(court(m.subject, 100))}\n<i>${tg(court(sansCitation(m.body) || m.snippet, 220))}</i>`)
})
const n = crees.filter(Boolean).length
ops.push(journal('robot-emails', true, `${n} e-mail(s) ajouté(s) à l’historique`))
await db.ecrire(ops)
return { telegram: r.notify_telegram && lignes.length ? `${lignes.slice(0, 8).join('\n\n')}\n\n✅ Ajouté à l’historique du CRM + tâche « Répondre ».` : '' }
