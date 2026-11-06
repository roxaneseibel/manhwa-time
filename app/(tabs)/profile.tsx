import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { StatsSection } from '@/components/StatsSection'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/providers/ProfileProvider'
import { useSession } from '@/providers/SessionProvider'

export default function ProfileScreen() {
  const router = useRouter()
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
    // ScrollView : l'écran dépasse maintenant la hauteur du téléphone
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.identity}>
        <Text style={styles.title}>{profile?.username ?? '...'}</Text>
        <Text style={styles.email}>{session?.user.email}</Text>
      </View>

      <Pressable style={styles.linkRow} onPress={() => router.push('/friends')}>
        <Ionicons name="people" size={20} color="#6C5CE7" />
        <Text style={styles.linkLabel}>Mes amis</Text>
        <Ionicons name="chevron-forward" size={18} color="#b2bec3" />
      </Pressable>

      <StatsSection />

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
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // Dans un ScrollView, le padding va sur contentContainerStyle, pas sur style.
  // paddingBottom plus grand : de la place sous le bouton de déconnexion.
  container: { padding: 20, paddingBottom: 48, gap: 24 },
  identity: { alignItems: 'center', gap: 4, marginTop: 24 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#eee' },
  linkLabel: { flex: 1, fontSize: 16 },
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
