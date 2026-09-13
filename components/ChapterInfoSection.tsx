import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native'
import { useAsync } from '@/hooks/useAsync'
import { getChapterInfo } from '@/lib/chapters'
import { formatDate, formatRelativeDate } from '@/lib/dates'
import type { AnilistMediaStatus } from '@/types/anilist'

type Props = {
  anilistId: number
  anilistChapters: number | null // nombre de chapitres connu par AniList (séries terminées)
  status: AnilistMediaStatus | null
}

export function ChapterInfoSection({ anilistId, anilistChapters, status }: Props) {
  // Ce composant charge SES données lui-même : le reste de la fiche s'affiche sans l'attendre
  const { data, loading } = useAsync(
    (signal) => getChapterInfo(anilistId, { chapters: anilistChapters, status }, signal),
    [anilistId],
  )

  if (loading) {
    return (
      <View style={styles.row}>
        <ActivityIndicator size="small" />
        <Text style={styles.muted}>Recherche des derniers chapitres…</Text>
      </View>
    )
  }

  if (data?.latestChapter == null) {
    return <Text style={styles.muted}>Infos de chapitres indisponibles pour ce titre.</Text>
  }

  const release = data.lastRelease

  return (
    <View style={styles.container}>
      <Text style={styles.big}>
        {data.latestChapter} chapitres
        {data.isFinished && <Text style={styles.finished}> · Série terminée</Text>}
      </Text>

      {release && (
        <Text style={styles.detail}>
          Dernière sortie repérée : {release.chapter && `ch. ${release.chapter} · `}
          {formatDate(release.date)} ({formatRelativeDate(release.date)})
          {release.groups.length > 0 && `\npar ${release.groups.join(', ')}`}
        </Text>
      )}

      {data.mangaUpdatesUrl && (
        <Text style={styles.credit} onPress={() => Linking.openURL(data.mangaUpdatesUrl!)}>
          Données : MangaUpdates
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  big: { fontSize: 22, fontWeight: 'bold' },
  finished: { fontSize: 16, fontWeight: '500', color: '#00b894' },
  detail: { color: '#2d3436', lineHeight: 20 },
  muted: { color: '#636e72' },
  credit: { color: '#999', fontSize: 11, marginTop: 4, textDecorationLine: 'underline' },
})
