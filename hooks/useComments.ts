import { useCallback, useEffect, useState } from 'react'
import {
  COMMENTS_PAGE_SIZE,
  blockUser,
  deleteComment,
  getComments,
  getReplies,
  likeComment,
  postComment,
  reportComment,
  unlikeComment,
} from '@/lib/comments'
import type { Comment, CommentSort, ReportReason } from '@/types/comments'

// Les commentaires d'un chapitre : pagination, tri, réponses et actions
export function useComments(chapterId: string) {
  const [sort, setSort] = useState<CommentSort>('recent')
  const [comments, setComments] = useState<Comment[]>([])
  // Réponses chargées, rangées par commentaire parent
  const [replies, setReplies] = useState<Record<string, Comment[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // (Re)charge la première page
  const refresh = useCallback(async () => {
    setError(null)
    try {
      const page = await getComments(chapterId, sort, 0)
      setComments(page)
      setHasMore(page.length === COMMENTS_PAGE_SIZE)
      setReplies({})
      setExpanded(new Set())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [chapterId, sort])

  useEffect(() => {
    setLoading(true)
    refresh()
  }, [refresh])

  // Page suivante, quand on arrive en bas de la liste
  async function loadMore() {
    if (loading || loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const page = await getComments(chapterId, sort, comments.length)
      // Un commentaire publié entre-temps décale les pages : on évite les doublons
      setComments((current) => {
        const known = new Set(current.map((c) => c.id))
        return [...current, ...page.filter((c) => !known.has(c.id))]
      })
      setHasMore(page.length === COMMENTS_PAGE_SIZE)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoadingMore(false)
    }
  }

  // Applique une modification à un commentaire, qu'il soit dans la liste ou dans les réponses
  function updateComment(id: string, change: (comment: Comment) => Comment) {
    setComments((list) => list.map((c) => (c.id === id ? change(c) : c)))
    setReplies((all) =>
      Object.fromEntries(Object.entries(all).map(([parentId, list]) => [parentId, list.map((c) => (c.id === id ? change(c) : c))])),
    )
  }

  async function toggleReplies(parent: Comment) {
    const next = new Set(expanded)
    if (next.has(parent.id)) {
      next.delete(parent.id)
      setExpanded(next)
      return
    }
    next.add(parent.id)
    setExpanded(next)
    try {
      const list = await getReplies(parent.id)
      setReplies((all) => ({ ...all, [parent.id]: list }))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  // Publier. Renvoie true si c'est réussi (pour vider le champ de saisie)
  async function post(content: string, parent: Comment | null): Promise<boolean> {
    setError(null)
    try {
      const comment = await postComment(chapterId, content, parent?.id ?? null)
      if (parent) {
        setReplies((all) => ({ ...all, [parent.id]: [...(all[parent.id] ?? []), comment] }))
        setExpanded((set) => new Set(set).add(parent.id))
        updateComment(parent.id, (c) => ({ ...c, replyCount: c.replyCount + 1 }))
      } else {
        setComments((list) => [comment, ...list]) // en haut de la liste
      }
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    }
  }

  async function remove(comment: Comment) {
    setError(null)
    try {
      await deleteComment(comment.id)
      if (comment.parentId) {
        const parentId = comment.parentId
        setReplies((all) => ({ ...all, [parentId]: (all[parentId] ?? []).filter((c) => c.id !== comment.id) }))
        updateComment(parentId, (c) => ({ ...c, replyCount: Math.max(0, c.replyCount - 1) }))
      } else {
        setComments((list) => list.filter((c) => c.id !== comment.id))
      }
    } catch (e) {
      setError((e as Error).message)
    }
  }

  // Like : mise à jour optimiste, annulée si la base refuse
  async function toggleLike(comment: Comment) {
    const liked = !comment.likedByMe
    const apply = (value: boolean) =>
      updateComment(comment.id, (c) => ({ ...c, likedByMe: value, likeCount: c.likeCount + (value ? 1 : -1) }))

    apply(liked)
    try {
      await (liked ? likeComment(comment.id) : unlikeComment(comment.id))
    } catch (e) {
      apply(!liked)
      setError((e as Error).message)
    }
  }

  // Signaler. Renvoie un message à afficher à l'utilisateur
  async function report(comment: Comment, reason: ReportReason): Promise<string> {
    try {
      await reportComment(comment.id, reason)
      return 'Merci, le commentaire a été signalé.'
    } catch (e) {
      return (e as Error).message
    }
  }

  async function block(userId: string) {
    setError(null)
    try {
      await blockUser(userId)
      // La RLS masque maintenant ses commentaires : on recharge
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return {
    sort,
    setSort,
    comments,
    replies,
    expanded,
    loading,
    loadingMore,
    error,
    loadMore,
    refresh,
    toggleReplies,
    post,
    remove,
    toggleLike,
    report,
    block,
  }
}
