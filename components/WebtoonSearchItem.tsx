import { Image } from 'expo-image'
import { Link } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { COUNTRY_LABELS, STATUS_LABELS, displayTitle } from '@/lib/anilist'
import type { AnilistSearchResult } from '@/types/anilist'

type Props = {
  item: AnilistSearchResult
}

export function WebtoonSearchItem({ item }: Props) {
  // Ex : "Manhwa · 2018 · Terminé" (filter(Boolean) retire les valeurs vides)
  const meta = [
    item.countryOfOrigin && COUNTRY_LABELS[item.countryOfOrigin],
    item.startDate.year,
    item.status && STATUS_LABELS[item.status],
  ]
    .filter(Boolean)
    .join(' · ')

  const details = [
    item.chapters && `${item.chapters} chapitres`,
    item.averageScore && `★ ${item.averageScore}%`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    // asChild : le Link transmet la navigation au Pressable au lieu de créer son propre texte
    <Link href={`/webtoon/${item.id}`} asChild>
      <Pressable style={styles.row}>
        <Image
          source={item.coverImage.medium}
          style={[styles.cover, { backgroundColor: item.coverImage.color ?? '#eee' }]}
          contentFit="cover"
          transition={200}
        />
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={2}>
            {displayTitle(item)}
          </Text>
          <Text style={styles.meta}>{meta}</Text>
          {details !== '' && <Text style={styles.meta}>{details}</Text>}
        </View>
      </Pressable>
    </Link>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, paddingVertical: 8 },
  cover: { width: 60, height: 85, borderRadius: 6 },
  info: { flex: 1, justifyContent: 'center', gap: 4 },
  title: { fontSize: 16, fontWeight: '600' },
  meta: { color: '#636e72', fontSize: 13 },
})
