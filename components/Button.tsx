import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native'

type ButtonProps = {
  title: string
  onPress: () => void
  loading?: boolean   // affiche un spinner et bloque les clics
  disabled?: boolean
}

export function Button({ title, onPress, loading = false, disabled = false }: ButtonProps) {
  const isDisabled = loading || disabled

  return (
    <Pressable
      style={[styles.button, isDisabled && styles.disabled]}
      onPress={onPress}
      disabled={isDisabled}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.text}>{title}</Text>}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: { backgroundColor: '#6C5CE7', borderRadius: 8, padding: 14, alignItems: 'center' },
  disabled: { opacity: 0.6 },
  text: { color: '#fff', fontSize: 16, fontWeight: '600' },
})
