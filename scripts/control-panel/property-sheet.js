(() => {
    // Feuille de propriétés façon Windows 95 (Win95PropertySheet) : onglets + boutons OK / Annuler / Appliquer.
    // Utilisée par les applets du Panneau de configuration (Date/Heure, Souris, Sons, Système, Ajout/Suppression).
    //
    // const sheet = Win95PropertySheet.mount(bodyElement, {
    //     tabs: [{ key, label, render(panel, sheet) }],   // render remplit le panneau (appelé une fois par onglet, à la 1re ouverture)
    //     onApply(): { ok, message }|void,                 // enregistre les changements en attente (absent = pas de bouton Appliquer)
    //     onClose(): void,                                 // ferme la fenêtre (OK / Annuler)
    //     buttons: "ok-cancel-apply" | "close"             // "close" : un seul bouton Fermer (applets sans réglages)
    // });
    // sheet.markDirty() active « Appliquer » ; sheet.setStatus(texte) écrit dans la barre d'état ; sheet.select(clé) change d'onglet.

    function mount(bodyElement, { tabs, onApply = null, onClose = () => {}, buttons = "ok-cancel-apply" }) {
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

        let applyButton = null;
        const apply = () => {
            const result = onApply?.();
            if (result?.message) {
                sheet.setStatus(result.message);
            }
            if (!result || result.ok !== false) {
                sheet.dirty = false;
                if (applyButton) {
                    applyButton.disabled = true;
                }
            }
            return result?.ok !== false;
        };

        if (buttons === "close") {
            makeButton("Fermer", () => onClose(), { primary: true });
        } else {
            makeButton("OK", () => {
                if (!sheet.dirty || apply()) {
                    onClose();
                }
            }, { primary: true });
            makeButton("Annuler", () => onClose());
            if (onApply) {
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

    window.Win95PropertySheet = { mount, createGroup };
    window.Win95Services?.register?.("Win95PropertySheet", window.Win95PropertySheet);
})();
