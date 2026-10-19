(() => {
    // Barre de menus d'une application (Win95MenuBar) : « Jeu  Aide », « Fichier  Édition »… Chaque libellé ouvre un menu
    // déroulant (Win95ContextMenu) juste dessous ; quand un menu est ouvert, survoler un autre libellé l'ouvre à son tour.
    //
    // const bar = Win95MenuBar.mount(container, [
    //     { label: "Jeu", items: () => [{ label: "Nouvelle partie", hint: "F2", onSelect }, { separator: true }, …] },
    //     { label: "Aide", items: [ … ] }                    // items : tableau, ou fonction renvoyée à chaque ouverture (cases à cocher à jour)
    // ]);
    // Les éléments suivent le format de Win95ContextMenu (checked, hint, disabled, items pour un sous-menu).

    function mount(container, menus) {
        const bar = document.createElement("div");
        bar.className = "win95-menubar";
        bar.setAttribute("role", "menubar");
        let currentButton = null;
        let wasOpenOnPress = false;

        const openFor = (button, menu) => {
            const rect = button.getBoundingClientRect();
            const items = typeof menu.items === "function" ? menu.items() : menu.items;
            currentButton?.classList.remove("is-open");
            currentButton = button;
            button.classList.add("is-open");
            window.Win95ContextMenu.open(rect.left, rect.bottom, items);
        };

        const clearOpenMark = () => {
            if (!window.Win95ContextMenu.isOpen()) {
                currentButton?.classList.remove("is-open");
                currentButton = null;
            }
        };

        menus.forEach((menu) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "win95-menubar-item";
            button.setAttribute("role", "menuitem");
            button.setAttribute("aria-haspopup", "menu");
            button.textContent = menu.label;
            // Un clic sur le libellé d'un menu déjà ouvert le referme (le menu se ferme au pointerdown, avant le clic).
            button.addEventListener("pointerdown", () => {
                wasOpenOnPress = window.Win95ContextMenu.isOpen() && currentButton === button;
            });
            button.addEventListener("click", () => {
                if (wasOpenOnPress) {
                    wasOpenOnPress = false;
                    clearOpenMark();
                    return;
                }
                openFor(button, menu);
            });
            button.addEventListener("mouseenter", () => {
                if (window.Win95ContextMenu.isOpen() && currentButton && currentButton !== button) {
                    openFor(button, menu);
                }
            });
            button.addEventListener("keydown", (event) => {
                if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openFor(button, menu);
                }
            });
            bar.appendChild(button);
        });

        // Le marquage « ouvert » disparaît quand le menu se ferme (Échap, clic ailleurs…).
        const refresh = () => window.setTimeout(clearOpenMark, 0);
        document.addEventListener("pointerup", refresh, true);
        document.addEventListener("keyup", refresh, true);
        container.closest("[data-window-component]")?.addEventListener("win95:window-closed", () => {
            document.removeEventListener("pointerup", refresh, true);
            document.removeEventListener("keyup", refresh, true);
        }, { once: true });

        container.appendChild(bar);
        return bar;
    }

    window.Win95MenuBar = { mount };
    window.Win95Services?.register?.("Win95MenuBar", window.Win95MenuBar);
})();
