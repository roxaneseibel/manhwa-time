export type Chapter = {
  id: string
  number: number
  publishedAt: string | null // "2020-06-10T00:00:00+00:00" ou null si inconnue
}

// Pour chaque chapitre lu : son id → nombre de lectures (1, 2 pour ×2...)
export type ReadCounts = Map<string, number>
