import { getMangabakaByAnilistId } from '@/lib/mangabaka'
import { getMuLatestRelease, getMuSeries } from '@/lib/mangaupdates'
import type { AnilistMediaStatus } from '@/types/anilist'
import type { ChapterInfo, LatestRelease } from '@/types/chapters'

type AnilistChapterData = {
  chapters: number | null
  status: AnilistMediaStatus | null
}

// Détermine le nombre de chapitres et la dernière sortie d'un titre.
//
// Chaque source a ses défauts :
// - AniList   : nombre fiable, mais seulement pour les séries terminées
// - MangaBaka : compte en continu, mis à jour chaque nuit
// - MangaUpdates "latest_chapter" : numéro de la dernière SORTIE enregistrée,
//   faussé par les rééditions et les numérotations par saison
export async function getChapterInfo(
  anilistId: number,
  anilist: AnilistChapterData,
  signal?: AbortSignal,
): Promise<ChapterInfo> {
  const isFinished = anilist.status === 'FINISHED' || anilist.status === 'CANCELLED'

  // Série terminée dont AniList connaît le total : c'est la valeur la plus sûre,
  // inutile d'interroger les autres sources
  if (isFinished && anilist.chapters != null) {
    return { latestChapter: anilist.chapters, lastRelease: null, mangaUpdatesUrl: null, isFinished }
  }

  // Si les sources externes échouent, on continue avec ce qu'on a
  const sources = await fetchExternalSources(anilistId, signal).catch(() => null)

  // Une numérotation par saison donne des nombres PLUS PETITS que le vrai total :
  // on garde donc le plus grand nombre connu
  const candidates = [anilist.chapters, sources?.mangabakaTotal, sources?.muLatestChapter].filter(
    (n): n is number => typeof n === 'number' && Number.isFinite(n),
  )
  const latestChapter = candidates.length > 0 ? Math.max(...candidates) : null

  return {
    latestChapter,
    lastRelease: isFinished ? null : hideInconsistentChapter(sources?.lastRelease ?? null, latestChapter),
    mangaUpdatesUrl: sources?.mangaUpdatesUrl ?? null,
    isFinished,
  }
}

// AniList id → MangaBaka (correspondance) → MangaUpdates (série + dernière sortie)
async function fetchExternalSources(anilistId: number, signal?: AbortSignal) {
  const mangabaka = await getMangabakaByAnilistId(anilistId, signal)

  if (!mangabaka?.mangaUpdatesId) {
    return {
      mangabakaTotal: mangabaka?.totalChapters ?? null,
      muLatestChapter: null,
      lastRelease: null,
      mangaUpdatesUrl: null,
    }
  }

  // Les deux requêtes MangaUpdates sont indépendantes : on les lance EN MÊME TEMPS
  const [series, lastRelease] = await Promise.all([
    getMuSeries(mangabaka.mangaUpdatesId, signal),
    getMuLatestRelease(mangabaka.mangaUpdatesId, signal),
  ])

  return {
    mangabakaTotal: mangabaka.totalChapters,
    muLatestChapter: series.latest_chapter,
    lastRelease,
    mangaUpdatesUrl: series.url,
  }
}

// Si le numéro de la dernière sortie est très loin du total (saison, réédition,
// données anciennes), l'afficher induirait en erreur : on ne garde que la date et le groupe.
function hideInconsistentChapter(release: LatestRelease | null, latestChapter: number | null) {
  if (!release) return null

  const chapterNumber = parseFloat(release.chapter ?? '')
  const isConsistent =
    latestChapter != null && !Number.isNaN(chapterNumber) && chapterNumber >= latestChapter * 0.9

  return isConsistent ? release : { ...release, chapter: null }
}
