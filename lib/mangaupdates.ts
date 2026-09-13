// MangaUpdates : base communautaire qui recense les sorties de chapitres
// de tous les groupes (officiels et scans). Conditions d'utilisation : créditer MangaUpdates.

import { fetchWithTimeout } from '@/lib/http'
import type { LatestRelease } from '@/types/chapters'

const MANGAUPDATES_URL = 'https://api.mangaupdates.com/v1'

type MuSeries = {
  series_id: number
  title: string
  url: string
  latest_chapter: number | null
  completed: boolean
}

type MuReleaseRecord = {
  chapter: string
  release_date: string
  groups: { name: string }[]
}

async function mangaupdatesRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetchWithTimeout('MangaUpdates', `${MANGAUPDATES_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })

  if (!response.ok) {
    throw new Error(`Erreur MangaUpdates (${response.status})`)
  }

  return response.json()
}

export function getMuSeries(seriesId: number, signal?: AbortSignal) {
  return mangaupdatesRequest<MuSeries>(`/series/${seriesId}`, { signal })
}

// La sortie la plus récente (par date) pour une série
export async function getMuLatestRelease(seriesId: number, signal?: AbortSignal): Promise<LatestRelease | null> {
  const data = await mangaupdatesRequest<{ results: { record: MuReleaseRecord }[] }>('/releases/search', {
    method: 'POST',
    body: JSON.stringify({
      search: String(seriesId),
      search_type: 'series',
      orderby: 'date',
      asc: 'desc',
      perpage: 5,
    }),
    signal,
  })

  const record = data.results[0]?.record
  if (!record) return null

  return {
    chapter: record.chapter,
    date: record.release_date,
    groups: record.groups.map((g) => g.name),
  }
}
