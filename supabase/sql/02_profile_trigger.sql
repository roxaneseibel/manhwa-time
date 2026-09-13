-- =====================================================================
-- 02 — Création automatique du profil à l'inscription
-- À exécuter dans Supabase > SQL Editor
-- (relançable sans erreur grâce à "or replace" et "drop ... if exists")
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. La FONCTION : ce qu'on veut faire
--    Elle reçoit la nouvelle ligne de auth.users (appelée "new")
--    et crée la ligne correspondante dans public.profile.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger            -- type spécial : cette fonction est faite pour un trigger
language plpgsql           -- le langage procédural de Postgres (variables, if, etc.)
security definer           -- s'exécute avec les droits du CRÉATEUR (postgres), pas de l'appelant
set search_path = ''       -- sécurité : aucun schéma implicite, on écrit tout en entier (public.xxx)
as $$
begin
  insert into public.profile (id, username)
  values (
    new.id,
    -- Le pseudo choisi à l'inscription arrive dans les métadonnées de l'utilisateur.
    -- S'il est absent (ex : utilisateur créé depuis le dashboard), on en génère un
    -- provisoire du type "user_3f9a1c2b" pour ne jamais bloquer l'inscription.
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
      'user_' || left(replace(new.id::text, '-', ''), 8)
    )
  );

  return new;              -- obligatoire pour un trigger "row" ; la valeur est ignorée en AFTER
end;
$$;


-- ---------------------------------------------------------------------
-- 2. Le TRIGGER : quand déclencher la fonction
--    Après chaque insertion dans auth.users, une fois par ligne.
-- ---------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
