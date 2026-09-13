import type { AnilistMediaStatus, AnilistSearchResult } from '@/types/anilist'

const ANILIST_URL = 'https://graphql.anilist.co'

// ---------------------------------------------------------------------------
// Fonction générique : envoie une requête GraphQL et renvoie la partie "data"
// ---------------------------------------------------------------------------
async function anilistRequest<T>(
  query: string,
  variables: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(ANILIST_URL, {
    method: 'POST', // en GraphQL, tout passe par un POST sur une URL unique
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal, // permet d'annuler la requête si elle n'est plus utile
  })

  if (response.status === 429) {
    throw new Error('Trop de recherches d’un coup, réessaie dans une minute')
  }

  const json = await response.json()

  // En GraphQL, les erreurs arrivent dans un tableau "errors"
  if (!response.ok || json.errors) {
    throw new Error(json.errors?.[0]?.message ?? `Erreur AniList (${response.status})`)
  }

  return json.data as T
}

// ---------------------------------------------------------------------------
// Recherche
// ---------------------------------------------------------------------------
// Un "fragment" = une liste de champs réutilisable dans plusieurs requêtes
const SEARCH_FIELDS = `
  fragment SearchFields on Media {
    id
    title { romaji english }
    coverImage { medium color }
    countryOfOrigin
    status
    chapters
    averageScore
    startDate { year }
  }
`

const SEARCH_QUERY = `
  query SearchWebtoons($search: String) {
    Page(page: 1, perPage: 20) {
      media(
        search: $search
        type: MANGA
        format_not_in: [NOVEL]
        isAdult: false
        sort: SEARCH_MATCH
      ) {
        ...SearchFields
      }
    }
  }
  ${SEARCH_FIELDS}
`

export async function searchAnilist(search: string, signal?: AbortSignal) {
  const data = await anilistRequest<{ Page: { media: AnilistSearchResult[] } }>(
    SEARCH_QUERY,
    { search },
    signal,
  )
  return data.Page.media
}

// ---------------------------------------------------------------------------
// Récupérer plusieurs titres à partir de leurs ids AniList
// ---------------------------------------------------------------------------
const BY_IDS_QUERY = `
  query WebtoonsByIds($ids: [Int]) {
    Page(page: 1, perPage: 20) {
      media(id_in: $ids, type: MANGA, format_not_in: [NOVEL], isAdult: false) {
        ...SearchFields
      }
    }
  }
  ${SEARCH_FIELDS}
`

export async function getAnilistByIds(ids: number[], signal?: AbortSignal) {
  if (ids.length === 0) return []

  const data = await anilistRequest<{ Page: { media: AnilistSearchResult[] } }>(
    BY_IDS_QUERY,
    { ids },
    signal,
  )

  // AniList renvoie les titres triés par id, pas dans l'ordre demandé :
  // on les remet dans l'ordre de "ids" (= ordre de pertinence)
  const byId = new Map(data.Page.media.map((media) => [media.id, media]))
  return ids
    .map((id) => byId.get(id))
    .filter((media): media is AnilistSearchResult => media !== undefined)
}

// ---------------------------------------------------------------------------
// Petits utilitaires d'affichage
// ---------------------------------------------------------------------------
export function displayTitle(media: { title: { english: string | null; romaji: string | null } }) {
  return media.title.english ?? media.title.romaji ?? 'Sans titre'
}

export const COUNTRY_LABELS: Record<string, string> = {
  KR: 'Manhwa',
  CN: 'Manhua',
  TW: 'Manhua',
  JP: 'Manga',
}

export const STATUS_LABELS: Record<AnilistMediaStatus, string> = {
  RELEASING: 'En cours',
  FINISHED: 'Terminé',
  HIATUS: 'En pause',
  CANCELLED: 'Annulé',
  NOT_YET_RELEASED: 'À venir',
}
