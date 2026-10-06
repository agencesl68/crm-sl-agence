// Robot du matin (1/2), du lundi au vendredi à 7 h 30 : Qonto → CRM, relances et rappels à faire, données du point du jour.
const db = base(await jeton())
const r = await reglages(db)
const [deals, contacts, companies, quotes, tasks, invoices, activities, outbox] = await Promise.all(
  ['deals', 'contacts', 'companies', 'quotes', 'tasks', 'qonto_invoices', 'activities', 'outbox'].map((c) => db.tout(c)),
)
const today = jour()
const now = maintenant()
const semaine = input.forcer === 'oui' || !['Sat', 'Sun'].includes(jourSemaine())
const actif = !r.robot_paused && semaine
const ops = []
const notes = []
const parse = (t) => { try { return JSON.parse(t || '{}') } catch { return {} } }

// ── 1. Qonto : comptes et factures clients (le rattachement aux clients et les rappels déjà faits sont conservés) ──
const org = parse(input.organisation)
const comptes = org.bank_accounts || []
for (const a of comptes) {
  const iban = String(a.iban || '')
  const id = String(a.slug || iban)
  if (id) ops.push({ col: 'qonto_accounts', id, data: { id, name: `Compte ${iban.slice(-4)}`, iban, balance: Number(a.balance || 0), currency: a.currency || 'EUR', updated_at: now }, partiel: true })
}
const solde = comptes.reduce((s, a) => s + Number(a.balance || 0), 0)
const factures = new Map(invoices.map((i) => [i.id, i]))
for (const f of parse(input.factures).client_invoices || []) {
  if (!f.id) continue
  const avant = factures.get(f.id)
  const c = f.client || {}
  const clientNom = c.name || [c.first_name, c.last_name].filter(Boolean).join(' ') || null
  const clientEmail = c.email || f.contact_email || null
  const co = avant?.company_id ?? companies.find((x) => (c.id && x.qonto_client_id === c.id) || norm(x.name) === norm(clientNom) || (clientEmail && norm(x.billing_email) === norm(clientEmail)))?.id
    ?? contacts.find((x) => clientEmail && norm(x.email) === norm(clientEmail))?.company_id ?? null
  const row = {
    id: f.id, number: f.number || null, status: f.status || 'unpaid', issue_date: f.issue_date || null, due_date: f.due_date || null, paid_at: f.paid_at || null,
    total_ttc: Number(f.total_amount?.value || 0), vat_amount: Number(f.vat_amount?.value || 0), client_name: clientNom, client_email: clientEmail,
    qonto_client_id: c.id || null, invoice_url: f.invoice_url || null, company_id: co, updated_at: now, ...(avant ? {} : { created_at: now }),
  }
  ops.push({ col: 'qonto_invoices', id: f.id, data: row, partiel: true })
  if (avant && avant.status !== 'paid' && row.status === 'paid') {
    ops.push(notif('paiement', `Facture ${row.number} payée`, `${clientNom ?? ''} · ${euros(row.total_ttc)}`, '/documents?onglet=factures'))
    notes.push(`💶 Facture ${row.number} payée par ${clientNom} (${euros(row.total_ttc)})`)
  }
  factures.set(f.id, { ...avant, ...row })
}

// ── 2. Rappels de paiement des factures en retard (lien Qonto de la facture) ──
const paiements = []
if (actif && r.payment_reminders) {
  const delais = r.payment_delays?.length ? r.payment_delays : [3, 10, 20]
  for (const inv of factures.values()) {
    if (inv.status !== 'unpaid' || !inv.due_date || inv.due_date >= today) continue
    const retard = Math.floor(joursDepuis(inv.due_date + 'T00:00:00Z'))
    const n = Number(inv.reminder_count || 0)
    if (n < delais.length && retard >= delais[n] && inv.client_email && inv.invoice_url && (!inv.last_reminder_at || joursDepuis(inv.last_reminder_at) >= 2)) {
      paiements.push({ invoice_id: inv.id, numero: n + 1, to: inv.client_email, number: inv.number, montant: euros(inv.total_ttc), echeance: dateFr(inv.due_date), url: inv.invoice_url, client: inv.client_name, company_id: inv.company_id })
    } else if (n >= delais.length && retard >= delais[delais.length - 1] + 7) {
      ops.push({ col: 'tasks', id: `impaye-${inv.id}`, nouveau: true, data: fiche('tasks', { id: `impaye-${inv.id}`, title: `Appeler ${inv.client_name || 'le client'} : facture ${inv.number} impayée (${euros(inv.total_ttc)})`, due_date: today, company_id: inv.company_id }) })
    }
  }
}

// ── 3. Relances commerciales (leads « Contacté » et « Devis envoyé » sans réponse) ──
const relances = []
if (actif && r.followup_enabled) {
  const delais = r.followup_delays?.length ? r.followup_delays : [3, 7, 14]
  for (const d of deals) {
    if (!['contacte', 'devis_envoye'].includes(d.stage) || d.followups_paused) continue
    const n = Number(d.followup_count || 0)
    const attente = joursDepuis(d.last_activity_at || d.created_at)
    const c = contacts.find((x) => x.id === d.contact_id)
    if (n >= delais.length) {
      if (attente >= delais[delais.length - 1]) ops.push({ col: 'tasks', id: `fin-relances-${d.id}`, nouveau: true, data: fiche('tasks', { id: `fin-relances-${d.id}`, title: `Appeler ${c ? `${c.first_name} ${c.last_name}`.trim() : d.title} : ${n} relances sans réponse`, due_date: today, deal_id: d.id, company_id: d.company_id }) })
      continue
    }
    if (attente < delais[n] || !c?.email || relances.length >= 12) continue
    const devis = quotes.filter((q) => q.deal_id === d.id && q.number).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]
    const histo = activities.filter((a) => a.deal_id === d.id && ['email_envoye', 'email_recu', 'relance', 'appel', 'rdv', 'note'].includes(a.type))
      .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at))).slice(0, 4)
      .map((a) => ({ type: a.type, date: String(a.occurred_at).slice(0, 10), objet: a.subject, extrait: court(a.body, 300) }))
    const fil = [...activities.filter((a) => a.deal_id === d.id && a.thread_id).map((a) => ({ t: a.thread_id, at: a.occurred_at })),
      ...outbox.filter((o) => o.deal_id === d.id && o.thread_id).map((o) => ({ t: o.thread_id, at: o.sent_at || o.created_at }))]
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))[0]?.t || ''
    relances.push({
      deal_id: d.id, numero: n + 1, total: delais.length, prenom: c.first_name, nom: c.last_name, email: c.email, contact_id: c.id, company_id: d.company_id,
      entreprise: companies.find((x) => x.id === d.company_id)?.name || null, besoin: d.need, message_initial: court(d.message, 500),
      etape: d.stage === 'devis_envoye' ? 'devis envoyé, en attente de réponse' : 'premier contact fait, sans réponse',
      devis: devis ? `${devis.number} « ${devis.title} » — ${euros(devis.total_ttc)}${devis.total_monthly ? ` + ${euros(devis.total_monthly)}/mois` : ''}` : null,
      jours_sans_reponse: Math.floor(attente), historique: histo, fil,
    })
  }
}

// ── 4. Point du jour ──
const ouverts = deals.filter((d) => ['nouveau', 'contacte', 'rdv', 'devis_envoye'].includes(d.stage))
const aFaire = tasks.filter((t) => !t.done && t.due_date && t.due_date <= today)
const faits = {
  date: today, leads_en_cours: ouverts.length, nouveaux_leads: deals.filter((d) => d.stage === 'nouveau').map((d) => d.title),
  potentiel_euros: ouverts.reduce((s, d) => s + Number(d.amount || 0), 0),
  devis_en_attente: quotes.filter((q) => q.status === 'envoye').map((q) => `${q.number} ${q.title}`),
  factures_impayees: [...factures.values()].filter((i) => i.status === 'unpaid').map((i) => `${i.number} ${i.client_name} ${i.total_ttc} € échéance ${i.due_date}`),
  taches_du_jour: aFaire.map((t) => t.title), solde_qonto: solde,
  actions_du_robot_ce_matin: { relances_commerciales: relances.length, rappels_de_paiement: paiements.length, paiements_recus: notes.length },
}
const consignes = `Tu es l'assistant commercial de SL Agence (automatisation, applications métier et IA pour les TPE/PME d'Alsace), dirigée par Sacha et Loïc. Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour ni backticks : {"brief": "...", "relances": [{"deal_id": "...", "objet": "...", "corps": "..."}]}.

1. "brief" : le point du jour en français, 3 à 4 phrases, ton direct et concret, sans liste ni titre. Commence par ce qui demande une action aujourd'hui, puis l'état commercial et financier. N'invente aucun chiffre. ${r.morning_brief ? '' : 'Mets une chaîne vide.'}
Données : ${JSON.stringify(faits)}

2. "relances" : une relance par élément ci-dessous (même deal_id). E-mail en français, vouvoiement, chaleureux et professionnel, 50 à 110 mots, écrit au nom de Sacha et Loïc (« nous »). Première ligne seule : « Bonjour <prénom>, », puis 2 ou 3 courts paragraphes séparés par une ligne vide (\\n\\n). Fais référence au besoin et au dernier échange (historique), sans le recopier. Relance n°1 : simple prise de nouvelles ; n°2 : propose un appel de 15 minutes cette semaine ; dernière relance (numero = total) : message bref et élégant indiquant que vous ne relancerez plus, porte ouverte. Si un devis est en attente, mentionne-le et propose d'en discuter. N'invente ni prix, ni date, ni information absente. Pas de signature (elle est ajoutée ensuite), pas de crochets ni de champs à compléter. "objet" : court et naturel (moins de 60 caractères).
Relances : ${JSON.stringify(relances.map(({ email, contact_id, company_id, fil, ...x }) => x))}`
if (ops.length) await db.ecrire(ops)
return {
  ia: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 4000, messages: [{ role: 'user', content: consignes }] }),
  plan: JSON.stringify({ relances, paiements, notes, solde, taches: aFaire.map((t) => t.title).slice(0, 8), today }),
}
