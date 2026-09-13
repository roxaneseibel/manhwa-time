import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

// Demande à l'Edge Function "import-webtoon" de créer (ou retrouver) la fiche
// et ses chapitres dans le catalogue. Renvoie l'id interne du webtoon.
export async function importWebtoon(anilistId: number): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ webtoonId: string }>('import-webtoon', {
    body: { anilistId },
  })

  if (error) {
    // Si la fonction a répondu avec un code d'erreur, son message est dans le corps de la réponse
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null)
      if (body?.error) throw new Error(body.error)
    }
    throw new Error(`Import impossible : ${error.message}`)
  }

  return data!.webtoonId
}

// Renvoie l'id du webtoon en s'assurant que ses chapitres existent en base.
// Si le titre n'a jamais été importé (ou ses chapitres jamais créés), on l'importe.
export async function ensureWebtoonWithChapters(anilistId: number): Promise<string> {
  const { data, error } = await supabase
    .from('webtoon')
    .select('id, chapters_synced_at')
    .eq('anilist_id', anilistId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (data?.chapters_synced_at) return data.id

  return importWebtoon(anilistId)
}
