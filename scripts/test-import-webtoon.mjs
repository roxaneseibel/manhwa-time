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

// 4. Les chapitres : créés tout de suite, dates remplies en arrière-plan
async function countChapters() {
  const all = await supabase.from('chapter').select('id', { count: 'exact', head: true }).eq('webtoon_id', data.webtoonId)
  const dated = await supabase
    .from('chapter')
    .select('id', { count: 'exact', head: true })
    .eq('webtoon_id', data.webtoonId)
    .not('published_at', 'is', null)
  return `${all.count} chapitres, dont ${dated.count} avec une date de sortie`
}

console.log('✅ Chapitres juste après l’appel :', await countChapters())
console.log('⏳ Attente de 15 s (dates récupérées en arrière-plan)...')
await new Promise((resolve) => setTimeout(resolve, 15_000))
console.log('✅ Chapitres 15 s plus tard :', await countChapters())

const { data: sample } = await supabase
  .from('chapter')
  .select('number, published_at')
  .eq('webtoon_id', data.webtoonId)
  .order('number', { ascending: false })
  .limit(3)
console.log('   Derniers chapitres :', sample)
