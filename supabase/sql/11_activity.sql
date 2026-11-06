-- =====================================================================
-- 11 — Le feed d'activité (Phase 3, partie 2)
-- À exécuter APRÈS la 10 (le feed dépend de friendship).
--
-- L'IDÉE : l'app n'écrit jamais dans "activity". Ce sont des triggers qui
-- enregistrent les événements au moment où ils se produisent. Deux raisons :
--   1. impossible de fabriquer une fausse activité depuis le téléphone ;
--   2. impossible d'oublier d'en écrire une — tout passe forcément par la base.
--
-- LE PIÈGE ÉVITÉ : cocher 250 chapitres d'un coup (ce que fait déjà
-- mark_chapters_read) ne doit pas produire 250 lignes de feed. Le trigger est
-- donc "for each STATEMENT" avec une transition table, comme
-- sync_current_chapter de l'étape 05 : une requête = une ligne de feed par
-- série, avec le nombre de chapitres dedans.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 0. Garde-fou (même raison qu'en 10 : la table existe mais n'a jamais
--    eu de politique, donc elle n'a jamais pu recevoir de ligne)
-- ---------------------------------------------------------------------
do $$
declare n bigint;
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'activity'
  ) then
    execute 'select count(*) from public.activity' into n;
    if n > 0 then
      raise exception
        'activity contient % ligne(s) : migration interrompue. Regarde son contenu avant de continuer.', n;
    end if;
  end if;
end $$;

drop table if exists public.activity;


-- ---------------------------------------------------------------------
-- 1. LA TABLE
--    Un seul type de ligne pour quatre événements, avec des colonnes
--    facultatives selon le type. Plus simple qu'une table par événement,
--    et le feed reste une seule requête triée par date.
-- ---------------------------------------------------------------------
create table public.activity (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references public.profile(id) on delete cascade,
  type           text        not null check (type in (
                   'chapters_read',     -- a lu N chapitres d'une série
                   'series_started',    -- a commencé une série
                   'series_completed',  -- a terminé une série
                   'chapter_rated'      -- a noté un chapitre
                 )),
  webtoon_id     uuid        references public.webtoon(id) on delete cascade,
  chapter_number numeric,                -- dernier chapitre concerné
  chapter_count  integer,                 -- combien de chapitres (type chapters_read)
  rating         smallint check (rating between 1 and 5),
  created_at     timestamptz not null default now()
);

-- Le feed lit « les activités de mes amis, les plus récentes d'abord » :
-- l'index par (user_id, date) sert le filtre, celui par date seule sert le tri.
create index activity_user_date_idx on public.activity (user_id, created_at desc);
create index activity_date_idx      on public.activity (created_at desc);


-- ---------------------------------------------------------------------
-- 2. LES DROITS
--    Aucun "grant insert" : personne ne peut créer une activité depuis l'app.
--    Seuls les triggers (security definer) écrivent. En revanche on peut
--    supprimer les siennes, pour retirer quelque chose du feed.
-- ---------------------------------------------------------------------
revoke all on public.activity from anon, authenticated;

grant select, delete on public.activity to authenticated;


-- ---------------------------------------------------------------------
-- 3. LA POLITIQUE DE LECTURE
--    C'est ici que se joue toute la confidentialité du social : je vois mes
--    activités et celles de mes amis ACCEPTÉS, jamais celles d'un inconnu.
--    Et les personnes que j'ai bloquées disparaissent du feed, comme pour
--    les commentaires (étape 8e).
-- ---------------------------------------------------------------------
alter table public.activity enable row level security;

create policy "activity: lire la mienne et celle de mes amis"
  on public.activity for select to authenticated
  using (
    (
      user_id = (select auth.uid())
      or exists (
        select 1 from public.friendship f
        where f.status = 'accepted'
          and ((f.requester_id = (select auth.uid()) and f.addressee_id = activity.user_id)
            or (f.requester_id = activity.user_id and f.addressee_id = (select auth.uid())))
      )
    )
    and not exists (
      select 1 from public.user_block b
      where b.blocker_id = (select auth.uid()) and b.blocked_id = activity.user_id
    )
  );

create policy "activity: supprimer la mienne"
  on public.activity for delete to authenticated
  using (user_id = (select auth.uid()));


-- ---------------------------------------------------------------------
-- 4. LES TRIGGERS
--    Tous en security definer : la table n'a aucune politique INSERT, donc
--    seule une fonction qui s'exécute avec les droits de son créateur peut
--    y écrire. C'est exactement ce qu'on veut.
-- ---------------------------------------------------------------------

-- 4a. Chapitres lus — UNE ligne par requête et par série
create or replace function public.log_chapters_read()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.activity (user_id, type, webtoon_id, chapter_number, chapter_count)
  select
    new_reads.user_id,
    'chapters_read',
    c.webtoon_id,
    max(c.number),            -- le plus avancé des chapitres cochés
    count(*)::integer         -- combien d'un coup
  from new_reads
  join public.chapter c on c.id = new_reads.chapter_id
  group by new_reads.user_id, c.webtoon_id;

  return null;  -- valeur ignorée pour un AFTER ... FOR EACH STATEMENT
end;
$$;

create trigger chapter_read_activity
  after insert on public.chapter_read
  referencing new table as new_reads
  for each statement execute function public.log_chapters_read();


-- 4b. Série commencée / terminée
--     On regarde le statut AVANT et APRÈS pour n'écrire qu'au changement :
--     sans ça, chaque passage sur la fiche pourrait reposter la même ligne.
create or replace function public.log_reading_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous text;
begin
  -- À l'insertion, OLD n'existe pas : on ne peut pas lire old.status
  previous := case when tg_op = 'INSERT' then null else old.status end;

  if new.status = 'completed' and previous is distinct from 'completed' then
    insert into public.activity (user_id, type, webtoon_id)
    values (new.user_id, 'series_completed', new.webtoon_id);

  elsif new.status = 'reading' and previous is distinct from 'reading' then
    insert into public.activity (user_id, type, webtoon_id)
    values (new.user_id, 'series_started', new.webtoon_id);
  end if;

  return null;
end;
$$;

create trigger reading_progress_activity
  after insert or update of status on public.reading_progress
  for each row execute function public.log_reading_status();


-- 4c. Chapitre noté
--     Uniquement sur UPDATE : dans l'app, la note n'est possible qu'après
--     avoir coché le chapitre, donc la ligne chapter_read existe déjà.
--     La clause "when" filtre avant même d'appeler la fonction.
create or replace function public.log_chapter_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.activity (user_id, type, webtoon_id, chapter_number, rating)
  select new.user_id, 'chapter_rated', c.webtoon_id, c.number, new.rating
  from public.chapter c
  where c.id = new.chapter_id;

  return null;
end;
$$;

create trigger chapter_read_rating_activity
  after update of rating on public.chapter_read
  for each row
  when (new.rating is not null and new.rating is distinct from old.rating)
  execute function public.log_chapter_rating();


-- ---------------------------------------------------------------------
-- 5. LE FEED
--    Une fonction plutôt qu'un select avec embeds : une seule requête, et
--    surtout aucun risque d'ambiguïté de jointure (le bug rencontré à
--    l'étape 8e avec profile depuis chapter_comment).
--
--    security invoker : c'est la politique de l'étape 3 qui décide ce qui est
--    visible. La fonction ne fait que mettre en forme.
--
--    Pagination par CURSEUR (p_before) et non par offset : le feed bouge en
--    permanence, un offset ferait réapparaître ou sauter des lignes.
-- ---------------------------------------------------------------------
create or replace function public.my_feed(
  p_limit  integer     default 20,
  p_before timestamptz default null
)
returns table (
  id             uuid,
  type           text,
  created_at     timestamptz,
  user_id        uuid,
  username       text,
  avatar_url     text,
  webtoon_id     uuid,
  webtoon_title  text,
  cover_url      text,
  anilist_id     integer,
  chapter_number numeric,
  chapter_count  integer,
  rating         smallint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    a.id, a.type::text, a.created_at,
    a.user_id, p.username::text, p.avatar_url::text,
    a.webtoon_id, w.title::text, w.cover_url::text, w.anilist_id,
    a.chapter_number, a.chapter_count, a.rating
  from public.activity a
  join public.profile p on p.id = a.user_id
  -- left join : une activité dont la série a été supprimée reste lisible
  left join public.webtoon w on w.id = a.webtoon_id
  where p_before is null or a.created_at < p_before
  order by a.created_at desc
  limit least(coalesce(p_limit, 20), 50);
$$;

revoke execute on function public.my_feed(integer, timestamptz) from public, anon;
grant  execute on function public.my_feed(integer, timestamptz) to authenticated;

commit;


-- =====================================================================
-- VÉRIFICATIONS
-- =====================================================================
-- 1. Les triggers sont en place → 3 lignes attendues
-- select tgname, tgrelid::regclass as sur_la_table
-- from pg_trigger
-- where tgname in ('chapter_read_activity', 'reading_progress_activity',
--                  'chapter_read_rating_activity');

-- 2. Après avoir coché quelques chapitres dans l'app, le SQL Editor voit tout
--    (il contourne la RLS) :
-- select p.username, a.type, w.title, a.chapter_number, a.chapter_count,
--        a.rating, a.created_at
-- from public.activity a
-- join public.profile p on p.id = a.user_id
-- left join public.webtoon w on w.id = a.webtoon_id
-- order by a.created_at desc
-- limit 20;

-- 3. Le test qui compte vraiment : cocher 50 chapitres d'un coup ne doit
--    créer qu'UNE ligne 'chapters_read' avec chapter_count = 50.
-- select type, chapter_count, count(*) from public.activity group by 1, 2;
