// Les valeurs acceptées par la colonne reading_progress.status
export type ReadingStatus = 'reading' | 'plan_to_read' | 'completed' | 'on_hold' | 'dropped'

export type ReadingEntry = {
  id: string
  webtoonId: string
  status: ReadingStatus
  currentChapter: number
}

// Une entrée de "Ma liste" : la progression + les infos du webtoon pour l'affichage
export type LibraryEntry = ReadingEntry & {
  updatedAt: string
  webtoon: {
    anilistId: number | null // null pour un ajout manuel (Phase 4)
    title: string
    coverUrl: string | null
    totalChapters: number | null
  }
}
