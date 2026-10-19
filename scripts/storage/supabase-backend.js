(() => {
    // Fournisseur « supabase » : arborescence dans la table `user_files`, contenu dans le bucket Storage `user-files`,
    // ou dans Google Drive (content: "drive", fournisseur "supabase+drive") quand les fonctions Vercel sont configurées.
    // Scripts SQL : supabase/02-user-files.sql (+ supabase/03-drive-storage.sql pour accepter les références "drive:<id>").
    // Réglages : Win95Config.storage.supabase { table, bucket, quotaMb, maxFileMb } et .drive { apiBase, quotaMb, maxFileMb }.
    // Le quota est aussi vérifié par un trigger SQL (mêmes valeurs) : le message du serveur est traduit ici.

    const MB = 1024 * 1024;
    const SIGNED_URL_SECONDS = 60 * 60;

    function createSupabaseBackend(config, { content = "supabase" } = {}) {
        const settings = config.supabase || {};
        const table = settings.table || "user_files";
        const bucket = settings.bucket || "user-files";
        const client = () => window.Win95Supabase.getClient();
        const drive = content === "drive" ? window.Win95DriveContent.create(config) : null;
        let driveEnabled = false;
        const newId = () => window.crypto?.randomUUID?.() || window.Win95Utils.createUniqueId("f");
        const quota = () => (driveEnabled ? Number(config.drive?.quotaMb) || 1024 : Number(settings.quotaMb) || 100) * MB;
        const maxFile = () => (driveEnabled ? Number(config.drive?.maxFileMb) || 100 : Number(settings.maxFileMb) || 25) * MB;

        // Traduit les erreurs Supabase en messages compréhensibles.
        function describeError(error) {
            const text = `${error?.message || ""} ${error?.details || ""} ${error?.code || ""}`;
            if (/QUOTA_EXCEEDED/.test(text)) {
                return `Quota de ${window.Win95Utils.formatBytes(quota())} atteint : videz la Corbeille ou supprimez des fichiers.`;
            }
            if (/42P01|PGRST205|relation .* does not exist|Could not find the table|Bucket not found/i.test(text)) {
                return "Stockage Supabase non installé : exécuter supabase/02-user-files.sql dans le SQL Editor.";
            }
            if (/23505|duplicate key/i.test(text)) {
                return "Un élément porte déjà ce nom dans ce dossier.";
            }
            if (/exceeded the maximum allowed size|Payload too large|413/i.test(text)) {
                return `Fichier trop volumineux (maximum ${window.Win95Utils.formatBytes(maxFile())}).`;
            }
            return error?.message || "Erreur Supabase inconnue.";
        }

        function check(error) {
            if (error) {
                throw new Error(describeError(error));
            }
        }

        const isDriveRef = (ref) => Boolean(drive?.isDriveRef(ref));

        return {
            name: "supabase",
            notice: "",
            get limits() {
                return { quota: quota(), maxFile: maxFile() };
            },
            get contentProvider() {
                return driveEnabled ? "drive" : "supabase";
            },

            async init() {
                driveEnabled = drive ? await drive.isAvailable() : false;
            },

            async loadRows(owner) {
                const { data, error } = await client().from(table).select("*").eq("owner", owner).order("name", { ascending: true });
                check(error);
                return Array.isArray(data) ? data : [];
            },

            async insertRow(owner, row) {
                const { data, error } = await client().from(table).insert({ owner, ...row }).select().single();
                check(error);
                return data;
            },

            async updateRow(owner, id, patch) {
                const { error } = await client().from(table).update(patch).eq("id", id);
                check(error);
            },

            async deleteRows(owner, ids) {
                const { error } = await client().from(table).delete().in("id", ids);
                check(error);
            },

            // Envoie un contenu (Drive ou bucket) et renvoie sa référence (storage_path).
            async storeContent(owner, blob, { name, mimeType, shared = false } = {}) {
                if (driveEnabled) {
                    return drive.upload(blob, { name, mimeType: mimeType || blob.type, shared });
                }
                const path = `${owner}/${newId()}`;
                const { error } = await client().storage.from(bucket).upload(path, blob, { contentType: blob.type || mimeType || "application/octet-stream", upsert: false });
                check(error);
                return path;
            },

            async removeContents(owner, refs) {
                const driveRefs = refs.filter(isDriveRef);
                const bucketRefs = refs.filter((ref) => ref && !isDriveRef(ref));
                if (driveRefs.length > 0) {
                    await drive.remove(driveRefs);
                }
                for (let index = 0; index < bucketRefs.length; index += 100) {
                    const { error } = await client().storage.from(bucket).remove(bucketRefs.slice(index, index + 100));
                    check(error);
                }
            },

            async readBlob(owner, ref) {
                if (isDriveRef(ref)) {
                    throw new Error("la lecture directe d'un fichier Google Drive n'est pas possible : utilisez getUrl.");
                }
                const { data, error } = await client().storage.from(bucket).download(ref);
                check(error);
                return data;
            },

            async readText(owner, ref) {
                return isDriveRef(ref) ? drive.readText(ref) : (await this.readBlob(owner, ref)).text();
            },

            // Lien public Google Drive, ou URL signée (1 h) pour un fichier du bucket.
            async getUrl(owner, ref, { image = false } = {}) {
                if (isDriveRef(ref)) {
                    return drive.getPublicUrl(ref, { image });
                }
                const { data, error } = await client().storage.from(bucket).createSignedUrl(ref, SIGNED_URL_SECONDS);
                check(error);
                return data?.signedUrl || null;
            },

            // Copie un contenu (même compte ou autre compte : « Envoyer à ») ; renvoie la nouvelle référence.
            async copyContent(owner, ref, { name, shared = false, fromOwner = owner } = {}) {
                if (isDriveRef(ref)) {
                    if (!driveEnabled) {
                        throw new Error("copie impossible : Google Drive n'est accessible que depuis le site en ligne.");
                    }
                    return drive.copy(ref, { name, shared });
                }
                const blob = await this.readBlob(fromOwner, ref).catch((error) => {
                    throw new Error(/not found|404/i.test(error.message) ? "le fichier d'origine n'existe plus." : error.message);
                });
                return this.storeContent(owner, blob, { name, shared });
            }
        };
    }

    window.Win95Storage?.register("supabase", createSupabaseBackend);
    window.Win95SupabaseBackend = { create: createSupabaseBackend };
})();
