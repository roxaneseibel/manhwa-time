// Teste l'Edge Function import-webtoon depuis l'ordinateur, comme le ferait l'app.
//
// Usage : node scripts/test-import-webtoon.mjs <email> <mot_de_passe> [anilistId]
// Exemple : node scripts/test-import-webtoon.mjs test@test.com motdepasse 120980
// (utilise un compte de TEST : le mot de passe reste dans l'historique du terminal)

import { createClient } from '@supabase/supabase-js'

// Mêmes valeurs que lib/supabase.ts (ce fichier-là importe du React Native, inutilisable ici)
const SUPABASE_URL = 'https://dhcxtooelukyrwybysfi.supabase.co'
const SUPABASE_KEY = 'sb_publishable_CDfB8T7CIL1s-b770sP8HQ_IEaXT6eB'

const [email, password, anilistId = '120980'] = process.argv.slice(2)
if (!email || !password) {
  console.error('Usage : node scripts/test-import-webtoon.mjs <email> <mot_de_passe> [anilistId]')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

// 1. Se connecter (la fonction refuse les visiteurs anonymes)
const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
if (signInError) {
  console.error('❌ Connexion impossible :', signInError.message)
  process.exit(1)
}
console.log('✅ Connecté')

// 2. Appeler la fonction (supabase-js ajoute automatiquement le jeton de l'utilisateur)
console.time('Durée de l’appel')
const { data, error } = await supabase.functions.invoke('import-webtoon', {
  body: { anilistId: Number(anilistId) },
})
console.timeEnd('Durée de l’appel')

if (error) {
  const details = await error.context?.json?.().catch(() => null)
  console.error('❌ Erreur de la fonction :', error.message, details ?? '')
  process.exit(1)
}
console.log('✅ Réponse :', data)

// 3. Relire la fiche en base, avec ses genres (webtoon → webtoon_genre → genre)
const { data: webtoon, error: readError } = await supabase
  .from('webtoon')
  .select('title, status, total_chapters, is_adult, mangaupdates_id, start_year, webtoon_genre(genre(name))')
  .eq('id', data.webtoonId)
  .single()

if (readError) {
  console.error('❌ Lecture impossible :', readError.message)
  process.exit(1)
}
console.log('✅ En base :', JSON.stringify(webtoon, null, 2))
