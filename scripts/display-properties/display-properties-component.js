(() => {
    // Propriétés de Affichage (Win95DisplayProperties) : onglets « Arrière-plan » (fond d'écran du Bureau, Win95Wallpaper)
    // et « Écran de veille » (Win95ScreenSaver). Les choix sont appliqués par OK ou Appliquer ; l'aperçu est immédiat.

    const sheets = () => window.Win95PropertySheet;

    class Win95DisplayProperties {
        constructor(rootElement) {
            this.rootElement = rootElement;
            this.bodyElement = rootElement.querySelector("[data-applet]");
            if (!this.bodyElement) {
                return;
            }

            const saverState = window.Win95ScreenSaver?.getState();
            this.pending = {
                wallpaper: window.Win95Wallpaper.getCurrent(),
                saver: saverState?.saver ?? "none",
                waitSeconds: saverState?.waitSeconds ?? 600,
                text: saverState?.text ?? "Windows 95",
                passwordProtected: saverState?.passwordProtected ?? false
            };
            this.previews = [];
            const tabs = [{ key: "background", label: "Arrière-plan", render: (panel) => this.renderBackground(panel) }];
            if (window.Win95ScreenSaver) {
                tabs.push({ key: "saver", label: "Écran de veille", render: (panel) => this.renderScreenSaver(panel) });
            }
            this.sheet = sheets().mount(this.bodyElement, {
                id: "display-properties",
                tabs,
                onApply: () => this.apply(),
                onClose: () => window.Win95WindowManager?.closeWindow(rootElement)
            });
            rootElement.addEventListener("win95:window-closed", () => this.previews.forEach((preview) => preview.stop()), { once: true });
            rootElement.__win95DisplayPropertiesInstance = this;
        }

        // --- Arrière-plan ---------------------------------------------------------------------------------------

        renderBackground(panel) {
            const wallpaperStore = window.Win95Wallpaper;
            const fieldset = sheets().createGroup("Fond d'écran du Bureau");

            // Écran d'aperçu : le fond choisi, avec deux icônes de bureau.
            const monitor = document.createElement("div");
            monitor.className = "display-properties-monitor";
            monitor.setAttribute("aria-hidden", "true");
            const screen = document.createElement("div");
            screen.className = "wallpaper-preview display-properties-monitor-screen";
            screen.dataset.wallpaper = this.pending.wallpaper;
            screen.innerHTML = `<span class="display-properties-monitor-icon"><img alt="" src="${window.Win95Asset("assets/icons/directory_open_file_mydocs-4.png")}">Mes documents</span>`
                + `<span class="display-properties-monitor-icon"><img alt="" src="${window.Win95Asset("assets/icons/recycle_bin_empty-4.png")}">Corbeille</span>`;
            const stand = document.createElement("div");
            stand.className = "display-properties-monitor-stand";
            monitor.append(screen, stand);

            const caption = document.createElement("div");
            caption.className = "display-properties-note";
            const grid = document.createElement("div");
            grid.className = "display-properties-grid";
            grid.setAttribute("role", "radiogroup");
            grid.setAttribute("aria-label", "Fond d'écran");

            const sync = () => {
                const wallpaper = wallpaperStore.WALLPAPERS.find((candidate) => candidate.key === this.pending.wallpaper);
                screen.dataset.wallpaper = this.pending.wallpaper;
                caption.textContent = wallpaper ? `${wallpaper.label} — ${wallpaper.description}` : "";
                grid.querySelectorAll(".display-properties-choice").forEach((button) => {
                    const selected = button.dataset.key === this.pending.wallpaper;
                    button.classList.toggle("selected", selected);
                    button.setAttribute("aria-checked", selected ? "true" : "false");
                });
            };

            wallpaperStore.WALLPAPERS.forEach((wallpaper) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "display-properties-choice";
                button.dataset.key = wallpaper.key;
                button.setAttribute("role", "radio");
                button.title = wallpaper.description;
                const preview = document.createElement("span");
                preview.className = "wallpaper-preview display-properties-thumb";
                preview.dataset.wallpaper = wallpaper.key;
                const label = document.createElement("span");
                label.className = "display-properties-label";
                label.textContent = wallpaper.label;
                button.append(preview, label);
                button.addEventListener("click", () => {
                    this.pending.wallpaper = wallpaper.key;
                    this.sheet.markDirty();
                    sync();
                });
                grid.appendChild(button);
            });

            const note = document.createElement("div");
            note.className = "display-properties-note";
            note.textContent = "Cliquez sur OK ou Appliquer pour changer le fond du Bureau.";
            fieldset.append(monitor, caption, grid, note);
            panel.appendChild(fieldset);
            sync();
        }

        // --- Écran de veille --------------------------------------------------------------------------------------

        renderScreenSaver(panel) {
            const saver = window.Win95ScreenSaver;
            const monitor = document.createElement("div");
            monitor.className = "display-properties-monitor";
            monitor.setAttribute("aria-hidden", "true");
            const screen = document.createElement("div");
            screen.className = "saver-preview-screen";
            const canvas = document.createElement("canvas");
            canvas.width = 220;
            canvas.height = 150;
            screen.appendChild(canvas);
            const stand = document.createElement("div");
            stand.className = "display-properties-monitor-stand";
            monitor.append(screen, stand);

            const group = sheets().createGroup("Écran de veille");
            const row = document.createElement("div");
            row.className = "saver-row";
            const select = document.createElement("select");
            select.className = "form-95";
            select.setAttribute("aria-label", "Écran de veille");
            saver.SAVERS.forEach((candidate) => select.add(new Option(candidate.label, candidate.key)));
            select.value = this.pending.saver;
            const settingsButton = document.createElement("button");
            settingsButton.type = "button";
            settingsButton.className = "btn start-btn";
            settingsButton.textContent = "Paramètres…";
            const previewButton = document.createElement("button");
            previewButton.type = "button";
            previewButton.className = "btn start-btn";
            previewButton.textContent = "Aperçu";
            row.append(select, settingsButton, previewButton);

            const waitRow = document.createElement("div");
            waitRow.className = "saver-row saver-wait";
            const waitLabel = document.createElement("label");
            waitLabel.textContent = "Attente :";
            waitLabel.htmlFor = "saver-wait";
            const wait = document.createElement("input");
            wait.id = "saver-wait";
            wait.type = "number";
            wait.min = "1";
            wait.max = "60";
            wait.className = "form-95 saver-wait-input";
            wait.value = String(Math.max(1, Math.round(this.pending.waitSeconds / 60)));
            const minutes = document.createElement("span");
            minutes.textContent = "minutes";
            waitRow.append(waitLabel, wait, minutes);

            const passwordLabel = document.createElement("label");
            passwordLabel.className = "property-check";
            const password = document.createElement("input");
            password.type = "checkbox";
            password.checked = this.pending.passwordProtected;
            passwordLabel.append(password, document.createTextNode("Protégé par mot de passe (celui de votre compte)"));

            const startPreview = () => {
                this.previews.forEach((preview) => preview.stop());
                this.previews = [saver.createPreview(canvas, this.pending.saver, { text: this.pending.text })];
            };
            const syncControls = () => {
                const definition = saver.SAVERS.find((candidate) => candidate.key === this.pending.saver);
                settingsButton.disabled = !definition?.hasSettings;
                wait.disabled = this.pending.saver === "none";
                password.disabled = this.pending.saver === "none";
                previewButton.disabled = this.pending.saver === "none";
                startPreview();
            };

            select.addEventListener("change", () => {
                this.pending.saver = select.value;
                this.sheet.markDirty();
                syncControls();
            });
            wait.addEventListener("input", () => {
                const value = Number(wait.value);
                if (Number.isFinite(value) && value >= 1 && value <= 60) {
                    this.pending.waitSeconds = Math.round(value) * 60;
                    this.sheet.markDirty();
                }
            });
            password.addEventListener("change", () => {
                this.pending.passwordProtected = password.checked;
                this.sheet.markDirty();
            });
            settingsButton.addEventListener("click", async () => {
                const text = await window.Win95Dialog.prompt({
                    title: "Paramètres du texte défilant",
                    message: "Texte à faire défiler :",
                    defaultValue: this.pending.text
                });
                if (text) {
                    this.pending.text = text.slice(0, 60);
                    this.sheet.markDirty();
                    startPreview();
                }
            });
            previewButton.addEventListener("click", () => {
                // L'écran et le texte choisis (non encore appliqués) servent à l'aperçu plein écran.
                saver.start({ saverKey: this.pending.saver, text: this.pending.text, preview: true });
            });

            group.append(row, waitRow, passwordLabel);
            panel.append(monitor, group);
            syncControls();
        }

        apply() {
            window.Win95Wallpaper.set(this.pending.wallpaper);
            if (window.Win95ScreenSaver) {
                window.Win95ScreenSaver.save({
                    saver: this.pending.saver,
                    waitSeconds: this.pending.waitSeconds,
                    text: this.pending.text,
                    passwordProtected: this.pending.passwordProtected
                });
            }
            return { ok: true, message: "Affichage enregistré." };
        }
    }

    const api = {
        attach(rootElement) {
            return rootElement?.__win95DisplayPropertiesInstance || new Win95DisplayProperties(rootElement);
        }
    };

    window.Win95DisplayProperties = api;
    window.Win95Services?.register?.("Win95DisplayProperties", api);
})();
