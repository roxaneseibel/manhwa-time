import { getAnilistByIds, searchAnilist } from '@/lib/anilist'
import { searchAnilistIdsFuzzy } from '@/lib/mangabaka'
import type { AnilistSearchResult } from '@/types/anilist'

export type SearchResponse = {
  results: AnilistSearchResult[]
  isFuzzy: boolean // true = résultats approchants (la recherche exacte n'a rien donné)
}

// Stratégie de recherche :
// 1. AniList (précis, mais aucune tolérance aux fautes)
// 2. Si rien trouvé : MangaBaka (tolérant) → ids AniList → fiches AniList
export async function searchWebtoons(search: string, signal?: AbortSignal): Promise<SearchResponse> {
  const exact = await searchAnilist(search, signal)
  if (exact.length > 0) {
    return { results: exact, isFuzzy: false }
  }

  // Si MangaBaka est en panne, on n'affiche pas d'erreur : juste "aucun résultat"
  const ids = await searchAnilistIdsFuzzy(search, signal).catch(() => [])
  const fuzzy = await getAnilistByIds(ids, signal)

  return { results: fuzzy, isFuzzy: fuzzy.length > 0 }
}
