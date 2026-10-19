// Tests de la bibliothèque : `npm test` (navigateur piloté par playwright-core ; Edge ou Chrome installé, sinon WIN95_BROWSER=chrome|msedge).
// Sans dépendance de test : un serveur statique, un navigateur par test, zéro erreur console exigée (sauf test déclarant allowErrors).
// Ils constituent le CONTRAT de la bibliothèque : un projet qui l'utilise peut s'y fier ; un test rouge = changement incompatible.

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".bmp": "image/bmp", ".ico": "image/x-icon", ".wav": "audio/wav" };
const only = process.argv[2] || "";

const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    // La bibliothèque est aussi servie sous /vendor/win95-lib/ : un projet qui l'utilise comme dépendance (sous-module).
    const pathname = decodeURIComponent(url.pathname).replace(/^\/vendor\/win95-lib\//, "/");
    const file = path.join(root, pathname);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        response.writeHead(404).end("not found");
        return;
    }
    response.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(response);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

async function launch() {
    const channels = process.env.WIN95_BROWSER ? [process.env.WIN95_BROWSER] : ["msedge", "chrome"];
    for (const channel of channels) {
        try {
            return await chromium.launch({ channel, headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
        } catch {
            // canal suivant
        }
    }
    throw new Error("Aucun navigateur trouvé : installer Edge ou Chrome, ou définir WIN95_BROWSER.");
}

const browser = await launch();
const tests = [];
const test = (name, options, fn) => tests.push({ name, options: typeof options === "function" ? {} : options, fn: typeof options === "function" ? options : fn });
const assert = (condition, message) => {
    if (!condition) {
        throw new Error(message);
    }
};
const equal = (actual, expected, message) => assert(JSON.stringify(actual) === JSON.stringify(expected), `${message} : attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)}`);

const mockSupabase = fs.readFileSync(path.join(root, "tests/mocks/supabase-mock.js"), "utf8");

// Ouvre la page avec une configuration (et éventuellement le faux Supabase) injectées avant la bibliothèque.
async function open(page, { config = {}, mock = false, quotaBytes = 0, query = "?noboot", fetchStub = null } = {}) {
    await page.addInitScript(({ configJson, mockSource, quota, stub }) => {
        window.Win95Config = JSON.parse(configJson);
        if (quota) {
            window.__mockQuotaBytes = quota;
        }
        if (mockSource) {
            // eslint-disable-next-line no-new-func
            new Function(mockSource)();
        }
        if (stub) {
            // eslint-disable-next-line no-new-func
            new Function(stub)();
        }
    }, { configJson: JSON.stringify(config), mockSource: mock ? mockSupabase : "", quota: quotaBytes, stub: fetchStub });
    await page.goto(`${origin}/index.html${query}`);
    await page.waitForSelector(".security-screen");
}

async function createAdmin(page, name = "Boss", password = "secret1") {
    await page.fill("[name=name]", name);
    await page.fill("[name=password]", password);
    await page.fill("[name=confirm]", password);
    await page.click(".security-submit");
    await page.waitForSelector(".security-screen", { state: "detached" });
    await page.waitForFunction(() => window.Win95WindowManager && window.Win95Security?.getCurrentUser());
}

// --- 1. Moteurs (règles sans interface) --------------------------------------------------------------------

test("moteurs : calculatrice, démineur, solitaire, FreeCell n° 1, Cœurs", async (page) => {
    await open(page);
    await createAdmin(page);
    const r = await page.evaluate(() => {
        const out = {};
        const calc = new window.Win95Calculator.Engine();
        const press = (keys) => keys.forEach((k) => (/^\d$/.test(k) ? calc.digit(k) : k === "=" ? calc.equals() : calc.operate(k)));
        press(["2", "+", "3", "*", "4", "="]); out.calc = calc.getDisplay();
        calc.clear(); press(["1", "/", "0", "="]); out.div0 = calc.getDisplay();
        calc.clear(); press(["2", "0", "0", "+", "1", "0"]); calc.percent(); out.percent = calc.getDisplay();
        let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        const ms = new window.Win95Minesweeper.Engine(9, 9, 10, rnd); ms.reveal(4, 4);
        out.msSafe = !ms.cell(4, 4).mine;
        ms.cells.forEach((c, i) => { if (!c.mine) ms.reveal(i % 9, Math.floor(i / 9)); });
        out.msWon = ms.status;
        const sol = new window.Win95Solitaire.Engine({ drawCount: 3 });
        out.sol = [sol.tableau.map((p) => p.length).join(","), sol.stock.length, new Set([...sol.stock, ...sol.tableau.flat()].map((c) => c.id)).size];
        sol.drawStock(); out.solUndo = sol.undo() && sol.stock.length === 24;
        const fc = new window.Win95FreeCell.Engine(1);
        const label = (card) => "A23456789TJQK"[card.rank - 1] + "CDHS"[card.suit];
        out.fc = fc.cascades[0].map(label).join(" ");
        let illegal = 0; let hands = 0;
        for (let g = 0; g < 10; g += 1) {
            const e = new window.Win95Hearts.Engine();
            let guard = 0;
            while (e.phase !== "gameOver" && guard < 200) {
                guard += 1;
                if (e.phase === "passing") { e.submitPass(e.aiChoosePass(0)); }
                let turns = 0;
                while (e.phase === "playing" && turns < 100) {
                    turns += 1;
                    if (e.trickComplete) { e.collectTrick(); continue; }
                    const card = e.aiChoosePlay(e.turn);
                    if (!e.legalPlays(e.turn).some((c) => c.id === card.id) || !e.play(e.turn, card)) { illegal += 1; break; }
                }
                hands += 1;
                const total = e.handScores.reduce((a, b) => a + b, 0);
                if (total !== 26 && total !== 78) { illegal += 1; }
                if (e.phase === "handOver") { e.nextHand(); }
            }
        }
        out.hearts = { illegal, hands: hands > 0 };
        return out;
    });
    equal(r.calc, "20", "2 + 3 × 4");
    equal(r.div0, "Division par zéro impossible", "division par zéro");
    equal(r.percent, "20", "200 + 10 %");
    assert(r.msSafe && r.msWon === "won", "Démineur : premier clic sûr et victoire");
    equal(r.sol, ["1,2,3,4,5,6,7", 24, 52], "Solitaire : donne");
    assert(r.solUndo, "Solitaire : annuler");
    equal(r.fc, "JD KD 2S 4C 3S 6D 6S", "FreeCell : donne n° 1");
    equal(r.hearts, { illegal: 0, hands: true }, "Cœurs : parties complètes sans coup illégal");
});

// --- 2. Session, comptes, droits ----------------------------------------------------------------------------

test("session : création de l'administrateur, comptes, droits par application", async (page) => {
    await open(page);
    await page.fill("[name=name]", "Boss"); await page.fill("[name=password]", "secret1"); await page.fill("[name=confirm]", "autre");
    await page.click(".security-submit");
    await page.waitForFunction(() => document.querySelector(".security-error").textContent.length > 0);
    await createAdmin(page);
    const created = await page.evaluate(async () => (await window.Win95Accounts.create({ name: "Alice", password: "alicepw", role: "user", allowedApps: ["internet-explorer", "notepad"] })).ok);
    assert(created, "création d'un compte");
    await page.evaluate(() => window.Win95Security.logout());
    await page.waitForSelector(".security-screen");
    await page.fill("[name=name]", "alice"); await page.fill("[name=password]", "mauvais"); await page.click(".security-submit");
    await page.waitForFunction(() => document.querySelector(".security-error").textContent.length > 0);
    await page.fill("[name=password]", "alicepw"); await page.click(".security-submit");
    await page.waitForSelector(".security-screen", { state: "detached" });
    const access = await page.evaluate(() => ({
        notepad: window.Win95Security.canOpenApp("notepad"), paint: window.Win95Security.canOpenApp("paint"),
        admin: window.Win95Security.canOpenApp("user-manager"), opened: Boolean(window.Win95WindowManager.openApp("user-manager"))
    }));
    equal(access, { notepad: true, paint: false, admin: false, opened: false }, "droits du compte Alice");
    await page.reload(); await page.waitForTimeout(800);
    equal(await page.evaluate(() => window.Win95Security.getCurrentUser()?.userName), "Alice", "session conservée au rechargement");
});

// --- 3. Stockage local --------------------------------------------------------------------------------------

test("stockage local : dossiers, import, Corbeille, quota, texte", async (page) => {
    await open(page, { config: { storage: { local: { quotaMb: 0.002, maxFileMb: 0.001 } } } });
    await createAdmin(page);
    const r = await page.evaluate(async () => {
        const files = window.Win95UserFiles;
        const out = { backend: window.Win95Storage.getBackend().name };
        await files.load();
        out.folder = (await files.createFolder(null, "Docs")).ok;
        const folderId = files.buildTree("r", "r").children[0].fileId;
        const small = new File(["hello"], "a.txt", { type: "text/plain" });
        const big = new File([new Uint8Array(1500)], "gros.bin");
        const up = await files.uploadFiles(folderId, [small, big]);
        out.upload = [up.uploaded.length, /trop volumineux/.test(up.message)];
        const fileId = up.uploaded[0].id;
        out.read = await files.readText(fileId);
        out.save = (await files.saveTextContent(fileId, "bonjour")).ok;
        out.readAfter = await files.readText(fileId);
        out.trash = (await files.trash(folderId)).ok;
        out.trashed = files.getTrashedFiles().length;
        out.restore = (await files.restore(folderId)).ok;
        await files.trash(folderId);
        out.empty = (await files.emptyTrash()).ok;
        out.rowsAfter = files.buildTree("r", "r").children.length;
        const text = await files.createTextFile(null, "note", "x".repeat(1200));
        const text2 = await files.createTextFile(null, "note2", "y".repeat(1200));
        out.quota = [text.ok, /Quota/.test(text2.message || "")];
        out.label = files.getUsageLabel();
        return out;
    });
    equal(r.backend, "local", "fournisseur");
    assert(r.folder, "création de dossier");
    equal(r.upload, [1, true], "import : petit fichier accepté, gros refusé");
    equal([r.read, r.readAfter], ["hello", "bonjour"], "lecture / enregistrement");
    equal([r.trash, r.trashed, r.restore, r.empty, r.rowsAfter], [true, 1, true, true, 0], "Corbeille");
    equal(r.quota, [true, true], "quota");
});

// --- 4. Supabase (faux client) + comptes Supabase ----------------------------------------------------------------

const SUPABASE_CONFIG = { storage: { provider: "supabase", supabase: { quotaMb: 0.003 } }, accounts: { provider: "supabase" }, supabase: { url: "https://mock.supabase.co", anonKey: "anon" } };

test("Supabase (faux client) : comptes, arborescence, bucket, quota", async (page) => {
    await open(page, { config: SUPABASE_CONFIG, mock: true, quotaBytes: 3 * 1048 });
    await createAdmin(page);
    const r = await page.evaluate(async () => {
        const db = window.__mockSupabase.db;
        const out = { backend: window.Win95Storage.getBackend().name, provider: window.Win95Accounts.getProviderName(), accounts: db.tables.win95_accounts.length };
        out.accountRow = Object.keys(db.tables.win95_accounts[0]).sort().join(",");
        const files = window.Win95UserFiles;
        await files.load();
        await files.createFolder(null, "Sync");
        const folderId = files.buildTree("r", "r").children[0].fileId;
        const up = await files.uploadFiles(folderId, [new File(["contenu"], "t.txt", { type: "text/plain" })]);
        out.rows = db.tables.user_files.length;
        out.owner = db.tables.user_files[0].owner === window.Win95Utils.getCurrentUserId();
        out.bucket = [...db.buckets["user-files"].keys()].length;
        out.text = await files.readText(up.uploaded[0].id);
        const urls = await files.getSignedUrls([up.uploaded[0].id]);
        out.url = /^blob:/.test(urls.get(up.uploaded[0].id));
        await files.trash(folderId);
        await files.emptyTrash();
        out.afterEmpty = [db.tables.user_files.length, db.buckets["user-files"].size];
        const big = await files.createTextFile(null, "gros", "z".repeat(4000));
        out.quota = [big.ok, big.message];
        const dup1 = await files.createFolder(null, "Meme");
        const dup2 = await files.createFolder(null, "Meme");
        out.dupNames = [dup1.folder.name, dup2.folder.name];
        return out;
    });
    equal([r.backend, r.provider], ["supabase", "supabase"], "fournisseurs");
    equal(r.accounts, 1, "compte écrit dans la table win95_accounts");
    assert(["allowed_apps", "created_at", "hash", "id", "name", "role", "salt"].every((column) => r.accountRow.includes(column)), "colonnes du compte");
    equal([r.rows, r.owner, r.bucket], [2, true, 1], "ligne(s), propriétaire et contenu dans le bucket");
    equal([r.text, r.url], ["contenu", true], "lecture");
    equal(r.afterEmpty, [0, 0], "Corbeille vidée : lignes et contenu supprimés");
    assert(r.quota[0] === false && /Quota/.test(r.quota[1]), `quota refusé par le serveur (${r.quota[1]})`);
    equal(r.dupNames, ["Meme", "Meme (2)"], "noms uniques");
});

test("Supabase+Drive (faux client, fonctions Vercel simulées) : références drive:, lien public, suppression", async (page) => {
    const stub = `
        window.__driveCalls = [];
        const realFetch = window.fetch.bind(window);
        window.fetch = async (input, init = {}) => {
            const url = String(input);
            if (!url.startsWith("/api/drive") && !url.includes("/api/drive")) { return realFetch(input, init); }
            const action = new URL(url, location.href).searchParams.get("action");
            window.__driveCalls.push({ action, headers: init.headers || {} });
            const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
            if (action === "status") { return json({ configured: true }); }
            if (action === "start") { return json({ session: "https://www.googleapis.com/upload/drive/v3/files?upload_id=abc" }); }
            if (action === "chunk") { return json({ done: true, fileId: "DRIVEFILEID0001" }); }
            if (action === "delete") { return json({ deleted: 1 }); }
            if (action === "text") { return new Response("texte drive", { status: 200 }); }
            return json({});
        };`;
    await open(page, { config: { ...SUPABASE_CONFIG, storage: { provider: "supabase+drive" } }, mock: true, fetchStub: stub });
    await createAdmin(page);
    const r = await page.evaluate(async () => {
        const files = window.Win95UserFiles;
        await files.load();
        const backend = window.Win95Storage.getBackend();
        const out = { content: backend.contentProvider, quota: files.getQuota() };
        const up = await files.uploadFiles(null, [new File(["x"], "photo.png", { type: "image/png" })]);
        const row = window.__mockSupabase.db.tables.user_files[0];
        out.ref = row.storage_path;
        out.bucketEmpty = (window.__mockSupabase.db.buckets["user-files"]?.size || 0) === 0;
        const urls = await files.getSignedUrls([up.uploaded[0].id]);
        out.url = urls.get(up.uploaded[0].id);
        out.text = await files.readText(up.uploaded[0].id);
        await files.trash(up.uploaded[0].id);
        await files.emptyTrash();
        out.calls = window.__driveCalls.map((call) => call.action);
        out.headers = Object.keys(window.__driveCalls.find((call) => call.action === "start").headers).sort();
        return out;
    });
    equal([r.content, r.ref, r.bucketEmpty], ["drive", "drive:DRIVEFILEID0001", true], "contenu envoyé à Drive, rien dans le bucket");
    assert(r.quota >= 1024 * 1024 * 1024, "quota Drive (1 Go)");
    assert(/lh3\.googleusercontent\.com\/d\/DRIVEFILEID0001/.test(r.url), "lien public d'image");
    equal(r.text, "texte drive", "lecture texte par la fonction");
    assert(["status", "start", "chunk", "text", "delete"].every((action) => r.calls.includes(action)), `appels Drive : ${r.calls}`);
    assert(r.headers.includes("X-Win95-User") && r.headers.includes("X-Win95-Key"), "en-têtes d'identification");
});

test("repli : Supabase demandé mais non configuré -> stockage local avec message", async (page) => {
    await open(page, { config: { storage: { provider: "supabase" }, accounts: { provider: "supabase" } } });
    await createAdmin(page);
    const r = await page.evaluate(async () => {
        await window.Win95UserFiles.load();
        return { backend: window.Win95Storage.getBackend().name, notice: window.Win95UserFiles.getStatus().notice, accounts: window.Win95Accounts.getProviderName() };
    });
    equal([r.backend, r.accounts], ["local", "local"], "repli sur le local");
    assert(/Supabase/.test(r.notice), "message de repli");
}, );

// --- 5. API d'extension ----------------------------------------------------------------------------------------

test("API d'extension : application, menu Démarrer, icône, Corbeille, raccourcis, menus", { allowErrors: false }, async (page) => {
    await open(page, { config: { plugins: ["tests/fixtures/plugin.js"] } });
    await createAdmin(page);
    await page.waitForFunction(() => window.__plugin?.ready === true);
    const r = await page.evaluate(async () => {
        const manager = window.Win95WindowManager;
        const out = {};
        out.def = manager.windowDefinitions.hello?.label;
        out.menu = Boolean(document.querySelector(".start-menu [data-app-name='hello']"));
        out.group = Array.from(document.querySelectorAll(".start-menu .start-menu-item.has-submenu span")).map((s) => s.textContent).filter((t) => t === "Plugin").length;
        out.icon = Boolean(document.querySelector(".desktop-icon[data-desktop-app='hello']"));
        const win = manager.openApp("hello");
        out.opened = win?.querySelector("[data-app-body]")?.textContent;
        out.recycle = (await manager.moveToRecycleBin({ kind: "plugin-item", name: "obj" })).message;
        out.restore = (await manager.restoreRecycleBinItem({ kind: "plugin-item", label: "obj" })).message;
        out.recycled = window.__plugin.recycled?.name;
        out.removable = window.Win95Programs.PROGRAMS.some((p) => p.key === "hello");
        window.Win95Programs.remove("hello");
        out.hidden = window.Win95Security.canOpenApp("hello");
        window.Win95Programs.install("hello");
        return out;
    });
    equal([r.def, r.menu, r.group, r.icon, r.opened], ["Bonjour", true, 1, true, "Bonjour plugin"], "application enregistrée");
    equal([r.recycle, r.restore, r.recycled], ["plugin: mis à la corbeille", "plugin: restauré", "obj"], "fournisseur de Corbeille");
    equal([r.removable, r.hidden], [true, false], "programme supprimable puis refusé");
    await page.click("[data-desktop-app='hello']", { button: "right" });
    equal(await page.locator(".win95-context-item").allTextContents(), ["Menu du plugin"], "menu contextuel du plugin");
    await page.keyboard.press("Escape");
    await page.evaluate(async () => {
        await window.Win95UserFiles.load();
        await window.Win95UserFiles.createTextFile(null, "essai", "x");
        window.Win95WindowManager.openApp("internet-explorer");
    });
    await page.waitForSelector(".list-item[data-name='essai.md']");
    await page.click(".list-item[data-name='essai.md']", { button: "right" });
    assert((await page.locator(".win95-context-item").allTextContents()).includes("Plugin : essai.md"), "contributeur de menu de l'explorateur");
});

test("espace d'explorateur partagé : suppression définitive, pas de raccourcis", async (page) => {
    await open(page);
    await createAdmin(page);
    const r = await page.evaluate(async () => {
        const shared = window.Win95UserFiles.create({ getOwner: () => "_partage", changeEvent: "win95:shared-files-changed", shared: true });
        window.Win95FileExplorer.registerSpace("shared", { files: shared, shared: true, rootLabel: "\\\\serveur\\Partage" });
        await shared.load();
        await shared.createTextFile(null, "commun", "x");
        const win = window.Win95WindowManager.openApp("internet-explorer", { forceNew: true });
        const explorer = window.Win95WindowManager.createExplorerWindow("internet-explorer", { title: "Partagés", ariaLabel: "Partagés", space: "shared", rootName: "Documents partagés", rootPath: shared.getRootPath(), addressValue: "x" });
        window.Win95WindowManager.showWindow(explorer);
        await new Promise((resolve) => setTimeout(resolve, 500));
        const instance = explorer.__win95FileExplorerInstance;
        return { shared: instance.isShared, shortcuts: instance.canHostShortcuts(), canWrite: instance.canWrite(), label: instance.getRootPathLabel(), rows: shared.buildTree("a", "b").children.length, win: Boolean(win) };
    });
    equal([r.shared, r.shortcuts, r.canWrite, r.rows], [true, false, true, 1], "espace partagé");
    assert(r.label.includes("serveur"), "chemin affiché de l'espace");
});

// --- 5 bis. La bibliothèque comme dépendance (projet consommateur) ----------------------------------------------------------

test("dépendance : un projet charge la bibliothèque depuis vendor/win95-lib/ (ressources, plugin, icônes du projet)", async (page) => {
    await page.goto(`${origin}/tests/fixtures/consumer/index.html?noboot`);
    await page.waitForSelector(".security-screen");
    await createAdmin(page);
    await page.waitForFunction(() => window.__consumerReady === true);
    const r = await page.evaluate(() => {
        const icons = Array.from(document.querySelectorAll(".start-menu img, .desktop-icon img")).map((image) => image.getAttribute("src"));
        window.Win95WindowManager.openApp("projet");
        window.Win95WindowManager.openApp("calculator");
        return {
            libPath: window.Win95Loader.libPath,
            libIcon: icons.some((src) => src.startsWith("/vendor/win95-lib/assets/icons/")),
            ownIcon: icons.some((src) => src === "assets/own.png"),
            taskIcons: Array.from(document.querySelectorAll(".task-btn img")).map((image) => image.getAttribute("src")),
            opened: document.querySelector("[data-window-app='projet'] [data-app-body]")?.textContent
        };
    });
    equal(r.libPath, "/vendor/win95-lib/", "dossier de la bibliothèque détecté");
    assert(r.libIcon && r.ownIcon, "icônes de la bibliothèque (préfixées) et du projet (telles quelles)");
    equal(r.opened, "Application du projet", "application du projet");
    assert(r.taskIcons.includes("assets/own.png") && r.taskIcons.some((src) => src.startsWith("/vendor/win95-lib/")), "boutons de la barre des tâches");
    await page.waitForTimeout(500);
});

test("outil init-project : projet généré -> page fonctionnelle, vercel.json, api, SQL", async (page) => {
    const { execFileSync } = await import("node:child_process");
    const directory = path.join(root, "tests/.tmp/projet");
    fs.rmSync(path.join(root, "tests/.tmp"), { recursive: true, force: true });
    try {
        execFileSync(process.execPath, [path.join(root, "tools/init-project.mjs"), "--dir", directory, "--name", "Essai", "--supabase-url", "https://mon-domaine.example.org"], { stdio: "pipe" });
        const files = ["index.html", "win95-config.js", "vercel.json", "api/drive.js", "api/drive-auth.js", ".env.example", "supabase/01-accounts.sql", "supabase/02-user-files.sql", "supabase/03-drive-storage.sql", ".gitignore"];
        files.forEach((file) => assert(fs.existsSync(path.join(directory, file)), `fichier généré : ${file}`));
        assert(JSON.parse(fs.readFileSync(path.join(directory, "vercel.json"), "utf8")).headers[0].headers[0].value.includes("https://mon-domaine.example.org"), "CSP adaptée au domaine Supabase");
        // Seconde exécution : rien n'est écrasé.
        const second = execFileSync(process.execPath, [path.join(root, "tools/init-project.mjs"), "--dir", directory], { stdio: "pipe" }).toString();
        assert(second.includes("conservé  index.html"), "fichiers existants conservés");
        await page.goto(`${origin}/tests/.tmp/projet/index.html?noboot`);
        await page.waitForSelector(".security-screen");
        await createAdmin(page);
        assert(await page.evaluate(() => Boolean(window.Win95WindowManager.openApp("calculator"))), "la page générée fonctionne");
        assert((await page.title()) === "Essai", "titre de la page");
    } finally {
        fs.rmSync(path.join(root, "tests/.tmp"), { recursive: true, force: true });
    }
});

test("fonctions Vercel Google Drive : refus sans identification, flux d'envoi, propriété des fichiers", async () => {
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    Object.assign(process.env, { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret", GOOGLE_REFRESH_TOKEN: "refresh", SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon", WIN95_APP_NAME: "Test" });
    const calls = [];
    const hash = "a".repeat(64);
    const folders = { "Test - Mes documents": "ROOTFOLDER000001", alice: "ALICEFOLDER00001", "Documents partagés": "SHAREDFOLDER0001" };
    globalThis.fetch = async (url, init = {}) => {
        const address = String(url);
        calls.push(`${init.method || "GET"} ${address.split("?")[0].replace("https://", "")}`);
        const json = (body, status = 200, headers = {}) => ({ ok: status < 400, status, headers: { get: (name) => headers[name.toLowerCase()] || null }, json: async () => body, arrayBuffer: async () => Buffer.from("contenu") });
        if (address.includes("oauth2.googleapis.com")) { return json({ access_token: "token", expires_in: 3600 }); }
        if (address.includes("/rest/v1/win95_accounts")) { return json(address.includes("id=eq.alice") ? [{ hash }] : []); }
        if (address.includes("drive/v3/files?q=")) {
            const name = decodeURIComponent(address).match(/name='([^']+)'/)?.[1];
            return json({ files: folders[name] ? [{ id: folders[name] }] : [] });
        }
        if (address.includes("uploadType=resumable")) { return json({}, 200, { location: "https://www.googleapis.com/upload/drive/v3/files?upload_id=SESSION" }); }
        if (address.includes("upload_id=SESSION")) { return json({ id: "NEWFILEID000001" }); }
        if (address.includes("/permissions")) { return json({}); }
        if (address.includes("?fields=parents")) { return json({ parents: address.includes("OWNFILE") ? [folders.alice] : ["SOMEONEELSE00001"] }); }
        return json({});
    };
    const drive = require(path.join(root, "vercel/api/drive.js"));
    const run = async ({ method = "GET", query = {}, headers = {}, body } = {}) => {
        const response = { statusCode: 0, headers: {}, payload: null };
        const res = { status(code) { response.statusCode = code; return this; }, setHeader(name, value) { response.headers[name] = value; return this; }, json(data) { response.payload = data; return this; }, send(data) { response.payload = data; return this; } };
        await drive({ method, query, headers: { "x-forwarded-for": "9.9.9.9", ...headers }, body }, res);
        return response;
    };
    equal((await run({ query: { action: "status" } })).payload, { configured: true }, "status");
    equal((await run({ query: { action: "start" }, method: "POST", body: {} })).statusCode, 401, "sans identification : 401");
    equal((await run({ query: { action: "start" }, method: "POST", headers: { "x-win95-user": "alice", "x-win95-key": "b".repeat(64) }, body: {} })).statusCode, 401, "mauvaise empreinte : 401");
    const auth = { "x-win95-user": "alice", "x-win95-key": hash };
    const start = await run({ query: { action: "start" }, method: "POST", headers: auth, body: { name: "a.txt", mimeType: "text/plain", size: 7 } });
    assert(start.statusCode === 200 && start.payload.session.includes("upload_id=SESSION"), "début d'envoi");
    const chunk = await run({ query: { action: "chunk", session: start.payload.session }, method: "PUT", headers: { ...auth, "x-content-range": "bytes 0-6/7" }, body: Buffer.from("contenu") });
    equal(chunk.payload, { done: true, fileId: "NEWFILEID000001" }, "dernier morceau : fichier créé");
    equal((await run({ query: { action: "start" }, method: "POST", headers: auth, body: { name: "x", size: 999 * 1048576 } })).statusCode, 413, "fichier trop volumineux");
    equal((await run({ query: { action: "delete" }, method: "POST", headers: auth, body: { fileIds: ["OWNFILE0000001", "OTHERFILE00001"] } })).payload, { deleted: 1 }, "seul le fichier du compte est supprimé");
    equal((await run({ query: { action: "text", id: "OTHERFILE00001" }, headers: auth })).statusCode, 403, "lecture d'un fichier d'autrui refusée");
    assert(calls.some((call) => call.startsWith("DELETE")), "suppression Drive effectuée");
});

test("chargeur : plugin inséré AVANT un module (before) et attributs de balise", async (page) => {
    await open(page, { config: { plugins: [{ src: "tests/fixtures/before-plugin.js", before: "explorer" }, { src: "tests/fixtures/plugin.js" }] } });
    await createAdmin(page);
    await page.waitForFunction(() => window.__plugin?.ready === true);
    const r = await page.evaluate(() => ({ seen: window.__beforeSeen, userFiles: typeof window.__beforeUserFiles, explorerAfter: typeof window.Win95FileExplorer, hello: Boolean(window.Win95WindowManager.windowDefinitions.hello) }));
    equal(r.seen, { paint: "object", explorer: "undefined", windowManager: "undefined", utils: "object" }, "position du plugin dans l'ordre de chargement");
    equal([r.explorerAfter, r.hello], ["object", true], "l'explorateur est chargé après le plugin, le plugin normal après tout");
});

test("version : LIB_VERSION du chargeur = package.json = CHANGELOG", async () => {
    const loader = fs.readFileSync(path.join(root, "scripts/loader.js"), "utf8");
    const version = /LIB_VERSION = "([^"]+)"/.exec(loader)?.[1];
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
    equal(version, pkg, "version du chargeur et de package.json");
    assert(fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8").includes(`## ${pkg} `), `CHANGELOG.md décrit la version ${pkg}`);
});

// --- 6. Chargeur ------------------------------------------------------------------------------------------------

test("chargeur : exclusion de modules et de fichiers", async (page) => {
    await open(page, { config: { exclude: ["games", "calculator-component.js"] } });
    await createAdmin(page);
    const r = await page.evaluate(() => ({
        games: typeof window.Win95Minesweeper, calc: typeof window.Win95Calculator, charmap: typeof window.Win95CharMap,
        refused: window.Win95Security.canOpenApp("hearts"), allowed: window.Win95Security.canOpenApp("charmap"),
        menu: Boolean(document.querySelector(".start-menu [data-app-name='hearts']") && document.querySelector(".start-menu [data-app-name='hearts']").style.display !== "none"),
        listed: window.Win95Programs.available().some((p) => p.key === "hearts")
    }));
    equal([r.games, r.calc, r.charmap], ["undefined", "undefined", "object"], "scripts exclus");
    equal([r.refused, r.allowed, r.menu, r.listed], [false, true, false, false], "applications exclues : refusées et masquées");
});

// --- 7. Applications --------------------------------------------------------------------------------------------

test("toutes les applications s'ouvrent et se ferment sans erreur", async (page) => {
    await open(page);
    await createAdmin(page);
    const apps = await page.evaluate(() => Object.keys(window.Win95WindowManager.windowDefinitions));
    for (const app of apps) {
        const opened = await page.evaluate((key) => Boolean(window.Win95WindowManager.openApp(key)), app);
        assert(opened, `ouverture de ${app}`);
        await page.waitForTimeout(120);
        await page.evaluate((key) => document.querySelectorAll(`[data-window-app='${key}']`).forEach((el) => window.Win95WindowManager.closeWindow(el, { force: true })), app);
    }
    equal(await page.evaluate(() => window.Win95WindowManager.windows.length), 0, "toutes les fenêtres sont fermées");
});

test("lecteur multimédia : ouverture, lecture, pause, pistes", async (page) => {
    await open(page);
    await createAdmin(page);
    const wav = (seconds, freq) => {
        const rate = 8000; const samples = rate * seconds; const buffer = Buffer.alloc(44 + samples * 2);
        buffer.write("RIFF", 0); buffer.writeUInt32LE(36 + samples * 2, 4); buffer.write("WAVEfmt ", 8); buffer.writeUInt32LE(16, 16);
        buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28);
        buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write("data", 36); buffer.writeUInt32LE(samples * 2, 40);
        for (let i = 0; i < samples; i += 1) { buffer.writeInt16LE(Math.round(6000 * Math.sin((2 * Math.PI * freq * i) / rate)), 44 + i * 2); }
        return buffer;
    };
    await page.evaluate(() => window.Win95WindowManager.openApp("audio-player"));
    const player = page.locator("[data-window-app='audio-player']");
    await player.locator(".win95-menubar-item", { hasText: "Fichier" }).click();
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator(".win95-context-item", { hasText: "Ouvrir…" }).click()]);
    await chooser.setFiles([{ name: "Artiste - Un.wav", mimeType: "audio/wav", buffer: wav(3, 440) }, { name: "Artiste - Deux.wav", mimeType: "audio/wav", buffer: wav(2, 660) }]);
    await page.waitForTimeout(1500);
    equal(await player.locator(".mp-row").count(), 2, "deux pistes");
    assert((await player.locator("[data-mp-status]").textContent()).startsWith("Lecture"), "lecture automatique");
    await player.locator("[data-mp-action='pause']").click();
    await page.waitForTimeout(300);
    assert((await player.locator("[data-mp-status]").textContent()).startsWith("En pause"), "pause");
    await player.locator("[data-mp-action='next']").click();
    await page.waitForTimeout(300);
    equal(await player.locator("[data-mp-title]").textContent(), "Deux", "piste suivante");
});

// --- 8. Ambiance, clic droit -------------------------------------------------------------------------------------

test("ambiance : clic droit bloqué, Ctrl+Alt+Suppr, écran bleu, écran de veille", async (page) => {
    await open(page);
    await createAdmin(page);
    const prevented = await page.evaluate(() => {
        const results = {};
        const input = document.createElement("input"); document.body.appendChild(input);
        [["body", document.body], ["input", input]].forEach(([name, element]) => {
            const handler = (event) => { results[name] = event.defaultPrevented; };
            document.addEventListener("contextmenu", handler);
            element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
            document.removeEventListener("contextmenu", handler);
        });
        input.remove();
        return results;
    });
    equal(prevented, { body: true, input: false }, "menu natif bloqué sauf zones de saisie");
    await page.mouse.click(700, 400, { button: "right" });
    equal(await page.locator(".win95-context-item").allTextContents(), ["Aligner les icônes", "Actualiser", "Propriétés"], "menu du bureau");
    await page.keyboard.press("Escape");
    await page.evaluate(() => window.Win95WindowManager.openApp("notepad"));
    await page.keyboard.press("Control+Alt+Delete");
    await page.waitForSelector(".closeprog");
    await page.click(".closeprog-item:has-text('WordPad')");
    await page.click("[data-closeprog-end]");
    await page.waitForTimeout(300);
    equal(await page.evaluate(() => window.Win95WindowManager.windows.length), 0, "Fin de tâche ferme la fenêtre");
    await page.evaluate(() => window.Win95CloseProgram.close());
    await page.evaluate(() => window.Win95BlueScreen.show({ code: "0E" }));
    await page.waitForSelector(".bluescreen");
    await page.keyboard.press("x");
    await page.waitForSelector(".bluescreen", { state: "detached" });
    await page.evaluate(() => window.Win95ScreenSaver.save({ saver: "stars", waitSeconds: 5 }));
    await page.waitForFunction(() => window.Win95ScreenSaver.isActive(), null, { timeout: 15000 });
    await page.waitForTimeout(700);
    await page.keyboard.press("a");
    await page.waitForFunction(() => !window.Win95ScreenSaver.isActive());
});

// --- 8. Connexion locale (téléphone) ------------------------------------------------------------------------

test("QR code : structure normalisée (viseurs, synchronisation, format), capacité, relecture si le navigateur sait lire un QR code", async (page) => {
    await open(page);
    await createAdmin(page);
    const r = await page.evaluate(async () => {
        const out = { versions: [], structure: [], format: [], tooLong: null, deterministic: null, decoded: "indisponible" };
        const texts = ["a", "a".repeat(14), "a".repeat(15), "https://exemple.fr/?win95link=ABCDEFGHJKLMNPQRSTUV&exp=1767225600000", "é".repeat(60), "x".repeat(213)];
        for (const text of texts) {
            const qr = window.Win95QR.encode(text);
            out.versions.push([qr.version, qr.size === qr.version * 4 + 17]);
            const m = qr.modules;
            const finder = (x, y) => [0, 1, 2, 3, 4, 5, 6].every((i) => m[y][x + i] && m[y + 6][x + i] && m[y + i][x] && m[y + i][x + 6]) && !m[y + 1][x + 1] && m[y + 2][x + 2] && m[y + 3][x + 3];
            const timing = Array.from({ length: qr.size - 16 }, (_, i) => m[6][8 + i] === (i % 2 === 0) && m[8 + i][6] === (i % 2 === 0)).every(Boolean);
            out.structure.push(finder(0, 0) && finder(qr.size - 7, 0) && finder(0, qr.size - 7) && timing && m[qr.size - 8][8] === true);
            // Format : deux copies identiques, mot BCH valide (reste nul après démasquage), niveau M, masque annoncé.
            const a = [];
            for (let i = 0; i <= 5; i += 1) a[i] = m[i][8];
            a[6] = m[7][8]; a[7] = m[8][8]; a[8] = m[8][7];
            for (let i = 9; i < 15; i += 1) a[i] = m[8][14 - i];
            const b = [];
            for (let i = 0; i < 8; i += 1) b[i] = m[8][qr.size - 1 - i];
            for (let i = 8; i < 15; i += 1) b[i] = m[qr.size - 15 + i][8];
            const toNumber = (bits) => bits.reduce((n, bit, i) => n | ((bit ? 1 : 0) << i), 0);
            const word = toNumber(a) ^ 0x5412;
            let rem = word;
            for (let i = 14; i >= 10; i -= 1) if ((rem >>> i) & 1) rem ^= 0x537 << (i - 10);
            out.format.push([toNumber(a) === toNumber(b), rem === 0, (word >>> 13) === 0, ((word >>> 10) & 7) === qr.mask]);
        }
        try { window.Win95QR.encode("x".repeat(214)); } catch (error) { out.tooLong = error.message; }
        out.deterministic = JSON.stringify(window.Win95QR.encode("abc").modules) === JSON.stringify(window.Win95QR.encode("abc").modules);
        if (typeof window.BarcodeDetector === "function") {
            try {
                const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
                const text = "https://exemple.fr/?win95link=ABCDEFGHJKLMNPQRSTUV&exp=1767225600000";
                const canvas = window.Win95QR.draw(document.createElement("canvas"), window.Win95QR.encode(text), { scale: 6 });
                const found = await detector.detect(canvas);
                out.decoded = found[0]?.rawValue === text ? "ok" : `échec : ${found[0]?.rawValue}`;
            } catch {
                out.decoded = "indisponible";
            }
        }
        return out;
    });
    equal(r.versions, [[1, true], [1, true], [2, true], [5, true], [7, true], [10, true]], "versions choisies selon la longueur (octets UTF-8)");
    equal(r.structure, [true, true, true, true, true, true], "viseurs, synchronisation et module noir fixe");
    assert(r.format.every((checks) => checks.every(Boolean)), `informations de format (deux copies, BCH, niveau M, masque) : ${JSON.stringify(r.format)}`);
    assert(/trop long/.test(r.tooLong || ""), "un texte de plus de 213 octets est refusé");
    assert(r.deterministic, "même texte, même code");
    assert(r.decoded === "indisponible" || r.decoded === "ok", `le code produit est relu par le navigateur : ${r.decoded}`);
    console.log(`       (relecture du QR code par le navigateur : ${r.decoded})`);
});

test("connexion locale : icône, menu Démarrer, session temporaire, QR code, renouvellement, fermeture", async (page) => {
    await open(page);
    await createAdmin(page);
    const base = await page.evaluate(() => ({
        icon: Boolean(document.querySelector(".desktop-icon[data-desktop-app='local-link']")),
        menu: Boolean(document.querySelector(".start-menu [data-app-name='local-link']")),
        removable: window.Win95Programs.PROGRAMS.some((p) => p.key === "local-link"),
        session: window.Win95LocalLink.getSession()
    }));
    equal([base.icon, base.menu, base.removable, base.session], [true, true, true, null], "icône du bureau, menu Démarrer, programme supprimable, pas de session au repos");

    await page.dblclick(".desktop-icon[data-desktop-app='local-link']");
    await page.waitForSelector("[data-window-app='local-link'] .local-link-canvas");
    const first = await page.evaluate(() => {
        const session = window.Win95LocalLink.getSession();
        const canvas = document.querySelector(".local-link-canvas");
        const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
        let dark = 0;
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i] === 0) dark += 1;
        return {
            token: session.token, url: session.url, address: document.querySelector(".local-link-address").value,
            darkRatio: dark / (canvas.width * canvas.height), timer: document.querySelector(".local-link-timer").textContent,
            note: !document.querySelector(".local-link-note").hidden, ttl: session.expiresAt - session.createdAt,
            stored: Object.keys(localStorage).concat(Object.keys(sessionStorage)).some((k) => k.includes(session.token))
        };
    });
    assert(/^[A-Z2-9]{20}$/.test(first.token), `jeton de 20 caractères : ${first.token}`);
    assert(first.url.includes(`win95link=${first.token}`) && /exp=\d{13}/.test(first.url), `adresse du QR code : ${first.url}`);
    equal(first.address, first.url, "le champ d'adresse montre l'adresse du QR code");
    assert(first.darkRatio > 0.2 && first.darkRatio < 0.6, `le QR code est dessiné (part de noir ${first.darkRatio})`);
    assert(/^Ce code expire dans 0[45]:\d\d$/.test(first.timer), `compte à rebours : ${first.timer}`);
    equal([first.note, first.ttl, first.stored], [true, 300000, false], "avertissement localhost, durée de 5 minutes, session jamais écrite sur disque");

    await page.click(".local-link-actions .start-btn");
    const second = await page.evaluate(() => window.Win95LocalLink.getSession().token);
    assert(second !== first.token, "« Nouveau code » remplace le jeton");
    assert((await page.inputValue(".local-link-address")).includes(second), "l'adresse affichée suit le nouveau code");

    // Échéance : la session disparaît, la fenêtre l'annonce.
    await page.evaluate(() => window.Win95LocalLink.createSession({ ttlMs: 400 }));
    await page.waitForFunction(() => document.querySelector(".local-link-expired") && !document.querySelector(".local-link-expired").hidden);
    equal(await page.evaluate(() => window.Win95LocalLink.getSession()), null, "la session expirée est retirée");
    assert(/expiré/.test(await page.textContent(".local-link-timer")), "message d'expiration");
    assert(await page.locator(".local-link-canvas").isHidden(), "le QR code expiré n'est plus affiché");

    // Fermer la fenêtre ferme la session ; une déconnexion aussi.
    await page.click(".local-link-actions .start-btn");
    assert(await page.evaluate(() => Boolean(window.Win95LocalLink.getSession())), "nouvelle session après expiration");
    await page.click("[data-window-app='local-link'] [data-window-action='close']");
    equal(await page.evaluate(() => window.Win95LocalLink.getSession()), null, "fermeture de la fenêtre = fin de session");
    await page.evaluate(() => { window.Win95LocalLink.createSession(); window.dispatchEvent(new CustomEvent("win95:auth-logout")); });
    equal(await page.evaluate(() => window.Win95LocalLink.getSession()), null, "déconnexion = fin de session");

    // L'échéance prévient les écouteurs même sans fenêtre ouverte.
    const notified = await page.evaluate(() => new Promise((resolve) => {
        window.addEventListener("win95:local-link-changed", (event) => { if (event.detail.session === null) resolve(true); });
        window.Win95LocalLink.createSession({ ttlMs: 200 });
        window.setTimeout(() => resolve(false), 1500);
    }));
    assert(notified, "l'événement win95:local-link-changed (session null) est émis à l'échéance");

    // Serveur de développement : l'adresse réseau fournie remplace localhost dans le QR code (le PC reste sur localhost).
    const dev = await page.evaluate(() => {
        window.Win95DevServer = { lanUrl: "http://192.168.1.26:8000/" };
        const session = window.Win95LocalLink.createSession();
        return { url: session.url, unreachable: window.Win95LocalLink.isUnreachableFromPhone() };
    });
    assert(dev.url.startsWith("http://192.168.1.26:8000/index.html?win95link="), `adresse réseau du serveur de développement : ${dev.url}`);
    equal(dev.unreachable, false, "plus d'avertissement avec l'adresse réseau du serveur de développement");
    await page.evaluate(() => { delete window.Win95DevServer; });

    // Adresse joignable configurée : plus d'avertissement.
    const reachable = await page.evaluate(() => {
        window.Win95Config.localLink.baseUrl = "https://exemple.fr/app/?x=1#y";
        const session = window.Win95LocalLink.createSession();
        return { url: session.url, unreachable: window.Win95LocalLink.isUnreachableFromPhone() };
    });
    assert(reachable.url.startsWith("https://exemple.fr/app/?win95link="), `baseUrl configurée : ${reachable.url}`);
    equal(reachable.unreachable, false, "adresse réseau joignable");
});

test("connexion locale : exclure le module retire l'icône et l'application", async (page) => {
    await open(page, { config: { exclude: ["local-link"] } });
    await createAdmin(page);
    const r = await page.evaluate(() => ({
        icon: Boolean(document.querySelector(".desktop-icon[data-desktop-app='local-link']")),
        service: typeof window.Win95LocalLink, refused: window.Win95Security.canOpenApp("local-link")
    }));
    equal([r.icon, r.service, r.refused], [false, "undefined", false], "module exclu : ni icône, ni service, application refusée");
});

test("connexion locale : page du téléphone (mode téléphone, page vide, code expiré ou invalide, plugin phone)", async (page) => {
    const token = "ABCDEFGHJKLMNPQRSTUV";
    const config = { appName: "Projet test", plugins: ["tests/fixtures/plugin.js", { src: "tests/fixtures/phone-plugin.js", phone: true }] };
    // Page vide : le plugin phone n'est ajouté que pour la dernière vérification.
    await page.addInitScript((json) => { window.Win95Config = JSON.parse(json); }, JSON.stringify({ appName: "Projet test", plugins: ["tests/fixtures/plugin.js"] }));
    await page.goto(`${origin}/index.html?win95link=${token}&exp=${Date.now() + 60000}`);
    await page.waitForSelector(".local-link-phone");
    const r = await page.evaluate(() => ({
        title: document.querySelector(".local-link-phone .title-bar-text").textContent,
        content: document.querySelector("[data-local-link-phone-content]").textContent, children: document.querySelector("[data-local-link-phone-content]").children.length,
        status: document.querySelector("[data-local-link-phone-status]").textContent,
        desktop: typeof window.Win95WindowManager, security: typeof window.Win95Security, accounts: typeof window.Win95Accounts,
        login: Boolean(document.querySelector(".security-screen")), boot: Boolean(document.querySelector(".boot-screen")),
        phoneMode: window.Win95Loader.phoneMode, project: typeof window.__plugin,
        color: getComputedStyle(document.querySelector("[data-local-link-phone-content]")).color
    }));
    equal([r.title, r.content, r.children], ["Connexion locale - Projet test", "", 0], "fenêtre Windows 95 au nom du projet, contenu vide");
    assert(/^Page de liaison vide pour le moment\. Code valable encore 0[01]:\d\d\.$/.test(r.status), `barre d'état : ${r.status}`);
    equal([r.desktop, r.security, r.accounts, r.login, r.boot, r.phoneMode, r.project], ["undefined", "undefined", "undefined", false, false, true, "undefined"], "seul le noyau est chargé : ni bureau, ni comptes, ni démarrage, ni plugin ordinaire");
    equal(r.color, "rgb(0, 0, 0)", "texte noir (charte)");

    // Code expiré, code invalide.
    await page.goto(`${origin}/index.html?win95link=${token}&exp=${Date.now() - 1000}`);
    await page.waitForSelector(".local-link-phone");
    assert(/a expiré/.test(await page.textContent("[data-local-link-phone-status]")), "code expiré signalé");
    await page.goto(`${origin}/index.html?win95link=abc`);
    await page.waitForSelector(".local-link-phone");
    assert(/non valable/.test(await page.textContent("[data-local-link-phone-status]")), "code invalide signalé");

    // Plugin du projet déclaré phone: true : seul lui est chargé, il remplit la page.
    const context = await page.context().browser().newContext({ viewport: { width: 390, height: 780 } });
    const second = await context.newPage();
    await second.addInitScript((json) => { window.Win95Config = JSON.parse(json); }, JSON.stringify(config));
    await second.goto(`${origin}/index.html?win95link=${token}&exp=${Date.now() + 60000}`);
    await second.waitForFunction(() => window.__phone?.mounted === 1);
    const p = await second.evaluate(() => ({
        content: document.querySelector("[data-local-link-phone-content]").textContent, status: document.querySelector("[data-local-link-phone-status]").textContent,
        context: window.__phone.context, ordinary: typeof window.__plugin,
        overflow: document.documentElement.scrollWidth > window.innerWidth
    }));
    equal([p.content, p.status, p.ordinary, p.overflow], ["Contenu du projet", "Projet prêt.", "undefined", false], "contenu du plugin phone, plugin ordinaire ignoré, pas de débordement sur 390 px");
    equal(p.context, { token, appName: "Projet test" }, "contexte transmis au plugin");
    await context.close();

    // Sans le paramètre, la même page reste le bureau.
    await page.addInitScript(() => { window.Win95Config = {}; });
    await page.goto(`${origin}/index.html?noboot`);
    await page.waitForSelector(".security-screen");
    equal(await page.evaluate(() => [Boolean(document.querySelector(".local-link-phone")), window.Win95Loader.phoneMode]), [false, false], "sans paramètre : bureau normal");
});

test("serveur de développement : adresse réseau détectée, fichiers servis, accès hors dossier refusé, QR de terminal", async () => {
    const { spawn } = await import("node:child_process");
    const { findLanAddress, terminalQr } = await import(`file:///${path.join(root, "tools/dev-server.mjs").replace(/\\/g, "/")}`);
    equal(findLanAddress({
        lo: [{ family: "IPv4", internal: true, address: "127.0.0.1" }],
        "vEthernet (WSL)": [{ family: "IPv4", internal: false, address: "172.20.0.1" }],
        Ethernet: [{ family: "IPv4", internal: false, address: "10.0.0.5" }],
        "Wi-Fi": [{ family: "IPv4", internal: false, address: "192.168.1.20" }, { family: "IPv6", internal: false, address: "fe80::1" }]
    }), "192.168.1.20", "carte Wi-Fi privée préférée, cartes virtuelles et loopback ignorées");
    equal(findLanAddress({ lo: [{ family: "IPv4", internal: true, address: "127.0.0.1" }] }), null, "aucun réseau : null");
    assert(terminalQr("http://192.168.1.20:8000/").includes("\u001b[30;40m"), "QR de terminal en couleurs ANSI");

    const child = spawn(process.execPath, [path.join(root, "tools/dev-server.mjs"), "--port", "0", "--no-open"], { cwd: root });
    try {
        const output = await new Promise((resolve, reject) => {
            let text = "";
            const timer = setTimeout(() => reject(new Error(`le serveur n'a pas démarré : ${text}`)), 8000);
            child.stdout.on("data", (chunk) => { text += chunk; if (text.includes("Ctrl+C")) { clearTimeout(timer); resolve(text); } });
            child.on("error", reject);
        });
        const port = /Local\s+: http:\/\/localhost:(\d+)\//.exec(output)?.[1];
        assert(port, `adresse locale affichée : ${output}`);
        assert(/Réseau\s+: (http:\/\/\d+\.\d+\.\d+\.\d+:\d+\/|aucune adresse)/.test(output), "adresse réseau (ou message) affichée");
        // (fetch est remplacé par un test précédent : requêtes par node:http)
        const get = (route) => new Promise((resolve, reject) => {
            http.get({ host: "127.0.0.1", port, path: route }, (response) => {
                let body = "";
                response.on("data", (chunk) => { body += chunk; });
                response.on("end", () => resolve({ status: response.statusCode, type: response.headers["content-type"], body }));
            }).on("error", reject);
        });
        const index = await get("/");
        equal([index.status, index.body.includes("scripts/loader.js")], [200, true], "index.html servi");
        assert(/<head>\s*<script>window\.Win95DevServer = \{"lanUrl":/.test(index.body), "adresse réseau injectée en tête de la page HTML");
        const asset = await get("/assets/icons/mobile_phone-0.png");
        equal([asset.status, asset.type], [200, "image/png"], "ressource servie avec son type");
        equal((await get("/inexistant.js")).status, 404, "fichier inconnu : 404");
        const escape = (await get("/..%2f..%2fwindows%2fwin.ini")).status;
        assert(escape === 403 || escape === 404, `accès hors dossier refusé (${escape})`);
    } finally {
        child.kill();
    }
});

// --- Exécution --------------------------------------------------------------------------------------------------

let failed = 0;
for (const { name, options, fn } of tests) {
    if (only && !name.includes(only)) {
        continue;
    }
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    // Les ressources externes (CDN de Bootstrap) ne sont pas l'objet des tests : une panne réseau ne doit pas les faire échouer.
    page.on("console", (message) => {
        if (message.type() === "error" && String(message.location().url || origin).startsWith(origin)) {
            errors.push(`console: ${message.text()}`);
        }
    });
    page.on("response", (response) => { if (response.status() >= 400) { errors.push(`HTTP ${response.status()} ${response.url()}`); } });
    const started = Date.now();
    try {
        await fn(page);
        if (errors.length > 0 && options.allowErrors !== true) {
            throw new Error(`erreurs dans la console :\n  ${errors.join("\n  ")}`);
        }
        console.log(`  ok   ${name} (${Date.now() - started} ms)`);
    } catch (error) {
        failed += 1;
        console.log(`  FAIL ${name}\n       ${String(error.message).split("\n").join("\n       ")}`);
    }
    await context.close();
}

await browser.close();
server.close();
console.log(failed === 0 ? `\nTous les tests passent (${tests.length}).` : `\n${failed} test(s) en échec.`);
process.exit(failed === 0 ? 0 : 1);
