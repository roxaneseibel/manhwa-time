import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useAsync } from '@/hooks/useAsync'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'
import { EMOTIONS } from '@/lib/chapterLabels'
import { READING_STATUSES, READING_STATUS_LABELS } from '@/lib/readingProgress'
import { formatReadingTime, getMyReadingStats } from '@/lib/stats'
import type { Emotion } from '@/types/chapterTracking'
import type { ReadingStats } from '@/types/stats'

// emotion → { emoji, label }, pour ne pas reparcourir le tableau à chaque ligne
const EMOTION_BY_VALUE = Object.fromEntries(EMOTIONS.map((e) => [e.value, e])) as Record<
  Emotion,
  (typeof EMOTIONS)[number]
>

export function StatsSection() {
  // Les chiffres bougent dès qu'on coche un chapitre : on les recharge quand
  // l'onglet redevient visible. Changer reloadKey relance useAsync.
  const [reloadKey, setReloadKey] = useState(0)
  const { data, loading, error } = useAsync((signal) => getMyReadingStats(signal), [reloadKey])
  useRefreshOnFocus(useCallback(() => setReloadKey((key) => key + 1), []))

  // useAsync remet data à null pendant un rechargement. On garde les derniers
  // chiffres connus à l'écran pour éviter que tout clignote au retour.
  const [lastStats, setLastStats] = useState<ReadingStats | null>(null)
  useEffect(() => {
    if (data) setLastStats(data)
  }, [data])

  const stats = data ?? lastStats

  if (!stats) {
    if (loading) return <Text style={styles.muted}>Chargement des statistiques...</Text>
    if (error) return <Text style={styles.error}>Statistiques indisponibles : {error}</Text>
    return null
  }

  // Rien de lu : un message qui dit quoi faire, plutôt qu'une grille de zéros
  if (stats.chaptersRead === 0) {
    return (
      <View style={styles.section}>
        <Text style={styles.heading}>Statistiques</Text>
        <Text style={styles.muted}>
          Coche ton premier chapitre pour voir tes statistiques de lecture apparaître ici.
        </Text>
      </View>
    )
  }

  const usedStatuses = READING_STATUSES.filter((status) => stats.byStatus[status] > 0)

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>Statistiques</Text>

      <View style={styles.grid}>
        <Tile value={String(stats.chaptersRead)} label="chapitres lus" />
        <Tile value={formatReadingTime(stats.minutesRead)} label="de lecture (estim.)" />
        <Tile value={String(stats.seriesTotal)} label={stats.seriesTotal > 1 ? 'séries' : 'série'} />
        <Tile
          value={stats.averageRating == null ? '—' : stats.averageRating.toFixed(1)}
          label={stats.ratedCount > 0 ? `note moyenne (${stats.ratedCount})` : 'aucune note'}
        />
      </View>

      {stats.rereads > 0 && (
        <Text style={styles.muted}>
          dont {stats.rereads} relecture{stats.rereads > 1 ? 's' : ''} ({stats.uniqueChapters}{' '}
          chapitres différents)
        </Text>
      )}

      {usedStatuses.length > 0 && (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Ma liste</Text>
          <View style={styles.chips}>
            {usedStatuses.map((status) => (
              <View key={status} style={styles.chip}>
                <Text style={styles.chipText}>
                  {READING_STATUS_LABELS[status]} · {stats.byStatus[status]}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {stats.topGenres.length > 0 && (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Genres favoris</Text>
          <View style={styles.chips}>
            {stats.topGenres.map((genre) => (
              <View key={genre.name} style={styles.chip}>
                <Text style={styles.chipText}>
                  {genre.name} · {genre.count}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {stats.topEmotions.length > 0 && (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Ce que tu ressens le plus</Text>
          <View style={styles.chips}>
            {stats.topEmotions.map(({ emotion, count }) => {
              const label = EMOTION_BY_VALUE[emotion]
              // Une émotion inconnue (ajoutée en base mais pas encore dans
              // l'app) ne doit pas faire planter l'écran
              if (!label) return null
              return (
                <View key={emotion} style={styles.chip}>
                  <Text style={styles.chipText}>
                    {label.emoji} {label.label} · {count}
                  </Text>
                </View>
              )
            })}
          </View>
        </View>
      )}
    </View>
  )
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  heading: { fontSize: 16, fontWeight: '600' },
  // Deux colonnes : chaque tuile prend un peu moins de la moitié, le "gap"
  // fait le reste. Plus souple qu'une largeur calculée à la main.
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: '#f6f5ff',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    gap: 2,
  },
  tileValue: { fontSize: 22, fontWeight: 'bold', color: '#6C5CE7' },
  tileLabel: { fontSize: 12, color: '#636e72' },
  block: { gap: 6 },
  blockTitle: { fontSize: 13, fontWeight: '600', color: '#2d3436' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: '#f1f2f6', borderRadius: 14, paddingVertical: 5, paddingHorizontal: 10 },
  chipText: { fontSize: 12, color: '#2d3436' },
  muted: { color: '#636e72', fontSize: 12 },
  error: { color: '#d63031', fontSize: 12 },
})
