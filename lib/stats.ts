import { supabase } from '@/lib/supabase'
import { READING_STATUSES } from '@/lib/readingProgress'
import type { ReadingStats } from '@/types/stats'
import type { ReadingStatus } from '@/types/readingProgress'

// La forme brute renvoyée par Postgres (snake_case, et by_status incomplet :
// seuls les statuts réellement utilisés y figurent)
type StatsRow = {
  chapters_read: number
  unique_chapters: number
  rereads: number
  minutes_read: number
  series_total: number
  by_status: Partial<Record<ReadingStatus, number>>
  rated_count: number
  average_rating: number | string | null
  top_genres: { name: string; count: number }[]
  top_emotions: ReadingStats['topEmotions']
}

export async function getMyReadingStats(signal?: AbortSignal): Promise<ReadingStats> {
  const query = supabase.rpc('my_reading_stats')
  const { data, error } = await (signal ? query.abortSignal(signal) : query)

  if (error) throw new Error(error.message)

  const row = data as StatsRow

  return {
    chaptersRead: row.chapters_read ?? 0,
    uniqueChapters: row.unique_chapters ?? 0,
    rereads: row.rereads ?? 0,
    minutesRead: row.minutes_read ?? 0,
    seriesTotal: row.series_total ?? 0,
    // On complète les statuts absents par 0 : l'affichage peut alors parcourir
    // READING_STATUSES sans se demander si la clé existe.
    byStatus: Object.fromEntries(
      READING_STATUSES.map((status) => [status, row.by_status?.[status] ?? 0]),
    ) as Record<ReadingStatus, number>,
    ratedCount: row.rated_count ?? 0,
    // Postgres renvoie un "numeric" sous forme de chaîne ("4.2") : à convertir
    averageRating: row.average_rating == null ? null : Number(row.average_rating),
    topGenres: row.top_genres ?? [],
    topEmotions: row.top_emotions ?? [],
  }
}

// 45 → "45 min" ; 150 → "2 h 30" ; 3000 → "2 j 2 h"
export function formatReadingTime(minutes: number) {
  if (minutes < 60) return `${minutes} min`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const rest = minutes % 60
    return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`
  }

  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  return restHours === 0 ? `${days} j` : `${days} j ${restHours} h`
}
