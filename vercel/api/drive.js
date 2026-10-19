// Stockage des documents dans le Google Drive du propriétaire du site (fonction serverless Vercel, Node 18+, sans dépendance).
// Le navigateur n'a jamais le jeton Google : il passe par cette fonction pour envoyer, supprimer et lire les fichiers
// (client : scripts/storage/drive-content.js de la bibliothèque Win95). Les fichiers sont partagés en lecture par lien public.
//
// Arborescence dans le Drive : "<nom de l'application> - Mes documents" / <compte> / <fichier> (un dossier par compte),
// et ... / "Documents partagés" / <fichier> pour un espace commun. Autorisation "drive.file" : l'application ne voit que
// les fichiers et dossiers qu'elle a créés.
//
// Variables d'environnement (Vercel > Settings > Environment Variables ; modèle : vercel/.env.example) :
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET   identifiant OAuth (Google Cloud > APIs & Services > Credentials) ;
//   GOOGLE_REFRESH_TOKEN                      jeton du compte Google, obtenu une fois avec /api/drive-auth ;
//   SUPABASE_URL, SUPABASE_ANON_KEY           pour vérifier que l'appel vient d'un compte connecté (table des comptes) ;
//   WIN95_APP_NAME                            (facultatif) nom du dossier racine, défaut "Win95" ;
//   WIN95_ACCOUNTS_TABLE                      (facultatif) table des comptes, défaut "win95_accounts" (colonnes id, hash) ;
//   DRIVE_MAX_FILE_MB                         (facultatif) taille maximale d'un fichier, défaut 50 Mo.
//
// Actions (paramètre "action") :
//   GET  status                 -> { configured }
//   POST start   { name, mimeType, size, shared } -> { session }  (session d'envoi Google, par morceaux)
//   PUT  chunk   ?session=...  corps binaire, en-tête X-Content-Range "bytes a-b/total" -> { done, fileId? }
//   POST copy    { fileId, name, shared }        -> { fileId }    (copie dans le dossier du compte ou partagé)
//   POST delete  { fileIds: [...] }              -> { deleted }
//   GET  text    ?id=...                         -> contenu brut (fichiers texte, 4 Mo maximum)
// En-têtes d'identification : X-Win95-User (id du compte), X-Win95-Key (empreinte du mot de passe, comme dans la table des comptes).
// Contrôles : compte connecté (checkUser), limitation de débit par compte et par IP (rateLimited), et propriété des fichiers :
// delete / text n'agissent que dans le dossier du compte ou les documents partagés ; copy accepte tout fichier du dossier racine
// (l'« Envoyer à » copie le fichier d'un autre compte).

const APP_NAME = process.env.WIN95_APP_NAME || "Win95";
const ACCOUNTS_TABLE = process.env.WIN95_ACCOUNTS_TABLE || "win95_accounts";
const ROOT_FOLDER_NAME = `${APP_NAME} - Mes documents`;
const SHARED_FOLDER_NAME = "Documents partagés";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const UPLOAD_PREFIX = "https://www.googleapis.com/upload/drive/v3/files?";
const MAX_TEXT_BYTES = 4 * 1024 * 1024;
const MAX_FILE_BYTES = (Number(process.env.DRIVE_MAX_FILE_MB) > 0 ? Number(process.env.DRIVE_MAX_FILE_MB) : 50) * 1024 * 1024;

const RATE_WINDOW_MS = 60000;
const RATE_MAX_PER_USER = 240;
const RATE_MAX_UPLOADS_PER_USER = 30;
const RATE_MAX_PER_IP = 600;
const RATE_MAX_FAILED_PER_IP = 20;
const FILE_ID_PATTERN = /^[\w-]{10,}$/;

let cachedToken = null;
const folderCache = new Map();
const rateCounters = new Map();

// Limitation de débit en mémoire (par instance de la fonction : freine les abus, ne remplace pas un pare-feu).
// Renvoie true si la limite de cette clé est dépassée sur la fenêtre en cours.
function rateLimited(key, max) {
    const now = Date.now();
    if (rateCounters.size > 5000) {
        for (const [counterKey, entry] of rateCounters) {
            if (entry.resetAt <= now) {
                rateCounters.delete(counterKey);
            }
        }
    }
    const entry = rateCounters.get(key);
    if (!entry || entry.resetAt <= now) {
        rateCounters.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
        return false;
    }
    entry.count += 1;
    return entry.count > max;
}

function getClientIp(req) {
    return String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "inconnue";
}

function isConfigured() {
    return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN
        && process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

function send(res, status, body) {
    res.status(status).setHeader("Cache-Control", "no-store");
    res.json(body);
}

// Jeton d'accès Google (1 h), renouvelé à partir du jeton de rafraîchissement.
async function getAccessToken() {
    if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
        return cachedToken.value;
    }
    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
            grant_type: "refresh_token"
        })
    });
    const data = await response.json();
    if (!response.ok || !data.access_token) {
        throw new Error(`Jeton Google refusé (${data.error || response.status}) : refaire /api/drive-auth.`);
    }
    cachedToken = { value: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
    return cachedToken.value;
}

async function driveFetch(url, options = {}) {
    const token = await getAccessToken();
    return fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` } });
}

// Dossier (créé par l'application) portant ce nom dans ce parent ; créé s'il n'existe pas.
async function ensureFolder(name, parentId) {
    const cacheKey = `${parentId || "root"}/${name}`;
    if (folderCache.has(cacheKey)) {
        return folderCache.get(cacheKey);
    }
    const escaped = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const query = `mimeType='${FOLDER_MIME}' and name='${escaped}' and '${parentId || "root"}' in parents and trashed=false`;
    const search = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=1`);
    const found = (await search.json()).files?.[0]?.id;
    if (found) {
        folderCache.set(cacheKey, found);
        return found;
    }
    const created = await driveFetch("https://www.googleapis.com/drive/v3/files?fields=id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: parentId ? [parentId] : undefined })
    });
    const data = await created.json();
    if (!created.ok || !data.id) {
        throw new Error(`Création du dossier « ${name} » impossible (${data.error?.message || created.status}).`);
    }
    folderCache.set(cacheKey, data.id);
    return data.id;
}

// Compte connecté : l'empreinte envoyée doit être celle de la table des comptes (même contrôle que la connexion).
// SUPABASE_URL / SUPABASE_ANON_KEY sont obligatoires (isConfigured) : sans eux, l'API refuse tout.
async function checkUser(req) {
    const userId = String(req.headers["x-win95-user"] || "").toLowerCase();
    const key = String(req.headers["x-win95-key"] || "").toLowerCase();
    if (!/^[a-z0-9_-]+$/.test(userId) || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY || !/^[a-f0-9]{64}$/.test(key)) {
        return null;
    }
    const url = `${process.env.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/${encodeURIComponent(ACCOUNTS_TABLE)}?id=eq.${encodeURIComponent(userId)}&select=hash`;
    const response = await fetch(url, { headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}` } });
    const rows = response.ok ? await response.json() : [];
    return rows[0]?.hash && rows[0].hash === key ? userId : null;
}

// Dossiers parents (ids) d'un fichier créé par l'application ; tableau vide s'il est introuvable.
async function getParents(fileId) {
    const response = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`);
    return response.ok ? ((await response.json()).parents || []) : [];
}

// Le fichier est-il dans le dossier du compte ou dans les documents partagés ?
async function isOwnFile(fileId, userId) {
    const rootId = await ensureFolder(ROOT_FOLDER_NAME, null);
    const allowed = [await ensureFolder(userId, rootId), await ensureFolder(SHARED_FOLDER_NAME, rootId)];
    return (await getParents(fileId)).some((parentId) => allowed.includes(parentId));
}

// Le fichier est-il dans un dossier (d'un compte ou partagé) du dossier racine de l'application ?
async function isAppFile(fileId) {
    const rootId = await ensureFolder(ROOT_FOLDER_NAME, null);
    const [parentId] = await getParents(fileId);
    return Boolean(parentId) && (await getParents(parentId)).includes(rootId);
}

async function startUpload(req, res, userId) {
    const { name, mimeType, size, shared } = req.body || {};
    if (!(Number(size) >= 0) || Number(size) > MAX_FILE_BYTES) {
        return send(res, 413, { error: `Fichier trop volumineux (${Math.round(MAX_FILE_BYTES / 1048576)} Mo maximum).` });
    }
    const cleanName = String(name || "fichier").replace(/[\\/]/g, "-").slice(0, 200);
    const rootId = await ensureFolder(ROOT_FOLDER_NAME, null);
    const userFolderId = await ensureFolder(shared === true ? SHARED_FOLDER_NAME : userId, rootId);
    const response = await driveFetch(`${UPLOAD_PREFIX}uploadType=resumable&fields=id`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": mimeType || "application/octet-stream",
            "X-Upload-Content-Length": String(Number(size) || 0)
        },
        body: JSON.stringify({ name: cleanName, parents: [userFolderId] })
    });
    const session = response.headers.get("location");
    if (!response.ok || !session) {
        const data = await response.json().catch(() => ({}));
        return send(res, 502, { error: `Envoi refusé par Google Drive (${data.error?.message || response.status}).` });
    }
    return send(res, 200, { session });
}

// Un morceau du fichier (4 Mo au plus, limite des fonctions Vercel). Au dernier, le fichier est partagé par lien.
async function uploadChunk(req, res) {
    const session = String(req.query.session || "");
    if (!session.startsWith(UPLOAD_PREFIX)) {
        return send(res, 400, { error: "Session d'envoi invalide." });
    }
    const range = String(req.headers["x-content-range"] || "");
    const total = Number(/^bytes (?:\d+-\d+|\*)\/(\d+)$/.exec(range)?.[1]);
    if (!(total >= 0) || total > MAX_FILE_BYTES) {
        return send(res, 413, { error: `Fichier trop volumineux (${Math.round(MAX_FILE_BYTES / 1048576)} Mo maximum).` });
    }
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");
    const response = await driveFetch(session, {
        method: "PUT",
        headers: { "Content-Length": String(body.length), "Content-Range": range },
        body
    });
    if (response.status === 308) {
        return send(res, 200, { done: false });
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.id) {
        return send(res, 502, { error: `Morceau refusé par Google Drive (${data.error?.message || response.status}).` });
    }
    await sharePublicly(data.id);
    return send(res, 200, { done: true, fileId: data.id });
}

// Lien public en lecture : le navigateur lit l'image / le son directement chez Google.
function sharePublicly(fileId) {
    return driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "reader", type: "anyone" })
    });
}

// Copie d'un fichier (« Envoyer à ») dans le dossier du compte connecté, ou dans les documents partagés.
async function copyFile(req, res, userId) {
    const { fileId, name, shared } = req.body || {};
    if (!FILE_ID_PATTERN.test(String(fileId || ""))) {
        return send(res, 400, { error: "Fichier invalide." });
    }
    if (!(await isAppFile(fileId))) {
        return send(res, 403, { error: "Ce fichier n'est pas accessible." });
    }
    const rootId = await ensureFolder(ROOT_FOLDER_NAME, null);
    const folderId = await ensureFolder(shared === true ? SHARED_FOLDER_NAME : userId, rootId);
    const response = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}/copy?fields=id`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: String(name || "fichier").replace(/[\\/]/g, "-").slice(0, 200), parents: [folderId] })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.id) {
        return send(res, response.status === 404 ? 404 : 502, {
            error: response.status === 404 ? "Le fichier d'origine n'existe plus." : `Copie refusée par Google Drive (${data.error?.message || response.status}).`
        });
    }
    await sharePublicly(data.id);
    return send(res, 200, { fileId: data.id });
}

async function deleteFiles(req, res, userId) {
    const ids = (Array.isArray(req.body?.fileIds) ? req.body.fileIds : []).filter((id) => FILE_ID_PATTERN.test(String(id))).slice(0, 200);
    let deleted = 0;
    for (const id of ids) {
        // Fichier d'un autre compte : ignoré, comme un fichier déjà supprimé.
        if (!(await isOwnFile(id, userId))) {
            continue;
        }
        const response = await driveFetch(`https://www.googleapis.com/drive/v3/files/${id}`, { method: "DELETE" });
        // 404 : déjà supprimé (ou pas créé par l'application) : rien à faire.
        if (response.ok || response.status === 404) {
            deleted += 1;
        }
    }
    return send(res, 200, { deleted });
}

async function readText(req, res, userId) {
    const id = String(req.query.id || "");
    if (!FILE_ID_PATTERN.test(id)) {
        return send(res, 400, { error: "Fichier invalide." });
    }
    if (!(await isOwnFile(id, userId))) {
        return send(res, 403, { error: "Ce fichier n'est pas accessible." });
    }
    const response = await driveFetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
    if (!response.ok) {
        return send(res, response.status === 404 ? 404 : 502, { error: "Fichier introuvable dans Google Drive." });
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_TEXT_BYTES) {
        return send(res, 413, { error: "Fichier texte trop volumineux pour le Bloc-notes." });
    }
    res.status(200).setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.send(buffer);
}

module.exports = async (req, res) => {
    const action = String(req.query.action || "");
    try {
        if (action === "status") {
            return send(res, 200, { configured: isConfigured() });
        }
        if (!isConfigured()) {
            return send(res, 503, { error: "Google Drive non configuré (variables d'environnement Vercel)." });
        }
        const ip = getClientIp(req);
        if (rateLimited(`ip:${ip}`, RATE_MAX_PER_IP)) {
            return send(res, 429, { error: "Trop de requêtes : patientez une minute." });
        }
        const userId = await checkUser(req);
        if (!userId) {
            const blocked = rateLimited(`fail:${ip}`, RATE_MAX_FAILED_PER_IP);
            return send(res, blocked ? 429 : 401, { error: blocked ? "Trop de tentatives : patientez une minute." : "Connectez-vous pour accéder à vos documents." });
        }
        if (rateLimited(`user:${userId}`, RATE_MAX_PER_USER) || (action === "start" && rateLimited(`upload:${userId}`, RATE_MAX_UPLOADS_PER_USER))) {
            return send(res, 429, { error: "Trop de requêtes : patientez une minute." });
        }
        if (action === "start" && req.method === "POST") {
            return await startUpload(req, res, userId);
        }
        if (action === "chunk" && req.method === "PUT") {
            return await uploadChunk(req, res);
        }
        if (action === "copy" && req.method === "POST") {
            return await copyFile(req, res, userId);
        }
        if (action === "delete" && req.method === "POST") {
            return await deleteFiles(req, res, userId);
        }
        if (action === "text" && req.method === "GET") {
            return await readText(req, res, userId);
        }
        return send(res, 400, { error: "Action inconnue." });
    } catch (error) {
        return send(res, 500, { error: error?.message || "Erreur Google Drive." });
    }
};
