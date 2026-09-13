import { StyleSheet, TextInput, type TextInputProps } from 'react-native'

// Un champ texte stylé une fois pour toutes.
// Il accepte toutes les props d'un TextInput normal (placeholder, value, secureTextEntry...).
export function Input({ style, ...props }: TextInputProps) {
  return <TextInput style={[styles.input, style]} placeholderTextColor="#999" {...props} />
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16 },
})
