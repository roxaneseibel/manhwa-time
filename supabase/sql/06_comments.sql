-- =====================================================================
-- 06 — Commentaires de chapitres : likes, réponses, signalements, blocage
-- À exécuter UNE fois dans Supabase > SQL Editor (transaction : tout ou rien)
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. LES TABLES
-- ---------------------------------------------------------------------

create table public.chapter_comment (
  id           uuid        primary key default gen_random_uuid(),
  chapter_id   uuid        not null references public.chapter(id) on delete cascade,
  -- Rempli AUTOMATIQUEMENT par la base avec l'utilisateur connecté :
  -- l'app n'envoie jamais user_id, impossible de commenter "au nom" de quelqu'un
  user_id      uuid        not null default auth.uid() references public.profile(id) on delete cascade,
  parent_id    uuid        references public.chapter_comment(id) on delete cascade, -- null = commentaire, sinon réponse
  content      text        not null check (char_length(btrim(content)) between 1 and 2000),

  -- Compteurs tenus à jour par des triggers (jamais modifiables depuis l'app)
  like_count   integer     not null default 0,
  reply_count  integer     not null default 0,
  report_count integer     not null default 0,
  is_hidden    boolean     not null default false, -- masqué suite aux signalements

  created_at   timestamptz not null default now()
);

-- Index : ce qu'on demande le plus souvent = les commentaires d'un chapitre
create index chapter_comment_recent_idx  on public.chapter_comment (chapter_id, created_at desc) where parent_id is null;
create index chapter_comment_popular_idx on public.chapter_comment (chapter_id, like_count desc) where parent_id is null;
create index chapter_comment_replies_idx on public.chapter_comment (parent_id, created_at);

create table public.comment_like (
  user_id    uuid        not null default auth.uid() references public.profile(id) on delete cascade,
  comment_id uuid        not null references public.chapter_comment(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, comment_id) -- un seul like par personne
);
create index comment_like_comment_idx on public.comment_like (comment_id);

create table public.comment_report (
  id          uuid        primary key default gen_random_uuid(),
  comment_id  uuid        not null references public.chapter_comment(id) on delete cascade,
  reporter_id uuid        not null default auth.uid() references public.profile(id) on delete cascade,
  reason      text        not null check (reason in ('spoiler', 'spam', 'harassment', 'hate', 'sexual', 'other')),
  created_at  timestamptz not null default now(),
  unique (comment_id, reporter_id) -- on ne signale qu'une fois le même commentaire
);

create table public.user_block (
  blocker_id uuid        not null default auth.uid() references public.profile(id) on delete cascade,
  blocked_id uuid        not null references public.profile(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id) -- on ne peut pas se bloquer soi-même
);


-- ---------------------------------------------------------------------
-- 2. LES DROITS PAR COLONNE
--    La RLS dit QUELLES LIGNES on peut toucher. Les "grants" disent
--    QUELLES COLONNES. Ici l'app ne peut écrire que le strict nécessaire :
--    impossible d'envoyer like_count = 9999 ou is_hidden = false.
-- ---------------------------------------------------------------------
revoke all on public.chapter_comment, public.comment_like, public.comment_report, public.user_block
  from anon, authenticated;

grant select, delete                        on public.chapter_comment to authenticated;
grant insert (chapter_id, parent_id, content) on public.chapter_comment to authenticated;

grant select, delete        on public.comment_like to authenticated;
grant insert (comment_id)   on public.comment_like to authenticated;

grant select                        on public.comment_report to authenticated;
grant insert (comment_id, reason)   on public.comment_report to authenticated;

grant select, delete        on public.user_block to authenticated;
grant insert (blocked_id)   on public.user_block to authenticated;


-- ---------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------
alter table public.chapter_comment enable row level security;
alter table public.comment_like    enable row level security;
alter table public.comment_report  enable row level security;
alter table public.user_block      enable row level security;

-- Lire : les commentaires visibles (ou les miens, même masqués),
-- SAUF ceux des personnes que j'ai bloquées
create policy "chapter_comment: lire"
  on public.chapter_comment for select to authenticated
  using (
    (is_hidden = false or user_id = (select auth.uid()))
    and not exists (
      select 1 from public.user_block b
      where b.blocker_id = (select auth.uid()) and b.blocked_id = chapter_comment.user_id
    )
  );

-- Écrire : en son nom, et seulement sur un chapitre qu'on a lu (anti-spoiler)
create policy "chapter_comment: écrire sur un chapitre lu"
  on public.chapter_comment for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.chapter_read r
      where r.user_id = (select auth.uid()) and r.chapter_id = chapter_comment.chapter_id
    )
  );

create policy "chapter_comment: supprimer les siens"
  on public.chapter_comment for delete to authenticated
  using (user_id = (select auth.uid()));

-- Likes : je vois, ajoute et retire uniquement les miens
create policy "comment_like: lire les siens" on public.comment_like for select to authenticated
  using (user_id = (select auth.uid()));
create policy "comment_like: aimer" on public.comment_like for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "comment_like: ne plus aimer" on public.comment_like for delete to authenticated
  using (user_id = (select auth.uid()));

-- Signalements : je vois les miens ; je ne peux pas signaler mon propre commentaire
create policy "comment_report: lire les siens" on public.comment_report for select to authenticated
  using (reporter_id = (select auth.uid()));
create policy "comment_report: signaler" on public.comment_report for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and not exists (
      select 1 from public.chapter_comment c
      where c.id = comment_report.comment_id and c.user_id = (select auth.uid())
    )
  );

-- Blocages : les miens uniquement
create policy "user_block: lire les siens" on public.user_block for select to authenticated
  using (blocker_id = (select auth.uid()));
create policy "user_block: bloquer" on public.user_block for insert to authenticated
  with check (blocker_id = (select auth.uid()));
create policy "user_block: débloquer" on public.user_block for delete to authenticated
  using (blocker_id = (select auth.uid()));


-- ---------------------------------------------------------------------
-- 4. TRIGGERS
-- ---------------------------------------------------------------------

-- a. Une réponse doit viser un commentaire (pas une réponse) du même chapitre
create or replace function public.check_comment_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent_chapter uuid;
  v_parent_parent  uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  select chapter_id, parent_id into v_parent_chapter, v_parent_parent
  from public.chapter_comment
  where id = new.parent_id;

  if v_parent_chapter is null then
    raise exception 'Commentaire introuvable';
  elsif v_parent_parent is not null then
    raise exception 'On ne peut pas répondre à une réponse';
  elsif v_parent_chapter <> new.chapter_id then
    raise exception 'Ce commentaire appartient à un autre chapitre';
  end if;

  return new;
end;
$$;

create trigger chapter_comment_check_parent
  before insert on public.chapter_comment
  for each row execute function public.check_comment_parent();

-- b. Compteurs. "security definer" : l'utilisateur n'a pas le droit de modifier
--    ces colonnes (voir les grants), c'est donc la base qui le fait pour lui.
create or replace function public.update_comment_counters()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delta     integer; -- +1 pour un ajout, -1 pour une suppression
  v_target_id uuid;    -- le commentaire dont on met le compteur à jour
begin
  -- NEW n'existe que pour un INSERT, OLD que pour un DELETE :
  -- on ne lit que celui qui existe, dans des branches séparées
  if tg_op = 'INSERT' then
    v_delta := 1;
  else
    v_delta := -1;
  end if;

  if tg_table_name = 'comment_like' then
    if tg_op = 'INSERT' then
      v_target_id := new.comment_id;
    else
      v_target_id := old.comment_id;
    end if;

    update public.chapter_comment
    set like_count = like_count + v_delta
    where id = v_target_id;

  elsif tg_table_name = 'chapter_comment' then
    -- une RÉPONSE ajoutée ou supprimée → compteur du commentaire parent
    -- (pour un commentaire de premier niveau, parent_id est null : rien à faire)
    if tg_op = 'INSERT' then
      v_target_id := new.parent_id;
    else
      v_target_id := old.parent_id;
    end if;

    if v_target_id is not null then
      update public.chapter_comment
      set reply_count = reply_count + v_delta
      where id = v_target_id;
    end if;

  elsif tg_table_name = 'comment_report' then
    -- 3 signalements → masqué pour tout le monde en attendant la modération
    update public.chapter_comment
    set report_count = report_count + 1,
        is_hidden = is_hidden or report_count + 1 >= 3
    where id = new.comment_id;
  end if;

  return null;
end;
$$;

create trigger comment_like_counter
  after insert or delete on public.comment_like
  for each row execute function public.update_comment_counters();

create trigger chapter_comment_reply_counter
  after insert or delete on public.chapter_comment
  for each row execute function public.update_comment_counters();

create trigger comment_report_counter
  after insert on public.comment_report
  for each row execute function public.update_comment_counters();

-- Ces fonctions ne doivent être appelées que par leurs triggers
revoke execute on function public.update_comment_counters() from public, anon, authenticated;

commit;
