import { ensureWebtoonWithChapters } from '@/lib/catalog'
import { supabase } from '@/lib/supabase'
import type { Chapter, ReadCounts } from '@/types/chapterTracking'

// Supabase renvoie au maximum 1000 lignes par requête.
// Pour les titres très longs, on demande les lignes par tranches : 0-999, 1000-1999...
const PAGE_SIZE = 1000

async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------
export async function getChapters(webtoonId: string): Promise<Chapter[]> {
  const rows = await fetchAllRows<{ id: string; number: number; published_at: string | null }>((from, to) =>
    supabase
      .from('chapter')
      .select('id, number, published_at')
      .eq('webtoon_id', webtoonId)
      .order('number', { ascending: true })
      .range(from, to),
  )

  return rows.map((row) => ({ id: row.id, number: Number(row.number), publishedAt: row.published_at }))
}

// Mes lectures pour ce webtoon (la RLS ne renvoie que les miennes)
export async function getMyReadCounts(webtoonId: string): Promise<ReadCounts> {
  const rows = await fetchAllRows<{ chapter_id: string; read_count: number }>((from, to) =>
    supabase
      .from('chapter_read')
      .select('chapter_id, read_count, chapter!inner(webtoon_id)')
      .eq('chapter.webtoon_id', webtoonId)
      .range(from, to),
  )

  return new Map(rows.map((row) => [row.chapter_id, row.read_count]))
}

// ---------------------------------------------------------------------------
// Actions (fonctions SQL de la migration 05)
// ---------------------------------------------------------------------------

// Coche un chapitre, et éventuellement tous les précédents non lus
export async function markChaptersRead(chapterId: string, includePrevious: boolean): Promise<number> {
  const { data, error } = await supabase.rpc('mark_chapters_read', {
    p_chapter_id: chapterId,
    p_include_previous: includePrevious,
  })
  if (error) throw new Error(error.message)
  return data as number
}

// Relecture : renvoie le nouveau nombre de lectures
export async function rereadChapter(chapterId: string): Promise<number> {
  const { data, error } = await supabase.rpc('reread_chapter', { p_chapter_id: chapterId })
  if (error) throw new Error(error.message)
  return data as number
}

export async function unmarkChapter(chapterId: string): Promise<void> {
  // Pas de filtre sur l'utilisateur : la RLS limite la suppression à MES lignes
  const { error } = await supabase.from('chapter_read').delete().eq('chapter_id', chapterId)
  if (error) throw new Error(error.message)
}

// Supprime toutes mes lectures d'un webtoon (quand on le retire de sa liste)
export async function unmarkAllChapters(webtoonId: string): Promise<void> {
  const chapterIds = (await getChapters(webtoonId)).map((chapter) => chapter.id)

  // Par paquets de 100 : chaque id est écrit dans l'URL de la requête, qui a une taille limite
  for (let i = 0; i < chapterIds.length; i += 100) {
    const { error } = await supabase
      .from('chapter_read')
      .delete()
      .in('chapter_id', chapterIds.slice(i, i + 100))
    if (error) throw new Error(error.message)
  }
}

// "Chapitre suivant" depuis Ma liste : coche le premier chapitre après currentChapter.
// Renvoie son numéro, ou null s'il n'y en a pas (à jour).
export async function markNextChapter(
  anilistId: number,
  webtoonId: string,
  currentChapter: number,
): Promise<number | null> {
  async function findNext() {
    const { data, error } = await supabase
      .from('chapter')
      .select('id, number')
      .eq('webtoon_id', webtoonId)
      .gt('number', currentChapter)
      .order('number', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data
  }

  let next = await findNext()

  // Titre importé avant la création des chapitres : on les crée, puis on réessaie
  if (!next) {
    await ensureWebtoonWithChapters(anilistId)
    next = await findNext()
  }
  if (!next) return null

  await markChaptersRead(next.id, false)
  return Number(next.number)
}
