// Robot du matin (2/2) : relances rédigées par Claude → historique, compteurs, e-mails à envoyer et message Telegram.
const plan = JSON.parse(input.plan || '{}')
let ia = {}
try { const t = String(input.claude || ''); ia = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)) } catch { /* réponse illisible : pas de relance aujourd'hui */ }
const db = base(await jeton())
const r = await reglages(db)
const brouillon = r.followup_mode === 'brouillon'
const now = maintenant()
const ops = []
const envois = []
const lignes = []
const signature = `\n\n${r.email_signature || REGLAGES.email_signature}`

for (const rel of plan.relances || []) {
  const g = (ia.relances || []).find((x) => x.deal_id === rel.deal_id)
  if (!g?.corps || !g?.objet) continue
  const corps = String(g.corps).trim() + signature
  const lien = { deal_id: rel.deal_id, company_id: rel.company_id ?? null, contact_id: rel.contact_id }
  envois.push({ mode: brouillon ? 'brouillon' : rel.fil ? 'reponse' : 'envoi', to: rel.email, subject: g.objet, body: html(corps), thread: rel.fil || '' })
  ops.push(ecrireFiche('activities', fiche('activities', { type: 'relance', subject: g.objet, body: corps, ...lien })))
  ops.push(ecrireFiche('outbox', fiche('outbox', { to_email: rel.email, subject: g.objet, body: corps, kind: 'relance', status: brouillon ? 'pending' : 'sent', sent_at: brouillon ? null : now, deal_id: rel.deal_id, contact_id: rel.contact_id })))
  ops.push({ col: 'deals', id: rel.deal_id, data: { followup_count: rel.numero, last_activity_at: now }, partiel: true })
  lignes.push(`• ${brouillon ? 'Brouillon de relance' : 'Relance'} n°${rel.numero} → ${tg(`${rel.prenom || ''} ${rel.nom || ''}`.trim())}${rel.entreprise ? ` (${tg(rel.entreprise)})` : ''}`)
}

for (const p of plan.paiements || []) {
  const objet = `Facture ${p.number} — ${p.numero === 1 ? 'petit rappel' : 'rappel de paiement'}`
  const corps = `Bonjour,\n\n${p.numero === 1 ? 'Sauf erreur de notre part' : 'Nous revenons vers vous car, sauf erreur de notre part'}, la facture ${p.number} d’un montant de ${p.montant}, arrivée à échéance le ${p.echeance}, n’a pas encore été réglée.\n\nVous pouvez la consulter et la régler ici : ${p.url}\n\nSi le paiement est déjà parti, merci de ne pas tenir compte de ce message.${signature}`
  envois.push({ mode: brouillon ? 'brouillon' : 'envoi', to: p.to, subject: objet, body: html(corps), thread: '' })
  ops.push({ col: 'qonto_invoices', id: p.invoice_id, data: { reminder_count: p.numero, last_reminder_at: now }, partiel: true })
  ops.push(ecrireFiche('activities', fiche('activities', { type: 'relance', subject: objet, body: corps, company_id: p.company_id ?? null })))
  ops.push(ecrireFiche('outbox', fiche('outbox', { to_email: p.to, subject: objet, body: corps, kind: 'relance', status: brouillon ? 'pending' : 'sent', sent_at: brouillon ? null : now })))
  lignes.push(`• ${brouillon ? 'Brouillon de rappel' : 'Rappel'} de paiement n°${p.numero} → ${tg(p.client || p.to)} (facture ${tg(p.number)}, ${tg(p.montant)})`)
}

const brief = r.morning_brief ? String(ia.brief || '').trim() : ''
if (brief) ops.push({ col: 'daily_briefs', id: plan.today, data: { day: plan.today, content: brief, created_at: now } })
const nPaiements = (plan.paiements || []).length
const resume = `${envois.length - nPaiements} relance(s), ${nPaiements} rappel(s) de paiement`
if (lignes.length) ops.push(notif('robot', `Robot du matin : ${resume}`, lignes.map((l) => l.replace(/<[^>]+>/g, '').replace(/^• /, '')).join(' · ').slice(0, 400), '/pipeline'))
ops.push(journal('robot-matin', true, `${resume}${(plan.notes || []).length ? `, ${plan.notes.length} paiement(s) reçu(s)` : ''}`))
await db.ecrire(ops)

const parts = [`☀️ <b>Point du jour</b>`]
if (brief) parts.push(tg(brief))
if (lignes.length) parts.push(`<b>${brouillon ? 'Préparé pour vous (brouillons Gmail)' : 'Envoyé pour vous ce matin'}</b>\n${lignes.join('\n')}`)
if ((plan.notes || []).length) parts.push(plan.notes.map(tg).join('\n'))
if ((plan.taches || []).length) parts.push(`<b>À faire aujourd’hui</b>\n${plan.taches.map((t) => `• ${tg(t)}`).join('\n')}`)
parts.push(`🏦 Solde Qonto : ${tg(euros(plan.solde))}`)
return { envois, telegram: r.notify_telegram ? parts.join('\n\n').slice(0, 3900) : '' }
