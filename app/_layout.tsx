import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { ProfileProvider } from '@/providers/ProfileProvider'
import { SessionProvider, useSession } from '@/providers/SessionProvider'

// Garder l'écran de démarrage affiché tant qu'on ne sait pas si l'utilisateur est connecté
SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="auto" />
      <ProfileProvider>
        <RootNavigator />
      </ProfileProvider>
    </SessionProvider>
  )
}

// Layout racine : un Stack qui contient les onglets + les écrans "par-dessus" (ex: fiche webtoon)
function RootNavigator() {
  const { session, isLoading } = useSession()

  if (!isLoading) {
    SplashScreen.hideAsync()
  }

  return (
    <Stack>
      {/* Accessible seulement si connecté */}
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="webtoon/[id]" options={{ title: 'Fiche' }} />
        <Stack.Screen name="chapter/[id]" options={{ title: 'Chapitre' }} />
        <Stack.Screen name="comments/[chapterId]" options={{ title: 'Commentaires' }} />
        <Stack.Screen name="friends" options={{ title: 'Mes amis' }} />
      </Stack.Protected>

      {/* Accessible seulement si NON connecté */}
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  )
}
