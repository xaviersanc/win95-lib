(() => {
    // Menu contextuel (clic droit) façon Windows 95, partagé par l'explorateur et les autres composants.
    // Un seul menu ouvert à la fois ; il se ferme au clic extérieur, à Échap, au défilement,
    // au redimensionnement ou quand la fenêtre du navigateur perd le focus.
    //
    // items : [{ label, onSelect, bold?, disabled?, checked?, hint? } | { label, items: [...] } | { separator: true }]
    //   checked : coche ✓ devant l'élément ; hint : raccourci affiché à droite (ex. "F2").
    // Un élément avec "items" ouvre un sous-menu à sa droite (survol, clic ou flèche droite), ex. Nouveau > Dossier.

    let menuElement = null;
    let submenuElement = null;

    function isInsideMenus(target) {
        return Boolean(menuElement?.contains(target) || submenuElement?.contains(target));
    }

    function handlePointerDown(event) {
        if (menuElement && !isInsideMenus(event.target)) {
            close();
        }
    }

    function handleKeydown(event) {
        if (event.key === "Escape" && menuElement) {
            event.stopPropagation();
            if (submenuElement) {
                closeSubmenu();
            } else {
                close();
            }
        }
    }

    function closeSubmenu() {
        submenuElement?.remove();
        submenuElement = null;
        menuElement?.querySelectorAll(".win95-context-item.is-open").forEach((item) => item.classList.remove("is-open"));
    }

    function close() {
        if (!menuElement) {
            return;
        }
        closeSubmenu();
        menuElement.remove();
        menuElement = null;
        document.removeEventListener("pointerdown", handlePointerDown, true);
        document.removeEventListener("keydown", handleKeydown, true);
        document.removeEventListener("scroll", close, true);
        window.removeEventListener("blur", close);
        window.removeEventListener("resize", close);
    }

    // Garde un menu dans l'écran, comme l'explorateur Windows.
    function placeMenu(menu, clientX, clientY) {
        const menuRect = menu.getBoundingClientRect();
        menu.style.left = `${window.Win95Utils.clamp(clientX, 0, window.innerWidth - menuRect.width - 2)}px`;
        menu.style.top = `${window.Win95Utils.clamp(clientY, 0, window.innerHeight - menuRect.height - 2)}px`;
    }

    function buildMenu(items, { isSubmenu = false } = {}) {
        const menu = document.createElement("div");
        menu.className = `win95-context-menu${isSubmenu ? " is-submenu" : ""}`;
        menu.setAttribute("role", "menu");
        menu.addEventListener("contextmenu", (event) => event.preventDefault());

        items.forEach((item) => {
            if (item.separator) {
                const separator = document.createElement("div");
                separator.className = "win95-context-separator";
                menu.appendChild(separator);
                return;
            }

            const menuItem = document.createElement("button");
            menuItem.type = "button";
            menuItem.className = `win95-context-item${item.bold ? " is-default" : ""}${item.items ? " has-submenu" : ""}${item.checked ? " is-checked" : ""}`;
            menuItem.setAttribute("role", item.checked === undefined ? "menuitem" : "menuitemcheckbox");
            if (item.checked !== undefined) {
                menuItem.setAttribute("aria-checked", item.checked ? "true" : "false");
            }
            menuItem.textContent = item.label;
            if (item.hint) {
                const hint = document.createElement("span");
                hint.className = "win95-context-hint";
                hint.textContent = item.hint;
                menuItem.appendChild(hint);
            }
            menuItem.disabled = Boolean(item.disabled);

            if (item.items) {
                menuItem.setAttribute("aria-haspopup", "menu");
                const open = () => openSubmenu(menuItem, item.items);
                menuItem.addEventListener("mouseenter", open);
                menuItem.addEventListener("click", open);
                menuItem.addEventListener("keydown", (event) => {
                    if (event.key === "ArrowRight") {
                        event.preventDefault();
                        open();
                        submenuElement?.querySelector(".win95-context-item:not(:disabled)")?.focus();
                    }
                });
            } else {
                // Survoler un élément simple du menu principal referme le sous-menu ouvert.
                if (!isSubmenu) {
                    menuItem.addEventListener("mouseenter", closeSubmenu);
                }
                menuItem.addEventListener("click", () => {
                    close();
                    window.Win95Sounds?.play("menu-command");
                    item.onSelect?.();
                });
            }
            menu.appendChild(menuItem);
        });
        return menu;
    }

    function openSubmenu(parentItem, items) {
        if (parentItem.disabled || parentItem.classList.contains("is-open")) {
            return;
        }
        closeSubmenu();
        parentItem.classList.add("is-open");
        const submenu = buildMenu(items, { isSubmenu: true });
        document.body.appendChild(submenu);
        const parentRect = parentItem.getBoundingClientRect();
        const submenuRect = submenu.getBoundingClientRect();
        // À droite de l'élément, ou à gauche s'il n'y a pas la place.
        const x = parentRect.right + submenuRect.width > window.innerWidth ? parentRect.left - submenuRect.width : parentRect.right - 2;
        placeMenu(submenu, x, parentRect.top - 3);
        submenuElement = submenu;
    }

    function open(clientX, clientY, items) {
        close();

        const menu = buildMenu(items);
        document.body.appendChild(menu);
        placeMenu(menu, clientX, clientY);

        menuElement = menu;
        document.addEventListener("pointerdown", handlePointerDown, true);
        document.addEventListener("keydown", handleKeydown, true);
        document.addEventListener("scroll", close, true);
        window.addEventListener("blur", close);
        window.addEventListener("resize", close);
    }

    const contextMenu = {
        open,
        close,
        isOpen: () => Boolean(menuElement)
    };

    window.Win95ContextMenu = contextMenu;
    window.Win95Services?.register?.("Win95ContextMenu", contextMenu);
})();
