export type Chapter = {
  id: string
  number: number
  publishedAt: string | null // "2020-06-10T00:00:00+00:00" ou null si inconnue
}

// Pour chaque chapitre lu : son id → nombre de lectures (1, 2 pour ×2...)
export type ReadCounts = Map<string, number>

// Les émotions acceptées par la contrainte SQL chapter_read_emotion_check
export type Emotion = 'shocked' | 'frustrated' | 'sad' | 'thoughtful' | 'moved' | 'amused' | 'scared' | 'bored'

export type ChapterDetails = Chapter & {
  webtoon: {
    id: string
    anilistId: number | null
    title: string
    coverUrl: string | null
    bannerUrl: string | null
  }
}

// Ce que MOI j'ai fait de ce chapitre (null si jamais lu)
export type MyChapterRead = {
  readCount: number
  rating: number | null // 1 à 5
  emotion: Emotion | null
  firstReadAt: string
}

export type ChapterNeighbors = {
  previousId: string | null
  nextId: string | null
}
