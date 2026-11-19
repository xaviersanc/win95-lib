(() => {
    // Plein écran (Win95Fullscreen) : immersion complète du bureau.
    //
    //   Win95Fullscreen.isSupported()   le navigateur le permet (faux sur iPhone, ou dans un cadre sans autorisation)
    //   Win95Fullscreen.isActive()
    //   Win95Fullscreen.enter() / exit() / toggle()   promesses qui ne lèvent jamais d'erreur : { ok, message }
    //   événement "win95:fullscreen-changed" (sur window ; detail : { active })
    //
    // Un navigateur n'autorise le plein écran qu'à la suite d'un geste de l'utilisateur : il est impossible de le forcer au chargement.
    // Avec Win95Config.ui.fullscreenOnFirstGesture, on le demande au premier clic ou à la première touche, UNE seule fois : si le
    // visiteur en sort (Échap), on ne le lui impose pas de nouveau. Win95Config.ui.trayButtons ajoute un bouton dans la zone de
    // notification ; une entrée « Plein écran » du menu Démarrer (Paramètres) existe toujours quand le plein écran est possible.

    const CHANGE_EVENT = "win95:fullscreen-changed";
    const uiConfig = () => window.Win95Config?.ui || {};

    const isSupported = () => Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen);
    const isActive = () => Boolean(document.fullscreenElement);

    async function enter() {
        if (!isSupported()) {
            return { ok: false, message: "Le plein écran n'est pas disponible dans ce navigateur." };
        }
        try {
            await document.documentElement.requestFullscreen({ navigationUI: "hide" });
            return { ok: true, message: "Plein écran (Échap pour en sortir)." };
        } catch {
            return { ok: false, message: "Le navigateur a refusé le plein écran." };
        }
    }

    async function exit() {
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            }
            return { ok: true, message: "Plein écran quitté." };
        } catch {
            return { ok: false, message: "Impossible de quitter le plein écran." };
        }
    }

    const toggle = () => (isActive() ? exit() : enter());

    // --- Interface : entrée du menu Démarrer, bouton de la zone de notification, premier geste ----------------------------------

    function installInterface(manager) {
        if (!isSupported()) {
            return;
        }
        manager.registerApp({
            key: "fullscreen",
            kind: "command",
            label: "Plein écran",
            title: "Plein écran",
            icon: window.Win95Asset("assets/icons/display_properties-4.png"),
            // Pas de fenêtre : l'entrée bascule le plein écran (retourner null laisse le bureau inchangé).
            create: () => {
                void toggle();
                return null;
            },
            startMenu: { path: ["Paramètres"] }
        });

        if (uiConfig().trayButtons) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "btn win95-tray-button";
            button.dataset.win95FullscreenButton = "";
            button.title = "Plein écran (Échap pour en sortir)";
            button.setAttribute("aria-label", "Basculer en plein écran");
            const image = document.createElement("img");
            image.src = window.Win95Asset("assets/icons/display_properties-4.png");
            image.alt = "";
            button.appendChild(image);
            button.addEventListener("click", () => void toggle());
            manager.addTrayItem(button);
        }

        if (uiConfig().fullscreenOnFirstGesture) {
            const onFirstGesture = (event) => {
                if (event.type === "keydown" && event.key === "Escape") {
                    return;
                }
                window.removeEventListener("pointerdown", onFirstGesture, true);
                window.removeEventListener("keydown", onFirstGesture, true);
                // Un premier clic sur le bouton de bascule le gère lui-même : sinon il entrerait puis sortirait aussitôt.
                const onButton = event.target instanceof Element && event.target.closest("[data-win95-fullscreen-button]");
                if (!isActive() && !onButton) {
                    void enter();
                }
            };
            window.addEventListener("pointerdown", onFirstGesture, true);
            window.addEventListener("keydown", onFirstGesture, true);
        }
    }

    document.addEventListener("fullscreenchange", () => {
        window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { active: isActive() } }));
    });
    window.addEventListener("win95:window-manager-ready", () => installInterface(window.Win95WindowManager), { once: true });

    const api = { CHANGE_EVENT, isSupported, isActive, enter, exit, toggle };
    window.Win95Fullscreen = api;
    window.Win95Services?.register?.("Win95Fullscreen", api);
})();
