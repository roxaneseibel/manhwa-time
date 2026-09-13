import { useState } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'

type Props = {
  text: string
  numberOfLines?: number
}

// Texte tronqué avec un bouton "Lire plus" / "Réduire"
export function ExpandableText({ text, numberOfLines = 5 }: Props) {
  const [expanded, setExpanded] = useState(false)

  return (
    <Pressable onPress={() => setExpanded(!expanded)}>
      <Text style={styles.text} numberOfLines={expanded ? undefined : numberOfLines}>
        {text}
      </Text>
      <Text style={styles.toggle}>{expanded ? 'Réduire' : 'Lire plus'}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  text: { fontSize: 15, lineHeight: 22, color: '#2d3436' },
  toggle: { color: '#6C5CE7', fontWeight: '600', marginTop: 4 },
})
