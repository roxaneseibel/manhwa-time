import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { LANGUAGE_LABELS } from '@/lib/anilist'
import type { AnilistExternalLink } from '@/types/anilist'

type Props = {
  links: AnilistExternalLink[]
}

// Ordre d'affichage : français d'abord, puis anglais, puis le reste
const LANGUAGE_PRIORITY = ['French', 'English']

function priority(link: AnilistExternalLink) {
  const index = LANGUAGE_PRIORITY.indexOf(link.language ?? '')
  return index === -1 ? LANGUAGE_PRIORITY.length : index
}

export function WhereToReadSection({ links }: Props) {
  // On ne garde que les plateformes de lecture officielles
  const readingLinks = links
    .filter((link) => link.type === 'STREAMING')
    .sort((a, b) => priority(a) - priority(b))

  if (readingLinks.length === 0) {
    return <Text style={styles.muted}>Aucune plateforme officielle connue.</Text>
  }

  return (
    <View style={styles.chips}>
      {readingLinks.map((link) => (
        <Pressable key={link.url} style={styles.chip} onPress={() => Linking.openURL(link.url)}>
          <Text style={styles.chipText}>
            {link.site}
            {link.language && ` · ${LANGUAGE_LABELS[link.language] ?? link.language}`}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#6C5CE7', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  chipText: { color: '#6C5CE7', fontWeight: '500' },
  muted: { color: '#636e72' },
})
