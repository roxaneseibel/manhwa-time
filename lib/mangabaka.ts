// MangaBaka : base qui agrège AniList, MangaUpdates, MAL...
// - sa recherche tolère les fautes de frappe, contrairement à celle d'AniList
// - elle connaît les identifiants d'un même titre sur les autres sites
// Données sous licence CC BY-NC-SA : usage non commercial + créditer MangaBaka.

import { fetchWithTimeout } from '@/lib/http'

const MANGABAKA_URL = 'https://api.mangabaka.org/v1'

// On ne décrit que les champs utilisés
type MangabakaSeries = {
  id: number
  title: string
  total_chapters: string | number | null
  source: {
    anilist: { id: number | null } | null
    manga_updates: { id: string | null } | null // id en base 36, ex : "01w7hvo"
  } | null
}

async function mangabakaRequest<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetchWithTimeout('MangaBaka', `${MANGABAKA_URL}${path}`, { signal })

  if (!response.ok) {
    throw new Error(`Erreur MangaBaka (${response.status})`)
  }

  const json: { data: T } = await response.json()
  return json.data
}

// Recherche tolérante aux fautes → renvoie les ids AniList correspondants, par pertinence
export async function searchAnilistIdsFuzzy(search: string, signal?: AbortSignal): Promise<number[]> {
  const series = await mangabakaRequest<MangabakaSeries[]>(
    `/series/search?q=${encodeURIComponent(search)}&limit=10`,
    signal,
  )

  const ids = series
    .map((s) => s.source?.anilist?.id)
    .filter((id): id is number => id != null) // certains titres n'existent pas sur AniList

  return [...new Set(ids)] // supprime les doublons
}

// Correspondance : id AniList → fiche MangaBaka (qui contient l'id MangaUpdates)
export async function getMangabakaByAnilistId(anilistId: number, signal?: AbortSignal) {
  const data = await mangabakaRequest<{ series: MangabakaSeries[] }>(`/source/anilist/${anilistId}`, signal)
  const series = data.series[0]
  if (!series) return null

  const muKey = series.source?.manga_updates?.id

  return {
    totalChapters: series.total_chapters != null ? Number(series.total_chapters) : null,
    // MangaBaka donne l'id MangaUpdates en base 36 ; l'API MangaUpdates attend un nombre
    mangaUpdatesId: muKey ? parseInt(muKey, 36) : null,
  }
}
