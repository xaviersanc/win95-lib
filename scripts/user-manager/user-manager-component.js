(() => {
    // Gestion des utilisateurs (Win95UserManager) : réservée aux administrateurs (Win95Security.ADMIN_ONLY_APPS).
    // Liste des comptes ; création, modification (nom, rôle, applications autorisées), mot de passe, suppression.
    // Un compte supprimé perd aussi ses données locales (documents, bureau, fond, raccourcis, Corbeille).

    const utils = () => window.Win95Utils;
    const accounts = () => window.Win95Accounts;
    const dialog = () => window.Win95Dialog;

    class Win95UserManager {
        constructor(rootElement) {
            this.rootElement = rootElement;
            this.bodyElement = rootElement.querySelector("[data-user-manager]");
            if (!this.bodyElement) {
                return;
            }

            this.selectedId = null;
            this.editing = null;
            this.statusMessage = "Sélectionnez un compte.";
            this.boundRefresh = () => this.render();
            window.addEventListener(accounts().CHANGE_EVENT, this.boundRefresh);
            rootElement.addEventListener("win95:window-closed", () => {
                window.removeEventListener(accounts().CHANGE_EVENT, this.boundRefresh);
            }, { once: true });

            rootElement.__win95UserManagerInstance = this;
            this.render();
        }

        // Applications que l'on peut autoriser ou non (toutes sauf celles réservées aux admins).
        getRestrictableApps() {
            const definitions = window.Win95WindowManager?.windowDefinitions || {};
            const adminOnly = window.Win95Security?.ADMIN_ONLY_APPS || [];
            return Object.entries(definitions)
                .filter(([key, definition]) => !adminOnly.includes(key) && !definition.parentApp && !(window.Win95Loader?.disabledApps || []).includes(key))
                .map(([key, definition]) => ({ key, label: definition.label, icon: definition.icon }));
        }

        describeApps(account) {
            if (account.role === "admin") {
                return "Toutes (administrateur)";
            }
            if (account.allowedApps === null) {
                return "Toutes";
            }
            const labels = this.getRestrictableApps().filter((app) => account.allowedApps.includes(app.key)).map((app) => app.label);
            return labels.length > 0 ? labels.join(", ") : "Aucune";
        }

        setStatus(message) {
            this.statusMessage = message;
            const status = this.bodyElement.querySelector(".user-manager-status");
            if (status) {
                status.textContent = message;
            }
        }

        render() {
            this.bodyElement.textContent = "";
            if (this.editing) {
                this.renderEditor();
            } else {
                this.renderList();
            }
            const status = document.createElement("div");
            status.className = "explorer-status user-manager-status";
            status.textContent = this.statusMessage;
            this.bodyElement.appendChild(status);
        }

        // --- Liste --------------------------------------------------------------------------

        renderList() {
            const list = accounts().list();
            const currentId = utils().getCurrentUserId();
            if (!list.some((account) => account.id === this.selectedId)) {
                this.selectedId = null;
            }

            const toolbar = document.createElement("div");
            toolbar.className = "explorer-toolbar user-manager-toolbar";
            const addButton = (label, handler, { needsSelection = true } = {}) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "btn explorer-btn small-label";
                button.textContent = label;
                button.disabled = needsSelection && !this.selectedId;
                button.addEventListener("click", handler);
                toolbar.appendChild(button);
            };
            addButton("Nouveau…", () => this.startEdit(null), { needsSelection: false });
            addButton("Modifier…", () => this.startEdit(this.selectedId));
            addButton("Mot de passe…", () => void this.changePassword());
            addButton("Supprimer", () => void this.removeSelected());

            const wrapper = document.createElement("div");
            wrapper.className = "user-manager-table-wrap windows-scrollbar";
            const table = document.createElement("table");
            table.className = "user-manager-table";
            table.innerHTML = "<thead><tr><th>Nom</th><th>Rôle</th><th>Applications autorisées</th></tr></thead>";
            const tbody = document.createElement("tbody");
            list.forEach((account) => {
                const row = document.createElement("tr");
                row.tabIndex = 0;
                row.className = account.id === this.selectedId ? "selected" : "";
                const nameCell = document.createElement("td");
                nameCell.textContent = account.id === currentId ? `${account.name} (vous)` : account.name;
                const roleCell = document.createElement("td");
                roleCell.textContent = account.role === "admin" ? "Administrateur" : "Utilisateur";
                const appsCell = document.createElement("td");
                appsCell.textContent = this.describeApps(account);
                row.append(nameCell, roleCell, appsCell);
                const select = () => {
                    this.selectedId = account.id;
                    this.setStatus(`${account.name} sélectionné.`);
                    this.render();
                };
                row.addEventListener("click", select);
                row.addEventListener("dblclick", () => this.startEdit(account.id));
                row.addEventListener("keydown", (event) => {
                    if (event.key === "Enter") {
                        this.startEdit(account.id);
                    } else if (event.key === " ") {
                        event.preventDefault();
                        select();
                    }
                });
                tbody.appendChild(row);
            });
            table.appendChild(tbody);
            wrapper.appendChild(table);
            this.bodyElement.append(toolbar, wrapper);
        }

        // --- Édition ------------------------------------------------------------------------

        startEdit(id) {
            this.editing = { id, account: id ? accounts().get(id) : null };
            if (id && !this.editing.account) {
                this.editing = null;
            }
            this.render();
        }

        renderEditor() {
            const { account } = this.editing;
            const isNew = !account;
            const form = document.createElement("form");
            form.className = "user-manager-form";
            form.autocomplete = "off";

            const group = (labelText, control) => {
                const wrapper = document.createElement("div");
                wrapper.className = "user-manager-field";
                const label = document.createElement("label");
                label.textContent = labelText;
                label.htmlFor = control.id;
                wrapper.append(label, control);
                return wrapper;
            };

            const nameInput = document.createElement("input");
            nameInput.id = "user-manager-name";
            nameInput.className = "form-95";
            nameInput.maxLength = 32;
            nameInput.value = account?.name || "";
            form.appendChild(group("Nom du compte :", nameInput));

            const roleSelect = document.createElement("select");
            roleSelect.id = "user-manager-role";
            roleSelect.className = "form-95";
            roleSelect.add(new Option("Utilisateur", "user"));
            roleSelect.add(new Option("Administrateur", "admin"));
            roleSelect.value = account?.role || "user";
            form.appendChild(group("Rôle :", roleSelect));

            let passwordInput = null;
            if (isNew) {
                passwordInput = document.createElement("input");
                passwordInput.id = "user-manager-password";
                passwordInput.type = "password";
                passwordInput.className = "form-95";
                passwordInput.autocomplete = "new-password";
                form.appendChild(group(`Mot de passe (${accounts().MIN_PASSWORD_LENGTH} caractères minimum) :`, passwordInput));
            }

            const fieldset = document.createElement("fieldset");
            fieldset.className = "user-manager-apps";
            const legend = document.createElement("legend");
            legend.textContent = "Applications autorisées";
            fieldset.appendChild(legend);
            const checks = this.getRestrictableApps().map((app) => {
                const label = document.createElement("label");
                label.className = "user-manager-app";
                const check = document.createElement("input");
                check.type = "checkbox";
                check.value = app.key;
                check.checked = !account || account.allowedApps === null || account.allowedApps.includes(app.key);
                const icon = document.createElement("img");
                icon.alt = "";
                icon.src = app.icon;
                label.append(check, icon, document.createTextNode(app.label));
                fieldset.appendChild(label);
                return check;
            });
            const note = document.createElement("p");
            note.className = "user-manager-note";
            fieldset.appendChild(note);
            const syncRole = () => {
                const isAdmin = roleSelect.value === "admin";
                checks.forEach((check) => {
                    check.disabled = isAdmin;
                });
                note.textContent = isAdmin
                    ? "Un administrateur a accès à toutes les applications et gère les comptes."
                    : "Les applications décochées sont masquées et inaccessibles pour ce compte.";
            };
            roleSelect.addEventListener("change", syncRole);
            syncRole();
            form.appendChild(fieldset);

            const errorElement = document.createElement("p");
            errorElement.className = "user-manager-error";
            errorElement.setAttribute("role", "alert");
            form.appendChild(errorElement);

            const actions = document.createElement("div");
            actions.className = "user-manager-actions";
            const save = document.createElement("button");
            save.type = "submit";
            save.className = "btn start-btn";
            save.textContent = isNew ? "Créer" : "Enregistrer";
            const cancel = document.createElement("button");
            cancel.type = "button";
            cancel.className = "btn start-btn";
            cancel.textContent = "Annuler";
            cancel.addEventListener("click", () => {
                this.editing = null;
                this.render();
            });
            actions.append(save, cancel);
            form.appendChild(actions);

            form.addEventListener("submit", async (event) => {
                event.preventDefault();
                save.disabled = true;
                const allowedApps = checks.filter((check) => check.checked).map((check) => check.value);
                const everything = allowedApps.length === checks.length;
                const payload = { name: nameInput.value, role: roleSelect.value, allowedApps: everything ? null : allowedApps };
                const result = isNew
                    ? await accounts().create({ ...payload, password: passwordInput.value })
                    : await accounts().update(account.id, payload);
                if (!result.ok) {
                    errorElement.textContent = result.message;
                    save.disabled = false;
                    return;
                }
                this.editing = null;
                this.selectedId = result.account?.id || this.selectedId;
                this.statusMessage = result.message;
                this.render();
            });

            this.bodyElement.appendChild(form);
            window.setTimeout(() => nameInput.focus(), 0);
        }

        // --- Actions ------------------------------------------------------------------------

        async changePassword() {
            const account = accounts().get(this.selectedId);
            if (!account) {
                return;
            }
            const values = await dialog().form({
                title: "Changer le mot de passe",
                message: `Nouveau mot de passe de « ${account.name} » (${accounts().MIN_PASSWORD_LENGTH} caractères minimum) :`,
                fields: [{ name: "password", type: "password", label: "" }],
                confirmLabel: "Changer"
            });
            if (values) {
                this.setStatus((await accounts().setPassword(account.id, values.password)).message);
            }
        }

        async removeSelected() {
            const account = accounts().get(this.selectedId);
            if (!account) {
                return;
            }
            if (account.id === utils().getCurrentUserId()) {
                this.setStatus("Vous ne pouvez pas supprimer le compte de votre session en cours.");
                return;
            }
            const confirmed = await dialog().confirm({
                title: "Supprimer le compte",
                message: `Supprimer définitivement le compte « ${account.name} » ?\nSes documents, son bureau et sa Corbeille seront effacés.`,
                confirmLabel: "Supprimer"
            });
            if (!confirmed) {
                return;
            }
            const result = await accounts().remove(account.id);
            if (result.ok) {
                window.Win95Security?.purgeUserData(account.id);
                this.selectedId = null;
            }
            this.setStatus(result.message);
        }
    }

    const api = {
        attach(rootElement) {
            return rootElement?.__win95UserManagerInstance || new Win95UserManager(rootElement);
        }
    };

    window.Win95UserManager = api;
    window.Win95Services?.register?.("Win95UserManager", api);
})();
