// Autorisation Google Drive, à faire UNE fois par l'admin (fonction serverless Vercel ; bibliothèque Win95, voir vercel/README.md).
//  1. Ouvrir https://<site>/api/drive-auth : redirection vers Google (compte qui hébergera "Mes documents") ;
//  2. Google revient ici avec un code, échangé contre un jeton de rafraîchissement ;
//  3. la page affiche ce jeton : le copier dans la variable Vercel GOOGLE_REFRESH_TOKEN, puis redéployer.
// L'URI de redirection à déclarer dans Google Cloud est https://<site>/api/drive-auth (exactement).
// Seul le compte qui donne son accord voit le jeton ; une fois GOOGLE_REFRESH_TOKEN défini, la page le signale.

const crypto = require("crypto");

const STATE_COOKIE = "win95_oauth_state";
const SCOPE = "https://www.googleapis.com/auth/drive.file";

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);
}

function page(res, status, title, body) {
    res.status(status).setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.send(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:Tahoma,"MS Sans Serif",sans-serif;font-size:13px;background:#008080;margin:0;padding:30px}
.box{max-width:640px;margin:auto;background:#c0c0c0;border:2px solid;border-color:#fff #404040 #404040 #fff;padding:0 0 12px}
h1{margin:0 0 10px;padding:4px 8px;font-size:13px;color:#fff;background:linear-gradient(90deg,#000080,#1084d0)}
p,ol{margin:8px 12px}textarea{display:block;width:calc(100% - 24px);margin:8px 12px;height:90px;font-family:"Courier New",monospace}</style>
</head><body><div class="box"><h1>${escapeHtml(title)}</h1>${body}</div></body></html>`);
}

function getRedirectUri(req) {
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const protocol = req.headers["x-forwarded-proto"] || "https";
    return `${protocol}://${host}/api/drive-auth`;
}

module.exports = async (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        return page(res, 503, "Google Drive — configuration", "<p>Ajoutez d'abord GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET dans les variables d'environnement Vercel, puis redéployez.</p>");
    }
    const redirectUri = getRedirectUri(req);
    const { code, error, state } = req.query || {};
    const cookieState = /(?:^|;\s*)win95_oauth_state=([a-f0-9]{32})/.exec(req.headers.cookie || "")?.[1];

    if (code && (!cookieState || state !== cookieState)) {
        return page(res, 400, "Google Drive — requête refusée", "<p>Paramètre « state » invalide ou expiré. Recommencez depuis /api/drive-auth.</p>");
    }

    if (error) {
        return page(res, 400, "Google Drive — autorisation refusée", `<p>Google a répondu : ${escapeHtml(error)}.</p>`);
    }

    if (!code) {
        const already = process.env.GOOGLE_REFRESH_TOKEN
            ? "<p><b>Un jeton est déjà configuré.</b> Recommencer ne sert que si le stockage ne fonctionne plus (jeton révoqué).</p>" : "";
        const newState = crypto.randomBytes(16).toString("hex");
        res.setHeader("Set-Cookie", `${STATE_COOKIE}=${newState}; Max-Age=600; Path=/api/drive-auth; HttpOnly; Secure; SameSite=Lax`);
        const url = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: "code",
            scope: SCOPE,
            access_type: "offline",
            prompt: "consent",
            state: newState
        })}`;
        return page(res, 200, "Google Drive — autorisation", `${already}
<p>Connectez-vous avec le compte Google qui hébergera « Mes documents » de tous les utilisateurs.
L'application ne pourra voir que les fichiers qu'elle crée elle-même (dossier « <nom de l'application> - Mes documents », voir WIN95_APP_NAME).</p>
<p><a href="${escapeHtml(url)}">Autoriser l'accès à Google Drive</a></p>
<p>URI de redirection à déclarer dans Google Cloud : <code>${escapeHtml(redirectUri)}</code></p>`);
    }

    res.setHeader("Set-Cookie", `${STATE_COOKIE}=; Max-Age=0; Path=/api/drive-auth; HttpOnly; Secure; SameSite=Lax`);
    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code: String(code), client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.refresh_token) {
        return page(res, 502, "Google Drive — échec", `<p>Aucun jeton de rafraîchissement reçu (${escapeHtml(data.error_description || data.error || response.status)}).
Retirez l'accès de l'application dans votre compte Google (Sécurité > Applications tierces), puis recommencez.</p>`);
    }
    return page(res, 200, "Google Drive — jeton obtenu", `
<p>Copiez ce jeton, <b>sans le partager</b> :</p>
<textarea readonly>${escapeHtml(data.refresh_token)}</textarea>
<ol>
<li>Vercel &gt; projet &gt; Settings &gt; Environment Variables : ajoutez <code>GOOGLE_REFRESH_TOKEN</code> avec cette valeur (Production).</li>
<li>Redéployez le projet (Deployments &gt; ⋯ &gt; Redeploy).</li>
<li>« Mes documents » est alors stocké dans votre Google Drive.</li>
</ol>`);
};
