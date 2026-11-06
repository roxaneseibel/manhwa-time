import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/providers/SessionProvider'

// Le profil tel que l'app le manipule : un seul objet, même si la base le
// range dans DEUX tables (voir supabase/sql/07_profile_privacy.sql).
//   profile          → pseudo et avatar, lisibles par les autres utilisateurs
//   profile_private  → préférences visibles de soi seulement
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

    // Deux requêtes, lancées en parallèle plutôt qu'à la suite : la seconde
    // n'a pas besoin du résultat de la première, autant ne pas attendre.
    // (On pourrait écrire un seul "embed" PostgREST, mais deux requêtes
    //  explicites restent plus lisibles et plus faciles à déboguer.)
    Promise.all([
      supabase.from('profile').select('id, username, avatar_url').eq('id', userId).single(),
      // maybeSingle : les comptes créés avant la migration 07 n'ont pas
      // forcément de ligne de préférences → data vaut null, sans erreur.
      supabase
        .from('profile_private')
        .select('show_adult_content')
        .eq('user_id', userId)
        .maybeSingle(),
    ]).then(([publicPart, privatePart]) => {
      if (cancelled) return
      setLoading(false)

      if (publicPart.error) {
        setError(publicPart.error.message)
        return
      }
      // Les préférences sont secondaires : si elles échouent, on affiche
      // quand même le profil avec les valeurs par défaut.
      if (privatePart.error) console.warn('profile_private', privatePart.error.message)

      setProfile({
        ...publicPart.data,
        show_adult_content: privatePart.data?.show_adult_content ?? false,
      })
    })

    return () => {
      cancelled = true
    }
  }, [userId])

  // L'app continue d'appeler updateProfile({ show_adult_content: true }) comme
  // avant : c'est ici, et nulle part ailleurs, qu'on sait dans quelle table
  // chaque champ est rangé.
  async function updateProfile(changes: EditableFields) {
    if (!profile) return 'Profil non chargé'

    const { show_adult_content, ...publicChanges } = changes

    // Mise à jour "optimiste" : on affiche le changement tout de suite,
    // et on revient en arrière si la base refuse.
    const previous = profile
    setProfile({ ...profile, ...changes })

    if (Object.keys(publicChanges).length > 0) {
      const { error } = await supabase.from('profile').update(publicChanges).eq('id', profile.id)
      if (error) {
        setProfile(previous)
        return error.message
      }
    }

    if (show_adult_content !== undefined) {
      // upsert, pas update : crée la ligne si le compte est antérieur à la
      // migration 07 (sinon l'update ne toucherait aucune ligne, sans erreur).
      const { error } = await supabase
        .from('profile_private')
        .upsert({ user_id: profile.id, show_adult_content }, { onConflict: 'user_id' })
      if (error) {
        setProfile(previous)
        return error.message
      }
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
