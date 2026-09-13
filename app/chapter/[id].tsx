import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { CheckButton } from '@/components/ChapterRow'
import { useChapterPage } from '@/hooks/useChapterPage'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'
import { handleChapterCheck } from '@/lib/chapterAlerts'
import { EMOTIONS, RATING_LABELS } from '@/lib/chapterLabels'
import { formatDate } from '@/lib/dates'
import { formatChapter } from '@/lib/readingProgress'

export default function ChapterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const page = useChapterPage(id)
  const { chapter, myRead } = page

  useRefreshOnFocus(page.refresh)

  if (page.loading) {
    return <ActivityIndicator style={styles.loader} size="large" />
  }

  if (!chapter) {
    return <Text style={[styles.loader, styles.error]}>Chapitre introuvable : {page.error}</Text>
  }

  const readCount = myRead?.readCount ?? 0
  const isRead = readCount > 0
  const heroImage = chapter.webtoon.bannerUrl ?? chapter.webtoon.coverUrl

  async function onPressCheck() {
    if (!chapter) return
    // La page ne charge pas toute la liste : on demande le compte à la base
    const unreadBefore = isRead ? 0 : await page.getUnreadBefore()

    handleChapterCheck({
      chapterNumber: chapter.number,
      readCount,
      unreadBefore,
      hasReaction: myRead?.rating != null || myRead?.emotion != null,
      onMarkRead: page.markRead,
      onReread: page.reread,
      onUnmark: page.unmark,
    })
  }

  // router.replace : remplace la page au lieu d'empiler (le retour ramène à la fiche)
  function goTo(chapterId: string | null) {
    if (chapterId) router.replace(`/chapter/${chapterId}`)
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: `Chapitre ${formatChapter(chapter.number)}` }} />

      {/* Image + titre */}
      <View style={styles.hero}>
        <Image source={heroImage} style={StyleSheet.absoluteFill} contentFit="cover" />
        <View style={styles.heroShade} />

        <Pressable
          style={styles.webtoonChip}
          onPress={() => chapter.webtoon.anilistId && router.push(`/webtoon/${chapter.webtoon.anilistId}`)}
        >
          <Text style={styles.webtoonChipText} numberOfLines={1}>
            {chapter.webtoon.title}
          </Text>
          <Ionicons name="chevron-forward" size={14} color="#fff" />
        </Pressable>

        <Text style={styles.heroTitle}>Chapitre {formatChapter(chapter.number)}</Text>
      </View>

      {/* Dates + rond lu/non lu */}
      <View style={styles.infoRow}>
        <View style={styles.infoTexts}>
          <View style={styles.infoItem}>
            <Ionicons name="calendar-outline" size={16} color="#636e72" />
            <Text style={styles.infoText}>
              {chapter.publishedAt ? `Sorti le ${formatDate(chapter.publishedAt.slice(0, 10))}` : 'Date inconnue'}
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="eye-outline" size={16} color="#636e72" />
            <Text style={styles.infoText}>
              {myRead ? `Lu le ${formatDate(myRead.firstReadAt.slice(0, 10))}` : 'Pas lu'}
            </Text>
          </View>
        </View>

        {page.saving ? (
          <ActivityIndicator style={styles.checkLoader} />
        ) : (
          <CheckButton readCount={readCount} onPress={onPressCheck} />
        )}
      </View>

      {page.error && <Text style={styles.error}>{page.error}</Text>}

      {/* Note */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Noter ce chapitre</Text>
        {!isRead && <Text style={styles.hint}>Marque le chapitre comme lu pour le noter.</Text>}

        <View style={[styles.ratingRow, !isRead && styles.disabled]}>
          {RATING_LABELS.map((label, index) => {
            const value = index + 1
            const filled = myRead?.rating != null && value <= myRead.rating
            return (
              <Pressable
                key={label}
                style={styles.ratingItem}
                onPress={() => page.setRating(value)}
                disabled={!isRead}
                accessibilityLabel={`Note : ${label}`}
              >
                <Ionicons name={filled ? 'star' : 'star-outline'} size={34} color={filled ? '#fdcb6e' : '#b2bec3'} />
                <Text style={[styles.ratingLabel, myRead?.rating === value && styles.selectedLabel]}>{label}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      {/* Émotion */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ton ressenti</Text>
        {!isRead && <Text style={styles.hint}>Marque le chapitre comme lu pour partager ton ressenti.</Text>}

        <View style={[styles.emotionGrid, !isRead && styles.disabled]}>
          {EMOTIONS.map((emotion) => {
            const selected = myRead?.emotion === emotion.value
            return (
              <Pressable
                key={emotion.value}
                style={[styles.emotion, selected && styles.emotionSelected]}
                onPress={() => page.setEmotion(emotion.value)}
                disabled={!isRead}
              >
                <Text style={styles.emoji}>{emotion.emoji}</Text>
                <Text style={[styles.emotionLabel, selected && styles.selectedLabel]}>{emotion.label}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      {/* Commentaires */}
      <View style={styles.section}>
        <Pressable style={styles.commentsButton} onPress={() => router.push(`/comments/${chapter.id}`)}>
          <Ionicons name="chatbubbles-outline" size={22} color="#6C5CE7" />
          <Text style={styles.commentsText}>Commentaires</Text>
          <Text style={styles.commentsCount}>{page.commentCount}</Text>
          <Ionicons name="chevron-forward" size={20} color="#999" />
        </Pressable>
      </View>

      {/* Chapitre précédent / suivant */}
      <View style={styles.navRow}>
        <Pressable
          style={[styles.navButton, !page.neighbors.previousId && styles.disabled]}
          onPress={() => goTo(page.neighbors.previousId)}
          disabled={!page.neighbors.previousId}
        >
          <Ionicons name="chevron-back" size={18} color="#6C5CE7" />
          <Text style={styles.navText}>Précédent</Text>
        </Pressable>
        <Pressable
          style={[styles.navButton, !page.neighbors.nextId && styles.disabled]}
          onPress={() => goTo(page.neighbors.nextId)}
          disabled={!page.neighbors.nextId}
        >
          <Text style={styles.navText}>Suivant</Text>
          <Ionicons name="chevron-forward" size={18} color="#6C5CE7" />
        </Pressable>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  loader: { marginTop: 64, textAlign: 'center', padding: 20 },
  content: { paddingBottom: 40 },
  error: { color: '#d63031', textAlign: 'center', paddingHorizontal: 16 },
  hero: { height: 200, justifyContent: 'space-between', padding: 16, backgroundColor: '#2d3436' },
  heroShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  webtoonChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 2,
    maxWidth: '80%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    borderRadius: 14,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  webtoonChipText: { color: '#fff', fontWeight: '600', textTransform: 'uppercase', fontSize: 12 },
  heroTitle: { color: '#fff', fontSize: 30, fontWeight: 'bold' },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  infoTexts: { flex: 1, gap: 6 },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoText: { color: '#2d3436' },
  checkLoader: { width: 40 },
  section: { paddingHorizontal: 16, paddingTop: 24, gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold' },
  hint: { color: '#636e72', fontSize: 13 },
  disabled: { opacity: 0.4 },
  ratingRow: { flexDirection: 'row', justifyContent: 'space-between' },
  ratingItem: { alignItems: 'center', gap: 4, flex: 1 },
  ratingLabel: { fontSize: 12, color: '#636e72', fontWeight: '600', textTransform: 'uppercase' },
  selectedLabel: { color: '#6C5CE7' },
  emotionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emotion: {
    width: '23%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f5f6fa',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  emotionSelected: { borderColor: '#6C5CE7', backgroundColor: '#f1f0fe' },
  emoji: { fontSize: 30 },
  emotionLabel: { fontSize: 11, color: '#636e72', fontWeight: '600' },
  commentsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#f5f6fa',
  },
  commentsText: { flex: 1, fontSize: 17, fontWeight: 'bold', color: '#2d3436' },
  commentsCount: { fontSize: 16, color: '#636e72' },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 32 },
  navButton: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8 },
  navText: { color: '#6C5CE7', fontWeight: '600', fontSize: 15 },
})
