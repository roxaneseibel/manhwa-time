// =============================================================================
// Edge Function : sync-chapters
//
// Appelée automatiquement par Supabase Cron (pas par l'app, pas par un
// utilisateur). Elle cherche les nouveaux chapitres des séries SUIVIES par au
// moins une personne, et crée les lignes "chapter" correspondantes.
//
// Sans elle, les chapitres ne sont créés qu'au moment de l'import d'un titre :
// quelqu'un qui suit une série depuis un mois ne verrait jamais arriver les
// nouvelles sorties. C'est la promesse même de l'app.
//
// POURQUOI ELLE NE RESSEMBLE PAS À import-webtoon
// import-webtoon est appelée par l'app au nom d'un utilisateur connecté, donc
// elle utilise withSupabase({ auth: "user" }). Ici il n'y a aucun utilisateur :
// l'appelant est une tâche planifiée. On crée donc le client administrateur à
// la main, et on protège la fonction par un secret partagé (voir plus bas).
// =============================================================================

import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Nombre de séries traitées par exécution. Volontairement bas : chaque série
// coûte jusqu'à 4 appels d'API externes, et une Edge Function ne peut pas
// tourner indéfiniment. Avec un passage toutes les 6 h, 12 séries par passage
// = 48 séries rafraîchies par jour, largement assez au début.
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 40;

// Pause entre deux séries : AniList limite à 30 requêtes/minute PAR IP, et les
// Edge Functions de Supabase partagent leurs adresses IP avec d'autres projets.
const PAUSE_BETWEEN_TITLES_MS = 2_000;

const EXTERNAL_TIMEOUT_MS = 10_000;

// Pour les dates de sortie, on ne relit que les pages récentes de l'historique
// MangaUpdates : les anciens chapitres ont déjà leur date depuis l'import.
const MU_RECENT_PAGES = 3;

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
  status: string | null;
  chapters: number | null;
  averageScore: number | null;
};

// La fonction SQL ne renvoie que des identifiants : syncOne relit ensuite la
// fiche complète, dont elle a besoin de toute façon (titre, total actuel...).
type Candidate = {
  id: string;
};

type Report = {
  title: string;
  before: number | null;
  after: number | null;
  newChapters: number;
};

Deno.serve(async (req) => {
  // ---------------------------------------------------------------------------
  // 1. Qui appelle ?
  //    La fonction est déployée avec verify_jwt = false (le Cron n'a pas de
  //    jeton d'utilisateur), donc c'est CE contrôle qui la protège. Sans lui,
  //    n'importe qui sur Internet pourrait déclencher la synchronisation.
  // ---------------------------------------------------------------------------
  const expectedSecret = Deno.env.get("SYNC_SECRET");
  if (!expectedSecret) {
    console.error("SYNC_SECRET absent : la fonction refuse de tourner sans protection");
    return jsonError(500, "Fonction mal configurée");
  }
  if (req.headers.get("x-sync-secret") !== expectedSecret) {
    return jsonError(401, "Non autorisé");
  }

  const body = await req.json().catch(() => null);
  const limit = clamp(Number(body?.limit) || DEFAULT_LIMIT, 1, MAX_LIMIT);

  // ---------------------------------------------------------------------------
  // 2. Le client administrateur
  //    Ces deux variables d'environnement sont injectées automatiquement par
  //    Supabase dans toutes les Edge Functions : rien à configurer.
  //    service_role ignore la RLS — c'est ce qui permet d'écrire dans le
  //    catalogue, que l'app n'a pas le droit de toucher.
  // ---------------------------------------------------------------------------
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // ---------------------------------------------------------------------------
  // 3. Quelles séries ? C'est la base qui décide (fonction SQL de la 08) :
  //    suivies par quelqu'un, pas terminées, pas déjà synchronisées récemment,
  //    les plus anciennes d'abord.
  // ---------------------------------------------------------------------------
  const { data: candidates, error: listError } = await admin
    .rpc("webtoons_to_sync", { p_limit: limit })
    .returns<Candidate[]>();

  if (listError) {
    console.error("webtoons_to_sync", listError);
    return jsonError(500, "Impossible de lister les séries à synchroniser");
  }

  if (!candidates || candidates.length === 0) {
    return Response.json({ checked: 0, updated: [], message: "Rien à synchroniser" });
  }

  // ---------------------------------------------------------------------------
  // 4. Une série après l'autre (jamais en parallèle : on ménage les APIs)
  // ---------------------------------------------------------------------------
  const updated: Report[] = [];
  const failed: string[] = [];

  for (const [index, candidate] of candidates.entries()) {
    if (index > 0) await sleep(PAUSE_BETWEEN_TITLES_MS);

    try {
      const report = await syncOne(admin, candidate);
      if (report && report.newChapters > 0) updated.push(report);
    } catch (e) {
      // Une série qui échoue ne doit pas interrompre les suivantes
      console.error(`sync ${candidate.id}`, e);
      failed.push(candidate.id);
    }
  }

  return Response.json({
    checked: candidates.length,
    updated,
    failed: failed.length > 0 ? failed : undefined,
  });
});

// =============================================================================
// Synchronisation d'UNE série
// =============================================================================

async function syncOne(admin: SupabaseClient, candidate: Candidate): Promise<Report | null> {
  // On relit la fiche : on a besoin du titre, du total actuel et de l'id AniList
  const { data: webtoon, error } = await admin
    .from("webtoon")
    .select("id, anilist_id, title, total_chapters, mangaupdates_id")
    .eq("id", candidate.id)
    .single();

  if (error || !webtoon) throw error ?? new Error("Fiche introuvable");

  const currentTotal = toNumberOrNull(webtoon.total_chapters);

  // --- Les sources, dans l'ordre du moins au plus faillible ---------------
  const media = await fetchAnilistMedia(webtoon.anilist_id);

  // MangaBaka sert à deux choses : un total de chapitres, et l'id MangaUpdates
  // pour les séries importées avant qu'on sache le récupérer.
  const mangabaka = await fetchMangabaka(webtoon.anilist_id).catch(() => null);
  const muId = webtoon.mangaupdates_id ?? mangabaka?.mangaUpdatesId ?? null;

  const muLatest = muId ? await fetchMuLatestChapter(muId).catch(() => null) : null;

  // --- La règle de fiabilité (la même que lib/chapters.ts dans l'app) ------
  const newTotal = resolveTotalChapters(media, mangabaka?.totalChapters ?? null, muLatest);

  // --- Mettre la fiche à jour, qu'il y ait du nouveau ou pas ---------------
  // chapters_synced_at est écrit DANS TOUS LES CAS : c'est ce qui fait tourner
  // la file d'attente. Sans ça, les mêmes séries seraient reprises à l'infini.
  const patch: Record<string, unknown> = {
    chapters_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (media) {
    patch.status = STATUS_MAP[media.status ?? ""] ?? "ongoing";
    patch.average_score = media.averageScore;
  }
  if (muId && !webtoon.mangaupdates_id) patch.mangaupdates_id = muId;
  if (newTotal != null && (currentTotal == null || newTotal > currentTotal)) {
    patch.total_chapters = newTotal;
  }

  // --- Les nouveaux chapitres ---------------------------------------------
  let created = 0;
  if (newTotal != null && newTotal > (currentTotal ?? 0)) {
    created = await createChapters(admin, webtoon.id, (currentTotal ?? 0) + 1, newTotal);

    // Les dates de sortie des chapitres qu'on vient de créer
    if (created > 0 && muId) {
      await syncRecentReleaseDates(admin, webtoon.id, muId, (currentTotal ?? 0) + 1, newTotal);
    }
  }

  const { error: updateError } = await admin.from("webtoon").update(patch).eq("id", webtoon.id);
  if (updateError) throw updateError;

  return {
    title: webtoon.title,
    before: currentTotal,
    after: newTotal,
    newChapters: created,
  };
}

// Crée les lignes "chapter" de "from" à "to". Renvoie le nombre créé.
async function createChapters(admin: SupabaseClient, webtoonId: string, from: number, to: number) {
  const start = Math.floor(from);
  const end = Math.floor(to);
  if (end < start) return 0;

  // Garde-fou : une source qui déraille (total à 99999) ne doit pas remplir
  // la table de dizaines de milliers de lignes fantômes.
  if (end - start > 2000) {
    console.warn(`${webtoonId} : saut suspect de ${start} à ${end}, ignoré`);
    return 0;
  }

  const rows = Array.from({ length: end - start + 1 }, (_, i) => ({
    webtoon_id: webtoonId,
    number: start + i,
  }));

  for (let offset = 0; offset < rows.length; offset += 1000) {
    const { error } = await admin
      .from("chapter")
      .upsert(rows.slice(offset, offset + 1000), {
        onConflict: "webtoon_id,number",
        ignoreDuplicates: true, // un chapitre déjà là garde sa date
      });
    if (error) throw error;
  }

  return rows.length;
}

// Remplit published_at pour les chapitres nouvellement créés.
// Contrairement à l'import (qui relit tout l'historique du plus ancien au plus
// récent), on part des sorties les PLUS RÉCENTES et on s'arrête dès qu'on
// descend sous le premier chapitre nouveau : c'est là que sont nos dates.
async function syncRecentReleaseDates(
  admin: SupabaseClient,
  webtoonId: string,
  muSeriesId: number,
  from: number,
  to: number,
) {
  const dates = new Map<number, string>();

  for (let page = 1; page <= MU_RECENT_PAGES; page++) {
    const response = await fetch("https://api.mangaupdates.com/v1/releases/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        search: String(muSeriesId),
        search_type: "series",
        orderby: "date",
        asc: "desc", // de la plus récente à la plus ancienne
        perpage: 100,
        page,
      }),
      signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS),
    });
    if (!response.ok) break;

    const json = await response.json();
    const results: { record: { chapter: string; release_date: string } }[] = json.results ?? [];
    if (results.length === 0) break;

    let reachedOlder = false;
    for (const { record } of results) {
      for (const number of parseChapterRange(record.chapter)) {
        if (number < from) {
          reachedOlder = true; // on est redescendu dans le déjà-connu
          continue;
        }
        // La plus ANCIENNE date connue d'un chapitre est la bonne : une
        // réédition sort plus tard. On parcourt du récent vers l'ancien,
        // donc on écrase sans condition.
        if (number <= to) dates.set(number, record.release_date);
      }
    }

    if (reachedOlder || results.length < 100) break;
    await sleep(500); // MangaUpdates demande d'espacer les appels
  }

  if (dates.size === 0) return;

  const rows = [...dates].map(([number, date]) => ({
    webtoon_id: webtoonId,
    number,
    published_at: date,
  }));

  // Sans ignoreDuplicates : ici on VEUT écrire published_at
  const { error } = await admin.from("chapter").upsert(rows, { onConflict: "webtoon_id,number" });
  if (error) console.error("update published_at", error);
}

// =============================================================================
// Appels aux APIs externes
// =============================================================================

async function fetchAnilistMedia(anilistId: number): Promise<AnilistMedia | null> {
  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      query: `
        query ($id: Int) {
          Media(id: $id, type: MANGA) {
            id
            status
            chapters
            averageScore
          }
        }
      `,
      variables: { id: anilistId },
    }),
    signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS),
  });

  if (!response.ok) return null; // panne ou quota : on continue sans AniList
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

async function fetchMuLatestChapter(muSeriesId: number) {
  const response = await fetch(`https://api.mangaupdates.com/v1/series/${muSeriesId}`, {
    signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS),
  });
  if (!response.ok) return null;

  const json = await response.json();
  return toNumberOrNull(json.latest_chapter);
}

// =============================================================================
// Utilitaires
// =============================================================================

// Même règle que lib/chapters.ts dans l'app :
// série terminée et comptée par AniList → AniList fait foi ;
// sinon on prend le plus grand nombre connu (aucune source n'est complète).
function resolveTotalChapters(
  media: AnilistMedia | null,
  mangabakaTotal: number | null,
  muLatest: number | null,
) {
  const isFinished = media?.status === "FINISHED" || media?.status === "CANCELLED";
  if (isFinished && media?.chapters != null) return media.chapters;

  const candidates = [media?.chapters ?? null, mangabakaTotal, muLatest].filter(
    (n): n is number => n != null && Number.isFinite(n) && n > 0,
  );
  return candidates.length > 0 ? Math.max(...candidates) : null;
}

// "12" → [12] ; "7-8" → [7, 8] ; "10.5", "Prologue", "S2 c.3" → [] (ignorés)
function parseChapterRange(text: string): number[] {
  const match = String(text ?? "").trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
  if (!match) return [];

  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : start;
  if (end < start || end - start > 50) return []; // plage absurde

  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function toNumberOrNull(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonError(status: number, message: string) {
  return Response.json({ error: message }, { status });
}
