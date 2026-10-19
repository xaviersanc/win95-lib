// Serveur de développement : `npm start`. Sert la bibliothèque (ou le dossier courant) sur le réseau local, comme le fait Expo Go :
//  - détecte l'adresse IP du poste sur le réseau (192.168.x.x…) et l'affiche ;
//  - ouvre le navigateur du PC sur http://localhost (contexte sécurisé : Web Crypto, donc comptes et connexion, n'existe pas sur
//    une adresse réseau en http) et injecte dans les pages HTML `window.Win95DevServer = { lanUrl }` : « Connexion locale » y lit
//    l'adresse à mettre dans le QR code, joignable depuis le téléphone, sans aucune configuration ;
//  - affiche dans le terminal un QR code de l'adresse (pour ouvrir le bureau sur le téléphone).
// Options : --port 8000 (si occupé, le suivant est essayé), --dir <dossier> (défaut : la racine de la bibliothèque), --no-open.
// Sans dépendance. Réservé au développement : aucune authentification, tout le dossier est servi.

import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const libRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
};
const root = path.resolve(option("--dir") || libRoot);
const startPort = Number(option("--port") ?? process.env.PORT ?? 8000);
const shouldOpen = !args.includes("--no-open");

const MIME = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".bmp": "image/bmp",
    ".ico": "image/x-icon", ".svg": "image/svg+xml", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8"
};

// Adresse du poste sur le réseau local : privée (192.168 > 10 > 172.16-31), hors cartes virtuelles (WSL, Docker, VPN, VirtualBox…).
export function findLanAddress(interfaces = os.networkInterfaces()) {
    const virtual = /vethernet|virtualbox|vmware|vbox|wsl|docker|hyper-v|loopback|tailscale|zerotier|vpn|tap/i;
    const rank = (address) => (address.startsWith("192.168.") ? 0 : address.startsWith("10.") ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(address) ? 2 : 3);
    const candidates = [];
    Object.entries(interfaces).forEach(([name, list]) => {
        (list || []).forEach((entry) => {
            if (entry.family === "IPv4" && !entry.internal && !entry.address.startsWith("169.254.") && !virtual.test(name)) {
                candidates.push({ address: entry.address, rank: rank(entry.address) });
            }
        });
    });
    candidates.sort((a, b) => a.rank - b.rank);
    return candidates[0]?.address || null;
}

// QR code pour le terminal (même encodeur que la bibliothèque), deux lignes de modules par ligne de texte, noir sur blanc quel que soit le thème.
export function terminalQr(text) {
    const sandbox = { window: {}, TextEncoder };
    vm.runInNewContext(fs.readFileSync(path.join(libRoot, "scripts/local-link/qr-code.js"), "utf8"), sandbox);
    const { modules, size } = sandbox.window.Win95QR.encode(text);
    const margin = 2;
    const dark = (x, y) => x >= 0 && y >= 0 && x < size && y < size && modules[y][x];
    const lines = [];
    for (let y = -margin; y < size + margin; y += 2) {
        let line = "";
        for (let x = -margin; x < size + margin; x += 1) {
            line += `\x1b[${dark(x, y) ? 30 : 97};${dark(x, y + 1) ? 40 : 107}m▀`;
        }
        lines.push(`${line}\x1b[0m`);
    }
    return lines.join("\n");
}

let lanUrl = null;

// Page HTML servie avec, en tête, l'adresse réseau du poste (lue par Win95LocalLink ; absente en production).
function injectDevInfo(html) {
    const script = `<script>window.Win95DevServer = ${JSON.stringify({ lanUrl })};</script>`;
    return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (tag) => `${tag}${script}`) : `${script}${html}`;
}

function handler(request, response) {
    const url = new URL(request.url, "http://localhost");
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (file !== root && !file.startsWith(root + path.sep)) {
        response.writeHead(403).end("interdit");
        return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
        file = path.join(file, "index.html");
    }
    if (!fs.existsSync(file)) {
        response.writeHead(404).end("introuvable");
        return;
    }
    const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
    if (path.extname(file).toLowerCase() === ".html") {
        response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
        response.end(injectDevInfo(fs.readFileSync(file, "utf8")));
        return;
    }
    response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(response);
}

function listen(port, attempts = 20) {
    return new Promise((resolve, reject) => {
        const server = http.createServer(handler);
        server.once("error", (error) => {
            if (error.code === "EADDRINUSE" && attempts > 0 && port > 0) {
                resolve(listen(port + 1, attempts - 1));
            } else {
                reject(error);
            }
        });
        // Toutes les interfaces : c'est ce qui rend le serveur joignable depuis le téléphone.
        server.listen(port, "0.0.0.0", () => resolve({ server, port: server.address().port }));
    });
}

function openBrowser(url) {
    const [command, commandArgs] = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
    try {
        spawn(command, commandArgs, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
    } catch {
        // Pas de navigateur à ouvrir : l'adresse est affichée.
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const { port } = await listen(startPort);
    const lan = findLanAddress();
    const local = `http://localhost:${port}/`;
    const network = lan ? `http://${lan}:${port}/` : null;
    lanUrl = network;
    console.log(`\n  Win95 lib : serveur de développement (${root})\n`);
    console.log(`  Local   : ${local}`);
    console.log(`  Réseau  : ${network || "aucune adresse réseau trouvée (Wi-Fi ou Ethernet non connecté ?)"}`);
    if (network) {
        console.log(`\n${terminalQr(network).split("\n").map((line) => `  ${line}`).join("\n")}\n`);
        console.log("  Sur l'ordinateur, travaillez sur l'adresse Local (les comptes exigent localhost ou HTTPS).");
        console.log("  « Connexion locale » y affiche un QR code qui pointe déjà vers l'adresse Réseau ; scannez-le avec le téléphone (même Wi-Fi).");
        console.log("  Si le téléphone n'arrive pas à charger la page : autoriser Node dans le pare-feu Windows (réseau privé).");
    }
    console.log("\n  Ctrl+C pour arrêter.\n");
    if (shouldOpen) {
        openBrowser(local);
    }
}
