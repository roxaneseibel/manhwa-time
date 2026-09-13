import { useFocusEffect } from 'expo-router'
import { useCallback, useRef } from 'react'

// Appelle "refresh" quand l'écran REDEVIENT visible (ex : retour depuis une page chapitre).
// Le tout premier affichage est ignoré : le chargement initial s'en occupe déjà.
export function useRefreshOnFocus(refresh: () => void) {
  const isFirstFocus = useRef(true)

  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false
        return
      }
      refresh()
    }, [refresh]),
  )
}
