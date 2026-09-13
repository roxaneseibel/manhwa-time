import { Ionicons } from '@expo/vector-icons'
import { useHeaderHeight } from '@react-navigation/elements'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ActionSheet, type SheetOption } from '@/components/ActionSheet'
import { CommentCard } from '@/components/CommentCard'
import { useAsync } from '@/hooks/useAsync'
import { useComments } from '@/hooks/useComments'
import { getChapterDetails, getMyChapterRead } from '@/lib/chapterTracking'
import { COMMENT_MAX_LENGTH, REPORT_REASONS } from '@/lib/comments'
import { formatChapter } from '@/lib/readingProgress'
import { useSession } from '@/providers/SessionProvider'
import type { Comment } from '@/types/comments'

export default function CommentsScreen() {
  const { chapterId } = useLocalSearchParams<{ chapterId: string }>()
  const { session } = useSession()
  const headerHeight = useHeaderHeight()
  const insets = useSafeAreaInsets()

  const thread = useComments(chapterId)

  // Le chapitre (pour le titre) et MA lecture (anti-spoiler + droit d'écrire)
  const { data: context, loading: contextLoading } = useAsync(
    async () => {
      const [chapter, myRead] = await Promise.all([getChapterDetails(chapterId), getMyChapterRead(chapterId)])
      return { chapter, isRead: myRead != null }
    },
    [chapterId],
  )

  const [revealed, setRevealed] = useState(false) // "Afficher quand même"
  const [text, setText] = useState('')
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null)
  const [sending, setSending] = useState(false)
  const [menuComment, setMenuComment] = useState<Comment | null>(null)
  const [reportTarget, setReportTarget] = useState<Comment | null>(null)

  const isRead = context?.isRead ?? false
  const showComments = isRead || revealed

  async function send() {
    if (!text.trim()) return
    setSending(true)
    const success = await thread.post(text, replyingTo)
    setSending(false)
    if (success) {
      setText('')
      setReplyingTo(null)
    }
  }

  // Options du menu "⋯" selon que le commentaire est le mien ou non
  function menuOptions(comment: Comment): SheetOption[] {
    if (comment.userId === session?.user.id) {
      return [
        {
          label: 'Supprimer',
          destructive: true,
          onPress: () =>
            Alert.alert(
              'Supprimer le commentaire',
              comment.replyCount > 0 ? 'Ses réponses seront aussi supprimées.' : 'Cette action est définitive.',
              [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Supprimer', style: 'destructive', onPress: () => thread.remove(comment) },
              ],
            ),
        },
      ]
    }

    return [
      {
        label: 'Signaler',
        // Petit délai : sur iOS, on ne peut pas ouvrir un panneau pendant que le précédent se ferme
        onPress: () => setTimeout(() => setReportTarget(comment), 400),
      },
      {
        label: `Bloquer ${comment.username}`,
        destructive: true,
        onPress: () =>
          Alert.alert(
            `Bloquer ${comment.username} ?`,
            'Tu ne verras plus ses commentaires, nulle part dans l’app.',
            [
              { text: 'Annuler', style: 'cancel' },
              { text: 'Bloquer', style: 'destructive', onPress: () => thread.block(comment.userId) },
            ],
          ),
      },
    ]
  }

  function reportOptions(comment: Comment): SheetOption[] {
    return REPORT_REASONS.map((reason) => ({
      label: reason.label,
      onPress: async () => {
        const message = await thread.report(comment, reason.value)
        Alert.alert('Signalement', message)
      },
    }))
  }

  // Un commentaire + ses réponses (si dépliées)
  function renderComment({ item }: { item: Comment }) {
    const expanded = thread.expanded.has(item.id)
    return (
      <View>
        <CommentCard
          comment={item}
          repliesExpanded={expanded}
          onLike={thread.toggleLike}
          onReply={isRead ? setReplyingTo : undefined}
          onToggleReplies={thread.toggleReplies}
          onMenu={setMenuComment}
        />
        {expanded &&
          (thread.replies[item.id] ?? []).map((reply) => (
            <CommentCard key={reply.id} comment={reply} isReply onLike={thread.toggleLike} onMenu={setMenuComment} />
          ))}
      </View>
    )
  }

  const title = context ? `Chapitre ${formatChapter(context.chapter.number)}` : 'Commentaires'

  if (contextLoading) {
    return <ActivityIndicator style={styles.loader} size="large" />
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
      // La barre du haut prend de la place : on la compte pour que le champ reste visible
      keyboardVerticalOffset={headerHeight}
    >
      <Stack.Screen options={{ title: `Commentaires · ${title}` }} />

      {/* Tri */}
      <View style={styles.sortRow}>
        {(['recent', 'popular'] as const).map((value) => (
          <Pressable
            key={value}
            style={[styles.sortChip, thread.sort === value && styles.sortChipActive]}
            onPress={() => thread.setSort(value)}
          >
            <Text style={[styles.sortText, thread.sort === value && styles.sortTextActive]}>
              {value === 'recent' ? 'Les plus récents' : 'Les plus aimés'}
            </Text>
          </Pressable>
        ))}
      </View>

      {thread.error && <Text style={styles.error}>{thread.error}</Text>}

      {showComments ? (
        <FlatList
          data={thread.comments}
          keyExtractor={(comment) => comment.id}
          renderItem={renderComment}
          extraData={[thread.expanded, thread.replies]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.list}
          // Pagination : charger la suite quand on approche du bas
          onEndReached={thread.loadMore}
          onEndReachedThreshold={0.5}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            thread.loading ? (
              <ActivityIndicator style={styles.loader} />
            ) : (
              <Text style={styles.empty}>Aucun commentaire pour l’instant. Lance la discussion !</Text>
            )
          }
          ListFooterComponent={thread.loadingMore ? <ActivityIndicator style={styles.footerLoader} /> : null}
        />
      ) : (
        // Protection anti-spoiler
        <View style={styles.spoiler}>
          <Ionicons name="eye-off-outline" size={40} color="#6C5CE7" />
          <Text style={styles.spoilerTitle}>Attention aux spoilers</Text>
          <Text style={styles.spoilerText}>
            Tu n’as pas encore lu ce chapitre. Les commentaires peuvent révéler ce qui s’y passe.
          </Text>
          <Pressable style={styles.revealButton} onPress={() => setRevealed(true)}>
            <Text style={styles.revealText}>Afficher quand même</Text>
          </Pressable>
        </View>
      )}

      {/* Zone de saisie */}
      <View style={[styles.composer, { paddingBottom: insets.bottom + 8 }]}>
        {!isRead ? (
          <Text style={styles.composerHint}>Marque le chapitre comme lu pour pouvoir commenter.</Text>
        ) : (
          <>
            {replyingTo && (
              <View style={styles.replyingTo}>
                <Text style={styles.replyingToText}>Réponse à {replyingTo.username}</Text>
                <Pressable onPress={() => setReplyingTo(null)} hitSlop={8} accessibilityLabel="Annuler la réponse">
                  <Ionicons name="close" size={18} color="#636e72" />
                </Pressable>
              </View>
            )}

            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder={replyingTo ? 'Écris ta réponse…' : 'Partage ton avis sur ce chapitre…'}
                placeholderTextColor="#999"
                value={text}
                onChangeText={setText}
                multiline
                maxLength={COMMENT_MAX_LENGTH}
              />
              <Pressable
                style={[styles.sendButton, (!text.trim() || sending) && styles.sendDisabled]}
                onPress={send}
                disabled={!text.trim() || sending}
                accessibilityLabel="Publier"
              >
                {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={18} color="#fff" />}
              </Pressable>
            </View>

            {text.length > COMMENT_MAX_LENGTH - 200 && (
              <Text style={styles.counter}>
                {text.length}/{COMMENT_MAX_LENGTH}
              </Text>
            )}
          </>
        )}
      </View>

      {/* Menu "⋯" */}
      <ActionSheet
        visible={menuComment !== null}
        options={menuComment ? menuOptions(menuComment) : []}
        onClose={() => setMenuComment(null)}
      />

      {/* Raisons de signalement */}
      <ActionSheet
        visible={reportTarget !== null}
        title="Pourquoi signales-tu ce commentaire ?"
        options={reportTarget ? reportOptions(reportTarget) : []}
        onClose={() => setReportTarget(null)}
      />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loader: { marginTop: 48 },
  footerLoader: { marginVertical: 16 },
  sortRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' },
  sortChip: { borderWidth: 1, borderColor: '#ddd', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  sortChipActive: { backgroundColor: '#6C5CE7', borderColor: '#6C5CE7' },
  sortText: { color: '#2d3436' },
  sortTextActive: { color: '#fff', fontWeight: '600' },
  error: { color: '#d63031', paddingHorizontal: 16, paddingTop: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 16, flexGrow: 1 },
  separator: { height: 1, backgroundColor: '#f1f2f6' },
  empty: { textAlign: 'center', color: '#636e72', marginTop: 48 },
  spoiler: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  spoilerTitle: { fontSize: 18, fontWeight: 'bold' },
  spoilerText: { textAlign: 'center', color: '#636e72', lineHeight: 20 },
  revealButton: { marginTop: 8, borderWidth: 1, borderColor: '#6C5CE7', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16 },
  revealText: { color: '#6C5CE7', fontWeight: '600' },
  composer: { borderTopWidth: 1, borderColor: '#eee', paddingHorizontal: 12, paddingTop: 8, gap: 6, backgroundColor: '#fff' },
  composerHint: { textAlign: 'center', color: '#636e72', paddingVertical: 8 },
  replyingTo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 },
  replyingToText: { color: '#6C5CE7', fontSize: 13, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
  },
  sendButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#6C5CE7', alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.4 },
  counter: { alignSelf: 'flex-end', fontSize: 12, color: '#e17055' },
})
