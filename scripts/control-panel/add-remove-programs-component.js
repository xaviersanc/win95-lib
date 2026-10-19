(() => {
    // Ajout/Suppression de programmes (Win95AddRemove) : Installation/Désinstallation, Installation de Windows,
    // Disquette de démarrage. « Supprimer » un programme le **cache** (Win95Programs) ; « Installer » le refait apparaître.
    // Les suppressions sont immédiates (comme un désinstalleur) ; l'onglet Installation de Windows s'applique avec OK/Appliquer.

    const programs = () => window.Win95Programs;
    const sheets = () => window.Win95PropertySheet;
    const dialog = () => window.Win95Dialog;

    class Win95AddRemove {
        constructor(rootElement) {
            this.rootElement = rootElement;
            this.bodyElement = rootElement.querySelector("[data-applet]");
            if (!this.bodyElement) {
                return;
            }

            this.selectedKey = null;
            // Cases cochées dans l'onglet « Installation de Windows » (appliquées par OK / Appliquer).
            this.components = new Map(programs().available().map((program) => [program.key, !programs().isHidden(program.key)]));
            this.boundRefresh = () => this.refreshFromStore();
            window.addEventListener(programs().CHANGE_EVENT, this.boundRefresh);
            rootElement.addEventListener("win95:window-closed", () => {
                window.removeEventListener(programs().CHANGE_EVENT, this.boundRefresh);
            }, { once: true });

            this.sheet = sheets().mount(this.bodyElement, {
                tabs: [
                    { key: "install", label: "Installation/Désinstallation", render: (panel) => this.renderInstallTab(panel) },
                    { key: "windows", label: "Installation de Windows", render: (panel) => this.renderComponentsTab(panel) },
                    { key: "disk", label: "Disquette de démarrage", render: (panel) => this.renderDiskTab(panel) }
                ],
                onApply: () => this.applyComponents(),
                onClose: () => window.Win95WindowManager?.closeWindow(rootElement)
            });
            rootElement.__win95AddRemoveInstance = this;
        }

        refreshFromStore() {
            this.components = new Map(programs().available().map((program) => [program.key, !programs().isHidden(program.key)]));
            if (this.listElement) {
                this.renderList();
            }
            if (this.componentsElement) {
                this.renderComponents();
            }
        }

        // --- Onglet Installation/Désinstallation -------------------------------------------------

        renderInstallTab(panel) {
            const installGroup = sheets().createGroup("Installer");
            const installNote = document.createElement("p");
            installNote.className = "property-note";
            installNote.textContent = "Pour installer un programme supprimé précédemment, cliquez sur Installer.";
            const installButton = document.createElement("button");
            installButton.type = "button";
            installButton.className = "btn start-btn";
            installButton.textContent = "Installer…";
            installButton.addEventListener("click", () => void this.installProgram());
            installGroup.append(installNote, installButton);

            const removeGroup = sheets().createGroup("Désinstaller");
            const removeNote = document.createElement("p");
            removeNote.className = "property-note";
            removeNote.textContent = "Les programmes suivants peuvent être supprimés automatiquement. Pour supprimer un programme, sélectionnez-le dans la liste, puis cliquez sur Ajouter/Supprimer.";
            this.listElement = document.createElement("div");
            this.listElement.className = "programs-list windows-scrollbar";
            this.listElement.setAttribute("role", "listbox");
            this.listElement.setAttribute("aria-label", "Programmes installés");
            this.removeButton = document.createElement("button");
            this.removeButton.type = "button";
            this.removeButton.className = "btn start-btn";
            this.removeButton.textContent = "Ajouter/Supprimer…";
            this.removeButton.addEventListener("click", () => void this.removeSelected());
            removeGroup.append(removeNote, this.listElement, this.removeButton);

            panel.append(installGroup, removeGroup);
            this.renderList();
        }

        renderList() {
            const installed = programs().installed();
            if (!installed.some((program) => program.key === this.selectedKey)) {
                this.selectedKey = null;
            }
            this.listElement.textContent = "";
            if (installed.length === 0) {
                const empty = document.createElement("div");
                empty.className = "programs-empty";
                empty.textContent = "Aucun programme supprimable n'est installé.";
                this.listElement.appendChild(empty);
            }
            installed.forEach((program) => {
                const item = document.createElement("button");
                item.type = "button";
                item.className = "programs-item";
                item.setAttribute("role", "option");
                const selected = program.key === this.selectedKey;
                item.classList.toggle("selected", selected);
                item.setAttribute("aria-selected", selected ? "true" : "false");
                const icon = document.createElement("img");
                icon.alt = "";
                icon.src = program.icon;
                const label = document.createElement("span");
                label.textContent = program.label;
                item.append(icon, label);
                item.addEventListener("click", () => {
                    this.selectedKey = program.key;
                    this.renderList();
                });
                this.listElement.appendChild(item);
            });
            this.removeButton.disabled = !this.selectedKey;
        }

        async installProgram() {
            const removed = programs().removed();
            if (removed.length === 0) {
                await dialog().alert({ title: "Installer", message: "Tous les programmes sont déjà installés." });
                return;
            }
            const values = await dialog().form({
                title: "Installer un programme",
                message: "Quel programme voulez-vous installer ?",
                fields: [{ name: "key", type: "select", label: "Programme :", options: removed.map((program) => ({ value: program.key, label: program.label })) }],
                confirmLabel: "Installer"
            });
            if (values) {
                this.sheet.setStatus(programs().install(values.key).message);
            }
        }

        async removeSelected() {
            const program = programs().PROGRAMS.find((candidate) => candidate.key === this.selectedKey);
            if (!program) {
                return;
            }
            const confirmed = await dialog().confirm({
                title: "Ajout/Suppression de programmes",
                message: `Voulez-vous vraiment supprimer « ${program.label} » et tous ses composants ?`,
                confirmLabel: "Oui"
            });
            if (confirmed) {
                this.sheet.setStatus(programs().remove(program.key).message);
            }
        }

        // --- Onglet Installation de Windows -------------------------------------------------------

        renderComponentsTab(panel) {
            const note = document.createElement("p");
            note.className = "property-note";
            note.textContent = "Pour ajouter ou supprimer un composant, cochez ou décochez sa case. Une case cochée indique que le composant est installé.";
            this.componentsElement = document.createElement("div");
            this.componentsElement.className = "programs-components windows-scrollbar";
            this.descriptionElement = document.createElement("p");
            this.descriptionElement.className = "programs-description";
            panel.append(note, this.componentsElement, this.descriptionElement);
            this.renderComponents();
        }

        renderComponents() {
            this.componentsElement.textContent = "";
            programs().available().forEach((program) => {
                const label = document.createElement("label");
                label.className = "property-check";
                const check = document.createElement("input");
                check.type = "checkbox";
                check.checked = Boolean(this.components.get(program.key));
                check.addEventListener("change", () => {
                    this.components.set(program.key, check.checked);
                    this.sheet.markDirty();
                });
                label.addEventListener("mouseenter", () => this.describe(program));
                check.addEventListener("focus", () => this.describe(program));
                const icon = document.createElement("img");
                icon.alt = "";
                icon.src = program.icon;
                const name = document.createElement("span");
                name.className = "programs-name";
                name.textContent = program.label;
                const size = document.createElement("span");
                size.className = "programs-size";
                size.textContent = program.size;
                label.append(check, icon, name, size);
                this.componentsElement.appendChild(label);
            });
        }

        describe(program) {
            this.descriptionElement.textContent = `${program.label} : ${program.description}`;
        }

        applyComponents() {
            programs().available().forEach((program) => {
                const wanted = this.components.get(program.key);
                if (wanted && programs().isHidden(program.key)) {
                    programs().install(program.key);
                } else if (!wanted && !programs().isHidden(program.key)) {
                    programs().remove(program.key);
                }
            });
            return { ok: true, message: "Composants Windows mis à jour." };
        }

        // --- Onglet Disquette de démarrage --------------------------------------------------------

        renderDiskTab(panel) {
            const note = document.createElement("p");
            note.className = "property-note";
            note.textContent = "Une disquette de démarrage vous permet de démarrer Windows en cas de problème. Cet ordinateur simulé démarre toujours : aucune disquette n'est nécessaire.";
            const icon = document.createElement("img");
            icon.alt = "";
            icon.src = window.Win95Asset("assets/icons/hard_disk_drive-0.png");
            icon.className = "programs-disk-icon";
            const button = document.createElement("button");
            button.type = "button";
            button.className = "btn start-btn";
            button.textContent = "Créer une disquette…";
            button.disabled = true;
            panel.append(icon, note, button);
        }
    }

    const api = {
        attach(rootElement) {
            return rootElement?.__win95AddRemoveInstance || new Win95AddRemove(rootElement);
        }
    };

    window.Win95AddRemove = api;
    window.Win95Services?.register?.("Win95AddRemove", api);
})();
