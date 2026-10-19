(() => {
    // Configuration de la bibliothèque (window.Win95Config). À définir AVANT le chargement de la bibliothèque :
    //
    //   <script>
    //     window.Win95Config = {
    //         appName: "Mon projet",
    //         storage: { provider: "supabase+drive" },                       // "local" (défaut) | "supabase" | "supabase+drive"
    //         supabase: { url: "https://xxxx.supabase.co", anonKey: "…" }   // clé publique « anon »
    //     };
    //   </script>
    //   <script src="vendor/win95-lib/scripts/loader.js"></script>
    //
    // Tout est facultatif : sans configuration, la bibliothèque fonctionne seule, entièrement dans le navigateur
    // (documents dans IndexedDB, comptes dans localStorage) avec de petits quotas.
    //
    // Fournisseurs de stockage (storage.provider) :
    //   "local"           documents dans IndexedDB (une base par compte), quota réduit : rien à installer ;
    //   "supabase"        arborescence dans la table Supabase `user_files`, contenu dans le bucket Storage `user-files`
    //                     (scripts SQL : supabase/) ;
    //   "supabase+drive"  idem, mais le contenu va dans Google Drive via les fonctions Vercel de vercel/api/
    //                     (repli automatique sur le bucket Supabase si Drive n'est pas configuré).
    // Fournisseurs de comptes (accounts.provider) : "local" (localStorage, défaut) | "supabase" (table `win95_accounts`).
    //
    // Les quotas sont en Mo. Les valeurs de la base (triggers SQL) et celles d'ici doivent rester identiques.

    const defaults = {
        appName: "Windows 95",
        // Écran de démarrage (voir scripts/ambiance/boot-screen.js).
        bootScreen: true,
        // Affiche le compte connecté à côté de l'horloge ; false si le projet fournit sa propre zone (sélecteur de personnage…).
        userTray: true,
        // Préfixe des bases IndexedDB du stockage local.
        dbName: "win95-files",
        // Dossier de la bibliothèque, relatif à la page (ou absolu) ; détecté par loader.js, à ne renseigner que sans lui.
        libPath: "",
        // Modules de la bibliothèque à ne pas charger (voir loader.js : "accounts", "security", "files", "games"…).
        exclude: [],
        // Scripts et feuilles de style du projet, chargés après la bibliothèque : [{ src: "scripts/x.js", css: "x.css" }] ou chaînes.
        plugins: [],
        supabase: { url: "", anonKey: "" },
        // Connexion locale (téléphone) : baseUrl = adresse de la page joignable depuis le téléphone (si l'adresse du navigateur est
        // localhost ou un fichier) ; ttlMinutes = durée de validité d'un QR code.
        localLink: { baseUrl: "", ttlMinutes: 5 },
        storage: {
            provider: "local",
            local: { quotaMb: 50, maxFileMb: 10 },
            supabase: { table: "user_files", bucket: "user-files", quotaMb: 100, maxFileMb: 25 },
            drive: { apiBase: "/api", quotaMb: 1024, maxFileMb: 100 }
        },
        accounts: {
            provider: "local",
            supabase: { table: "win95_accounts" }
        }
    };

    function isPlainObject(value) {
        return value && typeof value === "object" && !Array.isArray(value);
    }

    function merge(base, extra) {
        const result = { ...base };
        Object.entries(extra || {}).forEach(([key, value]) => {
            result[key] = isPlainObject(value) && isPlainObject(base[key]) ? merge(base[key], value) : value;
        });
        return result;
    }

    window.Win95Config = merge(defaults, window.Win95Config);
    // Sans le chargeur (scripts inclus à la main depuis la racine du site), les chemins restent tels quels.
    window.Win95Asset = window.Win95Asset || ((path) => path);
    window.Win95Services?.register?.("Win95Config", window.Win95Config);
})();
