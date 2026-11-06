// Déclenche l'Edge Function sync-chapters à la main, comme le fera le planificateur.
// À lancer AVANT de créer la tâche cron (étape 4 de 08_cron_sync_chapters.sql) :
// si ça marche ici, le cron ne fait qu'appuyer sur le même bouton à heure fixe.
//
// Usage : node scripts/test-sync-chapters.mjs <secret> [limite]
// Exemple : node scripts/test-sync-chapters.mjs mon-secret-genere 3
//
// Le secret est celui donné à la fonction avec `npx supabase secrets set SYNC_SECRET=...`

const FUNCTION_URL = 'https://dhcxtooelukyrwybysfi.supabase.co/functions/v1/sync-chapters'

const [secret, limit = '3'] = process.argv.slice(2)

if (!secret) {
  console.error('Usage : node scripts/test-sync-chapters.mjs <secret> [limite]')
  process.exit(1)
}

console.log(`Appel de sync-chapters (limite : ${limit} séries)...`)
console.time('Durée de l’appel')

const response = await fetch(FUNCTION_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-sync-secret': secret,
  },
  body: JSON.stringify({ limit: Number(limit) }),
})

console.timeEnd('Durée de l’appel')

const text = await response.text()

if (!response.ok) {
  console.error(`❌ HTTP ${response.status} :`, text)
  console.error('\n401 → le secret ne correspond pas à SYNC_SECRET')
  console.error('500 → SYNC_SECRET n’a pas été défini (npx supabase secrets set ...)')
  process.exit(1)
}

const result = JSON.parse(text)

console.log(`\n✅ ${result.checked} série(s) examinée(s)`)

if (!result.updated?.length) {
  console.log('Aucun nouveau chapitre (normal si tu viens de les importer).')
} else {
  for (const r of result.updated) {
    console.log(`  • ${r.title} : ${r.before ?? '?'} → ${r.after} (+${r.newChapters} chapitres)`)
  }
}

if (result.failed?.length) {
  console.warn(`\n⚠️ ${result.failed.length} série(s) en échec — voir les logs de la fonction`)
}

// Deuxième appel immédiat : doit renvoyer 0 série examinée, parce que
// chapters_synced_at vient d'être écrit (le garde-fou des 20 h fonctionne).
console.log('\nVérification du garde-fou (2e appel immédiat)...')
const again = await fetch(FUNCTION_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-sync-secret': secret },
  body: JSON.stringify({ limit: Number(limit) }),
})
const { checked } = await again.json()
console.log(
  checked === 0
    ? '✅ 0 série examinée : les séries déjà vues sont bien ignorées'
    : `⚠️ ${checked} série(s) reprises alors qu’elles viennent d’être synchronisées`,
)
