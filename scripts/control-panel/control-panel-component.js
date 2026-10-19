(() => {
    // Panneau de configuration (Win95ControlPanel) : une fenêtre d'icônes ; un double-clic (ou Entrée) ouvre l'applet.
    // Chaque applet est une application du gestionnaire de fenêtres (windowDefinitions) ouverte par openApp().

    const APPLETS = [
        { app: "display-properties", label: "Affichage", icon: window.Win95Asset("assets/icons/display_properties-4.png"), hint: "Modifie le fond d'écran du Bureau." },
        { app: "date-time", label: "Date/Heure", icon: window.Win95Asset("assets/icons/time_and_date-0.png"), hint: "Règle la date, l'heure et le fuseau horaire." },
        { app: "mouse", label: "Souris", icon: window.Win95Asset("assets/icons/mouse-0.png"), hint: "Règle la vitesse du double-clic et le pointeur." },
        { app: "sounds", label: "Sons", icon: window.Win95Asset("assets/icons/computer_sound-0.png"), hint: "Associe des sons aux événements Windows." },
        { app: "system-properties", label: "Système", icon: window.Win95Asset("assets/icons/computer_explorer-2.png"), hint: "Affiche les informations sur l'ordinateur." },
        { app: "add-remove-programs", label: "Ajout/Suppression de programmes", icon: window.Win95Asset("assets/icons/appwizard-2.png"), hint: "Installe ou supprime des programmes." }
    ];

    class Win95ControlPanel {
        constructor(rootElement) {
            this.rootElement = rootElement;
            this.listElement = rootElement.querySelector("[data-control-panel-list]");
            this.statusElement = rootElement.querySelector("[data-control-panel-status]");
            if (!this.listElement || !this.statusElement) {
                return;
            }

            this.selected = null;
            this.boundRender = () => this.render();
            window.addEventListener("win95:accounts-changed", this.boundRender);
            window.addEventListener("win95:programs-changed", this.boundRender);
            rootElement.addEventListener("win95:window-closed", () => {
                window.removeEventListener("win95:accounts-changed", this.boundRender);
                window.removeEventListener("win95:programs-changed", this.boundRender);
            }, { once: true });
            rootElement.__win95ControlPanelInstance = this;
            this.render();
        }

        open(applet) {
            const opened = window.Win95WindowManager?.openApp(applet.app);
            this.statusElement.textContent = opened ? `${applet.label} ouvert.` : `${applet.label} n'est pas disponible.`;
        }

        render() {
            const available = APPLETS.filter((applet) => window.Win95WindowManager?.canOpen(applet.app) !== false);
            this.listElement.textContent = "";
            const grid = document.createElement("div");
            grid.className = "list-grid control-panel-grid";
            available.forEach((applet) => {
                const item = document.createElement("button");
                item.type = "button";
                item.className = `list-item${applet.app === this.selected ? " selected" : ""}`;
                item.title = applet.hint;
                const icon = document.createElement("img");
                icon.className = "list-item-icon control-panel-icon";
                icon.alt = "";
                icon.src = applet.icon;
                const label = document.createElement("span");
                label.className = "list-item-label";
                label.textContent = applet.label;
                item.append(icon, label);
                item.addEventListener("click", () => {
                    this.selected = applet.app;
                    this.render();
                    this.listElement.querySelector(".list-item.selected")?.focus();
                    this.statusElement.textContent = applet.hint;
                });
                item.addEventListener("dblclick", () => this.open(applet));
                item.addEventListener("keydown", (event) => {
                    if (event.key === "Enter") {
                        this.open(applet);
                    }
                });
                grid.appendChild(item);
            });
            this.listElement.appendChild(grid);
            if (!this.selected) {
                this.statusElement.textContent = `${available.length} objet${available.length > 1 ? "s" : ""}`;
            }
        }
    }

    const api = {
        APPLETS,
        attach(rootElement) {
            return rootElement?.__win95ControlPanelInstance || new Win95ControlPanel(rootElement);
        }
    };

    window.Win95ControlPanel = api;
    window.Win95Services?.register?.("Win95ControlPanel", api);
})();
