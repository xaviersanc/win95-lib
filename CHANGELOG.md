# Historique des versions

Versionnement sémantique : une version **majeure** pour tout changement incompatible de l'API d'extension, de la configuration, des fournisseurs, des clés de stockage, des événements `win95:*` ou de l'ordre de chargement.

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
