import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type SessionContextValue = {
  session: Session | null // null = personne n'est connecté
  isLoading: boolean      // true tant qu'on ne sait pas encore
}

const SessionContext = createContext<SessionContextValue>({ session: null, isLoading: true })

// Enveloppe toute l'app : n'importe quel écran peut ensuite appeler useSession()
export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // 1. Au démarrage : y a-t-il une session sauvegardée sur le téléphone ?
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setIsLoading(false)
    })

    // 2. Ensuite : être prévenu à chaque connexion / déconnexion / renouvellement
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    // 3. Nettoyage : se désabonner si le composant disparaît
    return () => subscription.unsubscribe()
  }, [])

  return (
    <SessionContext.Provider value={{ session, isLoading }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  return useContext(SessionContext)
}
