(() => {
    // Écran bleu de la mort (Win95BlueScreen) : écran de texte bleu « Une erreur fatale s'est produite… ».
    //  - show({ code, address, module, fatal }) : affiche l'écran. Une touche l'ignore (retour au bureau) ;
    //    Ctrl+Alt+Suppr (ou Ctrl+Alt+Fin) redémarre ; avec fatal: true, seul le redémarrage est possible ;
    //  - déclenché par « Fin de tâche » sur Explorer (Ctrl+Alt+Suppr), ou par n'importe quel code via show() ;
    //  - option `window.Win95Config = { blueScreenOnError: true }` : toute erreur JavaScript non interceptée y mène (désactivé par défaut).
    // Émet "win95:bluescreen-shown".

    let screen = null;

    const hex = (digits) => Array.from({ length: digits }, () => Math.floor(Math.random() * 16).toString(16)).join("").toUpperCase();

    function isRestartShortcut(event) {
        return event.ctrlKey && event.altKey && (event.key === "Delete" || event.key === "End");
    }

    function close() {
        if (!screen) {
            return;
        }
        window.removeEventListener("keydown", handleKey, true);
        screen.remove();
        screen = null;
        document.body.classList.remove("bluescreen-on");
    }

    function handleKey(event) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (isRestartShortcut(event)) {
            location.reload();
            return;
        }
        if (screen?.dataset.fatal === "true" || ["Control", "Alt", "Shift", "Meta", "AltGraph"].includes(event.key)) {
            return;
        }
        close();
    }

    const blueScreen = {
        isShown() {
            return Boolean(screen);
        },

        show({ code = "0E", address = `0028:C${hex(7)}`, module = "VXD VMM(01)", offset = `0000${hex(4)}`, fatal = false } = {}) {
            if (screen) {
                return false;
            }
            screen = document.createElement("div");
            screen.className = "bluescreen";
            screen.dataset.fatal = fatal ? "true" : "false";
            screen.setAttribute("role", "alertdialog");
            screen.setAttribute("aria-label", "Écran bleu : erreur fatale");
            const actionLines = fatal
                ? [
                    "Le système est bloqué.",
                    "",
                    "* Appuyez sur Ctrl+Alt+Suppr pour redémarrer votre ordinateur. Vous perdrez toutes les informations non enregistrées dans les applications ouvertes."
                ]
                : [
                    "* Appuyez sur une touche pour arrêter l'application en cours.",
                    "* Appuyez sur Ctrl+Alt+Suppr pour redémarrer votre ordinateur. Vous perdrez toutes les informations non enregistrées dans les applications ouvertes.",
                    "",
                    "Appuyez sur une touche pour continuer _"
                ];
            const title = document.createElement("p");
            title.className = "bluescreen-title";
            title.textContent = "Windows";
            const message = document.createElement("p");
            message.textContent = `Une erreur fatale ${code} s'est produite à ${address} dans ${module} + ${offset}. L'application en cours va être arrêtée.`;
            screen.append(title, message);
            actionLines.forEach((line) => {
                const paragraph = document.createElement("p");
                paragraph.textContent = line;
                screen.appendChild(paragraph);
            });
            document.body.classList.add("bluescreen-on");
            document.body.appendChild(screen);
            window.addEventListener("keydown", handleKey, true);
            window.Win95Sounds?.play("critical-stop");
            window.dispatchEvent(new CustomEvent("win95:bluescreen-shown", { detail: { code, address } }));
            return true;
        },

        close,
        isRestartShortcut
    };

    // Option : erreur JavaScript non interceptée -> écran bleu.
    window.addEventListener("error", (event) => {
        if (window.Win95Config?.blueScreenOnError === true && !blueScreen.isShown()) {
            blueScreen.show({ module: String(event.filename || "KERNEL32").split("/").pop().toUpperCase().slice(0, 24) || "KERNEL32" });
        }
    });

    window.Win95BlueScreen = blueScreen;
    window.Win95Services?.register?.("Win95BlueScreen", blueScreen);
})();
