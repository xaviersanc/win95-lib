(() => {
    // Programmes installés (Win95Programs) : Panneau de configuration > Ajout/Suppression de programmes.
    // « Supprimer » un programme le **cache** pour le compte courant (il disparaît du menu Démarrer, du bureau et ne
    // peut plus être ouvert, même depuis un fichier) ; « Installer » le fait réapparaître. Rien n'est effacé : les
    // documents du compte restent intacts. Les programmes système (Mes documents, Corbeille, Panneau de configuration…)
    // ne sont pas supprimables.
    // Par compte : localStorage "win95.programs.hidden.v1.<id>" = tableau de clés d'applications masquées.
    // Émet "win95:programs-changed".

    const STORAGE_PREFIX = "win95.programs.hidden.v1";
    const CHANGE_EVENT = "win95:programs-changed";

    // Programmes que l'on peut supprimer / réinstaller (clés = windowDefinitions du gestionnaire de fenêtres).
    const PROGRAMS = [
        { key: "notepad", label: "Bloc-notes", icon: window.Win95Asset("assets/icons/notepad_file-1.png"), size: "0,05 Mo", description: "Éditeur de texte et WordPad (fichiers .txt et .md)." },
        { key: "paint", label: "Paint", icon: window.Win95Asset("assets/icons/paint_old-1.png"), size: "0,40 Mo", description: "Programme de dessin (fichiers .paint)." },
        { key: "image-viewer", label: "Lecteur d'image", icon: window.Win95Asset("assets/icons/imagjpeg-1.png"), size: "0,10 Mo", description: "Visionneuse d'images (.png, .jpg, .gif…)." },
        { key: "calculator", label: "Calculatrice", icon: window.Win95Asset("assets/icons/calculator-0.png"), size: "0,10 Mo", description: "Calculatrice standard et scientifique." },
        { key: "clock", label: "Horloge", icon: window.Win95Asset("assets/icons/clock-1.png"), size: "0,05 Mo", description: "Horloge analogique ou numérique." },
        { key: "charmap", label: "Table des caractères", icon: window.Win95Asset("assets/icons/charmap-0.png"), size: "0,07 Mo", description: "Copie des caractères spéciaux et symboles." },
        { key: "local-link", label: "Connexion locale", icon: window.Win95Asset("assets/icons/mobile_phone-0.png"), size: "0,05 Mo", description: "Relie cet ordinateur à votre téléphone par un QR code temporaire." },
        { key: "minesweeper", label: "Démineur", icon: window.Win95Asset("assets/icons/game_mine_1-0.png"), size: "0,20 Mo", description: "Jeu de réflexion : trouvez les mines." },
        { key: "solitaire", label: "Solitaire", icon: window.Win95Asset("assets/icons/game_solitaire-0.png"), size: "0,50 Mo", description: "Le jeu de cartes Klondike." },
        { key: "freecell", label: "FreeCell", icon: window.Win95Asset("assets/icons/game_freecell-0.png"), size: "0,45 Mo", description: "Jeu de cartes à donnes numérotées." },
        { key: "hearts", label: "Cœurs", icon: window.Win95Asset("assets/icons/game_hearts.png"), size: "0,60 Mo", description: "Jeu de cartes à quatre joueurs." },
        { key: "audio-player", label: "Lecteur multimédia", icon: window.Win95Asset("assets/icons/media_player-0.png"), size: "0,90 Mo", description: "Lecteur de fichiers audio (.mp3, .wav…)." }
    ];

    const utils = () => window.Win95Utils;
    const getStorageKey = () => `${STORAGE_PREFIX}.${utils().getCurrentUserId()}`;

    function readHidden() {
        const list = utils().readStoredJson(getStorageKey(), []);
        return Array.isArray(list) ? list.filter((key) => PROGRAMS.some((program) => program.key === key)) : [];
    }

    function writeHidden(keys) {
        utils().writeStoredJson(getStorageKey(), [...new Set(keys)]);
        window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    }

    const programs = {
        CHANGE_EVENT,
        PROGRAMS,

        // Ajoute un programme supprimable (appelé par WindowManager.registerApp({ removable })).
        register(program) {
            if (!PROGRAMS.some((candidate) => candidate.key === program.key)) {
                PROGRAMS.push({ size: "—", description: "", ...program });
            }
        },

        isRemovable(key) {
            return PROGRAMS.some((program) => program.key === key);
        },

        isHidden(key) {
            return readHidden().includes(key);
        },

        // Programmes présents sur ce « disque » (hors modules exclus au chargement).
        available() {
            const disabled = window.Win95Loader?.disabledApps || [];
            return PROGRAMS.filter((program) => !disabled.includes(program.key));
        },

        installed() {
            const hidden = readHidden();
            return this.available().filter((program) => !hidden.includes(program.key));
        },

        removed() {
            const hidden = readHidden();
            return this.available().filter((program) => hidden.includes(program.key));
        },

        remove(key) {
            const program = PROGRAMS.find((candidate) => candidate.key === key);
            if (!program) {
                return { ok: false, message: "Ce programme ne peut pas être supprimé." };
            }
            writeHidden([...readHidden(), key]);
            return { ok: true, message: `${program.label} a été supprimé.` };
        },

        install(key) {
            const program = PROGRAMS.find((candidate) => candidate.key === key);
            if (!program) {
                return { ok: false, message: "Programme inconnu." };
            }
            writeHidden(readHidden().filter((hiddenKey) => hiddenKey !== key));
            return { ok: true, message: `${program.label} a été installé.` };
        }
    };

    window.Win95Programs = programs;
    window.Win95Services?.register?.("Win95Programs", programs);
})();
