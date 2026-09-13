// =============================================================================
// Edge Function : import-webtoon
//
// Appelée par l'app quand un utilisateur ajoute un titre à sa liste.
// Reçoit { anilistId }, va chercher les données ELLE-MÊME sur AniList
// (et MangaBaka pour l'id MangaUpdates), puis crée ou met à jour la fiche
// dans "webtoon" + ses genres. C'est le seul endroit qui écrit dans le catalogue.
//
// Ce code tourne sur les serveurs de Supabase (runtime Deno), pas sur le téléphone.
// =============================================================================

// Types des APIs spécifiques au runtime Supabase (Deno.serve, etc.)
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

// Si la fiche a été importée il y a moins de 24 h, on ne réinterroge pas AniList.
// Important : toutes les Edge Functions de Supabase partagent des adresses IP,
// donc la limite d'AniList (30 requêtes/min par IP) est partagée avec d'autres projets.
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

const EXTERNAL_TIMEOUT_MS = 10_000;

// AniList → valeurs acceptées par la colonne webtoon.status
const STATUS_MAP: Record<string, string> = {
  RELEASING: "ongoing",
  NOT_YET_RELEASED: "ongoing",
  FINISHED: "completed",
  HIATUS: "hiatus",
  CANCELLED: "cancelled",
};

type AnilistMedia = {
  id: number;
  title: { romaji: string | null; english: string | null };
  description: string | null;
  coverImage: { extraLarge: string | null };
  bannerImage: string | null;
  genres: string[];
  countryOfOrigin: string | null;
  status: string | null;
  chapters: number | null;
  averageScore: number | null;
  isAdult: boolean;
  format: string | null;
  startDate: { year: number | null };
};

export default {
  // auth: "user" → la fonction refuse (401) toute requête sans utilisateur connecté.
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    // -------------------------------------------------------------------------
    // 1. Lire et valider ce que l'app envoie (on ne fait jamais confiance au client)
    // -------------------------------------------------------------------------
    const body = await req.json().catch(() => null);
    const anilistId = Number(body?.anilistId);

    if (!Number.isInteger(anilistId) || anilistId <= 0) {
      return jsonError(400, "anilistId invalide");
    }

    // -------------------------------------------------------------------------
    // 2. Déjà importé récemment ? On renvoie directement la fiche existante.
    // -------------------------------------------------------------------------
    const { data: existing } = await ctx.supabaseAdmin
      .from("webtoon")
      .select("id, updated_at")
      .eq("anilist_id", anilistId)
      .maybeSingle();

    if (existing && Date.now() - new Date(existing.updated_at).getTime() < REFRESH_AFTER_MS) {
      return Response.json({ webtoonId: existing.id, refreshed: false });
    }

    // -------------------------------------------------------------------------
    // 3. Récupérer les données sources
    // -------------------------------------------------------------------------
    let media: AnilistMedia | null;
    try {
      media = await fetchAnilistMedia(anilistId);
    } catch (e) {
      // AniList en panne ou limite atteinte : si on a déjà la fiche, elle suffit
      if (existing) return Response.json({ webtoonId: existing.id, refreshed: false });
      return jsonError(502, `AniList indisponible : ${(e as Error).message}`);
    }

    if (!media) return jsonError(404, "Titre introuvable sur AniList");
    if (media.format === "NOVEL") return jsonError(400, "Les romans ne sont pas pris en charge");

    // MangaBaka est facultatif : en cas d'échec, on importe quand même
    const mangabaka = await fetchMangabaka(anilistId).catch(() => null);

    // -------------------------------------------------------------------------
    // 4. Créer ou mettre à jour la fiche ("upsert")
    // -------------------------------------------------------------------------
    const { data: webtoon, error: upsertError } = await ctx.supabaseAdmin
      .from("webtoon")
      .upsert(
        {
          anilist_id: media.id,
          source: "anilist",
          title: media.title.english ?? media.title.romaji ?? "Sans titre",
          synopsis: cleanDescription(media.description),
          cover_url: media.coverImage.extraLarge,
          banner_url: media.bannerImage,
          country_of_origin: media.countryOfOrigin,
          start_year: media.startDate.year,
          status: STATUS_MAP[media.status ?? ""] ?? "ongoing",
          total_chapters: resolveTotalChapters(media, mangabaka?.totalChapters ?? null),
          average_score: media.averageScore,
          is_adult: media.isAdult,
          mangaupdates_id: mangabaka?.mangaUpdatesId ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "anilist_id" }, // si anilist_id existe déjà → mise à jour
      )
      .select("id")
      .single();

    if (upsertError) {
      console.error("upsert webtoon", upsertError);
      return jsonError(500, "Impossible d'enregistrer le titre");
    }

    // -------------------------------------------------------------------------
    // 5. Relier les genres (on ne garde que ceux présents dans la table genre)
    // -------------------------------------------------------------------------
    if (media.genres.length > 0) {
      const { data: genres } = await ctx.supabaseAdmin
        .from("genre")
        .select("id")
        .in("name", media.genres);

      if (genres && genres.length > 0) {
        const { error: genreError } = await ctx.supabaseAdmin
          .from("webtoon_genre")
          .upsert(
            genres.map((genre) => ({ webtoon_id: webtoon.id, genre_id: genre.id })),
            { onConflict: "webtoon_id,genre_id", ignoreDuplicates: true },
          );
        if (genreError) console.error("upsert webtoon_genre", genreError);
      }
    }

    return Response.json({ webtoonId: webtoon.id, refreshed: true });
  }),
};

// =============================================================================
// Fonctions utilitaires
// =============================================================================

function jsonError(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

async function fetchAnilistMedia(id: number): Promise<AnilistMedia | null> {
  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      query: `
        query ($id: Int) {
          Media(id: $id, type: MANGA) {
            id
            title { romaji english }
            description(asHtml: false)
            coverImage { extraLarge }
            bannerImage
            genres
            countryOfOrigin
            status
            chapters
            averageScore
            isAdult
            format
            startDate { year }
          }
        }
      `,
      variables: { id },
    }),
    signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS),
  });

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const json = await response.json();
  return json.data?.Media ?? null;
}

async function fetchMangabaka(anilistId: number) {
  const response = await fetch(`https://api.mangabaka.org/v1/source/anilist/${anilistId}`, {
    signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS),
  });
  if (!response.ok) return null;

  const json = await response.json();
  const series = json.data?.series?.[0];
  if (!series) return null;

  const muKey: string | undefined = series.source?.manga_updates?.id;
  const total = Number(series.total_chapters);

  return {
    totalChapters: Number.isFinite(total) ? total : null,
    mangaUpdatesId: muKey ? parseInt(muKey, 36) : null, // base 36 → nombre
  };
}

// Même règle que dans l'app (lib/chapters.ts), sans MangaUpdates :
// série terminée → AniList ; sinon le plus grand nombre connu
function resolveTotalChapters(media: AnilistMedia, mangabakaTotal: number | null) {
  const isFinished = media.status === "FINISHED" || media.status === "CANCELLED";
  if (isFinished && media.chapters != null) return media.chapters;

  const candidates = [media.chapters, mangabakaTotal].filter((n): n is number => n != null);
  return candidates.length > 0 ? Math.max(...candidates) : null;
}

// Même nettoyage que dans l'app (lib/anilist.ts)
function cleanDescription(html: string | null) {
  if (!html) return null;
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
