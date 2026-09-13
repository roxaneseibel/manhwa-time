import { Ionicons } from '@expo/vector-icons'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { READING_STATUSES, READING_STATUS_LABELS } from '@/lib/readingProgress'
import type { ReadingStatus } from '@/types/readingProgress'

type Props = {
  visible: boolean
  currentStatus: ReadingStatus | null // null = pas encore dans la liste
  onSelect: (status: ReadingStatus) => void
  onRemove?: () => void               // absent si le titre n'est pas dans la liste
  onClose: () => void
}

// Panneau qui monte depuis le bas de l'écran ("bottom sheet")
export function StatusPicker({ visible, currentStatus, onSelect, onRemove, onClose }: Props) {
  // Marges de sécurité (barre de navigation Android, encoche iPhone...)
  const insets = useSafeAreaInsets()

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Fond assombri : un appui dessus ferme le panneau */}
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer" />

        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.title}>{currentStatus ? 'Changer le statut' : 'Ajouter à ma liste'}</Text>

          {READING_STATUSES.map((status) => {
            const selected = status === currentStatus
            return (
              <Pressable key={status} style={styles.option} onPress={() => onSelect(status)}>
                <Text style={[styles.optionText, selected && styles.selectedText]}>
                  {READING_STATUS_LABELS[status]}
                </Text>
                {selected && <Ionicons name="checkmark" size={20} color="#6C5CE7" />}
              </Pressable>
            )
          })}

          {onRemove && (
            <Pressable style={styles.option} onPress={onRemove}>
              <Text style={styles.removeText}>Retirer de ma liste</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 16, paddingHorizontal: 20 },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  option: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderTopWidth: 1, borderColor: '#f1f2f6' },
  optionText: { fontSize: 16 },
  selectedText: { color: '#6C5CE7', fontWeight: '600' },
  removeText: { fontSize: 16, color: '#d63031' },
})
