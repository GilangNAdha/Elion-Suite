import { useEffect, useState } from 'react'
import { CloudSun, RefreshCw, MapPin } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'
import { IconBtn } from '../ui'

interface Weather {
  temp: number
  high: number
  low: number
  code: number
}
const cache = new Map<string, { at: number; data: Weather }>()
const label = (code: number) =>
  code === 0
    ? 'Clear skies'
    : code <= 3
      ? 'Partly cloudy'
      : code <= 48
        ? 'Foggy'
        : code <= 67
          ? 'Rain'
          : code <= 77
            ? 'Snow'
            : code <= 82
              ? 'Rain showers'
              : 'Thunderstorms'

/** Shared by Dashboard and Lockdown, with a short in-memory forecast cache. */
export function WeatherWidget() {
  const { lat, lon, city } = useSettingsStore((s) => s.weather)
  const [data, setData] = useState<Weather | null>(null)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const key = `${lat},${lon}`
    const hit = cache.get(key)
    setData(null)
    setError(false)
    if (hit && Date.now() - hit.at < 15 * 60000) {
      setData(hit.data)
      return
    }
    const controller = new AbortController()
    let alive = true
    const timeout = setTimeout(() => controller.abort(), 10000)
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto`,
      { signal: controller.signal }
    )
      .then((response) => {
        if (!response.ok) throw new Error('Weather unavailable')
        return response.json()
      })
      .then((json) => {
        const result = {
          temp: json.current.temperature_2m,
          code: json.current.weather_code,
          high: json.daily.temperature_2m_max[0],
          low: json.daily.temperature_2m_min[0]
        }
        if (![result.temp, result.code, result.high, result.low].every(Number.isFinite))
          throw new Error('Invalid forecast')
        cache.set(key, { at: Date.now(), data: result })
        if (alive) setData(result)
      })
      .catch(() => {
        if (alive) setError(true)
      })
      .finally(() => clearTimeout(timeout))
    return () => {
      alive = false
      controller.abort()
      clearTimeout(timeout)
    }
  }, [lat, lon, retry])
  return (
    <div className="weather-widget" aria-label={`Weather in ${city}`}>
      <div className="weather-heading">
        <MapPin size={12} />
        <span>{city}</span>
        <CloudSun size={22} strokeWidth={1.4} />
      </div>
      {error ? (
        <div className="weather-unavailable">
          <span>
            Weather unavailable
            <br />
            <small>Check your connection and retry.</small>
          </span>
          <IconBtn label="Retry weather" onClick={() => setRetry((v) => v + 1)}>
            <RefreshCw size={14} />
          </IconBtn>
        </div>
      ) : data ? (
        <div className="weather-details">
          <strong className="metric">
            {Math.round(data.temp)}°<small>C</small>
          </strong>
          <div>
            <span>{label(data.code)}</span>
            <small>
              <span>
                High <b>{Math.round(data.high)}°</b>
              </span>
              <span>
                Low <b>{Math.round(data.low)}°</b>
              </span>
            </small>
          </div>
        </div>
      ) : (
        <p className="weather-loading" role="status">
          Fetching the local forecast…
        </p>
      )}
    </div>
  )
}
