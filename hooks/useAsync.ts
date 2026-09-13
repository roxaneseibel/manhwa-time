import { useEffect, useState, type DependencyList } from 'react'

type AsyncState<T> = {
  data: T | null
  loading: boolean
  error: string | null
}

// Exécute une fonction asynchrone (un appel API) et suit son état.
// Relance l'appel quand une des "deps" change, et annule l'appel précédent.
export function useAsync<T>(fn: (signal: AbortSignal) => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null })

  useEffect(() => {
    const controller = new AbortController()
    setState({ data: null, loading: true, error: null })

    fn(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, loading: false, error: null })
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted) setState({ data: null, loading: false, error: e.message })
      })

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return state
}
