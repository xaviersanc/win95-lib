(() => {
    // Sons du système (Win95Sounds) : événements Windows associés à des sons, réglés dans Panneau de configuration > Sons.
    // Aucun fichier audio : chaque son est synthétisé avec Web Audio (oscillateurs et bruit), donc rien à charger.
    //  - EVENTS : les événements ("Démarrer Windows", "Bip par défaut"…) ; SOUNDS : les sons disponibles ;
    //  - réglages par compte : localStorage "win95.sounds.v1.<id>" = { scheme, map, volume } ;
    //  - play(événement) est appelé par le reste de la lib (gestionnaire de fenêtres, dialogues, session, Corbeille).
    // Un navigateur n'autorise l'audio qu'après un geste de l'utilisateur : avant, play() ne fait rien (sans erreur).
    // Émet "win95:sounds-changed".

    const STORAGE_PREFIX = "win95.sounds.v1";
    const CHANGE_EVENT = "win95:sounds-changed";

    const EVENTS = [
        { key: "windows-start", label: "Démarrer Windows" },
        { key: "windows-exit", label: "Quitter Windows" },
        { key: "default-beep", label: "Bip par défaut" },
        { key: "asterisk", label: "Astérisque" },
        { key: "exclamation", label: "Exclamation" },
        { key: "question", label: "Question" },
        { key: "critical-stop", label: "Arrêt critique" },
        { key: "open-program", label: "Ouvrir un programme" },
        { key: "close-program", label: "Fermer un programme" },
        { key: "maximize", label: "Agrandir" },
        { key: "minimize", label: "Réduire" },
        { key: "empty-recycle", label: "Vider la Corbeille" },
        { key: "menu-command", label: "Commande de menu" }
    ];

    // Notes : { f: fréquence (Hz), at: début (s), d: durée (s), type: forme d'onde, g: gain relatif }.
    // "noise" : bruit filtré (froissement) ; f = fréquence centrale du filtre.
    const note = (f, at, d, type = "sine", g = 1) => ({ f, at, d, type, g });
    const SOUNDS = [
        { key: "none", label: "(Aucun)", notes: [] },
        { key: "microsoft-sound", label: "Démarrage.wav", notes: [
            note(293.66, 0, 1.6, "triangle", 0.5), note(440, 0.18, 1.5, "triangle", 0.5), note(587.33, 0.36, 1.4, "triangle", 0.5),
            note(739.99, 0.54, 1.3, "triangle", 0.45), note(880, 0.72, 1.6, "sine", 0.45)
        ] },
        { key: "tada", label: "Tada.wav", notes: [
            note(523.25, 0, 0.12, "triangle"), note(659.25, 0.1, 0.12, "triangle"), note(783.99, 0.2, 0.12, "triangle"),
            note(1046.5, 0.3, 0.9, "triangle"), note(783.99, 0.3, 0.9, "sine", 0.6), note(523.25, 0.3, 0.9, "sine", 0.6)
        ] },
        { key: "chimes", label: "Chimes.wav", notes: [
            note(1318.5, 0, 0.7, "sine", 0.7), note(1046.5, 0.14, 0.7, "sine", 0.7), note(783.99, 0.28, 0.9, "sine", 0.7)
        ] },
        { key: "chord", label: "Chord.wav", notes: [
            note(261.63, 0, 0.9, "triangle", 0.5), note(329.63, 0, 0.9, "triangle", 0.5),
            note(392, 0, 0.9, "triangle", 0.5), note(523.25, 0, 0.9, "triangle", 0.5)
        ] },
        { key: "click", label: "Clic.wav", notes: [note(1400, 0, 0.025, "square", 0.3), note(700, 0.012, 0.03, "square", 0.2)] },
        { key: "ding", label: "Ding.wav", notes: [note(1568, 0, 0.5, "sine", 0.9), note(2352, 0, 0.3, "sine", 0.3)] },
        { key: "notify", label: "Notify.wav", notes: [note(783.99, 0, 0.14, "sine"), note(1174.7, 0.12, 0.4, "sine")] },
        { key: "beep", label: "Bip.wav", notes: [note(800, 0, 0.12, "square", 0.35)] },
        { key: "error", label: "Erreur.wav", notes: [note(220, 0, 0.16, "sawtooth", 0.4), note(165, 0.14, 0.3, "sawtooth", 0.4)] },
        { key: "crumple", label: "Froissement.wav", notes: [
            note(1800, 0, 0.07, "noise", 0.8), note(2600, 0.08, 0.06, "noise", 0.7), note(1400, 0.17, 0.09, "noise", 0.8), note(3000, 0.3, 0.05, "noise", 0.6)
        ] }
    ];

    // Schéma « Windows par défaut » : seuls les événements importants font du bruit (comme à l'origine).
    const DEFAULT_MAP = {
        "windows-start": "microsoft-sound",
        "windows-exit": "tada",
        "default-beep": "beep",
        "asterisk": "ding",
        "exclamation": "notify",
        "question": "ding",
        "critical-stop": "error",
        "open-program": "none",
        "close-program": "none",
        "maximize": "none",
        "minimize": "none",
        "empty-recycle": "crumple",
        "menu-command": "click"
    };
    const SCHEMES = [
        { key: "default", label: "Windows par défaut", map: DEFAULT_MAP },
        { key: "none", label: "Aucun son", map: Object.fromEntries(EVENTS.map((event) => [event.key, "none"])) },
        { key: "lively", label: "Animé", map: { ...DEFAULT_MAP, "open-program": "ding", "close-program": "chimes", "maximize": "beep", "minimize": "beep", "default-beep": "ding" } }
    ];
    const DEFAULT_VOLUME = 0.6;

    const utils = () => window.Win95Utils;
    let audioContext = null;
    let noiseBuffer = null;

    function getStorageKey() {
        return `${STORAGE_PREFIX}.${utils().getCurrentUserId()}`;
    }

    function readState() {
        const raw = utils().readStoredJson(getStorageKey(), null);
        const scheme = SCHEMES.some((candidate) => candidate.key === raw?.scheme) ? raw.scheme : "default";
        const base = SCHEMES.find((candidate) => candidate.key === scheme).map;
        const map = { ...base };
        EVENTS.forEach((event) => {
            const chosen = raw?.map?.[event.key];
            if (SOUNDS.some((sound) => sound.key === chosen)) {
                map[event.key] = chosen;
            }
        });
        const volume = Number.isFinite(raw?.volume) ? Math.min(1, Math.max(0, raw.volume)) : DEFAULT_VOLUME;
        return { scheme: raw?.scheme === "custom" ? "custom" : scheme, map, volume };
    }

    function writeState(state) {
        utils().writeStoredJson(getStorageKey(), state);
        window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    }

    function getContext() {
        if (!audioContext) {
            const Context = window.AudioContext || window.webkitAudioContext;
            if (!Context) {
                return null;
            }
            audioContext = new Context();
        }
        if (audioContext.state === "suspended") {
            audioContext.resume().catch(() => {});
        }
        return audioContext;
    }

    function getNoise(context) {
        if (!noiseBuffer) {
            noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
            const data = noiseBuffer.getChannelData(0);
            for (let index = 0; index < data.length; index += 1) {
                data[index] = Math.random() * 2 - 1;
            }
        }
        return noiseBuffer;
    }

    // Joue un son synthétisé ; renvoie true s'il a été lancé.
    function playSound(soundKey, volume) {
        const sound = SOUNDS.find((candidate) => candidate.key === soundKey);
        if (!sound || sound.notes.length === 0 || volume <= 0) {
            return false;
        }
        const context = getContext();
        if (!context || context.state !== "running") {
            return false;
        }

        const master = context.createGain();
        master.gain.value = volume * 0.4;
        master.connect(context.destination);
        const start = context.currentTime + 0.01;
        sound.notes.forEach((item) => {
            const gain = context.createGain();
            gain.gain.setValueAtTime(0.0001, start + item.at);
            gain.gain.exponentialRampToValueAtTime(item.g, start + item.at + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + item.at + item.d);
            let source;
            if (item.type === "noise") {
                source = context.createBufferSource();
                source.buffer = getNoise(context);
                const filter = context.createBiquadFilter();
                filter.type = "bandpass";
                filter.frequency.value = item.f;
                source.connect(filter);
                filter.connect(gain);
            } else {
                source = context.createOscillator();
                source.type = item.type;
                source.frequency.value = item.f;
                source.connect(gain);
            }
            gain.connect(master);
            source.start(start + item.at);
            source.stop(start + item.at + item.d + 0.05);
        });
        return true;
    }

    const sounds = {
        CHANGE_EVENT,
        EVENTS,
        SOUNDS,
        SCHEMES,

        getState() {
            return readState();
        },

        getVolume() {
            return readState().volume;
        },

        // Joue le son associé à un événement (rien si le schéma ne lui en donne pas).
        play(eventKey) {
            try {
                const state = readState();
                return playSound(state.map[eventKey], state.volume);
            } catch {
                return false;
            }
        },

        // Aperçu d'un son choisi dans le Panneau de configuration (volume courant ou volume fourni).
        preview(soundKey, volume = readState().volume) {
            try {
                return playSound(soundKey, volume);
            } catch {
                return false;
            }
        },

        // Enregistre schéma, association événement → son et volume.
        save({ scheme, map, volume }) {
            const current = readState();
            writeState({
                scheme: scheme ?? current.scheme,
                map: map ?? current.map,
                volume: Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : current.volume
            });
            return { ok: true, message: "Sons enregistrés." };
        }
    };

    window.Win95Sounds = sounds;
    window.Win95Services?.register?.("Win95Sounds", sounds);
})();
