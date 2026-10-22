# Historique des versions

Versionnement sémantique : une version **majeure** pour tout changement incompatible de l'API d'extension, de la configuration, des fournisseurs, des clés de stockage, des événements `win95:*` ou de l'ordre de chargement.

## Non publié — Lecteur multimédia : barre des tâches et YouTube

**Ajouts**
- **Mini-lecteur dans la barre des tâches**, à gauche du compte : titre de la piste (il défile en boucle s'il est trop long), précédent, lecture/pause, suivant. Il suit le lecteur qui joue et disparaît avec la dernière fenêtre fermée.
- **Fichier > Ouvrir un lien YouTube… (Ctrl+L)** : lien youtube.com, music.youtube.com, youtu.be, /shorts, /embed. Lecture par le lecteur officiel (API IFrame, domaine youtube-nocookie.com), cadre vidéo visible dans la fenêtre. Les publicités éventuelles restent celles de YouTube : la bibliothèque ne les retire pas.
- `Win95MediaPlayer.parseYouTubeId(lien)`.
- CSP (`vercel/vercel.json`) : `script-src https://www.youtube.com` et `frame-src https://www.youtube-nocookie.com https://www.youtube.com`. Un projet avec sa propre CSP doit les ajouter.

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
