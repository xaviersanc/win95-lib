(() => {
    // Réglages déclaratifs par compte (Win95Settings) : on décrit des champs, la bibliothèque s'occupe du stockage, de la validation,
    // des valeurs par défaut, de l'événement de changement et de l'application de l'effet (`apply`, rappelé à l'ouverture de session).
    //
    //   const store = Win95Settings.define("clavier", {
    //       fields: [
    //           { key: "repeatDelay", type: "slider", min: 0, max: 3, step: 1, default: 1 },
    //           { key: "layout", type: "select", options: [{ value: "azerty", label: "AZERTY" }, { value: "qwerty", label: "QWERTY" }], default: "azerty" },
    //           { key: "clicks", type: "checkbox", default: true },
    //           { key: "signature", type: "text", maxLength: 40, default: "" }
    //       ],
    //       apply(values) { document.body.dataset.layout = values.layout; }   // l'effet réel du réglage
    //   });
    //   store.get("layout") · store.getAll() · store.save({ layout: "qwerty" }) → { ok, message } · store.reset() · store.onChange(fn) → désabonnement
    //
    // Types : checkbox (booléen), slider / number (nombre borné par min / max / step), select / radio (valeur parmi options), text (chaîne, maxLength).
    // Les mêmes descriptions de champs servent à dessiner l'interface (Win95PropertyFields, Panneau de configuration).
    // Stockage : localStorage "win95.settings.<ns>.v1.<id du compte>" (suffixe .<id> : purgé avec le compte). Événement : "win95:settings-changed"
    // (detail : { ns, values }). Sans session ouverte, rien n'est lu ni écrit : les valeurs par défaut sont renvoyées et save() refuse.

    const PREFIX = "win95.settings";
    const CHANGE_EVENT = "win95:settings-changed";
    const SETTING_TYPES = ["checkbox", "slider", "number", "select", "radio", "text"];
    const NAMESPACE_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

    const utils = () => window.Win95Utils;
    const stores = new Map();

    const isSetting = (field) => Boolean(field && field.key && SETTING_TYPES.includes(field.type));

    function normalizeOptions(options = []) {
        return options.map((option) => (option && typeof option === "object" ? option : { value: option, label: String(option) }));
    }

    // Ramène une valeur lue (stockage, interface) à une valeur valide pour le champ ; valeur par défaut sinon.
    function coerce(field, value) {
        switch (field.type) {
            case "checkbox":
                return typeof value === "boolean" ? value : Boolean(field.default);
            case "slider":
            case "number": {
                const fallback = field.default ?? field.min ?? 0;
                const number = Number(value);
                if (value === null || value === undefined || value === "" || !Number.isFinite(number)) {
                    return fallback;
                }
                let result = Math.min(field.max ?? Infinity, Math.max(field.min ?? -Infinity, number));
                if (field.step > 0) {
                    result = Number((Math.round(result / field.step) * field.step).toFixed(6));
                }
                return result;
            }
            case "select":
            case "radio": {
                const options = normalizeOptions(field.options);
                const found = options.find((option) => String(option.value) === String(value));
                return found ? found.value : (field.default ?? options[0]?.value);
            }
            default:
                return typeof value === "string" ? value.slice(0, field.maxLength || 500) : (field.default ?? "");
        }
    }

    function define(ns, { fields = [], apply = null } = {}) {
        if (!NAMESPACE_PATTERN.test(ns || "")) {
            throw new Error("Win95Settings.define : espace de noms obligatoire (minuscules, chiffres et tirets).");
        }
        let store = stores.get(ns);
        if (!store) {
            store = createStore(ns);
            stores.set(ns, store);
        }
        store.configure(fields.filter(isSetting), apply);
        return store;
    }

    function createStore(ns) {
        const schema = new Map();
        let applyFn = null;
        let cache = null;

        const hasSession = () => utils().getCurrentUserId() !== "invite";
        const storageKey = () => `${PREFIX}.${ns}.v1.${utils().getCurrentUserId()}`;

        function read() {
            const userId = utils().getCurrentUserId();
            if (cache && cache.userId === userId) {
                return cache.values;
            }
            const raw = hasSession() ? (utils().readStoredJson(storageKey(), null) || {}) : {};
            const values = {};
            schema.forEach((field, key) => {
                values[key] = coerce(field, raw[key]);
            });
            cache = { userId, values };
            return values;
        }

        function runApply() {
            try {
                applyFn?.({ ...read() }, store);
            } catch (error) {
                console.error(`Win95Settings « ${ns} » : apply a échoué.`, error);
            }
        }

        function commit(values) {
            const written = utils().writeStoredJson(storageKey(), values);
            cache = { userId: utils().getCurrentUserId(), values };
            runApply();
            window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { ns, values: { ...values } } }));
            return written;
        }

        const store = {
            ns,

            // Déclare (ou complète) les champs ; un champ de même clé est remplacé. `apply` : effet à rejouer à chaque changement et à l'ouverture de session.
            configure(fields, apply) {
                fields.forEach((field) => schema.set(field.key, field));
                if (apply) {
                    applyFn = apply;
                }
                cache = null;
                runApply();
            },

            fields() {
                return Array.from(schema.values());
            },

            get(key) {
                return read()[key];
            },

            getAll() {
                return { ...read() };
            },

            // Enregistre un sous-ensemble de valeurs (les clés inconnues sont ignorées, les valeurs invalides ramenées au défaut).
            save(partial = {}) {
                if (!hasSession()) {
                    return { ok: false, message: "Aucune session ouverte : réglages non enregistrés." };
                }
                const next = { ...read() };
                Object.keys(partial).forEach((key) => {
                    if (schema.has(key)) {
                        next[key] = coerce(schema.get(key), partial[key]);
                    }
                });
                // Appliqué même si le stockage est plein : l'effet vaut pour la session en cours.
                return commit(next)
                    ? { ok: true, message: "Réglages enregistrés." }
                    : { ok: false, message: "Réglages appliqués mais non enregistrés (stockage du navigateur plein)." };
            },

            reset() {
                const defaults = {};
                schema.forEach((field, key) => {
                    defaults[key] = coerce(field, undefined);
                });
                if (hasSession()) {
                    commit(defaults);
                }
                return { ok: hasSession(), message: hasSession() ? "Réglages par défaut rétablis." : "Aucune session ouverte." };
            },

            onChange(listener) {
                const handler = (event) => {
                    if (event.detail?.ns === ns) {
                        listener({ ...event.detail.values });
                    }
                };
                window.addEventListener(CHANGE_EVENT, handler);
                return () => window.removeEventListener(CHANGE_EVENT, handler);
            },

            // Relit le stockage (changement de compte) et rejoue l'effet.
            refresh() {
                cache = null;
                runApply();
            }
        };
        return store;
    }

    // Changement de compte : chaque store relit ses valeurs et rejoue son effet.
    const refreshAll = () => stores.forEach((store) => store.refresh());
    window.addEventListener("win95:auth-changed", refreshAll);
    window.addEventListener("win95:auth-logout", refreshAll);

    const api = {
        CHANGE_EVENT,
        SETTING_TYPES,
        define,
        isSetting,
        coerce,
        normalizeOptions,
        has: (ns) => stores.has(ns),
        store: (ns) => stores.get(ns) || null,
        get: (ns, key) => stores.get(ns)?.get(key)
    };

    window.Win95Settings = api;
    window.Win95Services?.register?.("Win95Settings", api);
})();
