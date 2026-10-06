import { useEffect, useMemo, useState } from 'react'
import { Landmark, RefreshCw, Repeat } from 'lucide-react'
import { Progress } from '../components/charts'
import { Badge, Button, Card, Empty, PageHeader, Tabs } from '../components/ui'
import { CountUp } from '../lib/effects'
import { financeSummary, txDate } from '../lib/finance'
import { ago, eur, eur0, fmtDate, isoDay } from '../lib/format'
import { useStore } from '../lib/store'
import { due, SYNC_ENABLED, useQontoSync } from '../lib/sync'

const monthFmt = new Intl.DateTimeFormat('fr-FR', { month: 'short' })
const monthYearFmt = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })

function Tile({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: 'up' | 'down' }) {
  return (
    <div className="surface spot lift rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-[13px] font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-[26px] font-semibold tracking-tight tabular-nums ${tone === 'down' ? 'text-rose-700' : 'text-slate-900'}`}><CountUp value={value} format={eur0} /></p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

export function Finances() {
  const { data, settings } = useStore()
  const syncQonto = useQontoSync()
  useEffect(() => { if (SYNC_ENABLED && due('qonto', 60)) void syncQonto(true) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [filter, setFilter] = useState<'all' | 'credit' | 'debit'>('all')
  const f = financeSummary(data, settings)
  const updated = data.qonto_accounts.map((a) => a.updated_at).sort().at(-1)

  // Encaissements et dépenses des 12 derniers mois
  const months = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const tx = data.qonto_transactions.filter((t) => isoDay(new Date(txDate(t))).startsWith(key))
      const sum = (side: string) => tx.filter((t) => t.side === side).reduce((s, t) => s + Number(t.amount), 0)
      return { key, label: monthFmt.format(d).replace('.', ''), full: monthYearFmt.format(d), credit: sum('credit'), debit: sum('debit') }
    })
  }, [data.qonto_transactions])
  const peak = Math.max(1, ...months.flatMap((m) => [m.credit, m.debit]))
  const catPeak = Math.max(1, ...f.categories.map((c) => c.total))

  const transactions = data.qonto_transactions
    .filter((t) => filter === 'all' || t.side === filter)
    .sort((a, b) => txDate(b).localeCompare(txDate(a)))
    .slice(0, 60)

  if (data.qonto_accounts.length === 0 && data.qonto_transactions.length === 0) {
    return (
      <>
        <PageHeader title="Finances">{SYNC_ENABLED && <Button variant="primary" icon={RefreshCw} onClick={() => syncQonto()}>Synchroniser Qonto</Button>}</PageHeader>
        <Card><Empty icon={Landmark} title={SYNC_ENABLED ? 'Pas encore de données Qonto' : "Qonto n'est pas encore relié"}>Dès que le scénario Make « CRM — Qonto » tourne, le solde, les opérations et les factures apparaissent ici (lecture seule : aucun virement ne part du CRM).</Empty></Card>
      </>
    )
  }

  // Au rythme actuel, mois où le seuil de franchise de TVA serait atteint
  const perDay = f.revenueYear / Math.max(1, Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 86_400_000))
  const vatDate = perDay > 0 && f.revenueYear < settings.vat_threshold ? new Date(Date.now() + ((settings.vat_threshold - f.revenueYear) / perDay) * 86_400_000) : null

  return (
    <>
      <PageHeader title="Finances" subtitle={updated ? `Synchronisé avec Qonto ${ago(updated)} · lecture seule` : 'Lecture seule'}>
        {SYNC_ENABLED && <Button icon={RefreshCw} onClick={() => syncQonto()}>Synchroniser Qonto</Button>}
      </PageHeader>

      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Solde disponible" value={f.balance} hint={`${data.qonto_accounts.length} compte${data.qonto_accounts.length > 1 ? 's' : ''} Qonto`} />
        <Tile label={`CA encaissé ${new Date().getFullYear()}`} value={f.revenueYear} hint={`Projection sur l'année : ${eur0(f.projectedYear)}`} />
        <Tile label="Dépenses de l'année" value={f.expensesYear} hint={`Charges fixes : ${eur0(f.fixedCosts)} / mois`} />
        <Tile label="Résultat net estimé" value={f.netYear} hint="Après cotisations et dépenses" tone={f.netYear < 0 ? 'down' : undefined} />
      </div>

      <div className="stagger mt-3 grid gap-3 lg:grid-cols-3">
        <Card title="Encaissements et dépenses — 12 mois" className="lg:col-span-2">
          <div className="flex h-48 items-end gap-2" role="img" aria-label={months.map((m) => `${m.full} : ${eur0(m.credit)} encaissés, ${eur0(m.debit)} dépensés`).join(' ; ')}>
            {months.map((m) => (
              <div key={m.key} className="group relative flex h-full flex-1 flex-col justify-end">
                <div className="flex flex-1 items-end justify-center gap-[2px]">
                  <div className="grow-y w-[38%] max-w-4 rounded-t bg-vert" style={{ height: `${(m.credit / peak) * 100}%` }} />
                  <div className="grow-y w-[38%] max-w-4 rounded-t bg-slate-300" style={{ height: `${(m.debit / peak) * 100}%` }} />
                </div>
                <p className="mt-1.5 text-center text-[11px] text-slate-500">{m.label}</p>
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg group-hover:block">
                  <p className="font-semibold first-letter:uppercase">{m.full}</p>
                  <p>+ {eur0(m.credit)} · − {eur0(m.debit)}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 flex gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-vert" />Encaissements</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-slate-300" />Dépenses</span>
          </p>
        </Card>

        <Card title="Micro-entreprise">
          <div className="space-y-4">
            <div>
              <div className="mb-1 flex justify-between text-sm"><span className="text-slate-600">Seuil de franchise TVA</span><span className="font-semibold tabular-nums">{Math.round(f.vatShare * 100)} %</span></div>
              <Progress value={f.revenueYear} total={settings.vat_threshold} label="Part du seuil de franchise de TVA atteinte" />
              <p className="mt-1 text-xs text-slate-500">{eur0(f.revenueYear)} sur {eur0(settings.vat_threshold)}{vatDate && ` · au rythme actuel, atteint en ${monthYearFmt.format(vatDate)}`}</p>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-sm"><span className="text-slate-600">Plafond de chiffre d'affaires</span><span className="font-semibold tabular-nums">{Math.round(f.ceilingShare * 100)} %</span></div>
              <Progress value={f.revenueYear} total={settings.revenue_ceiling} label="Part du plafond de chiffre d'affaires atteinte" />
              <p className="mt-1 text-xs text-slate-500">{eur0(f.revenueYear)} sur {eur0(settings.revenue_ceiling)}</p>
            </div>
            <dl className="space-y-1.5 border-t border-slate-200 pt-3 text-sm">
              <div className="flex justify-between"><dt className="text-slate-600">Cotisations de l'année ({settings.urssaf_rate.toLocaleString('fr-FR')} %)</dt><dd className="font-semibold tabular-nums">{eur0(f.contributionsYear)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-600">À provisionner ce trimestre</dt><dd className="font-semibold tabular-nums">{eur0(f.contributionsQuarter)}</dd></div>
            </dl>
            <p className="text-[11px] leading-relaxed text-slate-500">Estimations à partir des encaissements Qonto. Taux et seuils modifiables dans Réglages ; vérifiez-les chaque année auprès de l'URSSAF.</p>
          </div>
        </Card>
      </div>

      <div className="stagger mt-3 grid gap-3 lg:grid-cols-3">
        <Card title="Trésorerie prévue à 90 jours">
          <p className="text-3xl font-semibold tracking-tight tabular-nums text-slate-900"><CountUp value={f.forecast90} format={eur0} /></p>
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-slate-600">Solde actuel</dt><dd className="tabular-nums">{eur0(f.balance)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-600">Factures à encaisser</dt><dd className="tabular-nums text-emerald-700">+ {eur0(f.receivable)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-600">Abonnements clients (3 mois)</dt><dd className="tabular-nums text-emerald-700">+ {eur0(f.mrr * 3)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-600">Charges fixes (3 mois)</dt><dd className="tabular-nums">− {eur0(f.fixedCosts * 3)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-600">Cotisations du trimestre</dt><dd className="tabular-nums">− {eur0(f.contributionsQuarter)}</dd></div>
          </dl>
        </Card>
        <Card title="Dépenses par catégorie">
          {f.categories.length === 0 ? <p className="text-sm text-slate-500">Aucune dépense cette année.</p> : (
            <ul className="space-y-2.5">
              {f.categories.map((c) => (
                <li key={c.label}>
                  <div className="flex justify-between text-sm"><span className="text-slate-700">{c.label}</span><span className="font-semibold tabular-nums">{eur0(c.total)}</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="grow-x h-full rounded-full bg-vert" style={{ width: `${(c.total / catPeak) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={<span className="flex items-center gap-2"><Repeat size={14} className="text-vert" aria-hidden />Abonnements et charges fixes</span>}>
          {f.recurring.length === 0 ? <p className="text-sm text-slate-500">Aucune charge récurrente détectée.</p> : (
            <ul className="divide-y divide-slate-100">
              {f.recurring.map((r) => (
                <li key={r.label} className="flex items-center justify-between py-2 text-sm"><span className="truncate text-slate-700">{r.label}</span><span className="tabular-nums font-medium">{eur(r.monthly)} / mois</span></li>
              ))}
              <li className="flex items-center justify-between pt-2 text-sm font-semibold"><span>Total</span><span className="tabular-nums">{eur(f.fixedCosts)} / mois</span></li>
            </ul>
          )}
        </Card>
      </div>

      <div className="mb-3 mt-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="eyebrow text-sauge">Opérations</h2>
        <Tabs value={filter} onChange={setFilter} tabs={[{ id: 'all', label: 'Tout' }, { id: 'credit', label: 'Encaissements' }, { id: 'debit', label: 'Dépenses' }]} />
      </div>
      <Card flush>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200">
              <tr><th className="eyebrow px-4 py-3 text-slate-500">Date</th><th className="eyebrow px-4 py-3 text-slate-500">Libellé</th><th className="eyebrow px-4 py-3 text-slate-500">Catégorie</th><th className="eyebrow px-4 py-3 text-right text-slate-500">Montant</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fmtDate(txDate(t))}</td>
                  <td className="px-4 py-3"><p className="font-medium text-slate-900">{t.label ?? '—'}</p>{t.reference && <p className="text-xs text-slate-500">{t.reference}</p>}</td>
                  <td className="px-4 py-3">{t.category ? <Badge>{t.category}</Badge> : <span className="text-slate-400">—</span>}</td>
                  <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${t.side === 'credit' ? 'text-emerald-700' : 'text-slate-900'}`}>{t.side === 'credit' ? '+' : '−'} {eur(t.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {transactions.length === 0 && <p className="p-4 text-sm text-slate-500">Aucune opération.</p>}
      </Card>
    </>
  )
}
