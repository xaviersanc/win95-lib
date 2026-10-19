(() => {
    // Page de liaison côté téléphone (Win95LocalLinkPhone) : affichée à la place du bureau quand l'adresse contient
    // `?win95link=<jeton>` (le chargeur ne charge alors que le noyau et ce module : ni comptes, ni bureau, ni démarrage).
    // C'est une fenêtre Windows 95 plein écran dont le contenu est VIDE pour le moment : un projet y place son interface avec
    // Win95LocalLink.registerPhonePage (voir local-link-service.js). Aucun échange avec l'ordinateur n'est fait ici.

    const REFRESH_MS = 1000;

    function formatRemaining(milliseconds) {
        const total = Math.max(0, Math.ceil(milliseconds / 1000));
        return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
    }

    function mount(incoming) {
        const appName = window.Win95Config?.appName || "Windows 95";
        document.body.classList.add("win95-desktop", "win95-phone-link");

        const screen = document.createElement("div");
        screen.className = "local-link-phone";
        const windowElement = document.createElement("section");
        windowElement.className = "window local-link-phone-window";
        windowElement.setAttribute("aria-label", "Connexion locale");

        const titleBar = document.createElement("div");
        titleBar.className = "title-bar active window-title-bar";
        const title = document.createElement("div");
        title.className = "title-bar-text";
        title.textContent = `Connexion locale - ${appName}`;
        titleBar.appendChild(title);

        const content = document.createElement("div");
        content.className = "local-link-phone-content windows-scrollbar";
        content.dataset.localLinkPhoneContent = "";
        const status = document.createElement("div");
        status.className = "explorer-status local-link-phone-status";
        status.dataset.localLinkPhoneStatus = "";

        windowElement.append(titleBar, content, status);
        screen.appendChild(windowElement);
        document.body.appendChild(screen);

        const expired = () => incoming.expiresAt !== null && Date.now() >= incoming.expiresAt;
        let customStatus = "";
        let cleanup = null;

        const renderStatus = () => {
            if (!incoming.valid) {
                status.textContent = "Code de connexion non valable.";
            } else if (expired()) {
                status.textContent = "Ce code a expiré. Demandez-en un nouveau sur l'ordinateur.";
            } else if (customStatus) {
                status.textContent = customStatus;
            } else {
                status.textContent = incoming.expiresAt === null
                    ? "Page de liaison vide pour le moment."
                    : `Page de liaison vide pour le moment. Code valable encore ${formatRemaining(incoming.expiresAt - Date.now())}.`;
            }
        };

        // Contenu du projet : seulement avec un code valable et non expiré.
        const mountProjectPage = () => {
            const factory = window.Win95LocalLink?._getPhonePageFactory?.();
            if (!factory || !incoming.valid || expired()) {
                return;
            }
            cleanup?.();
            content.replaceChildren();
            const result = factory(content, {
                token: incoming.token,
                expiresAt: incoming.expiresAt,
                appName,
                setStatus: (message) => {
                    customStatus = String(message ?? "");
                    renderStatus();
                }
            });
            cleanup = typeof result === "function" ? result : null;
        };

        renderStatus();
        window.setInterval(renderStatus, REFRESH_MS);
        window.Win95LocalLink?._setPhoneMount?.(mountProjectPage);
        mountProjectPage();
        window.dispatchEvent(new CustomEvent("win95:local-link-phone-ready", { detail: { token: incoming.token, valid: incoming.valid, expiresAt: incoming.expiresAt } }));
        return screen;
    }

    function start() {
        const incoming = window.Win95LocalLink?.readIncoming?.();
        if (incoming) {
            mount(incoming);
        }
    }

    const api = { mount };
    window.Win95LocalLinkPhone = api;
    window.Win95Services?.register?.("Win95LocalLinkPhone", api);

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();
