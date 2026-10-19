#!/usr/bin/env node
// Copie les fichiers d'exécution de la bibliothèque dans un dossier (instantané « vendor » sans sous-module git).
//   node tools/export.mjs --target ../MonProjet/vendor/win95-lib [--clean]
// Copie : assets/, scripts/, supabase/, vercel/, tools/, favicon.ico, LICENSE, package.json et les guides (README, INTEGRATION, CHANGELOG, LLM-GUIDE, charte).
// Ne copie jamais tests/, node_modules/, .git/ ni index.html (page de démonstration). --clean vide d'abord le dossier cible
// (les fichiers retirés de la bibliothèque disparaissent aussi du projet).
// Un sous-module git (`git submodule add <url-du-depot> vendor/win95-lib`) reste la méthode recommandée : cet outil sert à
// essayer la bibliothèque avant de la publier, ou quand les sous-modules sont impossibles.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const libRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const targetIndex = args.indexOf("--target");
if (targetIndex < 0 || !args[targetIndex + 1]) {
    console.error("Usage : node tools/export.mjs --target <dossier> [--clean]");
    process.exit(1);
}
const target = path.resolve(args[targetIndex + 1]);
if (target === libRoot || target.startsWith(libRoot + path.sep)) {
    console.error("Le dossier cible ne peut pas être dans la bibliothèque.");
    process.exit(1);
}

const INCLUDED = ["assets", "scripts", "supabase", "vercel", "tools", "favicon.ico", "LICENSE", "package.json", "README.md", "INTEGRATION.md", "CHANGELOG.md", "LLM-GUIDE.md", "charte-graphique.md"];
if (args.includes("--clean")) {
    fs.rmSync(target, { recursive: true, force: true });
}
fs.mkdirSync(target, { recursive: true });
let count = 0;
for (const entry of INCLUDED) {
    const source = path.join(libRoot, entry);
    if (fs.existsSync(source)) {
        fs.cpSync(source, path.join(target, entry), { recursive: true, filter: (file) => !/[\\/](node_modules|\.git)([\\/]|$)/.test(file), force: true });
        count += 1;
    }
}
const version = JSON.parse(fs.readFileSync(path.join(libRoot, "package.json"), "utf8")).version;
console.log(`Bibliothèque Win95 ${version} copiée dans ${target} (${count} éléments).`);
