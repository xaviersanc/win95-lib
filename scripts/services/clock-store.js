(() => {
    // Horloge du système (Win95Clock) : date et heure simulées + fuseau horaire.
    // Réglée dans Panneau de configuration > Date/Heure ; lue par l'horloge de la barre des tâches.
    //  - décalage (offsetMs) par rapport à l'horloge réelle de l'ordinateur : l'heure réglée continue de s'écouler ;
    //  - fuseau horaire (identifiant IANA, ex. "Europe/Paris") ; null = fuseau de l'ordinateur.
    // Réglage de la machine (commun à tous les comptes) : localStorage "win95.clock.v1".
    // Émet "win95:clock-changed".

    const STORAGE_KEY = "win95.clock.v1";
    const CHANGE_EVENT = "win95:clock-changed";
    const LOCALE = "fr-FR";

    // Fuseaux proposés (la liste de Windows 95 en comptait une centaine : on garde les plus courants).
    const TIME_ZONES = [
        { id: "Pacific/Honolulu", label: "Hawaï" },
        { id: "America/Anchorage", label: "Alaska" },
        { id: "America/Los_Angeles", label: "Heure du Pacifique (États-Unis)" },
        { id: "America/Denver", label: "Heure des Rocheuses (États-Unis)" },
        { id: "America/Chicago", label: "Heure du centre (États-Unis)" },
        { id: "America/New_York", label: "Heure de l'Est (États-Unis)" },
        { id: "America/Montreal", label: "Montréal" },
        { id: "America/Sao_Paulo", label: "Brasilia" },
        { id: "UTC", label: "Temps universel" },
        { id: "Europe/London", label: "Londres, Dublin, Lisbonne" },
        { id: "Europe/Paris", label: "Paris, Bruxelles, Madrid, Berlin, Rome" },
        { id: "Europe/Athens", label: "Athènes, Helsinki, Istanbul" },
        { id: "Europe/Moscow", label: "Moscou, Saint-Pétersbourg" },
        { id: "Asia/Dubai", label: "Abou Dhabi, Mascate" },
        { id: "Asia/Kolkata", label: "Bombay, Calcutta, New Delhi" },
        { id: "Asia/Bangkok", label: "Bangkok, Hanoï, Jakarta" },
        { id: "Asia/Shanghai", label: "Pékin, Hong Kong, Singapour" },
        { id: "Asia/Tokyo", label: "Tokyo, Séoul" },
        { id: "Australia/Sydney", label: "Sydney, Melbourne" },
        { id: "Pacific/Auckland", label: "Auckland, Wellington" }
    ];

    function readState() {
        try {
            const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
            return {
                offsetMs: Number.isFinite(raw?.offsetMs) ? raw.offsetMs : 0,
                timeZone: typeof raw?.timeZone === "string" ? raw.timeZone : null
            };
        } catch {
            return { offsetMs: 0, timeZone: null };
        }
    }

    let state = readState();

    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch {
            // Sans stockage, le réglage dure jusqu'au rechargement.
        }
        window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    }

    function isValidZone(zone) {
        try {
            new Intl.DateTimeFormat(LOCALE, { timeZone: zone });
            return true;
        } catch {
            return false;
        }
    }

    // Fuseau effectivement utilisé (celui de l'ordinateur tant qu'aucun n'est choisi).
    function getTimeZone() {
        return state.timeZone && isValidZone(state.timeZone) ? state.timeZone : Intl.DateTimeFormat().resolvedOptions().timeZone;
    }

    // Composantes de l'heure murale d'un instant dans un fuseau.
    function getParts(timestamp, zone = getTimeZone()) {
        const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
            timeZone: zone,
            hourCycle: "h23",
            year: "numeric", month: "numeric", day: "numeric",
            hour: "numeric", minute: "numeric", second: "numeric"
        }).formatToParts(new Date(timestamp)).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
        return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second };
    }

    // Décalage (ms) du fuseau par rapport à UTC à un instant donné.
    function getZoneOffsetMs(timestamp, zone) {
        const p = getParts(timestamp, zone);
        return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(timestamp / 1000) * 1000;
    }

    // Instant UTC (ms) correspondant à une heure murale dans un fuseau.
    function wallTimeToTimestamp({ year, month, day, hour, minute, second }, zone) {
        const guess = Date.UTC(year, month - 1, day, hour, minute, second);
        let timestamp = guess - getZoneOffsetMs(guess, zone);
        // Deuxième passe : le décalage peut différer autour d'un changement d'heure.
        timestamp = guess - getZoneOffsetMs(timestamp, zone);
        return timestamp;
    }

    function formatOffset(zone, timestamp = Date.now()) {
        const minutes = Math.round(getZoneOffsetMs(timestamp, zone) / 60000);
        const sign = minutes < 0 ? "-" : "+";
        const abs = Math.abs(minutes);
        return `GMT${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
    }

    const clock = {
        CHANGE_EVENT,
        TIME_ZONES,

        // Instant simulé (ms depuis 1970).
        nowMs() {
            return Date.now() + state.offsetMs;
        },

        now() {
            return new Date(this.nowMs());
        },

        getTimeZone,

        getParts(timestamp = this.nowMs(), zone = getTimeZone()) {
            return getParts(timestamp, zone);
        },

        formatOffset,

        // "(GMT+01:00) Paris, Bruxelles…" ; pour un fuseau hors liste, son identifiant.
        describeZone(zone) {
            const known = TIME_ZONES.find((candidate) => candidate.id === zone);
            return `(${formatOffset(zone, this.nowMs())}) ${known ? known.label : zone.replace(/_/g, " ")}`;
        },

        // Heure de la barre des tâches : "09:41".
        formatTime(timestamp = this.nowMs()) {
            return new Intl.DateTimeFormat(LOCALE, { timeZone: getTimeZone(), hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(timestamp));
        },

        // "lundi 19 octobre 2026" (info-bulle de l'horloge).
        formatDate(timestamp = this.nowMs()) {
            return new Intl.DateTimeFormat(LOCALE, { timeZone: getTimeZone(), weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(timestamp));
        },

        // Règle l'heure murale (dans le fuseau courant) : { year, month, day, hour, minute, second }.
        setDateTime(parts) {
            const target = wallTimeToTimestamp(parts, getTimeZone());
            if (!Number.isFinite(target)) {
                return { ok: false, message: "Date ou heure invalide." };
            }
            state = { ...state, offsetMs: target - Date.now() };
            saveState();
            return { ok: true, message: "Date et heure enregistrées." };
        },

        // Change de fuseau en conservant l'instant : l'heure affichée change, pas l'heure réelle.
        setTimeZone(zone) {
            if (!isValidZone(zone)) {
                return { ok: false, message: "Fuseau horaire inconnu." };
            }
            state = { ...state, timeZone: zone };
            saveState();
            return { ok: true, message: "Fuseau horaire enregistré." };
        },

        // Revient à l'heure réelle de l'ordinateur.
        resetToSystem() {
            state = { offsetMs: 0, timeZone: state.timeZone };
            saveState();
        }
    };

    window.Win95Clock = clock;
    window.Win95Services?.register?.("Win95Clock", clock);
})();
