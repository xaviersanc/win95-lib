(() => {
    // Écran de veille (Win95ScreenSaver) : se lance après une période d'inactivité (souris, clavier, toucher) et s'interrompt
    // au moindre mouvement. Réglé dans Panneau de configuration > Affichage > Écran de veille.
    //  - SAVERS : (Aucun), Écran noir, Champ d'étoiles, Texte défilant, Tuyaux 3D (dessinés par Win95ScreenSaverEffects) ;
    //  - « Protégé par mot de passe » : au réveil, le mot de passe du compte est demandé (Win95Accounts) ;
    //  - réglages par compte : localStorage "win95.screensaver.v1.<id>" = { saver, waitSeconds, text, passwordProtected }.
    // Aucun écran de veille ne se lance sans session ouverte. Émet "win95:screensaver-changed".

    const STORAGE_PREFIX = "win95.screensaver.v1";
    const CHANGE_EVENT = "win95:screensaver-changed";
    const MIN_WAIT_SECONDS = 5;
    const MAX_WAIT_SECONDS = 60 * 60;
    const DEFAULT_WAIT_SECONDS = 10 * 60;
    // Tolérance au réveil : le curseur doit bouger de plus que ça, et pas pendant la première demi-seconde.
    const WAKE_DISTANCE_PX = 6;
    const WAKE_GRACE_MS = 500;
    const SAVERS = [
        { key: "none", label: "(Aucun)", effect: null },
        { key: "blank", label: "Écran noir", effect: "blank" },
        { key: "stars", label: "Champ d'étoiles", effect: "stars" },
        { key: "text", label: "Texte défilant", effect: "text", hasSettings: true },
        { key: "pipes", label: "Tuyaux 3D", effect: "pipes" }
    ];

    const utils = () => window.Win95Utils;
    let lastActivity = performance.now();
    let active = null;

    function getStorageKey() {
        return `${STORAGE_PREFIX}.${utils().getCurrentUserId()}`;
    }

    function readState() {
        const raw = utils().readStoredJson(getStorageKey(), null);
        const wait = Number(raw?.waitSeconds);
        return {
            saver: SAVERS.some((saver) => saver.key === raw?.saver) ? raw.saver : "none",
            waitSeconds: Number.isFinite(wait) ? Math.min(MAX_WAIT_SECONDS, Math.max(MIN_WAIT_SECONDS, Math.round(wait))) : DEFAULT_WAIT_SECONDS,
            text: String(raw?.text || "Windows 95").slice(0, 60),
            passwordProtected: raw?.passwordProtected === true
        };
    }

    function runEffect(canvas, saverKey, options) {
        const saver = SAVERS.find((candidate) => candidate.key === saverKey);
        const effects = window.Win95ScreenSaverEffects;
        const effect = saver?.effect && effects ? effects[saver.effect] : effects?.blank;
        return effect ? effect(canvas, options) : { stop() {} };
    }

    function hasSession() {
        return !window.Win95Security || Boolean(window.Win95Security.getCurrentUser());
    }

    // --- Lancement / réveil ----------------------------------------------------------------------------------

    function start({ saverKey = null, preview = false, text = null } = {}) {
        if (active) {
            return false;
        }
        const state = readState();
        const key = saverKey || state.saver;
        if (key === "none" && !preview) {
            return false;
        }

        const overlay = document.createElement("div");
        overlay.className = "screensaver";
        overlay.setAttribute("role", "presentation");
        const canvas = document.createElement("canvas");
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        overlay.appendChild(canvas);
        document.body.appendChild(overlay);
        document.body.classList.add("screensaver-on");

        const effect = runEffect(canvas, key === "none" ? "blank" : key, { text: text ?? state.text });
        const startedAt = performance.now();
        let origin = null;
        let locked = false;

        const stopEverything = () => {
            effect.stop();
            overlay.remove();
            document.body.classList.remove("screensaver-on");
            ["mousemove", "mousedown", "keydown", "wheel", "touchstart", "pointerdown"].forEach((type) => window.removeEventListener(type, wake, true));
            window.removeEventListener("resize", stopEverything);
            active = null;
            lastActivity = performance.now();
        };

        function wake(event) {
            if (locked) {
                return;
            }
            if (event.type === "mousemove") {
                if (performance.now() - startedAt < WAKE_GRACE_MS) {
                    return;
                }
                origin = origin || { x: event.clientX, y: event.clientY };
                if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) < WAKE_DISTANCE_PX) {
                    return;
                }
            }
            if (event.type !== "mousemove" && performance.now() - startedAt < WAKE_GRACE_MS) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            if (state.passwordProtected && !preview && window.Win95Security?.getCurrentUser()) {
                locked = true;
                askPassword(overlay, () => stopEverything(), () => {
                    locked = false;
                    origin = null;
                });
                return;
            }
            stopEverything();
        }

        ["mousemove", "mousedown", "keydown", "wheel", "touchstart", "pointerdown"].forEach((type) => window.addEventListener(type, wake, { capture: true, passive: false }));
        window.addEventListener("resize", stopEverything, { once: true });
        active = { stop: stopEverything };
        return true;
    }

    // Mot de passe demandé au réveil (écran de veille protégé) : celui du compte connecté.
    function askPassword(overlay, onSuccess, onCancel) {
        const user = window.Win95Security.getCurrentUser();
        const box = document.createElement("form");
        box.className = "screensaver-lock";
        box.innerHTML = `
            <div class="modal-content">
                <div class="modal-header"><div class="modal-title">Écran de veille protégé</div></div>
                <div class="modal-body screensaver-lock-body">
                    <p class="screensaver-lock-text"></p>
                    <input type="password" class="form-95 screensaver-lock-input" autocomplete="off" aria-label="Mot de passe">
                    <p class="screensaver-lock-error" role="alert"></p>
                </div>
                <div class="modal-footer screensaver-lock-footer">
                    <button type="submit" class="btn start-btn">OK</button>
                    <button type="button" class="btn start-btn" data-cancel>Annuler</button>
                </div>
            </div>`;
        box.querySelector(".screensaver-lock-text").textContent = `Cet ordinateur est utilisé par ${user.userName}. Entrez le mot de passe pour le déverrouiller.`;
        const input = box.querySelector("input");
        const error = box.querySelector(".screensaver-lock-error");
        const close = () => {
            box.remove();
            onCancel();
        };
        box.querySelector("[data-cancel]").addEventListener("click", close);
        box.addEventListener("keydown", (event) => {
            event.stopPropagation();
            if (event.key === "Escape") {
                close();
            }
        });
        box.addEventListener("submit", async (event) => {
            event.preventDefault();
            const account = await window.Win95Accounts.verify(user.userName, input.value);
            if (account && account.id === user.userId) {
                onSuccess();
            } else {
                error.textContent = "Mot de passe incorrect.";
                input.value = "";
                input.focus();
            }
        });
        overlay.appendChild(box);
        input.focus();
    }

    // --- Inactivité ------------------------------------------------------------------------------------------

    const markActive = () => {
        lastActivity = performance.now();
    };
    ["mousemove", "mousedown", "keydown", "wheel", "touchstart", "pointerdown"].forEach((type) => window.addEventListener(type, markActive, { capture: true, passive: true }));
    window.addEventListener("win95:auth-changed", markActive);

    window.setInterval(() => {
        if (active || !hasSession()) {
            return;
        }
        const state = readState();
        if (state.saver !== "none" && performance.now() - lastActivity >= state.waitSeconds * 1000) {
            start();
        }
    }, 1000);

    const screenSaver = {
        CHANGE_EVENT,
        SAVERS,
        MIN_WAIT_SECONDS,
        MAX_WAIT_SECONDS,

        getState() {
            return readState();
        },

        save({ saver, waitSeconds, text, passwordProtected }) {
            const current = readState();
            utils().writeStoredJson(getStorageKey(), {
                saver: saver ?? current.saver,
                waitSeconds: waitSeconds ?? current.waitSeconds,
                text: text ?? current.text,
                passwordProtected: passwordProtected ?? current.passwordProtected
            });
            lastActivity = performance.now();
            window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
            return { ok: true, message: "Écran de veille enregistré." };
        },

        // Lance l'écran de veille tout de suite (aperçu : sans mot de passe, même pour un écran de veille protégé).
        start,

        isActive() {
            return Boolean(active);
        },

        stop() {
            active?.stop();
        },

        // Aperçu réduit dans un canvas (onglet Écran de veille) ; renvoie { stop }.
        createPreview(canvas, saverKey, options = {}) {
            return runEffect(canvas, saverKey === "none" ? "blank" : saverKey, { text: readState().text, ...options });
        }
    };

    window.Win95ScreenSaver = screenSaver;
    window.Win95Services?.register?.("Win95ScreenSaver", screenSaver);
})();
