import { useCallback, useEffect, useState } from 'react'
import { ensureWebtoonWithChapters } from '@/lib/catalog'
import {
  getChapters,
  getMyReads,
  markChaptersRead,
  rereadChapter,
  unmarkChapter,
} from '@/lib/chapterTracking'
import type { Chapter, ReadCounts } from '@/types/chapterTracking'

// La liste des chapitres d'un titre + mes lectures + les actions pour cocher/décocher.
// onProgressChanged : prévient le parent (ex : pour recharger le bouton de statut)
export function useChapterList(anilistId: number, onProgressChanged?: () => void) {
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [readCounts, setReadCounts] = useState<ReadCounts>(new Map())
  const [reactedIds, setReactedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // silent : rechargement discret (retour depuis une page chapitre), sans spinner
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      // 1. S'assurer que les chapitres existent (import si besoin)
      const webtoonId = await ensureWebtoonWithChapters(anilistId)
      // 2. Chapitres et lectures : indépendants → en parallèle
      const [chapterList, reads] = await Promise.all([getChapters(webtoonId), getMyReads(webtoonId)])
      setChapters(chapterList)
      setReadCounts(reads.readCounts)
      setReactedIds(reads.reactedIds)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [anilistId])

  useEffect(() => {
    load()
  }, [load])

  const refreshSilently = useCallback(() => {
    load(true)
  }, [load])

  // Applique un changement tout de suite à l'écran, l'envoie à la base,
  // et revient en arrière en cas d'échec (mise à jour optimiste)
  async function optimistic(change: (counts: ReadCounts) => void, request: () => Promise<unknown>) {
    const previous = readCounts
    const next = new Map(readCounts) // copie : React ne détecte pas la modification d'une Map existante
    change(next)
    setReadCounts(next)
    setError(null)

    try {
      await request()
      onProgressChanged?.()
    } catch (e) {
      setReadCounts(previous)
      setError((e as Error).message)
    }
  }

  // Nombre de chapitres non lus AVANT celui-ci (pour proposer de les cocher aussi)
  function countUnreadBefore(chapter: Chapter) {
    return chapters.filter((c) => c.number < chapter.number && !readCounts.has(c.id)).length
  }

  function markRead(chapter: Chapter, includePrevious: boolean) {
    return optimistic(
      (counts) => {
        counts.set(chapter.id, 1)
        if (includePrevious) {
          for (const c of chapters) {
            if (c.number < chapter.number && !counts.has(c.id)) counts.set(c.id, 1)
          }
        }
      },
      () => markChaptersRead(chapter.id, includePrevious),
    )
  }

  function reread(chapter: Chapter) {
    return optimistic(
      (counts) => counts.set(chapter.id, (counts.get(chapter.id) ?? 0) + 1),
      () => rereadChapter(chapter.id),
    )
  }

  function unmark(chapter: Chapter) {
    return optimistic(
      (counts) => {
        counts.delete(chapter.id)
        setReactedIds((ids) => new Set([...ids].filter((id) => id !== chapter.id)))
      },
      () => unmarkChapter(chapter.id),
    )
  }

  // Prochain chapitre à lire : le premier non lu APRÈS le plus grand chapitre lu
  const maxReadNumber = chapters.reduce((max, c) => (readCounts.has(c.id) ? Math.max(max, c.number) : max), 0)
  const nextChapter = chapters.find((c) => c.number > maxReadNumber && !readCounts.has(c.id)) ?? null

  return {
    chapters,
    readCounts,
    reactedIds,
    readTotal: readCounts.size,
    nextChapter,
    loading,
    error,
    reload: load,
    refreshSilently,
    countUnreadBefore,
    markRead,
    reread,
    unmark,
  }
}
