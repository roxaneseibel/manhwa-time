# Manhwa Time

> Application mobile de suivi de lecture de webtoons — « Ce que TV Time fait pour les séries, mais pour les manhwas. »

**Stack :** React Native (Expo SDK 54) · TypeScript · Supabase (PostgreSQL, Auth, RLS, Edge Functions) · APIs AniList / MangaUpdates / MangaBaka

---

## Le problème

Un lecteur de webtoons suit en moyenne une dizaine de séries en parallèle, publiées chapitre par chapitre sur des plateformes différentes (Webtoon, Tapas, Manta, Piccoma…), souvent au rythme d'un épisode par semaine. Résultat : on ne sait plus où on en est, on oublie les séries en pause, et il n'existe aucun endroit pour en parler **chapitre par chapitre** sans se faire spoiler la suite.

Les solutions existantes sont soit des bases de données froides (AniList, MyAnimeList — pensées pour l'anime et le manga papier, pas pour la sortie hebdomadaire), soit des sites de lecture pirate qui n'offrent aucun suivi. Manhwa Time comble ce vide : **un carnet de lecture social, dédié au format webtoon.**

---

## Le produit final

### 1. Trouver une série

Une recherche instantanée sur le catalogue mondial d'AniList (plus de 100 000 titres), avec :

- des résultats qui s'affichent au fil de la frappe (debounce + annulation des requêtes obsolètes) ;
- une **tolérance aux fautes de frappe** : AniList n'en a aucune, donc quand la recherche exacte ne renvoie rien, l'app rejoue la requête sur MangaBaka (moteur tolérant), récupère les identifiants AniList correspondants et affiche une bannière « Tu cherchais peut-être… » ;
- un filtre pour le contenu adulte, désactivé par défaut et activable dans le profil avec confirmation d'âge.

### 2. La fiche d'une série

Bannière, couverture, synopsis, genres traduits, titres alternatifs, année, pays d'origine — et surtout deux informations que les bases de données classiques donnent mal :

- **Le nombre réel de chapitres parus.** AniList laisse ce champ vide tant qu'une série est en cours. L'app croise donc trois sources (AniList, MangaBaka, MangaUpdates) et applique une règle de fiabilité : série terminée → on fait confiance à AniList ; série en cours → on prend le maximum des trois, et on masque la dernière sortie si son numéro semble incohérent (rééditions, découpage en saisons, données périmées).
- **Où la lire légalement.** Les liens officiels (Webtoon, Tapas, Manta…) remontés par AniList, les plateformes françaises en premier.

### 3. Suivre sa lecture, chapitre par chapitre

C'est le cœur de l'app, et ce qui la distingue d'une simple liste.

- Ajouter une série à sa liste avec un statut : **en cours / terminé / en pause / abandonné / à lire**.
- Une liste complète des chapitres, cochables un par un. Cocher le chapitre 42 propose de marquer les 41 précédents d'un coup.
- Un bouton **« ✓ Chapitre suivant »** directement dans « Ma liste » : un tap pour avancer, sans ouvrir la fiche.
- Le **retard** affiché pour chaque série (chapitres parus − chapitres lus), pour savoir d'un coup d'œil quoi rattraper.
- Les **relectures comptées** : relire un chapitre l'incrémente (×2, ×3…) au lieu de l'écraser.
- Sur la page d'un chapitre : une **note en 5 niveaux** (« Bof » → « Génial ») et une **émotion** parmi huit, pour garder la trace de ce qu'on a ressenti et pas seulement de ce qu'on a lu.

### 4. En parler sans se faire spoiler

Chaque chapitre a son propre fil de commentaires :

- les commentaires sont **floutés tant que le chapitre n'est pas lu** (avec une option « Afficher quand même ») ;
- il faut avoir lu le chapitre pour y écrire — la règle est appliquée côté base de données, pas seulement dans l'interface ;
- likes, réponses à un niveau, tri « récents » / « aimés » ;
- modération : signalement, blocage d'un utilisateur (ses commentaires disparaissent alors partout), masquage automatique d'un commentaire à partir de 3 signalements.

### 5. Le social (à venir)

- **Amis** et **feed d'activité** : voir ce que ses amis lisent, terminent, notent.
- **Profil public** avec statistiques de lecture : nombre de chapitres lus, temps de lecture estimé, genres favoris, séries terminées.
- **Notifications de nouveaux chapitres** pour les séries suivies.

### 6. Le catalogue, automatique

Aucune saisie manuelle : ajouter une série à sa liste déclenche son import complet depuis AniList (métadonnées, genres, identifiants croisés, liste des chapitres avec leurs dates de sortie). Une tâche planifiée rafraîchit ensuite les chapitres **uniquement des séries réellement suivies** par au moins un utilisateur — la base ne grossit que de ce qui sert. L'ajout manuel d'une série absente des catalogues est prévu plus tard, avec un statut `source = 'manual'` et ses propres règles de sécurité.

---

## Architecture

```
┌─────────────────────────────┐
│  App Expo (React Native)    │
│  expo-router, TypeScript    │
└──────┬───────────────┬──────┘
       │               │
       │ lecture seule │ lecture/écriture (clé anon + RLS)
       ▼               ▼
┌──────────────┐  ┌─────────────────────────────┐
│ APIs         │  │  Supabase                   │
│ publiques    │  │  ├─ PostgreSQL + RLS        │
│ ├─ AniList   │  │  ├─ Auth (email/mot de passe)│
│ ├─ MangaBaka │  │  ├─ Edge Functions (Deno)   │
│ └─MangaUpdates│  │  └─ Cron                    │
└──────────────┘  └──────────┬──────────────────┘
       ▲                     │ service_role
       └─────────────────────┘  (import & sync du catalogue)
```

**Principe directeur : le client n'écrit jamais dans le catalogue.**
L'app lit `webtoon`, `chapter`, `genre` mais ne peut pas les modifier — seules les Edge Functions, qui tournent côté serveur avec la clé `service_role`, y écrivent. Chaque utilisateur n'écrit que dans ses propres données (progression, lectures, commentaires), et la base le garantit par des politiques RLS, pas par du code applicatif.

### Modèle de données (PostgreSQL)

| Table                                                             | Rôle                                                                                          |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `profile`                                                         | pseudo, préférences (dont le filtre 18+), créé automatiquement par un trigger à l'inscription |
| `webtoon`, `genre`, `webtoon_genre`                               | le catalogue, importé depuis AniList                                                          |
| `chapter`                                                         | un chapitre = un numéro + une date de sortie                                                  |
| `reading_progress`                                                | une ligne par (utilisateur, série) : statut + chapitre courant                                |
| `chapter_read`                                                    | une ligne par (utilisateur, chapitre) : nombre de lectures, note, émotion, dates              |
| `chapter_comment`, `comment_like`, `comment_report`, `user_block` | la couche sociale des chapitres                                                               |
| `friendship`, `activity`                                          | réservées pour le social (Phase 3)                                                            |

Le travail sensible est fait **dans la base** plutôt que dans l'app :

- une fonction `mark_chapters_read(chapitre, inclure_les_précédents)` marque jusqu'à 250 chapitres en une requête (~87 ms mesurés) et fait passer la série de « à lire » à « en cours » au passage ;
- des triggers maintiennent `reading_progress.current_chapter` = plus grand chapitre lu, ainsi que les compteurs de likes, de réponses et de signalements ;
- les politiques RLS encodent les règles métier : « on ne peut commenter que ce qu'on a lu », « on ne voit pas les commentaires des gens qu'on a bloqués ».

---

## Problèmes intéressants rencontrés

**Aucune source ne connaît le nombre de chapitres d'un webtoon en cours.**
AniList laisse le champ vide tant que la série n'est pas finie. MangaDex, la source évidente, masque les chapitres sous licence officielle en anglais — vérifié en conditions réelles : 0 chapitre visible sur des titres qui en comptent des centaines. Il a fallu construire une chaîne : AniList → MangaBaka (table de correspondance entre identifiants) → MangaUpdates (`latest_chapter` + flux des sorties). Le scraping des sites pirates a été écarté délibérément : fragile, juridiquement risqué, et rédhibitoire pour une publication sur l'App Store.

**Les numéros de chapitres ne veulent pas dire la même chose partout.**
_Tower of God_ affiche 235 chapitres chez MangaUpdates (numérotés par saison) et 652 chez MangaBaka (numérotation continue). D'où la règle de fiabilité décrite plus haut, plutôt qu'une confiance aveugle en une source unique.

**Faire paraître l'app instantanée sur un réseau mobile.**
Cocher un chapitre met l'interface à jour immédiatement (optimistic update), puis la requête part avec un debounce de 600 ms et une file d'attente qui empêche deux écritures concurrentes de se doubler ; un tap rapide de dix chapitres ne produit pas dix allers-retours désordonnés. Toutes les requêtes externes passent par un `fetchWithTimeout` (10 s) pour qu'un appel qui ne répond pas ne fige jamais un écran.

**La sécurité testée, pas supposée.**
Chaque politique RLS a été vérifiée depuis une clé anonyme — 16 tests de règles sur la couche commentaires. Une leçon en a été tirée : ces tests ne reproduisaient pas la requête exacte de l'app, ce qui a masqué un bug de jointure ambiguë (trois chemins possibles entre `chapter_comment` et `profile`). Depuis, les requêtes réelles de l'app sont validées contre la vraie base avant d'être livrées.

---

## État d'avancement

|                     |                                                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| ✅ **Fondations**   | Navigation (onglets Accueil / Recherche / Ma liste / Profil), routes dynamiques                                               |
| ✅ **Compte**       | Auth Supabase, création automatique du profil, règles de pseudo avec vérification de disponibilité, RLS sur toutes les tables |
| ✅ **Catalogue**    | Recherche AniList + rattrapage des fautes de frappe, fiche série, où lire, nombre de chapitres multi-sources                  |
| ✅ **Ma liste**     | Statuts, filtres, retard, import automatique du catalogue via Edge Function                                                   |
| ✅ **Suivi**        | Lecture chapitre par chapitre, relectures, notes et émotions, page chapitre                                                   |
| ✅ **Commentaires** | Par chapitre : anti-spoiler, likes, réponses, signalement, blocage, masquage automatique                                      |
| 🚧 **En cours**     | Synchronisation planifiée des nouveaux chapitres, statistiques de profil                                                      |
| 📋 **Prévu**        | Amis et feed d'activité, notifications, ajout manuel de séries, refonte visuelle, publication sur les stores                  |

---

## Pourquoi ce projet

Je l'ai lancé pour apprendre la chaîne complète d'une application mobile — de la modélisation des données à la publication sur les stores — sur un sujet dont je me sers vraiment. Le choix a été fait, à chaque étape, de comprendre avant de copier : écrire le SQL à la main plutôt que de laisser un ORM le générer, tester chaque fonctionnalité sur un vrai téléphone avant de passer à la suivante, et traiter les questions de sécurité (RLS), de modération (contenu généré par les utilisateurs) et de droit (sources de données, conditions non commerciales, règles de l'App Store) comme faisant partie du développement, pas comme des détails à régler à la fin.
