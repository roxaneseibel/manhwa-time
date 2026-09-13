import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export type SheetOption = {
  label: string
  onPress: () => void
  destructive?: boolean // affiché en rouge (supprimer, bloquer...)
}

type Props = {
  visible: boolean
  title?: string
  options: SheetOption[]
  onClose: () => void
}

// Panneau d'options qui monte depuis le bas (réutilisable partout).
// Contrairement à Alert.alert, pas de limite de 3 boutons sur Android.
export function ActionSheet({ visible, title, options, onClose }: Props) {
  const insets = useSafeAreaInsets()

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer" />

        <View style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
          {title && <Text style={styles.title}>{title}</Text>}

          {options.map((option) => (
            <Pressable
              key={option.label}
              style={styles.option}
              onPress={() => {
                onClose()
                option.onPress()
              }}
            >
              <Text style={[styles.optionText, option.destructive && styles.destructive]}>{option.label}</Text>
            </Pressable>
          ))}

          <Pressable style={styles.option} onPress={onClose}>
            <Text style={styles.cancel}>Annuler</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 12, paddingHorizontal: 20 },
  title: { fontSize: 16, fontWeight: 'bold', paddingVertical: 8, color: '#2d3436' },
  option: { paddingVertical: 14, borderTopWidth: 1, borderColor: '#f1f2f6' },
  optionText: { fontSize: 16, color: '#2d3436' },
  destructive: { color: '#d63031' },
  cancel: { fontSize: 16, color: '#636e72', fontWeight: '600' },
})
