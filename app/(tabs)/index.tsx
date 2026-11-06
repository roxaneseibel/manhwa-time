import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { ActivityCard } from '@/components/ActivityCard'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'
import { FEED_PAGE_SIZE, getMyFeed } from '@/lib/activity'
import type { ActivityItem } from '@/types/activity'

export default function HomeScreen() {
  const router = useRouter()

  const [items, setItems] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // false dès qu'une page revient incomplète : plus rien à charger ensuite
  const [hasMore, setHasMore] = useState(true)

  // Évite deux chargements simultanés (onEndReached se déclenche parfois
  // plusieurs fois d'affilée pendant un scroll rapide).
  const isFetching = useRef(false)

  // Recharge depuis le début
  const refresh = useCallback(async () => {
    if (isFetching.current) return
    isFetching.current = true
    setError(null)

    try {
      const page = await getMyFeed(null)
      setItems(page)
      setHasMore(page.length === FEED_PAGE_SIZE)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      isFetching.current = false
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // Charge la suite, à partir de la date de la dernière ligne affichée
  const loadMore = useCallback(async () => {
    if (isFetching.current || !hasMore || items.length === 0) return
    isFetching.current = true
    setLoadingMore(true)

    try {
      const page = await getMyFeed(items[items.length - 1].createdAt)
      // Filet anti-doublon : deux activités exactement à la même date
      // pourraient sinon revenir deux fois.
      const seen = new Set(items.map((item) => item.id))
      setItems((current) => [...current, ...page.filter((item) => !seen.has(item.id))])
      setHasMore(page.length === FEED_PAGE_SIZE)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      isFetching.current = false
      setLoadingMore(false)
    }
  }, [hasMore, items])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Au retour sur l'onglet : on recharge discrètement, sans vider la liste
  useRefreshOnFocus(refresh)

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    )
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={items.length === 0 ? styles.emptyContainer : styles.list}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true)
            refresh()
          }}
        />
      }
      renderItem={({ item }) => <ActivityCard item={item} />}
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footer} /> : null}
      ListHeaderComponent={error ? <Text style={styles.error}>Erreur : {error}</Text> : null}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Rien à afficher pour l’instant</Text>
          <Text style={styles.emptyText}>
            Ce fil montre ce que tes amis lisent, terminent et notent.{'\n'}
            Ta propre activité y apparaît aussi dès que tu coches un chapitre.
          </Text>
          <Pressable style={styles.cta} onPress={() => router.push('/friends')}>
            <Text style={styles.ctaText}>Trouver des amis</Text>
          </Pressable>
        </View>
      }
    />
  )
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyContainer: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '600' },
  emptyText: { color: '#636e72', textAlign: 'center', lineHeight: 20 },
  cta: {
    marginTop: 8,
    backgroundColor: '#6C5CE7',
    borderRadius: 8,
    paddingVertical: 11,
    paddingHorizontal: 20,
  },
  ctaText: { color: '#fff', fontWeight: '600' },
  footer: { marginVertical: 16 },
  error: { color: '#d63031', paddingVertical: 8 },
})
