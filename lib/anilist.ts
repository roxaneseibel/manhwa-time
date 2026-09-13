import { fetchWithTimeout } from '@/lib/http'
import type { AnilistMediaDetails, AnilistMediaStatus, AnilistSearchResult } from '@/types/anilist'

const ANILIST_URL = 'https://graphql.anilist.co'

// ---------------------------------------------------------------------------
// Fonction générique : envoie une requête GraphQL et renvoie la partie "data"
// ---------------------------------------------------------------------------
async function anilistRequest<T>(
  query: string,
  variables: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetchWithTimeout('AniList', ANILIST_URL, {
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
    synonyms
    isAdult
    coverImage { medium color }
    countryOfOrigin
    status
    chapters
    averageScore
    startDate { year }
  }
`

// ⚠️ Filtre "adulte" : AniList renvoie ZÉRO résultat si on envoie isAdult: null.
// Pour ne pas filtrer, il faut NE PAS envoyer la variable du tout
// (JSON.stringify supprime les clés dont la valeur est undefined).
function adultFilter(includeAdult: boolean) {
  return includeAdult ? undefined : false
}

const SEARCH_QUERY = `
  query SearchWebtoons($search: String, $isAdult: Boolean) {
    Page(page: 1, perPage: 20) {
      media(
        search: $search
        type: MANGA
        format_not_in: [NOVEL]
        isAdult: $isAdult
        sort: SEARCH_MATCH
      ) {
        ...SearchFields
      }
    }
  }
  ${SEARCH_FIELDS}
`

export async function searchAnilist(
  search: string,
  { includeAdult }: { includeAdult: boolean },
  signal?: AbortSignal,
) {
  const data = await anilistRequest<{ Page: { media: AnilistSearchResult[] } }>(
    SEARCH_QUERY,
    { search, isAdult: adultFilter(includeAdult) },
    signal,
  )
  return data.Page.media
}

// ---------------------------------------------------------------------------
// Récupérer plusieurs titres à partir de leurs ids AniList
// ---------------------------------------------------------------------------
const BY_IDS_QUERY = `
  query WebtoonsByIds($ids: [Int], $isAdult: Boolean) {
    Page(page: 1, perPage: 20) {
      media(id_in: $ids, type: MANGA, format_not_in: [NOVEL], isAdult: $isAdult) {
        ...SearchFields
      }
    }
  }
  ${SEARCH_FIELDS}
`

export async function getAnilistByIds(
  ids: number[],
  { includeAdult }: { includeAdult: boolean },
  signal?: AbortSignal,
) {
  if (ids.length === 0) return []

  const data = await anilistRequest<{ Page: { media: AnilistSearchResult[] } }>(
    BY_IDS_QUERY,
    { ids, isAdult: adultFilter(includeAdult) },
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
// Fiche détaillée d'un titre
// ---------------------------------------------------------------------------
const DETAILS_QUERY = `
  query WebtoonDetails($id: Int) {
    Media(id: $id, type: MANGA) {
      id
      title { romaji english native }
      description(asHtml: false)
      coverImage { extraLarge color }
      bannerImage
      genres
      countryOfOrigin
      status
      chapters
      averageScore
      startDate { year }
      externalLinks { site url type language }
    }
  }
`

export async function getAnilistMedia(id: number, signal?: AbortSignal) {
  const data = await anilistRequest<{ Media: AnilistMediaDetails }>(DETAILS_QUERY, { id }, signal)
  return data.Media
}

// ---------------------------------------------------------------------------
// Petits utilitaires d'affichage
// ---------------------------------------------------------------------------

// Le synopsis AniList contient du HTML : on le transforme en texte simple
export function cleanDescription(html: string | null) {
  if (!html) return null

  return html
    .replace(/<br\s*\/?>/gi, '\n')   // <br> → retour à la ligne
    .replace(/<[^>]+>/g, '')         // supprime toutes les autres balises (<i>, <b>...)
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')      // pas plus d'une ligne vide d'affilée
    .trim()
}

export const GENRE_LABELS: Record<string, string> = {
  Action: 'Action',
  Adventure: 'Aventure',
  Comedy: 'Comédie',
  Drama: 'Drame',
  Ecchi: 'Ecchi',
  Fantasy: 'Fantasy',
  Horror: 'Horreur',
  'Mahou Shoujo': 'Magical girl',
  Mecha: 'Mecha',
  Music: 'Musique',
  Mystery: 'Mystère',
  Psychological: 'Psychologique',
  Romance: 'Romance',
  'Sci-Fi': 'Science-fiction',
  'Slice of Life': 'Tranche de vie',
  Sports: 'Sport',
  Supernatural: 'Surnaturel',
  Thriller: 'Thriller',
}

export const LANGUAGE_LABELS: Record<string, string> = {
  French: 'Français',
  English: 'Anglais',
  Korean: 'Coréen',
  Japanese: 'Japonais',
  Chinese: 'Chinois',
  Spanish: 'Espagnol',
  German: 'Allemand',
  Thai: 'Thaï',
  Indonesian: 'Indonésien',
}

export function displayTitle(media: { title: { english: string | null; romaji: string | null } }) {
  return media.title.english ?? media.title.romaji ?? 'Sans titre'
}

// "Flowers are Bait!" → "flowers are bait"
function normalizeTitle(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9À-ɏ]+/g, ' ').trim()
}

// Si la recherche correspond à un titre alternatif mais PAS au titre affiché,
// renvoie ce titre alternatif (pour que l'utilisateur reconnaisse le résultat)
export function findMatchingAltTitle(media: AnilistSearchResult, query: string) {
  const normalizedQuery = normalizeTitle(query)
  const shown = displayTitle(media)

  if (!normalizedQuery || normalizeTitle(shown).includes(normalizedQuery)) {
    return null
  }

  const alternatives = [media.title.romaji, media.title.english, ...media.synonyms].filter(
    (title): title is string => !!title && title !== shown,
  )

  return alternatives.find((title) => normalizeTitle(title).includes(normalizedQuery)) ?? null
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
