export type CommentSort = 'recent' | 'popular'

// Raisons acceptées par la contrainte SQL comment_report_reason_check
export type ReportReason = 'spoiler' | 'spam' | 'harassment' | 'hate' | 'sexual' | 'other'

export type Comment = {
  id: string
  chapterId: string
  parentId: string | null // null = commentaire, sinon réponse
  userId: string
  username: string
  content: string
  likeCount: number
  replyCount: number
  isHidden: boolean // visible seulement par son auteur
  createdAt: string
  likedByMe: boolean
}
