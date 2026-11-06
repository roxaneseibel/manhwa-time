import type { Emotion } from '@/types/chapterTracking'
import type { ReadingStatus } from '@/types/readingProgress'

// Ce que renvoie la fonction SQL my_reading_stats(), en noms JavaScript.
// Voir supabase/sql/09_profile_stats.sql
export type ReadingStats = {
  // Relectures comprises : un chapitre lu 3 fois compte 3
  chaptersRead: number
  // Chapitres différents : le même chapitre lu 3 fois compte 1
  uniqueChapters: number
  rereads: number
  // Estimation (6 min par chapitre), pas une mesure
  minutesRead: number
  seriesTotal: number
  byStatus: Record<ReadingStatus, number>
  ratedCount: number
  averageRating: number | null
  topGenres: { name: string; count: number }[]
  topEmotions: { emotion: Emotion; count: number }[]
}
