import { Ionicons } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { formatRelativeTime } from '@/lib/dates'
import type { Comment } from '@/types/comments'

type Props = {
  comment: Comment
  isReply?: boolean
  repliesExpanded?: boolean
  onLike: (comment: Comment) => void
  onReply?: (comment: Comment) => void         // absent pour une réponse (un seul niveau)
  onToggleReplies?: (comment: Comment) => void
  onMenu: (comment: Comment) => void
}

export function CommentCard({ comment, isReply = false, repliesExpanded, onLike, onReply, onToggleReplies, onMenu }: Props) {
  return (
    <View style={[styles.card, isReply && styles.reply]}>
      <View style={styles.header}>
        {/* Avatar : initiale du pseudo */}
        <View style={[styles.avatar, isReply && styles.avatarSmall]}>
          <Text style={styles.avatarText}>{comment.username.charAt(0).toUpperCase()}</Text>
        </View>

        <View style={styles.author}>
          <Text style={styles.username}>{comment.username}</Text>
          <Text style={styles.date}>{formatRelativeTime(comment.createdAt)}</Text>
        </View>

        <Pressable onPress={() => onMenu(comment)} hitSlop={10} accessibilityLabel="Options du commentaire">
          <Ionicons name="ellipsis-horizontal" size={20} color="#999" />
        </Pressable>
      </View>

      {comment.isHidden && (
        <Text style={styles.hiddenBadge}>Masqué pour les autres suite à des signalements</Text>
      )}

      <Text style={styles.content}>{comment.content}</Text>

      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={() => onLike(comment)} hitSlop={8}>
          <Ionicons
            name={comment.likedByMe ? 'heart' : 'heart-outline'}
            size={20}
            color={comment.likedByMe ? '#e84393' : '#636e72'}
          />
          {comment.likeCount > 0 && <Text style={styles.actionText}>{comment.likeCount}</Text>}
        </Pressable>

        {onReply && (
          <Pressable style={styles.action} onPress={() => onReply(comment)} hitSlop={8}>
            <Ionicons name="chatbubble-outline" size={18} color="#636e72" />
            <Text style={styles.actionText}>Répondre</Text>
          </Pressable>
        )}
      </View>

      {onToggleReplies && comment.replyCount > 0 && (
        <Pressable onPress={() => onToggleReplies(comment)} hitSlop={6}>
          <Text style={styles.toggleReplies}>
            {repliesExpanded
              ? 'Masquer les réponses'
              : `Voir ${comment.replyCount} réponse${comment.replyCount > 1 ? 's' : ''}`}
          </Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { paddingVertical: 12, gap: 8 },
  reply: { marginLeft: 44, paddingVertical: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#6C5CE7', alignItems: 'center', justifyContent: 'center' },
  avatarSmall: { width: 28, height: 28, borderRadius: 14 },
  avatarText: { color: '#fff', fontWeight: 'bold' },
  author: { flex: 1 },
  username: { fontWeight: '600', color: '#2d3436' },
  date: { fontSize: 12, color: '#999' },
  hiddenBadge: { fontSize: 12, color: '#e17055', fontStyle: 'italic' },
  content: { fontSize: 15, lineHeight: 21, color: '#2d3436' },
  actions: { flexDirection: 'row', gap: 20 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { color: '#636e72', fontSize: 13 },
  toggleReplies: { color: '#6C5CE7', fontWeight: '600', fontSize: 13 },
})
