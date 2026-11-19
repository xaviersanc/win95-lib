# Historique des versions

Versionnement sémantique : une version **majeure** pour tout changement incompatible de l'API d'extension, de la configuration, des fournisseurs, des clés de stockage, des événements `win95:*` ou de l'ordre de chargement.

## 1.6.0 — Confort d'affichage : échelle de l'interface, plein écran, appui tactile, petits écrans

Version mineure : rien d'existant ne change de comportement tant que les nouvelles options de `Win95Config.ui` ne sont pas activées (échelle à 100 % = rendu identique à la 1.5.0). Ajouts de configuration, d'une clé de stockage, d'événements et de deux fichiers dans le module `services` ; une feuille de style (`scripts/window-manager/ui-scale.css`) s'ajoute au module `window-manager`. Né du projet portfolio : ces mécanismes sont génériques (Mecha en profite aussi), ils vivent donc ici et non dans un projet.

**Ajouts**
- **Échelle de l'interface** (`Win95UiScale`, `scripts/services/ui-scale.js`) : 100 % = aspect d'origine, 125 % ou 150 % = le même bureau en plus grand (barre des tâches, menu Démarrer, barres de titre, boutons, menus, boîtes de dialogue, icônes du bureau, textes des applications). `get / set / cycle / scales / format`, événement `win95:ui-scale-changed` (`detail: { scale, percent }`). Mécanisme : la variable CSS `--win95-k` (sur `<html>`) et l'attribut `data-win95-scale` (sur `<body>`) ; tous les `font-size` en pixels de la bibliothèque deviennent \`calc(Npx * var(--win95-k, 1))\`, les dimensions de l'interface sont dans \`ui-scale.css\`. **Un zoom CSS global est impossible** : le gestionnaire de fenêtres calcule ses positions avec des pixels réels (constaté : fenêtre agrandie trop large, glisser-déposer décalé). Les accessoires et jeux à taille fixe (calculatrice, démineur, cartes, Paint…) ne suivent pas l'échelle.
  - Configuration : `ui.scale` (échelle initiale, 1 par défaut), `ui.scales` (échelles proposées, `[1, 1.25, 1.5]`).
  - Stockage : `localStorage["win95.uiScale.v1"]` — réglage de la **machine**, commun à tous les comptes (seconde exception à la règle « clé par compte », avec l'horloge) : il doit marcher sans compte.
  - Interface : onglet **Échelle** des Propriétés d'affichage (boutons radio, « Appliquer ») ; bouton de la zone de notification avec `ui.trayButtons`.
  - Gestionnaire de fenêtres : `desktopGridBase` (grille des icônes à 100 %) × échelle = `desktopGrid` ; `applyUiScale()` recale les icônes déjà placées ; les bornes de déplacement des icônes suivent la grille. Variables CSS réglables par un projet : `--win95-icon-size` (taille des icônes du bureau, 32 px × échelle par défaut), `--win95-title-h`, `--win95-chrome-h`, `--win95-taskbar-h`.
- **Plein écran** (`Win95Fullscreen`, `scripts/services/fullscreen.js`) : `isSupported / isActive / enter / exit / toggle` (promesses `{ ok, message }`), événement `win95:fullscreen-changed`. Entrée **Plein écran** dans Paramètres du menu Démarrer (application `fullscreen` de `kind: "command"` : aucune fenêtre), bouton de la zone de notification avec `ui.trayButtons`, et `ui.fullscreenOnFirstGesture` : demandé au premier clic ou à la première touche, **une seule fois** (un navigateur interdit le plein écran sans geste ; si le visiteur en sort avec Échap, on ne le lui impose pas de nouveau). Rien n'est affiché si le navigateur ne le permet pas (iPhone).
- **`ui.tapToOpen`** : sur écran tactile (`(pointer: coarse)`), un simple appui sur une icône du bureau l'ouvre, au lieu du double-clic (désactivé par défaut).
- **`ui.maximizeBelow`** : sous cette largeur d'écran (px), les fenêtres redimensionnables s'ouvrent agrandies (les accessoires à taille fixe et les feuilles de propriétés ne le sont jamais). `toggleMaximize(fenêtre, { silent })`.
- **API d'extension** : `registerApp({ kind: "command" })` déclare une entrée sans fenêtre (`create` renvoie `null`), ignorée par le test « toutes les applications s'ouvrent ».
- Tests : échelle (variable, hauteurs de barre des tâches et de titre, fenêtre agrandie, corps de fenêtre, mémorisation, événement, rechargement), bouton et onglet du Panneau, grille des icônes, plein écran (faux navigateur : un seul appel au premier geste, bouton, menu, absence de prise en charge), appui tactile (activé et désactivé), petits écrans.

**Correction**
- La feuille de base (`assets/win95.css`) contenait une règle globale `header { height: 100vh; background: black; … }` (reste d'un gabarit à vidéo) qui s'appliquait à **tout** élément `<header>` de la page, y compris ceux des projets. Elle est supprimée.

## 1.5.0 — Lecteur multimédia : barre des tâches, YouTube, playlists, diffusion

Version mineure : rien d'existant ne change de contrat. Ajouts de clés de stockage et d'événements consommés, et de sources dans la CSP.

**Ajouts**
- **Mini-lecteur dans la barre des tâches**, à gauche du compte : titre de la piste (il défile en boucle s'il est trop long), précédent, lecture/pause, suivant.
- **La fenêtre peut se fermer sans couper la musique** : tant qu'il y a des pistes, le lecteur continue en arrière-plan, la fenêtre disparaît de la barre des tâches et le mini-lecteur reste (bouton « Arrêter et fermer le lecteur » ; clic sur le titre = rouvrir la fenêtre, qui reprend le même lecteur). Une vidéo YouTube refait un bref saut à la fermeture et à la réouverture (le cadre est recréé à la même position). Fin de session (déconnexion, changement de compte) = fin des lecteurs en arrière-plan.
- **Fichier > Ouvrir un lien YouTube… (Ctrl+L)** : vidéo ou titre de youtube.com, music.youtube.com, youtu.be (/shorts, /embed), ou **playlist** (`/playlist?list=…`, ou une vidéo d'une playlist au choix) limitée à **100 titres**. Lecture par le lecteur officiel (API IFrame, cadre créé avec `referrerpolicy` : sans Referer YouTube répond « erreur 153 »), cadre vidéo visible dans la fenêtre. Titres récupérés par oEmbed. Les publicités éventuelles restent celles de YouTube : la bibliothèque ne les retire pas.
- **Diffusion synchronisée par l'administrateur** (Supabase configuré) : Fichier > « Diffuser à tous les utilisateurs » envoie l'état du lecteur (pistes YouTube, piste courante, lecture/pause, position) sur un canal Supabase Realtime *broadcast* `win95-media-sync` (aucune table, aucun SQL), renvoyé toutes les 4 s pour recaler la position et faire rejoindre les utilisateurs qui arrivent en cours de route. Un bouton **Diffuser** (icône d'ondes, dans le lecteur et dans le mini-lecteur de la barre des tâches) la lance ou l'arrête en un clic. Elle est **imposée** : chaque utilisateur la reçoit même sans fenêtre ouverte (le mini-lecteur s'ouvre en arrière-plan, sans bouton de fermeture) ; il peut seulement régler le volume ou mettre en pause, et reste en pause jusqu'au prochain changement de l'administrateur. Les fichiers locaux ne se diffusent pas. Modèle « entre proches » : un message n'est pas authentifié, seul son format est vérifié.
- API : `Win95MediaPlayer.parseYouTubeId`, `parseYouTubePlaylistId`, `receiveBroadcast`, `shutdown`.
- CSP (`vercel/vercel.json`) : `script-src https://www.youtube.com`, `frame-src https://www.youtube.com https://www.youtube-nocookie.com`, `connect-src https://www.youtube.com` (oEmbed). Un projet avec sa propre CSP doit les ajouter.

## 1.4.1 — Double-clic et glisser-déposer de l'explorateur

Version corrective : aucun contrat ne change.

**Corrections**
- **Double-clic : un élément s'ouvrait deux fois** (explorateur, Panneau de configuration, Fin de tâche, gestionnaire d'utilisateurs). Chrome envoie le `dblclick` natif au nœud du 2ᵉ clic ; la liste étant redessinée à chaque clic, ce nœud est détaché et le blocage de `Win95Mouse` (sur `window`) ne le voit pas. Ces écouteurs ignorent désormais les `dblclick` natifs (`event.isTrusted`) : seul l'événement recomposé compte. À reproduire dans tout composant qui redessine sa liste au clic.
- **Glisser un élément vers un autre explorateur** : un élément de l'explorateur embarquant son icône comme « fichier », celle-ci était importée à sa place. Un glisser interne (`MIME.explorerEntry`) n'importe plus de fichiers ; un explorateur inscriptible (partagé compris) l'accepte et le confie aux `registerDropHandler` du projet.

## 1.4.0 — Vue graphique (graphe de relations) centralisée

Version mineure : un module `graph` s'ajoute à `MODULES` (avant `control-panel`) ; rien d'existant ne change de contrat. Un projet qui n'en veut pas ajoute `"graph"` à `Win95Config.exclude`.

**Ajouts**
- **`Win95GraphView`** (`scripts/graph/graph-view.js`, `graph-view.css`) : graphe animé façon Obsidian, repris du projet Mecha et généralisé. Nœuds ronds ou carrés (`shape`), classe `is-<kind>` pour le style du projet, flèches colorées par `colorOf(valeur)` avec badge de texte libre (`label`), vue locale en anneaux ou vue générale, mise en clair par degré, zoom/déplacement/glisser de nœuds, recentrage, `setMessage`, `recolor`. `create(container, { onSelect, colorOf, values, ariaLabel })`, `setData({ nodes, edges, selected, radial, refit })`, `setOptions`.
- **`Win95GraphOptions`** (`scripts/graph/graph-options.js`) : panneau d'options flottant (Filtres, Groupes de couleur, Affichage, Forces, Graphe local), réglages gardés par compte (`<storageKey>.<id>`). Ce qui est propre au projet se déclare : `search`, `filters: [{ key, label, default }]`, `groups: { placeholder, note, actions: [{ label, build }] }`, `local`. `matchSearch(texte)` et `matchGroup(texte)` servent au projet pour filtrer et colorer.
- Classes CSS `gv-*` (documentées dans `charte-graphique.md` §4). Test : nœuds, flèches, badges, clic, mise à jour, options persistantes.

**Migration (projet Mecha)** : `Win95RelationsGraph` et `Win95RelationsOptions` disparaissent au profit de ces deux composants ; les nœuds portent `kind`/`shape` au lieu de `type`, les flèches `value`/`label` au lieu de `valeur`, et les classes `rl-*` du graphe deviennent `gv-*`.

## 1.3.0 — Cadre de réglages (Panneau de configuration extensible)

Version mineure : rien d'existant ne change de contrat. Nouveaux événements `win95:window-manager-ready`, `win95:control-panel-applets-changed` et `win95:settings-changed`.

**Ajouts**
- **`Win95Settings`** (`scripts/services/win95-settings.js`) : réglages **déclaratifs par compte** (`define(ns, { fields, apply })` → `get / getAll / save / reset / onChange`). Types `checkbox`, `slider`, `number`, `select`, `radio`, `text` ; validation et valeurs par défaut automatiques ; stockage `win95.settings.<ns>.v1.<id>` (purgé avec le compte) ; `apply(values)` rejoué à chaque enregistrement et à l'ouverture de session.
- **`Win95PropertyFields`** (`scripts/control-panel/property-fields.js`) : génère l'interface Windows 95 des champs (`checkbox`, `slider`, `number`, `text`, `select`, `radio`, `group`, `header`, `note`, `button`, `custom`) avec `enabledIf`, `visibleIf`, `hint`, `format`.
- **`Win95ControlPanel.registerApplet({ key, label, icon, tabs, apply })`** : un nouvel applet (icône, fenêtre, droits hérités du Panneau, réglages stockés) en une déclaration, avant ou après le démarrage du bureau. `registerApplet({ …, attach })` pour une interface libre.
- **`Win95ControlPanel.addTab(applet, onglet)`** / **`Win95PropertySheet.registerTab`** : ajoute un onglet de réglages à un applet existant (Souris, Sons, Date/Heure, Système, Affichage, Ajout/Suppression) sans modifier son code. `Win95PropertySheet.mount` accepte `id` et des onglets déclaratifs (`fields`), agrège « Appliquer » ; `sheet.pending(store)`.
- **`tools/maj-lib.bat`** : met un projet enfant à jour (sous-module `vendor/win95-lib` : fetch, checkout de `origin/main` ou d'une version donnée, affichage `ancienne -> nouvelle version`, commit local du pointeur). `init-project.mjs` le copie à la racine des nouveaux projets.
- Tests : réglages (validation, clé par compte, effet, désabonnement), applet déclaratif (champs, `enabledIf`, `visibleIf`, Appliquer, droits), onglet ajouté à Souris, géométrie du Panneau.

**Corrections**
- Panneau de configuration : la liste d'icônes occupe toute la hauteur et la barre d'état, de hauteur minimale, reste collée en bas de la fenêtre (elle flottait au milieu au-dessus d'un grand vide gris). Barre d'état et boutons des feuilles de propriétés resserrés.

## 1.2.0 — Connexion locale (téléphone)

Version mineure : rien d'existant ne change de comportement ; un projet qui n'en veut pas ajoute `"local-link"` à `Win95Config.exclude`.

**Ajouts**
- **Application « Connexion locale »** (icône du bureau, Programmes > Accessoires, supprimable dans Ajout/Suppression de programmes, droits par compte) : crée une **session temporaire** (jeton aléatoire de 20 caractères, 5 minutes) et l'affiche en **QR code** avec compte à rebours, adresse copiable et « Nouveau code ».
- **Page du téléphone** : l'adresse du QR code (`?win95link=<jeton>&exp=<échéance>`) ouvre la même page en **mode téléphone** : le chargeur ne charge que `core` + `local-link` (pas de démarrage, de comptes ni de bureau) et affiche une fenêtre Windows 95 plein écran **vide**, à remplir par le projet.
- **Services** `Win95QR` (générateur de QR code sans dépendance : octets UTF-8, correction M, versions 1 à 10, 213 octets) et `Win95LocalLink` (`createSession`, `getSession`, `closeSession`, `registerPhonePage`, événements `win95:local-link-changed` et `win95:local-link-phone-ready`).
- **Chargeur** : module `local-link` ; **mode téléphone** ; option de plugin `phone: true` (seuls ces plugins se chargent en mode téléphone).
- **Configuration** : `localLink: { baseUrl, ttlMinutes }` (`baseUrl` = adresse joignable depuis le téléphone quand la page est ouverte en `localhost`).
- Icône `assets/icons/mobile_phone-0.png`.
- **`npm start` change** : `tools/dev-server.mjs` remplace `python -m http.server`. À la manière d'Expo Go, il détecte l'adresse IP du poste sur le réseau local, ouvre le navigateur du PC sur `localhost` (Web Crypto, donc comptes et connexion, exige localhost ou HTTPS) et injecte dans les pages HTML `window.Win95DevServer.lanUrl`, que « Connexion locale » met dans le QR code (joignable depuis le téléphone sans configuration) et affiche un QR code dans le terminal. Options : `--port`, `--dir`, `--no-open`.
- Tests : QR code (structure, format BCH, capacité), application, expiration, mode téléphone, plugin `phone`, exclusion.

**Limite connue** : aucune donnée ne circule encore entre l'ordinateur et le téléphone (pas de serveur, aucune requête réseau). La session n'existe qu'en mémoire du poste ; l'échéance dans l'adresse n'est qu'un confort d'affichage côté téléphone.

## 1.1.0 — fondations d'une dépendance

Première version pensée pour être utilisée par d'autres projets (le projet Mecha en premier).

**Ajouts**
- **Chargeur** `scripts/loader.js` : une seule balise `<script>` suffit ; liste ordonnée unique des modules (`MODULES`), `Win95Config.exclude`, plugins (`plugins`, avec `before: "<module>"`), supabase-js chargé seulement si besoin, `window.Win95Ready` / événement `win95:lib-loaded`.
- **Ressources relocalisables** : `window.Win95Asset` ; la bibliothèque peut vivre dans n'importe quel dossier (`vendor/win95-lib/`).
- **API d'extension** du gestionnaire de fenêtres : `registerApp`, `registerStartMenuItem`, `registerDesktopIcon`, `registerRecycleBinProvider`, `registerShortcutOpener`, `registerShortcutSource`, `registerDropType`, `registerContextMenuProvider`, `addTrayItem` ;
  explorateur : `registerSpace`, `registerContextMenuContributor`, `registerDropHandler` ; `Win95UserFiles.create(...)` pour d'autres espaces de documents ; `Win95Programs.register`.
- **Fournisseurs de stockage** (`scripts/storage/`) : `local` (IndexedDB, petits quotas par défaut : 50 Mo / 10 Mo par fichier), `supabase` (table + bucket), `supabase+drive` (contenu dans Google Drive via Vercel), repli automatique avec message.
- **Fournisseurs de comptes** : `local` (localStorage) et `supabase` (`win95_accounts`) ; `Win95Accounts.useProvider` pour un fournisseur personnalisé.
- **Préparatifs de déploiement** : `supabase/01-accounts.sql`, `02-user-files.sql`, `03-drive-storage.sql` ; `vercel/` (`vercel.json` avec CSP, `api/drive.js`, `api/drive-auth.js`, `.env.example`, guide) ; `tools/init-project.mjs` (génère un projet) et `tools/export.mjs` (copie « vendor »).
- **Tests** : `npm test` (16 tests : moteurs de jeu, session, stockage local, Supabase et Drive simulés, fonctions Vercel, API d'extension, chargeur, projet consommateur, outils, applications, lecteur multimédia, ambiance).
- Nouvelle configuration : `appName`, `storage`, `accounts`, `supabase`, `exclude`, `plugins`, `userTray`, `bootstrap`, `libPath`, `cacheBust`.

**Changements** (par rapport à l'état antérieur non publié)
- `Win95Accounts` : `create/update/setPassword/remove/verify` sont asynchrones ; `ready()` charge les comptes ; `Win95Security.start()` attend ce chargement.
- `Win95UserFiles` : stockage délégué à un fournisseur ; nouvelles méthodes `remove`, `destroy`, `readText`, `snapshot`, `copyItems`, `ensureRootFolder`, `create`.
- Le lecteur audio devient le **Lecteur multimédia** (`media-player-component.js`) dans l'esprit Windows 95 ; l'API `Win95MediaPlayer.attach` / `openFolderTracks` est conservée.
- `WindowManager.closeWindow(fenêtre, { force })`, `canOpen` tolère une sécurité sans `canOpenApp`.
