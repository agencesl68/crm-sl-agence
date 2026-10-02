import { useState, type FormEvent } from 'react'
import { Avatar, Button, Card, Field, Input, PageHeader, Select, TextField, Textarea, useAction } from '../components/ui'
import { useStore } from '../lib/store'
import type { Settings } from '../lib/types'

export function SettingsPage() {
  const { settings, update, data, me } = useStore()
  const run = useAction()
  const [form, setFormState] = useState({ ...settings, followup_delays_text: settings.followup_delays.join(', ') })
  const set = (patch: Partial<typeof form>) => setFormState((f) => ({ ...f, ...patch }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const { id: _id, followup_delays_text, ...rest } = form
    const delays = followup_delays_text.split(/[,;\s]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0)
    const text = (v: string | null) => (v && v.trim()) || null
    const patch: Partial<Settings> = {
      ...rest,
      legal_form: text(rest.legal_form), address: text(rest.address), postal_code: text(rest.postal_code), city: text(rest.city),
      siret: text(rest.siret), ape: text(rest.ape), vat_number: text(rest.vat_number), email: text(rest.email), phone: text(rest.phone), website: text(rest.website),
      monthly_goal: Number(rest.monthly_goal) || 0,
      urssaf_rate: Number(rest.urssaf_rate) || 0, vat_threshold: Number(rest.vat_threshold) || 0, revenue_ceiling: Number(rest.revenue_ceiling) || 0,
      weather_lat: Number(rest.weather_lat) || 0, weather_lon: Number(rest.weather_lon) || 0,
      vat_rate: Number(rest.vat_rate) || 0,
      quote_validity_days: Number(rest.quote_validity_days) || 0,
      followup_delays: delays,
    }
    await run(() => update('settings', true, patch), 'Réglages enregistrés')
  }

  return (
    <form onSubmit={submit}>
      <PageHeader title="Réglages">
        <Button type="submit" variant="primary">Enregistrer</Button>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Agence (en-tête des devis)">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Dénomination" form={form} set={set} name="company_name" required />
            <TextField label="Forme juridique" form={form} set={set} name="legal_form" placeholder="SAS au capital de 1 000 €" />
            <TextField label="Adresse" form={form} set={set} name="address" className="sm:col-span-2" />
            <TextField label="Code postal" form={form} set={set} name="postal_code" />
            <TextField label="Ville" form={form} set={set} name="city" />
            <TextField label="SIRET" form={form} set={set} name="siret" />
            <TextField label="Code APE" form={form} set={set} name="ape" />
            <TextField label="N° TVA intracommunautaire" form={form} set={set} name="vat_number" />
            <TextField label="E-mail" form={form} set={set} name="email" type="email" />
            <TextField label="Téléphone" form={form} set={set} name="phone" />
            <TextField label="Site web" form={form} set={set} name="website" />
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Devis et factures">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Régime de TVA" className="sm:col-span-2">
                {(id) => (
                  <Select id={id} value={form.vat_mode} onChange={(e) => set({ vat_mode: e.target.value as Settings['vat_mode'] })}>
                    <option value="franchise">Franchise en base (TVA non applicable, art. 293 B du CGI)</option>
                    <option value="assujetti">Assujetti à la TVA</option>
                  </Select>
                )}
              </Field>
              {form.vat_mode === 'assujetti' && <TextField label="Taux de TVA par défaut (%)" form={form} set={set} name="vat_rate" type="number" />}
              <TextField label="Validité des devis (jours)" form={form} set={set} name="quote_validity_days" type="number" />
              <TextField label="Objectif de facturation mensuelle HT (€)" form={form} set={set} name="monthly_goal" type="number" hint="Affiché sur le tableau de bord." />
              <Field label="Conditions par défaut des devis" className="sm:col-span-2">{(id) => <Textarea id={id} rows={3} value={form.quote_conditions} onChange={(e) => set({ quote_conditions: e.target.value })} />}</Field>
              <Field label="Conditions par défaut des factures" hint="525 caractères au maximum (limite de Qonto)." className="sm:col-span-2">{(id) => <Textarea id={id} rows={3} maxLength={525} value={form.invoice_terms} onChange={(e) => set({ invoice_terms: e.target.value })} />}</Field>
            </div>
          </Card>

          <Card title="Finances (micro-entreprise)">
            <div className="grid gap-3 sm:grid-cols-3">
              <TextField label="Taux de cotisations (%)" form={form} set={set} name="urssaf_rate" type="number" />
              <TextField label="Seuil franchise TVA (€)" form={form} set={set} name="vat_threshold" type="number" />
              <TextField label="Plafond de CA (€)" form={form} set={set} name="revenue_ceiling" type="number" />
            </div>
            <p className="mt-2 text-xs text-slate-500">Servent aux estimations de la page Finances. À vérifier chaque année sur urssaf.fr.</p>
          </Card>

          <Card title="Météo du tableau de bord">
            <div className="grid gap-3 sm:grid-cols-3">
              <TextField label="Ville affichée" form={form} set={set} name="weather_city" />
              <TextField label="Latitude" form={form} set={set} name="weather_lat" type="number" />
              <TextField label="Longitude" form={form} set={set} name="weather_lon" type="number" />
            </div>
          </Card>

          <Card title="Relances automatiques">
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm text-slate-800">
                <input type="checkbox" checked={form.followup_enabled} onChange={(e) => set({ followup_enabled: e.target.checked })} className="h-4 w-4 accent-vert" />
                Relancer les leads « Contacté » et « Devis envoyé » restés sans réponse
              </label>
              <Field label="Délais entre les relances (jours)" hint="Ex. : 3, 7, 14 → trois relances, puis le lead n'est plus relancé.">
                {(id) => <Input id={id} value={form.followup_delays_text} onChange={(e) => set({ followup_delays_text: e.target.value })} />}
              </Field>
              <Field label="Mode">
                {(id) => (
                  <Select id={id} value={form.followup_mode} onChange={(e) => set({ followup_mode: e.target.value as Settings['followup_mode'] })}>
                    <option value="brouillon">Préparer un brouillon dans Gmail (à valider)</option>
                    <option value="envoi">Envoyer automatiquement</option>
                  </Select>
                )}
              </Field>
              <Field label="Signature des e-mails">{(id) => <Textarea id={id} value={form.email_signature} onChange={(e) => set({ email_signature: e.target.value })} />}</Field>
            </div>
          </Card>

          <Card title="Équipe">
            <ul className="space-y-2">
              {data.profiles.map((p) => (
                <li key={p.id} className="flex items-center gap-3 text-sm">
                  <Avatar profile={p} size={28} />
                  <span className="font-medium text-slate-900">{p.full_name}</span>
                  <span className="text-slate-500">{p.email}</span>
                  {p.id === me?.id && (
                    <input type="color" aria-label="Ma couleur" value={p.color} onChange={(e) => run(() => update('profiles', p.id, { color: e.target.value }))} className="ml-auto h-7 w-9 cursor-pointer rounded border border-slate-300" />
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </form>
  )
}
