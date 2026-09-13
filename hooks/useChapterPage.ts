import { useCallback, useEffect, useState } from 'react'
import {
  countUnreadBefore,
  getChapterDetails,
  getMyChapterRead,
  getNeighborChapters,
  markChaptersRead,
  rereadChapter,
  unmarkChapter,
  updateMyChapterReaction,
} from '@/lib/chapterTracking'
import { getCommentCount } from '@/lib/comments'
import type { ChapterDetails, ChapterNeighbors, Emotion, MyChapterRead } from '@/types/chapterTracking'

// Toutes les données et actions de la page d'un chapitre
export function useChapterPage(chapterId: string) {
  const [chapter, setChapter] = useState<ChapterDetails | null>(null)
  const [myRead, setMyRead] = useState<MyChapterRead | null>(null)
  const [neighbors, setNeighbors] = useState<ChapterNeighbors>({ previousId: null, nextId: null })
  const [commentCount, setCommentCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reloadMyRead = useCallback(async () => {
    setMyRead(await getMyChapterRead(chapterId))
  }, [chapterId])

  // Au retour sur la page (ex : après avoir commenté) : lecture + nombre de commentaires
  const refresh = useCallback(async () => {
    const [read, count] = await Promise.all([getMyChapterRead(chapterId), getCommentCount(chapterId)])
    setMyRead(read)
    setCommentCount(count)
  }, [chapterId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      const details = await getChapterDetails(chapterId)
      // Une fois le chapitre connu : ma lecture et les voisins, en parallèle
      const [read, around, count] = await Promise.all([
        getMyChapterRead(chapterId),
        getNeighborChapters(details.webtoon.id, details.number),
        getCommentCount(chapterId),
      ])
      if (cancelled) return
      setChapter(details)
      setMyRead(read)
      setNeighbors(around)
      setCommentCount(count)
    }

    load()
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))

    return () => {
      cancelled = true
    }
  }, [chapterId])

  // Exécute une action puis relit ma lecture depuis la base (source de vérité)
  async function run(action: () => Promise<unknown>) {
    setSaving(true)
    setError(null)
    try {
      await action()
      await reloadMyRead()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // Note et émotion : mise à jour optimiste (l'appui doit être instantané)
  async function setReaction(changes: { rating?: number | null; emotion?: Emotion | null }) {
    if (!myRead) return
    const previous = myRead
    setMyRead({ ...myRead, ...changes })
    setError(null)
    try {
      await updateMyChapterReaction(chapterId, changes)
    } catch (e) {
      setMyRead(previous)
      setError((e as Error).message)
    }
  }

  return {
    chapter,
    myRead,
    neighbors,
    commentCount,
    loading,
    saving,
    error,
    refresh,
    getUnreadBefore: () => (chapter ? countUnreadBefore(chapter.webtoon.id, chapter.number) : Promise.resolve(0)),
    markRead: (includePrevious: boolean) => run(() => markChaptersRead(chapterId, includePrevious)),
    reread: () => run(() => rereadChapter(chapterId)),
    unmark: () => run(() => unmarkChapter(chapterId)),
    setRating: (rating: number) => setReaction({ rating: myRead?.rating === rating ? null : rating }),
    setEmotion: (emotion: Emotion) => setReaction({ emotion: myRead?.emotion === emotion ? null : emotion }),
  }
}
