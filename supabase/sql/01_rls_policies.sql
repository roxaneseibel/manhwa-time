-- =====================================================================
-- 01 — Politiques RLS (Row Level Security)
-- À exécuter une seule fois dans Supabase > SQL Editor
-- (le relancer provoque une erreur "policy already exists")
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Filet de sécurité : s'assurer que la RLS est activée partout.
--    Sans effet si elle l'est déjà.
-- ---------------------------------------------------------------------
alter table public.profile          enable row level security;
alter table public.webtoon          enable row level security;
alter table public.genre            enable row level security;
alter table public.webtoon_genre    enable row level security;
alter table public.chapter          enable row level security;
alter table public.reading_progress enable row level security;
alter table public.friendship       enable row level security;
alter table public.activity         enable row level security;


-- ---------------------------------------------------------------------
-- 1. CATALOGUE (webtoon, webtoon_genre, chapter)
--    Tout le monde peut lire. L'app n'écrit JAMAIS dans le catalogue :
--    ce sont les Edge Functions (import depuis AniList, sync des chapitres
--    via MangaDex/MangaUpdates) qui écrivent avec la clé service_role,
--    laquelle ignore la RLS.
--    Les ajouts manuels (source = 'manual') auront leur politique en Phase 4.
-- ---------------------------------------------------------------------
create policy "webtoon: lecture publique"
  on public.webtoon for select
  to anon, authenticated
  using (true);

create policy "webtoon_genre: lecture publique"
  on public.webtoon_genre for select
  to anon, authenticated
  using (true);

create policy "chapter: lecture publique"
  on public.chapter for select
  to anon, authenticated
  using (true);


-- ---------------------------------------------------------------------
-- 2. PROFILE
--    Un utilisateur connecté peut voir tous les profils (nécessaire pour
--    chercher des amis), mais ne peut modifier QUE le sien.
--    Pas de politique INSERT : le profil sera créé automatiquement par
--    un trigger à l'inscription (prochaine étape).
-- ---------------------------------------------------------------------
create policy "profile: lecture par un utilisateur connecté"
  on public.profile for select
  to authenticated
  using (true);

create policy "profile: modification de son propre profil"
  on public.profile for update
  to authenticated
  using      ((select auth.uid()) = id)   -- quelles lignes je peux cibler
  with check ((select auth.uid()) = id);  -- à quoi la ligne doit ressembler après


-- ---------------------------------------------------------------------
-- 3. READING_PROGRESS
--    Chacun ne voit et ne manipule que SA progression.
--    (On ouvrira la lecture aux amis en Phase 3.)
-- ---------------------------------------------------------------------
create policy "reading_progress: lire sa progression"
  on public.reading_progress for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "reading_progress: ajouter pour soi"
  on public.reading_progress for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "reading_progress: modifier sa progression"
  on public.reading_progress for update
  to authenticated
  using      ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "reading_progress: supprimer sa progression"
  on public.reading_progress for delete
  to authenticated
  using ((select auth.uid()) = user_id);


-- ---------------------------------------------------------------------
-- 4. FRIENDSHIP et ACTIVITY
--    Volontairement AUCUNE politique pour l'instant → tout est refusé.
--    On les écrira en Phase 3, quand on construira le social.
-- ---------------------------------------------------------------------
