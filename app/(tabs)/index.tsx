import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { supabase } from '@/lib/supabase'

export default function HomeScreen() {
  const [status, setStatus] = useState('Connexion en cours...')

  // Test de connexion Supabase (temporaire, sera remplacé par le feed d'activité)
  useEffect(() => {
    async function testConnection() {
      const { data, error } = await supabase.from('genre').select('name')

      if (error) {
        setStatus('Erreur : ' + error.message)
      } else {
        setStatus('Connecté ! Genres : ' + data.map(g => g.name).join(', '))
      }
    }

    testConnection()
  }, [])

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Feed d'activité</Text>
      <Text>{status}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, gap: 12 },
  title: { fontSize: 20, fontWeight: 'bold' },
})
