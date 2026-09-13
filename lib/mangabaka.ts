// MangaBaka : base qui agrège AniList, MangaUpdates, MAL...
// Sa recherche tolère les fautes de frappe, contrairement à celle d'AniList.
// Données sous licence CC BY-NC-SA : usage non commercial + créditer MangaBaka.

const MANGABAKA_URL = 'https://api.mangabaka.org/v1'

// On ne décrit que les champs utilisés
type MangabakaSeries = {
  id: number
  title: string
  source: {
    anilist: { id: number | null } | null
  } | null
}

// Recherche tolérante aux fautes → renvoie les ids AniList correspondants, par pertinence
export async function searchAnilistIdsFuzzy(search: string, signal?: AbortSignal): Promise<number[]> {
  const url = `${MANGABAKA_URL}/series/search?q=${encodeURIComponent(search)}&limit=10`
  const response = await fetch(url, { signal })

  if (!response.ok) {
    throw new Error(`Erreur MangaBaka (${response.status})`)
  }

  const json: { data: MangabakaSeries[] } = await response.json()

  const ids = json.data
    .map((series) => series.source?.anilist?.id)
    .filter((id): id is number => id != null) // certains titres n'existent pas sur AniList

  return [...new Set(ids)] // supprime les doublons
}
