// Informations de sortie des chapitres, assemblées à partir d'AniList + MangaBaka + MangaUpdates

export type LatestRelease = {
  chapter: string | null // "329", "10-12", "5a"... ou null si la numérotation est incohérente
  date: string           // "2026-09-09"
  groups: string[]       // ["Asura"]
}

export type ChapterInfo = {
  latestChapter: number | null
  lastRelease: LatestRelease | null
  mangaUpdatesUrl: string | null
  isFinished: boolean
}
