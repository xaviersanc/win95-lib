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

    const APPLETS_CHANGED_EVENT = "win95:control-panel-applets-changed";
    const DEFAULT_ICON = "assets/icons/directory_control_panel-4.png";

    // Applet déclaratif : la feuille de propriétés est générée à partir des champs de `tabs` (voir property-fields.js).
    function mountApplet(rootElement, spec) {
        const bodyElement = rootElement.querySelector("[data-applet]");
        if (!bodyElement) {
            return null;
        }
        const sheet = window.Win95PropertySheet.mount(bodyElement, {
            id: spec.key,
            tabs: spec.tabs,
            buttons: spec.buttons,
            onApply: spec.onApply ? () => spec.onApply(spec.store ? sheet.pending(spec.store) : {}) : null,
            onClose: () => window.Win95WindowManager?.closeWindow(rootElement)
        });
        return sheet;
    }

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
            window.addEventListener(APPLETS_CHANGED_EVENT, this.boundRender);
            rootElement.addEventListener("win95:window-closed", () => {
                window.removeEventListener("win95:accounts-changed", this.boundRender);
                window.removeEventListener("win95:programs-changed", this.boundRender);
                window.removeEventListener(APPLETS_CHANGED_EVENT, this.boundRender);
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
                // Le dblclick natif part vers un nœud déjà redessiné (détaché) : seul le dblclick recomposé de Win95Mouse compte.
                item.addEventListener("dblclick", (event) => !event.isTrusted && this.open(applet));
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

    // Ajoute un applet au Panneau de configuration (icône + fenêtre + droits hérités du Panneau) :
    //   Win95ControlPanel.registerApplet({
    //       key: "clavier", label: "Clavier", icon: "chemin/icone32.png", hint: "Texte de la barre d'état",
    //       width?: 400, height?: 390, title?, before?: "<clé d'un autre applet>",
    //       tabs: [{ key, label, intro?: { icon, text }, fields: [{ key, type, label, default, … }] }],   // interface générée (property-fields.js)
    //       apply?(values),            // effet réel des réglages : rejoué à chaque enregistrement ET à l'ouverture de session
    //       onApply?(values)           // facultatif : rappel après l'enregistrement des réglages (peut renvoyer { ok, message })
    //     })
    //   ou, pour une interface entièrement libre : { key, label, icon, attach(elementFenetre) } (cf. Win95PropertySheet.mount).
    // Les valeurs sont stockées par compte (Win95Settings, espace de noms = key). Peut être appelé avant ou après le démarrage du bureau.
    function registerApplet(spec) {
        if (!spec?.key || !spec.label) {
            throw new Error("registerApplet : `key` et `label` obligatoires.");
        }
        if (!spec.attach && !spec.tabs?.length) {
            throw new Error("registerApplet : `tabs` (ou `attach`) obligatoire.");
        }
        const entry = {
            app: spec.key,
            label: spec.label,
            icon: spec.icon || window.Win95Asset(DEFAULT_ICON),
            hint: spec.hint || ""
        };
        const existing = APPLETS.findIndex((applet) => applet.app === spec.key);
        if (existing >= 0) {
            APPLETS[existing] = entry;
        } else {
            const before = spec.before ? APPLETS.findIndex((applet) => applet.app === spec.before) : -1;
            APPLETS.splice(before >= 0 ? before : APPLETS.length, 0, entry);
        }

        let attach = spec.attach;
        if (!attach) {
            const apply = spec.apply || null;
            spec.tabs.forEach((tab) => window.Win95PropertyFields.prepareTab(tab, { ns: tab.ns || spec.key, apply }));
            // Un seul store par applet : « Appliquer » rappelle onApply avec les valeurs en cours de modification.
            spec.store = window.Win95Settings.store(spec.key);
            attach = (element) => mountApplet(element, spec);
        }
        const registerWindow = () => window.Win95WindowManager.registerApp({
            key: spec.key,
            label: spec.label,
            icon: entry.icon,
            title: spec.title || spec.label,
            parentApp: "control-panel",
            applet: { width: spec.width || "400px", height: spec.height || "390px", attach }
        });
        if (window.Win95WindowManager) {
            registerWindow();
        } else {
            window.addEventListener("win95:window-manager-ready", registerWindow, { once: true });
        }
        window.dispatchEvent(new CustomEvent(APPLETS_CHANGED_EVENT));
        return entry;
    }

    // Ajoute un onglet de réglages à un applet existant (« mouse », « sounds », « date-time », « system-properties », « display-properties »,
    // « add-remove-programs » ou un applet de registerApplet) : { key, label, fields, intro?, ns?, apply?(values) }.
    function addTab(appletKey, tab) {
        return window.Win95PropertySheet.registerTab(appletKey, tab);
    }

    const api = {
        APPLETS,
        APPLETS_CHANGED_EVENT,
        registerApplet,
        addTab,
        attach(rootElement) {
            return rootElement?.__win95ControlPanelInstance || new Win95ControlPanel(rootElement);
        }
    };

    window.Win95ControlPanel = api;
    window.Win95Services?.register?.("Win95ControlPanel", api);
})();
