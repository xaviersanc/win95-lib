# Historique des versions

Versionnement sémantique : une version **majeure** pour tout changement incompatible de l'API d'extension, de la configuration, des fournisseurs, des clés de stockage, des événements `win95:*` ou de l'ordre de chargement.

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
