import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { LibraryItem } from '@/components/LibraryItem'
import { READING_STATUSES, READING_STATUS_LABELS, getMyList } from '@/lib/readingProgress'
import type { LibraryEntry, ReadingStatus } from '@/types/readingProgress'

export default function LibraryScreen() {
  const [entries, setEntries] = useState<LibraryEntry[]>([])
  const [filter, setFilter] = useState<ReadingStatus>('reading')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setEntries(await getMyList())
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Les onglets restent montés en arrière-plan : un useEffect ne se relancerait pas.
  // useFocusEffect, lui, s'exécute CHAQUE FOIS que l'onglet redevient visible
  // (ex : retour depuis une fiche où on vient d'ajouter un titre).
  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  async function onRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  // Nombre de titres par statut, affiché dans les filtres
  const counts = Object.fromEntries(
    READING_STATUSES.map((status) => [status, entries.filter((e) => e.status === status).length]),
  ) as Record<ReadingStatus, number>

  const visibleEntries = entries.filter((entry) => entry.status === filter)

  if (loading) {
    return <ActivityIndicator style={styles.loader} size="large" />
  }

  return (
    <View style={styles.container}>
      {/* Filtres par statut, défilables horizontalement */}
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {READING_STATUSES.map((status) => {
            const active = status === filter
            return (
              <Pressable
                key={status}
                style={[styles.filter, active && styles.filterActive]}
                onPress={() => setFilter(status)}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {READING_STATUS_LABELS[status]} ({counts[status]})
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={visibleEntries}
        // key = id + chapitre : la ligne est recréée quand le chapitre en cours change
        keyExtractor={(entry) => `${entry.id}-${entry.currentChapter}`}
        renderItem={({ item }) => <LibraryItem entry={item} onChanged={load} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text style={styles.empty}>
            {`Aucun titre dans « ${READING_STATUS_LABELS[filter]} ».\nUtilise la recherche pour en ajouter.`}
          </Text>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { marginTop: 64 },
  filters: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  filter: { borderWidth: 1, borderColor: '#ddd', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  filterActive: { backgroundColor: '#6C5CE7', borderColor: '#6C5CE7' },
  filterText: { color: '#2d3436' },
  filterTextActive: { color: '#fff', fontWeight: '600' },
  error: { color: '#d63031', paddingHorizontal: 16 },
  list: { paddingHorizontal: 16, paddingBottom: 24, flexGrow: 1 },
  separator: { height: 1, backgroundColor: '#eee' },
  empty: { textAlign: 'center', color: '#636e72', marginTop: 48, lineHeight: 22 },
})
