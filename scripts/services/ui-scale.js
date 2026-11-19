(() => {
    // Échelle de l'interface (Win95UiScale) : 100 % = aspect d'origine de Windows 95, 125 % ou 150 % = le même bureau en plus grand
    // (barre des tâches, menu Démarrer, barres de titre, menus, boîtes de dialogue, icônes du bureau et textes des applications).
    //
    //   Win95UiScale.get()              échelle courante (1, 1.25…)
    //   Win95UiScale.set(1.25)          change l'échelle (arrondie à l'échelle proposée la plus proche), la mémorise → { ok, message }
    //   Win95UiScale.cycle()            passe à l'échelle suivante (boucle)
    //   Win95UiScale.scales()           échelles proposées (Win95Config.ui.scales)
    //   Win95UiScale.format(1.25)       « 125 % »
    //   événement "win95:ui-scale-changed" (sur window ; detail : { scale, percent })
    //
    // Mécanisme : la variable CSS `--win95-k` (sur <html>) multiplie les dimensions de l'interface (voir scripts/window-manager/ui-scale.css
    // et les `font-size` de la bibliothèque) ; l'attribut `data-win95-scale` (en pourcentage) est posé sur <body>. Un zoom CSS global
    // n'est PAS utilisable : le gestionnaire de fenêtres calcule ses positions avec des pixels réels (fenêtre agrandie trop large,
    // glisser-déposer décalé). Les projets qui ont leurs propres dimensions en pixels les multiplient par `var(--win95-k, 1)`.
    // Les accessoires et jeux à taille fixe (calculatrice, démineur, cartes, Paint…) ne suivent pas l'échelle.
    //
    // Stockage : localStorage "win95.uiScale.v1" — réglage de la MACHINE (comme l'horloge), commun à tous les comptes, et il doit
    // marcher sans compte (portfolio public). Sans choix mémorisé : Win95Config.ui.scale, puis 1.

    const STORAGE_KEY = "win95.uiScale.v1";
    const CHANGE_EVENT = "win95:ui-scale-changed";
    const DEFAULT_SCALES = [1, 1.25, 1.5];

    const uiConfig = () => window.Win95Config?.ui || {};

    function scales() {
        const list = (Array.isArray(uiConfig().scales) ? uiConfig().scales : DEFAULT_SCALES)
            .map(Number)
            .filter((value) => Number.isFinite(value) && value >= 0.75 && value <= 2.5);
        const unique = [...new Set(list)].sort((a, b) => a - b);
        return unique.length > 0 ? unique : [1];
    }

    // Échelle proposée la plus proche d'une valeur quelconque.
    function nearest(value) {
        const wanted = Number(value);
        const list = scales();
        if (!Number.isFinite(wanted)) {
            return list.includes(1) ? 1 : list[0];
        }
        return list.reduce((best, candidate) => (Math.abs(candidate - wanted) < Math.abs(best - wanted) ? candidate : best), list[0]);
    }

    const format = (scale) => `${Math.round(scale * 100)} %`;

    function readStored() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw === null ? null : nearest(raw);
        } catch {
            return null;
        }
    }

    let current = null;

    function apply(scale) {
        current = scale;
        document.documentElement.style.setProperty("--win95-k", String(scale));
        document.body?.setAttribute("data-win95-scale", String(Math.round(scale * 100)));
        window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { scale, percent: Math.round(scale * 100) } }));
    }

    function get() {
        if (current === null) {
            current = readStored() ?? nearest(uiConfig().scale ?? 1);
        }
        return current;
    }

    function set(value, { remember = true } = {}) {
        const scale = nearest(value);
        apply(scale);
        if (!remember) {
            return { ok: true, message: `Échelle : ${format(scale)}.` };
        }
        try {
            localStorage.setItem(STORAGE_KEY, String(scale));
            return { ok: true, message: `Échelle : ${format(scale)}.` };
        } catch {
            return { ok: true, message: `Échelle : ${format(scale)} (non mémorisée : stockage du navigateur indisponible).` };
        }
    }

    function cycle() {
        const list = scales();
        const next = list[(list.indexOf(get()) + 1) % list.length];
        return set(next);
    }

    // --- Bouton de la zone de notification et onglet du Panneau de configuration ------------------------------------------

    function installTrayButton(manager) {
        if (!uiConfig().trayButtons || scales().length < 2 || document.querySelector("[data-win95-scale-button]")) {
            return;
        }
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn win95-tray-button";
        button.dataset.win95ScaleButton = "";
        button.setAttribute("aria-label", "Changer l'échelle de l'affichage");
        const label = document.createElement("span");
        button.appendChild(label);
        const refresh = () => {
            label.textContent = format(get());
            button.title = `Échelle de l'affichage : ${format(get())} (cliquer pour changer)`;
        };
        button.addEventListener("click", () => cycle());
        window.addEventListener(CHANGE_EVENT, refresh);
        refresh();
        manager.addTrayItem(button);
    }

    // Onglet « Échelle » des Propriétés d'affichage : boutons radio façon Windows 95, « Appliquer » comme les autres onglets.
    function installControlPanelTab() {
        if (!window.Win95ControlPanel?.addTab || scales().length < 2) {
            return;
        }
        let pending = get();
        window.Win95ControlPanel.addTab("display-properties", {
            key: "ui-scale",
            label: "Échelle",
            render(panel, sheet) {
                pending = get();
                const group = window.Win95PropertySheet.createGroup("Taille de l'interface");
                group.appendChild(Object.assign(document.createElement("p"), {
                    className: "property-note",
                    textContent: "Agrandit la barre des tâches, les menus, les fenêtres, les icônes et les textes. 100 % est l'aspect d'origine."
                }));
                const list = document.createElement("div");
                list.className = "property-choices";
                list.setAttribute("role", "radiogroup");
                list.setAttribute("aria-label", "Échelle de l'interface");
                const buttons = scales().map((scale) => {
                    const button = document.createElement("button");
                    button.type = "button";
                    button.className = "property-choice";
                    button.setAttribute("role", "radio");
                    button.dataset.scale = String(scale);
                    button.textContent = format(scale);
                    button.addEventListener("click", () => {
                        pending = scale;
                        select();
                        sheet.markDirty();
                    });
                    list.appendChild(button);
                    return button;
                });
                const select = () => buttons.forEach((button) => {
                    const selected = Number(button.dataset.scale) === pending;
                    button.classList.toggle("selected", selected);
                    button.setAttribute("aria-checked", selected ? "true" : "false");
                });
                select();
                group.appendChild(list);
                panel.appendChild(group);
            },
            apply() {
                return set(pending);
            }
        });
    }

    // L'échelle est appliquée tout de suite (avant le premier affichage du bureau), puis les éléments d'interface s'ajoutent
    // quand le gestionnaire de fenêtres existe.
    apply(get());
    window.addEventListener("win95:window-manager-ready", () => {
        installTrayButton(window.Win95WindowManager);
        installControlPanelTab();
    }, { once: true });

    const api = { CHANGE_EVENT, STORAGE_KEY, get, set, cycle, scales, format };
    window.Win95UiScale = api;
    window.Win95Services?.register?.("Win95UiScale", api);
})();
