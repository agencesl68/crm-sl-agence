import type { ActivityType, InvoiceStatus, ProjectStatus, QuoteStatus, Source, Stage } from './types'

export const STAGES: { id: Stage; label: string; dot: string }[] = [
  { id: 'nouveau', label: 'Nouveau', dot: 'bg-sky-500' },
  { id: 'contacte', label: 'Contacté', dot: 'bg-indigo-500' },
  { id: 'rdv', label: 'Rendez-vous', dot: 'bg-violet-500' },
  { id: 'devis_envoye', label: 'Devis envoyé', dot: 'bg-amber-500' },
  { id: 'gagne', label: 'Gagné', dot: 'bg-emerald-500' },
  { id: 'perdu', label: 'Perdu', dot: 'bg-slate-400' },
]
export const OPEN_STAGES: Stage[] = ['nouveau', 'contacte', 'rdv', 'devis_envoye']
export const FOLLOWUP_STAGES: Stage[] = ['contacte', 'devis_envoye']
export const stageLabel = (s: Stage) => STAGES.find((x) => x.id === s)?.label ?? s

export const SOURCES: { id: Source; label: string }[] = [
  { id: 'formulaire', label: 'Formulaire du site' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'email', label: 'E-mail' },
  { id: 'recommandation', label: 'Recommandation' },
  { id: 'prospection', label: 'Prospection' },
  { id: 'autre', label: 'Autre' },
]
export const sourceLabel = (s: Source) => SOURCES.find((x) => x.id === s)?.label ?? s

export const PROJECT_STATUSES: { id: ProjectStatus; label: string; dot: string }[] = [
  { id: 'a_demarrer', label: 'À démarrer', dot: 'bg-slate-400' },
  { id: 'en_cours', label: 'En cours', dot: 'bg-sky-500' },
  { id: 'en_recette', label: 'En recette', dot: 'bg-amber-500' },
  { id: 'livre', label: 'Livré', dot: 'bg-emerald-500' },
  { id: 'maintenance', label: 'Maintenance', dot: 'bg-violet-500' },
]

export const QUOTE_STATUS: Record<QuoteStatus, { label: string; tone: Tone }> = {
  brouillon: { label: 'Brouillon', tone: 'slate' },
  envoye: { label: 'Envoyé', tone: 'sky' },
  accepte: { label: 'Accepté', tone: 'emerald' },
  refuse: { label: 'Refusé', tone: 'rose' },
}

export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Brouillon', tone: 'slate' },
  unpaid: { label: 'À encaisser', tone: 'sky' },
  paid: { label: 'Payée', tone: 'emerald' },
  canceled: { label: 'Annulée', tone: 'slate' },
}

export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  note: 'Note',
  appel: 'Appel',
  rdv: 'Rendez-vous',
  email_recu: 'E-mail reçu',
  email_envoye: 'E-mail envoyé',
  relance: 'Relance',
  instagram: 'Instagram',
  systeme: 'Système',
}

export type Tone = 'slate' | 'sky' | 'emerald' | 'amber' | 'rose' | 'violet'
