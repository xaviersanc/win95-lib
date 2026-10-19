(() => {
    // Fournisseur « local » : documents dans le navigateur (IndexedDB), sans serveur ni compte.
    //  - une base par compte ("<dbName>-<owner>") : magasins "files" (lignes) et "blobs" (contenus, clé = référence) ;
    //  - petits quotas par défaut (Win95Config.storage.local : 50 Mo au total, 10 Mo par fichier) ;
    //  - adresses blob: créées pour la lecture (images, audio) et révoquées quand le contenu disparaît.
    // Référence d'un contenu : "local:<uuid>". Une ancienne ligne sans storage_path lit le contenu stocké sous son id.

    const FILES_STORE = "files";
    const BLOBS_STORE = "blobs";
    const DB_VERSION = 1;
    const MB = 1024 * 1024;

    function createLocalBackend(config) {
        const settings = config.local || {};
        const databases = new Map();         // owner -> IDBDatabase
        const objectUrls = new Map();        // "owner|ref" -> blob:
        const newId = () => window.crypto?.randomUUID?.() || window.Win95Utils.createUniqueId("f");

        function openDatabase(owner) {
            if (databases.has(owner)) {
                return Promise.resolve(databases.get(owner));
            }
            return new Promise((resolve, reject) => {
                if (!window.indexedDB) {
                    reject(new Error("IndexedDB n'est pas disponible dans ce navigateur."));
                    return;
                }
                const request = indexedDB.open(`${window.Win95Config?.dbName || "win95-files"}-${owner}`, DB_VERSION);
                request.onupgradeneeded = () => {
                    const database = request.result;
                    if (!database.objectStoreNames.contains(FILES_STORE)) {
                        database.createObjectStore(FILES_STORE, { keyPath: "id" });
                    }
                    if (!database.objectStoreNames.contains(BLOBS_STORE)) {
                        database.createObjectStore(BLOBS_STORE);
                    }
                };
                request.onsuccess = () => {
                    databases.set(owner, request.result);
                    resolve(request.result);
                };
                request.onerror = () => reject(request.error || new Error("Ouverture de la base impossible."));
            });
        }

        // Opérations dans une seule transaction ; résout quand elle est validée.
        async function transaction(owner, storeNames, work) {
            const db = await openDatabase(owner);
            return new Promise((resolve, reject) => {
                const tx = db.transaction(storeNames, "readwrite");
                const stores = storeNames.map((name) => tx.objectStore(name));
                try {
                    work(...stores);
                } catch (error) {
                    tx.abort();
                    reject(error);
                    return;
                }
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error || new Error("Transaction annulée."));
            });
        }

        async function read(owner, storeName, key) {
            const db = await openDatabase(owner);
            return new Promise((resolve, reject) => {
                const store = db.transaction(storeName).objectStore(storeName);
                const request = key === undefined ? store.getAll() : store.get(key);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        function revoke(owner, ref) {
            const key = `${owner}|${ref}`;
            if (objectUrls.has(key)) {
                URL.revokeObjectURL(objectUrls.get(key));
                objectUrls.delete(key);
            }
        }

        return {
            name: "local",
            notice: "",
            limits: { quota: (Number(settings.quotaMb) || 50) * MB, maxFile: (Number(settings.maxFileMb) || 10) * MB },

            async init() {
                if (!window.indexedDB) {
                    throw new Error("IndexedDB n'est pas disponible dans ce navigateur.");
                }
            },

            // Referme les bases ouvertes et révoque les adresses blob: (changement de compte).
            reset() {
                databases.forEach((db) => db.close());
                databases.clear();
                objectUrls.forEach((url) => URL.revokeObjectURL(url));
                objectUrls.clear();
            },

            loadRows(owner) {
                return read(owner, FILES_STORE);
            },

            async insertRow(owner, row) {
                const record = { id: newId(), created_at: new Date().toISOString(), trashed_at: null, size: 0, mime_type: null, ...row };
                await transaction(owner, [FILES_STORE], (files) => files.put(record));
                return record;
            },

            async updateRow(owner, id, patch) {
                const current = (await read(owner, FILES_STORE)).find((row) => row.id === id);
                if (current) {
                    await transaction(owner, [FILES_STORE], (files) => files.put({ ...current, ...patch }));
                }
            },

            async deleteRows(owner, ids) {
                await transaction(owner, [FILES_STORE], (files) => ids.forEach((id) => files.delete(id)));
            },

            async storeContent(owner, blob) {
                const ref = `local:${newId()}`;
                await transaction(owner, [BLOBS_STORE], (blobs) => blobs.put(blob, ref));
                return ref;
            },

            async removeContents(owner, refs) {
                if (refs.length === 0) {
                    return;
                }
                await transaction(owner, [BLOBS_STORE], (blobs) => refs.forEach((ref) => blobs.delete(ref)));
                refs.forEach((ref) => revoke(owner, ref));
            },

            async readBlob(owner, ref) {
                return (await read(owner, BLOBS_STORE, ref)) || null;
            },

            async readText(owner, ref) {
                const blob = await this.readBlob(owner, ref);
                return blob ? blob.text() : "";
            },

            async getUrl(owner, ref) {
                const key = `${owner}|${ref}`;
                if (!objectUrls.has(key)) {
                    const blob = await this.readBlob(owner, ref);
                    if (!blob) {
                        return null;
                    }
                    objectUrls.set(key, URL.createObjectURL(blob));
                }
                return objectUrls.get(key);
            },

            // Copie un contenu d'un compte dans un autre (ou dans le même) ; renvoie la nouvelle référence.
            async copyContent(owner, ref, { fromOwner = owner } = {}) {
                const blob = await this.readBlob(fromOwner, ref);
                if (!blob) {
                    throw new Error("le fichier d'origine n'existe plus.");
                }
                return this.storeContent(owner, blob);
            }
        };
    }

    window.Win95Storage?.register("local", createLocalBackend);
    window.Win95LocalBackend = { create: createLocalBackend };
})();
