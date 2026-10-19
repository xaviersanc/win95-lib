# Win95 lib

Un faux Windows 95 dans le navigateur : bureau, barre des tâches, menu Démarrer, fenêtres déplaçables, et ses outils.
HTML + CSS + JavaScript vanille, **sans framework, sans build** : ouvrir `index.html` via n'importe quel serveur statique suffit. Seule, elle tourne entièrement dans le navigateur (petits quotas) ;
**par configuration**, elle se branche sur **Supabase** (comptes, documents), **Google Drive** (contenu volumineux) et **Vercel** (hébergement, fonctions). Elle est conçue pour être **la dépendance de plusieurs projets**.

```
python -m http.server 8000     # puis http://localhost:8000
npm install && npm test        # tests (navigateur piloté, Supabase et Drive simulés)
```

> Servir les fichiers en HTTP (et non en `file://`) : IndexedDB et les adresses `blob:` y sont plus fiables.

| Pour… | Lire |
|---|---|
| utiliser la bibliothèque dans un projet (sous-module, plugins, configuration) | [INTEGRATION.md](INTEGRATION.md) |
| déployer sur Vercel avec Supabase et Google Drive | [vercel/README.md](vercel/README.md) |
| modifier ou étendre la bibliothèque (agents, contributeurs) | [LLM-GUIDE.md](LLM-GUIDE.md), [charte-graphique.md](charte-graphique.md) |
| connaître l'historique et les contrats | [CHANGELOG.md](CHANGELOG.md) |

## Ce que contient la bibliothèque

| Outil | Dossier | Rôle |
|---|---|---|
| Bureau + barre des tâches + menu Démarrer | `scripts/window-manager/` | Icônes déplaçables sur grille, raccourcis (glisser depuis un explorateur), fenêtres multiples, écran d'arrêt. |
| Fenêtres | `scripts/window-component/` | Déplacement, redimensionnement, agrandissement. |
| Explorateur (Mes documents, Corbeille) | `scripts/file-explorer/` | Dossiers, import, glisser-déposer, renommage, Corbeille, raccourcis, vues mosaïque / détails. |
| Bloc-notes / WordPad | `scripts/notepad/` | Édition de `.txt` / `.md`, texte brut ou mis en forme. |
| Accessoires | `scripts/accessories/` | **Calculatrice** (standard et scientifique, mémoire, clavier), **Horloge** (analogique ou numérique, suit Date/Heure), **Table des caractères** (blocs Unicode, copie). |
| Connexion locale | `scripts/local-link/` | Icône du bureau : QR code temporaire (5 min) qui ouvre sur le téléphone une page de liaison Windows 95, vide pour le moment, que les projets remplissent (`Win95LocalLink.registerPhonePage`). Aucune donnée n'est encore échangée. Détails : `INTEGRATION.md` §4 bis. |
| Jeux | `scripts/games/` | **Démineur** (3 niveaux + personnalisé, marques, accord, meilleurs temps), **Solitaire** (Klondike, tirage par 1 ou 3, annuler, score, cascade de victoire), **FreeCell** (donnes numérotées de Microsoft, ex. n° 1, suites limitées par les cellules libres, annuler), **Cœurs** (contre 3 joueurs automatiques, passage de cartes, dame de pique, « tout prendre »). |
| Paint | `scripts/paint/` | Dessin, enregistrement en `.paint` dans Mes documents. |
| Lecteur d'image | `scripts/image-viewer/` | Parcourt les images d'un dossier. |
| Lecteur multimédia | `scripts/media-player/` | Lecteur audio (playlist du dossier). |
| Panneau de configuration | `scripts/control-panel/` | Date/Heure, Souris, Sons, Système, Ajout/Suppression de programmes, et Affichage (6 fonds d'écran, `scripts/display-properties/`). Voir ci-dessous. |
| Comptes et session | `scripts/security/`, `scripts/services/accounts-store.js` | Écran d'ouverture de session, premier démarrage (création de l'administrateur), droits par application. |
| Gestion des utilisateurs (admin) | `scripts/user-manager/` | Créer, modifier, supprimer des comptes, changer leur mot de passe, choisir leurs applications. |

## Clic droit et menus

Le menu contextuel **du navigateur est bloqué** sur toute la page (`context-guard.js`) : le clic droit appartient à la simulation. Seules les zones de saisie (champs, Bloc-notes) gardent le menu du navigateur, nécessaire pour Copier / Coller.
Menus de la simulation : bureau (Aligner les icônes, Actualiser, Propriétés), icônes (Ouvrir, Supprimer pour un raccourci), horloge (Ajuster la date/l'heure), barre des tâches (Cascade, Réduire toutes les fenêtres), barre de titre et boutons de la barre des tâches (Restaurer, Réduire, Agrandir, Fermer), explorateur (déjà existants).
Le menu Démarrer a des sous-menus : Programmes > Accessoires > Jeux, Multimédia ; Paramètres > Panneau de configuration.

## Ambiance

| Élément | Comportement |
|---|---|
| **Écran de démarrage** | À chaque chargement de la page : texte de démarrage puis écran « Windows 95 » sur fond de nuages avec barre de progression (≈ 3,7 s ; un clic ou une touche l'abrège). Désactivable : `?noboot` dans l'adresse ou `window.Win95Config = { bootScreen: false }`. Un rechargement est un redémarrage. |
| **Sons système** | Son de démarrage à l'ouverture de session, de sortie à l'arrêt, bip, erreur (arrêt critique), clic de menu (Démarrer, menus contextuels, boutons des dialogues), exclamation/question/astérisque selon l'icône des dialogues, Corbeille vidée… Tous réglables dans Panneau de configuration > Sons. |
| **Écrans de veille** | Panneau de configuration > Affichage > Écran de veille : (Aucun), Écran noir, **Champ d'étoiles**, **Texte défilant** (texte réglable), **Tuyaux 3D**, avec délai (1 à 60 min), aperçu plein écran et aperçu en miniature. Option « Protégé par mot de passe » : au réveil, le mot de passe du compte est demandé. Un mouvement, un clic ou une touche réveille. |
| **Ctrl+Alt+Suppr** | Ouvre « Fermer le programme » (liste : Explorer, Systray et les fenêtres ouvertes ; *Fin de tâche*, *Arrêter*, *Annuler*). Une **deuxième** pression redémarre l'ordinateur (la page se recharge : les informations non enregistrées sont perdues, comme à l'origine). Ctrl+Alt+Fin fait la même chose (la plupart des systèmes d'exploitation ne transmettent pas Ctrl+Alt+Suppr au navigateur). |
| **Écran bleu** | « Fin de tâche » sur **Explorer** (après confirmation) affiche l'écran bleu ; une touche l'ignore, Ctrl+Alt+Suppr redémarre. Programmable : `Win95BlueScreen.show({ code, module, fatal })`. Option `window.Win95Config = { blueScreenOnError: true }` : toute erreur JavaScript non interceptée y mène (désactivée par défaut). |

## Panneau de configuration

Démarrer > Panneau de configuration ouvre une fenêtre d'icônes ; un double-clic ouvre l'applet. Les réglages sont **réels**, pas décoratifs :

| Applet | Effet | Stockage |
|---|---|---|
| Date/Heure | Calendrier, horloge analogique, heure numérique, fuseau horaire (20 fuseaux, heure d'été automatique). Change l'horloge de la barre des tâches (`Win95Clock`). | `localStorage["win95.clock.v1"]` (machine) |
| Souris | Vitesse du double-clic (le double-clic natif est remplacé par un double-clic recomposé, valable pour toute la lib) avec zone de test ; forme du pointeur (standard, grand, croix). | `win95.mouse.v1.<id>` |
| Sons | Sons associés aux événements Windows (démarrage, bip, ouverture/fermeture de programme, Corbeille…), schémas, volume, aperçu. Les sons sont **synthétisés** (Web Audio), aucun fichier. | `win95.sounds.v1.<id>` |
| Système | Version simulée de Windows 95 et informations réelles du navigateur : cœurs, mémoire, écran, carte graphique, stockage, réseau ; gestionnaire de périphériques repliable ; performances. | — |
| Ajout/Suppression de programmes | « Supprimer » un programme (Bloc-notes, Paint, Lecteur d'image, Lecteur multimédia) le **cache** pour le compte : il disparaît du menu et ne peut plus être ouvert, même depuis un fichier ; « Installer » le fait réapparaître. Rien n'est effacé. | `win95.programs.hidden.v1.<id>` |
| Affichage | Onglet Arrière-plan (fond d'écran du Bureau) et onglet Écran de veille. | `win95.wallpaper.<id>`, `win95.screensaver.v1.<id>` |

Un compte qui n'a pas accès au Panneau de configuration n'a accès à aucun applet (droit commun, voir `APP_PARENTS` dans `security-manager.js`).

## Utilisateurs (postes)

Chaque compte a son propre « poste » : documents, bureau, raccourcis, Corbeille et fond d'écran sont séparés.

- **Premier démarrage** : aucun compte n'existe, un écran demande de créer l'administrateur.
- **Ouverture de session** : nom + mot de passe. La session survit au rechargement de la page, pas à la fermeture de l'onglet. Démarrer > Arrêter > « Fermer la session » revient à l'écran de connexion.
- **Administrateur** : seul à voir Démarrer > Utilisateurs. Il crée des comptes, les renomme, change leur rôle (Utilisateur / Administrateur) et leur mot de passe, choisit les applications autorisées (les autres sont masquées et refusées, y compris à l'ouverture d'un fichier), et les supprime (leurs données locales sont effacées). Il reste toujours au moins un administrateur.
- **Limite assumée** : tout est côté client (mots de passe hachés en SHA-256 avec sel, dans `localStorage`). Cela sépare des postes sur un même navigateur ; cela ne protège pas contre quelqu'un qui ouvre la console du navigateur. Le hachage demande HTTPS ou `localhost`.

## Stockage et services distants

Par défaut **tout est local** (aucune requête réseau) :

- **Mes documents** (fichiers, dossiers, Corbeille) : IndexedDB, une base par compte `win95-files-<id>` ; **petits quotas** : 50 Mo par compte, 10 Mo par fichier ;
- comptes : `localStorage` (`win95.accounts.v1`) ; disposition du bureau, raccourcis, réglages : `localStorage`, clés suffixées par l'id du compte.

Le stockage et les comptes sont des **fournisseurs interchangeables** (`window.Win95Config`, voir [INTEGRATION.md](INTEGRATION.md)) :

| Réglage | Effet | Prérequis |
|---|---|---|
| `storage.provider: "local"` (défaut) | documents dans le navigateur | aucun |
| `"supabase"` | arborescence dans la table `user_files`, contenu dans le bucket Storage | `supabase/02-user-files.sql`, `supabase: { url, anonKey }` |
| `"supabase+drive"` | contenu dans le Google Drive du propriétaire (1 Go par compte), via `vercel/api/` | + `supabase/03-drive-storage.sql`, fonctions Vercel, variables Google |
| `accounts.provider: "supabase"` | mêmes comptes sur tous les appareils (table `win95_accounts`) | `supabase/01-accounts.sql` |

Si Supabase est demandé sans configuration, la bibliothèque retombe sur le stockage local (message dans l'explorateur) ; si Drive ne répond pas, le contenu va dans le bucket Supabase.
Ces fournisseurs sont **testés avec un faux Supabase et des fonctions Drive simulées** : à valider avec de vrais comptes avant la production. Modèle de sécurité : « entre proches » (connexion vérifiée côté client, clé anon publique) — voir `vercel/README.md`.

`node tools/init-project.mjs --dir <projet>` prépare un projet complet (page, configuration, `vercel.json` avec CSP, fonctions Google Drive, scripts SQL).

## Développement local

`npm start` lance `tools/dev-server.mjs` : serveur sans dépendance, joignable sur le réseau local ; il affiche l'adresse du poste (ex. `http://192.168.1.20:8000/`) avec un QR code, et ouvre le navigateur du PC sur `localhost` (les comptes exigent localhost ou HTTPS : ne pas travailler sur l'adresse réseau). « Connexion locale » reprend toute seule l'adresse réseau dans son QR code pour un téléphone du même Wi-Fi. `--no-open`, `--port`, `--dir <dossier>` (pour servir un projet).

## Configuration

`window.Win95Config`, défini dans un fichier chargé **avant** `scripts/loader.js` (référence commentée : `scripts/services/win95-config.js`) : `appName`, `storage`, `accounts`, `supabase`, `exclude`, `plugins`, `userTray`, `bootstrap`, `bootScreen`, `dbName`.

## Chargement

Une page n'inclut que `scripts/loader.js`, qui charge dans l'ordre contractuel les feuilles de style puis les scripts (liste unique : `MODULES` dans `loader.js`), puis les plugins du projet. Il ajoute supabase-js (CDN, `integrity`) seulement si Supabase est configuré.
Registre global : `window.Win95Services` (`register(nom, instance)`, `get(nom)`).

## Services partagés (à réutiliser plutôt que recopier)

- `Win95Utils` : chemins, identifiants, type et icône de fichier, `formatBytes`, stockage JSON local.
- `Win95Accounts` : comptes, fournisseur local ou Supabase (`ready`, `list`, `get` synchrones ; `create`, `update`, `setPassword`, `remove`, `verify` asynchrones). Émet `win95:accounts-changed`.
- `Win95Storage` : fournisseurs de stockage des documents (`getBackend`, `register`) ; `Win95Supabase.getClient()` ; `Win95DriveContent`.
- `Win95Security` : session (`getCurrentUser`, `isAdmin`, `canOpenApp`, `logout`). Émet `win95:auth-changed` et `win95:auth-logout`.
- `Win95UserFiles` : Mes documents (`load`, `buildTree`, `uploadFiles`, `createFolder`, `createTextFile`, `saveTextContent`, `rename`, `trash`, `restore`, `emptyTrash`, `openFile`). Émet `win95:user-files-changed`.
- `Win95RecycleBin` : Corbeille des raccourcis. Émet `win95:recycle-bin-changed`.
- `Win95DocumentShortcuts` : raccourcis rangés dans Mes documents. Émet `win95:document-shortcuts-changed`.
- `Win95Wallpaper` : fond d'écran. Émet `win95:wallpaper-changed`.
- `Win95Clock` : date/heure simulées et fuseau (`nowMs`, `getParts`, `setDateTime`, `setTimeZone`). Émet `win95:clock-changed`.
- `Win95Sounds` : `play(événement)` (appelé par le gestionnaire de fenêtres, les dialogues, la session, la Corbeille), `preview`, `save`. Émet `win95:sounds-changed`.
- `Win95Mouse` : vitesse du double-clic et pointeur. Émet `win95:mouse-changed`.
- `Win95Programs` : programmes supprimés/installés (`isHidden`, `remove`, `install`). Émet `win95:programs-changed`.
- `Win95ScreenSaver` : écran de veille (`getState`, `save`, `start`, `stop`, `isActive`, `createPreview`). Émet `win95:screensaver-changed`.
- `Win95BlueScreen` : écran bleu (`show`, `close`). `Win95CloseProgram` : boîte Ctrl+Alt+Suppr (`open`, `close`). `Win95Boot` : écran de démarrage (`skip`).
- `Win95PropertySheet` : feuille de propriétés à onglets (OK / Annuler / Appliquer) pour les applets.
- `Win95Dialog` : boîtes de dialogue Win95 (`confirm`, `alert`, `prompt`, `form`) sous forme de promesses.
- `Win95ContextMenu` : menu clic droit (`open(x, y, items)`), sous-menus compris.
- `Win95RichText` : rendu markdown et éditeur façon WordPad.
- `Win95DragDrop` : types MIME communs des glisser-déposer.

Événements custom : `win95:window-closing` (annulable) et `win95:window-closed` sont émis sur une fenêtre ; les composants y retirent leurs écouteurs globaux.

## Ajouter une application

(Pour une application propre à un projet qui utilise la bibliothèque : `registerApp` depuis son plugin, voir [INTEGRATION.md](INTEGRATION.md).)

1. Ajouter sa définition dans `windowDefinitions` et un `case` dans `createWindow` (`window-manager.js`).
2. Créer `scripts/<app>/<app>-component.js` exposant `window.Win95<App>.attach(element)` et son CSS (voir [charte-graphique.md](charte-graphique.md)).
3. Déclarer le module dans `MODULES` de `scripts/loader.js` (avant `window-manager`) et ajouter l'entrée du menu Démarrer (arbre `START_MENU` de `window-manager.js`).

## Origine

Extraite du projet Mecha (dont elle devient la dépendance : voir INTEGRATION.md, §7) : le bureau Windows 95 et ses outils, sans la partie jeu de rôle (messagerie, BDD Union, dés, fiches de pilote), qui reste dans le projet sous forme de plugin.
Licence MIT (voir [LICENSE](LICENSE)). La base de style vient de [win95.css](https://github.com/AlexBSoft/win95.css) (MIT).
