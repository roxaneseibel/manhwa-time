// Sur mobile, fetch n'a AUCUN délai maximal : une connexion bloquée
// laisse l'app attendre indéfiniment. On ajoute donc un délai maximal.

const DEFAULT_TIMEOUT_MS = 10_000

type FetchOptions = RequestInit & { timeoutMs?: number }

export async function fetchWithTimeout(source: string, url: string, options: FetchOptions = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: externalSignal, ...init } = options

  // Notre propre contrôleur : annulé soit par le minuteur, soit par l'appelant
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const abortFromCaller = () => controller.abort()
  if (externalSignal?.aborted) controller.abort()
  externalSignal?.addEventListener('abort', abortFromCaller)

  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (e) {
    // Annulé par le minuteur (et pas par l'appelant) → message explicite
    if (controller.signal.aborted && !externalSignal?.aborted) {
      throw new Error(`${source} ne répond pas (délai de ${timeoutMs / 1000} s dépassé)`)
    }
    // Erreur réseau (pas d'internet, DNS...) → on précise quelle source
    if (!controller.signal.aborted) {
      throw new Error(`${source} injoignable : ${(e as Error).message}`)
    }
    throw e
  } finally {
    clearTimeout(timer)
    externalSignal?.removeEventListener('abort', abortFromCaller)
  }
}
