(() => {
    // Lecteur multimédia (Win95MediaPlayer) : le lecteur de sons de Windows 95, dans l'esprit du Lecteur de CD / Lecteur multimédia.
    //  - affichage « [01] 00:12 » (clic = temps écoulé / temps restant), artiste et titre dans des champs en creux ;
    //  - boutons Précédent, Lecture, Pause, Arrêt, Suivant, Éjecter (ouvrir des fichiers), curseur de position gradué, volume ;
    //  - liste de lecture (piste, titre, durée), lecture aléatoire, répétition de la liste ou de la piste ;
    //  - Fichier > Ouvrir… ou glisser des fichiers audio sur la fenêtre ; ouverture depuis Mes documents par Win95UserFiles.openFile ;
    //  - Fichier > Ouvrir un lien YouTube… : vidéo YouTube / YouTube Music via le lecteur officiel (API IFrame) ;
    //  - mini-lecteur dans la barre des tâches (titre défilant, précédent, lecture/pause, suivant) ;
    //  - réglages par compte : localStorage "win95.mediaPlayer.v1.<id>" = { volume, shuffle, repeat, showList }.
    // API : Win95MediaPlayer.attach(fenêtre) et Win95MediaPlayer.openFolderTracks({ tracks, startIndex }, { forceNewWindow }).

    const STORAGE_PREFIX = "win95.mediaPlayer.v1";
    const utils = () => window.Win95Utils;

    const ICONS = {
        play: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1v10l8-5z" fill="currentColor"/></svg>',
        pause: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 1h3v10H2zM7 1h3v10H7z" fill="currentColor"/></svg>',
        stop: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2h8v8H2z" fill="currentColor"/></svg>',
        prev: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1 1h2v10H1zM11 1v10L4 6z" fill="currentColor"/></svg>',
        next: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M9 1h2v10H9zM1 1v10l7-5z" fill="currentColor"/></svg>',
        eject: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1l5 6H1zM1 9h10v2H1z" fill="currentColor"/></svg>'
    };

    function formatTime(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) {
            return "00:00";
        }
        const whole = Math.floor(seconds);
        return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
    }

    // « Artiste - Titre.mp3 » -> { artist, title }
    function inferMetaData(fileName) {
        const name = fileName.replace(/\.[^/.]+$/, "");
        const parts = name.split(" - ");
        return parts.length > 1 ? { artist: parts[0].trim(), title: parts.slice(1).join(" - ").trim() } : { artist: "", title: name };
    }

    // --- YouTube / YouTube Music : lecteur officiel (API IFrame) caché derrière la même interface que <audio> -----------

    // Identifiant d'une vidéo depuis un lien youtube.com, music.youtube.com, youtu.be, /shorts, /embed ou /live (sinon null).
    function parseYouTubeId(text) {
        const value = String(text || "").trim();
        let url;
        try {
            url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
        } catch {
            return null;
        }
        const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "");
        let id = null;
        if (host === "youtu.be") {
            id = url.pathname.slice(1).split("/")[0];
        } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
            id = url.searchParams.get("v") || (url.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/) || [])[1];
        }
        return /^[\w-]{11}$/.test(id || "") ? id : null;
    }

    let youtubeApi = null;
    function loadYouTubeApi() {
        if (window.YT?.Player) {
            return Promise.resolve(window.YT);
        }
        youtubeApi ||= new Promise((resolve, reject) => {
            const previous = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => {
                previous?.();
                resolve(window.YT);
            };
            const script = document.createElement("script");
            script.src = "https://www.youtube.com/iframe_api";
            script.onerror = () => {
                youtubeApi = null;
                reject(new Error("YouTube inaccessible"));
            };
            document.head.appendChild(script);
        });
        return youtubeApi;
    }

    // Reprend la partie de HTMLAudioElement utilisée par le lecteur (paused, ended, currentTime, duration, volume, play, pause,
    // src/load, événements play, pause, ended, timeupdate, durationchange, loadedmetadata, error) ; "metadata" porte titre et chaîne.
    class YouTubeEngine extends EventTarget {
        constructor(host) {
            super();
            this.host = host;
            this.player = null;
            this.ready = null;
            this.src = null;
            this.videoId = null;
            this.state = -1;
            this.wantPlay = false;
            this.timer = null;
            this.volumeValue = 0.8;
        }

        emit(type, detail) {
            this.dispatchEvent(new CustomEvent(type, { detail }));
        }

        get paused() {
            return !(this.state === 1 || (this.state === 3 && this.wantPlay));
        }

        get ended() {
            return this.state === 0;
        }

        get duration() {
            return this.videoId && this.player?.getDuration ? this.player.getDuration() || NaN : NaN;
        }

        get currentTime() {
            return this.videoId && this.player?.getCurrentTime ? this.player.getCurrentTime() || 0 : 0;
        }

        set currentTime(value) {
            if ([1, 2, 3, 0].includes(this.state)) {
                this.player?.seekTo?.(value, true);
            }
        }

        get volume() {
            return this.volumeValue;
        }

        set volume(value) {
            this.volumeValue = value;
            this.player?.setVolume?.(Math.round(value * 100));
        }

        getAttribute(name) {
            return name === "src" ? this.src : null;
        }

        removeAttribute() {
            this.src = null;
            this.videoId = null;
            this.state = -1;
            this.wantPlay = false;
            this.stopTimer();
            this.player?.stopVideo?.();
        }

        load() {
            this.videoId = String(this.src || "").replace(/^youtube:/, "") || null;
            this.state = -1;
            const id = this.videoId;
            this.ensure().then(() => {
                if (id && id === this.videoId) {
                    this.player.cueVideoById(id);
                }
            }).catch(() => this.emit("error"));
        }

        ensure() {
            this.ready ||= loadYouTubeApi().then((YT) => new Promise((resolve) => {
                const mount = document.createElement("div");
                this.host.appendChild(mount);
                this.player = new YT.Player(mount, {
                    width: "100%",
                    height: "100%",
                    host: "https://www.youtube-nocookie.com",
                    playerVars: { playsinline: 1, controls: 0, disablekb: 1, rel: 0, modestbranding: 1, origin: window.location.origin },
                    events: {
                        onReady: () => {
                            this.player.setVolume(Math.round(this.volumeValue * 100));
                            resolve();
                        },
                        onStateChange: (event) => this.onState(event.data),
                        onError: () => this.emit("error")
                    }
                });
            })).catch((error) => {
                this.ready = null;
                throw error;
            });
            return this.ready;
        }

        play() {
            this.wantPlay = true;
            return this.ensure().then(() => this.videoId && this.player.playVideo());
        }

        pause() {
            this.wantPlay = false;
            this.player?.pauseVideo?.();
        }

        onState(state) {
            this.state = state;
            if (state === 1) {
                this.startTimer();
                this.readMetaData();
                this.emit("durationchange");
                this.emit("play");
            } else if (state === 2 || state === 0) {
                this.stopTimer();
                this.emit("pause");
                if (state === 0) {
                    this.emit("ended");
                }
            } else if (state === 5) {
                this.readMetaData();
                this.emit("loadedmetadata");
            }
        }

        readMetaData() {
            const data = this.player?.getVideoData?.();
            if (data?.title) {
                this.emit("metadata", { videoId: this.videoId, title: data.title, author: data.author || "" });
            }
        }

        startTimer() {
            this.stopTimer();
            this.timer = setInterval(() => this.emit("timeupdate"), 500);
        }

        stopTimer() {
            clearInterval(this.timer);
            this.timer = null;
        }

        destroy() {
            this.stopTimer();
            this.player?.destroy?.();
            this.player = null;
        }
    }

    function toTrack(detail) {
        if (!detail || !(detail.url || detail.relativePath)) {
            return null;
        }
        const fileName = detail.fileName || String(detail.relativePath || "").split("/").pop() || "Sans titre";
        const inferred = inferMetaData(fileName);
        return {
            fileName,
            artist: detail.metaData?.artist || inferred.artist,
            title: detail.metaData?.title || inferred.title,
            // URL explicite (ex. adresse blob: de Mes documents) ou chemin relatif à encoder.
            url: detail.url || utils().toSafeUrl(detail.relativePath),
            owned: detail.owned === true,       // adresse blob: créée ici : à révoquer à la fermeture
            duration: null
        };
    }

    class Player {
        constructor(rootElement) {
            this.rootElement = rootElement;
            this.bodyElement = rootElement.querySelector("[data-app-body]");
            if (!this.bodyElement) {
                return;
            }
            this.storageKey = `${STORAGE_PREFIX}.${utils().getCurrentUserId()}`;
            const saved = utils().readStoredJson(this.storageKey, {}) || {};
            this.settings = {
                volume: Number.isFinite(saved.volume) ? Math.min(1, Math.max(0, saved.volume)) : 0.8,
                shuffle: saved.shuffle === true,
                repeat: ["off", "all", "one"].includes(saved.repeat) ? saved.repeat : "off",
                showList: saved.showList !== false
            };
            this.tracks = [];
            this.index = 0;
            this.showRemaining = false;
            this.destroyed = false;
            this.build();
            this.bindAudio();
            this.bindWindow();
            rootElement.__win95MediaPlayerInstance = this;
            tray.join(this);
            this.renderList();
            this.sync();
        }

        // Moteur actif : <audio> pour les fichiers, lecteur YouTube pour les liens YouTube.
        get audio() {
            return this.current?.youtube ? this.youtube : this.nativeAudio;
        }

        setVolume(volume) {
            this.nativeAudio.volume = volume;
            this.youtube.volume = volume;
        }

        // --- Construction -----------------------------------------------------------------------------------------

        build() {
            window.Win95MenuBar.mount(this.bodyElement, [
                {
                    label: "Fichier",
                    items: () => [
                        { label: "Ouvrir…", hint: "Ctrl+O", onSelect: () => this.pickFiles() },
                        { label: "Ouvrir un lien YouTube…", hint: "Ctrl+L", onSelect: () => void this.addYouTube() },
                        { label: "Fermer la liste", disabled: this.tracks.length === 0, onSelect: () => this.clear() },
                        { separator: true },
                        { label: "Quitter", onSelect: () => window.Win95WindowManager?.closeWindow(this.rootElement) }
                    ]
                },
                {
                    label: "Lecture",
                    items: () => [
                        { label: "Lecture", hint: "Espace", disabled: this.tracks.length === 0, onSelect: () => this.play() },
                        { label: "Pause", disabled: this.tracks.length === 0, onSelect: () => this.pause() },
                        { label: "Arrêt", disabled: this.tracks.length === 0, onSelect: () => this.stop() },
                        { label: "Piste précédente", disabled: this.tracks.length < 2, onSelect: () => this.previous() },
                        { label: "Piste suivante", disabled: this.tracks.length < 2, onSelect: () => this.next() },
                        { separator: true },
                        { label: "Lecture aléatoire", checked: this.settings.shuffle, onSelect: () => this.update({ shuffle: !this.settings.shuffle }) },
                        { label: "Répéter la liste", checked: this.settings.repeat === "all", onSelect: () => this.update({ repeat: this.settings.repeat === "all" ? "off" : "all" }) },
                        { label: "Répéter la piste", checked: this.settings.repeat === "one", onSelect: () => this.update({ repeat: this.settings.repeat === "one" ? "off" : "one" }) }
                    ]
                },
                {
                    label: "Affichage",
                    items: () => [
                        { label: "Liste de lecture", checked: this.settings.showList, onSelect: () => this.update({ showList: !this.settings.showList }) },
                        { label: "Temps restant", checked: this.showRemaining, onSelect: () => { this.showRemaining = !this.showRemaining; this.sync(); } }
                    ]
                },
                {
                    label: "?",
                    items: [{ label: "À propos du Lecteur multimédia", onSelect: () => void window.Win95Dialog.alert({ title: "À propos du Lecteur multimédia", message: "Lecteur multimédia Windows 95 (simulation).\nOuvrez des fichiers audio (.mp3, .wav, .ogg, .m4a, .flac) avec Fichier > Ouvrir, ou depuis Mes documents.\nFichier > Ouvrir un lien YouTube lit une vidéo de YouTube ou de YouTube Music avec le lecteur officiel." }) }]
                }
            ]);

            const player = document.createElement("div");
            player.className = "mp";
            player.innerHTML = `
                <div class="mp-display" data-mp-display role="status" aria-live="off">
                    <button type="button" class="mp-lcd" data-mp-lcd title="Cliquez pour afficher le temps restant" aria-label="Temps">
                        <span class="mp-track-no" data-mp-number>[--]</span>
                        <span class="mp-time" data-mp-time>00:00</span>
                    </button>
                    <div class="mp-fields">
                        <div class="mp-field"><label>Artiste :</label><div class="mp-readout" data-mp-artist></div></div>
                        <div class="mp-field"><label>Titre :</label><div class="mp-readout" data-mp-title></div></div>
                    </div>
                </div>
                <div class="mp-video" data-mp-video hidden></div>
                <div class="mp-seek-wrap"><input class="mp-seek" type="range" min="0" max="1000" value="0" data-mp-seek aria-label="Position de lecture"></div>
                <div class="mp-transport">
                    <div class="mp-buttons">
                        <button type="button" class="btn mp-btn" data-mp-action="prev" title="Piste précédente" aria-label="Piste précédente">${ICONS.prev}</button>
                        <button type="button" class="btn mp-btn" data-mp-action="play" title="Lecture" aria-label="Lecture">${ICONS.play}</button>
                        <button type="button" class="btn mp-btn" data-mp-action="pause" title="Pause" aria-label="Pause">${ICONS.pause}</button>
                        <button type="button" class="btn mp-btn" data-mp-action="stop" title="Arrêt" aria-label="Arrêt">${ICONS.stop}</button>
                        <button type="button" class="btn mp-btn" data-mp-action="next" title="Piste suivante" aria-label="Piste suivante">${ICONS.next}</button>
                        <button type="button" class="btn mp-btn" data-mp-action="eject" title="Ouvrir des fichiers…" aria-label="Ouvrir des fichiers">${ICONS.eject}</button>
                    </div>
                    <label class="mp-volume"><img alt="" src="${window.Win95Asset("assets/icons/loudspeaker_rays-0.png")}"><input type="range" min="0" max="100" data-mp-volume aria-label="Volume"></label>
                </div>
                <div class="mp-list-wrap" data-mp-list-wrap>
                    <div class="mp-list-head"><span>Piste</span><span>Titre</span><span>Durée</span></div>
                    <div class="mp-list windows-scrollbar" role="listbox" aria-label="Liste de lecture" data-mp-list></div>
                </div>
                <div class="mp-status explorer-status" data-mp-status>Arrêté</div>
                <audio class="mp-audio" data-mp-audio preload="metadata"></audio>`;
            this.bodyElement.appendChild(player);
            this.playerElement = player;
            this.nativeAudio = player.querySelector("[data-mp-audio]");
            this.youtube = new YouTubeEngine(player.querySelector("[data-mp-video]"));
            this.refs = {
                video: player.querySelector("[data-mp-video]"),
                number: player.querySelector("[data-mp-number]"),
                time: player.querySelector("[data-mp-time]"),
                artist: player.querySelector("[data-mp-artist]"),
                title: player.querySelector("[data-mp-title]"),
                seek: player.querySelector("[data-mp-seek]"),
                volume: player.querySelector("[data-mp-volume]"),
                list: player.querySelector("[data-mp-list]"),
                listWrap: player.querySelector("[data-mp-list-wrap]"),
                status: player.querySelector("[data-mp-status]"),
                lcd: player.querySelector("[data-mp-lcd]")
            };
            this.refs.volume.value = String(Math.round(this.settings.volume * 100));
            this.setVolume(this.settings.volume);

            player.addEventListener("click", (event) => {
                const action = event.target.closest("[data-mp-action]")?.dataset.mpAction;
                if (action) {
                    this.action(action);
                }
            });
            this.refs.lcd.addEventListener("click", () => {
                this.showRemaining = !this.showRemaining;
                this.sync();
            });
            this.refs.seek.addEventListener("input", () => {
                if (Number.isFinite(this.audio.duration) && this.audio.duration > 0) {
                    this.audio.currentTime = (Number(this.refs.seek.value) / 1000) * this.audio.duration;
                }
            });
            this.refs.volume.addEventListener("input", () => {
                this.setVolume(Number(this.refs.volume.value) / 100);
                this.update({ volume: this.nativeAudio.volume }, { render: false });
            });
        }

        // Les événements des deux moteurs sont écoutés ; seuls ceux du moteur actif comptent.
        bindAudio() {
            [this.nativeAudio, this.youtube].forEach((engine) => {
                const active = (handler) => () => engine === this.audio && handler();
                ["loadedmetadata", "timeupdate", "play", "pause", "seeked", "durationchange"].forEach((type) => engine.addEventListener(type, active(() => this.sync())));
                engine.addEventListener("ended", active(() => this.ended()));
                engine.addEventListener("error", active(() => {
                    this.refs.status.textContent = engine === this.youtube ? "Vidéo YouTube illisible ou non disponible." : "Fichier audio illisible.";
                    this.sync();
                }));
            });
            this.youtube.addEventListener("metadata", (event) => {
                const { videoId, title, author } = event.detail;
                this.tracks.filter((track) => track.youtube === videoId).forEach((track) => {
                    track.title = title;
                    track.artist = author;
                });
                this.renderList();
                this.sync();
            });
        }

        bindWindow() {
            const root = this.rootElement;
            root.tabIndex = -1;
            root.addEventListener("keydown", (event) => {
                if (event.ctrlKey && event.key.toLowerCase() === "o") {
                    event.preventDefault();
                    this.pickFiles();
                } else if (event.ctrlKey && event.key.toLowerCase() === "l") {
                    event.preventDefault();
                    void this.addYouTube();
                } else if (event.key === " " && !event.target.closest("input, button, select")) {
                    event.preventDefault();
                    this.togglePlay();
                } else if (["ArrowLeft", "ArrowRight"].includes(event.key) && !event.target.closest("input")) {
                    this.audio.currentTime = Math.max(0, this.audio.currentTime + (event.key === "ArrowRight" ? 5 : -5));
                }
            });
            // Fichiers audio déposés sur la fenêtre.
            root.addEventListener("dragover", (event) => {
                if (Array.from(event.dataTransfer?.types || []).includes("Files")) {
                    event.preventDefault();
                }
            });
            root.addEventListener("drop", (event) => {
                if (event.dataTransfer?.files?.length) {
                    event.preventDefault();
                    this.addFiles(event.dataTransfer.files);
                }
            });
            root.addEventListener("win95:window-closed", () => {
                this.destroyed = true;
                tray.leave(this);
                this.nativeAudio.pause();
                this.nativeAudio.removeAttribute("src");
                this.youtube.destroy();
                this.tracks.filter((track) => track.owned).forEach((track) => URL.revokeObjectURL(track.url));
            }, { once: true });
        }

        // --- Réglages -----------------------------------------------------------------------------------------------

        update(changes, { render = true } = {}) {
            this.settings = { ...this.settings, ...changes };
            utils().writeStoredJson(this.storageKey, this.settings);
            if (render) {
                this.sync();
                this.fit();
            }
        }

        // La fenêtre s'adapte à l'affichage (ou non) de la liste de lecture.
        fit() {
            this.refs.listWrap.hidden = !this.settings.showList;
            utils().fitWindow(this.rootElement, this.playerElement, { extraHeight: this.bodyElement.querySelector(".win95-menubar").offsetHeight + 1 });
        }

        // --- Pistes ---------------------------------------------------------------------------------------------------

        setTracks(tracks, startIndex = 0, { autoplay = true } = {}) {
            this.tracks.filter((track) => track.owned).forEach((track) => URL.revokeObjectURL(track.url));
            this.tracks = tracks;
            this.index = Math.min(Math.max(0, startIndex), Math.max(0, tracks.length - 1));
            this.renderList();
            this.load(autoplay);
            void this.readDurations();
        }

        clear() {
            [this.nativeAudio, this.youtube].forEach((engine) => {
                engine.pause();
                engine.removeAttribute("src");
            });
            this.setTracks([], 0, { autoplay: false });
        }

        pickFiles() {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "audio/*,.mp3,.wav,.ogg,.m4a,.flac";
            input.multiple = true;
            input.addEventListener("change", () => this.addFiles(input.files), { once: true });
            input.click();
        }

        addFiles(fileList) {
            const added = Array.from(fileList || [])
                .filter((file) => /^audio\//.test(file.type) || utils().getFileKind(file.name) === "audio")
                .map((file) => toTrack({ fileName: file.name, url: URL.createObjectURL(file), owned: true }));
            if (added.length === 0) {
                this.refs.status.textContent = "Aucun fichier audio dans la sélection.";
                return;
            }
            this.appendTracks(added);
        }

        // Fichier > Ouvrir un lien YouTube… : liens youtube.com, music.youtube.com, youtu.be.
        async addYouTube() {
            const link = await window.Win95Dialog.prompt({
                title: "Ouvrir un lien YouTube",
                message: "Collez le lien d'une vidéo YouTube ou d'un titre YouTube Music :",
                confirmLabel: "Ouvrir"
            });
            if (link === null || link === undefined || this.destroyed) {
                return;
            }
            const id = parseYouTubeId(link);
            if (!id) {
                await window.Win95Dialog.error({ title: "Lien YouTube", message: "Ce lien n'est pas un lien YouTube ou YouTube Music valide." });
                return;
            }
            this.appendTracks([{ fileName: `YouTube ${id}`, artist: "YouTube", title: `YouTube (${id})`, url: `youtube:${id}`, youtube: id, owned: false, duration: null }]);
        }

        appendTracks(added) {
            const first = this.tracks.length;
            this.tracks = [...this.tracks, ...added];
            this.renderList();
            if (!this.audio.getAttribute("src")) {
                this.index = first;
                this.load(true);
            } else {
                this.sync();
            }
            void this.readDurations();
        }

        // Durées des pistes, lues une à une en arrière-plan.
        async readDurations() {
            const probe = new Audio();
            probe.preload = "metadata";
            for (const track of this.tracks) {
                if (this.destroyed || track.duration !== null || track.youtube) {
                    continue;
                }
                track.duration = await new Promise((resolve) => {
                    const done = (value) => {
                        probe.onloadedmetadata = null;
                        probe.onerror = null;
                        resolve(value);
                    };
                    probe.onloadedmetadata = () => done(Number.isFinite(probe.duration) ? probe.duration : 0);
                    probe.onerror = () => done(0);
                    probe.src = track.url;
                });
                this.renderList();
            }
        }

        get current() {
            return this.tracks[this.index] || null;
        }

        load(autoplay) {
            const track = this.current;
            if (!track) {
                this.sync();
                return;
            }
            // L'autre moteur se tait (on passe d'un fichier à une vidéo YouTube, ou inversement).
            (track.youtube ? this.nativeAudio : this.youtube).pause();
            if (this.audio.getAttribute("src") !== track.url) {
                this.audio.src = track.url;
                this.audio.load();
            }
            this.audio.currentTime = 0;
            if (autoplay) {
                this.play();
            } else {
                this.audio.pause();
            }
            this.renderList();
            this.sync();
        }

        // --- Transport --------------------------------------------------------------------------------------------------

        action(name) {
            ({
                play: () => this.play(),
                pause: () => this.pause(),
                stop: () => this.stop(),
                prev: () => this.previous(),
                next: () => this.next(),
                eject: () => this.pickFiles()
            })[name]?.();
        }

        play() {
            if (!this.current) {
                this.pickFiles();
                return;
            }
            if (!this.audio.getAttribute("src")) {
                this.load(false);
            }
            this.audio.play()?.catch(() => this.sync());
        }

        pause() {
            if (this.current && !this.audio.paused) {
                this.audio.pause();
            } else if (this.current && this.audio.currentTime > 0) {
                this.play();      // Pause enfoncée de nouveau : reprise, comme sur le Lecteur de CD
            }
        }

        togglePlay() {
            if (this.audio.paused) {
                this.play();
            } else {
                this.audio.pause();
            }
        }

        stop() {
            this.audio.pause();
            this.audio.currentTime = 0;
            this.sync();
        }

        previous() {
            if (this.tracks.length === 0) {
                return;
            }
            // Au-delà de 3 secondes, « Précédent » recommence la piste.
            if (this.audio.currentTime > 3) {
                this.audio.currentTime = 0;
                return;
            }
            this.goTo((this.index - 1 + this.tracks.length) % this.tracks.length);
        }

        next() {
            if (this.tracks.length === 0) {
                return;
            }
            if (this.settings.shuffle && this.tracks.length > 1) {
                let pick = this.index;
                while (pick === this.index) {
                    pick = Math.floor(Math.random() * this.tracks.length);
                }
                this.goTo(pick);
                return;
            }
            this.goTo((this.index + 1) % this.tracks.length);
        }

        goTo(index) {
            const wasPlaying = !this.audio.paused;
            this.index = index;
            this.load(wasPlaying || this.audio.ended || this.autoContinue === true);
        }

        ended() {
            if (this.settings.repeat === "one") {
                this.audio.currentTime = 0;
                this.play();
                return;
            }
            const isLast = this.index === this.tracks.length - 1;
            if (isLast && this.settings.repeat === "off" && !this.settings.shuffle) {
                this.stop();
                return;
            }
            this.autoContinue = true;
            this.next();
            this.autoContinue = false;
        }

        // --- Affichage -----------------------------------------------------------------------------------------------------

        renderList() {
            const list = this.refs.list;
            list.textContent = "";
            if (this.tracks.length === 0) {
                const empty = document.createElement("div");
                empty.className = "mp-empty";
                empty.textContent = "Aucun fichier audio. Utilisez Fichier > Ouvrir…";
                list.appendChild(empty);
                return;
            }
            this.tracks.forEach((track, index) => {
                const row = document.createElement("button");
                row.type = "button";
                row.className = `mp-row${index === this.index ? " is-current" : ""}`;
                row.setAttribute("role", "option");
                row.setAttribute("aria-selected", index === this.index ? "true" : "false");
                const number = document.createElement("span");
                number.textContent = String(index + 1).padStart(2, "0");
                const title = document.createElement("span");
                title.textContent = track.artist ? `${track.artist} - ${track.title}` : track.title;
                const duration = document.createElement("span");
                duration.textContent = track.duration ? formatTime(track.duration) : "--:--";
                row.append(number, title, duration);
                row.addEventListener("dblclick", () => {
                    this.index = index;
                    this.load(true);
                });
                row.addEventListener("click", () => {
                    this.index = index;
                    this.renderList();
                    this.sync();
                });
                list.appendChild(row);
            });
        }

        sync() {
            if (!this.refs || this.destroyed) {
                return;
            }
            const { audio, refs } = this;
            const track = this.current;
            const playing = Boolean(track) && !audio.paused && !audio.ended;
            const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
            const position = audio.currentTime || 0;
            refs.number.textContent = track ? `[${String(this.index + 1).padStart(2, "0")}]` : "[--]";
            refs.time.textContent = this.showRemaining && duration > 0 ? `-${formatTime(duration - position)}` : formatTime(position);
            refs.artist.textContent = track?.artist || "";
            refs.title.textContent = track?.title || "";
            if (document.activeElement !== refs.seek) {
                refs.seek.value = duration > 0 ? String(Math.round((position / duration) * 1000)) : "0";
            }
            refs.seek.disabled = !track || duration === 0;
            const playButton = this.playerElement.querySelector("[data-mp-action='play']");
            const pauseButton = this.playerElement.querySelector("[data-mp-action='pause']");
            playButton.classList.toggle("is-active", playing);
            pauseButton.classList.toggle("is-active", Boolean(track) && audio.paused && position > 0 && !audio.ended);
            this.playerElement.querySelectorAll("[data-mp-action='stop'], [data-mp-action='pause']").forEach((button) => {
                button.disabled = !track;
            });
            this.playerElement.querySelectorAll("[data-mp-action='prev'], [data-mp-action='next']").forEach((button) => {
                button.disabled = this.tracks.length < 2;
            });
            const state = !track ? "Arrêté" : playing ? "Lecture" : position > 0 && !audio.ended ? "En pause" : "Arrêté";
            const mode = [this.settings.shuffle ? "aléatoire" : "", this.settings.repeat === "all" ? "répétition de la liste" : this.settings.repeat === "one" ? "répétition de la piste" : ""].filter(Boolean).join(", ");
            if (!refs.status.dataset.sticky || state !== "Arrêté") {
                refs.status.textContent = `${state}${this.tracks.length ? ` — ${this.tracks.length} piste${this.tracks.length > 1 ? "s" : ""}` : ""}${mode ? ` (${mode})` : ""}`;
            }
            const titleElement = this.rootElement.querySelector(".title-bar-text");
            if (titleElement) {
                titleElement.textContent = track ? `Lecteur multimédia - ${track.title}` : "Lecteur multimédia";
            }
            this.refs.listWrap.hidden = !this.settings.showList;
            this.refs.list.querySelectorAll(".mp-row").forEach((row, index) => row.classList.toggle("is-current", index === this.index));
            // Le cadre vidéo n'apparaît que pour une piste YouTube : la fenêtre se réajuste quand il change.
            const showVideo = Boolean(track?.youtube);
            if (this.refs.video.hidden === showVideo) {
                this.refs.video.hidden = !showVideo;
                this.fit();
            }
            tray.refresh(this, playing);
        }
    }

    // Mini-lecteur de la barre des tâches, à gauche du compte : titre défilant s'il est trop long, précédent, lecture/pause, suivant.
    // Il suit le lecteur qui joue (ou le dernier ouvert) et disparaît avec le dernier lecteur fermé ou sans piste.
    const tray = {
        players: new Set(),
        owner: null,
        element: null,

        join(player) {
            this.players.add(player);
            this.owner ||= player;
        },

        leave(player) {
            this.players.delete(player);
            if (this.owner === player) {
                this.owner = [...this.players][0] || null;
                this.refresh(this.owner, !this.owner?.audio.paused);
            }
        },

        build() {
            const anchor = document.querySelector("[data-user-tray]") || document.querySelector(".tray-clock");
            if (!anchor) {
                return null;
            }
            const element = document.createElement("div");
            element.className = "tray-media";
            element.hidden = true;
            element.setAttribute("role", "group");
            element.setAttribute("aria-label", "Lecteur multimédia");
            element.innerHTML = `
                <div class="tray-media-title" data-tm-title><span></span></div>
                <button type="button" class="tray-media-btn" data-tm="prev" title="Piste précédente" aria-label="Piste précédente">${ICONS.prev}</button>
                <button type="button" class="tray-media-btn" data-tm="toggle" title="Lecture" aria-label="Lecture">${ICONS.play}</button>
                <button type="button" class="tray-media-btn" data-tm="next" title="Piste suivante" aria-label="Piste suivante">${ICONS.next}</button>`;
            anchor.parentElement.insertBefore(element, anchor);
            element.addEventListener("click", (event) => {
                const action = event.target.closest("[data-tm]")?.dataset.tm;
                const player = this.owner;
                if (!action || !player) {
                    return;
                }
                ({ prev: () => player.previous(), next: () => player.next(), toggle: () => player.togglePlay() })[action]?.();
            });
            this.element = element;
            return element;
        },

        refresh(player, playing) {
            if (player && player.audio && !player.audio.paused && this.owner !== player) {
                this.owner = player;      // le lecteur qui se met à jouer prend la main
            }
            if (player !== this.owner) {
                return;
            }
            const element = this.element || this.build();
            if (!element) {
                return;
            }
            const track = player?.current;
            element.hidden = !track;
            if (!track) {
                return;
            }
            const text = track.artist && track.artist !== "YouTube" ? `${track.artist} - ${track.title}` : track.title;
            const titleBox = element.querySelector("[data-tm-title]");
            if (titleBox.dataset.text !== text) {
                titleBox.dataset.text = text;
                titleBox.title = text;
                const span = titleBox.firstElementChild;
                titleBox.classList.remove("is-scrolling");
                span.textContent = text;
                // Trop long : le texte est répété et défile en boucle (vitesse constante, environ 6 caractères par seconde).
                if (span.scrollWidth > titleBox.clientWidth) {
                    span.textContent = `${text}      ${text}      `;
                    span.style.animationDuration = `${Math.max(6, (text.length + 6) / 6)}s`;
                    titleBox.classList.add("is-scrolling");
                }
            }
            const toggle = element.querySelector("[data-tm='toggle']");
            toggle.innerHTML = playing ? ICONS.pause : ICONS.play;
            toggle.title = toggle.ariaLabel = playing ? "Pause" : "Lecture";
            element.querySelectorAll("[data-tm='prev'], [data-tm='next']").forEach((button) => {
                button.disabled = player.tracks.length < 2;
            });
        }
    };

    const service = {
        attach(rootElement) {
            if (!rootElement) {
                return null;
            }
            if (rootElement.__win95MediaPlayerInstance) {
                return rootElement.__win95MediaPlayerInstance;
            }
            const player = new Player(rootElement);
            player.fit();
            return player;
        },

        // Ouvre les pistes dans le lecteur (nouvelle fenêtre si forceNewWindow, sinon la fenêtre ouverte) et les joue.
        openFolderTracks(payload, { forceNewWindow = false } = {}) {
            const tracks = (payload?.tracks || []).map(toTrack).filter(Boolean);
            if (tracks.length === 0) {
                return null;
            }
            const windowElement = window.Win95WindowManager?.openApp("audio-player", forceNewWindow ? { forceNew: true } : {});
            const player = windowElement && service.attach(windowElement);
            player?.setTracks(tracks, Number.isInteger(payload.startIndex) ? payload.startIndex : 0);
            return player;
        }
    };

    service.parseYouTubeId = parseYouTubeId;
    window.Win95MediaPlayer = service;
    window.Win95Services?.register?.("Win95MediaPlayer", service);
})();
