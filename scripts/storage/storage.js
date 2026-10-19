(() => {
    // Fournisseurs de stockage (Win95Storage) : où vivent les documents (arborescence + contenu des fichiers).
    // Choisis par Win95Config.storage.provider : "local" | "supabase" | "supabase+drive" (voir win95-config.js).
    //
    // Un fournisseur (« backend ») expose :
    //   name                         "local" | "supabase" | …
    //   limits                       { quota, maxFile } en octets
    //   notice                       message à afficher si le fournisseur demandé n'est pas disponible (repli)
    //   async init()                 vérifie la disponibilité (réseau, configuration) ; appelé avant le premier chargement
    //   async loadRows(owner)        toutes les lignes { id, parent_id, name, kind, size, mime_type, storage_path, trashed_at } du compte
    //   async insertRow(owner, row)  ajoute une ligne (sans id) et la renvoie complétée (id, created_at)
    //   async updateRow(id, patch)   modifie une ligne
    //   async deleteRows(ids)        supprime des lignes (les sous-éléments d'un dossier suivent en base : on delete cascade)
    //   async storeContent(owner, blob, { name, mimeType, shared })   enregistre un contenu ; renvoie sa référence (storage_path)
    //   async removeContents(refs)   supprime des contenus
    //   async readBlob(ref)          contenu sous forme de Blob
    //   async readText(ref)          contenu texte
    //   async getUrl(ref, { image }) adresse de lecture (blob:, lien public ou URL signée) pour les lecteurs d'image et audio
    //   async copyContent(ref, { owner, name, shared })               copie un contenu ; renvoie la nouvelle référence
    // Ajouter un fournisseur : Win95Storage.register("nom", (config) => backend) puis storage.provider = "nom".

    const factories = new Map();
    let instance = null;

    const storage = {
        register(name, factory) {
            factories.set(name, factory);
        },

        has(name) {
            return factories.has(name);
        },

        // Fournisseur courant (créé une fois). Un fournisseur distant mal configuré se replie sur le stockage local,
        // avec un message (`notice`) que l'explorateur affiche.
        getBackend() {
            if (instance) {
                return instance;
            }
            const config = window.Win95Config.storage;
            const provider = String(config.provider || "local");
            const wantsSupabase = provider === "supabase" || provider === "supabase+drive";
            if (wantsSupabase && !window.Win95Supabase?.getClient()) {
                console.warn("[Win95Storage] Supabase demandé mais non configuré (Win95Config.supabase) : stockage local utilisé.");
                instance = factories.get("local")(config);
                instance.notice = "Supabase n'est pas configuré : les documents restent dans ce navigateur.";
            } else if (factories.has(provider)) {
                instance = factories.get(provider)(config);
            } else if (wantsSupabase) {
                instance = factories.get("supabase")(config, { content: provider === "supabase+drive" ? "drive" : "supabase" });
            } else {
                console.warn(`[Win95Storage] Fournisseur inconnu « ${provider} » : stockage local utilisé.`);
                instance = factories.get("local")(config);
            }
            return instance;
        },

        // Pour les tests et les changements de configuration à chaud.
        reset() {
            instance = null;
        }
    };

    window.Win95Storage = storage;
    window.Win95Services?.register?.("Win95Storage", storage);
})();
