import { useState } from 'react'
import { KeyboardAvoidingView, Platform, StyleSheet, Text } from 'react-native'
import { Link } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'

export default function SignInScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function signIn() {
    setError(null)
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    setLoading(false)

    if (error) {
      setError(
        error.message === 'Invalid login credentials'
          ? 'Email ou mot de passe incorrect'
          : error.message,
      )
    }
    // Pas de navigation ici : en cas de succès, onAuthStateChange met à jour la session
    // et Stack.Protected bascule tout seul vers les onglets.
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>Manhwa Time</Text>

      <Input
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
      />
      <Input
        placeholder="Mot de passe"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Button title="Se connecter" onPress={signIn} loading={loading} disabled={!email || !password} />

      <Link href="/sign-up" replace style={styles.link}>
        Pas encore de compte ? Créer un compte
      </Link>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 24 },
  error: { color: '#d63031' },
  link: { color: '#6C5CE7', textAlign: 'center', marginTop: 8 },
})
