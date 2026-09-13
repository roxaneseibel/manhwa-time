import { Ionicons } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { formatDate } from '@/lib/dates'
import { formatChapter } from '@/lib/readingProgress'
import type { Chapter } from '@/types/chapterTracking'

type Props = {
  chapter: Chapter
  readCount: number // 0 = non lu, 1 = lu, 2 = ×2...
  onPressCheck: (chapter: Chapter) => void
  onPress: (chapter: Chapter) => void // ouvrir la page du chapitre
}

export function ChapterRow({ chapter, readCount, onPressCheck, onPress }: Props) {
  return (
    // Le rond (Pressable imbriqué) capte son propre appui ; le reste de la ligne ouvre la page
    <Pressable style={styles.row} onPress={() => onPress(chapter)}>
      <View style={styles.info}>
        <Text style={[styles.title, readCount > 0 && styles.titleRead]}>
          Chapitre {formatChapter(chapter.number)}
        </Text>
        <Text style={styles.date}>
          {chapter.publishedAt ? formatDate(chapter.publishedAt.slice(0, 10)) : 'Date inconnue'}
        </Text>
      </View>

      <CheckButton readCount={readCount} onPress={() => onPressCheck(chapter)} />
    </Pressable>
  )
}

// Le rond à droite : vide (non lu), ✓ vert (lu), ×2 vert (relu)
export function CheckButton({ readCount, onPress }: { readCount: number; onPress: () => void }) {
  const read = readCount > 0

  return (
    <Pressable
      style={[styles.check, read ? styles.checkRead : styles.checkUnread]}
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel={read ? `Lu ${readCount} fois` : 'Marquer comme lu'}
    >
      {readCount > 1 ? (
        <Text style={styles.count}>×{readCount}</Text>
      ) : (
        <Ionicons name="checkmark" size={22} color={read ? '#fff' : '#b2bec3'} />
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  info: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '600', color: '#2d3436' },
  titleRead: { color: '#636e72' },
  date: { fontSize: 13, color: '#999' },
  check: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  checkUnread: { borderWidth: 2, borderColor: '#dfe6e9' },
  checkRead: { backgroundColor: '#00b894' },
  count: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
})
