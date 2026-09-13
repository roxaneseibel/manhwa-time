// Forme des données renvoyées par AniList.
// On ne décrit QUE les champs qu'on demande dans nos requêtes GraphQL.

export type AnilistMediaStatus = 'FINISHED' | 'RELEASING' | 'NOT_YET_RELEASED' | 'CANCELLED' | 'HIATUS'

export type AnilistSearchResult = {
  id: number
  title: { romaji: string | null; english: string | null }
  synonyms: string[]             // titres alternatifs ("Flowers are Bait"...)
  isAdult: boolean
  coverImage: { medium: string | null; color: string | null }
  countryOfOrigin: string | null // "KR" = manhwa, "CN" = manhua, "JP" = manga
  status: AnilistMediaStatus | null
  chapters: number | null        // null tant que la série est en cours
  averageScore: number | null    // sur 100
  startDate: { year: number | null }
}

export type AnilistExternalLink = {
  site: string              // "WEBTOON", "Naver Webtoon", "Tappytoon"...
  url: string
  type: 'INFO' | 'STREAMING' | 'SOCIAL' | null
  language: string | null   // "French", "English", "Korean"...
}

export type AnilistMediaDetails = {
  id: number
  title: { romaji: string | null; english: string | null; native: string | null }
  description: string | null // contient du HTML (<br>, <i>...)
  coverImage: { extraLarge: string | null; color: string | null }
  bannerImage: string | null
  genres: string[]
  countryOfOrigin: string | null
  status: AnilistMediaStatus | null
  chapters: number | null
  averageScore: number | null
  startDate: { year: number | null }
  externalLinks: AnilistExternalLink[]
}
