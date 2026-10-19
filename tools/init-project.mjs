#!/usr/bin/env node
// Prépare un projet qui utilise la bibliothèque Win95 (sous-module git, copie, etc.) : page d'accueil, configuration,
// déploiement Vercel, fonctions Google Drive et scripts SQL Supabase. Aucune dépendance. Ne modifie jamais la bibliothèque.
//
//   node vendor/win95-lib/tools/init-project.mjs --dir . [--name "Mon projet"] [--supabase-url https://xxxx.supabase.co] [--force]
//
// Options :
//   --dir <dossier>          projet à préparer (défaut : dossier courant) ;
//   --lib-path <chemin>      chemin de la bibliothèque depuis la racine du site (défaut : détecté, ex. vendor/win95-lib) ;
//   --name <nom>             nom de l'application (titre, dossier Google Drive) ;
//   --supabase-url <url>     URL du projet Supabase (préremplit win95-config.js et la CSP de vercel.json) ;
//   --force                  écrase les fichiers existants (sinon ils sont conservés).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const libRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArguments(argv) {
    const options = { dir: ".", force: false };
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === "--force") {
            options.force = true;
        } else if (argument.startsWith("--")) {
            options[argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = argv[index + 1];
            index += 1;
        }
    }
    return options;
}

const options = parseArguments(process.argv.slice(2));
const target = path.resolve(options.dir);
const toPosix = (value) => value.split(path.sep).join("/");
const libPath = (options.libPath || toPosix(path.relative(target, libRoot)) || ".").replace(/\/+$/, "");
const appName = options.name || "Mon projet Win95";
const supabaseUrl = options.supabaseUrl || "";
const report = [];

function write(relativePath, content) {
    const file = path.join(target, relativePath);
    if (fs.existsSync(file) && !options.force) {
        report.push(`  conservé  ${relativePath}`);
        return;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    report.push(`  créé      ${relativePath}`);
}

const copyFromLib = (relativePath, targetPath = relativePath) => write(targetPath, fs.readFileSync(path.join(libRoot, relativePath), "utf8"));

// --- index.html -----------------------------------------------------------------------------------------------
write("index.html", `<!DOCTYPE html>
<html lang="fr">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>${appName}</title>
    <link rel="icon" href="${libPath}/favicon.ico">
</head>

<body class="win95-desktop">
    <main class="desktop" aria-label="Bureau Windows 95">
        <section class="desktop-icons" aria-label="Icônes du bureau">
            <div class="desktop-icon" data-desktop-app="internet-explorer" title="Ouvrir Mes documents">
                <img src="${libPath}/assets/icons/directory_open_file_mydocs-4.png" alt="">
                <span>Mes documents</span>
            </div>
            <div class="desktop-icon" data-desktop-app="recycle-bin" title="Ouvrir la Corbeille">
                <img src="${libPath}/assets/icons/recycle_bin_empty-4.png" alt="">
                <span>Corbeille</span>
            </div>
        </section>
    </main>

    <footer class="taskbar" aria-label="Barre des tâches">
        <div class="taskbar-left">
            <button class="btn start-btn" type="button">
                <img src="${libPath}/assets/icons/windows-0.png" alt="">
                Démarrer
            </button>
        </div>
        <div class="tray-clock" id="tray-clock" aria-label="Heure"></div>
    </footer>

    <!-- La configuration est un FICHIER (jamais un script en ligne : la CSP de vercel.json l'interdit). -->
    <script src="win95-config.js"></script>
    <script src="${libPath}/scripts/loader.js"></script>
</body>

</html>
`);

// --- win95-config.js -----------------------------------------------------------------------------------------------
write("win95-config.js", `// Configuration de la bibliothèque Win95 pour ce projet (référence complète : ${libPath}/scripts/services/win95-config.js).
window.Win95Config = {
    appName: ${JSON.stringify(appName)},

    // Stockage des documents : "local" (navigateur, petits quotas) | "supabase" | "supabase+drive" (Google Drive via Vercel).
    storage: { provider: "local" },
    // Comptes : "local" (ce navigateur) | "supabase" (table win95_accounts).
    accounts: { provider: "local" },
    // Clé publique « anon » de Supabase (jamais la clé service_role).
    supabase: { url: ${JSON.stringify(supabaseUrl)}, anonKey: "" },

    // Scripts et styles du projet, chargés après la bibliothèque (voir LLM-GUIDE.md : API d'extension).
    plugins: [],
    // Modules de la bibliothèque à ne pas charger, ex. ["games", "accessories"].
    exclude: []
};
`);

// --- Vercel -------------------------------------------------------------------------------------------------------------
let vercelJson = fs.readFileSync(path.join(libRoot, "vercel/vercel.json"), "utf8");
if (supabaseUrl) {
    try {
        const { host } = new URL(supabaseUrl);
        // Domaine personnalisé : on l'ajoute aux sources autorisées pour les appels réseau.
        if (!/\.supabase\.co$/.test(host)) {
            vercelJson = vercelJson.replace("connect-src 'self'", `connect-src 'self' https://${host} wss://${host}`);
        }
    } catch {
        report.push("  attention : --supabase-url n'est pas une URL valide (CSP non adaptée).");
    }
}
write("vercel.json", vercelJson);
copyFromLib("vercel/api/drive.js", "api/drive.js");
copyFromLib("vercel/api/drive-auth.js", "api/drive-auth.js");
copyFromLib("vercel/.env.example", ".env.example");

// --- Supabase -------------------------------------------------------------------------------------------------------------
fs.readdirSync(path.join(libRoot, "supabase")).filter((name) => name.endsWith(".sql")).forEach((name) => copyFromLib(`supabase/${name}`));

// --- .gitignore ------------------------------------------------------------------------------------------------------------
const ignoreFile = path.join(target, ".gitignore");
const wanted = [".env", ".env.local", ".vercel/", "node_modules/"];
const current = fs.existsSync(ignoreFile) ? fs.readFileSync(ignoreFile, "utf8") : "";
const missing = wanted.filter((line) => !current.split(/\r?\n/).includes(line));
if (missing.length > 0) {
    fs.writeFileSync(ignoreFile, `${current}${current && !current.endsWith("\n") ? "\n" : ""}${missing.join("\n")}\n`);
    report.push(`  complété  .gitignore (${missing.join(", ")})`);
}

console.log(`Projet préparé dans ${target} (bibliothèque : ${libPath}/)\n${report.join("\n")}\n`);
console.log("Étapes suivantes : vercel/README.md de la bibliothèque (Supabase, Vercel, Google Drive).");
