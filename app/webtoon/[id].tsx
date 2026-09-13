import { Image } from 'expo-image'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { ChapterInfoSection } from '@/components/ChapterInfoSection'
import { ChaptersTab } from '@/components/ChaptersTab'
import { ExpandableText } from '@/components/ExpandableText'
import { ReadingStatusButton } from '@/components/ReadingStatusButton'
import { WhereToReadSection } from '@/components/WhereToReadSection'
import { useAsync } from '@/hooks/useAsync'
import { useReadingEntry } from '@/hooks/useReadingEntry'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'
import {
  COUNTRY_LABELS,
  GENRE_LABELS,
  STATUS_LABELS,
  cleanDescription,
  displayTitle,
  getAnilistMedia,
} from '@/lib/anilist'

type Tab = 'about' | 'chapters'

export default function WebtoonScreen() {
  // Le nom du fichier [id].tsx fait que "id" est récupéré depuis l'URL (ici : l'id AniList)
  const { id } = useLocalSearchParams<{ id: string }>()
  const anilistId = Number(id)

  const [tab, setTab] = useState<Tab>('about')
  const { data: media, loading, error } = useAsync((signal) => getAnilistMedia(anilistId, signal), [anilistId])

  // L'état "dans ma liste" est géré ICI, puis partagé avec le bouton ET l'onglet Chapitres :
  // cocher un chapitre peut ajouter le titre à la liste, le bouton doit le savoir.
  const reading = useReadingEntry(anilistId)
  // Cocher un chapitre depuis sa page peut ajouter le titre à la liste : on recharge au retour
  useRefreshOnFocus(reading.reload)

  // Les hooks doivent TOUJOURS être appelés avant les "return" anticipés
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

  // En-tête commun aux deux onglets
  const header = (
    <View>
      {/* Modifie le titre de la barre du haut depuis l'écran lui-même */}
      <Stack.Screen options={{ title }} />

      {/* Bannière (ou bloc de couleur si le titre n'en a pas) */}
      {media.bannerImage ? (
        <Image source={media.bannerImage} style={styles.banner} contentFit="cover" />
      ) : (
        <View style={[styles.banner, { backgroundColor: accentColor }]} />
      )}

      {/* Couverture qui chevauche la bannière + titres */}
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

      <View style={styles.statusButton}>
        <ReadingStatusButton reading={reading} />
      </View>

      {/* Onglets */}
      <View style={styles.tabs}>
        <TabButton label="À propos" active={tab === 'about'} onPress={() => setTab('about')} />
        <TabButton label="Chapitres" active={tab === 'chapters'} onPress={() => setTab('chapters')} />
      </View>
    </View>
  )

  if (tab === 'chapters') {
    return (
      <ChaptersTab
        // key : si le titre est retiré de la liste (chapitres lus supprimés), l'onglet se recharge
        key={reading.entry ? 'in-list' : 'not-in-list'}
        anilistId={media.id}
        header={header}
        onProgressChanged={reading.reload}
      />
    )
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {header}

      <View style={styles.body}>
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

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.tab, active && styles.tabActive]} onPress={onPress}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
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
  statusButton: { paddingHorizontal: 16, marginTop: 16 },
  tabs: { flexDirection: 'row', marginTop: 16, borderBottomWidth: 1, borderColor: '#eee' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 3, borderColor: 'transparent' },
  tabActive: { borderColor: '#6C5CE7' },
  tabText: { fontSize: 15, fontWeight: '600', color: '#999', textTransform: 'uppercase' },
  tabTextActive: { color: '#2d3436' },
  body: { paddingHorizontal: 16, gap: 24, marginTop: 16 },
  genres: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  genre: { backgroundColor: '#f1f0fe', borderRadius: 12, paddingVertical: 4, paddingHorizontal: 10 },
  genreText: { color: '#6C5CE7', fontSize: 13 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold' },
})
