(() => {
    // Feuille de propriétés façon Windows 95 (Win95PropertySheet) : onglets + boutons OK / Annuler / Appliquer.
    // Utilisée par les applets du Panneau de configuration (Date/Heure, Souris, Sons, Système, Ajout/Suppression).
    //
    // const sheet = Win95PropertySheet.mount(bodyElement, {
    //     tabs: [{ key, label, render(panel, sheet) }],   // render remplit le panneau (appelé une fois par onglet, à la 1re ouverture)
    //     onApply(): { ok, message }|void,                 // enregistre les changements en attente (absent = pas de bouton Appliquer)
    //     onClose(): void,                                 // ferme la fenêtre (OK / Annuler)
    //     buttons: "ok-cancel-apply" | "close",            // "close" : un seul bouton Fermer (applets sans réglages)
    //     id: "mouse"                                      // identifiant de l'applet : reçoit les onglets ajoutés par registerTab(id, …)
    // });
    // sheet.markDirty() active « Appliquer » ; sheet.setStatus(texte) écrit dans la barre d'état ; sheet.select(clé) change d'onglet ;
    // sheet.pending(store) : copie de travail partagée des valeurs d'un store Win95Settings.
    //
    // Onglet déclaratif : { key, label, fields: [...], intro?: { icon, text } } au lieu de render() : l'interface est générée par
    // Win95PropertyFields, les valeurs sont enregistrées dans Win95Settings par « Appliquer » (voir property-fields.js).
    //
    // Ajouter un onglet à un applet existant (sans toucher son code) :
    //   Win95PropertySheet.registerTab("mouse", { key: "extra", label: "Extra", ns: "mouse-extra", fields: [...], apply(values) {…} });
    // `ns` : espace de noms Win95Settings (défaut « <applet>-<clé de l'onglet> ») ; `apply(values)` : effet du réglage.

    const extraTabs = new Map();

    function registerTab(id, tab, { ns = tab.ns || `${id}-${tab.key}`, apply = tab.apply || null } = {}) {
        if (!id || !tab?.key || !tab.label) {
            throw new Error("registerTab : identifiant d'applet, `key` et `label` de l'onglet obligatoires.");
        }
        const list = extraTabs.get(id) || [];
        extraTabs.set(id, list.filter((candidate) => candidate.key !== tab.key).concat(tab.fields ? window.Win95PropertyFields.prepareTab(tab, { ns, apply }) : tab));
        return tab;
    }

    function mount(bodyElement, { tabs: ownTabs, id = null, onApply = null, onClose = () => {}, buttons = "ok-cancel-apply" }) {
        // Copies : les onglets ajoutés par registerTab sont partagés entre les fenêtres ouvertes, l'état de la feuille ne doit pas l'être.
        const tabs = [...ownTabs, ...(id ? extraTabs.get(id) || [] : [])].map((tab) => ({ ...tab, touched: false }));
        const pendings = new Map();
        bodyElement.textContent = "";
        const wrapper = document.createElement("div");
        wrapper.className = "property-sheet";

        const tabList = document.createElement("div");
        tabList.className = "property-tabs";
        tabList.setAttribute("role", "tablist");
        const panels = document.createElement("div");
        panels.className = "property-panels";

        const status = document.createElement("div");
        status.className = "property-status";
        status.setAttribute("role", "status");

        const footer = document.createElement("div");
        footer.className = "property-buttons";

        const sheet = {
            dirty: false,
            markDirty() {
                this.dirty = true;
                if (applyButton) {
                    applyButton.disabled = false;
                }
            },
            setStatus(message) {
                status.textContent = message || "";
            },
            pending(store) {
                if (!pendings.has(store)) {
                    pendings.set(store, store.getAll());
                }
                return pendings.get(store);
            },
            select(key) {
                tabs.forEach((tab) => {
                    const active = tab.key === key;
                    tab.button.classList.toggle("active", active);
                    tab.button.setAttribute("aria-selected", active ? "true" : "false");
                    tab.button.tabIndex = active ? 0 : -1;
                    tab.panel.hidden = !active;
                    if (active && !tab.rendered) {
                        tab.rendered = true;
                        tab.render(tab.panel, sheet);
                    }
                });
            }
        };

        const makeButton = (label, handler, { primary = false } = {}) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = `btn start-btn${primary ? " property-primary" : ""}`;
            button.textContent = label;
            button.addEventListener("click", handler);
            footer.appendChild(button);
            return button;
        };

        // Les onglets déclaratifs fournissent leur propre render / apply.
        tabs.forEach((tab) => {
            if (tab.fields) {
                tab.render = (panel) => window.Win95PropertyFields.renderTab(tab, panel, sheet);
                tab.apply = () => window.Win95PropertyFields.applyTab(tab, sheet);
            }
        });

        let applyButton = null;
        // « Appliquer » : chaque onglet touché enregistre ses champs, puis le rappel de l'applet ; un échec garde la feuille « modifiée ».
        const apply = () => {
            const results = [...tabs.map((tab) => tab.apply?.()), onApply?.()].filter(Boolean);
            const failed = results.find((result) => result.ok === false);
            const shown = failed || results.reverse().find((result) => result.message);
            if (shown?.message) {
                sheet.setStatus(shown.message);
            }
            if (!failed) {
                sheet.dirty = false;
                if (applyButton) {
                    applyButton.disabled = true;
                }
            }
            return !failed;
        };
        const hasApply = Boolean(onApply) || tabs.some((tab) => tab.fields || tab.apply);

        if (buttons === "close") {
            makeButton("Fermer", () => onClose(), { primary: true });
        } else {
            makeButton("OK", () => {
                if (!sheet.dirty || apply()) {
                    onClose();
                }
            }, { primary: true });
            makeButton("Annuler", () => onClose());
            if (hasApply) {
                applyButton = makeButton("Appliquer", apply);
                applyButton.disabled = true;
            }
        }

        tabs.forEach((tab, index) => {
            tab.button = document.createElement("button");
            tab.button.type = "button";
            tab.button.className = "property-tab";
            tab.button.setAttribute("role", "tab");
            tab.button.textContent = tab.label;
            tab.button.addEventListener("click", () => sheet.select(tab.key));
            tab.button.addEventListener("keydown", (event) => {
                const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
                if (step) {
                    const next = tabs[(index + step + tabs.length) % tabs.length];
                    sheet.select(next.key);
                    next.button.focus();
                }
            });
            tab.panel = document.createElement("div");
            tab.panel.className = "property-panel";
            tab.panel.setAttribute("role", "tabpanel");
            tab.panel.hidden = true;
            tabList.appendChild(tab.button);
            panels.appendChild(tab.panel);
        });

        wrapper.append(tabList, panels, status, footer);
        bodyElement.appendChild(wrapper);
        // Échap = Annuler, comme une boîte de dialogue.
        wrapper.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                onClose();
            }
        });
        sheet.select(tabs[0].key);
        return sheet;
    }

    // Petit utilitaire partagé : fieldset + legend.
    function createGroup(legendText) {
        const fieldset = document.createElement("fieldset");
        fieldset.className = "property-group";
        const legend = document.createElement("legend");
        legend.textContent = legendText;
        fieldset.appendChild(legend);
        return fieldset;
    }

    window.Win95PropertySheet = { mount, createGroup, registerTab };
    window.Win95Services?.register?.("Win95PropertySheet", window.Win95PropertySheet);
})();
