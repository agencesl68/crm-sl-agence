export type Stage = 'nouveau' | 'contacte' | 'rdv' | 'devis_envoye' | 'gagne' | 'perdu'
export type Source = 'formulaire' | 'instagram' | 'email' | 'recommandation' | 'prospection' | 'autre'
export type ProjectStatus = 'a_demarrer' | 'en_cours' | 'en_recette' | 'livre' | 'maintenance'
export type QuoteStatus = 'brouillon' | 'envoye' | 'accepte' | 'refuse'
export type InvoiceStatus = 'draft' | 'unpaid' | 'paid' | 'canceled'
export type ActivityType =
  | 'note' | 'appel' | 'rdv' | 'email_recu' | 'email_envoye' | 'relance' | 'instagram' | 'systeme'

export interface Profile { id: string; email: string; full_name: string; color: string; created_at: string }

export interface Company {
  id: string; name: string; client_type: 'entreprise' | 'particulier'
  siret: string | null; vat_number: string | null; billing_email: string | null
  address: string | null; postal_code: string | null; city: string | null; country: string
  qonto_client_id: string | null; website: string | null; sector: string | null; notes: string | null; created_at: string
}

export interface Contact {
  id: string; company_id: string | null; first_name: string; last_name: string
  email: string | null; phone: string | null; job_title: string | null
  instagram: string | null; notes: string | null; created_at: string
}

export interface Deal {
  id: string; title: string; company_id: string | null; contact_id: string | null
  stage: Stage; source: Source; need: string | null; message: string | null
  amount: number | null; owner_id: string | null
  followup_count: number; followups_paused: boolean; last_activity_at: string
  lost_reason: string | null; closed_at: string | null; created_at: string
  /** Référence de la demande d'origine (formulaire du site) pour ne pas l'importer deux fois. */
  external_ref?: string | null
}

export interface Project {
  id: string; name: string; company_id: string | null; deal_id: string | null
  status: ProjectStatus; owner_id: string | null; start_date: string | null; due_date: string | null
  budget: number | null; description: string | null; created_at: string
}

export interface Activity {
  id: string; type: ActivityType; subject: string | null; body: string | null
  deal_id: string | null; company_id: string | null; contact_id: string | null
  author_id: string | null; external_id: string | null; occurred_at: string; created_at: string
}

export interface Task {
  id: string; title: string; due_date: string | null; done: boolean; done_at: string | null
  assignee_id: string | null; deal_id: string | null; company_id: string | null
  project_id: string | null; created_at: string
}

export interface Quote {
  id: string; number: string | null; status: QuoteStatus; title: string
  company_id: string; contact_id: string | null; deal_id: string | null; project_id: string | null
  issue_date: string; valid_until: string | null
  vat_rate: number; total_ht: number; total_vat: number; total_ttc: number; total_monthly: number
  conditions: string | null; notes: string | null; created_by: string | null; created_at: string
}

export interface QuoteLine {
  id: string; quote_id: string; position: number; description: string; details: string | null
  quantity: number; unit: string | null; unit_price: number
  billing: 'unique' | 'mensuel'; offered: boolean
}

export interface QontoAccount {
  id: string; name: string | null; iban: string | null; balance: number; currency: string; updated_at: string
}

export interface QontoTransaction {
  id: string; account_id: string | null; amount: number; side: 'credit' | 'debit'
  label: string | null; reference: string | null; operation_type: string | null; status: string | null
  category: string | null; settled_at: string | null; emitted_at: string | null; created_at: string
}

/** Facture client émise dans Qonto (copie en lecture seule). */
export interface QontoInvoice {
  id: string; number: string | null; status: InvoiceStatus
  issue_date: string | null; due_date: string | null; paid_at: string | null
  total_ttc: number; vat_amount: number; client_name: string | null; client_email: string | null
  qonto_client_id: string | null; invoice_url: string | null; company_id: string | null; updated_at: string
}

export type MediaType = 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'REELS'

export interface InstagramPost {
  id: string; media_type: MediaType; caption: string | null; media_url: string | null; thumbnail_url: string | null
  permalink: string | null; posted_at: string
  views: number; reach: number; likes: number; comments: number; saves: number; shares: number; updated_at: string
}

export interface Subscription {
  id: string; company_id: string; project_id: string | null; label: string; amount: number
  billing_day: number; active: boolean; started_on: string; last_invoiced_month: string | null; created_at: string
}

export interface InvoiceItem {
  title: string; description: string; quantity: number; unit: string; unit_price: number; vat_rate: number
  /** Ligne offerte : affichée sur la facture avec une remise de 100 %. */
  offered?: boolean
}

export interface InvoiceRequest {
  id: string; company_id: string; recipient_email: string | null; items: InvoiceItem[]
  issue_date: string; due_date: string; terms: string | null; email_message: string | null
  status: 'brouillon' | 'a_envoyer' | 'envoyee' | 'erreur'; error: string | null
  qonto_invoice_id: string | null; quote_id: string | null; subscription_id: string | null; period: string | null
  created_by: string | null; created_at: string; sent_at: string | null
}

export interface InstagramMessage {
  id: string; kind: 'commentaire' | 'mention' | 'message'; username: string | null; text: string | null
  permalink: string | null; post_id: string | null; received_at: string; handled: boolean
  reply: string | null; reply_status: 'pending' | 'sent' | 'error' | null; replied_by: string | null; deal_id: string | null
}

export interface InstagramScheduled {
  id: string; media_type: 'photo' | 'carrousel' | 'reel'; caption: string; media_urls: string[]
  scheduled_at: string | null; status: 'brouillon' | 'programme' | 'publie' | 'erreur'; error: string | null
  post_id: string | null; created_by: string | null; created_at: string
}

export interface InstagramStat {
  day: string; followers: number | null; views: number | null; reach: number | null
  profile_views: number | null; website_clicks: number | null; posts: number | null
}

export interface NewsItem {
  id: string; title: string; source: string | null; url: string | null; summary: string | null
  category: 'IA' | 'Automatisation' | 'Économie' | 'Alsace'; published_at: string
}

export interface DailyBrief { day: string; content: string; created_at: string }

export interface CalendarEvent {
  id: string; owner_id: string | null; title: string; location: string | null
  starts_at: string; ends_at: string | null; all_day: boolean
}

export interface TeamNote { id: boolean; content: string; updated_by: string | null; updated_at: string }

export interface Settings {
  id: boolean; company_name: string; legal_form: string | null
  address: string | null; postal_code: string | null; city: string | null
  siret: string | null; ape: string | null; vat_number: string | null
  email: string | null; phone: string | null; website: string | null
  vat_mode: 'franchise' | 'assujetti'; vat_rate: number
  quote_validity_days: number; quote_conditions: string; invoice_terms: string; monthly_goal: number
  urssaf_rate: number; vat_threshold: number; revenue_ceiling: number
  weather_city: string; weather_lat: number; weather_lon: number
  followup_enabled: boolean; followup_delays: number[]; followup_mode: 'brouillon' | 'envoi'
  email_signature: string
}

export interface OutboxItem {
  id: string; to_email: string; subject: string; body: string; kind: 'email' | 'relance'
  deal_id: string | null; contact_id: string | null
  status: 'pending' | 'sent' | 'error'; error: string | null
  created_by: string | null; created_at: string; sent_at: string | null
}

/** Cible de prospection par e-mail : décide du constat, de l'exemple et du ton du message. */
export type Cible = 'cgp' | 'formation' | 'courtier' | 'immobilier' | 'comptable' | 'autre'
/** actif : dans la séquence (étape 0 à 3) ; les autres statuts sortent le prospect de la séquence. */
export type ProspectStatus = 'actif' | 'repondu' | 'pas_interesse' | 'stop'

export interface ProspectSend { step: number; subject: string; sent_at: string; by: string | null }

/** Prospect contacté par e-mail à froid (onglet Prospection), distinct des leads du pipeline. */
export interface Prospect {
  id: string; first_name: string; last_name: string; email: string; company: string
  website: string | null; city: string | null; job_title: string | null
  /** Ce que l'on sait de l'entreprise (activité, spécialité) : sert à personnaliser le premier message. */
  info: string | null
  cible: Cible; status: ProspectStatus
  /** Nombre de messages déjà envoyés : 0 à contacter, 1 premier mail, 2 relance, 3 séquence terminée. */
  step: number
  history: ProspectSend[]
  draft_subject: string | null; draft_body: string | null; draft_step: number | null
  /** Écarté de la file jusqu'à cette date (AAAA-MM-JJ). */
  snooze_until: string | null
  error: string | null; deal_id: string | null; batch: string | null; created_at: string
}

export interface Tables {
  profiles: Profile[]
  companies: Company[]
  contacts: Contact[]
  deals: Deal[]
  projects: Project[]
  activities: Activity[]
  tasks: Task[]
  quotes: Quote[]
  quote_lines: QuoteLine[]
  qonto_accounts: QontoAccount[]
  qonto_transactions: QontoTransaction[]
  qonto_invoices: QontoInvoice[]
  subscriptions: Subscription[]
  invoice_requests: InvoiceRequest[]
  instagram_posts: InstagramPost[]
  instagram_messages: InstagramMessage[]
  instagram_schedule: InstagramScheduled[]
  instagram_stats: InstagramStat[]
  news_items: NewsItem[]
  daily_briefs: DailyBrief[]
  calendar_events: CalendarEvent[]
  team_notes: TeamNote[]
  settings: Settings[]
  outbox: OutboxItem[]
  prospects: Prospect[]
}
export type TableName = keyof Tables
export type Row<T extends TableName> = Tables[T][number]
