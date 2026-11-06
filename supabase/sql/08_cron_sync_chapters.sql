-- =====================================================================
-- 08 — Synchronisation automatique des nouveaux chapitres
-- À exécuter dans Supabase > SQL Editor
--
-- Deux morceaux :
--   1. webtoons_to_sync() : la base décide QUELLES séries rafraîchir
--   2. une tâche planifiée qui appelle l'Edge Function sync-chapters
--
-- ⚠️ TROIS CHOSES À REMPLACER AVANT DE LANCER (cherche "À REMPLACER") :
--      - <TON-PROJECT-REF>  (Supabase > Settings > General > Reference ID)
--      - <TON-SECRET>       (voir l'étape 3 ci-dessous)
--    Et l'Edge Function doit être déployée AVANT de créer la tâche.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LA FILE D'ATTENTE
--
--    Pourquoi une fonction SQL plutôt qu'une requête dans l'Edge Function ?
--    Parce que « les séries suivies par au moins un utilisateur » demande un
--    "exists" sur reading_progress, pénible à écrire via l'API REST. Et c'est
--    une règle métier : sa place est dans la base.
--
--    security definer : la fonction lit reading_progress, qui est protégée par
--    la RLS. Elle s'exécute donc avec les droits de son créateur. En échange,
--    on retire le droit de l'appeler à tout le monde (voir les "revoke").
-- ---------------------------------------------------------------------
create or replace function public.webtoons_to_sync(p_limit integer default 12)
returns table (id uuid)
language sql
security definer
set search_path = ''
stable
as $$
  select w.id
  from public.webtoon w
  where
    -- suivie par au moins une personne : on ne rafraîchit jamais le catalogue
    -- entier, seulement ce qui sert réellement à quelqu'un
    exists (
      select 1 from public.reading_progress rp
      where rp.webtoon_id = w.id
    )
    -- une série finie ou annulée n'aura plus de nouveau chapitre
    -- ("is distinct from" gère aussi le cas status = null)
    and w.status is distinct from 'completed'
    and w.status is distinct from 'cancelled'
    -- déjà vue il y a moins de 20 h → on la laisse tranquille.
    -- 20 et non 24 : sinon, avec un passage toutes les 6 h, une série ratée
    -- de peu attendrait un tour complet de plus.
    and (w.chapters_synced_at is null
         or w.chapters_synced_at < now() - interval '20 hours')
  -- les plus anciennes d'abord, les jamais-synchronisées en tête.
  -- C'est ce "order by" + l'écriture de chapters_synced_at par la fonction
  -- qui forment la file d'attente : chaque passage prend la suite.
  order by w.chapters_synced_at asc nulls first
  limit greatest(1, least(p_limit, 40));
$$;

-- Postgres accorde l'exécution d'une fonction à TOUT LE MONDE par défaut.
-- Sur une fonction security definer qui contourne la RLS, c'est exactement
-- ce qu'il ne faut pas : seul le service_role (donc l'Edge Function) la garde.
revoke execute on function public.webtoons_to_sync(integer) from public;
revoke execute on function public.webtoons_to_sync(integer) from anon, authenticated;
grant  execute on function public.webtoons_to_sync(integer) to service_role;


-- ---------------------------------------------------------------------
-- 2. LES EXTENSIONS
--    pg_cron : le planificateur (le "cron" de Postgres)
--    pg_net  : permet à la base de faire des appels HTTP sortants
--    (Équivalent de les activer dans Database > Extensions.)
-- ---------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;


-- ---------------------------------------------------------------------
-- 3. LE SECRET
--    L'Edge Function est déployée avec verify_jwt = false (le planificateur
--    n'a pas de compte utilisateur) : sans protection, n'importe qui pourrait
--    déclencher la synchronisation. Elle exige donc un en-tête x-sync-secret.
--
--    a) Génère une valeur au hasard, dans un terminal :
--         node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
--
--    b) Donne-la à l'Edge Function (depuis le dossier du projet) :
--         npx supabase secrets set SYNC_SECRET=<TON-SECRET>
--
--    c) Range la même valeur dans le Vault, pour que la tâche planifiée
--       puisse la lire sans qu'elle apparaisse en clair dans cron.job :
-- ---------------------------------------------------------------------
select vault.create_secret('<TON-SECRET>', 'sync_secret');  -- ← À REMPLACER

-- Les noms de secrets sont uniques : si tu relances cette ligne, elle échoue.
-- Pour changer la valeur plus tard :
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'sync_secret'),
--     '<NOUVEAU-SECRET>'
--   );


-- ---------------------------------------------------------------------
-- 4. LA TÂCHE PLANIFIÉE
--    Toutes les 6 heures. 12 séries par passage (valeur par défaut de la
--    fonction) = jusqu'à 48 séries rafraîchies par jour.
--
--    Pourquoi pas une fois par jour ? Parce qu'un passage ne traite qu'une
--    poignée de séries : plus de passages = plus de séries couvertes, sans
--    jamais marteler les APIs externes.
-- ---------------------------------------------------------------------
select cron.unschedule('sync-chapters')
where exists (select 1 from cron.job where jobname = 'sync-chapters');

select cron.schedule(
  'sync-chapters',
  '0 */6 * * *',           -- à 00:00, 06:00, 12:00 et 18:00 (UTC)
  $$
  select net.http_post(
    url := 'https://<TON-PROJECT-REF>.supabase.co/functions/v1/sync-chapters',  -- ← À REMPLACER
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (
        select decrypted_secret from vault.decrypted_secrets where name = 'sync_secret'
      )
    ),
    body := '{}'::jsonb,
    -- la fonction prend son temps (pauses entre les séries) : il ne faut pas
    -- que pg_net abandonne avant elle
    timeout_milliseconds := 120000
  );
  $$
);


-- =====================================================================
-- VÉRIFICATIONS
-- =====================================================================

-- La tâche est bien enregistrée et active ?
-- select jobname, schedule, active from cron.job;

-- Les derniers passages (status 'succeeded' = l'appel HTTP est parti,
-- pas que la synchronisation a réussi — ça se lit dans les logs de la fonction)
-- select jobname, status, return_message, start_time
-- from cron.job_run_details
-- order by start_time desc
-- limit 10;

-- Les réponses HTTP reçues par pg_net (le JSON renvoyé par la fonction)
-- select id, status_code, content
-- from net._http_response
-- order by created desc
-- limit 10;

-- Qu'est-ce qui attend dans la file, maintenant ?
-- (à lancer dans le SQL Editor, qui a les droits service_role)
-- select w.title, w.total_chapters, w.chapters_synced_at
-- from public.webtoons_to_sync(40) q
-- join public.webtoon w on w.id = q.id;

-- Combien de chapitres par série suivie, pour voir l'effet de la synchro ?
-- select w.title, w.status, w.total_chapters, count(c.id) as lignes_chapitre
-- from public.webtoon w
-- left join public.chapter c on c.webtoon_id = w.id
-- where exists (select 1 from public.reading_progress rp where rp.webtoon_id = w.id)
-- group by w.id, w.title, w.status, w.total_chapters
-- order by w.title;


-- =====================================================================
-- POUR ARRÊTER OU MODIFIER
-- =====================================================================
-- Mettre en pause :  select cron.unschedule('sync-chapters');
-- Changer le rythme : relancer le cron.schedule ci-dessus avec une autre
--                     expression (ex. '0 */3 * * *' = toutes les 3 heures).
--