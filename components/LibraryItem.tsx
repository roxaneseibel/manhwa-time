import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { markNextChapter } from '@/lib/chapterTracking'
import { formatChapter } from '@/lib/readingProgress'
import type { LibraryEntry } from '@/types/readingProgress'

type Props = {
  entry: LibraryEntry
  onChanged: () => void // demande à la liste de se recharger
}

export function LibraryItem({ entry, onChanged }: Props) {
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const { webtoon } = entry
  const total = webtoon.totalChapters
  const chapter = entry.currentChapter

  const behind = total != null ? total - chapter : null
  const showBehind = entry.status !== 'plan_to_read' && behind != null
  const canReadNext = webtoon.anilistId != null && (behind == null || behind > 0)

  function openFiche() {
    if (webtoon.anilistId != null) router.push(`/webtoon/${webtoon.anilistId}`)
  }

  async function readNext() {
    if (webtoon.anilistId == null) return
    setSaving(true)
    setMessage(null)
    try {
      const marked = await markNextChapter(webtoon.anilistId, entry.webtoonId, chapter)
      if (marked == null) setMessage('Aucun chapitre suivant connu')
      else onChanged()
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Pressable style={styles.row} onPress={openFiche}>
      <Image source={webtoon.coverUrl} style={styles.cover} contentFit="cover" transition={200} />

      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {webtoon.title}
        </Text>
        <Text style={styles.progress}>
          Ch. {formatChapter(chapter)}
          {total != null && ` / ${total}`}
        </Text>
        {showBehind &&
          (behind > 0 ? (
            <Text style={styles.behind}>{formatChapter(behind)} de retard</Text>
          ) : (
            <Text style={styles.upToDate}>À jour ✓</Text>
          ))}
        {message && <Text style={styles.message}>{message}</Text>}
      </View>

      {canReadNext && (
        <Pressable style={styles.nextButton} onPress={readNext} disabled={saving} hitSlop={6}>
          {saving ? (
            <ActivityIndicator size="small" color="#00b894" />
          ) : (
            <>
              <Ionicons name="checkmark" size={16} color="#00b894" />
              <Text style={styles.nextText}>Ch. {formatChapter(Math.floor(chapter) + 1)}</Text>
            </>
          )}
        </Pressable>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  cover: { width: 56, height: 80, borderRadius: 6, backgroundColor: '#eee' },
  info: { flex: 1, gap: 3 },
  title: { fontSize: 15, fontWeight: '600' },
  progress: { color: '#2d3436' },
  behind: { color: '#e17055', fontSize: 13, fontWeight: '600' },
  upToDate: { color: '#00b894', fontSize: 13, fontWeight: '600' },
  message: { color: '#636e72', fontSize: 12 },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 80,
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#00b894',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  nextText: { color: '#00b894', fontWeight: '600' },
})
