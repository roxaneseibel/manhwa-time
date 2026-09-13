import { useState } from 'react'
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native'
import { SearchBar } from '@/components/SearchBar'
import { WebtoonSearchItem } from '@/components/WebtoonSearchItem'
import { useAnilistSearch } from '@/hooks/useAnilistSearch'

export default function SearchScreen() {
  const [query, setQuery] = useState('')
  const { results, isFuzzy, loading, error, tooShort } = useAnilistSearch(query)

  // Ce qu'on affiche quand la liste est vide
  function renderEmpty() {
    if (loading) return null
    if (tooShort) return <Text style={styles.empty}>Tape le nom d’un webtoon</Text>
    return <Text style={styles.empty}>Aucun résultat</Text>
  }

  // Bandeau au-dessus des résultats approchants
  function renderHeader() {
    if (!isFuzzy || loading || results.length === 0) return null
    return (
      <View style={styles.fuzzyBanner}>
        <Text style={styles.fuzzyText}>Aucun résultat exact. Tu cherchais peut-être :</Text>
        <Text style={styles.credit}>Suggestions via MangaBaka</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <SearchBar placeholder="Rechercher un webtoon..." value={query} onChangeText={setQuery} />

      {error && <Text style={styles.error}>{error}</Text>}
      {loading && <ActivityIndicator style={styles.loader} />}

      {/* FlatList : n'affiche que les lignes visibles à l'écran (performant pour les longues listes) */}
      <FlatList
        data={results}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <WebtoonSearchItem item={item} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  error: { color: '#d63031' },
  loader: { marginVertical: 8 },
  separator: { height: 1, backgroundColor: '#eee' },
  empty: { textAlign: 'center', color: '#636e72', marginTop: 32 },
  fuzzyBanner: { paddingVertical: 8, gap: 2 },
  fuzzyText: { color: '#2d3436', fontStyle: 'italic' },
  credit: { color: '#999', fontSize: 11 },
})
