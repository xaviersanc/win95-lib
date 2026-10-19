# Utiliser la bibliothèque Win95 dans un projet

La bibliothèque est faite pour être **la dépendance** de plusieurs projets : le projet n'en copie pas le code, il la charge et la configure. Une amélioration faite ici (nouvelle application, correction) profite à tous les projets
qui montent de version. Ce guide s'adresse à qui démarre un projet ou en migre un (ex. Mecha).

## 1. Installer

| Méthode | Quand | Commande |
|---|---|---|
| **Sous-module git** (recommandé) | le projet est un dépôt git ; mise à jour = avancer un pointeur | `git submodule add https://github.com/xaviersanc/win95-lib vendor/win95-lib` |
| Instantané copié | essayer avant publication, ou sous-modules impossibles | `node <lib>/tools/export.mjs --target vendor/win95-lib --clean` |

Mise à jour d'un sous-module : `cd vendor/win95-lib && git fetch && git checkout <tag> && cd ../.. && git add vendor/win95-lib` puis commit dans le projet (le projet décide de la version qu'il utilise).
Vercel : activer « Include source files from Git submodules » (Project > Settings > Git) ; pour un dépôt privé, ajouter une clé de déploiement.

## 2. Démarrer un projet

```bash
node vendor/win95-lib/tools/init-project.mjs --dir . --name "Mon projet" --supabase-url https://xxxx.supabase.co
```

Génère `index.html`, `win95-config.js`, `vercel.json` (CSP), `api/` (Google Drive), `.env.example`, `supabase/*.sql` ; n'écrase rien sans `--force`. La page ne contient que :

```html
<script src="win95-config.js"></script>                       <!-- window.Win95Config = {...} (un FICHIER : la CSP interdit le script en ligne) -->
<script src="vendor/win95-lib/scripts/loader.js"></script>    <!-- charge tout, dans l'ordre contractuel -->
```

Sans aucune configuration, la page marche seule dans le navigateur (stockage local, petits quotas, comptes locaux). Le premier démarrage demande de créer l'administrateur.

## 3. Configurer (`window.Win95Config`)

Référence commentée : `scripts/services/win95-config.js`.

| Clé | Défaut | Rôle |
|---|---|---|
| `appName` | `"Windows 95"` | nom de l'application (dossier Google Drive : `<nom> - Mes documents`) |
| `storage.provider` | `"local"` | `"local"` \| `"supabase"` \| `"supabase+drive"` (voir `vercel/README.md`) |
| `storage.local` / `.supabase` / `.drive` | quotas | `quotaMb`, `maxFileMb`, noms de table/bucket, `apiBase` |
| `accounts.provider` | `"local"` | `"local"` \| `"supabase"` |
| `supabase` | vide | `{ url, anonKey }` (clé **publique** anon) |
| `exclude` | `[]` | modules (`"games"`, `"accessories"`, `"boot"`…) ou fichiers (`"accounts-store.js"`) à ne pas charger |
| `plugins` | `[]` | scripts / styles du projet (voir §4) |
| `bootScreen`, `bootstrap`, `userTray`, `dbName`, `libPath`, `cacheBust` | | écran de démarrage, Bootstrap (false si la page le charge), compte dans la zone de notification, préfixe IndexedDB, dossier de la bibliothèque, suffixe de cache |

## 4. Personnaliser : plugins et API d'extension

Un plugin est un script du projet, chargé après la bibliothèque (ou **avant un module** précis avec `before: "<module>"`). Il s'appuie sur `window.Win95WindowManager` :

```js
const manager = window.Win95WindowManager;
manager.registerApp({
    key: "inventaire", label: "Inventaire", icon: "assets/icons/inventaire.png",     // icône du PROJET (chemin relatif à la page)
    tool: { width: "420px", height: "320px", attach: (element) => monComposant.attach(element) },
    startMenu: { path: ["Programmes", "Mon projet"] }, desktopIcon: true
});
manager.registerRecycleBinProvider({ canMove, moveToBin, canRestore, restore });
manager.registerShortcutOpener("inventaire", (cible) => ({ message: "ouvert" }));
window.Win95FileExplorer.registerContextMenuContributor((entry, explorer) => [{ label: "Mon action", onSelect: () => {} }]);
```

Référence de toutes les méthodes : `LLM-GUIDE.md` §11. Les icônes **de la bibliothèque** sont déjà résolues (`Win95Asset`) ; les icônes du projet s'écrivent comme dans n'importe quelle page du projet.

## 5. Stockage, comptes, déploiement

`vercel/README.md` détaille Supabase (3 scripts SQL), Vercel (CSP, variables) et Google Drive (OAuth une fois). Résumé des fournisseurs et de leurs limites : `LLM-GUIDE.md` §10. Points à retenir :

- **local** : aucune installation ; données dans ce navigateur seulement (quota par défaut 50 Mo) ;
- **Supabase** : mêmes comptes et documents sur tous les appareils ; modèle « entre proches » (connexion vérifiée côté client, clé anon publique) — pas pour des données sensibles ;
- **Drive** : contenu volumineux dans le Drive du propriétaire, via des fonctions Vercel (le jeton Google ne quitte jamais le serveur).

## 6. Versions et compatibilité

Versionnement sémantique (`package.json`, `LIB_VERSION` dans `loader.js`, `CHANGELOG.md`). **Contrat** : l'API d'extension, la configuration, les fournisseurs, les clés de stockage, les événements `win95:*` et l'ordre de chargement ;
`npm test` le vérifie (dont un projet consommateur de test). Une version **majeure** est requise pour tout changement incompatible ; les projets épinglent la version qu'ils utilisent (tag du sous-module).

## 7. Cas d'étude : le projet Mecha

Mecha (jeu de rôle) utilisait ses propres copies du bureau. Il est branché sur la bibliothèque **sans toucher à sa page actuelle** : `index-lib.html` + `scripts/mecha-plugin/` (`mecha-config.js`, `mecha-plugin.js`, `mecha-early.js`, `mecha-plugin.css`).

- **Reste dans Mecha** : Supabase (comptes + personnages, tables `utilisateurs`/`personnages`), connexion, stockage Supabase + Drive (Mes documents, Documents partagés, « Envoyer à »), Poste de travail, BDD Union, Messagerie, Paramètres, dés, jauges, roue des branches.
- **Vient de la bibliothèque** : bureau, fenêtres, menu Démarrer, Corbeille, explorateur, Bloc-notes, Paint, lecteurs, Panneau de configuration, accessoires, jeux, menus contextuels.
- **Branchement** : `exclude` de `boot`, `storage`, `user-manager`, `security`, `accounts-store.js`, `user-files-store.js` ; ses services chargés `before: "media-player"` (ils doivent exister avant l'explorateur et le gestionnaire de fenêtres) ; ses composants `before: "window-manager"` ;
  `mecha-plugin.js` enregistre ses applications, sa Corbeille (éléments du Poste de travail), le personnage actif de la zone de notification, « Envoyer à » et les raccourcis BDD Union.
- **Bascule** : (1) tester `index-lib.html` avec les vrais comptes Supabase ; (2) remplacer `vendor/win95-lib/` (instantané) par le sous-module (`git rm -r vendor/win95-lib` puis `git submodule add …`) après avoir poussé la bibliothèque ;
  (3) faire pointer `vercel.json`/le domaine sur `index-lib.html` (ou le renommer en `index.html`) ; (4) supprimer de Mecha les copies devenues inutiles (`scripts/window-manager`, `file-explorer`, `notepad`, `paint`, `image-viewer`, `media-player`, `window-component`,
  `services/win95-*.js`, `recycle-bin-store`, `document-shortcuts-store`, `wallpaper-store`, `tray-clock`, `zoom-guard`).
