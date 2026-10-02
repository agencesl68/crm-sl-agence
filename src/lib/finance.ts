import { isoDay } from './format'
import type { QontoTransaction, Tables, Settings } from './types'

export const txDate = (t: QontoTransaction) => t.settled_at ?? t.emitted_at ?? t.created_at

/** Indicateurs financiers de l'agence (micro-entreprise), calculés à partir de Qonto et du CRM. */
export function financeSummary(data: Tables, s: Settings) {
  const now = new Date()
  const year = String(now.getFullYear())
  const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
  const inYear = data.qonto_transactions.filter((t) => isoDay(new Date(txDate(t))).startsWith(year))
  const sum = (rows: QontoTransaction[]) => rows.reduce((a, t) => a + Number(t.amount), 0)

  const revenueYear = sum(inYear.filter((t) => t.side === 'credit'))
  const expensesYear = sum(inYear.filter((t) => t.side === 'debit'))
  const revenueQuarter = sum(data.qonto_transactions.filter((t) => t.side === 'credit' && new Date(txDate(t)) >= quarterStart))
  const contributionsYear = (revenueYear * s.urssaf_rate) / 100
  const contributionsQuarter = (revenueQuarter * s.urssaf_rate) / 100
  const balance = data.qonto_accounts.reduce((a, acc) => a + Number(acc.balance), 0)
  const receivable = data.qonto_invoices.filter((i) => i.status === 'unpaid').reduce((a, i) => a + Number(i.total_ttc), 0)
  const mrr = data.subscriptions.filter((x) => x.active).reduce((a, x) => a + Number(x.amount), 0)

  // Charges récurrentes : même libellé débité au moins deux mois différents sur les 4 derniers mois
  const since = new Date(now.getFullYear(), now.getMonth() - 3, 1)
  const byLabel = new Map<string, { months: Set<string>; total: number; count: number }>()
  data.qonto_transactions.filter((t) => t.side === 'debit' && new Date(txDate(t)) >= since && t.label).forEach((t) => {
    const e = byLabel.get(t.label!) ?? { months: new Set(), total: 0, count: 0 }
    e.months.add(isoDay(new Date(txDate(t))).slice(0, 7)); e.total += Number(t.amount); e.count += 1
    byLabel.set(t.label!, e)
  })
  const recurring = [...byLabel.entries()].filter(([, e]) => e.months.size >= 2)
    .map(([label, e]) => ({ label, monthly: e.total / e.months.size })).sort((a, b) => b.monthly - a.monthly)
  const fixedCosts = recurring.reduce((a, r) => a + r.monthly, 0)

  // Rythme annuel : projection linéaire du CA encaissé depuis le 1er janvier
  const dayOfYear = Math.max(1, Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86_400_000))
  const projectedYear = (revenueYear / dayOfYear) * 365

  // Dépenses de l'année par catégorie
  const categories = new Map<string, number>()
  inYear.filter((t) => t.side === 'debit').forEach((t) => categories.set(t.category ?? 'Autres', (categories.get(t.category ?? 'Autres') ?? 0) + Number(t.amount)))

  return {
    revenueYear, expensesYear, revenueQuarter, contributionsYear, contributionsQuarter,
    netYear: revenueYear - expensesYear - contributionsYear,
    balance, receivable, mrr, recurring, fixedCosts, projectedYear,
    forecast90: balance + receivable + mrr * 3 - fixedCosts * 3 - contributionsQuarter,
    vatShare: s.vat_threshold > 0 ? revenueYear / s.vat_threshold : 0,
    ceilingShare: s.revenue_ceiling > 0 ? revenueYear / s.revenue_ceiling : 0,
    categories: [...categories.entries()].map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total),
  }
}
