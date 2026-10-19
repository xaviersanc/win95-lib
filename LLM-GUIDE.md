# Guide pour un LLM qui reprend la bibliothèque Win95 lib

Ce fichier est écrit pour un agent (Claude, etc.) qui doit **modifier, étendre ou réutiliser** cette bibliothèque sans la casser. Le lire en entier avant la première modification.
Les règles de style visuel sont dans [charte-graphique.md](charte-graphique.md) (obligatoire pour toute interface) ; l'usage est décrit dans [README.md](README.md) ; ce guide
couvre le **comment travailler ici** : architecture réelle, contrats, recettes, pièges déjà rencontrés, méthode de test.

---

## 0. Ce que c'est, et ce que ça ne doit jamais devenir

Un faux Windows 95 dans le navigateur : bureau, barre des tâches, menu Démarrer, fenêtres, explorateur de fichiers, Bloc-notes/WordPad, Paint, lecteur d'image, lecteur audio,
Panneau de configuration, accessoires, jeux, ambiance (démarrage, écrans de veille, écran bleu), comptes utilisateurs avec droits. **HTML + CSS + JavaScript vanille, sans framework,
sans build, sans dépendance npm à l'exécution.** Elle fonctionne **seule dans le navigateur** (stockage local, petits quotas) et se branche, par configuration, sur **Supabase**
(comptes, arborescence des documents), **Google Drive** (contenu volumineux) et **Vercel** (hébergement + fonctions serverless) : voir §10. Elle est faite pour être **la dépendance
de plusieurs projets** (sous-module git, ex. le projet Mecha) : voir §11 et [INTEGRATION.md](INTEGRATION.md). Dépendances externes : Bootstrap 4.6.2 (CSS, CDN, `integrity`) et, seulement
si Supabase est configuré, supabase-js (CDN, `integrity`).

Interdit, sauf demande explicite du propriétaire :
- ajouter un framework (React, Vue, jQuery…), un bundler, TypeScript, un transpileur, des modules ES (`import`/`export`) ou un `package.json` de dépendances d'exécution ;
- mettre dans la bibliothèque ce qui est propre à un projet (Mecha : messagerie, BDD Union, dés, fiches de pilote, Poste de travail de jeu…) : cela va dans le **plugin du projet** (§11) ;
- appeler un service réseau en dehors des fournisseurs de stockage/comptes (§10) et de supabase-js ; sans configuration, **aucune requête réseau** ne doit partir ;
- écrire dans Git à la place du propriétaire : **ne jamais exécuter `git commit`, `git push`, `git tag` ni créer de branche sans demande explicite** (le propriétaire commit lui-même, en son nom) ;
- utiliser `alert`, `confirm`, `prompt` du navigateur (voir `Win95Dialog`) ;
- écrire une interface qui ne ressemble pas à Windows 95.

Langue : **toute l'interface, les messages d'erreur et les commentaires sont en français.** Les identifiants de code (classes, fonctions, clés) sont en anglais ou en français déjà
établi ; suivre le fichier voisin.

---

## 1. Plan du dépôt

```
index.html                         page de démonstration ; elle ne contient qu'un <script> : scripts/loader.js
scripts/loader.js                  LE chargeur : liste unique et ordonnée des modules (MODULES), exclusions, plugins, supabase-js ; définit Win95Asset (§3)
scripts/storage/                   fournisseurs de stockage : storage.js (registre), local-backend.js (IndexedDB), supabase-client.js, supabase-backend.js, drive-content.js
supabase/                          scripts SQL : 01-accounts, 02-user-files, 03-drive-storage
vercel/                            vercel.json (CSP), api/drive.js + api/drive-auth.js (Google Drive), .env.example, README.md
tools/                             init-project.mjs (prépare un projet), export.mjs (copie « vendor » sans sous-module)
tests/                             run.mjs (npm test), mocks/supabase-mock.js, fixtures/ (plugins et projet consommateur de test)
INTEGRATION.md, CHANGELOG.md       utiliser la bibliothèque dans un projet ; historique des versions
assets/win95.css                   feuille de base (boutons, fenêtres, modales) — ne pas la réécrire
assets/icons/                      PNG pixelisés 16/32 px (seulement ceux réellement utilisés)
scripts/services/                  services globaux sans interface propre
  win95-config.js                  window.Win95Config (dbName)
  win95-services-registry.js       window.Win95Services (register/get)
  win95-utils.js                   Win95Utils : chemins, ids, types de fichiers, utilisateur courant
  accounts-store.js                Win95Accounts : comptes, hachage, rôles, applications autorisées
  clock-store.js                   Win95Clock : date/heure simulées, fuseau (lu par tray-clock.js)
  sound-store.js                   Win95Sounds : événements → sons synthétisés (Web Audio), play(événement)
  mouse-store.js                   Win95Mouse : double-clic recomposé + forme du pointeur
  programs-store.js                Win95Programs : programmes « supprimés » (cachés) par compte
  user-files-store.js              Win95UserFiles : Mes documents (IndexedDB, une base par compte)
  recycle-bin-store.js             Win95RecycleBin : Corbeille des raccourcis
  document-shortcuts-store.js      Win95DocumentShortcuts : raccourcis rangés dans Mes documents
  wallpaper-store.js               Win95Wallpaper : fond d'écran
  win95-context-menu.js            Win95ContextMenu : menu clic droit + sous-menus
  win95-dialog.js                  Win95Dialog : confirm / alert / prompt / form (promesses)
  win95-drag-drop.js               Win95DragDrop : types MIME et payloads de glisser-déposer
  win95-rich-text.js               Win95RichText : markdown → DOM + éditeur WordPad
  win95-menu-bar.js                Win95MenuBar : barre de menus (Jeu ?) des applications, menus déroulants via Win95ContextMenu
  context-guard.js                 bloque le menu contextuel du navigateur (sauf zones de saisie)
  tray-clock.js, zoom-guard.js     horloge ; blocage du zoom de page
scripts/window-manager/            LE cœur : bureau, icônes, menu Démarrer, création des fenêtres, droits d'accès
scripts/window-component/          comportement d'une fenêtre (déplacer, redimensionner)
scripts/file-explorer/             explorateur (Mes documents, Corbeille)
scripts/notepad|paint|image-viewer|media-player|display-properties|user-manager/   applications
scripts/accessories/              calculator, clock (Win95ClockApp), charmap
scripts/games/                    cards.js (Win95Cards : paquet, sprites, cascade), minesweeper, solitaire, freecell, hearts — chacun expose Engine (règles sans interface) + attach
scripts/ambiance/                 boot-screen (démarrage), screensaver + screensaver-effects (écrans de veille), blue-screen, close-program (Ctrl+Alt+Suppr)
scripts/control-panel/             Panneau de configuration + applets (date-time, mouse, sounds, system, add-remove) + property-sheet.js (onglets OK/Annuler/Appliquer)
scripts/security/                  Win95Security : session + écran de connexion/premier démarrage
```

Chaque composant = `scripts/<nom>/<nom>-component.js` + `.css`, exposé sur `window.Win95<Nom>` avec une méthode `attach(rootElement)` **idempotente**.

---

## 2. Principes d'architecture à respecter

1. **Globals + registre.** Chaque script est une IIFE `(() => { … })();` qui s'accroche à `window.Win95…` **et** appelle `window.Win95Services?.register?.("Win95…", api)`.
   Pas de `import`. Un composant lit ses services au moment de l'usage (`() => window.Win95Utils`) ou en tête de fichier **si** le service est chargé avant lui (§3).
2. **Le gestionnaire de fenêtres possède les fenêtres.** Les applications ne créent jamais leur `<section>` : `WindowManager.createWindow(appName)` la construit
   (`createWindowElement` → `mountWindow` → `attach`). Pour ouvrir une application : `window.Win95WindowManager.openApp("notepad", { forceNew: true })` (retourne l'élément fenêtre ou `null`).
3. **Séparation par compte.** Toute donnée locale d'un compte est clé par son **id** (`Win95Utils.getCurrentUserId()`), **jamais par son nom** (le nom peut changer). Clés actuelles :

   | Donnée | Emplacement |
   |---|---|
   | Comptes | `localStorage["win95.accounts.v1"]` |
   | Session | `sessionStorage["win95.session.v1"]` (id du compte) |
   | Mes documents | IndexedDB `<dbName>-<id>` (magasins `files`, `blobs`) |
   | Disposition du bureau | `localStorage["win95.desktop.state.v1.<id>"]` |
   | Raccourcis de Mes documents | `localStorage["win95.documentShortcuts.v1.<id>"]` |
   | Corbeille (raccourcis) | `localStorage["win95.recycleBin.items.v1.<id>"]` |
   | Fond d'écran | `localStorage["win95.wallpaper.<id>"]` |
   | Souris | `localStorage["win95.mouse.v1.<id>"]` |
   | Écran de veille | `localStorage["win95.screensaver.v1.<id>"]` |
   | Jeux et accessoires | `win95.minesweeper.v1.<id>`, `win95.solitaire.v1.<id>`, `win95.clockapp.v1.<id>` |
   | Sons | `localStorage["win95.sounds.v1.<id>"]` |
   | Programmes supprimés (cachés) | `localStorage["win95.programs.hidden.v1.<id>"]` |
   | Horloge (date/heure réglées, fuseau) | `localStorage["win95.clock.v1"]` — **machine**, commun à tous les comptes (seule exception) |
   | Mode d'affichage de l'explorateur | `localStorage["win95.explorer.viewMode"]` (global) |

   `Win95Security.purgeUserData(id)` efface tout ce qui se termine par `.<id>` et la base IndexedDB : **toute nouvelle clé par compte doit se terminer par `.<id>`** pour être purgée.
4. **Événements custom** (sur `window`, sauf mention) :
   `win95:auth-changed` (session ouverte), `win95:auth-logout`, `win95:accounts-changed`, `win95:user-files-changed`, `win95:recycle-bin-changed`,
   `win95:document-shortcuts-changed`, `win95:wallpaper-changed`, `win95:clock-changed`, `win95:sounds-changed`, `win95:mouse-changed`, `win95:programs-changed`, `win95:screensaver-changed`, `win95:boot-done`, `win95:bluescreen-shown` ; sur l'**élément fenêtre** : `win95:window-closing` (annulable : `preventDefault()` refuse la fermeture, ex. document non
   enregistré) et `win95:window-closed` (**toujours y retirer ses écouteurs globaux** : `window.addEventListener(...)` sans nettoyage = fuite et double rendu).
5. **Les stores sont des singletons réactifs** : toute mutation émet son événement ; les vues écoutent l'événement et se redessinent, elles ne se rafraîchissent pas elles-mêmes à la main.
6. **Résultats d'opérations** : les stores renvoient `{ ok, message, … }` avec un message français prêt à afficher dans la barre d'état. Ne pas lever d'exception pour une erreur attendue.
7. **Pas d'`innerHTML` avec des données utilisateur.** Utiliser `textContent` / `createElement`, ou `Win95Utils.escapeHtml()` si un gabarit en chaîne est inévitable.

---

## 3. Ordre de chargement (contractuel) : `scripts/loader.js`

Une page n'inclut que `scripts/loader.js` (après une configuration facultative). **La liste ordonnée des scripts et feuilles de style vit uniquement dans `MODULES` de `loader.js`** :
toute nouvelle application ou tout nouveau service s'y ajoute (une seule fois, au bon rang) ; `index.html` n'a jamais à être modifié pour cela. Ordre actuel, par identifiant de module :
`boot` → `core` (context-guard, tray-clock, zoom-guard, **win95-config**, registre, utils, drag-drop) → `storage` → `services` (accounts, clock, sound, mouse, programs, recycle-bin, wallpaper,
document-shortcuts, context-menu, menu-bar, dialog, rich-text, user-files) → `media-player` → `image-viewer` → `notepad` → `paint` → `explorer` → `control-panel` (property-sheet) →
`accessories` → `games` → `ambiance` → `control-panel-applets` → `user-manager` → `security` → **`window-manager`** (+ window-component). Puis les plugins du projet.

Règles : configuration et registre avant tout ; un service avant les composants qui le lisent **à leur chargement** (l'explorateur et le gestionnaire de fenêtres lisent `Win95UserFiles`,
`Win95RecycleBin`… en tête de fichier) ; `security` avant `window-manager` ; `window-manager` en dernier. Chaque fichier est chargé avec `?v=<version de la bibliothèque>` (constante `LIB_VERSION`
du chargeur, égale à `package.json` : un test le vérifie) : **changer la version à chaque publication** ; le navigateur met les sous-ressources en cache.

- **Chemins de ressources** : tout chemin `assets/...` écrit dans un fichier JS de la bibliothèque passe par `window.Win95Asset("assets/icons/x.png")` (préfixe le dossier d'installation, ex.
  `/vendor/win95-lib/`). Sans cela, les icônes cassent dès que la bibliothèque n'est pas à la racine du site (bug évité : 72 chaînes réécrites). Dans une chaîne HTML, utiliser un gabarit
  `` `<img src="${window.Win95Asset("assets/icons/x.png")}">` ``. Les CSS utilisent des chemins relatifs au fichier CSS (`../../assets/...`). Les icônes **du projet** (plugins) ne passent pas par `Win95Asset`.
- `Win95Config.exclude` retire des modules (identifiant) ou des fichiers (nom : `"accounts-store.js"`) ; `Win95Loader.disabledApps` liste les applications des modules exclus : elles sont masquées et refusées.
- `Win95Config.plugins` : `"chemin.js"` ou `{ src, css, before, integrity, crossorigin }` ; **`before: "<module>"`** insère le script AVANT ce module (nécessaire pour un `Win95UserFiles` ou `Win95Security`
  du projet, lus au chargement par l'explorateur et le gestionnaire de fenêtres) ; sans `before`, le plugin est chargé après toute la bibliothèque (le gestionnaire de fenêtres existe alors).

---

## 4. Recettes

### 4.1 Ajouter une application (ex. « Calculatrice »)

1. `scripts/calculatrice/calculatrice-component.js` :
   ```js
   (() => {
       class Win95Calculatrice {
           constructor(rootElement) {
               this.rootElement = rootElement;
               this.bodyElement = rootElement.querySelector("[data-calculatrice]");
               if (!this.bodyElement) return;
               this.boundOnChange = () => this.render();
               window.addEventListener("win95:wallpaper-changed", this.boundOnChange);      // exemple d'écouteur global
               rootElement.addEventListener("win95:window-closed", () => {
                   window.removeEventListener("win95:wallpaper-changed", this.boundOnChange); // NETTOYAGE obligatoire
               }, { once: true });
               rootElement.__win95CalculatriceInstance = this;
               this.render();
           }
           render() { /* DOM via createElement / textContent */ }
       }
       const api = { attach: (el) => el?.__win95CalculatriceInstance || new Win95Calculatrice(el) };
       window.Win95Calculatrice = api;
       window.Win95Services?.register?.("Win95Calculatrice", api);
   })();
   ```
2. `window-manager.js` → `this.windowDefinitions` : ajouter `calculatrice: { label, icon: "assets/icons/….png", title, kind: "calculatrice" }`.
3. `window-manager.js` → `createWindow` : ajouter un `case "calculatrice":` qui appelle `this.mountWindow(this.createWindowElement(appName, { title, ariaLabel, bodyHtml: '<div class="window-body calculatrice-body" data-calculatrice></div>' }), { width, height, attach: (el) => window.Win95Calculatrice?.attach?.(el) })`.
   `createWindowElement` accepte aussi `className` (ex. `"window mini-window …"`), `titleAttribute`, `dataset`, `withResizeHandle: false`.
4. `window-manager.js` → `ensureStartMenu` : ajouter un `<button class="start-menu-item" data-start-action="open-app" data-app-name="calculatrice">` (icône + `<span>`). Les droits masquent automatiquement
   tout élément portant `data-app-name` (`refreshSession`).
5. Facultatif : icône de bureau : `desktopIcon: true` dans `registerApp` (ou un `<div class="desktop-icon" data-desktop-app="calculatrice">` dans la page du projet).
6. `scripts/loader.js` : ajouter l'application à `MODULES` (`css`, `js`, `apps: ["calculatrice"]` pour que l'exclusion la masque), **avant** `security` / `window-manager`. Ne pas toucher `index.html`.
   Pour une application propre à un projet (pas à la bibliothèque), ne rien ajouter ici : l'enregistrer depuis le plugin du projet avec `registerApp` (§11).
7. Droits : une application déclarée dans `windowDefinitions` apparaît automatiquement dans la liste « Applications autorisées » de Gestion des utilisateurs, **sauf** si elle porte `parentApp` (applet : elle suit le droit de l'application parente ; déclarer aussi la correspondance dans `Win95Security.APP_PARENTS`). Un programme supprimable (cachable) se déclare en plus dans `Win95Programs.PROGRAMS`. Si elle doit être réservée aux
   administrateurs, l'ajouter à `Win95Security.ADMIN_ONLY_APPS` (dans `security-manager.js`) — l'accès est alors refusé à tout non-admin par `openApp` **et** masqué.
8. Si l'application ouvre des fichiers : étendre `Win95Utils.getFileKind` / `getFileIcon` et la table `appForKind` + le `if` de `Win95UserFiles.openFile` (sinon un compte restreint pourrait contourner ses droits).
9. CSS : voir §6. Documenter les nouvelles classes dans `charte-graphique.md` §4.

### 4.2 Ouvrir un fichier depuis une application

`Win95UserFiles.openFile(id, siblingIds)` choisit l'application ; elle appelle ensuite :
- `Win95Notepad.openFromFile({ fileName, relativePath, content, onSave })` — `onSave(texte)` doit renvoyer `{ ok, message }` ;
- `Win95Paint.openFromFile({ fileName, content /* data URL PNG, "" = page blanche */, onSave })` ;
- `Win95ImageViewer.openFromFile({ fileName, relativePath /* URL blob: */, images: [{ name, relativePath }], startIndex })` ;
- `Win95MediaPlayer.openFolderTracks({ tracks: [{ fileName, relativePath, url }], startIndex }, { forceNewWindow: true })`.
Les URL de lecture sont des adresses `blob:` créées par `Win95UserFiles.getSignedUrls(ids)` et révoquées au changement de compte / à la modification du fichier.

### 4.3 Menus, dialogues, drag & drop

- Menu : `Win95ContextMenu.open(x, y, [{ label, onSelect, bold?, disabled? } | { label, items: [...] } | { separator: true }])`.
- Dialogues (promesses) : `await Win95Dialog.confirm({ title, message, confirmLabel? })` → `true/false` ; `alert({ title, message })` ; `prompt({ title, message, defaultValue })` → texte ou `null` ;
  `form({ title, message, fields: [{ name, label, type: "text"|"password"|"select", value, options }] })` → `{ nom: valeur }` ou `null`. **Les valeurs sont `trim()`-ées** (un mot de passe commençant ou
  finissant par une espace est donc modifié : c'est le cas du changement de mot de passe du gestionnaire d'utilisateurs ; l'écran de connexion et le formulaire de création, eux, utilisent leurs propres champs non tronqués).
- Glisser-déposer : `Win95DragDrop.writePayload(dataTransfer, payload, [MIME.explorerEntry])` / `readPayload(...)` ; types dans `Win95DragDrop.MIME`.

### 4.3 bis Ajouter un applet au Panneau de configuration

1. Créer `scripts/control-panel/<nom>-component.js` : `Win95PropertySheet.mount(bodyElement, { tabs: [{ key, label, render(panel, sheet) }], onApply, onClose })`. `sheet.markDirty()` active « Appliquer » ;
   `onApply` renvoie `{ ok, message }` ; `onClose` ferme la fenêtre (`Win95WindowManager.closeWindow(rootElement)`). `buttons: "close"` (un seul bouton) ou `"ok-cancel"` (sans Appliquer) sont possibles.
2. `window-manager.js` : définition avec `parentApp: "control-panel"` dans `windowDefinitions`, `case` qui appelle `this.createAppletWindow(appName, definition, { width, height, attach })` (fenêtre sans réduire/agrandir, corps `data-applet`).
3. `security-manager.js` : ajouter l'applet à `APP_PARENTS`. `control-panel-component.js` : ajouter l'entrée à `APPLETS` (icône 32 px de `assets/icons/`).
4. Un réglage doit avoir un **effet réel** (pas de case qui ne fait rien) ; s'il n'est pas implémentable, ne pas l'afficher. Il est stocké par compte (clé `…<id>`) via un store dédié qui émet son événement.
5. CSS dans `control-panel.css` (classes `property-*`, déjà prévues : `property-group`, `property-note`, `property-check`…).

### 4.3 ter Sons, souris, horloge : points d'intégration

- Jouer un son système : `window.Win95Sounds?.play("<événement>")` (liste dans `Win95Sounds.EVENTS`). Ne rien faire si le service est absent ; l'audio n'est autorisé qu'après un geste utilisateur, `play` ne lève jamais d'erreur.
  Ajouter un événement = entrée dans `EVENTS`, valeur dans chaque schéma (`DEFAULT_MAP`, `SCHEMES`), appel `play` à l'endroit voulu.
- **Double-clic** : `mouse-store.js` bloque le `dblclick` natif (événement de confiance) et le remplace par un `dblclick` recomposé (non fiable, `isTrusted === false`). Conséquence : ne jamais tester `event.isTrusted` dans un
  gestionnaire de `dblclick`, et ne pas écouter `dblclick` sur `window` en phase de capture avant ce store.
- **Heure** : ne jamais utiliser `new Date()` / `Date.now()` pour afficher l'heure du « système » : passer par `Win95Clock.nowMs()` / `Win95Clock.formatTime()`. `Date.now()` reste correct pour des durées et des identifiants.
- **Supprimer un programme = le cacher** : `Win95Security.canOpenApp` refuse toute application dont `Win95Programs.isHidden(clé)` est vrai, administrateur compris. N'effacer aucune donnée utilisateur à la désinstallation.

### 4.3 quater Ambiance : écrans plein cadre, écrans de veille, raccourcis globaux

- **Empilement (z-index)** : dialogues `Win95Dialog` 10001 ; « Fermer le programme » 10000 (**sous** les dialogues qu'il ouvre) ; écran de connexion 30000 ; démarrage 40000 ; écran de veille 45000 ; écran bleu 50000.
  Toute nouvelle couche plein cadre doit respecter cet ordre. Une couche qui ouvre un `Win95Dialog` doit rester **en dessous** (sinon le dialogue est inaccessible : bug déjà rencontré).
- **Ajouter un écran de veille** : fonction `(canvas, options) => { stop() }` dans `screensaver-effects.js` (lire `canvas.width/height` une fois ; animer avec `loop()` ; ne rien garder après `stop()`), entrée dans `Win95ScreenSaver.SAVERS`
  (`effect`, `hasSettings` si l'onglet Écran de veille doit proposer « Paramètres… »). Il sert aussi pour l'aperçu en miniature (220 × 150) : ne pas supposer une taille d'écran.
- **Raccourci global au clavier** : écouteur `keydown` sur `window` en **capture** ; ne pas ajouter, pendant cet événement, un écouteur de la même touche sur `document` (il recevrait aussitôt le même événement : la touche
  qui ouvre une boîte compterait comme une 2e pression — bug déjà rencontré, voir `setTimeout` dans `close-program.js`). Ignorer le raccourci sans session ouverte.
  Le navigateur ne reçoit pas Ctrl+Alt+Suppr sous Windows : proposer toujours une alternative (Ctrl+Alt+Fin).
- **Écrans qui bloquent la saisie** (écran de veille, écran bleu) : écouter en capture et `preventDefault` / `stopImmediatePropagation` pour que la touche de réveil n'atteigne pas l'application dessous ; prévoir un délai de grâce
  (0,5 s) et un seuil de mouvement (6 px) pour ne pas réveiller sur une vibration de souris.
- **Démarrage** : `boot-screen.js` est volontairement le premier script ; ne jamais lui faire dépendre d'un autre service. Les tests automatisés ajoutent `?noboot` ou attendent `.boot-screen` détaché.
- **Couleurs** : démarrage, écran bleu et écran de veille sont les seuls endroits où du texte clair sur fond sombre est permis (écrans plein cadre d'origine). Toute autre interface suit la charte.

### 4.3 quinquies Accessoires et jeux : modèle à suivre

- **Fenêtre** : `windowDefinitions` + `case` qui appelle `this.createToolWindow(appName, definition, { width, height, attach })` (taille fixe : pas de bouton Agrandir, corps `[data-app-body]`, classe `app-fixed-window`).
  `mountWindow` fixe la taille par défaut **avant** `attach` : le composant peut l'ajuster à son contenu avec `Win95Utils.fitWindow(rootElement, contentElement, { extraHeight: hauteurDeLaBarreDeMenus })` (grille du Démineur, calculatrice scientifique…).
- **Barre de menus** : `Win95MenuBar.mount(bodyElement, [{ label, items: () => [...] }])`, items au format `Win95ContextMenu` (`checked`, `hint`, `disabled`, `separator`, sous-menus). Fournir `items` sous forme de **fonction** quand des coches doivent refléter l'état courant.
- **Séparer moteur et interface** : chaque jeu expose `Engine` (règles, IA, aucune référence au DOM) : testable depuis le navigateur (`new window.Win95Hearts.Engine()`…) ; l'interface ne fait que dessiner et traduire les clics. Garder cette séparation : c'est ce qui a permis de tester 25 parties complètes de Cœurs automatiquement.
- **Canvas et cartes** : dessiner via `Win95Cards` (sprites mis en cache), jamais de `fillText` de cartes à chaque image. Le glisser-déposer utilise les `pointer events` avec `setPointerCapture` ; `dblclick` fonctionne grâce au double-clic recomposé de `mouse-store.js`.
- **Aléatoire** : le moteur accepte un générateur injectable (`random`) pour les tests ; FreeCell utilise le générateur de Microsoft (`Win95Cards.dealFreeCell(n)`) : la donne n° 1 doit toujours donner en colonne 1 `JD KD 2S 4C 3S 6D 6S` (test de non-régression).
- **Sons / fin de partie** : `Win95Sounds?.play("exclamation")` à la victoire, `Win95Dialog.confirm` pour proposer de rejouer. Toujours arrêter minuteurs et animations sur `win95:window-closed`.
- **Droits** : ajouter l'application dans `Win95Programs.PROGRAMS` pour qu'elle soit supprimable (Ajout/Suppression de programmes) et dans `START_MENU` (window-manager.js) pour apparaître au bon endroit du menu Démarrer.
- **Clic droit** : le navigateur est bloqué ; pour un menu propre à un composant, écouter `contextmenu` sur l'élément, appeler `event.preventDefault()` **et** `Win95ContextMenu.open(...)`. Le gestionnaire de fenêtres n'ajoute son menu que si aucun menu n'est ouvert (voir `handleContextMenu`) ; une zone de saisie conserve le menu natif.

### 4.4 Ajouter une règle ou un champ au système de comptes

Compte = `{ id, name, role: "admin"|"user", allowedApps: string[]|null, salt, hash, createdAt }`. Toute modification passe par `Win95Accounts` (jamais d'écriture directe dans `localStorage`).
Invariants à préserver : au moins un administrateur ; noms uniques (comparaison sans accents ni casse, `simplifyText`) ; un admin a toujours `allowedApps === null` ; le premier compte créé est admin ;
`toPublic()` ne doit **jamais** exposer `salt` ni `hash` ; ne pas supprimer le compte de la session en cours. La vérification des droits côté interface (`canOpenApp`) doit être doublée côté action
(ex. `openApp` refuse même si le bouton est masqué).

---

## 5. Pièges déjà rencontrés (à ne pas refaire)

1. **Séquences d'échappement dans les chaînes JS.** `"C:\Mes documents"` vaut `"C:Mes documents"` (le `\M` disparaît, sans erreur de syntaxe). Écrire `"C:\\Mes documents"`. Même vigilance pour `\n` voulu littéral.
   Si vous générez du code par script (shell/Python), **vérifiez le fichier résultant** : les `\\` et les apostrophes (`l'ordinateur` dans une chaîne `'…'`) sont des sources de corruption silencieuse. Préférer des chaînes `"…"` ou des gabarits `` `…` `` quand le texte contient une apostrophe française.
2. **`win95.css` masque les cases à cocher et boutons radio** (`input[type=checkbox|radio] { position:absolute; left:-9999px }`). Un `<input type="checkbox">` brut est invisible et « hors de l'écran ». Il faut le restyler
   (voir `.user-manager-app input[type="checkbox"]` pour un modèle : `appearance:none`, biseau enfoncé, coche en `::before`).
3. **L'attribut `hidden` perd contre un `display:` explicite.** `img[hidden]` avec `display:block` reste visible : ajouter une règle `[hidden] { display:none }` locale (voir `image-viewer-component.css`).
   Pour masquer un élément de menu, `style.display = "none"` ; pour une icône de bureau, `style.visibility = "hidden"` (garde sa case de grille).
4. **Texte blanc hérité.** `body.win95-desktop` / `.desktop` héritent `color:#fff`. Tout composant doit fixer `color:#000` (et la couleur des `label`, `legend`, `p`).
4 bis. **Clic droit natif bloqué** : `context-guard.js` appelle `preventDefault()` sur tout `contextmenu` hors zones de saisie. Un nouveau composant qui veut un menu doit donc l'ouvrir lui-même (voir 4.3 quinquies) ; ne jamais retirer ce garde-fou.
4 ter. **Ressources et chemins** : un `src="assets/..."` ou `"assets/..."` écrit en dur dans du JS de la bibliothèque est un bug (cf. §3 `Win95Asset`). Le test « dépendance » charge la bibliothèque depuis
`/vendor/win95-lib/` et échoue sur tout 404.
5. **Sans session, rien ne doit être lu ni écrit pour un compte.** Avant connexion, `getCurrentUser()` renvoie le profil `invite` ; `WindowManager.hasSession()` bloque `load/saveDesktopState` pour ne pas créer de clés `.invite`.
   Tout nouveau code qui persiste par compte doit gérer le cas « pas de session ».
6. **Changement de compte = tout recharger.** `win95:auth-changed` : le gestionnaire ferme toutes les fenêtres, les stores se réinitialisent (`Win95UserFiles` ferme sa base IndexedDB). Un nouveau store par compte doit écouter
   `win95:auth-changed` et `win95:auth-logout` et se réinitialiser.
7. **Le dialogue `confirm` contient un bouton `type=submit hidden`** : dans un test, cibler `.win95-dialog button:visible`.
8. **Fenêtres qui se recouvrent en test** : une fenêtre ouverte au centre masque la précédente ; fermer la fenêtre (`[data-window-action='close']`) avant de cliquer en dessous, ou attendre le z-index.
9. **Web Crypto** (`crypto.subtle`) n'existe qu'en contexte sécurisé : HTTPS ou `localhost`. Le code l'indique par un message ; ne pas retomber sur un hachage maison faible.
10. **Quota / blobs** : `Win95UserFiles` conserve les URL `blob:` dans une `Map` ; les révoquer quand le contenu change (`revokeObjectUrl`) sinon fuite mémoire.
11. **Doublons d'écouteurs** : `attach()` doit être idempotent (`rootElement.__win95…Instance`). `WindowComponent.attach` l'est déjà.
12. **Noms d'applications historiques** : l'explorateur « Mes documents » s'appelle `internet-explorer` dans le code (`data-window-app`, `data-desktop-app`, `windowDefinitions`). Ne pas le renommer sans
    migrer les états de bureau déjà enregistrés (`iconKey: "app:internet-explorer"`) et les droits des comptes (`allowedApps`).

---

## 6. CSS : règles pratiques

- Respecter [charte-graphique.md](charte-graphique.md) (contraste, biseaux, 12 px, pas d'angle arrondi). Préfixer **tous** les sélecteurs par `body.win95-desktop`. Classes `composant-element`.
- Réutiliser : `btn`, `btn start-btn` (bouton de dialogue, gras, 84 px min), `btn explorer-btn small-label` (barre d'outils), `form-95` (champ), `explorer-status` (barre d'état), `windows-scrollbar`,
  `explorer-toolbar`, `window-body`. Biseau en relief : `border:2px solid; border-color:#fff #404040 #404040 #fff;` ; enfoncé : `#808080 #fff #fff #808080`.
- Hauteur d'un corps d'application : `height: calc(100% - 24px)` (barre de titre) ; zone qui défile : `min-height:0; overflow:auto`.
- Ne pas utiliser de police ni d'icône externe ; icônes = PNG de `assets/icons/` ; si une nouvelle icône est nécessaire, la copier depuis une source Windows 95 existante et la référencer par chemin exact.
  **Ne pas supprimer d'icône sans chercher aussi les usages dynamiques** (`assets/icons/${icon}` dans `win95-dialog.js`, `getFileIcon`, `windowDefinitions`, CSS).
- Le fond d'écran vit dans `window-manager.css` : `.desktop[data-wallpaper="<clé>"]` **et** `.wallpaper-preview[data-wallpaper="<clé>"]`. Ajouter un fond = nouvelle entrée dans `WALLPAPERS` (`wallpaper-store.js`) + ces deux règles.

---

## 6 bis. Sécurité : ce que le système garantit et ce qu'il ne garantit pas

- Garanti : séparation des données entre comptes sur un même navigateur ; applications masquées et refusées selon les droits ; interface admin inaccessible aux non-admins ; mots de passe hachés (SHA-256 + sel
  aléatoire 16 octets), jamais stockés ni journalisés en clair ; messages de connexion identiques pour « compte inconnu » et « mot de passe faux » (pas d'énumération).
- **Non garanti** : tout est côté client. Un utilisateur qui ouvre la console peut lire/modifier `localStorage`, créer un compte admin, ou lire l'IndexedDB d'un autre compte. Ne jamais présenter ce système comme
  une sécurité forte, ne jamais y stocker de secret réel, et le dire dans toute documentation que vous ajoutez.
- Si le propriétaire demande une vraie sécurité, la réponse correcte est un back-end d'authentification, pas un durcissement du code client.

---

## 7. Tester : `npm test`

`npm install` (une fois : `playwright-core`), puis `npm test` ; `npm test -- "Supabase"` n'exécute que les tests dont le nom contient ce texte. Navigateur : Edge ou Chrome installé (sinon `WIN95_BROWSER=chrome|msedge`).
`tests/run.mjs` démarre son propre serveur statique (aussi sous `/vendor/win95-lib/`), un contexte de navigateur neuf par test, et **exige zéro erreur console / HTTP ≥ 400**. Ils sont le contrat de la bibliothèque :
moteurs de jeu (Cœurs : parties complètes sans coup illégal ; FreeCell n° 1 = `JD KD 2S 4C 3S 6D 6S`), session et droits, stockage local (quotas), **Supabase avec un faux client** (`tests/mocks/supabase-mock.js` : tables en mémoire,
bucket, trigger de quota), **Google Drive avec des fonctions simulées** (client) et les fonctions Vercel `api/drive.js` exécutées en Node avec un `fetch` simulé, API d'extension, plugin `before`, projet consommateur
(`tests/fixtures/consumer/`), outil `init-project`, chargeur et exclusions, ouverture de toutes les applications, lecteur multimédia, ambiance.

Règles : une nouvelle fonctionnalité = un test ; une correction de bug = un test qui l'aurait attrapé ; vérifier qu'un nouveau test **échoue** quand on casse le code (mutation rapide). Les fournisseurs distants
n'ont été éprouvés que contre ces faux : les valider une fois avec de vrais comptes Supabase / Google avant de promettre qu'ils marchent en production. Une capture d'écran, regardée, reste nécessaire pour toute nouvelle interface.
Ne laisser ni serveur, ni fichier temporaire (`tests/.tmp/` est nettoyé par les tests), ni `node_modules/` versionné.

---

## 8. Liste de contrôle avant de rendre un travail

- [ ] Aucun framework / import / appel réseau / `alert|confirm|prompt` natif ajouté.
- [ ] Nouveau script/CSS déclaré dans `MODULES` de `scripts/loader.js` au bon rang (jamais dans `index.html`) ; version (`LIB_VERSION` + `package.json`) incrémentée pour toute publication.
- [ ] `attach()` idempotent ; écouteurs globaux retirés sur `win95:window-closed`.
- [ ] Données par compte clés par id, clés suffixées `.<id>`, gestion « pas de session », réinitialisation sur `win95:auth-changed` / `win95:auth-logout`.
- [ ] Application déclarée dans `windowDefinitions`, `createWindow`, menu Démarrer ; restrictions d'accès vérifiées côté action ; `ADMIN_ONLY_APPS` si réservée aux admins.
- [ ] Interface conforme à la charte (§6 de la charte) ; classes préfixées `body.win95-desktop` ; `color` explicite ; cases à cocher/radios restylées.
- [ ] Textes français ; messages d'erreur via la barre d'état ou `Win95Dialog`.
- [ ] Pas de `innerHTML` avec données utilisateur ; pas de `\` non échappé dans les chaînes ; relire les fichiers générés par script.
- [ ] `node --check` OK ; `npm test` vert (et un nouveau test pour ce qui change) ; console vide ; captures examinées.
- [ ] Rien n'a été commité ni poussé ; `LIB_VERSION` (loader) = version de `package.json` ; `CHANGELOG.md` mis à jour pour tout changement visible d'un projet consommateur.
- [ ] README.md, charte-graphique.md et ce guide mis à jour si un contrat, une clé de stockage, un événement ou un composant change.

---

## 9. Idées d'extension cohérentes (si on vous les demande)

Poste de travail générique (lecteurs, Mes documents, Corbeille) ; copier/coller et déplacer des fichiers entre dossiers ; renommer/déplacer via glisser-déposer dans l'explorateur ; export/import d'un compte
(JSON + blobs) ; thèmes de bureau supplémentaires ; barre des tâches avec zone de notification extensible ; jeux Windows 95 (Démineur, Solitaire) comme nouvelles applications selon la recette §4.1.
Toute extension doit rester locale, sans dépendance, et suivre la charte.

---

## 10. Stockage, comptes, Supabase, Google Drive, Vercel

**Principe** : l'interface (explorateur, Bloc-notes, Paint, lecteurs) parle à `Win95UserFiles` ; celui-ci délègue à un **fournisseur** (`scripts/storage/`) choisi par `Win95Config.storage.provider`.
Les comptes passent de même par un fournisseur (`Win95Config.accounts.provider`). Par défaut tout est **local** (IndexedDB, 50 Mo par compte et 10 Mo par fichier ; `localStorage` pour les comptes).

| Réglage | Fournisseur | Où vivent les données | Prérequis |
|---|---|---|---|
| `storage.provider: "local"` | `local-backend.js` | IndexedDB (une base `<dbName>-<id>` par compte) | aucun |
| `"supabase"` | `supabase-backend.js` | table `user_files` + bucket `user-files` | `supabase/02-user-files.sql`, `supabase.url` + `anonKey` |
| `"supabase+drive"` | idem + `drive-content.js` | arborescence Supabase, contenu dans Google Drive (références `drive:<id>`) | + `supabase/03-drive-storage.sql`, `vercel/api/*` déployées, variables Google |
| `accounts.provider: "supabase"` | `accounts-store.js` | table `win95_accounts` | `supabase/01-accounts.sql` |

- **Repli** : si Supabase est demandé mais non configuré, le stockage retombe sur le local avec un message (`status.notice`, affiché par l'explorateur) ; si Drive ne répond pas (`/api/drive?action=status`), le contenu va dans le bucket.
- **Interface d'un fournisseur de stockage** : documentée en tête de `scripts/storage/storage.js` (`loadRows`, `insertRow`, `updateRow`, `deleteRows`, `storeContent`, `removeContents`, `readText`, `getUrl`, `copyContent`, `limits`, `init`).
  Un autre fournisseur s'ajoute avec `Win95Storage.register("nom", (config) => backend)`. Les mutations reçoivent toujours le **propriétaire** (id du compte) en premier argument.
  Un **fournisseur de comptes** : `Win95Accounts.useProvider({ load, save, remove })` (avant `ready()`).
- **Accès asynchrone** : `Win95Accounts.ready()` charge les comptes ; `needsSetup/list/get` sont ensuite synchrones, `create/update/setPassword/remove/verify` **asynchrones** (toujours `await`). La session n'est validée qu'une fois les comptes chargés.
- **Quotas** : en Mo dans `Win95Config`, **et** dans les triggers SQL (mêmes valeurs : si on change l'un, changer l'autre). Les erreurs serveur sont traduites en français (`QUOTA_EXCEEDED`, nom en double, table absente).
- **Vercel** : `vercel/vercel.json` (CSP stricte : pas de script en ligne → la configuration est un **fichier**), `vercel/api/drive.js` (envoi par morceaux de 3,75 Mo, copie, suppression, lecture texte ; identification X-Win95-User/X-Win95-Key vérifiée dans
  Supabase ; limitation de débit ; propriété des fichiers), `vercel/api/drive-auth.js` (autorisation Google, une fois), `vercel/.env.example`. Guide pas à pas : `vercel/README.md`. `node tools/init-project.mjs` génère tout cela dans un projet.
- **Sécurité** : modèle « entre proches » : connexion vérifiée côté client, policies SQL ouvertes à la clé `anon` publique. À dire en toutes lettres dans toute documentation ; pour durcir, passer à Supabase Auth via un fournisseur de comptes personnalisé.
  Ne jamais mettre `service_role`, un secret Google ou un mot de passe dans le dépôt ou dans `Win95Config` ; les secrets vivent dans les variables d'environnement Vercel.

---

## 11. La bibliothèque comme dépendance d'un projet (ex. Mecha)

Un projet charge **uniquement** `loader.js` ; il ne copie ni ne modifie le code de la bibliothèque (toute modification utile se fait ici, avec tests, puis le projet monte de version). Il personnalise par **configuration** (`Win95Config`) et par **plugin**.
Guide complet : [INTEGRATION.md](INTEGRATION.md). Résumé de l'API d'extension (sur `window.Win95WindowManager`, appelable à tout moment, même après le démarrage du bureau) :

| Méthode | Rôle |
|---|---|
| `registerApp({ key, label, icon, title, parentApp, create \| tool \| applet, startMenu, desktopIcon, removable })` | application (fenêtre, menu Démarrer, icône, droits, supprimable) |
| `registerStartMenuItem(entry, { path, before })` | entrée ou groupe du menu Démarrer (groupes créés au besoin) |
| `registerDesktopIcon({ app, label, icon })` | icône du bureau |
| `registerRecycleBinProvider({ canMove, moveToBin, canRestore, restore })` | éléments propres au projet dans la Corbeille |
| `registerShortcutOpener(source, fn)` / `registerShortcutSource(source)` | raccourcis vers des cibles du projet ; origine de glisser-déposer |
| `registerDropType(mime, { desktop, recycleBin })` | types MIME de glisser-déposer acceptés |
| `registerContextMenuProvider(fn(target, manager) → items \| null)` | menus contextuels (clic droit) |
| `addTrayItem(element)` | élément dans la zone de notification (avant l'horloge) |
| `Win95FileExplorer.registerSpace(key, { files, shared, rootLabel })` | autre espace de fichiers (ex. Documents partagés), fenêtre avec `space: key` |
| `Win95FileExplorer.registerContextMenuContributor(fn(entry, explorer) → items)` / `registerDropHandler(fn(payload, explorer))` | menu d'un fichier (ex. « Envoyer à ») ; dépôts spécifiques |
| `Win95UserFiles.create({ getOwner, changeEvent, shared })` | fabrique un autre espace de documents (même fournisseur de stockage) |

Config utile à un projet : `appName`, `exclude`, `plugins`, `userTray: false` (le projet affiche lui-même le compte), `bootstrap: false` (la page charge déjà Bootstrap), `storage`, `accounts`, `supabase`.
Exemple réel : le projet Mecha (`scripts/mecha-plugin/` dans son dépôt) exclut `boot`, `storage`, `user-manager`, `security`, `accounts-store.js`, `user-files-store.js`, fournit ses propres services avec `before`, et enregistre Poste de travail, BDD Union,
Messagerie, Paramètres, Documents partagés, la Corbeille des mechas, le personnage actif et « Envoyer à » par cette API.

**Avant de changer un contrat** (nom d'une méthode de l'API ci-dessus, signature d'un fournisseur, clé de stockage, événement, ordre de chargement) : le tester, l'écrire dans `CHANGELOG.md` (version majeure si un projet casse),
et vérifier avec un projet consommateur (`tests/fixtures/consumer/`).
