import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAction } from '../components/ui'
import { addDays, isoDay } from './format'
import { ARTIFACT } from './env'
import { use, type AssetsApi } from './runtime'
import { useStore } from './store'
import type { Quote } from './types'

type QuoteSeed = Pick<Quote, 'company_id'> & Partial<Pick<Quote, 'contact_id' | 'deal_id' | 'project_id' | 'title'>>

/** Crée un brouillon de devis (réglages par défaut de l'agence) puis ouvre l'éditeur. */
export function useCreateQuote() {
  const { insert, settings, me } = useStore()
  const navigate = useNavigate()
  const run = useAction()
  return useCallback((seed: QuoteSeed) =>
    run(async () => {
      const today = isoDay()
      const quote = await insert('quotes', {
        title: '', contact_id: null, deal_id: null, project_id: null, conditions: settings.quote_conditions, ...seed,
        issue_date: today,
        valid_until: addDays(today, settings.quote_validity_days),
        vat_rate: settings.vat_mode === 'assujetti' ? settings.vat_rate : 0,
        created_by: me?.id ?? null,
      })
      await insert('quote_lines', { quote_id: quote.id, position: 0, description: '', details: null, quantity: 1, unit: null, unit_price: 0, billing: 'unique', offered: false })
      navigate(`/devis/${quote.id}`)
      return quote
    }), [insert, me, navigate, run, settings])
}

/** Envoie une image ou une vidéo de publication : stockage de l'artifact en production, lecture locale en démo. */
export async function uploadMedia(file: File): Promise<string> {
  const assets = ARTIFACT ? await use<AssetsApi>('assets') : null
  if (assets) {
    const { url } = await assets.upload(file)
    return url
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Impossible de lire ce fichier.'))
    reader.readAsDataURL(file)
  })
}
