// Plugin de test : exerce l'API d'extension (registerApp, menu Démarrer, icône, Corbeille, raccourcis, menus contextuels, explorateur).
(() => {
    const manager = window.Win95WindowManager;
    window.__plugin = { recycled: null, restored: null, menuCalls: 0 };

    manager.registerApp({
        key: "hello",
        label: "Bonjour",
        icon: "assets/icons/document-1.png",
        tool: { width: "300px", height: "180px", attach: (element) => { element.querySelector("[data-app-body]").textContent = "Bonjour plugin"; } },
        startMenu: { path: ["Programmes", "Plugin"] },
        desktopIcon: true,
        removable: { size: "1 Mo", description: "Application de test." }
    });
    manager.registerRecycleBinProvider({
        canMove: (payload) => payload?.kind === "plugin-item",
        moveToBin: (payload) => { window.__plugin.recycled = payload; return { ok: true, message: "plugin: mis à la corbeille" }; },
        canRestore: (item) => item?.kind === "plugin-item",
        restore: (item) => { window.__plugin.restored = item; return { ok: true, message: "plugin: restauré" }; }
    });
    manager.registerShortcutOpener("plugin-source", (target) => ({ message: `plugin: ${target.name} ouvert` }));
    manager.registerContextMenuProvider((target) => (target.closest(".desktop-icon[data-desktop-app='hello']")
        ? [{ label: "Menu du plugin", onSelect: () => { window.__plugin.menuCalls += 1; } }]
        : null));
    window.Win95FileExplorer.registerContextMenuContributor((entry) => [{ label: `Plugin : ${entry.name}`, onSelect: () => { window.__plugin.contributed = entry.name; } }]);
    window.__plugin.ready = true;
})();
