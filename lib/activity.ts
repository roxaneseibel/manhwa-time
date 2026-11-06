import { supabase } from '@/lib/supabase'
import { RATING_LABELS } from '@/lib/chapterLabels'
import { formatChapter } from '@/lib/readingProgress'
import type { ActivityItem } from '@/types/activity'

export const FEED_PAGE_SIZE = 20

// Pagination par CURSEUR : on demande « ce qui est plus vieux que cette date »
// plutôt qu'une page numérotée. Le feed bouge en permanence — avec un offset,
// une nouvelle activité ferait réapparaître une ligne déjà vue.
export async function getMyFeed(
  before?: string | null,
  signal?: AbortSignal,
): Promise<ActivityItem[]> {
  const request = supabase.rpc('my_feed', {
    p_limit: FEED_PAGE_SIZE,
    p_before: before ?? null,
  })

  const { data, error } = await (signal ? request.abortSignal(signal) : request)

  if (error) throw new Error(error.message)

  return (data ?? []).map((row: any) => ({
    id: row.id,
    type: row.type,
    createdAt: row.created_at,
    userId: row.user_id,
    username: row.username,
    avatarUrl: row.avatar_url,
    webtoonId: row.webtoon_id,
    webtoonTitle: row.webtoon_title,
    coverUrl: row.cover_url,
    anilistId: row.anilist_id,
    // numeric revient en chaîne ("12.5") : à convertir
    chapterNumber: row.chapter_number == null ? null : Number(row.chapter_number),
    chapterCount: row.chapter_count,
    rating: row.rating,
  }))
}

// La phrase affichée dans le feed, construite à partir du type.
// Séparée du composant pour rester lisible et testable d'un coup d'œil.
export function describeActivity(item: ActivityItem): string {
  const title = item.webtoonTitle ?? 'une série'

  switch (item.type) {
    case 'chapters_read': {
      const count = item.chapterCount ?? 1
      if (count === 1) {
        return `a lu le chapitre ${formatChapter(item.chapterNumber ?? 0)} de ${title}`
      }
      return `a lu ${count} chapitres de ${title} (jusqu’au ${formatChapter(item.chapterNumber ?? 0)})`
    }

    case 'series_started':
      return `a commencé ${title}`

    case 'series_completed':
      return `a terminé ${title}`

    case 'chapter_rated': {
      // RATING_LABELS est indexé à partir de 0 pour la note 1
      const label = item.rating ? RATING_LABELS[item.rating - 1] : null
      const chapter = `le chapitre ${formatChapter(item.chapterNumber ?? 0)} de ${title}`
      return label ? `a trouvé ${chapter} « ${label} »` : `a noté ${chapter}`
    }
  }
}
