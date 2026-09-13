import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/providers/SessionProvider'

export default function ProfileScreen() {
  const { session } = useSession()
  const [username, setUsername] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Première requête "authentifiée" : la RLS doit nous laisser lire notre profil
  useEffect(() => {
    if (!session) return

    supabase
      .from('profile')
      .select('username')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setUsername(data.username)
      })
  }, [session])

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{username ?? '...'}</Text>
      <Text style={styles.email}>{session?.user.email}</Text>
      {error && <Text style={styles.error}>Erreur : {error}</Text>}

      <Pressable style={styles.button} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.buttonText}>Se déconnecter</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, gap: 8 },
  title: { fontSize: 20, fontWeight: 'bold' },
  email: { color: '#636e72' },
  error: { color: '#d63031' },
  button: { marginTop: 24, borderWidth: 1, borderColor: '#d63031', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20 },
  buttonText: { color: '#d63031', fontWeight: '600' },
})
