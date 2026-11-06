import { Image } from 'expo-image'
import { StyleSheet, Text, View, type ViewStyle } from 'react-native'

type UserRowProps = {
  username: string
  avatarUrl?: string | null
  subtitle?: string | null
  // Ce qu'on affiche à droite : un bouton, deux boutons, un libellé...
  // On laisse l'écran décider, la ligne ne fait que la mise en page.
  right?: React.ReactNode
  style?: ViewStyle
}

export function UserRow({ username, avatarUrl, subtitle, right, style }: UserRowProps) {
  return (
    <View style={[styles.row, style]}>
      <Avatar username={username} avatarUrl={avatarUrl} />

      <View style={styles.text}>
        <Text style={styles.username} numberOfLines={1}>
          {username}
        </Text>
        {!!subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>

      {right}
    </View>
  )
}

// Tant qu'il n'y a pas d'envoi de photo de profil, avatar_url est toujours
// null : on affiche l'initiale du pseudo dans un rond coloré.
export function Avatar({
  username,
  avatarUrl,
  size = 40,
}: {
  username: string
  avatarUrl?: string | null
  size?: number
}) {
  const round = { width: size, height: size, borderRadius: size / 2 }

  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={round} contentFit="cover" transition={150} />
  }

  return (
    <View style={[styles.initials, round]}>
      <Text style={[styles.initialsText, { fontSize: size * 0.42 }]}>
        {username.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  text: { flex: 1, gap: 2 },
  username: { fontSize: 15, fontWeight: '600' },
  subtitle: { fontSize: 12, color: '#636e72' },
  initials: { backgroundColor: '#6C5CE7', alignItems: 'center', justifyContent: 'center' },
  initialsText: { color: '#fff', fontWeight: '700' },
})
