(() => {
    // Session et écran d'ouverture de session (Win95Security).
    //  - premier démarrage (aucun compte) : écran de création de l'administrateur ;
    //  - sinon : écran « Ouverture de session » tant qu'aucune session n'est ouverte ;
    //  - la session (id du compte) vit dans sessionStorage : elle survit au rechargement, pas à la fermeture de l'onglet.
    // Émet "win95:auth-changed" à l'ouverture d'une session et "win95:auth-logout" à sa fermeture.
    // Les droits sont appliqués côté client (voir la limite décrite dans accounts-store.js).

    const SESSION_KEY = "win95.session.v1";
    // Application réservée aux administrateurs.
    const ADMIN_ONLY_APPS = ["user-manager"];
    // Applets du Panneau de configuration : même droit d'accès que lui (clé = applet, valeur = application parente).
    const APP_PARENTS = {
        "display-properties": "control-panel",
        "date-time": "control-panel",
        "mouse": "control-panel",
        "sounds": "control-panel",
        "system-properties": "control-panel",
        "add-remove-programs": "control-panel"
    };

    const accounts = () => window.Win95Accounts;
    let currentId = readSession();
    let screenElement = null;

    function readSession() {
        try {
            return sessionStorage.getItem(SESSION_KEY) || null;
        } catch {
            return null;
        }
    }

    function writeSession(id) {
        currentId = id;
        try {
            if (id) {
                sessionStorage.setItem(SESSION_KEY, id);
            } else {
                sessionStorage.removeItem(SESSION_KEY);
            }
        } catch {
            // Sans sessionStorage, la session ne dure que jusqu'au rechargement.
        }
    }

    function getAccount() {
        // Tant que les comptes ne sont pas chargés, la session ne peut être ni validée ni effacée.
        if (!accounts().isReady()) {
            return null;
        }
        const account = currentId ? accounts().get(currentId) : null;
        if (currentId && !account) {
            writeSession(null);
        }
        return account;
    }

    function setLocked(locked) {
        document.body.classList.toggle("session-locked", locked);
    }

    // Supprime les données locales d'un compte supprimé (documents IndexedDB, bureau, fond, raccourcis, Corbeille).
    function purgeUserData(id) {
        try {
            indexedDB.deleteDatabase(`${window.Win95Config?.dbName || "win95-files"}-${id}`);
            Object.keys(localStorage)
                .filter((key) => key.endsWith(`.${id}`))
                .forEach((key) => localStorage.removeItem(key));
        } catch {
            // Stockage indisponible : rien à nettoyer.
        }
    }

    // --- Écran de connexion ----------------------------------------------------------------

    function buildScreen({ title, intro, fields, submitLabel }) {
        const screen = document.createElement("div");
        screen.className = "security-screen";
        screen.innerHTML = `
            <div class="modal-dialog security-box" role="dialog" aria-modal="true" aria-label="${window.Win95Utils.escapeHtml(title)}">
                <div class="modal-content">
                    <div class="modal-header"><div class="modal-title"></div></div>
                    <form class="modal-body security-body" autocomplete="off">
                        <img alt="" class="security-icon" src="${window.Win95Asset("assets/icons/windows-0.png")}">
                        <div class="security-fields">
                            <p class="security-intro"></p>
                        </div>
                        <p class="security-error" role="alert" aria-live="polite"></p>
                        <div class="security-actions">
                            <button type="submit" class="btn start-btn security-submit"></button>
                        </div>
                    </form>
                </div>
            </div>`;
        screen.querySelector(".modal-title").textContent = title;
        screen.querySelector(".security-intro").textContent = intro;
        screen.querySelector(".security-submit").textContent = submitLabel;
        const container = screen.querySelector(".security-fields");
        fields.forEach((field) => {
            const wrapper = document.createElement("div");
            wrapper.className = "security-field";
            const label = document.createElement("label");
            label.textContent = field.label;
            const input = document.createElement("input");
            input.className = "form-95 security-input";
            input.name = field.name;
            input.type = field.type;
            input.maxLength = 200;
            input.autocomplete = field.type === "password" ? "off" : "username";
            label.htmlFor = input.id = `security-${field.name}`;
            wrapper.append(label, input);
            container.appendChild(wrapper);
        });
        return screen;
    }

    function showScreen(config, onSubmit) {
        screenElement?.remove();
        const screen = buildScreen(config);
        screenElement = screen;
        const form = screen.querySelector("form");
        const errorElement = screen.querySelector(".security-error");
        const submit = screen.querySelector(".security-submit");
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            submit.disabled = true;
            errorElement.textContent = "";
            const values = Object.fromEntries(Array.from(form.elements).filter((element) => element.name).map((element) => [element.name, element.value]));
            try {
                const error = await onSubmit(values);
                if (error) {
                    errorElement.textContent = error;
                    submit.disabled = false;
                    form.elements.password?.select();
                    return;
                }
            } catch (error) {
                errorElement.textContent = error?.message || "Opération impossible.";
                submit.disabled = false;
                return;
            }
            screen.remove();
            if (screenElement === screen) {
                screenElement = null;
            }
        });
        setLocked(true);
        document.body.appendChild(screen);
        window.setTimeout(() => (form.elements.name ? (form.elements.name.value ? form.elements.password : form.elements.name) : submit).focus(), 0);
    }

    function showSetup() {
        showScreen({
            title: "Bienvenue dans Windows 95",
            intro: "Premier démarrage : créez le compte administrateur. Lui seul pourra créer et adapter les autres comptes.",
            fields: [
                { name: "name", label: "Nom de l'administrateur :", type: "text" },
                { name: "password", label: `Mot de passe (${accounts().MIN_PASSWORD_LENGTH} caractères minimum) :`, type: "password" },
                { name: "confirm", label: "Confirmer le mot de passe :", type: "password" }
            ],
            submitLabel: "Créer"
        }, async ({ name, password, confirm }) => {
            if (password !== confirm) {
                return "Les deux mots de passe sont différents.";
            }
            const result = await accounts().create({ name, password, role: "admin" });
            if (!result.ok) {
                return result.message;
            }
            openSession(result.account);
            return null;
        });
    }

    function showLogin(lastName = "") {
        showScreen({
            title: "Ouverture de session",
            intro: "Entrez votre nom d'utilisateur et votre mot de passe.",
            fields: [
                { name: "name", label: "Nom d'utilisateur :", type: "text" },
                { name: "password", label: "Mot de passe :", type: "password" }
            ],
            submitLabel: "OK"
        }, async ({ name, password }) => {
            const account = await accounts().verify(name, password);
            if (!account) {
                return "Nom d'utilisateur ou mot de passe incorrect.";
            }
            openSession(account);
            return null;
        });
        if (lastName) {
            screenElement.querySelector("[name='name']").value = lastName;
        }
    }

    // Fournisseur de comptes injoignable (Supabase absent, table non créée…) : message et nouvel essai.
    function showFailure(message) {
        showScreen({
            title: "Comptes indisponibles",
            intro: message,
            fields: [],
            submitLabel: "Réessayer"
        }, async () => {
            await accounts().refresh();
            await security.start();
            return null;
        });
    }

    function openSession(account) {
        writeSession(account.id);
        setLocked(false);
        window.dispatchEvent(new CustomEvent("win95:auth-changed", { detail: { userId: account.id } }));
        window.Win95Sounds?.play("windows-start");
    }

    const security = {
        ADMIN_ONLY_APPS,
        APP_PARENTS,

        // { userId, userName, role, allowedApps } du compte connecté, ou null.
        getCurrentUser() {
            const account = getAccount();
            return account && { userId: account.id, userName: account.name, role: account.role, allowedApps: account.allowedApps };
        },

        isAdmin() {
            return this.getCurrentUser()?.role === "admin";
        },

        // Droit d'ouvrir une application : admin = tout ; application réservée aux admins ; sinon liste du compte.
        canOpenApp(appName) {
            const user = this.getCurrentUser();
            if (!user) {
                return false;
            }
            // Module exclu au chargement (Win95Config.exclude) ou programme supprimé (Ajout/Suppression de programmes) : refusé à tous.
            if (window.Win95Loader?.disabledApps?.includes(appName) || window.Win95Programs?.isHidden(appName)) {
                return false;
            }
            if (user.role === "admin") {
                return true;
            }
            appName = APP_PARENTS[appName] || appName;
            if (ADMIN_ONLY_APPS.includes(appName)) {
                return false;
            }
            return user.allowedApps === null || user.allowedApps.includes(appName);
        },

        logout() {
            const lastName = this.getCurrentUser()?.userName || "";
            writeSession(null);
            window.dispatchEvent(new CustomEvent("win95:auth-logout"));
            showLogin(lastName);
        },

        purgeUserData,

        // Affiche l'écran adapté au démarrage (après le chargement des comptes chez leur fournisseur).
        async start() {
            await accounts().ready();
            const failure = accounts().getLoadError();
            if (failure) {
                showFailure(failure);
            } else if (accounts().needsSetup()) {
                writeSession(null);
                showSetup();
            } else if (getAccount()) {
                // Session conservée (rechargement) : le bureau, démarré sans compte, charge maintenant celui-ci.
                setLocked(false);
                window.dispatchEvent(new CustomEvent("win95:auth-changed", { detail: { userId: currentId, restored: true } }));
            } else {
                showLogin();
            }
        }
    };

    // Compte supprimé ou modifié depuis un autre onglet / par l'admin : session fermée si le compte a disparu.
    window.addEventListener("win95:accounts-changed", () => {
        if (currentId && !accounts().get(currentId)) {
            security.logout();
        }
    });

    window.Win95Security = security;
    window.Win95Services?.register?.("Win95Security", security);

    // Le verrou est posé tout de suite pour que le bureau ne s'affiche pas avant l'écran de connexion.
    setLocked(true);
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => security.start(), { once: true });
    } else {
        security.start();
    }
})();
