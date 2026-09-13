import { useState } from 'react'
import { KeyboardAvoidingView, Platform, StyleSheet, Text } from 'react-native'
import { Link } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { USERNAME_REGEX, USERNAME_RULES } from '@/lib/username'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'

export default function SignUpScreen() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function signUp() {
    setError(null)
    setInfo(null)
    const cleanUsername = username.trim()

    // 1. Vérification locale du format : instantanée, sans appel réseau
    if (!USERNAME_REGEX.test(cleanUsername)) {
      setError(`Pseudo invalide (${USERNAME_RULES})`)
      return
    }

    setLoading(true)

    // 2. Le pseudo est-il libre ? On appelle la fonction SQL (RPC = Remote Procedure Call)
    const { data: available, error: rpcError } = await supabase.rpc('is_username_available', {
      p_username: cleanUsername,
    })

    if (rpcError) {
      setLoading(false)
      setError(rpcError.message)
      return
    }
    if (!available) {
      setLoading(false)
      setError('Ce pseudo est déjà pris')
      return
    }

    // 3. Création du compte. "data" finit dans auth.users.raw_user_meta_data,
    //    où le trigger handle_new_user va lire le pseudo.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { username: cleanUsername } },
    })

    setLoading(false)

    if (signUpError) {
      setError(translateSignUpError(signUpError.code, signUpError.message))
      return
    }

    // Si la confirmation par email est activée, il n'y a pas encore de session
    if (!data.session) {
      setInfo('Compte créé ! Confirme ton adresse via l’email reçu, puis connecte-toi.')
    }
    // Sinon : comme pour la connexion, Stack.Protected bascule tout seul vers les onglets
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>Créer un compte</Text>

      <Input
        placeholder="Pseudo"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
      />
      <Text style={styles.hint}>{USERNAME_RULES}</Text>

      <Input
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
      />
      <Input
        placeholder="Mot de passe (6 caractères min.)"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
      />

      {error && <Text style={styles.error}>{error}</Text>}
      {info && <Text style={styles.info}>{info}</Text>}

      <Button
        title="Créer mon compte"
        onPress={signUp}
        loading={loading}
        disabled={!username || !email || !password}
      />

      <Link href="/sign-in" replace style={styles.link}>
        Déjà un compte ? Se connecter
      </Link>
    </KeyboardAvoidingView>
  )
}

// Traduit les erreurs de Supabase Auth en messages compréhensibles
function translateSignUpError(code: string | undefined, message: string) {
  switch (code) {
    case 'user_already_exists':
      return 'Un compte existe déjà avec cet email'
    case 'weak_password':
      return 'Mot de passe trop faible (6 caractères minimum)'
    case 'email_address_invalid':
      return 'Adresse email invalide'
  }
  // Le trigger a échoué : typiquement, quelqu'un a pris le pseudo entre la vérification et l'inscription
  if (message.includes('Database error')) {
    return 'Ce pseudo vient d’être pris, choisis-en un autre'
  }
  return message
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 24 },
  hint: { color: '#636e72', fontSize: 12, marginTop: -6 },
  error: { color: '#d63031' },
  info: { color: '#00b894' },
  link: { color: '#6C5CE7', textAlign: 'center', marginTop: 8 },
})
