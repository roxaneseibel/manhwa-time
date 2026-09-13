import { Image } from 'expo-image'
import { Stack, useLocalSearchParams } from 'expo-router'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { ChapterInfoSection } from '@/components/ChapterInfoSection'
import { ReadingStatusButton } from '@/components/ReadingStatusButton'
import { ExpandableText } from '@/components/ExpandableText'
import { WhereToReadSection } from '@/components/WhereToReadSection'
import { useAsync } from '@/hooks/useAsync'
import {
  COUNTRY_LABELS,
  GENRE_LABELS,
  STATUS_LABELS,
  cleanDescription,
  displayTitle,
  getAnilistMedia,
} from '@/lib/anilist'

export default function WebtoonScreen() {
  // Le nom du fichier [id].tsx fait que "id" est récupéré depuis l'URL (ici : l'id AniList)
  const { id } = useLocalSearchParams<{ id: string }>()
  const anilistId = Number(id)

  const { data: media, loading, error } = useAsync((signal) => getAnilistMedia(anilistId, signal), [anilistId])

  if (loading) {
    return <ActivityIndicator style={styles.centered} size="large" />
  }

  if (error || !media) {
    return <Text style={[styles.centered, styles.error]}>Impossible de charger ce titre : {error}</Text>
  }

  const title = displayTitle(media)
  const accentColor = media.coverImage.color ?? '#6C5CE7'
  const synopsis = cleanDescription(media.description)
  const meta = [
    media.countryOfOrigin && COUNTRY_LABELS[media.countryOfOrigin],
    media.startDate.year,
    media.status && STATUS_LABELS[media.status],
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {/* Modifie le titre de la barre du haut depuis l'écran lui-même */}
      <Stack.Screen options={{ title }} />

      {/* Bannière (ou bloc de couleur si le titre n'en a pas) */}
      {media.bannerImage ? (
        <Image source={media.bannerImage} style={styles.banner} contentFit="cover" />
      ) : (
        <View style={[styles.banner, { backgroundColor: accentColor }]} />
      )}

      {/* En-tête : couverture qui chevauche la bannière + titres */}
      <View style={styles.header}>
        <Image
          source={media.coverImage.extraLarge}
          style={[styles.cover, { backgroundColor: accentColor }]}
          contentFit="cover"
          transition={200}
        />
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          {media.title.native && <Text style={styles.native}>{media.title.native}</Text>}
          <Text style={styles.meta}>{meta}</Text>
          {media.averageScore != null && <Text style={styles.score}>★ {media.averageScore}%</Text>}
        </View>
      </View>

      <View style={styles.body}>
        <ReadingStatusButton anilistId={media.id} />

        {/* Genres */}
        {media.genres.length > 0 && (
          <View style={styles.genres}>
            {media.genres.map((genre) => (
              <View key={genre} style={styles.genre}>
                <Text style={styles.genreText}>{GENRE_LABELS[genre] ?? genre}</Text>
              </View>
            ))}
          </View>
        )}

        <Section title="Chapitres">
          <ChapterInfoSection anilistId={media.id} anilistChapters={media.chapters} status={media.status} />
        </Section>

        {synopsis && (
          <Section title="Synopsis">
            <ExpandableText text={synopsis} />
          </Section>
        )}

        <Section title="Où lire">
          <WhereToReadSection links={media.externalLinks} />
        </Section>
      </View>
    </ScrollView>
  )
}

// Petit composant local : titre de section + contenu
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  centered: { flex: 1, marginTop: 64, textAlign: 'center', padding: 20 },
  error: { color: '#d63031' },
  content: { paddingBottom: 40 },
  banner: { width: '100%', height: 150 },
  header: { flexDirection: 'row', paddingHorizontal: 16, gap: 14, marginTop: -50 },
  cover: { width: 110, height: 160, borderRadius: 8, borderWidth: 3, borderColor: '#fff' },
  headerText: { flex: 1, justifyContent: 'flex-end', gap: 2 },
  title: { fontSize: 20, fontWeight: 'bold' },
  native: { color: '#636e72' },
  meta: { color: '#636e72', marginTop: 4 },
  score: { color: '#e17055', fontWeight: '600' },
  body: { paddingHorizontal: 16, gap: 24, marginTop: 16 },
  genres: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  genre: { backgroundColor: '#f1f0fe', borderRadius: 12, paddingVertical: 4, paddingHorizontal: 10 },
  genreText: { color: '#6C5CE7', fontSize: 13 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold' },
})
