-- =====================================================================
-- 07 — Confidentialité du profil
-- À exécuter dans Supabase > SQL Editor (transaction : tout ou rien)
--
-- LE PROBLÈME
-- La politique de 01 autorise tout utilisateur connecté à lire TOUTES les
-- colonnes de TOUS les profils :
--     on public.profile for select to authenticated using (true)
-- C'était correct quand "profile" ne contenait qu'un pseudo et un avatar.
-- Depuis 04, la table contient aussi "show_adult_content" — une préférence
-- intime. N'importe quel compte peut donc récupérer la liste des personnes
-- qui ont activé le contenu adulte.
--
-- POURQUOI LA RLS NE SUFFIT PAS À LE CORRIGER
-- La RLS filtre des LIGNES, jamais des COLONNES. On ne peut donc pas dire
-- « tout le monde voit le pseudo, mais seul le propriétaire voit la
-- préférence » avec une politique. Et restreindre "profile" à sa propre
-- ligne casserait l'affichage des pseudos dans les commentaires : un embed
-- PostgREST (profile!chapter_comment_user_id_fkey) obéit lui aussi à la RLS.
--
-- LA SOLUTION
-- Séparer les deux niveaux de confidentialité en deux tables :
--   public.profile          → ce que les autres peuvent voir (pseudo, avatar)
--   public.profile_private  → ce qui n'appartient qu'à soi
-- Une table = un niveau de confidentialité. "profile" reste lisible par les
-- autres (nécessaire pour les commentaires et la future recherche d'amis),
-- et il n'y a plus rien de sensible dedans.
--
-- ⚠️ AVANT DE LANCER : vérifie qu'aucune AUTRE colonne sensible ne traîne
--    dans "profile" (la table a été créée à la main dans l'interface) :
--
--      select column_name, data_type
--      from information_schema.columns
--      where table_schema = 'public' and table_name = 'profile'
--      order by ordinal_position;
--
--    Si tu y vois autre chose que id / username / avatar_url / created_at,
--    dis-le moi : il faudra peut-être la déplacer aussi.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. La table privée
--    La clé primaire EST la référence vers le profil : une ligne par
--    utilisateur, pas plus. "on delete cascade" fait disparaître les
--    préférences avec le compte.
-- ---------------------------------------------------------------------
create table if not exists public.profile_private (
  user_id            uuid primary key references public.profile(id) on delete cascade,
  show_adult_content boolean not null default false
);

alter table public.profile_private enable row level security;


-- ---------------------------------------------------------------------
-- 2. Les politiques : chacun ne voit et ne modifie que SA ligne
--    (les "drop ... if exists" rendent le fichier relançable sans erreur)
--    Pas de politique DELETE : on ne supprime pas ses préférences,
--    elles disparaissent avec le compte via la cascade.
-- ---------------------------------------------------------------------
drop policy if exists "profile_private: lire les siennes"     on public.profile_private;
drop policy if exists "profile_private: créer les siennes"    on public.profile_private;
drop policy if exists "profile_private: modifier les siennes" on public.profile_private;

create policy "profile_private: lire les siennes"
  on public.profile_private for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- INSERT est nécessaire malgré le trigger : les comptes créés AVANT cette
-- migration n'ont pas encore de ligne, l'app la crée au premier changement.
create policy "profile_private: créer les siennes"
  on public.profile_private for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "profile_private: modifier les siennes"
  on public.profile_private for update
  to authenticated
  using      ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);


-- ---------------------------------------------------------------------
-- 3. Déménager les valeurs existantes
--    Le bloc "do" ne recopie que si la colonne est encore là : sans lui,
--    relancer ce fichier échouerait après la suppression de l'étape 4.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'profile'
      and column_name  = 'show_adult_content'
  ) then
    insert into public.profile_private (user_id, show_adult_content)
    select id, show_adult_content from public.profile
    on conflict (user_id) do nothing;
  end if;
end $$;

-- Filet : une ligne (valeur par défaut) pour tout profil qui n'en a pas
insert into public.profile_private (user_id)
select id from public.profile
on conflict (user_id) do nothing;


-- ---------------------------------------------------------------------
-- 4. Supprimer la colonne devenue publique
--    C'est l'étape qui corrige réellement la fuite.
-- ---------------------------------------------------------------------
alter table public.profile drop column if exists show_adult_content;


-- ---------------------------------------------------------------------
-- 5. Mettre le trigger d'inscription à jour
--    Il doit maintenant créer DEUX lignes : le profil public et les
--    préférences privées. (Reprise de 02, avec l'insert supplémentaire.)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profile (id, username)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
      'user_' || left(replace(new.id::text, '-', ''), 8)
    )
  );

  -- Les préférences privées, avec leurs valeurs par défaut
  insert into public.profile_private (user_id)
  values (new.id);

  return new;
end;
$$;

commit;


-- =====================================================================
-- VÉRIFICATIONS (à lancer après le commit)
-- =====================================================================

-- 1. La colonne a bien disparu de la table publique → 0 ligne attendue
-- select column_name from information_schema.columns
-- where table_schema = 'public' and table_name = 'profile'
--   and column_name = 'show_adult_content';

-- 2. Chaque profil a bien ses préférences → 0 ligne attendue
-- select p.id, p.username
-- from public.profile p
-- left join public.profile_private pp on pp.user_id = p.id
-- where pp.user_id is null;
