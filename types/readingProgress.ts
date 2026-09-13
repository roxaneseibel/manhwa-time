// Les valeurs acceptées par la colonne reading_progress.status
export type ReadingStatus = 'reading' | 'plan_to_read' | 'completed' | 'on_hold' | 'dropped'

export type ReadingEntry = {
  id: string
  webtoonId: string
  status: ReadingStatus
  currentChapter: number
}
