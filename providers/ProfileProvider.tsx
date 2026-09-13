import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/providers/SessionProvider'

export type Profile = {
  id: string
  username: string
  avatar_url: string | null
  show_adult_content: boolean
}

type EditableFields = Partial<Pick<Profile, 'username' | 'avatar_url' | 'show_adult_content'>>

type ProfileContextValue = {
  profile: Profile | null
  loading: boolean
  error: string | null
  // Renvoie un message d'erreur, ou null si tout s'est bien passé
  updateProfile: (changes: EditableFields) => Promise<string | null>
}

const ProfileContext = createContext<ProfileContextValue>({
  profile: null,
  loading: false,
  error: null,
  updateProfile: async () => 'Profil non disponible',
})

// Charge le profil de l'utilisateur connecté et le partage avec toute l'app
export function ProfileProvider({ children }: PropsWithChildren) {
  const { session } = useSession()
  const userId = session?.user.id

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Dépend de userId et PAS de session : l'objet session change à chaque
  // renouvellement du jeton, ce qui rechargerait le profil pour rien.
  useEffect(() => {
    if (!userId) {
      setProfile(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    supabase
      .from('profile')
      .select('id, username, avatar_url, show_adult_content')
      .eq('id', userId)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return
        setLoading(false)
        if (error) setError(error.message)
        else setProfile(data as Profile)
      })

    return () => {
      cancelled = true
    }
  }, [userId])

  async function updateProfile(changes: EditableFields) {
    if (!profile) return 'Profil non chargé'

    // Mise à jour "optimiste" : on affiche le changement tout de suite,
    // et on revient en arrière si la base refuse.
    const previous = profile
    setProfile({ ...profile, ...changes })

    const { error } = await supabase.from('profile').update(changes).eq('id', profile.id)

    if (error) {
      setProfile(previous)
      return error.message
    }
    return null
  }

  return (
    <ProfileContext.Provider value={{ profile, loading, error, updateProfile }}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  return useContext(ProfileContext)
}
