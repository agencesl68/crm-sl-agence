import { addDays, isoDay } from './format'
import type { Activity, Company, Contact, Deal, InstagramPost, NewsItem, QuoteLine, Tables, Task } from './types'

const ago = (days: number, hours = 0) => new Date(Date.now() - days * 86_400_000 - hours * 3_600_000).toISOString()
const day = (offset: number) => addDays(isoDay(), offset)

/** Date du jour + n jours, à l'heure indiquée. */
const at = (days: number, hour: number, minute = 0) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, minute, 0, 0); return d.toISOString() }

const monthOf = (offset: number) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset); return d }
const THIS_MONTH = isoDay(monthOf(0)).slice(0, 7)
const PREV_MONTH = isoDay(monthOf(-1)).slice(0, 7)
const MONTH_LABEL = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(monthOf(0))

export const DEMO_USER_ID = 'u-sacha'
const SACHA = 'u-sacha'
const LOIC = 'u-loic'

export const DEFAULT_INVOICE_TERMS =
  'Paiement par virement sous 30 jours. En cas de retard : pénalités au taux de 3 fois le taux d’intérêt légal et indemnité forfaitaire de 40 € pour frais de recouvrement.'

export const DEFAULT_CONDITIONS =
  'Acompte : aucun — règlement à la livraison / mise en ligne.\nAbonnement : démarre à la mise en ligne, engagement 12 mois, puis reconductible et résiliable avec préavis d’un mois.'

const company = (id: string, name: string, city: string, postal_code: string, sector: string, days: number, extra: Partial<Company> = {}): Company => ({
  id, name, city, postal_code, sector, client_type: 'entreprise', siret: null, vat_number: null, billing_email: null, address: null, country: 'FR',
  qonto_client_id: null, website: null, notes: null, created_at: ago(days), ...extra,
})
const contact = (id: string, company_id: string, first_name: string, last_name: string, job_title: string, phone: string | null, days: number, instagram: string | null = null): Contact => ({
  id, company_id, first_name, last_name, job_title, phone, instagram, notes: null,
  email: `${first_name}.${last_name}@demo.fr`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''), created_at: ago(days),
})
const deal = (d: Pick<Deal, 'id' | 'title' | 'stage' | 'source'> & Partial<Deal> & { created: number; active: number }): Deal => ({
  company_id: null, contact_id: null, need: null, message: null, amount: null, owner_id: null,
  followup_count: 0, followups_paused: false, lost_reason: null,
  closed_at: d.stage === 'gagne' || d.stage === 'perdu' ? ago(d.active) : null,
  last_activity_at: ago(d.active), created_at: ago(d.created), ...d,
})
const activity = (id: string, type: Activity['type'], subject: string, body: string | null, deal_id: string, author_id: string | null, days: number, hours = 0): Activity => ({
  id, type, subject, body, deal_id, company_id: null, contact_id: null, author_id, external_id: null, occurred_at: ago(days, hours), created_at: ago(days, hours),
})
const task = (id: string, title: string, due: number, assignee_id: string, link: Partial<Task> = {}): Task => ({
  id, title, due_date: day(due), done: false, done_at: null, assignee_id, deal_id: null, company_id: null, project_id: null, created_at: ago(3), ...link,
})
const line = (id: string, quote_id: string, position: number, description: string, details: string | null, quantity: number, unit: string | null, unit_price: number, extra: Partial<QuoteLine> = {}): QuoteLine => ({
  id, quote_id, position, description, details, quantity, unit, unit_price, billing: 'unique', offered: false, ...extra,
})

const post = (id: string, media_type: InstagramPost['media_type'], caption: string, daysAgo: number, hour: number, views: number, reach: number, likes: number, comments: number, saves: number, shares: number): InstagramPost => {
  const d = new Date(Date.now() - daysAgo * 86_400_000); d.setHours(hour, 0, 0, 0)
  return { id, media_type, caption, media_url: null, thumbnail_url: null, permalink: null, posted_at: d.toISOString(), views, reach, likes, comments, saves, shares, updated_at: ago(0, 1) }
}
const DEMO_POSTS: InstagramPost[] = [
  post('po1', 'REELS', 'Avant / après : 4 h de saisie en moins par semaine pour un garage 🔧 #automatisation', 2, 18, 4820, 3110, 186, 14, 41, 22),
  post('po2', 'CAROUSEL_ALBUM', '3 tâches que vous pouvez automatiser dès lundi (sans changer de logiciel) 👇', 5, 12, 2140, 1480, 97, 9, 63, 11),
  post('po3', 'IMAGE', 'On vous présente Loïc, la moitié de SL Agence 🙌', 8, 19, 1290, 980, 132, 21, 4, 3),
  post('po4', 'REELS', 'Les bons de commande d’un domaine viticole, du papier au téléphone en 1 clic 🍇', 11, 18, 6310, 4020, 241, 26, 58, 37),
  post('po5', 'CAROUSEL_ALBUM', 'Relances de devis : ce que ça rapporte vraiment (chiffres à l’appui)', 15, 12, 1870, 1310, 76, 5, 49, 8),
  post('po6', 'IMAGE', 'Atelier « IA pour les TPE » à la CCI : merci à tous les participants !', 19, 9, 980, 760, 88, 7, 2, 4),
  post('po7', 'REELS', 'Une application de feuilles d’heures en 30 secondes ⏱️', 23, 18, 3540, 2380, 158, 12, 33, 19),
  post('po8', 'CAROUSEL_ALBUM', 'Make, Zapier ou développement sur mesure : comment choisir ?', 27, 12, 1650, 1120, 64, 8, 52, 6),
  post('po9', 'IMAGE', 'Nouveau client : bienvenue au Cabinet Weber Expertise 🤝', 31, 17, 870, 690, 71, 4, 1, 2),
  post('po10', 'REELS', 'L’IA qui trie vos e-mails à votre place, démonstration', 36, 18, 5120, 3390, 203, 31, 72, 28),
  post('po11', 'IMAGE', 'Si vous savez le décrire, nous savons le construire.', 42, 11, 760, 590, 54, 3, 6, 1),
  post('po12', 'CAROUSEL_ALBUM', 'Combien coûte une automatisation ? On vous dit tout', 47, 12, 2380, 1590, 88, 13, 81, 9),
]

/** Actualités d'exemple : le vrai fil arrive par Make (flux RSS choisis). */
const news = (id: string, category: NewsItem['category'], title: string, summary: string, hours: number): NewsItem => ({
  id, category, title, summary, source: 'Exemple', url: null, published_at: ago(0, hours),
})
const DEMO_NEWS: NewsItem[] = [
  news('n1', 'IA', 'Exemple — Les assistants IA arrivent dans les logiciels de gestion des TPE', 'Ce que ça change pour la saisie, les relances et le suivi client.', 2),
  news('n2', 'Automatisation', 'Exemple — Facturation électronique : le calendrier pour les petites entreprises', 'Réception obligatoire depuis septembre 2026, émission en 2027.', 5),
  news('n3', 'Économie', 'Exemple — Les artisans du Grand Est misent sur le numérique', 'Une enquête régionale sur l’équipement des TPE.', 9),
  news('n4', 'Alsace', 'Exemple — Salon des entrepreneurs d’Alsace : le programme', 'Conférences, rendez-vous d’affaires et ateliers à Strasbourg.', 20),
  news('n5', 'IA', 'Exemple — Un nouveau modèle d’IA plus rapide pour les tâches de bureau', 'Résumés, tri d’e-mails et extraction de documents.', 26),
  news('n6', 'Automatisation', 'Exemple — Make ajoute de nouveaux connecteurs pour la comptabilité', 'Des intégrations bancaires et comptables supplémentaires.', 30),
  news('n7', 'Économie', 'Exemple — Le moral des chefs de PME se stabilise', 'Les intentions d’investissement repartent légèrement.', 44),
  news('n8', 'Alsace', 'Exemple — Mulhouse lance un programme d’accompagnement numérique', 'Diagnostic gratuit pour les commerces et artisans.', 52),
]

/** Historique fictif : un encaissement client et un abonnement par mois sur les 11 mois précédents. */
function demoHistory() {
  const clients: [string, string][] = [['Cabinet Weber Expertise', 'c3'], ['Garage Schmitt', 'c2'], ['Menuiserie Keller', 'c1'], ['Paysages Fischer', 'c6']]
  const amounts = [1800, 2400, 950, 3200, 2600, 1500, 4100, 2900, 3600, 2200, 4800]
  const transactions: Tables['qonto_transactions'] = []
  const invoices: Tables['qonto_invoices'] = []
  amounts.forEach((amount, i) => {
    const days = (11 - i) * 30 + 50
    const [client, company_id] = clients[i % clients.length]
    const number = `F-2025-${String(i + 1).padStart(3, '0')}`
    transactions.push(
      { id: `h-in-${i}`, account_id: 'acc1', amount, side: 'credit', label: client.toUpperCase(), reference: number, operation_type: 'income', status: 'completed', category: 'Ventes', settled_at: ago(days), emitted_at: ago(days), created_at: ago(days) },
      { id: `h-out-${i}`, account_id: 'acc1', amount: 65 + (i % 3) * 20, side: 'debit', label: i % 2 ? 'Make.com' : 'Supabase', reference: null, operation_type: 'card', status: 'completed', category: 'Logiciels', settled_at: ago(days + 4), emitted_at: ago(days + 4), created_at: ago(days + 4) },
    )
    invoices.push({ id: `h-inv-${i}`, number, status: 'paid', issue_date: day(-days - 12), due_date: day(-days + 18), paid_at: ago(days), total_ttc: amount, vat_amount: 0, client_name: client, client_email: null, qonto_client_id: null, invoice_url: null, company_id, updated_at: ago(days) })
  })
  return { transactions, invoices }
}

/** Jeu de données fictif pour découvrir l'application sans base de données. */
export function demoData(): Tables {
  const now = new Date().toISOString()
  const history = demoHistory()
  return {
    profiles: [
      { id: SACHA, email: 'sacha@slagence.fr', full_name: 'Sacha', color: '#a9c49f', created_at: now },
      { id: LOIC, email: 'loic@slagence.fr', full_name: 'Loïc', color: '#f0a58a', created_at: now },
    ],
    companies: [
      company('c1', 'Menuiserie Keller', 'Colmar', '68000', 'Artisanat', 40, { address: '12 rue des Artisans', siret: '812 345 678 00017', billing_email: 'compta@menuiserie-keller.demo.fr', qonto_client_id: 'qc-keller' }),
      company('c2', 'Garage Schmitt', 'Mulhouse', '68100', 'Automobile', 120, { address: '4 route de Bâle', billing_email: 'marc.schmitt@demo.fr', qonto_client_id: 'qc-schmitt' }),
      company('c3', 'Cabinet Weber Expertise', 'Mulhouse', '68100', 'Comptabilité', 200, { address: '8 place de la Réunion', siret: '529 111 222 00034', vat_number: 'FR12529111222', website: 'weber-expertise.fr', billing_email: 'factures@weber-expertise.demo.fr', qonto_client_id: 'qc-weber', notes: 'Client depuis le premier projet de relances.' }),
      company('c4', 'Boulangerie Meyer', 'Guebwiller', '68500', 'Commerce', 6),
      company('c5', 'Transports Hartmann', 'Strasbourg', '67000', 'Transport', 1),
      company('c6', 'Paysages Fischer', 'Altkirch', '68130', 'Paysagisme', 150),
      company('c7', 'Domaine Kuentz', 'Ribeauvillé', '68150', 'Viticulture', 1),
      company('c8', 'Auto-école Braun', 'Thann', '68800', 'Formation', 70),
    ],
    contacts: [
      contact('p1', 'c1', 'Julien', 'Keller', 'Gérant', '06 11 22 33 44', 40),
      contact('p2', 'c2', 'Marc', 'Schmitt', 'Gérant', '06 55 44 33 22', 120),
      contact('p3', 'c3', 'Claire', 'Weber', 'Associée', '03 89 00 00 00', 200),
      contact('p4', 'c4', 'Anne', 'Meyer', 'Gérante', null, 6, '@boulangerie.meyer'),
      contact('p5', 'c5', 'Thomas', 'Hartmann', 'Directeur', '06 01 02 03 04', 1),
      contact('p6', 'c6', 'Élise', 'Fischer', 'Gérante', '06 77 88 99 00', 150),
      contact('p7', 'c7', 'Paul', 'Kuentz', 'Vigneron', null, 1, '@domaine.kuentz'),
      contact('p8', 'c8', 'Nadia', 'Braun', 'Directrice', '06 12 12 12 12', 70),
    ],
    deals: [
      deal({ id: 'd1', title: 'Transports Hartmann — Tableau de bord flotte', stage: 'nouveau', source: 'formulaire', company_id: 'c5', contact_id: 'p5', need: 'Tableau de bord', message: 'Nous suivons nos tournées sur trois fichiers Excel différents, on perd un temps fou.', created: 0.12, active: 0.12 }),
      deal({ id: 'd2', title: 'Domaine Kuentz — Commandes des cavistes', stage: 'nouveau', source: 'instagram', company_id: 'c7', contact_id: 'p7', need: 'Automatisation', message: 'Vu votre post sur les bons de commande, ça m’intéresse pour mes cavistes.', created: 1, active: 1 }),
      deal({ id: 'd3', title: 'Boulangerie Meyer — Commandes en ligne', stage: 'contacte', source: 'instagram', company_id: 'c4', contact_id: 'p4', need: 'Automatisation', amount: 1800, owner_id: LOIC, created: 6, active: 5 }),
      deal({ id: 'd4', title: 'Garage Schmitt — Relances de devis', stage: 'rdv', source: 'recommandation', company_id: 'c2', contact_id: 'p2', need: 'Relances automatiques', amount: 2400, owner_id: SACHA, created: 21, active: 2 }),
      deal({ id: 'd5', title: 'Paysages Fischer — Planning des chantiers', stage: 'rdv', source: 'prospection', company_id: 'c6', contact_id: 'p6', need: 'Application métier', amount: 3000, owner_id: LOIC, created: 12, active: 1 }),
      deal({ id: 'd6', title: 'Menuiserie Keller — Devis automatiques', stage: 'devis_envoye', source: 'formulaire', company_id: 'c1', contact_id: 'p1', need: 'Documents automatiques', amount: 3600, owner_id: SACHA, followup_count: 1, created: 40, active: 8 }),
      deal({ id: 'd7', title: 'Cabinet Weber — Portail clients', stage: 'gagne', source: 'recommandation', company_id: 'c3', contact_id: 'p3', need: 'Logiciel sur mesure', amount: 6500, owner_id: LOIC, created: 75, active: 30 }),
      deal({ id: 'd8', title: 'Garage Schmitt — Suivi carburant', stage: 'gagne', source: 'prospection', company_id: 'c2', contact_id: 'p2', need: 'Application métier', amount: 1590, owner_id: SACHA, created: 110, active: 62 }),
      deal({ id: 'd9', title: 'Auto-école Braun — Prise de rendez-vous', stage: 'perdu', source: 'formulaire', company_id: 'c8', contact_id: 'p8', need: 'Agenda en ligne', amount: 1200, owner_id: SACHA, lost_reason: 'Budget', created: 70, active: 45 }),
      deal({ id: 'd10', title: 'Paysages Fischer — Site vitrine', stage: 'perdu', source: 'email', company_id: 'c6', contact_id: 'p6', need: 'Site internet', amount: 900, owner_id: LOIC, lost_reason: 'Hors de notre périmètre', created: 33, active: 20 }),
    ],
    projects: [
      { id: 'pr1', name: 'Portail clients', company_id: 'c3', deal_id: 'd7', status: 'en_cours', owner_id: LOIC, start_date: day(-28), due_date: day(20), budget: 6500, description: 'Dépôt de pièces, suivi des dossiers, relances automatiques.', created_at: ago(30) },
      { id: 'pr2', name: 'Relances de factures', company_id: 'c3', deal_id: null, status: 'maintenance', owner_id: SACHA, start_date: day(-190), due_date: day(-160), budget: 2200, description: null, created_at: ago(190) },
      { id: 'pr3', name: 'Suivi carburant', company_id: 'c2', deal_id: 'd8', status: 'maintenance', owner_id: SACHA, start_date: day(-60), due_date: day(-35), budget: 1590, description: 'Saisie des pleins, photos des tickets, export mensuel.', created_at: ago(62) },
      { id: 'pr4', name: 'Tableau de bord atelier', company_id: 'c1', deal_id: null, status: 'en_recette', owner_id: SACHA, start_date: day(-20), due_date: day(6), budget: 1400, description: null, created_at: ago(20) },
    ],
    activities: [
      activity('a1', 'systeme', 'Lead reçu (formulaire)', null, 'd1', null, 0, 3),
      activity('a2', 'instagram', 'Message Instagram', 'Vu votre post sur les bons de commande, ça m’intéresse pour mes cavistes.', 'd2', null, 1),
      activity('a3', 'email_envoye', 'Votre demande — commandes en ligne', 'Bonjour Anne, merci pour votre message…', 'd3', LOIC, 5),
      activity('a4', 'appel', 'Premier échange', 'Perd environ 4 h par semaine à relancer ses devis à la main. Rendez-vous sur place fixé.', 'd4', SACHA, 2),
      activity('a5', 'rdv', 'Visite du dépôt', 'Trois équipes, planning tenu sur tableau blanc. Très demandeuse d’une vue mobile.', 'd5', LOIC, 1),
      activity('a6', 'email_envoye', 'Devis SLA-2026-004', 'Bonjour Julien, vous trouverez le devis en pièce jointe.', 'd6', SACHA, 15),
      activity('a7', 'relance', 'Relance — devis SLA-2026-004', 'Bonjour Julien, avez-vous pu regarder notre proposition ?', 'd6', null, 8),
      activity('a8', 'note', 'Point d’avancement', 'Page de dépôt de pièces validée par Claire, reste le suivi des dossiers.', 'd7', LOIC, 0, 6),
      activity('a9', 'email_recu', 'Re: Portail clients — accès de test', 'Parfait, je fais tester par deux collaborateurs cette semaine.', 'd7', null, 0, 5),
    ].map((a) => ({ ...a, company_id: ({ d1: 'c5', d2: 'c7', d3: 'c4', d4: 'c2', d5: 'c6', d6: 'c1', d7: 'c3' } as Record<string, string>)[a.deal_id!] ?? null })),
    tasks: [
      task('t1', 'Rappeler Thomas Hartmann', 0, SACHA, { deal_id: 'd1', company_id: 'c5' }),
      task('t2', 'Préparer la démonstration pour le garage', 2, SACHA, { deal_id: 'd4', company_id: 'c2' }),
      task('t3', 'Relancer Julien Keller par téléphone', -1, SACHA, { deal_id: 'd6', company_id: 'c1' }),
      task('t4', 'Livrer le suivi des dossiers', 5, LOIC, { company_id: 'c3', project_id: 'pr1' }),
      task('t5', 'Chiffrer le planning des chantiers', 1, LOIC, { deal_id: 'd5', company_id: 'c6' }),
      task('t6', 'Publier le post « avant / après »', 4, LOIC),
      task('t7', 'Recette avec l’atelier Keller', 6, SACHA, { company_id: 'c1', project_id: 'pr4' }),
    ],
    quotes: [
      { id: 'dv1', number: 'SLA-2026-003', status: 'accepte', title: 'Portail clients', company_id: 'c3', contact_id: 'p3', deal_id: 'd7', project_id: 'pr1', issue_date: day(-40), valid_until: day(-10), vat_rate: 0, total_ht: 6500, total_vat: 0, total_ttc: 6500, total_monthly: 59, conditions: DEFAULT_CONDITIONS, notes: null, created_by: LOIC, created_at: ago(40) },
      { id: 'dv2', number: 'SLA-2026-004', status: 'envoye', title: 'Génération automatique des devis', company_id: 'c1', contact_id: 'p1', deal_id: 'd6', project_id: null, issue_date: day(-15), valid_until: day(15), vat_rate: 0, total_ht: 3600, total_vat: 0, total_ttc: 3600, total_monthly: 39, conditions: DEFAULT_CONDITIONS, notes: null, created_by: SACHA, created_at: ago(15) },
      { id: 'dv3', number: null, status: 'brouillon', title: 'Relances de devis automatiques', company_id: 'c2', contact_id: 'p2', deal_id: 'd4', project_id: null, issue_date: day(0), valid_until: day(30), vat_rate: 0, total_ht: 2400, total_vat: 0, total_ttc: 2400, total_monthly: 39, conditions: DEFAULT_CONDITIONS, notes: null, created_by: SACHA, created_at: ago(0, 2) },
    ],
    quote_lines: [
      line('l1', 'dv1', 0, 'Application « Portail clients »', 'Dépôt de pièces, suivi des dossiers, relances automatiques. Installable sur mobile.', 1, null, 6500),
      line('l2', 'dv1', 1, 'Abonnement maintenance & hébergement', 'Hébergement, supervision des automatisations, support, petites évolutions.', 1, null, 59, { billing: 'mensuel' }),
      line('l3', 'dv2', 0, 'Analyse du processus et modèle de devis', 'Atelier d’une demi-journée, reprise de vos tarifs et de vos mentions.', 1, null, 900),
      line('l4', 'dv2', 1, 'Automatisation « formulaire → devis PDF → e-mail »', 'Saisie sur mobile, génération du PDF, envoi au client, relances à J+3 et J+7.', 1, null, 2700),
      line('l5', 'dv2', 2, 'Formation de l’équipe', 'Prise en main sur place, deux heures.', 1, null, 300, { offered: true }),
      line('l6', 'dv2', 3, 'Abonnement maintenance & hébergement', 'Hébergement, opérations Make, support.', 1, null, 39, { billing: 'mensuel' }),
      line('l7', 'dv3', 0, 'Application « Relances de devis »', 'Suivi des devis envoyés, relances automatiques par e-mail et SMS.', 1, null, 2400),
      line('l8', 'dv3', 1, 'Abonnement maintenance & hébergement', null, 1, null, 39, { billing: 'mensuel' }),
    ],
    subscriptions: [
      { id: 'sb1', company_id: 'c3', project_id: 'pr1', label: 'Portail clients — maintenance & hébergement', amount: 59, billing_day: 1, active: true, started_on: day(-28), last_invoiced_month: PREV_MONTH, created_at: ago(28) },
      { id: 'sb2', company_id: 'c3', project_id: 'pr2', label: 'Relances de factures — maintenance', amount: 39, billing_day: 1, active: true, started_on: day(-160), last_invoiced_month: THIS_MONTH, created_at: ago(160) },
      { id: 'sb3', company_id: 'c2', project_id: 'pr3', label: 'Suivi carburant — hébergement & support', amount: 39, billing_day: 5, active: true, started_on: day(-35), last_invoiced_month: PREV_MONTH, created_at: ago(35) },
    ],
    invoice_requests: [
      { id: 'ir1', company_id: 'c3', recipient_email: 'factures@weber-expertise.demo.fr', items: [{ title: 'Relances de factures — maintenance', description: `Abonnement mensuel — ${MONTH_LABEL}`, quantity: 1, unit: 'mois', unit_price: 39, vat_rate: 0 }], issue_date: day(-2), due_date: day(28), terms: null, email_message: null, status: 'envoyee', error: null, qonto_invoice_id: 'inv5', quote_id: null, subscription_id: 'sb2', period: THIS_MONTH, created_by: SACHA, created_at: ago(2), sent_at: ago(2) },
      { id: 'ir2', company_id: 'c1', recipient_email: 'compta@menuiserie-keller.demo.fr', items: [{ title: 'Tableau de bord atelier — solde', description: 'Solde de 50 % à la livraison du tableau de bord.', quantity: 1, unit: 'forfait', unit_price: 700, vat_rate: 0 }], issue_date: day(0), due_date: day(30), terms: 'Paiement à 30 jours par virement.', email_message: null, status: 'brouillon', error: null, qonto_invoice_id: null, quote_id: null, subscription_id: null, period: null, created_by: SACHA, created_at: ago(0, 1), sent_at: null },
    ],
    qonto_accounts: [
      { id: 'acc1', name: 'Compte principal', iban: 'FR76 •••• •••• •••• 0142', balance: 8431.27, currency: 'EUR', updated_at: ago(0, 1) },
    ],
    qonto_transactions: [
      ...history.transactions,
      { id: 'q1', account_id: 'acc1', amount: 2600, side: 'credit', label: 'CABINET WEBER EXPERTISE', reference: 'F-2026-001', operation_type: 'income', status: 'completed', category: 'Ventes', settled_at: ago(20), emitted_at: ago(20), created_at: ago(20) },
      { id: 'q2', account_id: 'acc1', amount: 29, side: 'debit', label: 'Make.com', reference: null, operation_type: 'card', status: 'completed', category: 'Logiciels', settled_at: ago(12), emitted_at: ago(12), created_at: ago(12) },
      { id: 'q3', account_id: 'acc1', amount: 25, side: 'debit', label: 'Supabase', reference: null, operation_type: 'card', status: 'completed', category: 'Logiciels', settled_at: ago(10), emitted_at: ago(10), created_at: ago(10) },
      { id: 'q8', account_id: 'acc1', amount: 64.9, side: 'debit', label: 'Canva Pro', reference: null, operation_type: 'card', status: 'completed', category: 'Marketing', settled_at: ago(6), emitted_at: ago(6), created_at: ago(6) },
      { id: 'q9', account_id: 'acc1', amount: 48.2, side: 'debit', label: 'TotalEnergies', reference: null, operation_type: 'card', status: 'completed', category: 'Déplacements', settled_at: ago(9), emitted_at: ago(9), created_at: ago(9) },
      { id: 'q10', account_id: 'acc1', amount: 21.6, side: 'debit', label: 'Anthropic', reference: null, operation_type: 'card', status: 'completed', category: 'Logiciels', settled_at: ago(4), emitted_at: ago(4), created_at: ago(4) },
      { id: 'q5', account_id: 'acc1', amount: 11, side: 'debit', label: 'Qonto — abonnement', reference: null, operation_type: 'qonto_fee', status: 'completed', category: 'Frais bancaires', settled_at: ago(3), emitted_at: ago(3), created_at: ago(3) },
      { id: 'q7', account_id: 'acc1', amount: 1590, side: 'credit', label: 'GARAGE SCHMITT', reference: 'F-2026-003', operation_type: 'income', status: 'completed', category: 'Ventes', settled_at: ago(1), emitted_at: ago(1), created_at: ago(1) },
    ],
    qonto_invoices: [
      ...history.invoices,
      { id: 'inv1', number: 'F-2026-001', status: 'paid', issue_date: day(-28), due_date: day(2), paid_at: ago(20), total_ttc: 2600, vat_amount: 0, client_name: 'Cabinet Weber Expertise', client_email: 'claire.weber@demo.fr', qonto_client_id: null, invoice_url: null, company_id: 'c3', updated_at: ago(20) },
      { id: 'inv2', number: 'F-2026-002', status: 'unpaid', issue_date: day(-40), due_date: day(-10), paid_at: null, total_ttc: 450, vat_amount: 0, client_name: 'Cabinet Weber Expertise', client_email: 'claire.weber@demo.fr', qonto_client_id: null, invoice_url: null, company_id: 'c3', updated_at: ago(40) },
      { id: 'inv3', number: 'F-2026-003', status: 'paid', issue_date: day(-2), due_date: day(28), paid_at: ago(1), total_ttc: 1590, vat_amount: 0, client_name: 'Garage Schmitt', client_email: 'marc.schmitt@demo.fr', qonto_client_id: null, invoice_url: null, company_id: 'c2', updated_at: ago(1) },
      { id: 'inv5', number: 'F-2026-005', status: 'unpaid', issue_date: day(-2), due_date: day(28), paid_at: null, total_ttc: 39, vat_amount: 0, client_name: 'Cabinet Weber Expertise', client_email: 'factures@weber-expertise.demo.fr', qonto_client_id: 'qc-weber', invoice_url: null, company_id: 'c3', updated_at: ago(2) },
      { id: 'inv4', number: 'F-2026-004', status: 'unpaid', issue_date: day(-1), due_date: day(29), paid_at: null, total_ttc: 1400, vat_amount: 0, client_name: 'Menuiserie Keller', client_email: 'julien.keller@demo.fr', qonto_client_id: null, invoice_url: null, company_id: 'c1', updated_at: ago(1) },
    ],
    instagram_posts: DEMO_POSTS,
    instagram_messages: [
      { id: 'ig1', kind: 'commentaire', username: 'garage.dupont68', text: 'Ça marche aussi pour les rappels de contrôle technique ?', permalink: null, post_id: 'po1', received_at: ago(0, 5), handled: false, reply: null, reply_status: null, replied_by: null, deal_id: null },
      { id: 'ig4', kind: 'commentaire', username: 'camille.vonau', text: 'Super idée ! Vous travaillez aussi avec les cabinets infirmiers ?', permalink: null, post_id: 'po2', received_at: ago(0, 9), handled: false, reply: null, reply_status: null, replied_by: null, deal_id: null },
      { id: 'ig5', kind: 'mention', username: 'cci.alsace.eurometropole', text: 'Retour en images sur l’atelier « IA pour les TPE » avec @sl.agence 👏', permalink: null, post_id: null, received_at: ago(2), handled: false, reply: null, reply_status: null, replied_by: null, deal_id: null },
      { id: 'ig2', kind: 'mention', username: 'boulangerie.meyer', text: 'Merci @sl.agence pour le coup de main !', permalink: null, post_id: null, received_at: ago(3), handled: true, reply: 'Merci à vous Anne, au plaisir !', reply_status: 'sent', replied_by: LOIC, deal_id: 'd3' },
      { id: 'ig3', kind: 'commentaire', username: 'domaine.kuentz', text: 'Vu votre post sur les bons de commande, ça m’intéresse.', permalink: null, post_id: 'po4', received_at: ago(1), handled: true, reply: 'Avec plaisir Paul, on vous écrit en privé.', reply_status: 'sent', replied_by: SACHA, deal_id: 'd2' },
    ],
    instagram_schedule: [
      { id: 'sc1', media_type: 'carrousel', caption: '5 tâches administratives que vous pouvez automatiser dès lundi 👇\n\n#automatisation #TPE #Alsace', media_urls: [], scheduled_at: at(1, 18), status: 'programme', error: null, post_id: null, created_by: LOIC, created_at: ago(1) },
      { id: 'sc2', media_type: 'reel', caption: 'Avant / après : le planning des chantiers de Paysages Fischer, en 30 secondes.', media_urls: [], scheduled_at: at(4, 12), status: 'programme', error: null, post_id: null, created_by: SACHA, created_at: ago(0, 6) },
      { id: 'sc3', media_type: 'photo', caption: 'Ce que coûte vraiment une relance oubliée…', media_urls: [], scheduled_at: null, status: 'brouillon', error: null, post_id: null, created_by: SACHA, created_at: ago(0, 3) },
    ],
    instagram_stats: Array.from({ length: 30 }, (_, i) => ({
      day: day(i - 29),
      followers: 388 + Math.round(i * 2.4) + (i % 3),
      views: 900 + ((i * 271) % 1300) + (i > 22 ? 600 : 0),
      reach: 320 + ((i * 137) % 420) + (i > 22 ? 180 : 0),
      profile_views: 22 + ((i * 17) % 30),
      website_clicks: 2 + ((i * 7) % 9),
      posts: 28 + Math.floor(i / 6),
    })),
    news_items: DEMO_NEWS,
    daily_briefs: [{ day: day(0), created_at: ago(0, 4), content: 'Exemple de point du jour : deux nouveaux leads cette semaine, dont un via Instagram. Côté veille, les outils d’IA se généralisent dans les petites entreprises ; c’est un bon angle pour le prochain post. Pensez à relancer la Menuiserie Keller, sans nouvelles depuis 8 jours.' }],
    calendar_events: [
      { id: 'ev1', owner_id: SACHA, title: 'Démo — Garage Schmitt', location: 'Mulhouse', starts_at: at(0, 14), ends_at: at(0, 15), all_day: false },
      { id: 'ev2', owner_id: LOIC, title: 'Visio — Paysages Fischer', location: 'Google Meet', starts_at: at(0, 16, 30), ends_at: at(0, 17), all_day: false },
      { id: 'ev3', owner_id: SACHA, title: 'Point hebdo SL Agence', location: 'Friesen', starts_at: at(1, 9), ends_at: at(1, 10), all_day: false },
      { id: 'ev4', owner_id: LOIC, title: 'Recette — Portail clients', location: 'Cabinet Weber, Mulhouse', starts_at: at(3, 10), ends_at: at(3, 12), all_day: false },
    ],
    team_notes: [{ id: true, content: 'Cette semaine\n- Finir la démo du garage (Sacha)\n- Tourner le reel Fischer (Loïc)\n- Mettre à jour la plaquette avec les nouveaux tarifs', updated_by: LOIC, updated_at: ago(0, 2) }],
    settings: [{
      id: true, company_name: 'SL Agence', legal_form: 'Sacha Muller — Entrepreneur individuel',
      address: '3 rue Principale', postal_code: '68580', city: 'Friesen', siret: '105 220 677 00014', ape: '62.01Z',
      vat_number: null, email: null, phone: '07 67 08 19 43', website: 'slagence.fr',
      vat_mode: 'franchise', vat_rate: 20, quote_validity_days: 30, quote_conditions: DEFAULT_CONDITIONS, invoice_terms: DEFAULT_INVOICE_TERMS, monthly_goal: 5000,
      urssaf_rate: 24.6, vat_threshold: 37500, revenue_ceiling: 77700, weather_city: 'Friesen', weather_lat: 47.56, weather_lon: 7.15,
      followup_enabled: true, followup_delays: [3, 7, 14], followup_mode: 'brouillon',
      email_signature: 'Sacha et Loïc\nSL Agence — Applications métier, automatisation et IA\n07 67 08 19 43 · slagence.fr',
      prospect_targets: ['cgp', 'formation'], prospect_departments: ['68', '67'], prospect_min_score: 6, prospect_daily_checks: 60,
    }],
    outbox: [],
    prospects: [
      { id: 'pr1', first_name: 'Claire', last_name: 'Martin', email: 'claire@patrimoine-exemple.fr', company: 'Martin Patrimoine', website: null, city: 'Lyon', job_title: 'Conseillère en gestion de patrimoine', info: 'Cabinet indépendant, spécialisé dans la retraite des professions libérales.', cible: 'cgp', status: 'actif', step: 0, history: [], draft_subject: null, draft_body: null, draft_step: null, snooze_until: null, error: null, deal_id: null, batch: 'demo', created_at: ago(1), siren: null, source: 'import', score: null, reason: null, signals: [] },
      { id: 'pr2', first_name: 'Julien', last_name: 'Roux', email: 'julien@formation-exemple.fr', company: 'Roux Formation', website: null, city: 'Nantes', job_title: 'Dirigeant', info: 'Organisme de formation certifié Qualiopi, formations en management.', cible: 'formation', status: 'actif', step: 1, history: [{ step: 1, subject: 'Roux Formation et les émargements', sent_at: ago(5), by: LOIC }], draft_subject: null, draft_body: null, draft_step: null, snooze_until: null, error: null, deal_id: null, batch: 'demo', created_at: ago(6), siren: null, source: 'import', score: null, reason: null, signals: [] },
      { id: 'pr3', first_name: 'Sophie', last_name: 'Bernard', email: 'sophie@courtage-exemple.fr', company: 'Bernard Courtage', website: null, city: 'Bordeaux', job_title: 'Gérante', info: null, cible: 'courtier', status: 'repondu', step: 1, history: [{ step: 1, subject: 'Une question pour Bernard Courtage', sent_at: ago(3), by: LOIC }], draft_subject: null, draft_body: null, draft_step: null, snooze_until: null, error: null, deal_id: null, batch: 'demo', created_at: ago(4), siren: null, source: 'import', score: null, reason: null, signals: [] },
    ],
    prospect_rejects: [
      { id: '900000001', siren: '900000001', name: 'Exemple Conseil Patrimonial', city: 'Colmar', cible: 'cgp', kind: 'site', reason: 'Sans site', website: null, created_at: ago(2) },
      { id: '900000002', siren: '900000002', name: 'Formations Exemple Grand Est', city: 'Strasbourg', cible: 'formation', kind: 'pertinence', reason: 'Peu pertinent (3/10) : organisme rattaché à un réseau national géré par un siège.', website: 'https://formations-exemple.fr/', created_at: ago(2) },
    ],
  }
}
