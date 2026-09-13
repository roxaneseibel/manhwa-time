-- =====================================================================
-- 03 — Règles du pseudo + vérification de disponibilité
-- À exécuter dans Supabase > SQL Editor (relançable sans erreur)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Les RÈGLES, gravées dans la base
--    L'app vérifiera aussi, mais seulement pour afficher un joli message :
--    la vraie garantie, c'est ici (on ne fait jamais confiance au client).
-- ---------------------------------------------------------------------

-- Un profil a toujours un pseudo
alter table public.profile
  alter column username set not null;

-- Format : 3 à 20 caractères, lettres sans accent, chiffres, underscore
alter table public.profile
  drop constraint if exists profile_username_format;
alter table public.profile
  add constraint profile_username_format
  check (username ~ '^[a-zA-Z0-9_]{3,20}$');

-- Unicité SANS tenir compte des majuscules : "Roxane" bloque "roxane".
-- (La contrainte unique d'origine, elle, les considère comme différents.)
create unique index if not exists profile_username_lower_key
  on public.profile (lower(username));


-- ---------------------------------------------------------------------
-- 2. La fonction appelable depuis l'app : supabase.rpc('is_username_available', ...)
-- ---------------------------------------------------------------------
create or replace function public.is_username_available(p_username text)
returns boolean
language sql
stable                     -- ne modifie rien, se contente de lire
security definer           -- lit profile avec les droits du créateur (anon n'y a pas accès)
set search_path = ''
as $$
  select
    p_username ~ '^[a-zA-Z0-9_]{3,20}$'
    and not exists (
      select 1 from public.profile
      where lower(username) = lower(p_username)
    );
$$;

-- Qui a le droit d'appeler cette fonction : les visiteurs (inscription) et les connectés
grant execute on function public.is_username_available(text) to anon, authenticated;
