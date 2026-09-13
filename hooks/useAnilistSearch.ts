import { useEffect, useState } from 'react'
import { searchWebtoons } from '@/lib/search'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import type { AnilistSearchResult } from '@/types/anilist'

const MIN_LENGTH = 2

export function useAnilistSearch(query: string) {
  const trimmed = query.trim()
  const debouncedQuery = useDebouncedValue(trimmed, 500)

  const [results, setResults] = useState<AnilistSearchResult[]>([])
  const [isFuzzy, setIsFuzzy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (debouncedQuery.length < MIN_LENGTH) {
      setResults([])
      setIsFuzzy(false)
      setError(null)
      setLoading(false)
      return
    }

    // AbortController : permet d'annuler la requête en cours
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    searchWebtoons(debouncedQuery, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return
        setResults(response.results)
        setIsFuzzy(response.isFuzzy)
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted) setError(e.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    // Si la recherche change pendant que la requête est en route,
    // on l'annule : sa réponse (périmée) ne doit pas écraser la nouvelle.
    return () => controller.abort()
  }, [debouncedQuery])

  // L'utilisateur est en train de taper : on considère que ça "charge" déjà
  const isTyping = trimmed !== debouncedQuery && trimmed.length >= MIN_LENGTH

  return {
    results,
    isFuzzy,
    loading: loading || isTyping,
    error,
    tooShort: trimmed.length < MIN_LENGTH,
  }
}
