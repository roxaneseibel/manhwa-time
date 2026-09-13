// Forme des données renvoyées par AniList.
// On ne décrit QUE les champs qu'on demande dans nos requêtes GraphQL.

export type AnilistMediaStatus = 'FINISHED' | 'RELEASING' | 'NOT_YET_RELEASED' | 'CANCELLED' | 'HIATUS'

export type AnilistSearchResult = {
  id: number
  title: { romaji: string | null; english: string | null }
  coverImage: { medium: string | null; color: string | null }
  countryOfOrigin: string | null // "KR" = manhwa, "CN" = manhua, "JP" = manga
  status: AnilistMediaStatus | null
  chapters: number | null        // null tant que la série est en cours
  averageScore: number | null    // sur 100
  startDate: { year: number | null }
}
