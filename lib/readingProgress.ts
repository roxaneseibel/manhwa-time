import { importWebtoon } from '@/lib/catalog'
import { unmarkAllChapters } from '@/lib/chapterTracking'
import { supabase } from '@/lib/supabase'
import type { LibraryEntry, ReadingEntry, ReadingStatus } from '@/types/readingProgress'

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

export async function removeEntry(entry: ReadingEntry): Promise<void> {
  // D'abord les chapitres lus, sinon ils réapparaîtraient si on rajoute le titre
  await unmarkAllChapters(entry.webtoonId)

  const { error } = await supabase.from('reading_progress').delete().eq('id', entry.id)
  if (error) throw new Error(error.message)
}

// ---------------------------------------------------------------------------
// Ma liste complète, la plus récemment modifiée en premier
// ---------------------------------------------------------------------------
type LibraryRow = EntryRow & {
  updated_at: string
  webtoon: { anilist_id: number | null; title: string; cover_url: string | null; total_chapters: number | null }
}

export async function getMyList(): Promise<LibraryEntry[]> {
  const { data, error } = await supabase
    .from('reading_progress')
    .select(`${ENTRY_COLUMNS}, updated_at, webtoon(anilist_id, title, cover_url, total_chapters)`)
    .order('updated_at', { ascending: false })

  if (error) throw new Error(error.message)

  return (data as unknown as LibraryRow[]).map((row) => ({
    ...toEntry(row),
    updatedAt: row.updated_at,
    webtoon: {
      anilistId: row.webtoon.anilist_id,
      title: row.webtoon.title,
      coverUrl: row.webtoon.cover_url,
      totalChapters: row.webtoon.total_chapters,
    },
  }))
}

// 12 → "12", 10.5 → "10.5"
export function formatChapter(chapter: number) {
  return Number.isInteger(chapter) ? String(chapter) : chapter.toFixed(1)
}
