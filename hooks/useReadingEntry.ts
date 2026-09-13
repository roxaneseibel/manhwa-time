import { useEffect, useState } from 'react'
import { addToList, getEntryByAnilistId, removeEntry, updateEntryStatus } from '@/lib/readingProgress'
import { useSession } from '@/providers/SessionProvider'
import type { ReadingEntry, ReadingStatus } from '@/types/readingProgress'

// État de CE titre dans la liste de l'utilisateur connecté, + les actions pour le modifier
export function useReadingEntry(anilistId: number) {
  const { session } = useSession()
  const userId = session?.user.id

  const [entry, setEntry] = useState<ReadingEntry | null>(null)
  const [loading, setLoading] = useState(true) // chargement initial
  const [saving, setSaving] = useState(false)  // une action est en cours
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    getEntryByAnilistId(anilistId)
      .then((result) => {
        if (!cancelled) setEntry(result)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [anilistId, userId])

  // Exécute une action, gère "saving" et les erreurs, puis met l'entrée à jour
  async function run(action: () => Promise<ReadingEntry | null>) {
    setSaving(true)
    setError(null)
    try {
      setEntry(await action())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function setStatus(status: ReadingStatus) {
    return run(() => {
      if (entry) return updateEntryStatus(entry.id, status)
      if (!userId) throw new Error('Tu dois être connecté')
      return addToList(anilistId, userId, status)
    })
  }

  function remove() {
    return run(async () => {
      if (entry) await removeEntry(entry.id)
      return null
    })
  }

  return { entry, loading, saving, error, setStatus, remove }
}
