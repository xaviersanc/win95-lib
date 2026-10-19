(() => {
    // Bloc-notes / WordPad. Les fichiers texte (.txt, .md, sans extension) s'ouvrent mis en forme dans un
    // éditeur façon WordPad (Win95RichText : gras, italique, titres, listes...), enregistré en markdown ;
    // les autres fichiers (code, CSV, JSON...) restent en texte brut. "Texte brut" / "Mise en forme" bascule.
    // Enregistrer : un fichier de Mes documents est mis à jour ; un document qui n'y est pas encore (nouveau document,
    // fiche personnalisée...) est enregistré dans Mes documents (racine) sous le nom choisi, puis suivi comme tel.
    const RICH_EXTENSIONS = /(\.(txt|md|markdown)|^[^.]*)$/i;

    class Win95Notepad {
        constructor(rootElement) {
            this.rootElement = rootElement;
            this.titleElement = rootElement.querySelector("[data-notepad-title]");
            this.editorElement = rootElement.querySelector("[data-notepad-editor]");
            this.statusElement = rootElement.querySelector("[data-notepad-status]");
            this.saveButton = rootElement.querySelector("[data-notepad-save]");
            this.onSave = null;
            this.isSaving = false;

            this.currentFileName = "Bloc-notes";
            this.currentPath = "";
            this.isDirty = false;
            this.isReady = false;

            if (!this.titleElement || !this.editorElement || !this.statusElement) {
                return;
            }

            this.handleInput = this.handleInput.bind(this);
            this.editorElement.addEventListener("input", this.handleInput);
            this.rootElement.addEventListener("keydown", (event) => {
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                    event.preventDefault();
                    void this.save();
                }
            });

            // Éditeur mis en forme (WordPad), placé à côté du texte brut.
            this.richMode = false;
            this.richEditor = window.Win95RichText?.createEditor({ onInput: this.handleInput, ariaLabel: "Contenu du document" }) || null;
            if (this.richEditor) {
                this.richEditor.element.classList.add("notepad-wordpad");
                this.editorElement.after(this.richEditor.element);
                this.modeButton = document.createElement("button");
                this.modeButton.type = "button";
                this.modeButton.className = "notepad-menu-action";
                this.modeButton.dataset.notepadMode = "";
                this.modeButton.addEventListener("click", () => this.setRichMode(!this.richMode));
                this.rootElement.querySelector(".notepad-menu-bar")?.appendChild(this.modeButton);
            }
            this.saveButton?.addEventListener("click", () => void this.save());
            this.rootElement.addEventListener("win95:window-closing", (event) => this.handleWindowClosing(event));

            this.rootElement.__win95NotepadInstance = this;
            this.setDocument({
                fileName: this.rootElement.dataset.fileName || "Nouveau document",
                content: this.editorElement.value || "",
                relativePath: this.rootElement.dataset.filePath || ""
            });
            this.isReady = true;
        }

        handleInput() {
            if (!this.isReady) {
                return;
            }

            this.isDirty = true;
            this.updateTitle();
            this.updateStatus();
        }

        // Enregistre via le gestionnaire fourni à l'ouverture (fichier de Mes documents), sinon dans Mes documents.
        async save() {
            if (this.isSaving) {
                return;
            }
            if (!this.onSave) {
                await this.saveToDocuments();
                return;
            }

            this.isSaving = true;
            this.statusElement.textContent = "Enregistrement…";
            try {
                const result = await this.onSave(this.getValue());
                if (result?.ok) {
                    this.isDirty = false;
                    this.updateTitle();
                }
                this.updateStatus(result?.message);
            } catch (error) {
                this.updateStatus(`Enregistrement impossible : ${error?.message || error}`);
            } finally {
                this.isSaving = false;
            }
        }

        // "Enregistrer dans Mes documents" : crée le document à la racine de Mes documents, puis l'enregistrement
        // suivant met ce fichier à jour.
        async saveToDocuments() {
            const userFiles = window.Win95UserFiles;
            if (!userFiles) {
                this.updateStatus("Mes documents indisponible.");
                return;
            }
            const suggested = String(this.currentFileName || "Nouveau document").replace(/\.(md|markdown|txt)$/i, "");
            const name = await window.Win95Dialog.prompt({
                title: `${this.getAppName()} — Enregistrer`,
                message: "Enregistrer dans Mes documents sous le nom :",
                defaultValue: suggested
            });
            if (!name) {
                return;
            }
            this.isSaving = true;
            this.statusElement.textContent = "Enregistrement…";
            try {
                const extension = this.richMode ? "" : (String(this.currentFileName).match(/\.[a-z0-9]{1,6}$/i)?.[0] || ".txt");
                const fileName = /\.[a-z0-9]{1,6}$/i.test(name) ? name : `${name}${extension}`;
                const result = await userFiles.createTextFile(null, fileName, this.getValue());
                if (result.ok && result.file) {
                    const fileId = result.file.id;
                    this.onSave = (text) => userFiles.saveTextContent(fileId, text);
                    this.currentFileName = result.file.name;
                    this.isDirty = false;
                    this.updateTitle();
                }
                this.updateStatus(result.message);
            } catch (error) {
                this.updateStatus(`Enregistrement impossible : ${error?.message || error}`);
            } finally {
                this.isSaving = false;
                this.updateSaveButton();
            }
        }

        updateSaveButton() {
            if (!this.saveButton) {
                return;
            }
            this.saveButton.hidden = false;
            this.saveButton.textContent = this.onSave ? "Enregistrer" : "Enregistrer dans Mes documents";
            this.saveButton.title = this.onSave ? "Enregistrer (Ctrl+S)" : "Créer ce document dans Mes documents (Ctrl+S)";
        }

        getValue() {
            return this.richMode ? this.richEditor.getValue() : this.editorElement.value;
        }

        // Bascule mise en forme / texte brut en conservant le contenu (markdown).
        setRichMode(enabled) {
            if (!this.richEditor) {
                return;
            }
            const value = this.getValue();
            this.richMode = Boolean(enabled);
            if (this.richMode) {
                this.richEditor.setValue(value);
            } else {
                this.editorElement.value = value;
            }
            this.editorElement.hidden = this.richMode;
            this.richEditor.element.hidden = !this.richMode;
            this.richEditor.setReadOnly(false);
            this.modeButton.textContent = this.richMode ? "Texte brut" : "Mise en forme";
            this.modeButton.title = this.richMode ? "Afficher le texte brut (markdown)" : "Afficher le document mis en forme";
            this.updateTitle();
            this.updateStatus();
        }

        async handleWindowClosing(event) {
            if (!this.isDirty) {
                return;
            }

            event.preventDefault();
            const confirmed = await window.Win95Dialog.confirm({
                title: this.getAppName(),
                message: `Les modifications de « ${this.currentFileName} » ne sont pas enregistrées.\nFermer sans enregistrer ?`,
                confirmLabel: "Fermer"
            });
            if (confirmed) {
                this.isDirty = false;
                window.Win95WindowManager?.closeWindow(this.rootElement);
            }
        }

        setDocument(fileDetail) {
            const detail = fileDetail || {};
            const content = typeof detail.content === "string" ? detail.content : "";
            this.onSave = typeof detail.onSave === "function" ? detail.onSave : null;
            this.updateSaveButton();
            this.currentFileName = detail.fileName || this.getFileNameFromPath(detail.relativePath) || "Nouveau document";
            this.currentPath = detail.relativePath || "";
            this.editorElement.value = this.normalizeLineEndings(content);
            this.isDirty = false;
            this.isReady = true;
            if (this.richEditor) {
                // Contenu tout juste placé dans le texte brut : il sert de source à la bascule.
                this.richMode = false;
                this.setRichMode(RICH_EXTENSIONS.test(this.currentFileName));
            }
            this.updateTitle();
            this.updateStatus();
            this.editorElement.scrollTop = 0;
            this.editorElement.scrollLeft = 0;
        }

        async loadFromPath(relativePath) {
            if (!relativePath) {
                this.setDocument({ fileName: "Nouveau document", content: "" });
                return true;
            }

            const safeUrl = window.Win95Utils.toSafeUrl(relativePath);

            try {
                const response = await fetch(safeUrl, { cache: "no-store" });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const content = await response.text();
                this.setDocument({
                    fileName: this.getFileNameFromPath(relativePath),
                    relativePath,
                    content
                });
                return true;
            } catch {
                this.setDocument({
                    fileName: this.getFileNameFromPath(relativePath),
                    relativePath,
                    content: "Impossible de charger ce fichier texte."
                });
                return false;
            }
        }

        getAppName() {
            return this.richMode ? "WordPad" : "Bloc-notes";
        }

        updateTitle() {
            const suffix = this.currentFileName ? ` - ${this.isDirty ? "*" : ""}${this.currentFileName}` : "";
            this.titleElement.textContent = `${this.getAppName()}${suffix}`;
        }

        updateStatus(message = "") {
            const lineCount = this.getLineCount(this.getValue());
            const dirtyLabel = message || (this.isDirty ? "Modifié" : "Prêt");
            this.statusElement.textContent = `${dirtyLabel} | ${lineCount} ligne${lineCount > 1 ? "s" : ""}`;
        }

        getLineCount(value) {
            if (!value) {
                return 1;
            }

            return value.split(/\r?\n/).length;
        }

        getFileNameFromPath(relativePath) {
            if (typeof relativePath !== "string" || relativePath.length === 0) {
                return "Nouveau document";
            }

            const parts = relativePath.split("/").filter(Boolean);
            return parts.length > 0 ? parts[parts.length - 1] : relativePath;
        }

        normalizeLineEndings(value) {
            return typeof value === "string" ? value.replace(/\r\n/g, "\n") : "";
        }
    }

    function initializeNotepad() {
        const notepadWindows = document.querySelectorAll("[data-window-app='notepad']");
        notepadWindows.forEach((notepadWindow) => {
            window.Win95Notepad.attach(notepadWindow);
        });
    }

    const notepadApi = {
        attach(rootElement) {
            if (rootElement.__win95NotepadInstance) {
                return rootElement.__win95NotepadInstance;
            }

            return new Win95Notepad(rootElement);
        },
        initialize: initializeNotepad,
        openFromFile(fileDetail) {
            if (!fileDetail || !fileDetail.relativePath) {
                return null;
            }

            const manager = window.Win95WindowManager;
            let windowElement = null;

            if (manager && typeof manager.openApp === "function") {
                windowElement = manager.openApp("notepad", { forceNew: true });
            }

            if (!windowElement) {
                windowElement = document.querySelector("[data-window-app='notepad']");
            }

            if (!windowElement) {
                return null;
            }

            const instance = windowElement.__win95NotepadInstance || notepadApi.attach(windowElement);
            if (!instance) {
                return null;
            }

            // Contenu fourni (même vide) : affiché tel quel ; sinon chargé depuis l'URL/le chemin.
            if (typeof fileDetail.content === "string") {
                instance.setDocument({
                    fileName: fileDetail.fileName || instance.getFileNameFromPath(fileDetail.relativePath),
                    relativePath: fileDetail.relativePath,
                    content: fileDetail.content,
                    onSave: fileDetail.onSave
                });
                return instance;
            }

            instance.loadFromPath(fileDetail.relativePath);
            return instance;
        }
    };

    window.Win95Notepad = notepadApi;
    window.Win95Services?.register?.("Win95Notepad", notepadApi);

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeNotepad);
    } else {
        initializeNotepad();
    }
})();
