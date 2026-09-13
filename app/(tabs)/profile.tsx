import { useState } from 'react'
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/providers/ProfileProvider'
import { useSession } from '@/providers/SessionProvider'

export default function ProfileScreen() {
  const { session } = useSession()
  const { profile, error: loadError, updateProfile } = useProfile()
  const [error, setError] = useState<string | null>(null)

  async function setShowAdultContent(value: boolean) {
    setError(null)
    const updateError = await updateProfile({ show_adult_content: value })
    if (updateError) setError(updateError)
  }

  function onToggleAdultContent(value: boolean) {
    if (!value) {
      setShowAdultContent(false)
      return
    }
    // Activation : on demande une confirmation d'âge
    Alert.alert('Contenu adulte', 'Confirmes-tu avoir 18 ans ou plus ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Oui, j’ai 18 ans ou plus', onPress: () => setShowAdultContent(true) },
    ])
  }

  return (
    <View style={styles.container}>
      <View style={styles.identity}>
        <Text style={styles.title}>{profile?.username ?? '...'}</Text>
        <Text style={styles.email}>{session?.user.email}</Text>
      </View>

      <View style={styles.settingRow}>
        <View style={styles.settingText}>
          <Text style={styles.settingLabel}>Afficher le contenu adulte (18+)</Text>
          <Text style={styles.settingHint}>Inclut les titres pour adultes dans la recherche</Text>
        </View>
        <Switch
          value={profile?.show_adult_content ?? false}
          onValueChange={onToggleAdultContent}
          disabled={!profile}
          trackColor={{ true: '#6C5CE7' }}
        />
      </View>

      {(error || loadError) && <Text style={styles.error}>Erreur : {error ?? loadError}</Text>}

      <Pressable style={styles.button} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.buttonText}>Se déconnecter</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 24 },
  identity: { alignItems: 'center', gap: 4, marginTop: 24 },
  title: { fontSize: 20, fontWeight: 'bold' },
  email: { color: '#636e72' },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#eee' },
  settingText: { flex: 1, gap: 2 },
  settingLabel: { fontSize: 16 },
  settingHint: { color: '#636e72', fontSize: 12 },
  error: { color: '#d63031', textAlign: 'center' },
  button: { alignSelf: 'center', borderWidth: 1, borderColor: '#d63031', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20 },
  buttonText: { color: '#d63031', fontWeight: '600' },
})
