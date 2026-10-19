# Win95 lib : règles de travail pour Claude

**Avant toute modification, lire [LLM-GUIDE.md](LLM-GUIDE.md)** : architecture réelle, contrats, recettes (ajouter une application, un store, un droit), pièges déjà rencontrés, méthode de test et liste de contrôle.

## Interface : charte graphique obligatoire

**Toute interface créée ou modifiée (fenêtre, dialogue, panneau, composant, CSS) doit respecter [charte-graphique.md](charte-graphique.md).** Lire ce fichier avant d'écrire
du HTML ou du CSS, réutiliser les composants de sa liste (§4) plutôt que d'en inventer, et passer sa liste de contrôle (§6) avant de livrer.
Points à ne jamais oublier : texte noir sur gris ou blanc (**jamais de texte blanc sur fond gris**), `color` toujours explicite (le bureau hérite du blanc), biseaux Windows 95,
pas d'angle arrondi, police 12 px, textes en français, boîtes de dialogue via `Win95Dialog`.

## Architecture

HTML + CSS + JavaScript vanille, sans framework ni build (voir [README.md](README.md)). **Une page n'inclut que `scripts/loader.js`** : la liste ordonnée des scripts vit dans `MODULES` (loader.js) et la version est `LIB_VERSION`
(= `package.json`). Tout chemin `assets/...` écrit dans du JS passe par `window.Win95Asset(...)`. Tout est local par défaut ; Supabase, Google Drive et Vercel se branchent par configuration (fournisseurs dans `scripts/storage/`).
La bibliothèque est la **dépendance de plusieurs projets** (le projet Mecha en premier) : ce qui est propre à un projet va dans son plugin (API d'extension de `Win95WindowManager`), jamais ici. Voir [INTEGRATION.md](INTEGRATION.md).

Comptes : `Win95Accounts` (fournisseur local ou Supabase ; écritures asynchrones) + `Win95Security` (droits par application, `canOpenApp`) ; toute nouvelle application restreignable est déclarée par `registerApp` (ou `windowDefinitions`),
une application réservée aux admins dans `Win95Security.ADMIN_ONLY_APPS`. Les données locales d'un compte sont clés par son **id** (jamais son nom) : voir `Win95Utils.getCurrentUserId`.

## Règles de travail

- `npm test` doit être vert avant de rendre un travail ; une nouvelle fonctionnalité ou un bug corrigé = un test.
- **Ne jamais exécuter `git commit`, `git push`, `git tag`, ni créer de branche** : le propriétaire commit lui-même, en son nom.
- Changer un contrat (API d'extension, configuration, fournisseur, clé de stockage, ordre de chargement) = mettre à jour `CHANGELOG.md` et la version.
