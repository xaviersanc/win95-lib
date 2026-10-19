(() => {
    // Application « Connexion locale » (Win95LocalLinkApp), côté ordinateur : à l'ouverture elle demande une session temporaire à
    // Win95LocalLink et affiche son adresse en QR code ; le téléphone qui le scanne arrive sur la page de liaison (local-link-phone.js).
    // « Nouveau code » remplace la session (l'ancien code cesse d'être valable) ; fermer la fenêtre ferme la session.

    const QR_BOX_PIXELS = 220;
    const REFRESH_MS = 1000;

    function formatRemaining(milliseconds) {
        const total = Math.max(0, Math.ceil(milliseconds / 1000));
        return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
    }

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) {
            node.className = className;
        }
        if (text !== undefined) {
            node.textContent = text;
        }
        return node;
    }

    class Win95LocalLinkApp {
        constructor(rootElement) {
            this.rootElement = rootElement;
            this.bodyElement = rootElement.querySelector("[data-app-body]");
            if (!this.bodyElement) {
                return;
            }
            this.link = window.Win95LocalLink;
            this.bodyElement.classList.add("local-link-app");
            this.build();

            this.boundOnChange = () => this.render();
            window.addEventListener(this.link.CHANGE_EVENT, this.boundOnChange);
            this.timer = window.setInterval(() => this.renderTimer(), REFRESH_MS);
            rootElement.addEventListener("win95:window-closed", () => {
                window.removeEventListener(this.link.CHANGE_EVENT, this.boundOnChange);
                window.clearInterval(this.timer);
                this.link.closeSession();
            }, { once: true });

            rootElement.__win95LocalLinkInstance = this;
            this.link.createSession();
        }

        build() {
            const body = element("div", "local-link-body");
            this.intro = element("p", "local-link-intro", "Scannez ce code avec l'appareil photo de votre téléphone pour ouvrir la page de liaison avec cet ordinateur.");

            this.qrBox = element("div", "local-link-qr");
            this.canvas = element("canvas", "local-link-canvas");
            this.canvas.setAttribute("role", "img");
            this.canvas.setAttribute("aria-label", "QR code de connexion locale");
            this.expiredLabel = element("div", "local-link-expired", "Code expiré");
            this.expiredLabel.hidden = true;
            this.qrBox.append(this.canvas, this.expiredLabel);

            this.timerLabel = element("div", "local-link-timer");

            const addressLabel = element("label", "local-link-label", "Adresse à ouvrir sur le téléphone :");
            this.address = element("input", "form-95 local-link-address");
            this.address.type = "text";
            this.address.readOnly = true;
            this.address.id = `local-link-address-${Math.random().toString(36).slice(2, 8)}`;
            addressLabel.htmlFor = this.address.id;

            this.note = element("p", "local-link-note");
            this.note.hidden = true;

            const actions = element("div", "local-link-actions");
            this.copyButton = element("button", "btn explorer-btn small-label", "Copier l'adresse");
            this.copyButton.type = "button";
            this.copyButton.addEventListener("click", () => void this.copyAddress());
            this.renewButton = element("button", "btn start-btn", "Nouveau code");
            this.renewButton.type = "button";
            this.renewButton.addEventListener("click", () => {
                this.link.createSession();
                this.setStatus("Nouveau code créé : l'ancien n'est plus valable.");
            });
            actions.append(this.copyButton, this.renewButton);

            this.statusBar = element("div", "explorer-status local-link-status", "Prêt");
            body.append(this.intro, this.qrBox, this.timerLabel, addressLabel, this.address, this.note, actions);
            this.bodyElement.append(body, this.statusBar);
        }

        setStatus(message) {
            this.statusBar.textContent = message;
        }

        render() {
            const session = this.link.getSession();
            this.currentSession = session;
            this.address.value = session?.url || "";
            this.copyButton.disabled = !session;
            this.expiredLabel.hidden = Boolean(session);
            this.canvas.hidden = !session;

            if (session) {
                try {
                    const qr = window.Win95QR.encode(session.url);
                    window.Win95QR.draw(this.canvas, qr, { scale: Math.max(3, Math.floor(QR_BOX_PIXELS / (qr.size + 8))) });
                } catch (error) {
                    this.canvas.hidden = true;
                    this.setStatus(error.message);
                }
            }

            const unreachable = this.link.isUnreachableFromPhone();
            this.note.hidden = !unreachable;
            this.note.textContent = unreachable
                ? "Attention : cette adresse (localhost ou fichier local) n'est pas joignable depuis un téléphone. Ouvrez cette page par l'adresse réseau de l'ordinateur ou définissez Win95Config.localLink.baseUrl."
                : "";
            this.renderTimer();
        }

        renderTimer() {
            const session = this.currentSession;
            if (session && this.link.isExpired(session)) {
                // L'événement de fermeture de session déclenche render() ; ceci couvre un minuteur en retard.
                this.link.getSession();
                return;
            }
            this.timerLabel.textContent = session
                ? `Ce code expire dans ${formatRemaining(session.expiresAt - Date.now())}`
                : "Ce code a expiré. Cliquez sur « Nouveau code ».";
        }

        async copyAddress() {
            const session = this.link.getSession();
            if (!session) {
                return;
            }
            try {
                await navigator.clipboard.writeText(session.url);
                this.setStatus("Adresse copiée dans le Presse-papiers.");
            } catch {
                this.address.focus();
                this.address.select();
                this.setStatus("Copie impossible ici : l'adresse est sélectionnée, appuyez sur Ctrl+C.");
            }
        }
    }

    const api = { attach: (rootElement) => rootElement?.__win95LocalLinkInstance || new Win95LocalLinkApp(rootElement) };
    window.Win95LocalLinkApp = api;
    window.Win95Services?.register?.("Win95LocalLinkApp", api);
})();
