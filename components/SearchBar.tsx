import { Ionicons } from '@expo/vector-icons'
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native'

type SearchBarProps = Omit<TextInputProps, 'value' | 'onChangeText'> & {
  value: string
  onChangeText: (text: string) => void
}

export function SearchBar({ value, onChangeText, ...props }: SearchBarProps) {
  return (
    <View style={styles.container}>
      <Ionicons name="search" size={18} color="#999" />

      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor="#999"
        autoCorrect={false}
        returnKeyType="search"
        {...props}
      />

      {/* La croix n'apparaît que s'il y a du texte */}
      {value.length > 0 && (
        <Pressable
          onPress={() => onChangeText('')}
          hitSlop={10} // agrandit la zone tactile invisible autour de l'icône
          accessibilityLabel="Effacer la recherche"
        >
          <Ionicons name="close-circle" size={20} color="#999" />
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  input: { flex: 1, paddingVertical: 12, fontSize: 16 },
})
