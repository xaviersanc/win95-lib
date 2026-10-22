(() => {
    // Chargeur de la bibliothèque : une seule balise <script> suffit à une page qui l'utilise.
    //
    //   <script>window.Win95Config = { appName: "Mon projet", plugins: ["scripts/mon-plugin.js"] };</script>
    //   <script src="vendor/win95-lib/scripts/loader.js"></script>
    //
    // Il charge, dans l'ordre contractuel (voir MODULES), les feuilles de style puis les scripts de la bibliothèque, enfin les
    // plugins du projet (Win95Config.plugins) ; il ajoute supabase-js seulement si la configuration l'exige. Quand tout est
    // prêt : événement "win95:lib-loaded" et promesse `window.Win95Ready`.
    //
    // - `exclude` (Win95Config.exclude) retire des modules par leur identifiant ("games", "accessories"…) ou des fichiers par leur nom
    //   ("accounts-store.js", "security-manager.js") : un projet qui fournit lui-même ses comptes exclut ces deux fichiers ;
    // - un plugin peut être inséré AVANT un module de la bibliothèque : { src: "x.js", before: "explorer" } (identifiants de MODULES) ;
    //   nécessaire pour les scripts dont la bibliothèque lit une valeur globale à son chargement (ex. un `Win95UserFiles` du projet,
    //   lu par l'explorateur et le gestionnaire de fenêtres) ; sans `before`, le plugin est chargé après toute la bibliothèque ;
    // - les plugins se branchent par l'API d'extension du gestionnaire de fenêtres (registerApp, registerStartMenuItem…) :
    //   ils peuvent être chargés après le démarrage du bureau.
    // - MODE TÉLÉPHONE : une adresse contenant `?win95link=…` (QR code de l'application « Connexion locale ») ne charge que le noyau
    //   (« core ») et le module « local-link » : pas de démarrage, de comptes ni de bureau, seulement la page de liaison du téléphone.
    //   Les plugins y sont ignorés, sauf ceux déclarés `phone: true` (leur contenu s'accroche à Win95LocalLink.registerPhonePage) ;
    // Cette liste est LA référence de l'ordre de chargement : toute nouvelle application s'y ajoute (une seule fois).

    const LIB_VERSION = "1.4.0";
    const SUPABASE_JS = {
        src: "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js",
        integrity: "sha384-Rj26LVGvoeRVR6+mwQmFfcR3QOBEwT+ZmuCWpuiqeTzJpCs0ER4ITAWGb4Hiy3Ok"
    };
    const BOOTSTRAP_CSS = {
        href: "https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/css/bootstrap.min.css",
        integrity: "sha384-xOolHFLEh07PJGoPkLv1IbcEPTNtaed2xpHsD9ESMhqIYd0nLMwNLD69Npy4HI+N"
    };

    // Les chemins sont relatifs au dossier de la bibliothèque. L'ordre des modules ET des fichiers est contractuel.
    const MODULES = [
        { id: "boot", apps: [], js: ["scripts/ambiance/boot-screen.js"] },
        {
            id: "core",
            css: ["assets/win95.css", "scripts/window-component/window-component.css", "scripts/window-manager/window-manager.css"],
            js: [
                "scripts/services/context-guard.js", "scripts/services/tray-clock.js", "scripts/services/zoom-guard.js",
                "scripts/services/win95-config.js", "scripts/services/win95-services-registry.js", "scripts/services/win95-utils.js",
                "scripts/services/win95-drag-drop.js"
            ]
        },
        {
            id: "storage",
            js: [
                "scripts/storage/supabase-client.js", "scripts/storage/storage.js", "scripts/storage/local-backend.js",
                "scripts/storage/drive-content.js", "scripts/storage/supabase-backend.js"
            ]
        },
        {
            id: "services",
            js: [
                "scripts/services/accounts-store.js", "scripts/services/clock-store.js", "scripts/services/sound-store.js",
                "scripts/services/mouse-store.js", "scripts/services/win95-settings.js", "scripts/services/programs-store.js", "scripts/services/recycle-bin-store.js",
                "scripts/services/wallpaper-store.js", "scripts/services/document-shortcuts-store.js", "scripts/services/win95-context-menu.js",
                "scripts/services/win95-menu-bar.js", "scripts/services/win95-dialog.js", "scripts/services/win95-rich-text.js",
                "scripts/services/user-files-store.js"
            ]
        },
        { id: "media-player", apps: ["audio-player"], css: ["scripts/media-player/media-player-component.css"], js: ["scripts/media-player/media-player-component.js"] },
        { id: "image-viewer", apps: ["image-viewer"], css: ["scripts/image-viewer/image-viewer-component.css"], js: ["scripts/image-viewer/image-viewer-component.js"] },
        { id: "notepad", apps: ["notepad"], css: ["scripts/notepad/notepad-component.css"], js: ["scripts/notepad/notepad-component.js"] },
        { id: "paint", apps: ["paint"], css: ["scripts/paint/paint-component.css"], js: ["scripts/paint/paint-component.js"] },
        { id: "explorer", css: ["scripts/file-explorer/file-explorer-component.css"], js: ["scripts/file-explorer/file-explorer-component.js"] },
        { id: "graph", css: ["scripts/graph/graph-view.css"], js: ["scripts/graph/graph-view.js", "scripts/graph/graph-options.js"] },
        {
            id: "control-panel",
            css: ["scripts/display-properties/display-properties-component.css", "scripts/control-panel/control-panel.css"],
            js: [
                "scripts/control-panel/property-sheet.js", "scripts/control-panel/property-fields.js"
            ]
        },
        {
            id: "accessories",
            apps: ["calculator", "clock", "charmap"],
            css: ["scripts/accessories/accessories.css"],
            js: ["scripts/accessories/calculator-component.js", "scripts/accessories/clock-component.js", "scripts/accessories/charmap-component.js"]
        },
        {
            id: "games",
            apps: ["minesweeper", "solitaire", "freecell", "hearts"],
            css: ["scripts/games/games.css"],
            js: [
                "scripts/games/cards.js", "scripts/games/minesweeper-component.js", "scripts/games/solitaire-component.js",
                "scripts/games/freecell-component.js", "scripts/games/hearts-component.js"
            ]
        },
        {
            id: "ambiance",
            css: ["scripts/ambiance/ambiance.css"],
            js: ["scripts/ambiance/screensaver-effects.js", "scripts/ambiance/screensaver.js", "scripts/ambiance/blue-screen.js", "scripts/ambiance/close-program.js"]
        },
        {
            id: "control-panel-applets",
            apps: ["control-panel", "display-properties", "date-time", "mouse", "sounds", "system-properties", "add-remove-programs"],
            js: [
                "scripts/display-properties/display-properties-component.js", "scripts/control-panel/date-time-component.js",
                "scripts/control-panel/mouse-properties-component.js", "scripts/control-panel/sound-properties-component.js",
                "scripts/control-panel/system-properties-component.js", "scripts/control-panel/add-remove-programs-component.js",
                "scripts/control-panel/control-panel-component.js"
            ]
        },
        {
            id: "local-link",
            apps: ["local-link"],
            css: ["scripts/local-link/local-link.css"],
            js: ["scripts/local-link/qr-code.js", "scripts/local-link/local-link-service.js", "scripts/local-link/local-link-component.js", "scripts/local-link/local-link-phone.js"]
        },
        { id: "user-manager", apps: ["user-manager"], css: ["scripts/user-manager/user-manager-component.css"], js: ["scripts/user-manager/user-manager-component.js"] },
        { id: "security", css: ["scripts/security/security.css"], js: ["scripts/security/security-manager.js"] },
        { id: "window-manager", js: ["scripts/window-manager/window-manager.js", "scripts/window-component/window-component.js"] }
    ];

    const script = document.currentScript;
    const userConfig = window.Win95Config || {};
    // Dossier de la bibliothèque, **relatif à la racine du site** (pas d'hôte) : les chemins mémorisés (icônes de raccourcis)
    // restent valables d'un domaine à l'autre (aperçus Vercel, local…).
    const scriptPath = script?.src ? new URL(script.src, window.location.href).pathname : "";
    const libPath = (userConfig.libPath || scriptPath.replace(/scripts\/loader\.js$/, "")).replace(/\/*$/, "/");
    const exclude = new Set(userConfig.exclude || []);
    // Mode téléphone (voir l'en-tête) : seuls ces modules sont chargés.
    const PHONE_MODULES = ["core", "local-link"];
    const phoneMode = !exclude.has("local-link") && new URLSearchParams(window.location.search).has("win95link");
    const version = `${LIB_VERSION}${userConfig.cacheBust ? `-${userConfig.cacheBust}` : ""}`;

    // La bibliothèque supabase-js n'est utile que si Supabase sert au stockage ou aux comptes.
    // (ignorée si la page a déjà fourni un global `supabase`, par exemple une version épinglée par le projet ou un faux client de test).
    const needsSupabase = !phoneMode && Boolean(userConfig.supabase?.url) && !window.supabase?.createClient
        && (["supabase", "supabase+drive"].includes(userConfig.storage?.provider) || userConfig.accounts?.provider === "supabase");

    // Chemin d'une ressource de la bibliothèque (icônes, fonds) : tout le code de la bibliothèque passe par là, ce qui lui permet
    // d'être installée dans n'importe quel dossier (ex. vendor/win95-lib/). Les chemins du projet ne sont pas concernés.
    window.Win95Asset = (path) => (/^assets\//.test(path) ? `${libPath}${path}` : path);

    const versioned = (path) => `${path}${path.includes("?") ? "&" : "?"}v=${version}`;
    const resolveLib = (path) => `${libPath}${path}`;
    // Plugin : chemin relatif à la page (ou absolu), pas à la bibliothèque.
    const asPlugin = (entry) => (typeof entry === "string" ? { src: entry } : entry);

    // Attributs d'une balise <script> de plugin : { integrity, crossorigin } (ex. bibliothèque tierce épinglée par empreinte).
    const pluginAttributes = (plugin) => ({ ...(plugin.integrity ? { integrity: plugin.integrity } : {}), ...(plugin.crossorigin ? { crossorigin: plugin.crossorigin } : {}) });

    function addStyle(href, attributes = {}) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        Object.entries(attributes).forEach(([name, value]) => link.setAttribute(name, value));
        document.head.appendChild(link);
    }

    // async=false : le navigateur télécharge en parallèle mais exécute dans l'ordre d'insertion.
    function addScript(src, attributes = {}) {
        return new Promise((resolve) => {
            const element = document.createElement("script");
            element.src = src;
            element.async = false;
            Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
            element.onload = resolve;
            element.onerror = () => {
                console.error(`[Win95] Chargement impossible : ${src}`);
                resolve();
            };
            document.body.appendChild(element);
        });
    }

    // Un identifiant de module, un chemin ou un nom de fichier (« accounts-store.js ») dans `exclude` retire l'élément.
    const isExcluded = (path) => exclude.has(path) || exclude.has(path.split("/").pop());
    const modules = MODULES.filter((module) => !exclude.has(module.id) && (!phoneMode || PHONE_MODULES.includes(module.id))).map((module) => ({
        ...module,
        css: (module.css || []).filter((path) => !isExcluded(path)),
        js: (module.js || []).filter((path) => !isExcluded(path))
    }));

    if (userConfig.bootstrap !== false) {
        addStyle(BOOTSTRAP_CSS.href, { integrity: BOOTSTRAP_CSS.integrity, crossorigin: "anonymous" });
    }
    modules.forEach((module) => (module.css || []).forEach((path) => addStyle(versioned(resolveLib(path)))));

    // En mode téléphone, seuls les plugins `phone: true` sont chargés (après la bibliothèque, sans `before`).
    const projectPlugins = (userConfig.plugins || []).map(asPlugin).filter((plugin) => !phoneMode || plugin.phone === true);
    const allPlugins = phoneMode ? [] : projectPlugins;
    const pending = [];
    // supabase-js avant les modules de stockage.
    if (needsSupabase) {
        pending.push(addScript(SUPABASE_JS.src, { integrity: SUPABASE_JS.integrity, crossorigin: "anonymous" }));
    }
    MODULES.forEach((module) => {
        // Plugins demandés avant ce module (même si le module est exclu : la position reste celle de la bibliothèque).
        allPlugins.filter((plugin) => plugin.before === module.id).forEach((plugin) => {
            if (plugin.css) {
                addStyle(plugin.css);
            }
            if (plugin.src) {
                pending.push(addScript(plugin.src, pluginAttributes(plugin)));
            }
        });
        const active = modules.find((candidate) => candidate.id === module.id);
        (active?.js || []).forEach((path) => pending.push(addScript(versioned(resolveLib(path)))));
    });

    window.Win95Ready = Promise.all(pending)
        .then(() => {
            const plugins = projectPlugins.filter((plugin) => phoneMode || !plugin.before);
            plugins.forEach((plugin) => plugin.css && addStyle(plugin.css));
            return Promise.all(plugins.filter((plugin) => plugin.src).map((plugin) => addScript(plugin.src, pluginAttributes(plugin))));
        })
        .then(() => {
            window.Win95Version = LIB_VERSION;
            window.dispatchEvent(new CustomEvent("win95:lib-loaded", { detail: { version: LIB_VERSION, libPath } }));
        });

    // Applications des modules exclus : masquées et refusées (menu Démarrer, droits, Ajout/Suppression de programmes).
    const disabledApps = MODULES.filter((module) => exclude.has(module.id)).flatMap((module) => module.apps || []);
    window.Win95Loader = { MODULES, version: LIB_VERSION, libPath, disabledApps, phoneMode };
})();
