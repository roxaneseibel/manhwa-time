-- =====================================================================
-- 10 — Les amis (Phase 3, partie 1)
-- À exécuter dans Supabase > SQL Editor (transaction : tout ou rien)
--
-- La table "friendship" existe depuis le tout début, mais elle n'a JAMAIS eu
-- de politique RLS : avec la RLS activée et aucune politique, Postgres refuse
-- tout. Personne n'a donc jamais pu y écrire une seule ligne. On la recrée
-- donc avec la forme dont les demandes d'ami ont besoin, après avoir vérifié
-- qu'elle est bien vide.
--
-- LE MODÈLE CHOISI : une seule ligne par relation, orientée
--   requester_id → addressee_id, avec un statut 'pending' puis 'accepted'.
-- Pas de ligne en double dans l'autre sens (un trigger l'interdit), et
-- refuser une demande = supprimer la ligne. C'est plus simple qu'un statut
-- 'refused' à traîner, et ça permet de redemander plus tard.
-- Pour empêcher quelqu'un d'insister, il y a déjà user_block (étape 8e).
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 0. Garde-fou : on ne détruit rien qui contienne des données
-- ---------------------------------------------------------------------
do $$
declare n bigint;
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'friendship'
  ) then
    execute 'select count(*) from public.friendship' into n;
    if n > 0 then
      raise exception
        'friendship contient % ligne(s) : migration interrompue. Regarde son contenu avant de continuer.', n;
    end if;
  end if;
end $$;

drop table if exists public.friendship;


-- ---------------------------------------------------------------------
-- 1. LA TABLE
--    default auth.uid() sur requester_id : même motif que chapter_comment
--    (étape 8e). L'app n'envoie que le destinataire, jamais son propre id —
--    impossible d'envoyer une demande au nom de quelqu'un d'autre.
-- ---------------------------------------------------------------------
create table public.friendship (
  requester_id uuid        not null default auth.uid() references public.profile(id) on delete cascade,
  addressee_id uuid        not null                    references public.profile(id) on delete cascade,
  status       text        not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,

  -- Une seule relation par paire orientée
  primary key (requester_id, addressee_id),
  -- On ne se demande pas en ami soi-même
  check (requester_id <> addressee_id)
);

-- La clé primaire indexe (requester_id, addressee_id) : on couvre le sens
-- inverse, utilisé par « qui m'a demandé en ami ? ».
create index friendship_addressee_idx on public.friendship (addressee_id, status);


-- ---------------------------------------------------------------------
-- 2. LES DROITS PAR COLONNE
--    La RLS dit quelles LIGNES, les grants disent quelles COLONNES.
--    L'app ne peut écrire que addressee_id (à l'insertion) et status
--    (à l'acceptation) : ni les dates, ni l'identité du demandeur.
-- ---------------------------------------------------------------------
revoke all on public.friendship from anon, authenticated;

grant select, delete        on public.friendship to authenticated;
grant insert (addressee_id) on public.friendship to authenticated;
grant update (status)       on public.friendship to authenticated;


-- ---------------------------------------------------------------------
-- 3. LES POLITIQUES
-- ---------------------------------------------------------------------
alter table public.friendship enable row level security;

-- Lire : uniquement les relations qui me concernent.
-- Conséquence voulue : personne ne peut lister les amis de quelqu'un d'autre.
create policy "friendship: lire les miennes"
  on public.friendship for select to authenticated
  using (
    requester_id = (select auth.uid())
    or addressee_id = (select auth.uid())
  );

-- Demander : en son nom, en 'pending', et jamais si l'un des deux a bloqué
-- l'autre (dans un sens OU dans l'autre : un blocage coupe les deux côtés).
create policy "friendship: envoyer une demande"
  on public.friendship for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and status = 'pending'
    and not exists (
      select 1 from public.user_block b
      where (b.blocker_id = (select auth.uid()) and b.blocked_id = friendship.addressee_id)
         or (b.blocker_id = friendship.addressee_id and b.blocked_id = (select auth.uid()))
    )
  );

-- Accepter : seul le DESTINATAIRE, et seulement de 'pending' vers 'accepted'.
--   using      = la ligne telle qu'elle est AVANT
--   with check = la ligne telle qu'elle sera APRÈS
-- Donc : impossible de s'accepter soi-même comme ami, impossible de repasser
-- une amitié en 'pending'.
create policy "friendship: accepter une demande reçue"
  on public.friendship for update to authenticated
  using      (addressee_id = (select auth.uid()) and status = 'pending')
  with check (addressee_id = (select auth.uid()) and status = 'accepted');

-- Supprimer : les trois gestes d'un coup, selon qui appelle et dans quel état
-- est la ligne — annuler ma demande, refuser une demande reçue, ou retirer
-- quelqu'un de mes amis.
create policy "friendship: annuler, refuser ou retirer"
  on public.friendship for delete to authenticated
  using (
    requester_id = (select auth.uid())
    or addressee_id = (select auth.uid())
  );


-- ---------------------------------------------------------------------
-- 4. LE TRIGGER
--    a) interdire la relation en double dans l'autre sens : si B m'a déjà
--       demandé, je ne crée pas une seconde ligne, j'accepte la sienne.
--    b) horodater l'acceptation (l'app n'a pas le droit d'écrire accepted_at)
--
--    security definer : la vérification doit voir la ligne inverse même dans
--    les cas où la RLS la masquerait, sinon le doublon passerait.
-- ---------------------------------------------------------------------
create or replace function public.friendship_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if exists (
      select 1 from public.friendship f
      where f.requester_id = new.addressee_id
        and f.addressee_id = new.requester_id
    ) then
      -- Message court et stable : l'app le reconnaît pour afficher
      -- « Cette personne t'a déjà envoyé une demande » (voir lib/friends.ts)
      raise exception 'friendship_reverse_exists';
    end if;

  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status <> 'accepted' then
    new.accepted_at := now();
  end if;

  return new;
end;
$$;

create trigger friendship_guard_before
  before insert or update on public.friendship
  for each row execute function public.friendship_guard();


-- ---------------------------------------------------------------------
-- 5. LES FONCTIONS DE LECTURE
--    Toutes en security invoker : elles ne lisent que ce que la RLS laisse
--    déjà voir à l'appelant. Aucune ne contourne quoi que ce soit.
--    Les ::text sont là parce que la fonction déclare des colonnes "text" :
--    si profile.username est un varchar, la conversion doit être explicite.
-- ---------------------------------------------------------------------

-- Mes amis. Le "case" sert à prendre l'AUTRE personne de la relation, sans
-- avoir à savoir qui a demandé qui.
create or replace function public.my_friends()
returns table (id uuid, username text, avatar_url text, friends_since timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.username::text, p.avatar_url::text, f.accepted_at
  from public.friendship f
  join public.profile p
    on p.id = case
                when f.requester_id = (select auth.uid()) then f.addressee_id
                else f.requester_id
              end
  where f.status = 'accepted'
  order by p.username;
$$;

-- Les demandes en attente, dans les deux sens.
-- 'incoming' = à accepter ou refuser ; 'outgoing' = en attente de réponse.
create or replace function public.my_friend_requests()
returns table (direction text, id uuid, username text, avatar_url text, created_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    case when f.addressee_id = (select auth.uid()) then 'incoming' else 'outgoing' end,
    p.id, p.username::text, p.avatar_url::text, f.created_at
  from public.friendship f
  join public.profile p
    on p.id = case
                when f.addressee_id = (select auth.uid()) then f.requester_id
                else f.addressee_id
              end
  where f.status = 'pending'
  order by f.created_at desc;
$$;

-- Chercher quelqu'un par pseudo, avec l'état de la relation pour que l'app
-- sache quel bouton afficher.
--
-- translate(..., '%\', '') retire les jokers de LIKE au lieu de les échapper :
-- sans ça, chercher "%" listerait tout le monde. Le "_" est laissé : c'est un
-- caractère autorisé dans les pseudos, et comme joker il ne fait qu'élargir
-- un peu la recherche — sans danger.
create or replace function public.search_users(p_query text, p_limit integer default 20)
returns table (id uuid, username text, avatar_url text, relation text)
language sql
stable
security invoker
set search_path = ''
as $$
  with needle as (
    select translate(coalesce(p_query, ''), '%\', '') as q
  )
  select
    p.id,
    p.username::text,
    p.avatar_url::text,
    case
      when p.id = (select auth.uid()) then 'self'
      when exists (
        select 1 from public.friendship f
        where f.status = 'accepted'
          and ((f.requester_id = (select auth.uid()) and f.addressee_id = p.id)
            or (f.requester_id = p.id and f.addressee_id = (select auth.uid())))
      ) then 'friends'
      when exists (
        select 1 from public.friendship f
        where f.status = 'pending'
          and f.requester_id = (select auth.uid()) and f.addressee_id = p.id
      ) then 'sent'
      when exists (
        select 1 from public.friendship f
        where f.status = 'pending'
          and f.requester_id = p.id and f.addressee_id = (select auth.uid())
      ) then 'received'
      else 'none'
    end
  from public.profile p, needle n
  where length(n.q) >= 2                     -- en dessous, on ne liste rien
    and p.username ilike '%' || n.q || '%'
    -- les personnes bloquées (dans un sens ou l'autre) n'apparaissent pas
    and not exists (
      select 1 from public.user_block b
      where (b.blocker_id = (select auth.uid()) and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = (select auth.uid()))
    )
  -- une correspondance exacte d'abord, puis par ordre alphabétique
  order by (lower(p.username) = lower(n.q)) desc, p.username
  limit least(coalesce(p_limit, 20), 50);
$$;

revoke execute on function public.my_friends()                   from public, anon;
revoke execute on function public.my_friend_requests()           from public, anon;
revoke execute on function public.search_users(text, integer)    from public, anon;
grant  execute on function public.my_friends()                   to authenticated;
grant  execute on function public.my_friend_requests()           to authenticated;
grant  execute on function public.search_users(text, integer)    to authenticated;

commit;


-- =====================================================================
-- VÉRIFICATIONS (dans le SQL Editor, auth.uid() est null : tout est vide,
-- c'est normal. Le vrai test se fait depuis l'app, avec deux comptes.)
-- =====================================================================
-- select * from public.search_users('ro');     -- 0 ligne ici
-- select * from public.my_friends();           -- 0 ligne ici
-- select * from public.my_friend_requests();   -- 0 ligne ici

-- Vue d'ensemble des relations (le SQL Editor contourne la RLS) :
-- select r.username as demandeur, a.username as destinataire, f.status, f.created_at
-- from public.friendship f
-- join public.profile r on r.id = f.requester_id
-- join public.profile a on a.id = f.addressee_id
-- order by f.created_at desc;
