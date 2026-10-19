(() => {
    // Boîtes de dialogue Win95 (confirmation, saisie, petit formulaire) sous forme de promesses,
    // pour éviter window.confirm / window.prompt qui cassent l'illusion du bureau.
    //
    // fields : [{ name, label, type: "text" | "password" | "select", value?, options?: [{ value, label }] }]

    function createField(field, index) {
        const id = `win95-dialog-field-${index}`;
        const wrapper = document.createElement("div");
        wrapper.className = "win95-dialog-field";

        const label = document.createElement("label");
        label.htmlFor = id;
        label.textContent = field.label || "";

        const control = document.createElement(field.type === "select" ? "select" : "input");
        control.id = id;
        control.name = field.name;
        control.className = "form-95 win95-dialog-input";
        if (field.type === "select") {
            (field.options || []).forEach((option) => control.add(new Option(option.label, option.value)));
        } else {
            // "password" : saisie masquée (mots de passe des comptes, Paramètres > Utilisateurs).
            control.type = field.type === "password" ? "password" : "text";
            control.autocomplete = field.type === "password" ? "new-password" : "off";
            control.maxLength = 200;
        }
        control.value = field.value ?? "";

        if (field.label) {
            wrapper.appendChild(label);
        }
        wrapper.appendChild(control);
        return wrapper;
    }

    function open({ title, message, fields = [], confirmLabel, cancelLabel = "Annuler", icon }) {
        return new Promise((resolve) => {
            const overlay = document.createElement("div");
            overlay.className = "modal win95-dialog show";
            overlay.setAttribute("role", "dialog");
            overlay.setAttribute("aria-modal", "true");
            overlay.innerHTML = `
                <div class="modal-dialog win95-dialog-box">
                    <div class="modal-content">
                        <div class="modal-header">
                            <div class="modal-title"></div>
                        </div>
                        <form class="modal-body win95-dialog-body">
                            <img alt="" class="win95-dialog-icon">
                            <div class="win95-dialog-content">
                                <p class="win95-dialog-message"></p>
                            </div>
                            <button type="submit" hidden></button>
                        </form>
                        <div class="modal-footer win95-dialog-footer">
                            <button type="button" class="btn start-btn" data-dialog-action="confirm"></button>
                            <button type="button" class="btn start-btn" data-dialog-action="cancel">Annuler</button>
                        </div>
                    </div>
                </div>`;
            overlay.querySelector(".modal-title").textContent = title;
            overlay.querySelector(".win95-dialog-icon").src = window.Win95Asset(`assets/icons/${icon}`);
            overlay.querySelector("[data-dialog-action='confirm']").textContent = confirmLabel;
            // cancelLabel null : un seul bouton (message d'information).
            const cancelButton = overlay.querySelector("[data-dialog-action='cancel']");
            cancelButton.textContent = cancelLabel || "";
            cancelButton.hidden = !cancelLabel;
            const messageElement = overlay.querySelector(".win95-dialog-message");
            messageElement.textContent = message || "";
            messageElement.hidden = !message;
            const content = overlay.querySelector(".win95-dialog-content");
            fields.forEach((field, index) => content.appendChild(createField(field, index)));
            const form = overlay.querySelector("form");

            const close = (value) => {
                document.removeEventListener("keydown", handleKeydown, true);
                overlay.remove();
                resolve(value);
            };
            const confirm = () => close(fields.length > 0
                ? Object.fromEntries(fields.map((field) => [field.name, String(form.elements[field.name].value).trim()]))
                : true);
            const cancel = () => close(fields.length > 0 ? null : false);
            const handleKeydown = (event) => {
                if (event.key === "Escape") {
                    event.stopPropagation();
                    cancel();
                }
            };

            overlay.addEventListener("click", (event) => {
                const action = event.target.closest("[data-dialog-action]")?.dataset.dialogAction;
                if (action) {
                    window.Win95Sounds?.play("menu-command");
                }
                if (action === "confirm") {
                    confirm();
                } else if (action === "cancel") {
                    cancel();
                }
            });
            form.addEventListener("submit", (event) => {
                event.preventDefault();
                confirm();
            });
            document.addEventListener("keydown", handleKeydown, true);
            document.body.appendChild(overlay);
            // Son associé au type de message (Panneau de configuration > Sons).
            window.Win95Sounds?.play({ "msg_warning-0.png": "exclamation", "msg_information-0.png": "asterisk", "msg_question-0.png": "question", "msg_error-0.png": "critical-stop" }[icon] || "default-beep");

            window.setTimeout(() => {
                const firstInput = overlay.querySelector(".win95-dialog-input");
                if (firstInput) {
                    firstInput.focus();
                    firstInput.select?.();
                } else {
                    overlay.querySelector(`[data-dialog-action='${cancelLabel ? "cancel" : "confirm"}']`).focus();
                }
            }, 0);
        });
    }

    const dialog = {
        // Résout true (Oui) ou false (Annuler / Échap).
        confirm({ title = "Confirmation", message, confirmLabel = "Oui", cancelLabel = "Annuler", icon = "msg_warning-0.png" }) {
            return open({ title, message, confirmLabel, cancelLabel, icon });
        },
        // Message d'information à un seul bouton ; résout quand il est fermé.
        alert({ title = "Information", message, confirmLabel = "OK" }) {
            return open({ title, message, confirmLabel, cancelLabel: null, icon: "msg_information-0.png" });
        },
        // Message d'erreur à un seul bouton (icône d'erreur, son « Arrêt critique ») ; résout quand il est fermé.
        error({ title = "Erreur", message, confirmLabel = "OK" }) {
            return open({ title, message, confirmLabel, cancelLabel: null, icon: "msg_error-0.png" });
        },
        // Résout le texte saisi, ou null si annulé / vide.
        async prompt({ title, message, defaultValue = "", confirmLabel = "OK" }) {
            const values = await open({
                title,
                message,
                confirmLabel,
                icon: "msg_question-0.png",
                fields: [{ name: "value", type: "text", value: defaultValue }]
            });
            return values?.value || null;
        },
        // Résout { nomDuChamp: valeur } ou null si annulé.
        form({ title, message = "", fields, confirmLabel = "Valider" }) {
            return open({ title, message, fields, confirmLabel, icon: "msg_question-0.png" });
        }
    };

    window.Win95Dialog = dialog;
    window.Win95Services?.register?.("Win95Dialog", dialog);
})();
