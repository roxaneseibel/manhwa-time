import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { ReadingEntry, ReadingStatus } from '@/types/readingProgress'

export const READING_STATUS_LABELS: Record<ReadingStatus, string> = {
  reading: 'En cours',
  plan_to_read: 'À lire',
  completed: 'Terminé',
  on_hold: 'En pause',
  dropped: 'Abandonné',
}

// Ordre d'affichage dans le sélecteur
export const READING_STATUSES: ReadingStatus[] = ['reading', 'plan_to_read', 'completed', 'on_hold', 'dropped']

const ENTRY_COLUMNS = 'id, webtoon_id, status, current_chapter'

type EntryRow = { id: string; webtoon_id: string; status: ReadingStatus; current_chapter: number }

// Les noms de colonnes SQL (snake_case) → noms JavaScript (camelCase)
function toEntry(row: EntryRow): ReadingEntry {
  return {
    id: row.id,
    webtoonId: row.webtoon_id,
    status: row.status,
    currentChapter: Number(row.current_chapter),
  }
}

// ---------------------------------------------------------------------------
// Lire : ce titre (id AniList) est-il dans MA liste ?
// ---------------------------------------------------------------------------
export async function getEntryByAnilistId(anilistId: number): Promise<ReadingEntry | null> {
  const { data, error } = await supabase
    .from('reading_progress')
    // "webtoon!inner(...)" : jointure avec webtoon, qui permet de filtrer sur ses colonnes
    .select(`${ENTRY_COLUMNS}, webtoon!inner(anilist_id)`)
    .eq('webtoon.anilist_id', anilistId)
    // Pas besoin de filtrer sur l'utilisateur : la RLS ne renvoie QUE ses lignes
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? toEntry(data as unknown as EntryRow) : null
}

// ---------------------------------------------------------------------------
// Ajouter : importer le titre dans le catalogue, puis créer la ligne de progression
// ---------------------------------------------------------------------------
export async function addToList(anilistId: number, userId: string, status: ReadingStatus): Promise<ReadingEntry> {
  // 1. L'Edge Function crée (ou retrouve) la fiche dans "webtoon"
  const webtoonId = await importWebtoon(anilistId)

  // 2. On crée la progression. "upsert" : si la ligne existe déjà, on la met à jour
  const { data, error } = await supabase
    .from('reading_progress')
    .upsert({ user_id: userId, webtoon_id: webtoonId, status }, { onConflict: 'user_id,webtoon_id' })
    .select(ENTRY_COLUMNS)
    .single()

  if (error) throw new Error(error.message)
  return toEntry(data as EntryRow)
}

async function importWebtoon(anilistId: number): Promise<string> {
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

// ---------------------------------------------------------------------------
// Modifier le statut / retirer de la liste
// ---------------------------------------------------------------------------
export async function updateEntryStatus(entryId: string, status: ReadingStatus): Promise<ReadingEntry> {
  const { data, error } = await supabase
    .from('reading_progress')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', entryId)
    .select(ENTRY_COLUMNS)
    .single()

  if (error) throw new Error(error.message)
  return toEntry(data as EntryRow)
}

export async function removeEntry(entryId: string): Promise<void> {
  const { error } = await supabase.from('reading_progress').delete().eq('id', entryId)
  if (error) throw new Error(error.message)
}
