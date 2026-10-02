import { useMemo } from 'react'
import { FOLLOWUP_STAGES } from './constants'
import { daysSince, isoDay } from './format'
import { useStore } from './store'
import type { Deal, QontoInvoice, Settings } from './types'

const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]))

/** Accès direct aux fiches par identifiant. */
export function useLookups() {
  const { data } = useStore()
  return useMemo(() => ({
    company: byId(data.companies),
    contact: byId(data.contacts),
    profile: byId(data.profiles),
    deal: byId(data.deals),
    project: byId(data.projects),
  }), [data.companies, data.contacts, data.profiles, data.deals, data.projects])
}

/** Même règle que la vue SQL followups_due : le lead attend une relance. */
export function followupDue(deal: Deal, s: Settings): boolean {
  if (!s.followup_enabled || deal.followups_paused || !FOLLOWUP_STAGES.includes(deal.stage)) return false
  const delay = s.followup_delays[deal.followup_count]
  return delay !== undefined && daysSince(deal.last_activity_at) >= delay
}

export const isOverdue = (i: QontoInvoice) => i.status === 'unpaid' && !!i.due_date && i.due_date < isoDay()

/** Montant hors taxes d'une facture Qonto. */
export const invoiceHt = (i: QontoInvoice) => Number(i.total_ttc) - Number(i.vat_amount)
