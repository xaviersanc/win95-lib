# Déployer un projet Win95 sur Vercel (avec Supabase et Google Drive)

Sans configuration, la bibliothèque fonctionne seule dans le navigateur (stockage local). Ce dossier prépare les trois services
qui la font passer à une vraie persistance partagée. **Chaque étape est indépendante** : on peut s'arrêter à Supabase, ou n'utiliser que Vercel.

| Service | Rôle | Réglage (`window.Win95Config`) |
|---|---|---|
| **Vercel** | héberge le site statique et les fonctions `api/` (Google Drive) | — |
| **Supabase** | arborescence des documents, comptes, petits fichiers (bucket) | `supabase`, `storage.provider`, `accounts.provider` |
| **Google Drive** | contenu volumineux des fichiers (1 Go par compte par défaut) | `storage.provider: "supabase+drive"` |

## Démarrage rapide

```bash
node vendor/win95-lib/tools/init-project.mjs --dir . --supabase-url https://xxxx.supabase.co
```

L'outil crée dans le dossier cible (sans écraser l'existant, sauf `--force`) : `index.html`, `win95-config.js`, `vercel.json` (en-têtes de sécurité dont la CSP),
`api/drive.js` et `api/drive-auth.js`, `.env.example`, `supabase/*.sql`. Il ne modifie jamais la bibliothèque. Ensuite :

1. **Supabase** — créer un projet, puis exécuter dans le SQL Editor, dans l'ordre : `supabase/01-accounts.sql`, `supabase/02-user-files.sql` et, pour Drive, `supabase/03-drive-storage.sql`.
   Renseigner `supabase.url` et `supabase.anonKey` (clé publique « anon ») dans `win95-config.js` et passer `storage.provider` / `accounts.provider` à `"supabase"`.
2. **Vercel** — importer le dépôt (ou `vercel` en ligne de commande). Si la bibliothèque est un sous-module git, activer « Include source files from Git submodules » (Project > Settings > Git).
3. **Google Drive** (facultatif) — dans Google Cloud : activer « Google Drive API », créer un identifiant OAuth « Application Web » dont l'URI de redirection est `https://<site>/api/drive-auth`.
   Dans Vercel > Settings > Environment Variables : `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` (modèle : `.env.example`), redéployer, ouvrir une fois
   `https://<site>/api/drive-auth`, autoriser, copier le jeton affiché dans `GOOGLE_REFRESH_TOKEN`, redéployer. Puis `storage.provider: "supabase+drive"`.
   Le site vérifie lui-même que Drive répond (`/api/drive?action=status`) : sinon il retombe sur le bucket Supabase (100 Mo par compte).

## Sécurité : ce qu'il faut savoir

- La connexion est vérifiée **dans le navigateur** (SHA-256 salé) ; la clé Supabase « anon » est publique et les policies SQL fournies sont ouvertes. Quiconque a accès au site peut donc, avec la console,
  lire les empreintes des mots de passe et les documents de tous. Adapté à une démo ou un site entre proches ; **pas à des données sensibles** (voir `supabase/01-accounts.sql` pour durcir avec Supabase Auth).
- Les fonctions Google Drive ne fonctionnent qu'avec un compte valide (empreinte vérifiée dans Supabase) et limitent le débit par compte et par IP ; elles n'accèdent qu'aux fichiers créés par l'application (`drive.file`).
- Le jeton Google (`GOOGLE_REFRESH_TOKEN`) n'est jamais envoyé au navigateur.
- La CSP de `vercel.json` interdit les scripts en ligne : la configuration doit donc être un fichier (`win95-config.js`), jamais un bloc `<script>` dans la page.
- Si le domaine Supabase n'est pas `*.supabase.co` (domaine personnalisé), l'ajouter à `connect-src` dans `vercel.json`.

## Tester sans services

`npm test` (à la racine de la bibliothèque) simule Supabase et les fonctions Drive : aucun compte ni réseau n'est nécessaire pour vérifier les fournisseurs. Pour essayer pour de vrai :
`vercel dev` avec un fichier `.env` copié de `.env.example`.
