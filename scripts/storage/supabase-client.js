(() => {
    // Client Supabase partagé (Win95Supabase) : créé une seule fois à partir de Win95Config.supabase { url, anonKey }.
    // La bibliothèque supabase-js (UMD, global `supabase`) est chargée par loader.js seulement si la configuration en a besoin ;
    // sans elle, ou sans url / anonKey, getClient() renvoie null et les fournisseurs se replient sur le stockage local.
    // Le client est aussi enregistré sous le nom « SupabaseClient » dans Win95Services (compatibilité avec les projets existants).
    // « anon » est une clé **publique** : la sécurité repose sur les policies SQL (voir supabase/ et LLM-GUIDE.md).

    let client = null;

    function settings() {
        return window.Win95Config?.supabase || {};
    }

    const isConfigured = () => {
        const { url, anonKey } = settings();
        return Boolean(url && anonKey && !String(url).startsWith("REMPLACE_") && !String(anonKey).startsWith("REMPLACE_"));
    };

    function getClient() {
        if (!client && isConfigured() && window.supabase?.createClient) {
            try {
                client = window.supabase.createClient(settings().url, settings().anonKey);
                window.Win95Services?.register?.("SupabaseClient", client);
            } catch (error) {
                console.warn("[Win95Supabase] Initialisation impossible", error);
            }
        }
        return client;
    }

    window.Win95Supabase = { isConfigured, getClient };
    getClient();

    // Diffusé après le parsing du document, pour les modules qui attendent le client (compatibilité).
    const announce = () => window.dispatchEvent(new CustomEvent("win95:cloud-sync-ready", { detail: { ready: Boolean(getClient()) } }));
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", announce, { once: true });
    } else {
        announce();
    }
})();
