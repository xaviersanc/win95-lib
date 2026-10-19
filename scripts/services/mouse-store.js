(() => {
    // Souris (Win95Mouse) : vitesse du double-clic et forme du pointeur, réglées dans Panneau de configuration > Souris.
    //  - Double-clic : le double-clic natif du navigateur (vitesse fixée par le système) est remplacé par un double-clic
    //    recomposé : deux clics à moins de `doubleClickMs` ms et de 4 px l'un de l'autre émettent un "dblclick" (non fiable,
    //    donc distinct du natif, qui est bloqué). Tous les composants qui écoutent "dblclick" en profitent sans changement.
    //  - Pointeur : attribut data-cursor-scheme sur <body> ("standard", "large", "cross"), stylé dans mouse.css.
    // Réglages par compte : localStorage "win95.mouse.v1.<id>". Émet "win95:mouse-changed".

    const STORAGE_PREFIX = "win95.mouse.v1";
    const CHANGE_EVENT = "win95:mouse-changed";
    const MIN_DOUBLE_CLICK_MS = 150;
    const MAX_DOUBLE_CLICK_MS = 900;
    const DEFAULT_DOUBLE_CLICK_MS = 500;
    const DOUBLE_CLICK_DISTANCE_PX = 4;
    const SCHEMES = [
        { key: "standard", label: "Windows standard", description: "Flèche blanche à contour noir." },
        { key: "large", label: "Windows standard (grand)", description: "La même flèche, en grand." },
        { key: "cross", label: "Croix", description: "Un viseur en croix." }
    ];

    const utils = () => window.Win95Utils;

    function getStorageKey() {
        return `${STORAGE_PREFIX}.${utils().getCurrentUserId()}`;
    }

    function readState() {
        const raw = utils().readStoredJson(getStorageKey(), null);
        const ms = Number(raw?.doubleClickMs);
        return {
            doubleClickMs: Number.isFinite(ms) ? Math.min(MAX_DOUBLE_CLICK_MS, Math.max(MIN_DOUBLE_CLICK_MS, Math.round(ms))) : DEFAULT_DOUBLE_CLICK_MS,
            cursorScheme: SCHEMES.some((scheme) => scheme.key === raw?.cursorScheme) ? raw.cursorScheme : "standard"
        };
    }

    function applyCursorScheme() {
        document.body?.setAttribute("data-cursor-scheme", readState().cursorScheme);
    }

    // --- Double-clic recomposé ------------------------------------------------------------

    let lastClick = null;

    // Le double-clic natif est bloqué (il suit la vitesse du système) ; seul le nôtre, non fiable, passe.
    window.addEventListener("dblclick", (event) => {
        if (event.isTrusted) {
            event.stopImmediatePropagation();
        }
    }, true);

    window.addEventListener("click", (event) => {
        if (!event.isTrusted || event.button !== 0) {
            return;
        }
        const now = performance.now();
        const isDouble = lastClick
            && now - lastClick.time <= readState().doubleClickMs
            && Math.abs(event.clientX - lastClick.x) <= DOUBLE_CLICK_DISTANCE_PX
            && Math.abs(event.clientY - lastClick.y) <= DOUBLE_CLICK_DISTANCE_PX;
        if (!isDouble) {
            lastClick = { time: now, x: event.clientX, y: event.clientY };
            return;
        }

        lastClick = null;
        const { clientX, clientY, shiftKey, ctrlKey, altKey, metaKey } = event;
        const fallbackTarget = event.target;
        // Après les gestionnaires du 2e clic : certains redessinent la liste, l'élément visé est alors un nouveau nœud.
        window.setTimeout(() => {
            const target = document.elementFromPoint(clientX, clientY) || fallbackTarget;
            target.dispatchEvent(new MouseEvent("dblclick", {
                bubbles: true, cancelable: true, composed: true, view: window,
                clientX, clientY, shiftKey, ctrlKey, altKey, metaKey, button: 0, detail: 2
            }));
        }, 0);
    }, true);

    const mouse = {
        CHANGE_EVENT,
        SCHEMES,
        MIN_DOUBLE_CLICK_MS,
        MAX_DOUBLE_CLICK_MS,
        DEFAULT_DOUBLE_CLICK_MS,

        getState() {
            return readState();
        },

        save({ doubleClickMs, cursorScheme }) {
            const current = readState();
            utils().writeStoredJson(getStorageKey(), {
                doubleClickMs: doubleClickMs ?? current.doubleClickMs,
                cursorScheme: cursorScheme ?? current.cursorScheme
            });
            applyCursorScheme();
            window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
            return { ok: true, message: "Réglages de la souris enregistrés." };
        },

        apply: applyCursorScheme
    };

    window.addEventListener("win95:auth-changed", applyCursorScheme);
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", applyCursorScheme, { once: true });
    } else {
        applyCursorScheme();
    }

    window.Win95Mouse = mouse;
    window.Win95Services?.register?.("Win95Mouse", mouse);
})();
