(() => {
    // Comptes utilisateurs (Win95Accounts), avec un fournisseur interchangeable (Win95Config.accounts.provider) :
    //   "local"     navigateur (localStorage, clé "win95.accounts.v1") : rien à installer, propre à ce navigateur ;
    //   "supabase"  table Supabase `win95_accounts` (supabase/01-accounts.sql) : mêmes comptes sur tous les appareils.
    // Compte : { id, name, role: "admin" | "user", allowedApps: string[] | null, salt, hash, createdAt }.
    //  - allowedApps : applications ouvertes au compte (null = toutes) ; sans effet pour un admin ;
    //  - hash : SHA-256 de "sel:mot de passe" (Web Crypto, donc HTTPS ou localhost).
    // Les comptes sont chargés une fois en mémoire (ready()) : list / get / findByName / needsSetup sont synchrones ;
    // create / update / setPassword / remove / verify sont asynchrones (elles écrivent chez le fournisseur).
    // Limite assumée : la sécurité est côté client. Quiconque ouvre la console du navigateur peut lire ou modifier les
    // comptes (avec Supabase : toute personne ayant la clé « anon » du site, voir les policies dans supabase/).
    // Toute modification émet "win95:accounts-changed".
    //
    // Fournisseur personnalisé : Win95Accounts.useProvider({ async load() -> comptes[], async save(compte), async remove(id) }).

    const STORAGE_KEY = "win95.accounts.v1";
    const CHANGE_EVENT = "win95:accounts-changed";
    const MIN_PASSWORD_LENGTH = 4;
    const ROLES = ["admin", "user"];

    const utils = () => window.Win95Utils;

    // --- Fournisseurs ----------------------------------------------------------------------------------------

    const localProvider = {
        name: "local",
        async load() {
            const list = utils().readStoredJson(STORAGE_KEY, []);
            return Array.isArray(list) ? list : [];
        },
        async save(account, all) {
            utils().writeStoredJson(STORAGE_KEY, all);
        },
        async remove(id, all) {
            utils().writeStoredJson(STORAGE_KEY, all);
        }
    };

    function createSupabaseProvider() {
        const table = () => window.Win95Config.accounts?.supabase?.table || "win95_accounts";
        const client = () => {
            const instance = window.Win95Supabase?.getClient();
            if (!instance) {
                throw new Error("Supabase n'est pas configuré (Win95Config.supabase).");
            }
            return instance;
        };
        // Colonnes SQL (snake_case) <-> compte.
        const fromRow = (row) => ({ id: row.id, name: row.name, role: row.role, allowedApps: row.allowed_apps ?? null, salt: row.salt, hash: row.hash, createdAt: row.created_at });
        const toRow = (account) => ({ id: account.id, name: account.name, role: account.role, allowed_apps: account.allowedApps, salt: account.salt, hash: account.hash });
        return {
            name: "supabase",
            async load() {
                const { data, error } = await client().from(table()).select("*");
                if (error) {
                    throw new Error(/42P01|PGRST205|does not exist|Could not find the table/i.test(`${error.message} ${error.code}`)
                        ? "Table des comptes absente : exécuter supabase/01-accounts.sql dans le SQL Editor."
                        : error.message);
                }
                return (data || []).map(fromRow);
            },
            async save(account) {
                const { error } = await client().from(table()).upsert(toRow(account));
                if (error) {
                    throw new Error(/23505|duplicate/i.test(`${error.message} ${error.code}`) ? "Un compte porte déjà ce nom." : error.message);
                }
            },
            async remove(id) {
                const { error } = await client().from(table()).delete().eq("id", id);
                if (error) {
                    throw new Error(error.message);
                }
            }
        };
    }

    // --- Cache et utilitaires --------------------------------------------------------------------------------

    let provider = null;
    let accounts = [];
    let loadPromise = null;
    let loadError = null;
    let loaded = false;

    function getProvider() {
        if (!provider) {
            const wanted = window.Win95Config.accounts?.provider || "local";
            if (wanted === "supabase" && window.Win95Supabase?.getClient()) {
                provider = createSupabaseProvider();
            } else {
                if (wanted === "supabase") {
                    console.warn("[Win95Accounts] Supabase demandé mais non configuré : comptes locaux utilisés.");
                }
                provider = localProvider;
            }
        }
        return provider;
    }

    function notify() {
        window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    }

    function toHex(buffer) {
        return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }

    function createSalt() {
        return toHex(window.crypto.getRandomValues(new Uint8Array(16)));
    }

    async function hashPassword(salt, password) {
        if (!window.crypto?.subtle) {
            throw new Error("Chiffrement indisponible : ouvrez le site en HTTPS ou sur localhost.");
        }
        return toHex(await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${password}`)));
    }

    const sameName = (left, right) => utils().simplifyText(left) === utils().simplifyText(right);
    const sanitizeName = (name) => String(name || "").replace(/[\\/]/g, "-").trim().slice(0, 32);
    const normalizeApps = (allowedApps) => (Array.isArray(allowedApps) ? [...new Set(allowedApps.map(String))] : null);
    const countAdmins = (list) => list.filter((account) => account.role === "admin").length;

    // Copie sans le sel ni le hash, pour l'affichage et la session.
    function toPublic(account) {
        return account && { id: account.id, name: account.name, role: account.role, allowedApps: account.allowedApps ?? null, createdAt: account.createdAt };
    }

    // Écrit un compte chez le fournisseur ; en cas d'échec, le cache n'est pas modifié (on renvoie le message).
    async function persist(nextList, account) {
        await getProvider().save(account, nextList);
        accounts = nextList;
        notify();
    }

    const store = {
        CHANGE_EVENT,
        MIN_PASSWORD_LENGTH,
        ROLES,

        // Remplace le fournisseur (avant ready()). Voir l'en-tête du fichier.
        useProvider(customProvider) {
            provider = customProvider;
            loadPromise = null;
            loaded = false;
        },

        getProviderName() {
            return getProvider().name || "custom";
        },

        // Charge les comptes (une fois). À attendre avant needsSetup() / list().
        ready() {
            if (!loadPromise) {
                loadPromise = getProvider().load()
                    .then((list) => {
                        accounts = Array.isArray(list) ? list.filter((account) => account && account.id && account.name) : [];
                        loadError = null;
                        loaded = true;
                    })
                    .catch((error) => {
                        loadError = error;
                        loaded = true;
                        accounts = [];
                        console.warn("[Win95Accounts] Chargement impossible", error);
                    });
            }
            return loadPromise;
        },

        // true quand les comptes sont chargés (la session ne peut être validée qu'à partir de là).
        isReady() {
            return loaded;
        },

        // Message d'erreur du dernier chargement (fournisseur indisponible), sinon null.
        getLoadError() {
            return loadError?.message || null;
        },

        // Recharge depuis le fournisseur (autre onglet, autre appareil).
        async refresh() {
            loadPromise = null;
            loaded = false;
            await this.ready();
            notify();
        },

        // Aucun compte : le premier démarrage crée l'administrateur.
        needsSetup() {
            return accounts.length === 0;
        },

        list() {
            return accounts.map(toPublic).sort((left, right) => left.name.localeCompare(right.name, "fr", { sensitivity: "base" }));
        },

        get(id) {
            return toPublic(accounts.find((account) => account.id === id));
        },

        findByName(name) {
            return toPublic(accounts.find((account) => sameName(account.name, name)));
        },

        // Empreinte du mot de passe d'un compte : preuve d'identité envoyée aux fonctions serveur (Google Drive).
        getAuthHash(id) {
            return accounts.find((account) => account.id === id)?.hash || "";
        },

        async create({ name, password, role = "user", allowedApps = null }) {
            const cleanName = sanitizeName(name);
            if (!cleanName) {
                return { ok: false, message: "Le nom ne peut pas être vide." };
            }
            if (accounts.some((account) => sameName(account.name, cleanName))) {
                return { ok: false, message: `Un compte nommé « ${cleanName} » existe déjà.` };
            }
            if (String(password || "").length < MIN_PASSWORD_LENGTH) {
                return { ok: false, message: `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.` };
            }
            // Le tout premier compte est toujours administrateur.
            const effectiveRole = accounts.length === 0 ? "admin" : (ROLES.includes(role) ? role : "user");
            try {
                const salt = createSalt();
                const account = {
                    id: utils().createUniqueId("u"),
                    name: cleanName,
                    role: effectiveRole,
                    allowedApps: effectiveRole === "admin" ? null : normalizeApps(allowedApps),
                    salt,
                    hash: await hashPassword(salt, password),
                    createdAt: new Date().toISOString()
                };
                await persist([...accounts, account], account);
                return { ok: true, message: `Compte « ${cleanName} » créé.`, account: toPublic(account) };
            } catch (error) {
                return { ok: false, message: error.message };
            }
        },

        // Modifie le nom, le rôle et/ou les applications autorisées (pas le mot de passe : voir setPassword).
        async update(id, changes) {
            const current = accounts.find((candidate) => candidate.id === id);
            if (!current) {
                return { ok: false, message: "Compte introuvable." };
            }
            const account = { ...current };
            if (changes.name !== undefined) {
                const cleanName = sanitizeName(changes.name);
                if (!cleanName) {
                    return { ok: false, message: "Le nom ne peut pas être vide." };
                }
                if (accounts.some((candidate) => candidate.id !== id && sameName(candidate.name, cleanName))) {
                    return { ok: false, message: `Un compte nommé « ${cleanName} » existe déjà.` };
                }
                account.name = cleanName;
            }
            if (changes.role !== undefined && changes.role !== account.role) {
                if (!ROLES.includes(changes.role)) {
                    return { ok: false, message: "Rôle inconnu." };
                }
                if (account.role === "admin" && countAdmins(accounts) <= 1) {
                    return { ok: false, message: "Il doit rester au moins un administrateur." };
                }
                account.role = changes.role;
            }
            if (changes.allowedApps !== undefined) {
                account.allowedApps = normalizeApps(changes.allowedApps);
            }
            if (account.role === "admin") {
                account.allowedApps = null;
            }
            try {
                await persist(accounts.map((candidate) => (candidate.id === id ? account : candidate)), account);
            } catch (error) {
                return { ok: false, message: error.message };
            }
            return { ok: true, message: `Compte « ${account.name} » enregistré.`, account: toPublic(account) };
        },

        async setPassword(id, password) {
            const current = accounts.find((candidate) => candidate.id === id);
            if (!current) {
                return { ok: false, message: "Compte introuvable." };
            }
            if (String(password || "").length < MIN_PASSWORD_LENGTH) {
                return { ok: false, message: `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.` };
            }
            try {
                const salt = createSalt();
                const account = { ...current, salt, hash: await hashPassword(salt, password) };
                await persist(accounts.map((candidate) => (candidate.id === id ? account : candidate)), account);
            } catch (error) {
                return { ok: false, message: error.message };
            }
            return { ok: true, message: `Mot de passe de « ${current.name} » modifié.` };
        },

        async remove(id) {
            const account = accounts.find((candidate) => candidate.id === id);
            if (!account) {
                return { ok: false, message: "Compte introuvable." };
            }
            if (account.role === "admin" && countAdmins(accounts) <= 1) {
                return { ok: false, message: "Impossible de supprimer le dernier administrateur." };
            }
            try {
                const rest = accounts.filter((candidate) => candidate.id !== id);
                await getProvider().remove(id, rest);
                accounts = rest;
                notify();
            } catch (error) {
                return { ok: false, message: error.message };
            }
            return { ok: true, message: `Compte « ${account.name} » supprimé.`, account: toPublic(account) };
        },

        // Résout le compte (sans hash) si le mot de passe est bon, sinon null.
        async verify(name, password) {
            const account = accounts.find((candidate) => sameName(candidate.name, name));
            if (!account) {
                // Même coût qu'une vérification réelle, pour ne pas révéler quels noms existent.
                await hashPassword("0", String(password || "")).catch(() => null);
                return null;
            }
            const hash = await hashPassword(account.salt, String(password || ""));
            return hash === account.hash ? toPublic(account) : null;
        }
    };

    window.Win95Accounts = store;
    window.Win95Services?.register?.("Win95Accounts", store);
})();
