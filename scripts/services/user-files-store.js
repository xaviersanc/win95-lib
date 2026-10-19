(() => {
    // Mes documents (Win95UserFiles) : arborescence de fichiers et dossiers d'un compte, indépendante de l'endroit où elle vit.
    // Le stockage est délégué à un fournisseur (scripts/storage/ : "local" IndexedDB, "supabase", "supabase+drive") choisi par
    // Win95Config.storage.provider ; ce fichier ne contient que la logique commune : noms uniques, Corbeille, quotas,
    // ouverture dans la bonne application, copie « Envoyer à ».
    //
    //  - ligne : { id, parent_id, name, kind: "file"|"folder", size, mime_type, storage_path, trashed_at } ;
    //  - la Corbeille est logique (trashed_at) : « Restaurer » retire la marque, « Vider la Corbeille » supprime définitivement ;
    //  - Win95UserFiles.create({ getOwner, changeEvent, shared }) fabrique d'autres espaces (ex. des Documents partagés) ;
    //  - toute modification émet "win95:user-files-changed" (ou l'événement de l'espace).

    const SHARED_ROOT = "Documents partagés";
    const MY_ROOT = "Mes documents";
    const utils = () => window.Win95Utils;

    function createFileStore({ getOwner, changeEvent, shared = false, rootName = shared ? SHARED_ROOT : MY_ROOT, getRootPath = null }) {
        const backend = () => window.Win95Storage.getBackend();
        let rows = [];
        let loadedOwner = null;
        let loadPromise = null;
        let initialized = false;
        let status = { state: "idle", message: "", notice: "" };

        const refOf = (row) => row.storage_path || row.id;     // ancienne ligne locale : contenu sous son id
        const limits = () => backend().limits;
        const notify = () => window.dispatchEvent(new CustomEvent(changeEvent));

        function getRow(id) {
            return rows.find((row) => row.id === id) || null;
        }

        function getChildren(parentId, { includeTrashed = false } = {}) {
            return rows.filter((row) => (row.parent_id || null) === (parentId || null) && (includeTrashed || !row.trashed_at));
        }

        function getDescendants(id) {
            const result = [];
            const stack = [id];
            while (stack.length > 0) {
                const currentId = stack.pop();
                rows.filter((row) => row.parent_id === currentId).forEach((child) => {
                    result.push(child);
                    stack.push(child.id);
                });
            }
            return result;
        }

        // "Nom.ext", puis "Nom (2).ext"… si le nom est pris dans le dossier.
        function getAvailableName(parentId, desiredName, excludedId = null) {
            const taken = new Set(getChildren(parentId).filter((row) => row.id !== excludedId).map((row) => row.name.toLowerCase()));
            if (!taken.has(desiredName.toLowerCase())) {
                return desiredName;
            }
            const extensionIndex = desiredName.lastIndexOf(".");
            const hasExtension = extensionIndex > 0;
            const base = hasExtension ? desiredName.slice(0, extensionIndex) : desiredName;
            const extension = hasExtension ? desiredName.slice(extensionIndex) : "";
            let suffix = 2;
            while (taken.has(`${base} (${suffix})${extension}`.toLowerCase())) {
                suffix += 1;
            }
            return `${base} (${suffix})${extension}`;
        }

        function sanitizeName(name) {
            return String(name || "").replace(/[\\/]/g, "-").trim().slice(0, 200);
        }

        const errorMessage = (error) => error?.message || String(error);

        // Ligne « fichier » pour un contenu déjà envoyé ; sans ligne, le contenu orphelin est retiré.
        async function insertFileRow({ parentId, name, size, mimeType, storagePath }) {
            const owner = getOwner();
            try {
                const row = await backend().insertRow(owner, { parent_id: parentId || null, name, kind: "file", size, mime_type: mimeType || null, storage_path: storagePath });
                rows.push(row);
                return row;
            } catch (error) {
                await backend().removeContents(owner, [storagePath]).catch(() => {});
                throw error;
            }
        }

        async function writeFile(parentId, name, blob, mimeType) {
            const storagePath = await backend().storeContent(getOwner(), blob, { name, mimeType: mimeType || blob.type, shared });
            return insertFileRow({ parentId, name, size: blob.size, mimeType: mimeType || blob.type, storagePath });
        }

        // Taille totale d'éléments à copier (voir snapshot ; { kind: "text" } = document à créer).
        function measureItems(items) {
            return (items || []).reduce((total, item) => total + (item.kind === "folder"
                ? measureItems(item.children)
                : item.kind === "text" ? new Blob([String(item.text ?? "")]).size : Number(item.size) || 0), 0);
        }

        async function copyItem(parentId, item) {
            if (item.kind === "folder") {
                const result = await store.createFolder(parentId, item.name);
                if (!result.ok) {
                    throw new Error(result.message);
                }
                for (const child of item.children || []) {
                    await copyItem(result.folder.id, child);
                }
                return;
            }
            const name = getAvailableName(parentId, sanitizeName(item.name) || "fichier");
            if (item.kind === "text") {
                await writeFile(parentId, name, new Blob([String(item.text ?? "")], { type: "text/markdown;charset=utf-8" }), "text/markdown");
                return;
            }
            if (Number(item.size) > limits().maxFile) {
                throw new Error(`trop volumineux (maximum ${utils().formatBytes(limits().maxFile)}).`);
            }
            const storagePath = await backend().copyContent(getOwner(), item.storage_path, { name, shared, fromOwner: item.owner || getOwner() });
            await insertFileRow({ parentId, name, size: Number(item.size) || 0, mimeType: item.mime_type, storagePath });
        }

        const store = {
            CHANGE_EVENT: changeEvent,
            isShared: shared,

            get QUOTA_BYTES() {
                return limits().quota;
            },

            get MAX_FILE_BYTES() {
                return limits().maxFile;
            },

            // Racine de l'espace dans l'explorateur (nom affiché, chemin relatif).
            getRootName() {
                return rootName;
            },

            getRootPath() {
                return getRootPath ? getRootPath() : shared ? SHARED_ROOT : utils().getUserDocumentsPath();
            },

            // { state: "idle"|"loading"|"ready"|"unavailable", message, notice } ; notice = repli sur le stockage local.
            getStatus() {
                return { ...status, notice: backend().notice || "" };
            },

            getQuota() {
                return limits().quota;
            },

            getMaxFileSize() {
                return limits().maxFile;
            },

            isLoaded() {
                return status.state === "ready" && loadedOwner === getOwner();
            },

            async load({ force = false } = {}) {
                const owner = getOwner();
                if (!force && loadedOwner === owner && status.state === "ready") {
                    return rows;
                }
                if (loadPromise && !force) {
                    return loadPromise;
                }
                status = { state: "loading", message: "Chargement de vos documents…" };
                loadPromise = (async () => {
                    try {
                        if (!initialized) {
                            await backend().init();
                            initialized = true;
                        }
                        const loaded = await backend().loadRows(owner);
                        rows = loaded.slice().sort((left, right) => left.name.localeCompare(right.name, "fr", { sensitivity: "base" }));
                        loadedOwner = owner;
                        status = { state: "ready", message: "" };
                    } catch (error) {
                        rows = [];
                        status = { state: "unavailable", message: `Stockage indisponible : ${errorMessage(error)}` };
                    }
                    loadPromise = null;
                    notify();
                    return rows;
                })();
                return loadPromise;
            },

            // Changement de compte (ouverture ou fermeture de session) : on oublie le cache.
            reset() {
                rows = [];
                loadedOwner = null;
                loadPromise = null;
                status = { state: "idle", message: "" };
                backend().reset?.();
            },

            async ensureReady() {
                if (!this.isLoaded()) {
                    await this.load();
                }
                if (status.state !== "ready") {
                    throw new Error(status.message || "Documents indisponibles.");
                }
            },

            getUsage() {
                return rows.reduce((total, row) => total + (Number(row.size) || 0), 0);
            },

            getUsageLabel() {
                const content = backend().contentProvider === "drive" ? " (Google Drive)" : "";
                return `${utils().formatBytes(this.getUsage())} / ${utils().formatBytes(limits().quota)} utilisés${shared ? " par tous" : ""}${content}`;
            },

            // Arbre des éléments visibles, au format attendu par l'explorateur.
            buildTree(treeName, treePath) {
                const buildNode = (row, parentPath) => {
                    const relativePath = `${parentPath}/${row.name}`;
                    if (row.kind === "folder") {
                        return { name: row.name, type: "folder", relativePath, fileId: row.id, children: getChildren(row.id).map((child) => buildNode(child, relativePath)) };
                    }
                    return { name: row.name, type: "file", relativePath, fileId: row.id, size: Number(row.size) || 0, icon: utils().getFileIcon(row.name) };
                };
                return { name: treeName, type: "folder", relativePath: treePath, fileId: null, children: getChildren(null).map((row) => buildNode(row, treePath)) };
            },

            // Éléments mis à la Corbeille (le contenu d'un dossier supprimé suit son dossier).
            getTrashedFiles() {
                return rows.filter((row) => row.trashed_at);
            },

            async createFolder(parentId, desiredName) {
                await this.ensureReady();
                const name = sanitizeName(desiredName);
                if (!name) {
                    return { ok: false, message: "Nom de dossier vide." };
                }
                try {
                    const folder = await backend().insertRow(getOwner(), { parent_id: parentId || null, name: getAvailableName(parentId, name), kind: "folder" });
                    rows.push(folder);
                    notify();
                    return { ok: true, message: `Dossier « ${folder.name} » créé.`, folder };
                } catch (error) {
                    return { ok: false, message: errorMessage(error) };
                }
            },

            // Crée un document texte (markdown, extension .md par défaut) dans un dossier (null = racine).
            async createTextFile(parentId, desiredName, text = "") {
                await this.ensureReady();
                let name = sanitizeName(desiredName) || "Nouveau document";
                if (!/\.[a-z0-9]{1,6}$/i.test(name)) {
                    name = `${name}.md`;
                }
                name = getAvailableName(parentId, name);
                const blob = new Blob([String(text ?? "")], { type: "text/markdown;charset=utf-8" });
                if (this.getUsage() + blob.size > limits().quota) {
                    return { ok: false, message: `Quota de ${utils().formatBytes(limits().quota)} atteint : document non créé.` };
                }
                try {
                    const file = await writeFile(parentId, name, blob, "text/markdown");
                    notify();
                    return { ok: true, message: `Document « ${name} » créé dans ${rootName}.`, file };
                } catch (error) {
                    return { ok: false, message: errorMessage(error) };
                }
            },

            // Dossier à la racine (ex. "Messagerie"), créé s'il n'existe pas.
            async ensureRootFolder(name) {
                await this.ensureReady();
                const existing = getChildren(null).find((row) => row.kind === "folder" && row.name.toLowerCase() === name.toLowerCase());
                if (existing) {
                    return existing;
                }
                const result = await this.createFolder(null, name);
                if (!result.ok) {
                    throw new Error(result.message);
                }
                return result.folder;
            },

            async uploadFiles(parentId, fileList, onProgress = () => {}) {
                await this.ensureReady();
                const files = Array.from(fileList || []);
                const uploaded = [];
                const errors = [];
                for (const [index, file] of files.entries()) {
                    onProgress(`Import de ${file.name} (${index + 1}/${files.length})…`);
                    if (file.size > limits().maxFile) {
                        errors.push(`${file.name} : trop volumineux (maximum ${utils().formatBytes(limits().maxFile)}).`);
                        continue;
                    }
                    if (this.getUsage() + file.size > limits().quota) {
                        errors.push(`${file.name} : quota de ${utils().formatBytes(limits().quota)} atteint.`);
                        continue;
                    }
                    try {
                        uploaded.push(await writeFile(parentId, getAvailableName(parentId, sanitizeName(file.name) || "fichier"), file, file.type));
                        notify();
                    } catch (error) {
                        errors.push(`${file.name} : ${errorMessage(error)}`);
                    }
                }
                const summary = uploaded.length > 0 ? `${uploaded.length} fichier(s) ajouté(s).` : "";
                return { ok: errors.length === 0, message: [summary, ...errors].filter(Boolean).join(" ") || "Aucun fichier importé.", uploaded };
            },

            async rename(id, desiredName) {
                await this.ensureReady();
                const row = getRow(id);
                const name = sanitizeName(desiredName);
                if (!row || row.trashed_at) {
                    return { ok: false, message: "Élément introuvable." };
                }
                if (!name) {
                    return { ok: false, message: "Le nom ne peut pas être vide." };
                }
                if (name === row.name) {
                    return { ok: true, message: "" };
                }
                if (getAvailableName(row.parent_id, name, row.id) !== name) {
                    return { ok: false, message: `Un élément nommé « ${name} » existe déjà dans ce dossier.` };
                }
                try {
                    await backend().updateRow(getOwner(), id, { name });
                } catch (error) {
                    return { ok: false, message: errorMessage(error) };
                }
                const previousName = row.name;
                row.name = name;
                notify();
                return { ok: true, message: `${previousName} renommé en ${name}.` };
            },

            // Enregistre le nouveau contenu d'un fichier texte (Bloc-notes, Paint). Le contenu est écrit sous une nouvelle
            // référence puis l'ancienne est supprimée : en cas d'échec, l'ancienne version reste intacte.
            async saveTextContent(id, text) {
                await this.ensureReady();
                const row = getRow(id);
                if (!row || row.trashed_at || row.kind !== "file") {
                    return { ok: false, message: "Fichier introuvable (supprimé ou déplacé dans la Corbeille ?)." };
                }
                const blob = new Blob([text], { type: row.mime_type || "text/plain;charset=utf-8" });
                if (blob.size > limits().maxFile) {
                    return { ok: false, message: `Fichier trop volumineux (maximum ${utils().formatBytes(limits().maxFile)}).` };
                }
                if (this.getUsage() - (Number(row.size) || 0) + blob.size > limits().quota) {
                    return { ok: false, message: `Quota de ${utils().formatBytes(limits().quota)} atteint : enregistrement impossible.` };
                }
                const owner = getOwner();
                const previous = refOf(row);
                let next;
                try {
                    next = await backend().storeContent(owner, blob, { name: row.name, mimeType: row.mime_type, shared });
                    await backend().updateRow(owner, id, { size: blob.size, storage_path: next });
                } catch (error) {
                    if (next) {
                        await backend().removeContents(owner, [next]).catch(() => {});
                    }
                    return { ok: false, message: errorMessage(error) };
                }
                await backend().removeContents(owner, [previous]).catch((error) => console.warn("[UserFiles] Ancienne version non supprimée", error));
                Object.assign(row, { size: blob.size, storage_path: next });
                notify();
                return { ok: true, message: `${row.name} enregistré.` };
            },

            async trash(id) {
                await this.ensureReady();
                const row = getRow(id);
                if (!row) {
                    return { ok: false, message: "Élément introuvable." };
                }
                const trashedAt = new Date().toISOString();
                try {
                    await backend().updateRow(getOwner(), id, { trashed_at: trashedAt });
                } catch (error) {
                    return { ok: false, message: errorMessage(error) };
                }
                row.trashed_at = trashedAt;
                notify();
                return { ok: true, message: `${row.name} déplacé dans la Corbeille.` };
            },

            async restore(id) {
                await this.ensureReady();
                const row = getRow(id);
                if (!row?.trashed_at) {
                    return { ok: false, message: "Élément introuvable dans la Corbeille." };
                }
                // Dossier parent supprimé entre-temps : l'élément revient à la racine.
                const parent = row.parent_id ? getRow(row.parent_id) : null;
                const parentId = parent && !parent.trashed_at ? parent.id : null;
                const name = getAvailableName(parentId, row.name, row.id);
                try {
                    await backend().updateRow(getOwner(), id, { trashed_at: null, parent_id: parentId, name });
                } catch (error) {
                    return { ok: false, message: errorMessage(error) };
                }
                Object.assign(row, { trashed_at: null, parent_id: parentId, name });
                notify();
                return { ok: true, message: `${name} restauré.` };
            },

            // Suppression définitive d'éléments (et de leurs sous-éléments, contenus compris).
            async destroy(topRows) {
                const doomed = [...topRows, ...topRows.flatMap((row) => getDescendants(row.id))];
                const owner = getOwner();
                await backend().removeContents(owner, doomed.filter((row) => row.kind === "file").map(refOf));
                await backend().deleteRows(owner, doomed.map((row) => row.id));
                const doomedIds = new Set(doomed.map((row) => row.id));
                rows = rows.filter((row) => !doomedIds.has(row.id));
                notify();
            },

            // Vide la Corbeille (suppression définitive de tout ce qui y est).
            async emptyTrash() {
                await this.ensureReady();
                const trashed = this.getTrashedFiles();
                if (trashed.length === 0) {
                    return { ok: true, message: "La Corbeille est déjà vide." };
                }
                try {
                    await this.destroy(trashed);
                } catch (error) {
                    return { ok: false, message: errorMessage(error) };
                }
                return { ok: true, message: `Corbeille vidée (${trashed.length} élément(s)).` };
            },

            // Suppression définitive d'un élément (espaces sans Corbeille, comme des Documents partagés).
            async remove(id) {
                await this.ensureReady();
                const row = getRow(id);
                if (!row) {
                    return { ok: false, message: "Élément introuvable." };
                }
                try {
                    await this.destroy([row]);
                } catch (error) {
                    return { ok: false, message: errorMessage(error) };
                }
                return { ok: true, message: `${row.name} supprimé définitivement.` };
            },

            // Contenu d'un fichier en texte.
            async readText(id) {
                await this.ensureReady();
                const row = getRow(id);
                return row ? backend().readText(getOwner(), refOf(row)) : null;
            },

            // Adresses de lecture (blob:, lien public ou URL signée) pour les lecteurs d'image et audio : Map id -> adresse.
            async getSignedUrls(ids) {
                const urls = new Map();
                for (const id of ids) {
                    const row = getRow(id);
                    if (row?.kind === "file") {
                        const url = await backend().getUrl(getOwner(), refOf(row), { image: utils().getFileKind(row.name) === "image" });
                        if (url) {
                            urls.set(id, url);
                        }
                    }
                }
                return urls;
            },

            // Arborescence d'un fichier ou dossier (sans ce qui est à la Corbeille), pour « Envoyer à » :
            // { kind: "file", name, size, mime_type, storage_path, owner } ou { kind: "folder", name, children }.
            snapshot(id) {
                const row = getRow(id);
                if (!row || row.trashed_at) {
                    return null;
                }
                const build = (entry) => (entry.kind === "folder"
                    ? { kind: "folder", name: entry.name, children: getChildren(entry.id).map(build) }
                    : { kind: "file", name: entry.name, size: Number(entry.size) || 0, mime_type: entry.mime_type || null, storage_path: refOf(entry), owner: getOwner() });
                return build(row);
            },

            // Copie des éléments (voir snapshot ; { kind: "text", name, text } = document à créer) dans un dossier de cet espace.
            async copyItems(parentId, items) {
                await this.ensureReady();
                const total = measureItems(items);
                const free = Math.max(0, limits().quota - this.getUsage());
                if (total > free) {
                    return { ok: false, message: `Place insuffisante dans ${rootName} : ${utils().formatBytes(total)} à copier, ${utils().formatBytes(free)} libres.` };
                }
                const copied = [];
                const errors = [];
                for (const item of items || []) {
                    try {
                        await copyItem(parentId, item);
                        copied.push(`« ${item.name} »`);
                    } catch (error) {
                        errors.push(`${item.name} : ${errorMessage(error)}`);
                    }
                }
                notify();
                const summary = copied.length > 0 ? `${copied.join(", ")} copié${copied.length > 1 ? "s" : ""} dans ${rootName}.` : "";
                return { ok: errors.length === 0, message: [summary, ...errors].filter(Boolean).join(" ") || "Rien à copier." };
            },

            // Ouvre un fichier dans l'application adaptée. `siblingIds` : fichiers du même dossier, pour enchaîner
            // les images (lecteur d'image) ou les pistes (lecteur multimédia).
            async openFile(id, siblingIds = []) {
                await this.ensureReady();
                const row = getRow(id);
                if (!row || row.trashed_at || row.kind !== "file") {
                    return { ok: false, message: "Fichier introuvable (supprimé ou déplacé dans la Corbeille ?)." };
                }
                const kind = utils().getFileKind(row.name);
                // Un compte ne peut pas contourner ses restrictions en ouvrant un fichier.
                const appForKind = { text: "notepad", paint: "paint", image: "image-viewer", audio: "audio-player" }[kind];
                if (appForKind && window.Win95Security && !window.Win95Security.canOpenApp(appForKind)) {
                    return { ok: false, message: `Vous n'avez pas accès à l'application qui ouvre ${row.name}.` };
                }
                try {
                    if (kind === "text" || kind === "paint") {
                        const content = (await this.readText(id)) ?? "";
                        if (kind === "paint") {
                            // Dessin : data URL PNG, enregistré par Fichier > Enregistrer (Ctrl+S) de Paint.
                            window.Win95Paint?.openFromFile?.({ fileName: row.name, content, onSave: (text) => this.saveTextContent(id, text) });
                            return { ok: true, message: `${row.name} ouvert dans Paint.` };
                        }
                        // Éditable : Fichier > Enregistrer (ou Ctrl+S) renvoie le texte.
                        window.Win95Notepad?.openFromFile?.({ fileName: row.name, relativePath: row.name, content, onSave: (text) => this.saveTextContent(id, text) });
                        return { ok: true, message: `${row.name} ouvert dans le bloc-notes.` };
                    }
                    if (kind === "image" || kind === "audio") {
                        const playlistIds = [id, ...siblingIds]
                            .filter((candidateId, index, list) => list.indexOf(candidateId) === index)
                            .filter((candidateId) => utils().getFileKind(getRow(candidateId)?.name) === kind);
                        const urls = await this.getSignedUrls(playlistIds);
                        const ordered = playlistIds
                            .map((candidateId) => ({ row: getRow(candidateId), url: urls.get(candidateId) }))
                            .filter((item) => item.url)
                            .sort((left, right) => left.row.name.localeCompare(right.row.name, "fr", { sensitivity: "base" }));
                        const startIndex = Math.max(0, ordered.findIndex((item) => item.row.id === id));
                        if (kind === "image") {
                            window.Win95ImageViewer?.openFromFile?.({
                                fileName: row.name,
                                relativePath: urls.get(id),
                                images: ordered.map((item) => ({ name: item.row.name, relativePath: item.url })),
                                startIndex
                            });
                            return { ok: true, message: `${row.name} ouvert dans le lecteur d'image.` };
                        }
                        window.Win95MediaPlayer?.openFolderTracks?.({
                            tracks: ordered.map((item) => ({ fileName: item.row.name, relativePath: item.row.name, url: item.url })),
                            startIndex
                        }, { forceNewWindow: true });
                        return { ok: true, message: `${row.name} ouvert dans le Lecteur multimédia.` };
                    }
                } catch (error) {
                    return { ok: false, message: errorMessage(error) };
                }
                return { ok: false, message: `${row.name} ne peut pas être ouvert.` };
            }
        };
        return store;
    }

    // Compte courant : un espace « Mes documents » par compte (son id).
    const userStore = createFileStore({
        getOwner: () => utils().getCurrentUserId().toLowerCase().replace(/[^a-z0-9_-]/g, "-"),
        changeEvent: "win95:user-files-changed"
    });
    ["win95:auth-changed", "win95:auth-logout"].forEach((name) => window.addEventListener(name, () => userStore.reset()));

    userStore.create = createFileStore;
    window.Win95UserFiles = userStore;
    window.Win95Services?.register?.("Win95UserFiles", userStore);
})();
