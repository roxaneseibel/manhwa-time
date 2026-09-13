import type { Emotion } from '@/types/chapterTracking'

// Index 0 = note 1
export const RATING_LABELS = ['Bof', 'OK', 'Bien', 'Super', 'Génial']

// Ordre d'affichage de la grille des émotions
export const EMOTIONS: { value: Emotion; emoji: string; label: string }[] = [
  { value: 'shocked', emoji: '😵', label: 'Choc' },
  { value: 'frustrated', emoji: '😤', label: 'Frustration' },
  { value: 'sad', emoji: '😭', label: 'Tristesse' },
  { value: 'thoughtful', emoji: '🤔', label: 'Réflexion' },
  { value: 'moved', emoji: '🥺', label: 'Émotion' },
  { value: 'amused', emoji: '😆', label: 'Fou rire' },
  { value: 'scared', emoji: '😱', label: 'Peur' },
  { value: 'bored', emoji: '😑', label: 'Ennui' },
]
