-- =====================================================================
-- 05 — Suivi chapitre par chapitre
-- À exécuter UNE fois dans Supabase > SQL Editor (transaction : tout ou rien)
--
-- ⚠️ Les progressions de test existantes seront recalculées à partir des
--    chapitres cochés : elles repartiront donc de 0.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. CHAPTER : prête à recevoir un chapitre par ligne
-- ---------------------------------------------------------------------

-- numeric : accepte les chapitres "10.5" (la table est encore vide)
alter table public.chapter
  alter column number type numeric using number::numeric;

-- Un seul "chapitre 57" par webtoon (permet aussi l'upsert à l'import)
alter table public.chapter
  add constraint chapter_webtoon_number_key unique (webtoon_id, number);

-- Quand les chapitres de ce titre ont été synchronisés pour la dernière fois
alter table public.webtoon
  add column if not exists chapters_synced_at timestamptz;


-- ---------------------------------------------------------------------
-- 2. CHAPTER_READ : ce qu'UN utilisateur a fait d'UN chapitre
-- ---------------------------------------------------------------------
create table public.chapter_read (
  user_id       uuid        not null references public.profile(id) on delete cascade,
  chapter_id    uuid        not null references public.chapter(id)  on delete cascade,
  read_count    integer     not null default 1 check (read_count >= 1),   -- ×2, ×3...
  rating        smallint    check (rating between 1 and 5),               -- Bof → Génial
  emotion       text        check (emotion in (
                  'shocked', 'frustrated', 'sad', 'thoughtful',
                  'moved', 'amused', 'scared', 'bored'
                )),
  first_read_at timestamptz not null default now(),
  last_read_at  timestamptz not null default now(),

  -- Clé primaire composée : un utilisateur a AU PLUS une ligne par chapitre
  primary key (user_id, chapter_id)
);

-- RLS : chacun ne voit et ne modifie que ses propres lectures
-- (on ouvrira la lecture aux amis en Phase 3)
alter table public.chapter_read enable row level security;

create policy "chapter_read: lire ses lectures"
  on public.chapter_read for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "chapter_read: ajouter pour soi"
  on public.chapter_read for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "chapter_read: modifier ses lectures"
  on public.chapter_read for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "chapter_read: supprimer ses lectures"
  on public.chapter_read for delete to authenticated
  using ((select auth.uid()) = user_id);


-- ---------------------------------------------------------------------
-- 3. TRIGGERS : reading_progress.current_chapter se met à jour tout seul
--    = le plus grand numéro de chapitre lu par l'utilisateur pour ce titre.
--
--    Triggers "for each STATEMENT" avec "transition table" : quand on coche
--    300 chapitres en une requête, le recalcul a lieu UNE fois, pas 300.
-- ---------------------------------------------------------------------
create or replace function public.sync_current_chapter()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- "changed_rows" = les lignes insérées ou supprimées par la requête
  update public.reading_progress rp
  set current_chapter = coalesce((
        select max(c.number)
        from public.chapter_read cr
        join public.chapter c on c.id = cr.chapter_id
        where cr.user_id = rp.user_id
          and c.webtoon_id = rp.webtoon_id
      ), 0),
      updated_at = now()
  where (rp.user_id, rp.webtoon_id) in (
    select distinct cr.user_id, c.webtoon_id
    from changed_rows cr
    join public.chapter c on c.id = cr.chapter_id
  );

  return null; -- valeur ignorée pour un trigger AFTER ... FOR EACH STATEMENT
end;
$$;

create trigger chapter_read_after_insert
  after insert on public.chapter_read
  referencing new table as changed_rows
  for each statement execute function public.sync_current_chapter();

create trigger chapter_read_after_delete
  after delete on public.chapter_read
  referencing old table as changed_rows
  for each statement execute function public.sync_current_chapter();

-- Les progressions existantes sont recalculées (aucun chapitre coché → 0)
update public.reading_progress set current_chapter = 0;


-- ---------------------------------------------------------------------
-- 4. FONCTIONS appelées par l'app (supabase.rpc)
--    "security invoker" (par défaut) : elles s'exécutent avec les droits
--    de l'utilisateur, donc la RLS s'applique à tout ce qu'elles écrivent.
-- ---------------------------------------------------------------------

-- Cocher un chapitre (et, si demandé, tous les précédents non lus)
-- Renvoie le nombre de chapitres nouvellement marqués comme lus.
create or replace function public.mark_chapters_read(
  p_chapter_id uuid,
  p_include_previous boolean default false
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_user_id    uuid := auth.uid();
  v_webtoon_id uuid;
  v_number     numeric;
  v_count      integer;
begin
  if v_user_id is null then
    raise exception 'Utilisateur non connecté';
  end if;

  select webtoon_id, number into v_webtoon_id, v_number
  from public.chapter
  where id = p_chapter_id;

  if v_webtoon_id is null then
    raise exception 'Chapitre introuvable';
  end if;

  -- Cocher un chapitre ajoute le titre à la liste s'il n'y est pas,
  -- et le passe de "À lire" à "En cours"
  insert into public.reading_progress (user_id, webtoon_id, status)
  values (v_user_id, v_webtoon_id, 'reading')
  on conflict (user_id, webtoon_id) do update
    set status = 'reading'
    where public.reading_progress.status = 'plan_to_read';

  -- UNE seule requête, quel que soit le nombre de chapitres
  insert into public.chapter_read (user_id, chapter_id)
  select v_user_id, c.id
  from public.chapter c
  where c.webtoon_id = v_webtoon_id
    and (c.id = p_chapter_id or (p_include_previous and c.number < v_number))
  on conflict (user_id, chapter_id) do nothing; -- déjà lus : on n'y touche pas

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Relire un chapitre déjà lu : ×2, ×3...
-- (une fonction plutôt qu'un update depuis l'app : "+1" est fait par la base,
--  donc deux appuis simultanés ne peuvent pas s'écraser)
create or replace function public.reread_chapter(p_chapter_id uuid)
returns integer
language sql
set search_path = ''
as $$
  update public.chapter_read
  set read_count = read_count + 1,
      last_read_at = now()
  where user_id = auth.uid()
    and chapter_id = p_chapter_id
  returning read_count;
$$;

-- Seuls les utilisateurs connectés peuvent appeler ces fonctions
revoke execute on function public.mark_chapters_read(uuid, boolean) from public, anon;
revoke execute on function public.reread_chapter(uuid) from public, anon;
grant execute on function public.mark_chapters_read(uuid, boolean) to authenticated;
grant execute on function public.reread_chapter(uuid) to authenticated;

commit;
