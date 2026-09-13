import { Image } from 'expo-image'
import { Link } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { COUNTRY_LABELS, STATUS_LABELS, displayTitle, findMatchingAltTitle } from '@/lib/anilist'
import type { AnilistSearchResult } from '@/types/anilist'

type Props = {
  item: AnilistSearchResult
  query: string // la recherche tapée, pour repérer un titre alternatif correspondant
}

export function WebtoonSearchItem({ item, query }: Props) {
  const altTitle = findMatchingAltTitle(item, query)

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
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={2}>
              {displayTitle(item)}
            </Text>
            {item.isAdult && <Text style={styles.adultBadge}>18+</Text>}
          </View>
          {altTitle && (
            <Text style={styles.altTitle} numberOfLines={1}>
              Aussi connu sous : {altTitle}
            </Text>
          )}
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
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  title: { flexShrink: 1, fontSize: 16, fontWeight: '600' },
  adultBadge: {
    color: '#fff',
    backgroundColor: '#d63031',
    fontSize: 11,
    fontWeight: 'bold',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  altTitle: { color: '#6C5CE7', fontSize: 13, fontStyle: 'italic' },
  meta: { color: '#636e72', fontSize: 13 },
})
