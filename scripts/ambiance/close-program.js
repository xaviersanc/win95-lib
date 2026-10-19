(() => {
    // Boîte « Fermer le programme » (Win95CloseProgram), ouverte par Ctrl+Alt+Suppr (ou Ctrl+Alt+Fin, car la plupart des
    // systèmes réservent Ctrl+Alt+Suppr et ne le transmettent pas au navigateur) :
    //  - liste « Explorer », « Systray » et les fenêtres ouvertes ; « Fin de tâche » ferme la fenêtre sélectionnée,
    //    sans demander (même si le Bloc-notes avait des modifications non enregistrées) ;
    //  - « Explorer » : après confirmation, plante le système (écran bleu, Win95BlueScreen) ;
    //  - « Arrêter » : boîte « Arrêt de Windows » ; « Annuler » ferme ;
    //  - une deuxième pression sur Ctrl+Alt+Suppr, boîte ouverte, **redémarre l'ordinateur** (rechargement de la page).
    // Sans session ouverte, le raccourci est ignoré.

    let overlay = null;

    function isShortcut(event) {
        return window.Win95BlueScreen.isRestartShortcut(event);
    }

    function listTasks() {
        const manager = window.Win95WindowManager;
        const tasks = [
            { key: "system:explorer", label: "Explorer", icon: window.Win95Asset("assets/icons/directory_open_file_mydocs-4.png"), system: true },
            { key: "system:systray", label: "Systray", icon: window.Win95Asset("assets/icons/windows-0.png"), system: true }
        ];
        (manager?.windows || []).forEach((windowElement) => {
            const definition = manager.windowDefinitions[windowElement.dataset.windowApp] || {};
            tasks.push({
                key: `window:${manager.getWindowId(windowElement)}`,
                label: manager.getWindowTitle(windowElement),
                icon: definition.icon || window.Win95Asset("assets/icons/document-1.png"),
                element: windowElement
            });
        });
        return tasks;
    }

    function close() {
        if (!overlay) {
            return;
        }
        document.removeEventListener("keydown", handleKey, true);
        overlay.remove();
        overlay = null;
    }

    function handleKey(event) {
        if (isShortcut(event)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            // Deuxième pression : redémarrage.
            location.reload();
            return;
        }
        if (event.key === "Escape") {
            event.stopPropagation();
            close();
        }
    }

    async function endTask(task) {
        const dialog = window.Win95Dialog;
        if (task.key === "system:explorer") {
            const confirmed = await dialog.confirm({
                title: "Fermer le programme",
                message: "Explorer est le programme qui gère le Bureau et la barre des tâches. Voulez-vous vraiment mettre fin à cette tâche ?\nVous risquez de perdre des informations non enregistrées.",
                confirmLabel: "Fin de tâche"
            });
            if (confirmed) {
                close();
                window.Win95BlueScreen.show({ code: "0D", module: "EXPLORER" });
            }
            return;
        }
        if (task.key === "system:systray") {
            await dialog.error({ title: "Fermer le programme", message: "Systray est utilisé par Windows : cette tâche ne peut pas être terminée." });
            return;
        }
        if (task.element?.isConnected) {
            window.Win95WindowManager.closeWindow(task.element, { force: true });
        }
        render();
    }

    function render() {
        if (!overlay) {
            return;
        }
        const previous = overlay.dataset.selected || "";
        const list = overlay.querySelector(".closeprog-list");
        const tasks = listTasks();
        if (!tasks.some((task) => task.key === previous)) {
            overlay.dataset.selected = "";
        }
        list.textContent = "";
        tasks.forEach((task) => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "closeprog-item";
            item.setAttribute("role", "option");
            const selected = task.key === overlay.dataset.selected;
            item.classList.toggle("selected", selected);
            item.setAttribute("aria-selected", selected ? "true" : "false");
            const icon = document.createElement("img");
            icon.alt = "";
            icon.src = task.icon;
            const label = document.createElement("span");
            label.textContent = task.label;
            item.append(icon, label);
            item.addEventListener("click", () => {
                overlay.dataset.selected = task.key;
                render();
                list.querySelector(".selected")?.focus();
            });
            item.addEventListener("dblclick", () => void endTask(task));
            list.appendChild(item);
        });
        overlay.querySelector("[data-closeprog-end]").disabled = !overlay.dataset.selected;
    }

    function open() {
        if (overlay) {
            return;
        }
        overlay = document.createElement("div");
        overlay.className = "modal win95-dialog show closeprog";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-label", "Fermer le programme");
        overlay.innerHTML = `
            <div class="modal-dialog win95-dialog-box closeprog-box">
                <div class="modal-content">
                    <div class="modal-header"><div class="modal-title">Fermer le programme</div></div>
                    <div class="modal-body closeprog-body">
                        <p class="closeprog-warning">Attention : utilisez Ctrl+Alt+Suppr une seconde fois pour redémarrer l'ordinateur. Vous perdrez toutes les informations non enregistrées.</p>
                        <p>Programmes en cours d'exécution :</p>
                        <div class="closeprog-list windows-scrollbar" role="listbox" aria-label="Programmes en cours d'exécution"></div>
                    </div>
                    <div class="modal-footer closeprog-footer">
                        <button type="button" class="btn start-btn" data-closeprog-end disabled>Fin de tâche</button>
                        <button type="button" class="btn start-btn" data-closeprog-shutdown>Arrêter</button>
                        <button type="button" class="btn start-btn" data-closeprog-cancel>Annuler</button>
                    </div>
                </div>
            </div>`;
        overlay.querySelector("[data-closeprog-cancel]").addEventListener("click", close);
        overlay.querySelector("[data-closeprog-shutdown]").addEventListener("click", () => {
            close();
            window.Win95WindowManager?.openLogoutModal();
        });
        overlay.querySelector("[data-closeprog-end]").addEventListener("click", () => {
            const task = listTasks().find((candidate) => candidate.key === overlay.dataset.selected);
            if (task) {
                void endTask(task);
            }
        });
        // Ajouté après l'événement en cours : sinon la touche qui ouvre la boîte compterait comme la deuxième pression.
        window.setTimeout(() => {
            if (overlay) {
                document.addEventListener("keydown", handleKey, true);
            }
        }, 0);
        document.body.appendChild(overlay);
        window.Win95Sounds?.play("exclamation");
        render();
        overlay.querySelector("[data-closeprog-cancel]").focus();
    }

    // Raccourci global (hors écran bleu, qui gère lui-même le sien).
    window.addEventListener("keydown", (event) => {
        if (!isShortcut(event) || window.Win95BlueScreen?.isShown() || overlay) {
            return;
        }
        if (window.Win95Security && !window.Win95Security.getCurrentUser()) {
            return;
        }
        event.preventDefault();
        open();
    }, true);

    window.Win95CloseProgram = { open, close, isOpen: () => Boolean(overlay) };
    window.Win95Services?.register?.("Win95CloseProgram", window.Win95CloseProgram);
})();
