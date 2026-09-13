import { supabase } from '@/lib/supabase'
import type { Comment, CommentSort, ReportReason } from '@/types/comments'

export const COMMENTS_PAGE_SIZE = 20
export const COMMENT_MAX_LENGTH = 2000 // même limite que la contrainte SQL

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spoiler', label: 'Spoiler' },
  { value: 'spam', label: 'Spam ou publicité' },
  { value: 'harassment', label: 'Harcèlement' },
  { value: 'hate', label: 'Propos haineux' },
  { value: 'sexual', label: 'Contenu sexuel' },
  { value: 'other', label: 'Autre' },
]

// Jointure avec l'auteur. On NOMME la clé étrangère à suivre (chapter_comment_user_id_fkey) :
// chapter_comment et profile sont aussi reliés indirectement via comment_like et comment_report,
// et sans précision Supabase ne sait pas quel chemin prendre ("more than one relationship").
const COMMENT_COLUMNS =
  'id, chapter_id, parent_id, user_id, content, like_count, reply_count, is_hidden, created_at, profile!chapter_comment_user_id_fkey(username)'

type CommentRow = {
  id: string
  chapter_id: string
  parent_id: string | null
  user_id: string
  content: string
  like_count: number
  reply_count: number
  is_hidden: boolean
  created_at: string
  profile: { username: string } | null
}

function toComment(row: CommentRow, likedIds: Set<string>): Comment {
  return {
    id: row.id,
    chapterId: row.chapter_id,
    parentId: row.parent_id,
    userId: row.user_id,
    username: row.profile?.username ?? 'Utilisateur',
    content: row.content,
    likeCount: row.like_count,
    replyCount: row.reply_count,
    isHidden: row.is_hidden,
    createdAt: row.created_at,
    likedByMe: likedIds.has(row.id),
  }
}

// Parmi ces commentaires, lesquels ai-je likés ? (la RLS ne renvoie que MES likes)
async function getLikedIds(commentIds: string[]): Promise<Set<string>> {
  if (commentIds.length === 0) return new Set()
  const { data, error } = await supabase.from('comment_like').select('comment_id').in('comment_id', commentIds)
  if (error) throw new Error(error.message)
  return new Set(data.map((row) => row.comment_id))
}

async function withLikes(rows: CommentRow[]): Promise<Comment[]> {
  const likedIds = await getLikedIds(rows.map((row) => row.id))
  return rows.map((row) => toComment(row, likedIds))
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

// Une page de commentaires (sans les réponses). offset = combien on en a déjà
export async function getComments(chapterId: string, sort: CommentSort, offset: number): Promise<Comment[]> {
  let query = supabase
    .from('chapter_comment')
    .select(COMMENT_COLUMNS)
    .eq('chapter_id', chapterId)
    .is('parent_id', null)

  query =
    sort === 'popular'
      ? query.order('like_count', { ascending: false }).order('created_at', { ascending: false })
      : query.order('created_at', { ascending: false })

  const { data, error } = await query.range(offset, offset + COMMENTS_PAGE_SIZE - 1)
  if (error) throw new Error(error.message)
  return withLikes(data as unknown as CommentRow[])
}

// Les réponses d'un commentaire, de la plus ancienne à la plus récente (ordre de la conversation)
export async function getReplies(parentId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from('chapter_comment')
    .select(COMMENT_COLUMNS)
    .eq('parent_id', parentId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return withLikes(data as unknown as CommentRow[])
}

export async function getCommentCount(chapterId: string): Promise<number> {
  const { count, error } = await supabase
    .from('chapter_comment')
    .select('id', { count: 'exact', head: true })
    .eq('chapter_id', chapterId)
    .is('parent_id', null)

  if (error) throw new Error(error.message)
  return count ?? 0
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function postComment(chapterId: string, content: string, parentId: string | null): Promise<Comment> {
  // On n'envoie PAS user_id : la base le remplit avec l'utilisateur connecté
  const { data, error } = await supabase
    .from('chapter_comment')
    .insert({ chapter_id: chapterId, parent_id: parentId, content: content.trim() })
    .select(COMMENT_COLUMNS)
    .single()

  if (error) {
    if (error.code === '42501') throw new Error('Marque le chapitre comme lu pour pouvoir commenter.')
    throw new Error(error.message)
  }
  return toComment(data as unknown as CommentRow, new Set())
}

export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await supabase.from('chapter_comment').delete().eq('id', commentId)
  if (error) throw new Error(error.message)
}

export async function likeComment(commentId: string): Promise<void> {
  const { error } = await supabase.from('comment_like').insert({ comment_id: commentId })
  // 23505 = déjà liké (double appui) : ce n'est pas une vraie erreur
  if (error && error.code !== '23505') throw new Error(error.message)
}

export async function unlikeComment(commentId: string): Promise<void> {
  const { error } = await supabase.from('comment_like').delete().eq('comment_id', commentId)
  if (error) throw new Error(error.message)
}

export async function reportComment(commentId: string, reason: ReportReason): Promise<void> {
  const { error } = await supabase.from('comment_report').insert({ comment_id: commentId, reason })
  if (error) {
    if (error.code === '23505') throw new Error('Tu as déjà signalé ce commentaire.')
    throw new Error(error.message)
  }
}

export async function blockUser(userId: string): Promise<void> {
  const { error } = await supabase.from('user_block').insert({ blocked_id: userId })
  if (error && error.code !== '23505') throw new Error(error.message)
}
