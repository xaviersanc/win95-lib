(() => {
    const utils = window.Win95Utils;
    const dragDrop = window.Win95DragDrop;
    const recycleBin = window.Win95RecycleBin;
    const documentShortcuts = window.Win95DocumentShortcuts;
    const userFiles = window.Win95UserFiles;
    const dialog = window.Win95Dialog;
    const FOLDER_ICON = window.Win95Asset("assets/icons/directory_closed-4.png");
    const SHORTCUT_OVERLAY_ICON = window.Win95Asset("assets/icons/overlay_shortcut-0.png");
    const { MIME } = dragDrop;

    function reloadAllExplorers() {
        document.querySelectorAll("[data-file-explorer]").forEach((root) => root.__win95FileExplorerInstance?.reload());
    }

    class Win95FileExplorer {
        constructor(rootElement) {
            this.rootElement = rootElement;
            this.titleElement = rootElement.querySelector("[data-explorer-title]");
            this.addressElement = rootElement.querySelector("[data-explorer-address]");
            this.treeElement = rootElement.querySelector("[data-explorer-tree]");
            this.listElement = rootElement.querySelector("[data-explorer-list]");
            this.statusElement = rootElement.querySelector("[data-explorer-status]");
            this.backButton = rootElement.querySelector("[data-explorer-back]");
            this.upButton = rootElement.querySelector("[data-explorer-up]");
            this.refreshButton = rootElement.querySelector("[data-explorer-refresh]");
            this.uploadButton = rootElement.querySelector("[data-explorer-upload]");
            this.newFolderButton = rootElement.querySelector("[data-explorer-new-folder]");
            this.emptyBinButton = rootElement.querySelector("[data-explorer-empty-bin]");

            // Espace affiché : « Mes documents » du compte, ou un espace enregistré par le projet (registerSpace), ex. des
            // Documents partagés : sa propre arborescence, sans Corbeille (suppression définitive) et sans raccourcis.
            this.space = fileExplorerApi.spaces[rootElement.dataset.explorerSpace] || null;
            this.files = this.space?.files || userFiles;
            this.isShared = Boolean(this.space?.shared);
            this.rootFolderName = rootElement.dataset.explorerRootName || this.files.getRootName();
            this.rootFolderPath = rootElement.dataset.explorerRootPath || this.files.getRootPath();
            this.emptyFolderMessage = rootElement.dataset.explorerEmptyMessage || "Ce dossier est vide.";
            this.viewModeStorageKey = "win95.explorer.viewMode";
            this.viewMode = this.readPersistedViewMode();

            this.fileSystem = this.createFileSystem();
            this.currentPath = [];
            this.selection = null;
            this.history = [];
            this.boundHandleListDragEnter = this.handleListDragEnter.bind(this);
            this.boundHandleListDragOver = this.handleListDragOver.bind(this);
            this.boundHandleListDragLeave = this.handleListDragLeave.bind(this);
            this.boundHandleListDrop = this.handleListDrop.bind(this);

            if (!this.titleElement || !this.addressElement || !this.treeElement || !this.listElement || !this.statusElement) {
                return;
            }

            this.rootElement.__win95FileExplorerInstance = this;

            this.ensureViewModeSwitch();
            this.bindEvents();
            this.renderAll();
            // Espace partagé : rechargé à chaque ouverture pour voir les ajouts des autres comptes.
            void this.files.load({ force: this.isShared });

            this.boundHandleRecycleBinChanged = () => {
                if (this.isRecycleBinExplorer()) {
                    this.reload({ resetPath: true });
                }
            };
            window.addEventListener(recycleBin.CHANGE_EVENT, this.boundHandleRecycleBinChanged);
            this.boundHandleShortcutsChanged = () => {
                if (this.canHostShortcuts()) {
                    this.renderList();
                }
            };
            window.addEventListener(documentShortcuts.CHANGE_EVENT, this.boundHandleShortcutsChanged);
            this.boundHandleUserFilesChanged = () => this.reload();
            window.addEventListener(this.files.CHANGE_EVENT, this.boundHandleUserFilesChanged);
            this.rootElement.addEventListener("win95:window-closed", () => this.destroy(), { once: true });
        }

        destroy() {
            window.removeEventListener(recycleBin.CHANGE_EVENT, this.boundHandleRecycleBinChanged);
            window.removeEventListener(documentShortcuts.CHANGE_EVENT, this.boundHandleShortcutsChanged);
            window.removeEventListener(this.files.CHANGE_EVENT, this.boundHandleUserFilesChanged);
        }

        // Explorateur de fichiers de l'utilisateur (Mes documents ou l'un de ses sous-dossiers).
        isUserFilesExplorer() {
            return !this.isRecycleBinExplorer();
        }

        // Message à afficher tant que les documents ne sont pas disponibles.
        getStorageNotice() {
            const status = this.files.getStatus();
            if (status.state !== "ready") {
                return status.message || "Chargement de vos documents…";
            }
            if (this.isUserFilesExplorer() && this.fileSystem.missing) {
                return "Ce dossier n'existe plus (supprimé ou renommé).";
            }
            return null;
        }

        // Import, création, renommage et suppression : Mes documents uniquement.
        canWrite() {
            return this.isUserFilesExplorer()
                && !this.getStorageNotice()
                && (this.isShared || documentShortcuts.canHostShortcuts(this.getCurrentAbsoluteFolderPath()));
        }

        // Les raccourcis se rangent uniquement dans Mes documents (pas dans la Corbeille).
        canHostShortcuts() {
            return !this.isShared && this.canWrite();
        }

        getShortcutEntries() {
            if (!this.canHostShortcuts()) {
                return [];
            }

            return documentShortcuts.list(this.getCurrentAbsoluteFolderPath()).map((shortcut) => ({
                name: shortcut.label,
                type: "file",
                icon: shortcut.image,
                virtualType: "document-shortcut",
                shortcut
            }));
        }

        isShortcutEntry(entry) {
            return entry?.virtualType === "document-shortcut";
        }

        getSelectedEntry() {
            return this.findEntry(this.selection?.name, this.selection?.type);
        }

        findEntry(name, type) {
            return this.getDisplayEntries(this.getCurrentNode())
                .find((candidate) => candidate.name === name && candidate.type === type) || null;
        }

        isEditableEntry(entry) {
            return Boolean(entry?.fileId) && this.canWrite();
        }

        async deleteSelection() {
            await this.deleteEntry(this.getSelectedEntry());
        }

        async deleteEntry(entry) {
            if (!entry || (!this.isShortcutEntry(entry) && !this.isEditableEntry(entry))) {
                return;
            }

            // Espace partagé : pas de Corbeille commune, la suppression est définitive.
            if (this.isShared) {
                const confirmedShared = await dialog.confirm({
                    title: "Confirmer la suppression",
                    message: `Supprimer définitivement « ${entry.name} »${entry.type === "folder" ? " et tout son contenu" : ""} ?\nIl disparaîtra pour tous les utilisateurs.`
                });
                if (confirmedShared) {
                    this.selection = null;
                    await this.runStorageAction(() => this.files.remove(entry.fileId));
                }
                return;
            }

            const confirmed = await dialog.confirm({
                title: "Confirmer la suppression",
                message: entry.type === "folder"
                    ? `Voulez-vous vraiment envoyer le dossier « ${entry.name} » et tout son contenu dans la Corbeille ?`
                    : `Voulez-vous vraiment envoyer « ${entry.name} » dans la Corbeille ?`
            });
            if (!confirmed) {
                return;
            }

            const payload = this.isShortcutEntry(entry)
                ? { kind: "document-shortcut", shortcutId: entry.shortcut.id }
                : { kind: entry.type, fileId: entry.fileId, name: entry.name };
            this.selection = null;
            await this.runStorageAction(() => window.Win95WindowManager?.moveToRecycleBin?.(payload));
        }

        async renameEntry(entry) {
            if (!this.isEditableEntry(entry)) {
                return;
            }

            const name = await dialog.prompt({
                title: "Renommer",
                message: `Nouveau nom pour « ${entry.name} » :`,
                defaultValue: entry.name
            });
            if (name && name !== entry.name) {
                const result = await this.runStorageAction(() => this.files.rename(entry.fileId, name));
                if (result?.ok) {
                    this.selection = { name: name.trim(), type: entry.type };
                    this.renderList();
                }
            }
        }

        // Ouverture (double-clic, Entrée ou « Ouvrir » du menu contextuel).
        activateEntry(entry) {
            if (entry.type === "folder") {
                this.openFolder(entry.name);
            } else if (this.isShortcutEntry(entry)) {
                window.Win95WindowManager?.openShortcutTarget?.(entry.shortcut.target);
            } else if (entry.virtualType === "recycle-bin-item") {
                this.statusElement.textContent = `${entry.name} est dans la Corbeille.`;
            } else if (entry.fileId) {
                void this.openUserFile(entry);
            }
        }

        handleListContextMenu(event) {
            event.preventDefault();
            if (!this.isUserFilesExplorer() || this.getStorageNotice()) {
                return;
            }

            const itemElement = event.target.closest(".list-item[data-name]");
            const entry = itemElement ? this.findEntry(itemElement.dataset.name, itemElement.dataset.entryType) : null;
            const menu = window.Win95ContextMenu;

            if (!entry) {
                this.selection = null;
                this.renderList();
                menu.open(event.clientX, event.clientY, [
                    { label: "Importer des fichiers…", disabled: !this.canWrite(), onSelect: () => this.pickFilesToUpload() },
                    {
                        label: "Nouveau",
                        disabled: !this.canWrite(),
                        items: [
                            { label: "Dossier", onSelect: () => this.createFolder() },
                            { separator: true },
                            { label: "Document WordPad", onSelect: () => this.createWordPadDocument() },
                            { label: "Image Paint", onSelect: () => this.createPaintDocument() }
                        ]
                    },
                    { separator: true },
                    { label: "Actualiser", onSelect: () => this.refresh() }
                ]);
                return;
            }

            this.selection = { name: entry.name, type: entry.type };
            this.renderList();
            const editable = this.isEditableEntry(entry);
            const isTextFile = entry.type === "file" && utils.getFileKind(entry.name) === "text";
            menu.open(event.clientX, event.clientY, [
                { label: "Ouvrir", bold: true, onSelect: () => this.activateEntry(entry) },
                ...(isTextFile && editable ? [{ label: "Modifier", onSelect: () => this.activateEntry(entry) }] : []),
                ...this.getContributedMenuItems(entry),
                { separator: true },
                // Un raccourci ne se renomme pas (lecture seule) mais peut être supprimé.
                ...(this.isShortcutEntry(entry) ? [] : [{ label: "Renommer", disabled: !editable, onSelect: () => this.renameEntry(entry) }]),
                { label: "Supprimer", disabled: !editable && !this.isShortcutEntry(entry), onSelect: () => this.deleteEntry(entry) }
            ]);
        }

        // Éléments ajoutés au menu d'un fichier par le projet (registerContextMenuContributor), précédés d'un séparateur.
        getContributedMenuItems(entry) {
            const items = fileExplorerApi.contributors.flatMap((contributor) => {
                try {
                    return contributor(entry, this) || [];
                } catch (error) {
                    console.warn("[FileExplorer] contributeur de menu en erreur", error);
                    return [];
                }
            });
            return items.length > 0 ? [{ separator: true }, ...items] : [];
        }

        reload({ resetPath = false } = {}) {
            this.fileSystem = this.createFileSystem();
            if (resetPath || !this.resolvePath(this.currentPath)) {
                this.currentPath = [];
                this.selection = null;
            }
            this.renderAll();
        }

        readPersistedViewMode() {
            try {
                const rawValue = localStorage.getItem(this.viewModeStorageKey);
                return rawValue === "details" ? "details" : "mosaic";
            } catch {
                return "mosaic";
            }
        }

        persistViewMode() {
            try {
                localStorage.setItem(this.viewModeStorageKey, this.viewMode);
            } catch {
                // ignore storage failures
            }
        }

        ensureViewModeSwitch() {
            const explorerRoot = this.rootElement.querySelector(".explorer");
            if (!explorerRoot) {
                return;
            }

            let switchContainer = explorerRoot.querySelector("[data-explorer-view-switch]");
            if (!switchContainer) {
                switchContainer = document.createElement("div");
                switchContainer.className = "explorer-view-switch";
                switchContainer.dataset.explorerViewSwitch = "";
                switchContainer.innerHTML = `
                    <button type="button" class="btn explorer-view-btn" data-explorer-view="mosaic" aria-label="Vue mosaïque" title="Vue mosaïque">
                        <span class="explorer-view-icon mosaic" aria-hidden="true"></span>
                    </button>
                    <button type="button" class="btn explorer-view-btn" data-explorer-view="details" aria-label="Vue détails" title="Vue détails">
                        <span class="explorer-view-icon details" aria-hidden="true"></span>
                    </button>
                `;
                explorerRoot.appendChild(switchContainer);
            }

            this.viewSwitchElement = switchContainer;
            this.syncViewModeSwitch();
        }

        setViewMode(nextMode) {
            const normalizedMode = nextMode === "details" ? "details" : "mosaic";
            if (this.viewMode === normalizedMode) {
                return;
            }

            this.viewMode = normalizedMode;
            this.persistViewMode();
            this.syncViewModeSwitch();
            this.renderList();
        }

        syncViewModeSwitch() {
            if (!this.viewSwitchElement) {
                return;
            }

            const viewButtons = this.viewSwitchElement.querySelectorAll("[data-explorer-view]");
            viewButtons.forEach((buttonElement) => {
                const isActive = buttonElement.dataset.explorerView === this.viewMode;
                buttonElement.classList.toggle("active", isActive);
                buttonElement.setAttribute("aria-pressed", isActive ? "true" : "false");
            });
        }

        createFileSystem() {
            if (this.isRecycleBinExplorer()) {
                return this.createRecycleBinTree();
            }

            const emptyRoot = { name: this.rootFolderName, type: "folder", relativePath: this.rootFolderPath, fileId: null, children: [] };
            if (!this.files.isLoaded()) {
                return emptyRoot;
            }

            const documentsRoot = this.files.buildTree(this.files.getRootName(), this.files.getRootPath());
            const folder = this.findFolderByPath(documentsRoot, this.rootFolderPath);
            if (folder) {
                return { ...folder, name: this.rootFolderName };
            }
            return { ...emptyRoot, missing: true };
        }

        findFolderByPath(node, targetPath) {
            const target = utils.normalizePath(targetPath).toLowerCase();
            const stack = [node];
            while (stack.length > 0) {
                const current = stack.pop();
                if (current.type !== "folder") {
                    continue;
                }
                if (utils.normalizePath(current.relativePath).toLowerCase() === target) {
                    return current;
                }
                stack.push(...(current.children || []));
            }
            return null;
        }

        isRecycleBinExplorer() {
            return this.rootElement?.dataset?.windowApp === "recycle-bin" || this.rootFolderName === "Corbeille";
        }

        createRecycleBinTree() {
            return {
                name: this.rootFolderName,
                type: "folder",
                relativePath: this.rootFolderPath,
                children: this.getRecycleBinEntries()
            };
        }

        getRecycleBinEntries() {
            const trashedFiles = userFiles.isLoaded()
                ? userFiles.getTrashedFiles().map((row) => ({
                    name: row.name,
                    type: "file",
                    relativePath: `${this.rootFolderPath}/${row.id}`,
                    icon: row.kind === "folder" ? FOLDER_ICON : utils.getFileIcon(row.name),
                    virtualType: "recycle-bin-item",
                    recycleItem: { id: `uf-${row.id}`, kind: "user-file", fileId: row.id, label: row.name }
                }))
                : [];
            return [...trashedFiles, ...this.getLocalRecycleBinEntries()];
        }

        getLocalRecycleBinEntries() {
            return recycleBin.getEntries().map((item) => ({
                name: item.label || item.name || item.sourceName || "Élément",
                type: "file",
                relativePath: `${this.rootFolderPath}/${item.id || item.sourceShortcutId || item.sourceRelativePath || item.label || "item"}`,
                icon: item.icon || item.fileIcon || window.Win95Asset("assets/icons/file_win_shortcut-0.png"),
                virtualType: "recycle-bin-item",
                recycleItem: item
            }));
        }

        bindEvents() {
            if (this.backButton) {
                this.backButton.addEventListener("click", () => this.goBack());
            }

            if (this.upButton) {
                this.upButton.addEventListener("click", () => this.goUp());
            }

            this.refreshButton?.addEventListener("click", () => this.refresh());
            this.uploadButton?.addEventListener("click", () => this.pickFilesToUpload());
            this.newFolderButton?.addEventListener("click", () => this.createFolder());
            this.emptyBinButton?.addEventListener("click", () => this.emptyRecycleBin());

            if (this.viewSwitchElement) {
                this.viewSwitchElement.addEventListener("click", (event) => {
                    const targetButton = event.target.closest("[data-explorer-view]");
                    if (!targetButton) {
                        return;
                    }

                    this.setViewMode(targetButton.dataset.explorerView);
                });
            }

            this.listElement?.addEventListener("keydown", (event) => {
                if (event.key === "Delete") {
                    void this.deleteSelection();
                } else if (event.key === "F2") {
                    event.preventDefault();
                    void this.renameEntry(this.getSelectedEntry());
                }
            });
            this.listElement?.addEventListener("contextmenu", (event) => this.handleListContextMenu(event));

            if (this.listElement && !this.isRecycleBinExplorer()) {
                this.listElement.addEventListener("dragenter", this.boundHandleListDragEnter);
                this.listElement.addEventListener("dragover", this.boundHandleListDragOver);
                this.listElement.addEventListener("dragleave", this.boundHandleListDragLeave);
                this.listElement.addEventListener("drop", this.boundHandleListDrop);
            }
        }

        async refresh() {
            this.statusElement.textContent = "Actualisation…";
            await this.files.load({ force: true });
        }

        getCurrentFolderId() {
            return this.getCurrentNode().fileId || null;
        }

        pickFilesToUpload() {
            const input = document.createElement("input");
            input.type = "file";
            input.multiple = true;
            input.addEventListener("change", () => void this.uploadFiles(input.files), { once: true });
            input.click();
        }

        // Exécute une opération de stockage et affiche son résultat (ou son erreur) dans la barre d'état.
        async runStorageAction(action) {
            try {
                const result = await action();
                if (result?.message) {
                    this.statusElement.textContent = result.message;
                }
                return result;
            } catch (error) {
                console.warn("[Explorer] Opération de stockage impossible", error);
                this.statusElement.textContent = `Opération impossible : ${error?.message || error}`;
                return { ok: false };
            }
        }

        async uploadFiles(fileList) {
            if (!fileList || fileList.length === 0 || !this.canWrite()) {
                return;
            }

            const result = await this.runStorageAction(() => this.files.uploadFiles(this.getCurrentFolderId(), fileList, (message) => {
                this.statusElement.textContent = message;
            }));
            if (result?.message) {
                this.statusElement.textContent = `${result.message} — ${this.files.getUsageLabel()}`;
            }
        }

        async createFolder() {
            if (!this.canWrite()) {
                return;
            }

            const name = await dialog.prompt({ title: "Nouveau dossier", message: "Nom du dossier :", defaultValue: "Nouveau dossier" });
            if (name) {
                await this.runStorageAction(() => this.files.createFolder(this.getCurrentFolderId(), name));
            }
        }

        // Nouveau document WordPad (markdown mis en forme) dans le dossier ouvert, puis ouvert pour l'écrire.
        async createWordPadDocument() {
            if (!this.canWrite()) {
                return;
            }

            const name = await dialog.prompt({ title: "Nouveau document WordPad", message: "Nom du document :", defaultValue: "Nouveau document WordPad" });
            if (!name) {
                return;
            }
            const result = await this.runStorageAction(() => this.files.createTextFile(this.getCurrentFolderId(), name, ""));
            if (result?.ok && result.file) {
                await this.runStorageAction(() => this.files.openFile(result.file.id));
            }
        }

        // Nouvelle image Paint (fichier .paint vide = page blanche) dans le dossier ouvert, puis ouverte dans Paint.
        async createPaintDocument() {
            if (!this.canWrite()) {
                return;
            }

            const name = await dialog.prompt({ title: "Nouvelle image Paint", message: "Nom de l'image :", defaultValue: "Nouvelle image" });
            if (!name) {
                return;
            }
            const fileName = /\.paint$/i.test(name) ? name : `${name}.paint`;
            const result = await this.runStorageAction(() => this.files.createTextFile(this.getCurrentFolderId(), fileName, ""));
            if (result?.ok && result.file) {
                await this.runStorageAction(() => this.files.openFile(result.file.id));
            }
        }

        async emptyRecycleBin() {
            const count = this.getRecycleBinEntries().length;
            if (count === 0) {
                this.statusElement.textContent = "La Corbeille est déjà vide.";
                return;
            }

            const confirmed = await dialog.confirm({
                title: "Vider la Corbeille",
                message: `Supprimer définitivement les ${count} élément(s) de la Corbeille ?\nCette action est irréversible.`
            });
            if (!confirmed) {
                return;
            }

            const result = await this.runStorageAction(() => (userFiles.getTrashedFiles().length > 0
                ? userFiles.emptyTrash()
                : { ok: true, message: "Corbeille vidée." }));
            if (result.ok) {
                window.Win95Sounds?.play("empty-recycle");
                recycleBin.clear();
            }
        }

        renderToolbar() {
            const canWrite = this.canWrite();
            if (this.uploadButton) {
                this.uploadButton.hidden = !canWrite;
            }
            if (this.newFolderButton) {
                this.newFolderButton.hidden = !canWrite;
            }
            if (this.emptyBinButton) {
                this.emptyBinButton.hidden = !this.isRecycleBinExplorer();
            }
        }

        renderAll() {
            const currentNode = this.resolvePath(this.currentPath);
            if (!currentNode || currentNode.type !== "folder") {
                this.currentPath = [];
            }

            this.renderTitle();
            this.renderAddress();
            this.renderTree();
            this.renderList();
            this.renderButtons();
            this.renderToolbar();
        }

        renderTitle() {
            this.titleElement.textContent = this.getCurrentNode().name;
        }

        renderAddress() {
            this.addressElement.value = this.getPathString(this.currentPath);
        }

        renderTree() {
            this.treeElement.innerHTML = "";
            const fragment = document.createDocumentFragment();
            fragment.appendChild(this.createTreeNodeElement(this.fileSystem, [], 0));
            this.treeElement.appendChild(fragment);
        }

        createTreeNodeElement(node, nodePath, depth) {
            const container = document.createElement("div");
            container.className = "tree-node";
            container.style.paddingLeft = `${Math.max(10, depth * 14 + 10)}px`;

            const button = document.createElement("button");
            button.type = "button";
            button.className = "tree-button";

            const icon = document.createElement("img");
            icon.className = "tree-folder-icon";
            icon.alt = "";
            icon.src = window.Win95Asset("assets/icons/directory_closed-4.png");

            const label = document.createElement("span");
            label.textContent = node.name;

            button.appendChild(icon);
            button.appendChild(label);

            if (this.isSamePath(nodePath, this.currentPath)) {
                button.classList.add("active");
            }

            button.addEventListener("click", () => this.navigateTo(nodePath));
            container.appendChild(button);

            if (node.type === "folder" && Array.isArray(node.children)) {
                node.children
                    .filter((child) => child.type === "folder")
                    .forEach((child) => {
                        const childPath = [...nodePath, child.name];
                        container.appendChild(this.createTreeNodeElement(child, childPath, depth + 1));
                    });
            }

            return container;
        }

        renderList() {
            this.listElement.innerHTML = "";

            const storageNotice = this.getStorageNotice();
            if (storageNotice) {
                const noticeText = document.createElement("div");
                noticeText.textContent = storageNotice;
                noticeText.style.padding = "2px";
                this.listElement.appendChild(noticeText);
                this.statusElement.textContent = storageNotice;
                return;
            }


            const currentNode = this.getCurrentNode();
            const entries = this.getDisplayEntries(currentNode);
            const grid = document.createElement("div");
            const isDetailsView = this.viewMode === "details";
            grid.className = `list-grid${isDetailsView ? " details-mode" : ""}`;
            const objectEntries = entries.filter((entry) => !this.isSeparatorEntry(entry));

            entries.forEach((entry) => {
                if (this.isSeparatorEntry(entry)) {
                    const separator = document.createElement("div");
                    separator.className = "list-item list-separator";
                    separator.setAttribute("aria-hidden", "true");

                    const separatorLabel = document.createElement("span");
                    separatorLabel.textContent = entry.label;

                    separator.appendChild(separatorLabel);
                    grid.appendChild(separator);
                    return;
                }

                const itemButton = document.createElement("button");
                itemButton.type = "button";
                itemButton.className = `list-item${isDetailsView ? " details-item" : ""}`;
                itemButton.dataset.name = entry.name;
                itemButton.dataset.entryType = entry.type;
                itemButton.draggable = this.isDraggableFileEntry(entry);

                if (itemButton.draggable) {
                    itemButton.addEventListener("dragstart", (dragEvent) => this.handleFileDragStart(dragEvent, entry));
                    itemButton.addEventListener("dragend", () => itemButton.classList.remove("is-drag-source"));
                }

                if (this.selection && this.selection.name === entry.name && this.selection.type === entry.type) {
                    itemButton.classList.add("selected");
                }

                const icon = document.createElement("img");
                icon.className = "list-item-icon";
                icon.alt = "";
                icon.src = entry.type === "folder" ? FOLDER_ICON : (entry.icon || utils.getFileIcon(entry.name));

                const label = document.createElement("span");
                label.className = "list-item-label";
                label.textContent = entry.name;

                if (this.isShortcutEntry(entry)) {
                    const iconWrap = document.createElement("span");
                    iconWrap.className = "list-item-icon-wrap";
                    const overlay = document.createElement("img");
                    overlay.className = "list-item-shortcut-overlay";
                    overlay.src = SHORTCUT_OVERLAY_ICON;
                    overlay.alt = "Raccourci";
                    iconWrap.appendChild(icon);
                    iconWrap.appendChild(overlay);
                    itemButton.appendChild(iconWrap);
                    itemButton.title = `${entry.name} (raccourci — lecture seule)`;
                } else {
                    itemButton.appendChild(icon);
                }
                itemButton.appendChild(label);

                itemButton.addEventListener("click", () => {
                    this.selection = { name: entry.name, type: entry.type };
                    this.renderList();
                    // La liste est reconstruite : on rend le focus à l'élément pour les raccourcis clavier (Suppr).
                    this.listElement.querySelector(".list-item.selected")?.focus();
                    this.statusElement.textContent = `${entry.name} sélectionné`;
                });

                // Le dblclick natif part vers un nœud déjà redessiné (détaché) : seul le dblclick recomposé de Win95Mouse compte.
                itemButton.addEventListener("dblclick", (event) => !event.isTrusted && this.activateEntry(entry));

                grid.appendChild(itemButton);
            });

            const notice = this.files.getStatus().notice;
            const usageSuffix = this.isUserFilesExplorer() ? ` — ${this.files.getUsageLabel()}${notice ? ` — ${notice}` : ""}` : "";
            if (entries.length === 0) {
                const emptyText = document.createElement("div");
                emptyText.textContent = this.canWrite()
                    ? `${this.emptyFolderMessage} Glissez des fichiers ici ou utilisez « Importer ».`
                    : this.emptyFolderMessage;
                emptyText.style.padding = "2px";
                this.listElement.appendChild(emptyText);
                this.statusElement.textContent = `0 objet${usageSuffix}`;
                return;
            }

            this.listElement.appendChild(grid);
            this.statusElement.textContent = `${objectEntries.length} objet${objectEntries.length > 1 ? "s" : ""}${usageSuffix}`;
        }

        renderButtons() {
            if (this.backButton) {
                this.backButton.disabled = this.history.length === 0;
            }

            if (this.upButton) {
                this.upButton.disabled = this.currentPath.length === 0;
            }
        }

        goBack() {
            if (this.history.length === 0) {
                return;
            }

            const previousPath = this.history.pop();
            this.currentPath = [...previousPath];
            this.selection = null;
            this.renderAll();
        }

        goUp() {
            if (this.currentPath.length === 0) {
                return;
            }

            this.history.push([...this.currentPath]);
            this.currentPath = this.currentPath.slice(0, -1);
            this.selection = null;
            this.renderAll();
        }

        openFolder(folderName) {
            const currentNode = this.getCurrentNode();
            if (!Array.isArray(currentNode.children)) {
                return;
            }

            const target = currentNode.children.find((entry) => entry.type === "folder" && entry.name === folderName);
            if (!target) {
                this.statusElement.textContent = "Dossier introuvable.";
                return;
            }

            this.history.push([...this.currentPath]);
            this.currentPath = [...this.currentPath, target.name];
            this.selection = null;
            this.renderAll();
        }

        navigateTo(targetPath) {
            const node = this.resolvePath(targetPath);
            if (!node || node.type !== "folder") {
                this.statusElement.textContent = "Impossible d'ouvrir ce chemin.";
                return;
            }

            if (!this.isSamePath(targetPath, this.currentPath)) {
                this.history.push([...this.currentPath]);
            }

            this.currentPath = [...targetPath];
            this.selection = null;
            this.renderAll();
        }

        async openUserFile(entry) {
            const siblingIds = (this.getCurrentNode().children || [])
                .filter((child) => child.type === "file" && child.fileId)
                .map((child) => child.fileId);
            this.statusElement.textContent = `Ouverture de ${entry.name}…`;
            await this.runStorageAction(() => this.files.openFile(entry.fileId, siblingIds));
        }

        getDisplayEntries(currentNode) {
            return [...this.getIndexedDisplayEntries(currentNode), ...this.getShortcutEntries()];
        }

        getIndexedDisplayEntries(currentNode) {
            const entries = Array.isArray(currentNode.children) ? [...currentNode.children] : [];
            return entries.sort((left, right) => (left.type === right.type ? 0 : left.type === "folder" ? -1 : 1));
        }

        isSeparatorEntry(entry) {
            return !!entry && entry.type === "separator";
        }

        getCurrentAbsoluteFolderPath() {
            return this.getCurrentAbsoluteFolderSegments().join("/");
        }

        isDraggableFileEntry(entry) {
            if (!entry || this.isSeparatorEntry(entry)) {
                return false;
            }

            if (entry.virtualType === "recycle-bin-item" || this.isShortcutEntry(entry)) {
                return true;
            }

            // Les éléments d'un espace partagé ne se glissent pas vers le bureau ou la Corbeille (suppression : Suppr).
            if (this.isShared) {
                return false;
            }

            if (entry.type !== "file" && entry.type !== "folder") {
                return false;
            }

            return true;
        }

        handleFileDragStart(event, entry) {
            const payload = this.buildFileDragPayload(entry);
            const isRecycleBinItem = payload?.kind === "recycle-bin-item";
            const mimeTypes = [MIME.explorerEntry];
            if (isRecycleBinItem) {
                mimeTypes.push(MIME.recycleBinEntry);
            }

            if (dragDrop.writePayload(event.dataTransfer, payload, mimeTypes, isRecycleBinItem ? "move" : "copyMove")) {
                event.currentTarget.classList.add("is-drag-source");
            }
        }

        buildFileDragPayload(entry) {
            if (this.isShortcutEntry(entry)) {
                return {
                    source: "document-shortcut",
                    kind: "document-shortcut",
                    name: entry.name,
                    icon: entry.icon,
                    shortcutId: entry.shortcut.id
                };
            }

            if (entry?.virtualType === "recycle-bin-item" && entry.recycleItem) {
                return {
                    source: "recycle-bin",
                    kind: "recycle-bin-item",
                    name: entry.name,
                    icon: entry.icon || entry.recycleItem.icon || window.Win95Asset("assets/icons/file_win_shortcut-0.png"),
                    recycleItem: entry.recycleItem,
                    sourceRelativePath: entry.recycleItem.sourceRelativePath || "",
                    sourceFileName: entry.recycleItem.sourceFileName || entry.recycleItem.label || entry.name,
                    sourceKind: entry.recycleItem.kind || entry.recycleItem.sourceKind || "file"
                };
            }

            if (!entry || (entry.type !== "file" && entry.type !== "folder")) {
                return null;
            }

            const relativePath = [...this.getCurrentAbsoluteFolderSegments(), entry.name].join("/");
            return {
                source: "file-explorer",
                kind: entry.type === "folder" ? "folder" : "file",
                name: entry.name,
                icon: entry.type === "folder" ? FOLDER_ICON : (entry.icon || utils.getFileIcon(entry.name)),
                fileId: entry.fileId || null,
                relativePath,
                folderPath: entry.type === "folder" ? relativePath : undefined,
                fileKind: entry.type === "folder" ? "folder" : utils.getFileKind(entry.name)
            };
        }

        handleListDragEnter(event) {
            if (!this.canAcceptListDrop(event.dataTransfer)) {
                return;
            }

            event.preventDefault();
            this.toggleListDropState(true);
        }

        handleListDragOver(event) {
            if (!this.canAcceptListDrop(event.dataTransfer)) {
                return;
            }

            event.preventDefault();
            event.dataTransfer.dropEffect = dragDrop.hasAnyType(event.dataTransfer, [MIME.recycleBinEntry]) ? "move" : "copy";
            this.toggleListDropState(true);
        }

        handleListDragLeave(event) {
            const relatedTarget = event.relatedTarget;
            if (relatedTarget && event.currentTarget.contains(relatedTarget)) {
                return;
            }

            this.toggleListDropState(false);
        }

        handleListDrop(event) {
            this.toggleListDropState(false);
            if (!this.canAcceptListDrop(event.dataTransfer)) {
                return;
            }

            event.preventDefault();
            // Un élément de l'explorateur glissé embarque parfois son icône comme « fichier » : seul le contenu glissé compte.
            if (event.dataTransfer.files?.length > 0 && !dragDrop.hasAnyType(event.dataTransfer, [MIME.explorerEntry])) {
                void this.uploadFiles(event.dataTransfer.files);
                return;
            }

            const payload = dragDrop.readPayload(event.dataTransfer, [MIME.recycleBinEntry, MIME.explorerEntry]);
            const message = payload ? this.handleDroppedPayload(payload) : null;
            if (message) {
                this.statusElement.textContent = message;
            }
        }

        handleDroppedPayload(payload) {
            if (payload.kind === "recycle-bin-item") {
                Promise.resolve(window.Win95WindowManager?.restoreRecycleBinItem?.(payload.recycleItem))
                    .then((result) => {
                        if (result?.message) {
                            this.statusElement.textContent = result.message;
                        }
                    });
                return null;
            }

            // Dépôts propres au projet (registerDropHandler) : renvoie un message, ou undefined pour laisser les autres répondre.
            for (const handler of fileExplorerApi.dropHandlers) {
                const handled = handler(payload, this);
                if (handled !== undefined) {
                    return handled;
                }
            }

            if (!this.canHostShortcuts()) {
                return null;
            }

            const folderPath = this.getCurrentAbsoluteFolderPath();
            if (payload.kind === "document-shortcut") {
                const moved = documentShortcuts.move(payload.shortcutId, folderPath);
                return moved ? `${moved.label} déplacé dans ce dossier.` : null;
            }

            return null;
        }

        canAcceptListDrop(dataTransfer) {
            return dragDrop.hasAnyType(dataTransfer, [MIME.recycleBinEntry])
                || (this.canWrite() && dragDrop.hasAnyType(dataTransfer, ["Files"]))
                || (this.canWrite() && dragDrop.hasAnyType(dataTransfer, [MIME.explorerEntry]));
        }

        toggleListDropState(isActive) {
            if (this.listElement) {
                this.listElement.classList.toggle("is-drop-target", isActive);
            }
        }

        getCurrentNode() {
            const node = this.resolvePath(this.currentPath);
            return node && node.type === "folder" ? node : this.fileSystem;
        }

        resolvePath(pathArray) {
            let node = this.fileSystem;

            for (const segment of pathArray) {
                if (!node || node.type !== "folder" || !Array.isArray(node.children)) {
                    return null;
                }

                node = node.children.find((child) => child.type === "folder" && child.name === segment) || null;
            }

            return node;
        }

        getPathString(pathArray) {
            if (!Array.isArray(pathArray) || pathArray.length === 0) {
                return this.getRootPathLabel();
            }

            return `${this.getRootPathLabel()}\\${pathArray.join("\\")}`;
        }

        getRootPathLabel() {
            if (this.isRecycleBinExplorer()) {
                return "C:\\Corbeille";
            }

            // Sous-dossier ouvert via un raccourci : chemin affiché depuis Mes documents.
            const documentsPath = utils.normalizePath(this.files.getRootPath());
            const subPath = utils.normalizePath(this.rootFolderPath).slice(documentsPath.length).replace(/^\//, "");
            const rootLabel = this.isShared ? (this.space.rootLabel || this.files.getRootName()) : "C:\\Mes documents";
            return [rootLabel, ...subPath.split("/").filter(Boolean)].join("\\");
        }

        getCurrentAbsoluteFolderSegments() {
            const segments = this.rootFolderPath.split("/").filter(Boolean);
            return [...segments, ...this.currentPath];
        }

        isSamePath(pathA, pathB) {
            if (!Array.isArray(pathA) || !Array.isArray(pathB) || pathA.length !== pathB.length) {
                return false;
            }

            return pathA.every((segment, index) => segment === pathB[index]);
        }
    }

    function initializeFileExplorer() {
        const explorerWindows = document.querySelectorAll("[data-file-explorer]");
        explorerWindows.forEach((windowElement) => {
            window.Win95FileExplorer.attach(windowElement);
        });
    }

    const fileExplorerApi = {
        // Espaces supplémentaires : clé -> { files: store (Win95UserFiles.create), shared: true, rootLabel: "chemin affiché" }.
        // Une fenêtre s'y rattache avec data-explorer-space="<clé>" (WindowManager.createExplorerWindow({ space })).
        spaces: {},
        // Contributeurs de menu : (entrée, explorateur) => éléments de menu | [] (voir Win95ContextMenu).
        contributors: [],
        // Gestionnaires de dépôt : (charge utile, explorateur) => message | null | undefined (undefined = pas concerné).
        dropHandlers: [],
        registerDropHandler(handler) {
            fileExplorerApi.dropHandlers.push(handler);
        },
        registerSpace(key, space) {
            fileExplorerApi.spaces[key] = space;
        },
        registerContextMenuContributor(contributor) {
            fileExplorerApi.contributors.push(contributor);
        },
        attach(rootElement) {
            if (!rootElement) {
                return null;
            }

            if (rootElement.__win95FileExplorerInstance) {
                return rootElement.__win95FileExplorerInstance;
            }

            return new Win95FileExplorer(rootElement);
        },
        initialize: initializeFileExplorer,
        reloadAll: reloadAllExplorers
    };

    window.Win95FileExplorer = fileExplorerApi;
    window.Win95Services?.register?.("Win95FileExplorer", fileExplorerApi);

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeFileExplorer);
    } else {
        initializeFileExplorer();
    }
})();
