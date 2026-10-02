import { useEffect, useState } from 'react'
import { ARTIFACT } from './env'
import { callMake } from './make'
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun, type LucideIcon } from 'lucide-react'

export interface Weather {
  temperature: number; feelsLike: number; wind: number; code: number
  days: { date: string; code: number; min: number; max: number; rain: number }[]
  hours: { time: string; temperature: number; code: number }[]
  /** Données d'exemple quand le service météo n'est pas joignable (aperçu hors ligne). */
  example: boolean
}

/** Codes météo de l'OMS utilisés par Open-Meteo → libellé et pictogramme. */
export function describe(code: number): { label: string; icon: LucideIcon } {
  if (code === 0) return { label: 'Ensoleillé', icon: Sun }
  if (code <= 2) return { label: 'Éclaircies', icon: CloudSun }
  if (code === 3) return { label: 'Couvert', icon: Cloud }
  if (code <= 48) return { label: 'Brouillard', icon: CloudFog }
  if (code <= 57) return { label: 'Bruine', icon: CloudDrizzle }
  if (code <= 67 || (code >= 80 && code <= 82)) return { label: 'Pluie', icon: CloudRain }
  if (code <= 77 || code === 85 || code === 86) return { label: 'Neige', icon: CloudSnow }
  return { label: 'Orage', icon: CloudLightning }
}

function example(): Weather {
  const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
  const hour = (n: number) => { const d = new Date(); d.setHours(d.getHours() + n, 0, 0, 0); return d.toISOString() }
  return {
    temperature: 14, feelsLike: 12, wind: 11, code: 2, example: true,
    days: [
      { date: day(0), code: 2, min: 7, max: 16, rain: 10 }, { date: day(1), code: 61, min: 9, max: 13, rain: 70 },
      { date: day(2), code: 3, min: 8, max: 15, rain: 30 }, { date: day(3), code: 0, min: 6, max: 18, rain: 0 },
    ],
    hours: [0, 2, 4, 6, 8, 10].map((n, i) => ({ time: hour(n), temperature: [14, 15, 15, 13, 11, 9][i], code: [2, 2, 1, 3, 3, 61][i] })),
  }
}

const cache = new Map<string, { at: number; data: Promise<Weather> }>()

/** Météo du jour et des 3 jours suivants (Open-Meteo, sans clé), rafraîchie toutes les 30 minutes. */
export function useWeather(lat: number, lon: number): Weather | null {
  const [weather, setWeather] = useState<Weather | null>(null)
  useEffect(() => {
    const key = `${lat},${lon}`
    let hit = cache.get(key)
    if (!hit || Date.now() - hit.at > 30 * 60_000) {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Europe%2FParis&forecast_days=4`
      const raw: Promise<any> = ARTIFACT // eslint-disable-line @typescript-eslint/no-explicit-any
        ? callMake('meteo', { lat, lon }, 30).then((o) => { if (!o.meteo || typeof o.meteo !== 'object') throw new Error(); return o.meteo })
        : fetch(url).then((r) => { if (!r.ok) throw new Error(); return r.json() })
      const data = raw
        .then((j): Weather => {
          const now = Date.now()
          const hours = (j.hourly.time as string[])
            .map((t, i) => ({ time: t, temperature: Math.round(j.hourly.temperature_2m[i]), code: j.hourly.weather_code[i] }))
            .filter((h) => new Date(h.time).getTime() >= now - 3_600_000).filter((_, i) => i % 2 === 0).slice(0, 6)
          return {
            temperature: Math.round(j.current.temperature_2m), feelsLike: Math.round(j.current.apparent_temperature),
            wind: Math.round(j.current.wind_speed_10m), code: j.current.weather_code, example: false, hours,
            days: (j.daily.time as string[]).map((date, i) => ({
              date, code: j.daily.weather_code[i], min: Math.round(j.daily.temperature_2m_min[i]),
              max: Math.round(j.daily.temperature_2m_max[i]), rain: j.daily.precipitation_probability_max[i] ?? 0,
            })),
          }
        })
        .catch(() => example())
      hit = { at: Date.now(), data }
      cache.set(key, hit)
    }
    let alive = true
    hit.data.then((w) => alive && setWeather(w))
    return () => { alive = false }
  }, [lat, lon])
  return weather
}
