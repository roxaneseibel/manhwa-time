import { useEffect, useState } from 'react'

// Renvoie "value", mais seulement une fois qu'elle n'a plus changé pendant "delay" ms.
// Exemple : l'utilisateur tape "s", "so", "sol", "solo" → on ne récupère que "solo".
export function useDebouncedValue<T>(value: T, delay = 500): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)

    // Si "value" change avant la fin du délai, React appelle ce nettoyage
    // AVANT de relancer l'effet : l'ancien minuteur est annulé.
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
