import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Avatar } from '@/components/UserRow'
import { describeActivity } from '@/lib/activity'
import { formatRelativeTime } from '@/lib/dates'
import type { ActivityItem, ActivityType } from '@/types/activity'

// Une icône par type d'événement : on repère la nature d'une ligne avant même
// de lire la phrase.
const ICONS: Record<ActivityType, { name: keyof typeof Ionicons.glyphMap; color: string }> = {
  chapters_read: { name: 'book', color: '#6C5CE7' },
  series_started: { name: 'play', color: '#00b894' },
  series_completed: { name: 'checkmark-done', color: '#0984e3' },
  chapter_rated: { name: 'star', color: '#fdcb6e' },
}

export function ActivityCard({ item }: { item: ActivityItem }) {
  const router = useRouter()

  // La route de la fiche attend l'id AniList. Il est null pour un ajout
  // manuel (Phase 4) : dans ce cas la ligne n'est pas cliquable.
  const canOpen = item.anilistId != null
  const icon = ICONS[item.type]

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && canOpen && styles.pressed]}
      disabled={!canOpen}
      onPress={() => router.push(`/webtoon/${item.anilistId}`)}
    >
      <Avatar username={item.username} avatarUrl={item.avatarUrl} size={36} />

      <View style={styles.body}>
        <Text style={styles.text}>
          <Text style={styles.username}>{item.username} </Text>
          {describeActivity(item)}
        </Text>

        <View style={styles.meta}>
          <Ionicons name={icon.name} size={12} color={icon.color} />
          <Text style={styles.time}>{formatRelativeTime(item.createdAt)}</Text>
        </View>
      </View>

      {!!item.coverUrl && (
        <Image source={{ uri: item.coverUrl }} style={styles.cover} contentFit="cover" transition={150} />
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f2f6',
  },
  pressed: { opacity: 0.6 },
  body: { flex: 1, gap: 4 },
  text: { fontSize: 14, lineHeight: 19, color: '#2d3436' },
  username: { fontWeight: '700' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  time: { fontSize: 11, color: '#636e72' },
  cover: { width: 38, height: 54, borderRadius: 4, backgroundColor: '#eee' },
})
