-- =====================================================================
-- 04 — Préparer le catalogue à l'import automatique + progression + option 18+
-- À exécuter UNE fois dans Supabase > SQL Editor
--
-- Tout est dans une TRANSACTION (begin ... commit) : si une seule
-- instruction échoue, rien n'est appliqué. Pas de base à moitié modifiée.a
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. WEBTOON : les colonnes nécessaires à l'import depuis AniList
-- ---------------------------------------------------------------------

-- anilist_id : texte → nombre (les ids AniList sont des entiers).
-- La table est vide, la conversion est donc sans risque.
alter table public.webtoon
  alter column anilist_id type integer using anilist_id::integer;

-- Un même titre AniList ne peut exister qu'une fois dans le catalogue
alter table public.webtoon
  add constraint webtoon_anilist_id_key unique (anilist_id);

alter table public.webtoon
  add column if not exists synopsis          text,
  add column if not exists banner_url        text,
  add column if not exists country_of_origin varchar(2),          -- "KR", "CN", "JP"
  add column if not exists start_year        integer,
  add column if not exists is_adult          boolean not null default false,
  add column if not exists mangaupdates_id   bigint unique,       -- dépasse la taille d'un "integer"
  add column if not exists source            text not null default 'anilist',
  add column if not exists created_at        timestamptz not null default now();

-- D'où vient le titre : importé d'AniList, ou ajouté à la main (Phase 4)
alter table public.webtoon
  add constraint webtoon_source_check check (source in ('anilist', 'manual'));

-- Cohérence : un titre "anilist" DOIT avoir un anilist_id
alter table public.webtoon
  add constraint webtoon_anilist_source_check check (source <> 'anilist' or anilist_id is not null);


-- ---------------------------------------------------------------------
-- 2. GENRE : compléter avec tous les genres utilisés par AniList
-- ---------------------------------------------------------------------
insert into public.genre (name)
values ('Psychological'), ('Supernatural'), ('Mecha'), ('Music'), ('Ecchi'), ('Mahou Shoujo')
on conflict (name) do nothing;  -- ignore ceux qui existeraient déjà


-- ---------------------------------------------------------------------
-- 3. READING_PROGRESS : la progression devient un simple numéro
--    (au lieu d'une référence vers une ligne de la table chapter)
-- ---------------------------------------------------------------------
alter table public.reading_progress
  drop column if exists last_chapter_id;

alter table public.reading_progress
  add column if not exists current_chapter numeric not null default 0
    check (current_chapter >= 0);  -- numeric : accepte 10.5


-- ---------------------------------------------------------------------
-- 4. PROFILE : préférence "afficher le contenu adulte" (désactivée par défaut)
--    La politique RLS "modification de son propre profil" permet déjà
--    à chacun de changer cette valeur pour lui-même.
-- ---------------------------------------------------------------------
alter table public.profile
  add column if not exists show_adult_content boolean not null default false;

commit;
