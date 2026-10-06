// Robot « nouvelle demande du site » : appelé par le scénario du formulaire, juste après l'envoi.
// Crée la fiche (entreprise, contact, lead, tâche), prépare la réponse et prévient les associés.
const f = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, String(v ?? '').trim()]))
const db = base(await jeton())
const r = await reglages(db)
const email = f.email.toLowerCase()
const ref = `site:${f.date}:${email}`
const dealId = refId(ref)
if (await db.un('deals', dealId)) return { action: 'doublon' }

const [contacts, companies] = await Promise.all([db.tout('contacts'), db.tout('companies')])
const ops = []
let contact = email ? contacts.find((c) => norm(c.email) === email) : null
let companyId = contact?.company_id ?? null
if (!companyId && f.entreprise) {
  let co = companies.find((c) => norm(c.name) === norm(f.entreprise))
  if (!co) { co = fiche('companies', { name: f.entreprise }); ops.push(ecrireFiche('companies', co)) }
  companyId = co.id
}
if (!contact) {
  contact = fiche('contacts', { company_id: companyId, first_name: f.prenom, last_name: f.nom, email: email || null, phone: f.telephone || null })
  ops.push(ecrireFiche('contacts', contact))
}
const qui = f.entreprise || `${f.prenom} ${f.nom}`.trim() || 'Demande du site'
const nom = `${f.prenom} ${f.nom}`.trim() || qui
const mode = r.robot_paused || !email || !f.corps ? 'non' : (r.lead_autoreply || 'envoi')
const now = maintenant()
const deal = fiche('deals', {
  id: dealId, title: f.theme ? `${qui} — ${f.theme}` : qui, company_id: companyId, contact_id: contact.id, source: 'formulaire',
  need: f.theme || null, message: f.message || null, external_ref: ref, last_activity_at: now,
  ...(mode === 'envoi' ? { stage: 'contacte' } : {}),
})
ops.push(ecrireFiche('deals', deal))
const lien = { deal_id: dealId, company_id: companyId, contact_id: contact.id }
ops.push(ecrireFiche('activities', fiche('activities', { type: 'systeme', subject: `Demande reçue via le site${f.source ? ` (${court(f.source, 80)})` : ''}`, body: f.message || null, ...lien })))
ops.push(ecrireFiche('tasks', fiche('tasks', { title: `Appeler ${nom}${f.entreprise && f.entreprise !== nom ? ` (${f.entreprise})` : ''}${f.telephone ? ` · ${f.telephone}` : ''}`, due_date: jour(), deal_id: dealId, company_id: companyId })))
if (mode === 'envoi') {
  ops.push(ecrireFiche('activities', fiche('activities', { type: 'email_envoye', subject: f.objet, body: f.corps, ...lien })))
  ops.push(ecrireFiche('outbox', fiche('outbox', { to_email: email, subject: f.objet, body: f.corps, kind: 'email', status: 'sent', sent_at: now, deal_id: dealId, contact_id: contact.id })))
}
const etat = mode === 'envoi' ? 'Réponse envoyée automatiquement.' : mode === 'brouillon' ? 'Brouillon de réponse prêt dans Gmail.' : 'Pas de réponse automatique.'
ops.push(notif('lead', `Nouvelle demande : ${qui}`, `${f.theme ? f.theme + ' · ' : ''}${etat}`, `/pipeline?lead=${dealId}`))
ops.push(journal('robot-demande', true, `${qui} : lead créé. ${etat}`))
await db.ecrire(ops)

const texte = `🔔 <b>Nouvelle demande — ${tg(qui)}</b>\n\n👤 ${tg(nom)}\n✉️ ${tg(email)}${f.telephone ? `\n📞 ${tg(f.telephone)}` : ''}${f.theme ? `\n🎯 ${tg(f.theme)}` : ''}${f.message ? `\n📝 ${tg(court(f.message, 600))}` : ''}\n\n✅ Lead créé dans le CRM + tâche « Appeler » pour aujourd’hui.\n${mode === 'envoi' ? '📨' : mode === 'brouillon' ? '📝' : 'ℹ️'} ${etat}`
return { action: mode, to: email, subject: f.objet, body: html(f.corps), telegram: r.notify_telegram ? texte : '' }
