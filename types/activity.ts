// Les quatre événements enregistrés par les triggers de l'étape 11
// (voir supabase/sql/11_activity.sql)
export type ActivityType = 'chapters_read' | 'series_started' | 'series_completed' | 'chapter_rated'

export type ActivityItem = {
  id: string
  type: ActivityType
  createdAt: string

  userId: string
  username: string
  avatarUrl: string | null

  webtoonId: string | null
  webtoonTitle: string | null
  coverUrl: string | null
  // null pour un ajout manuel (Phase 4) : la fiche n'est alors pas ouvrable
  anilistId: number | null

  chapterNumber: number | null
  chapterCount: number | null
  rating: number | null
}
