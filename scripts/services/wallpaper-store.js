(() => {
    // Fond d'écran du Bureau (Panneau de configuration > Affichage) : 6 fonds dans l'esprit de Windows 95, dessinés en CSS
    // (scripts/window-manager/window-manager.css, sélecteur [data-wallpaper]) ; "Nuages" utilise assets/clouds2.jpg.
    // Le choix est mémorisé dans le navigateur (comme la disposition du bureau) et appliqué au démarrage.
    // Tout changement émet "win95:wallpaper-changed".

    const CHANGE_EVENT = "win95:wallpaper-changed";
    const STORAGE_PREFIX = "win95.wallpaper";
    const WALLPAPERS = [
        { key: "sarcelle", label: "Sarcelle", description: "Le bleu-vert d'origine de Windows 95." },
        { key: "nuages", label: "Nuages", description: "Un ciel d'été, comme au démarrage." },
        { key: "installation", label: "Installation", description: "Le dégradé bleu de l'écran d'installation." },
        { key: "rivets", label: "Rivets bleus", description: "Plaque de métal bleu nuit, rivetée." },
        { key: "paille", label: "Natte de paille", description: "Tressage chaud, couleur paille." },
        { key: "briques", label: "Briques rouges", description: "Mur de briques rouges et joints clairs." }
    ];
    const DEFAULT_KEY = WALLPAPERS[0].key;

    function getStorageKey() {
        return `${STORAGE_PREFIX}.${window.Win95Utils.getCurrentUserId()}`;
    }

    function readKey() {
        try {
            const key = localStorage.getItem(getStorageKey());
            return WALLPAPERS.some((wallpaper) => wallpaper.key === key) ? key : DEFAULT_KEY;
        } catch {
            return DEFAULT_KEY;
        }
    }

    const store = {
        CHANGE_EVENT,
        WALLPAPERS,

        getCurrent() {
            return readKey();
        },

        // Applique le fond mémorisé au Bureau (attribut data-wallpaper de l'élément .desktop).
        apply() {
            const desktop = document.querySelector(".desktop");
            if (desktop) {
                desktop.dataset.wallpaper = readKey();
            }
        },

        set(key) {
            const wallpaper = WALLPAPERS.find((candidate) => candidate.key === key);
            if (!wallpaper) {
                return { ok: false, message: "Fond d'écran inconnu." };
            }
            try {
                localStorage.setItem(getStorageKey(), wallpaper.key);
            } catch {
                // Sans stockage, le fond reste appliqué jusqu'au rechargement de la page.
            }
            const desktop = document.querySelector(".desktop");
            if (desktop) {
                desktop.dataset.wallpaper = wallpaper.key;
            }
            window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
            return { ok: true, message: `Fond d'écran : ${wallpaper.label}.` };
        }
    };

    // Chaque compte retrouve son fond à l'ouverture de sa session.
    window.addEventListener("win95:auth-changed", () => store.apply());
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => store.apply(), { once: true });
    } else {
        store.apply();
    }

    window.Win95Wallpaper = store;
    window.Win95Services?.register?.("Win95Wallpaper", store);
})();
