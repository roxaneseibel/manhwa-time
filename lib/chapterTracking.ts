import { ensureWebtoonWithChapters } from '@/lib/catalog'
import { supabase } from '@/lib/supabase'
import type {
  Chapter,
  ChapterDetails,
  ChapterNeighbors,
  Emotion,
  MyChapterRead,
  ReadCounts,
} from '@/types/chapterTracking'

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
// + les chapitres où j'ai laissé une note ou une émotion
export async function getMyReads(webtoonId: string): Promise<{ readCounts: ReadCounts; reactedIds: Set<string> }> {
  const rows = await fetchAllRows<{
    chapter_id: string
    read_count: number
    rating: number | null
    emotion: string | null
  }>((from, to) =>
    supabase
      .from('chapter_read')
      .select('chapter_id, read_count, rating, emotion, chapter!inner(webtoon_id)')
      .eq('chapter.webtoon_id', webtoonId)
      .range(from, to),
  )

  return {
    readCounts: new Map(rows.map((row) => [row.chapter_id, row.read_count])),
    reactedIds: new Set(rows.filter((row) => row.rating != null || row.emotion != null).map((row) => row.chapter_id)),
  }
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

// ---------------------------------------------------------------------------
// Page d'un chapitre
// ---------------------------------------------------------------------------
export async function getChapterDetails(chapterId: string): Promise<ChapterDetails> {
  const { data, error } = await supabase
    .from('chapter')
    .select('id, number, published_at, webtoon(id, anilist_id, title, cover_url, banner_url)')
    .eq('id', chapterId)
    .single()

  if (error) throw new Error(error.message)

  const row = data as unknown as {
    id: string
    number: number
    published_at: string | null
    webtoon: { id: string; anilist_id: number | null; title: string; cover_url: string | null; banner_url: string | null }
  }

  return {
    id: row.id,
    number: Number(row.number),
    publishedAt: row.published_at,
    webtoon: {
      id: row.webtoon.id,
      anilistId: row.webtoon.anilist_id,
      title: row.webtoon.title,
      coverUrl: row.webtoon.cover_url,
      bannerUrl: row.webtoon.banner_url,
    },
  }
}

export async function getMyChapterRead(chapterId: string): Promise<MyChapterRead | null> {
  const { data, error } = await supabase
    .from('chapter_read')
    .select('read_count, rating, emotion, first_read_at')
    .eq('chapter_id', chapterId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null

  return {
    readCount: data.read_count,
    rating: data.rating,
    emotion: data.emotion,
    firstReadAt: data.first_read_at,
  }
}

// Nombre de chapitres non lus avant un numéro, calculé par la base
// (la page d'un chapitre ne charge pas toute la liste)
export async function countUnreadBefore(webtoonId: string, chapterNumber: number): Promise<number> {
  const [all, read] = await Promise.all([
    // head: true → on ne récupère que le COMPTE, pas les lignes
    supabase
      .from('chapter')
      .select('id', { count: 'exact', head: true })
      .eq('webtoon_id', webtoonId)
      .lt('number', chapterNumber),
    supabase
      .from('chapter_read')
      .select('chapter_id, chapter!inner(webtoon_id, number)', { count: 'exact', head: true })
      .eq('chapter.webtoon_id', webtoonId)
      .lt('chapter.number', chapterNumber),
  ])

  if (all.error) throw new Error(all.error.message)
  if (read.error) throw new Error(read.error.message)
  return (all.count ?? 0) - (read.count ?? 0)
}

export async function getNeighborChapters(webtoonId: string, chapterNumber: number): Promise<ChapterNeighbors> {
  const [previous, next] = await Promise.all([
    supabase
      .from('chapter')
      .select('id')
      .eq('webtoon_id', webtoonId)
      .lt('number', chapterNumber)
      .order('number', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('chapter')
      .select('id')
      .eq('webtoon_id', webtoonId)
      .gt('number', chapterNumber)
      .order('number', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  return { previousId: previous.data?.id ?? null, nextId: next.data?.id ?? null }
}

// Note (1-5) ou émotion ; null pour retirer. Ne fonctionne que sur un chapitre lu.
export async function updateMyChapterReaction(
  chapterId: string,
  changes: { rating?: number | null; emotion?: Emotion | null },
): Promise<void> {
  const { error } = await supabase.from('chapter_read').update(changes).eq('chapter_id', chapterId)
  if (error) throw new Error(error.message)
}
