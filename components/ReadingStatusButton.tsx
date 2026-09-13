import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { StatusPicker } from '@/components/StatusPicker'
import { useReadingEntry } from '@/hooks/useReadingEntry'
import { READING_STATUS_LABELS } from '@/lib/readingProgress'
import type { ReadingStatus } from '@/types/readingProgress'

type Props = {
  anilistId: number
}

export function ReadingStatusButton({ anilistId }: Props) {
  const { entry, loading, saving, error, setStatus, remove } = useReadingEntry(anilistId)
  const [pickerOpen, setPickerOpen] = useState(false)

  function onSelect(status: ReadingStatus) {
    setPickerOpen(false)
    if (status !== entry?.status) setStatus(status)
  }

  function onRemove() {
    setPickerOpen(false)
    Alert.alert('Retirer de ma liste', 'Ta progression sur ce titre sera supprimée.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Retirer', style: 'destructive', onPress: remove },
    ])
  }

  const busy = loading || saving
  const inList = entry !== null

  return (
    <View style={styles.container}>
      <Pressable
        style={[styles.button, inList ? styles.inList : styles.notInList, busy && styles.busy]}
        onPress={() => setPickerOpen(true)}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color={inList ? '#6C5CE7' : '#fff'} />
        ) : inList ? (
          <>
            <Ionicons name="checkmark-circle" size={20} color="#6C5CE7" />
            <Text style={styles.inListText}>{READING_STATUS_LABELS[entry.status]}</Text>
            <Ionicons name="chevron-down" size={18} color="#6C5CE7" />
          </>
        ) : (
          <>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.notInListText}>Ajouter à ma liste</Text>
          </>
        )}
      </Pressable>

      {error && <Text style={styles.error}>{error}</Text>}

      <StatusPicker
        visible={pickerOpen}
        currentStatus={entry?.status ?? null}
        onSelect={onSelect}
        onRemove={inList ? onRemove : undefined}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 8, paddingVertical: 12, minHeight: 48 },
  notInList: { backgroundColor: '#6C5CE7' },
  inList: { backgroundColor: '#f1f0fe', borderWidth: 1, borderColor: '#6C5CE7' },
  busy: { opacity: 0.7 },
  notInListText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  inListText: { color: '#6C5CE7', fontSize: 16, fontWeight: '600' },
  error: { color: '#d63031', textAlign: 'center' },
})
