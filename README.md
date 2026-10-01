# Manhwa Time

**Application mobile de suivi de lecture de webtoons — « ce que TV Time fait pour les séries, mais pour les manhwas ».**

Suivre une dizaine de webtoons publiés au chapitre, chaque semaine, sur quatre plateformes différentes : on ne sait plus où on en est, on oublie les séries en pause, et il n'existe nulle part où en parler **chapitre par chapitre** sans se faire spoiler la suite. Manhwa Time est un carnet de lecture social dédié à ce format.

[![Expo SDK 54](https://img.shields.io/badge/Expo-SDK%2054-000020?logo=expo&logoColor=white)](https://expo.dev)
[![React Native 0.81](https://img.shields.io/badge/React%20Native-0.81-61DAFB?logo=react&logoColor=black)](https://reactnative.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL%20%7C%20Auth%20%7C%20Edge%20Functions-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)

> 📖 **[Lire la présentation complète du projet →](context.md)** — le produit visé, les choix d'architecture et les problèmes résolus en détail.

<!-- TODO : ajouter ici 3 ou 4 captures d'écran (recherche, fiche, liste des chapitres, commentaires).
     Les mettre dans un dossier docs/screenshots/ — attention, Photo/ est volontairement gitignoré. -->

---

## Fonctionnalités

**Trouver**
- Recherche instantanée dans le catalogue AniList, au fil de la frappe
- Tolérance aux fautes de frappe : si AniList ne renvoie rien, la recherche est rejouée sur MangaBaka et propose « Tu cherchais peut-être… »
- Filtre de contenu adulte, désactivé par défaut

**Consulter**
- Fiche série : bannière, synopsis, genres traduits, titres alternatifs
- **Nombre réel de chapitres parus**, croisé entre AniList, MangaBaka et MangaUpdates (aucune source seule n'est fiable sur une série en cours)
- Liens de lecture officiels, plateformes françaises en premier

**Suivre**
- Statuts : en cours / terminé / en pause / abandonné / à lire
- Suivi **chapitre par chapitre**, avec marquage en masse des précédents
- Bouton « ✓ Chapitre suivant » directement dans la liste
- Retard affiché par série (chapitres parus − chapitres lus)
- Relectures comptées (×2, ×3…)
- Note en 5 niveaux et émotion parmi 8, par chapitre

**Échanger**
- Un fil de commentaires par chapitre, **flouté tant que le chapitre n'est pas lu**
- Impossible de commenter un chapitre non lu — règle appliquée par la base de données, pas par l'interface
- Likes, réponses à un niveau, tri récents / aimés
- Modération : signalement, blocage d'utilisateur, masquage automatique à 3 signalements

**À venir** — amis et feed d'activité, statistiques de profil, notifications de nouveaux chapitres, ajout manuel de séries.

---

## Architecture

```
┌──────────────────────────────┐
│  App Expo (React Native)     │
│  expo-router · TypeScript    │
└──────┬────────────────┬──────┘
       │ lecture seule  │ lecture / écriture (clé publishable + RLS)
       ▼                ▼
┌──────────────┐  ┌──────────────────────────────┐
│ APIs         │  │  Supabase                    │
│ ├─ AniList   │  │  ├─ PostgreSQL + RLS         │
│ ├─ MangaBaka │  │  ├─ Auth                     │
│ └─MangaUpdates│  │  ├─ Edge Functions (Deno)    │
└──────────────┘  │  └─ Cron                     │
       ▲          └──────────┬───────────────────┘
       └─────────────────────┘ service_role (import du catalogue)
```

**Principe directeur : le client n'écrit jamais dans le catalogue.** L'app lit `webtoon`, `chapter` et `genre` mais ne peut pas les modifier — seules les Edge Functions y écrivent, côté serveur. Chaque utilisateur n'écrit que ses propres données, et c'est PostgreSQL qui le garantit via la RLS, pas le code de l'app.

La logique sensible vit dans la base : une fonction `mark_chapters_read()` marque jusqu'à 250 chapitres en une requête (~87 ms) et met à jour le statut de lecture au passage ; des triggers maintiennent le chapitre courant et les compteurs de likes, réponses et signalements.

### Organisation du code

| Dossier | Contenu |
|---|---|
| `app/` | Écrans et routes ([expo-router](https://docs.expo.dev/router/introduction/), routage par fichiers) |
| `components/` | Composants d'interface réutilisables |
| `hooks/` | Logique d'écran réutilisable (recherche, liste de chapitres, commentaires…) |
| `lib/` | Clients d'API, accès aux données, utilitaires |
| `providers/` | Contextes React : session et profil |
| `types/` | Types TypeScript partagés |
| `supabase/sql/` | Migrations SQL, **à exécuter dans l'ordre** |
| `supabase/functions/` | Edge Functions (Deno) |

---

## Installation

**Prérequis :** Node.js 20+, un compte [Supabase](https://supabase.com) (offre gratuite suffisante) et l'application **Expo Go** sur un téléphone.

```bash
git clone git@github.com:roxaneseibel/manhwa-time.git
cd manhwa-time
npm install
```

**1. Créer le projet Supabase** et exécuter les migrations dans le SQL Editor, **dans l'ordre des numéros** :

```
supabase/sql/01_rls_policies.sql
supabase/sql/02_profile_trigger.sql
supabase/sql/03_username_rules.sql
supabase/sql/04_catalog_and_progress.sql
supabase/sql/05_chapter_tracking.sql
supabase/sql/06_comments.sql
```

`moderation.sql` n'est pas une migration : c'est un recueil de requêtes de modération à lancer à la main, à ne pas exécuter en entier.

**2. Brancher l'app sur le projet** en remplaçant l'URL et la clé *publishable* dans [`lib/supabase.ts`](lib/supabase.ts) par celles de ton projet (Settings → API). Ces valeurs sont publiques par nature — elles partent dans le bundle de l'application — et c'est la RLS qui protège les données. La clé `service_role`, elle, ne doit **jamais** se retrouver dans ce dépôt.

**3. Déployer l'Edge Function** d'import du catalogue :

```bash
npx supabase login
npx supabase link --project-ref <ton-project-ref>
npx supabase functions deploy import-webtoon --use-api
```

**4. Lancer l'app :**

```bash
npx expo start
```

Puis scanner le QR code avec Expo Go. En cas de comportement étrange après une mise à jour, vider le cache Metro : `npx expo start -c`.

---

## Sources de données et crédits

Ce projet n'héberge ni ne diffuse aucun contenu sous droit d'auteur : il ne manipule que des métadonnées publiques et renvoie vers les plateformes de lecture officielles.

| Source | Usage | Conditions |
|---|---|---|
| [AniList](https://anilist.co) | Catalogue, métadonnées, liens officiels | API publique |
| [MangaUpdates](https://www.mangaupdates.com) | Dernier chapitre paru, dates de sortie | Crédit requis, affiché dans l'app |
| [MangaBaka](https://mangabaka.org) | Correspondance entre identifiants, recherche tolérante | CC BY-NC-SA — usage non commercial, crédit affiché dans l'app |

**Aucune monétisation n'est prévue**, ce qui rend l'usage de ces sources conforme à leurs conditions non commerciales. Le scraping de sites de lecture pirate a été volontairement écarté : fragile, juridiquement risqué et incompatible avec une publication sur les stores.

---

## Licence

Aucune licence n'est attachée à ce dépôt pour l'instant : le code est donc « tous droits réservés ». Il est public pour être lu et commenté, pas réutilisé tel quel. Pour toute autre question d'usage, ouvre une issue.

---

*Projet personnel développé par [Roxane Seibel](https://github.com/roxaneseibel) pour maîtriser la chaîne complète d'une application mobile, de la modélisation des données à la publication.*
