-- =====================================================================
-- MODÉRATION — requêtes à lancer à la main dans Supabase > SQL Editor
-- (le SQL Editor contourne la RLS : tu y vois TOUT, y compris les masqués)
-- Ce fichier n'est pas une migration : ne l'exécute pas en entier.
-- =====================================================================


-- 1. File d'attente : les commentaires signalés, les masqués en premier
select
  c.id,
  c.is_hidden                         as masque,
  c.report_count                      as signalements,
  (select string_agg(r.reason, ', ')
   from comment_report r
   where r.comment_id = c.id)         as raisons,
  p.username                          as auteur,
  c.content                           as contenu,
  c.created_at
from chapter_comment c
join profile p on p.id = c.user_id
where c.report_count > 0
order by c.is_hidden desc, c.report_count desc, c.created_at desc;


-- 2. RÉTABLIR un commentaire signalé à tort
--    (on efface aussi ses signalements, sinon un seul nouveau le re-masquerait)
begin;
  delete from comment_report where comment_id = 'ID_DU_COMMENTAIRE';
  update chapter_comment
  set is_hidden = false, report_count = 0
  where id = 'ID_DU_COMMENTAIRE';
commit;


-- 3. SUPPRIMER définitivement un commentaire (et ses réponses)
delete from chapter_comment where id = 'ID_DU_COMMENTAIRE';


-- 4. Les auteurs les plus signalés (pour repérer un compte problématique)
select p.username, count(*) as commentaires_signales, sum(c.report_count) as total_signalements
from chapter_comment c
join profile p on p.id = c.user_id
where c.report_count > 0
group by p.username
order by total_signalements desc;
