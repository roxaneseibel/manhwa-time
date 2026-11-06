-- =====================================================================
-- 09 — Statistiques de lecture
-- À exécuter dans Supabase > SQL Editor (relançable sans risque)
--
-- POURQUOI DANS LA BASE ET PAS DANS L'APP
-- Calculer ces chiffres côté téléphone voudrait dire télécharger toutes les
-- lignes de chapter_read, tous les webtoon_genre... pour n'afficher que des
-- totaux. Ici, Postgres agrège et ne renvoie qu'un petit objet JSON : une
-- seule requête, quelques centaines d'octets, quel que soit l'historique.
--
-- POURQUOI "SECURITY INVOKER" (le défaut) ET PAS "SECURITY DEFINER"
-- Contrairement à webtoons_to_sync (08), cette fonction n'a besoin de
-- contourner AUCUNE règle : elle ne lit que les lignes de celui qui l'appelle,
-- et la RLS de chapter_read / reading_progress fait déjà exactement ce tri.
-- Autant laisser la RLS travailler : une fonction qui ne contourne rien ne
-- peut pas servir à fuiter les données de quelqu'un d'autre.
-- Règle à retenir : security definer seulement quand c'est indispensable.
-- =====================================================================

create or replace function public.my_reading_stats()
returns jsonb
language sql
stable
security invoker       -- le défaut, écrit ici pour que l'intention soit claire
set search_path = ''
as $$
  with
  -- Les chapitres lus par l'utilisateur courant, avec leur série.
  -- La RLS limite déjà chapter_read à ses propres lignes ; le filtre explicite
  -- sur user_id est une ceinture en plus de la bretelle.
  reads as (
    select cr.read_count, cr.rating, cr.emotion, c.webtoon_id
    from public.chapter_read cr
    join public.chapter c on c.id = cr.chapter_id
    where cr.user_id = (select auth.uid())
  ),
  entries as (
    select status
    from public.reading_progress
    where user_id = (select auth.uid())
  )
  select jsonb_build_object(

    -- Chapitres lus, relectures comprises (un chapitre lu 3 fois compte 3)
    'chapters_read',   coalesce((select sum(read_count) from reads), 0),

    -- Chapitres différents (un chapitre lu 3 fois compte 1)
    'unique_chapters', (select count(*) from reads),

    -- La différence : le nombre de relectures
    'rereads',         coalesce((select sum(read_count - 1) from reads), 0),

    -- Temps de lecture ESTIMÉ. 6 minutes par chapitre : un épisode de webtoon
    -- se lit plus vite qu'un chapitre de manga papier. C'est une convention
    -- assumée, pas une mesure — l'app l'affiche comme une estimation.
    'minutes_read',    coalesce((select sum(read_count) from reads), 0) * 6,

    'series_total',    (select count(*) from entries),

    -- { "reading": 4, "completed": 2, ... } : seuls les statuts utilisés
    -- apparaissent, l'app complète les manquants par 0.
    'by_status',       coalesce(
                         (select jsonb_object_agg(status, n)
                          from (select status, count(*) as n from entries group by status) s),
                         '{}'::jsonb
                       ),

    'rated_count',     (select count(*) from reads where rating is not null),
    'average_rating',  (select round(avg(rating)::numeric, 1) from reads where rating is not null),

    -- Les 5 genres les plus présents, comptés en SÉRIES et non en chapitres :
    -- sinon un seul webtoon de 600 chapitres écraserait tous les autres.
    'top_genres',      coalesce(
                         (select jsonb_agg(jsonb_build_object('name', name, 'count', n)
                                           order by n desc, name)
                          from (
                            select g.name, count(distinct r.webtoon_id) as n
                            from reads r
                            join public.webtoon_genre wg on wg.webtoon_id = r.webtoon_id
                            join public.genre g on g.id = wg.genre_id
                            group by g.name
                            order by n desc, g.name
                            limit 5
                          ) t),
                         '[]'::jsonb
                       ),

    -- Les 3 émotions les plus souvent choisies
    'top_emotions',    coalesce(
                         (select jsonb_agg(jsonb_build_object('emotion', emotion, 'count', n)
                                           order by n desc, emotion)
                          from (
                            select emotion, count(*) as n
                            from reads
                            where emotion is not null
                            group by emotion
                            order by n desc, emotion
                            limit 3
                          ) e),
                         '[]'::jsonb
                       )
  );
$$;

-- Accessible aux utilisateurs connectés uniquement. Un visiteur anonyme n'a
-- rien à y lire de toute façon (auth.uid() serait null), mais autant le dire.
revoke execute on function public.my_reading_stats() from public;
revoke execute on function public.my_reading_stats() from anon;
grant  execute on function public.my_reading_stats() to authenticated;


-- =====================================================================
-- VÉRIFICATION
-- =====================================================================
-- Lancée ici, dans le SQL Editor, auth.uid() est null → tous les compteurs
-- valent 0 et les listes sont vides. C'est NORMAL et c'est même la preuve que
-- la fonction ne lit rien qui ne lui appartient pas.
-- Le vrai test se fait depuis l'app, connectée avec un compte.
-- select public.my_reading_stats();
