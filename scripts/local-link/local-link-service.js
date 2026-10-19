(() => {
    // Connexion locale (Win95LocalLink) : met en relation l'ordinateur et le téléphone de l'utilisateur.
    //
    //  - côté ordinateur, l'application « Connexion locale » demande une session temporaire (createSession) et affiche son
    //    adresse sous forme de QR code ; le téléphone qui le scanne ouvre la MÊME page avec `?win95link=<jeton>&exp=<échéance>` ;
    //  - côté téléphone, le chargeur détecte ce paramètre et n'affiche que la page de liaison (local-link-phone.js) : une fenêtre
    //    Windows 95 vide, que les projets remplissent avec registerPhonePage ;
    //  - la session ne vit qu'en mémoire (jamais écrite sur disque) : elle disparaît à la fermeture de la fenêtre, au changement
    //    de compte ou à l'échéance (5 minutes par défaut, Win95Config.localLink.ttlMinutes).
    //
    // IMPORTANT : la bibliothèque ne transporte AUCUNE donnée entre l'ordinateur et le téléphone pour le moment (aucun serveur,
    // aucune requête réseau). Le jeton est l'identifiant de la session que le projet utilisera pour son propre canal ; l'échéance
    // contenue dans l'adresse n'est qu'un confort d'affichage côté téléphone : un canal réel doit vérifier le jeton côté serveur.
    //
    // API pour un projet :
    //   Win95LocalLink.getSession()                       session active { token, url, createdAt, expiresAt } ou null
    //   Win95LocalLink.createSession({ ttlMs? })          ferme la précédente, en ouvre une nouvelle
    //   Win95LocalLink.closeSession()
    //   Win95LocalLink.registerPhonePage((conteneur, { token, expiresAt, appName, setStatus }) => nettoyage?)   contenu du téléphone
    //   événement window "win95:local-link-changed" { detail: { session } } (null à la fermeture)
    // Un projet qui veut son contenu côté téléphone déclare son script avec `phone: true` dans Win95Config.plugins : en mode
    // téléphone, seuls les plugins `phone: true` sont chargés.

    const CHANGE_EVENT = "win95:local-link-changed";
    const PARAM = "win95link";
    const EXPIRY_PARAM = "exp";
    const TOKEN_LENGTH = 20;
    // Sans I, O, 0 ni 1 : jeton lisible à voix haute en cas de saisie manuelle.
    const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const TOKEN_PATTERN = new RegExp(`^[${ALPHABET}]{${TOKEN_LENGTH}}$`);
    const DEFAULT_TTL_MINUTES = 5;
    const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0"];

    let session = null;
    let expiryTimer = null;
    let phonePageFactory = null;
    let phoneMount = null;

    const config = () => window.Win95Config?.localLink || {};

    function generateToken() {
        const bytes = new Uint8Array(TOKEN_LENGTH);
        crypto.getRandomValues(bytes);
        // 256 n'est pas multiple de 32 : on réduit modulo 32 (256 = 8 × 32), donc sans biais.
        return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
    }

    // Adresse de la page que le téléphone doit ouvrir : Win95Config.localLink.baseUrl si elle est donnée ; sinon celle de cette
    // page, sauf si elle n'est pas joignable depuis le téléphone (localhost) et que le serveur de développement (`npm start`,
    // tools/dev-server.mjs) a fourni l'adresse réseau du poste dans window.Win95DevServer.lanUrl.
    function getBaseUrl() {
        const configured = String(config().baseUrl || "").trim();
        if (configured) {
            return configured.split("#")[0].split("?")[0];
        }
        const own = `${window.location.origin}${window.location.pathname}`;
        const lanUrl = window.Win95DevServer?.lanUrl;
        if (lanUrl && isUnreachableFromPhone(own)) {
            try {
                return `${new URL(lanUrl).origin}${window.location.pathname}`;
            } catch {
                return own;
            }
        }
        return own;
    }

    function buildUrl(token, expiresAt) {
        return `${getBaseUrl()}?${PARAM}=${token}&${EXPIRY_PARAM}=${expiresAt}`;
    }

    // true quand l'adresse ne peut pas être ouverte depuis un autre appareil.
    function isUnreachableFromPhone(url) {
        url = url ?? getBaseUrl();
        try {
            const parsed = new URL(url);
            return parsed.protocol === "file:" || LOCAL_HOSTS.includes(parsed.hostname);
        } catch {
            return true;
        }
    }

    function emit() {
        window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { session } }));
    }

    function clearTimer() {
        window.clearTimeout(expiryTimer);
        expiryTimer = null;
    }

    function isExpired(target = session) {
        return !target || Date.now() >= target.expiresAt;
    }

    function closeSession() {
        if (!session) {
            return;
        }
        session = null;
        clearTimer();
        emit();
    }

    function createSession({ ttlMs } = {}) {
        const configuredMinutes = Number(config().ttlMinutes);
        const ttl = ttlMs ?? (configuredMinutes > 0 ? configuredMinutes : DEFAULT_TTL_MINUTES) * 60 * 1000;
        clearTimer();
        const token = generateToken();
        const createdAt = Date.now();
        const expiresAt = createdAt + ttl;
        session = { token, createdAt, expiresAt, url: buildUrl(token, expiresAt) };
        // À l'échéance la session est retirée (les vues sont prévenues par l'événement).
        expiryTimer = window.setTimeout(closeSession, ttl);
        emit();
        return session;
    }

    function getSession() {
        if (session && isExpired()) {
            closeSession();
        }
        return session;
    }

    // Lecture de l'adresse courante côté téléphone : { token, expiresAt } ou null si la page n'est pas une page de liaison.
    function readIncoming(search = window.location.search) {
        const params = new URLSearchParams(search);
        const token = params.get(PARAM);
        if (token === null) {
            return null;
        }
        const expiresAt = Number(params.get(EXPIRY_PARAM));
        return { token, valid: TOKEN_PATTERN.test(token), expiresAt: Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : null };
    }

    // Contenu de la page du téléphone fourni par un projet : appelé tout de suite si la page est déjà affichée.
    function registerPhonePage(factory) {
        phonePageFactory = typeof factory === "function" ? factory : null;
        if (phoneMount && phonePageFactory) {
            phoneMount();
        }
    }

    const api = {
        CHANGE_EVENT,
        PARAM,
        getBaseUrl,
        buildUrl,
        isUnreachableFromPhone,
        isExpired,
        getSession,
        createSession,
        closeSession,
        readIncoming,
        registerPhonePage,
        // Usage interne de la page du téléphone.
        _getPhonePageFactory: () => phonePageFactory,
        _setPhoneMount: (mount) => { phoneMount = mount; }
    };

    // Une session n'appartient qu'au compte qui l'a ouverte.
    window.addEventListener("win95:auth-changed", closeSession);
    window.addEventListener("win95:auth-logout", closeSession);

    window.Win95LocalLink = api;
    window.Win95Services?.register?.("Win95LocalLink", api);
})();
