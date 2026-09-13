import { Ionicons } from '@expo/vector-icons'
import { useMemo, useState, type ReactElement } from 'react'
import { router } from 'expo-router'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { CheckButton, ChapterRow } from '@/components/ChapterRow'
import { useChapterList } from '@/hooks/useChapterList'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'
import { handleChapterCheck } from '@/lib/chapterAlerts'
import { getMyChapterRead } from '@/lib/chapterTracking'
import { formatDate } from '@/lib/dates'
import { formatChapter } from '@/lib/readingProgress'
import type { Chapter } from '@/types/chapterTracking'

type Props = {
  anilistId: number
  header: ReactElement           // l'en-tête de la fiche (bannière, titre, onglets...)
  onProgressChanged: () => void
}

export function ChaptersTab({ anilistId, header, onProgressChanged }: Props) {
  const list = useChapterList(anilistId, onProgressChanged)
  const [newestFirst, setNewestFirst] = useState(false)

  // useMemo : on ne recrée la liste inversée que si les chapitres ou l'ordre changent
  const orderedChapters = useMemo(
    () => (newestFirst ? [...list.chapters].reverse() : list.chapters),
    [list.chapters, newestFirst],
  )

  // Revenir d'une page chapitre (où on a pu cocher ou noter) → recharger discrètement
  useRefreshOnFocus(list.refreshSilently)

  // Appui sur le rond d'un chapitre
  async function onPressCheck(chapter: Chapter) {
    let readCount = list.readCounts.get(chapter.id) ?? 0
    let hasReaction = list.reactedIds.has(chapter.id)

    // Chapitre déjà lu : on relit SA ligne en base au moment de l'appui.
    // La liste peut être en retard : une note posée sur la page du chapitre
    // juste avant de revenir n'est peut-être pas encore arrivée au rechargement.
    if (readCount > 0) {
      try {
        const fresh = await getMyChapterRead(chapter.id)
        if (fresh) {
          readCount = fresh.readCount
          hasReaction = fresh.rating != null || fresh.emotion != null
        }
      } catch {
        // Hors ligne : on garde ce que la liste sait déjà
      }
    }

    handleChapterCheck({
      chapterNumber: chapter.number,
      readCount,
      unreadBefore: list.countUnreadBefore(chapter),
      hasReaction,
      onMarkRead: (includePrevious) => list.markRead(chapter, includePrevious),
      onReread: () => list.reread(chapter),
      onUnmark: () => list.unmark(chapter),
    })
  }

  function openChapter(chapter: Chapter) {
    router.push(`/chapter/${chapter.id}`)
  }

  // Tout ce qui s'affiche au-dessus de la liste des chapitres
  const listHeader = (
    <View>
      {header}

      <View style={styles.section}>
        {list.error && <Text style={styles.error}>{list.error}</Text>}

        {!list.loading && list.chapters.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Continuer la lecture</Text>
            <ContinueCard
              nextChapter={list.nextChapter}
              onPressCheck={() => list.nextChapter && onPressCheck(list.nextChapter)}
              onPress={() => list.nextChapter && openChapter(list.nextChapter)}
            />

            <View style={styles.listTitleRow}>
              <Text style={styles.sectionTitle}>
                Tous les chapitres{' '}
                <Text style={styles.counter}>
                  {list.readTotal}/{list.chapters.length}
                </Text>
              </Text>
              <Pressable style={styles.sortButton} onPress={() => setNewestFirst(!newestFirst)} hitSlop={8}>
                <Ionicons name="swap-vertical" size={16} color="#6C5CE7" />
                <Text style={styles.sortText}>{newestFirst ? 'Plus récents' : 'Plus anciens'}</Text>
              </Pressable>
            </View>

            {/* Barre de progression */}
            <View style={styles.progressTrack}>
              <View
                style={[styles.progressFill, { width: `${(list.readTotal / list.chapters.length) * 100}%` }]}
              />
            </View>
          </>
        )}
      </View>
    </View>
  )

  return (
    <FlatList
      data={orderedChapters}
      keyExtractor={(chapter) => chapter.id}
      // Sans extraData, la FlatList ne se redessinerait pas quand readCounts change
      // (seul "data" est surveillé par défaut)
      extraData={list.readCounts}
      renderItem={({ item }) => (
        <View style={styles.rowContainer}>
          <ChapterRow
            chapter={item}
            readCount={list.readCounts.get(item.id) ?? 0}
            onPressCheck={onPressCheck}
            onPress={openChapter}
          />
        </View>
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={
        list.loading ? (
          <ActivityIndicator style={styles.loader} />
        ) : !list.error ? (
          <Text style={styles.empty}>La liste des chapitres n’est pas disponible pour ce titre.</Text>
        ) : null
      }
      contentContainerStyle={styles.content}
      initialNumToRender={20}
    />
  )
}

type ContinueCardProps = {
  nextChapter: Chapter | null
  onPressCheck: () => void
  onPress: () => void
}

function ContinueCard({ nextChapter, onPressCheck, onPress }: ContinueCardProps) {
  if (!nextChapter) {
    return (
      <View style={[styles.card, styles.cardDone]}>
        <Text style={styles.cardDoneTitle}>À jour ! 🎉</Text>
        <Text style={styles.cardDoneText}>Tu as lu tous les chapitres sortis.</Text>
      </View>
    )
  }

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle}>Chapitre {formatChapter(nextChapter.number)}</Text>
        {nextChapter.publishedAt && (
          <Text style={styles.cardDate}>Sorti le {formatDate(nextChapter.publishedAt.slice(0, 10))}</Text>
        )}
      </View>
      <CheckButton readCount={0} onPress={onPressCheck} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  section: { paddingHorizontal: 16, gap: 10, marginTop: 8 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginTop: 8 },
  counter: { fontSize: 15, fontWeight: '500', color: '#636e72' },
  listTitleRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 8 },
  sortButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingBottom: 2 },
  sortText: { color: '#6C5CE7', fontSize: 13, fontWeight: '500' },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: '#dfe6e9', overflow: 'hidden', marginBottom: 4 },
  progressFill: { height: '100%', backgroundColor: '#00b894' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 12, backgroundColor: '#f1f0fe' },
  cardInfo: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#2d3436' },
  cardDate: { color: '#636e72' },
  cardDone: { flexDirection: 'column', alignItems: 'flex-start', backgroundColor: '#e6f9f4' },
  cardDoneTitle: { fontSize: 18, fontWeight: 'bold', color: '#00b894' },
  cardDoneText: { color: '#2d3436' },
  rowContainer: { paddingHorizontal: 16 },
  separator: { height: 1, backgroundColor: '#eee', marginHorizontal: 16 },
  loader: { marginTop: 32 },
  empty: { textAlign: 'center', color: '#636e72', marginTop: 32, paddingHorizontal: 16 },
  error: { color: '#d63031' },
})
