import { useLocalSearchParams } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'

export default function WebtoonScreen() {
  // Le nom du fichier [id].tsx fait que "id" est récupéré depuis l'URL
  const { id } = useLocalSearchParams<{ id: string }>()

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Fiche du webtoon</Text>
      <Text>id : {id}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, gap: 12 },
  title: { fontSize: 20, fontWeight: 'bold' },
})
