import { Alert } from 'react-native'
import { formatChapter } from '@/lib/readingProgress'

type CheckActionOptions = {
  chapterNumber: number
  readCount: number     // 0 = non lu
  unreadBefore: number  // chapitres non lus avant celui-ci
  hasReaction: boolean  // une note ou une émotion serait perdue en décochant
  onMarkRead: (includePrevious: boolean) => void
  onReread: () => void
  onUnmark: () => void
}

// Ce qui se passe quand on appuie sur le rond d'un chapitre.
// Partagé par la liste des chapitres et la page d'un chapitre.
export function handleChapterCheck(options: CheckActionOptions) {
  const { chapterNumber, readCount, unreadBefore, hasReaction, onMarkRead, onReread, onUnmark } = options
  const title = `Chapitre ${formatChapter(chapterNumber)}`

  // Déjà lu → relire ou décocher
  if (readCount > 0) {
    // Chapitre noté : une seconde confirmation, bien visible, avant de tout effacer
    const confirmUnmark = hasReaction
      ? () =>
          Alert.alert(
            'Supprimer ta note ?',
            'Tu as noté ce chapitre ou partagé ton ressenti. Le marquer comme non lu les supprimera.',
            [
              { text: 'Annuler', style: 'cancel' },
              { text: 'Supprimer', style: 'destructive', onPress: onUnmark },
            ],
          )
      : onUnmark

    Alert.alert(title, readCount > 1 ? `Lu ${readCount} fois.` : 'Lu une fois.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Marquer comme non lu', style: 'destructive', onPress: confirmUnmark },
      { text: `Relu (×${readCount + 1})`, onPress: onReread },
    ])
    return
  }

  // Non lu, avec des chapitres non lus avant → proposer de tout cocher
  if (unreadBefore > 0) {
    Alert.alert(
      title,
      unreadBefore === 1
        ? 'Marquer aussi le chapitre précédent comme lu ?'
        : `Marquer aussi les ${unreadBefore} chapitres précédents comme lus ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Seulement celui-ci', onPress: () => onMarkRead(false) },
        { text: 'Oui, tous', onPress: () => onMarkRead(true) },
      ],
    )
    return
  }

  onMarkRead(false)
}
