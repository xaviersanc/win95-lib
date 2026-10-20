(() => {
    const utils = window.Win95Utils;
    const dragDrop = window.Win95DragDrop;
    const recycleBin = window.Win95RecycleBin;
    const documentShortcuts = window.Win95DocumentShortcuts;
    const userFiles = window.Win95UserFiles;
    const { MIME } = dragDrop;

    const DESKTOP_DRAG_THRESHOLD_PX = 4;
    const DESKTOP_CLICK_SUPPRESS_MS = 250;
    const RECYCLE_BIN_TARGET_SELECTOR = ".desktop-icons [data-desktop-app='recycle-bin'], [data-window-app='recycle-bin'] [data-recycle-bin-dropzone]";
    const DESKTOP_DROP_TYPES = [MIME.recycleBinEntry, MIME.explorerEntry, MIME.text];
    const RECYCLE_BIN_DROP_TYPES = [MIME.explorerEntry, MIME.text];
    const SHORTCUT_SOURCES = ["file-explorer"];
    const STATUS_BAR_SELECTOR = "[data-explorer-status], [data-notepad-status], [data-image-status]";

    // Menu Démarrer : { app } = ouvre une application (droits : data-app-name) ; { label, icon, items } = sous-menu ;
    // { action: "logout" } = Arrêter ; { separator: true }. Un sous-menu sans application accessible est masqué.
    const FOLDER_ICON = window.Win95Asset("assets/icons/directory_closed-4.png");
    const START_MENU = [
        { label: "Programmes", icon: FOLDER_ICON, items: [
            { label: "Accessoires", icon: FOLDER_ICON, items: [
                { app: "calculator" },
                { app: "clock" },
                { app: "charmap" },
                { app: "local-link" },
                { app: "notepad" },
                { app: "paint" },
                { label: "Jeux", icon: FOLDER_ICON, items: [{ app: "minesweeper" }, { app: "solitaire" }, { app: "freecell" }, { app: "hearts" }] },
                { label: "Multimédia", icon: FOLDER_ICON, items: [{ app: "image-viewer" }, { app: "audio-player" }] }
            ] }
        ] },
        { app: "internet-explorer" },
        { app: "recycle-bin" },
        { separator: true },
        { label: "Paramètres", icon: window.Win95Asset("assets/icons/directory_control_panel-4.png"), items: [{ app: "control-panel" }] },
        { app: "user-manager" },
        { separator: true },
        { action: "logout", label: "Arrêter...", icon: window.Win95Asset("assets/icons/windows-0.png") }
    ];

    class WindowManager {
        constructor() {
            this.windowSelector = "[data-window-component]";
            this.taskbarSelector = "[data-taskbar-app]";
            this.desktopIconSelector = "[data-desktop-app]";
            this.activeWindow = null;
            this.startMenuOpen = false;
            this.desktopStateStoragePrefix = "win95.desktop.state.v1";
            this.desktopGrid = { x: 96, y: 96, offsetX: 14, offsetY: 14 };
            this.desktopIconDrag = null;
            this.desktopIconSuppressClickUntil = 0;
            this.desktopStateLoadPromise = null;
            this.desktopStateSavePromise = Promise.resolve();
            this.zIndexBase = 10;
            this.windowCascadeOffset = { x: 32, y: 32 };
            this.windowDefinitions = {
                "internet-explorer": {
                    label: "Mes documents",
                    icon: window.Win95Asset("assets/icons/directory_open_file_mydocs-4.png"),
                    title: "Mes documents",
                    kind: "file-explorer"
                },
                "recycle-bin": {
                    label: "Corbeille",
                    icon: window.Win95Asset("assets/icons/recycle_bin_empty-4.png"),
                    title: "Corbeille",
                    kind: "file-explorer"
                },
                notepad: {
                    label: "Bloc-notes",
                    icon: window.Win95Asset("assets/icons/notepad_file-1.png"),
                    title: "Bloc-notes",
                    kind: "notepad"
                },
                paint: {
                    label: "Paint",
                    icon: window.Win95Asset("assets/icons/paint_old-1.png"),
                    title: "sans titre - Paint",
                    kind: "paint"
                },
                "image-viewer": {
                    label: "Lecteur d'image",
                    icon: window.Win95Asset("assets/icons/imagjpeg-1.png"),
                    title: "Lecteur d'image",
                    kind: "image-viewer"
                },
                "audio-player": {
                    label: "Lecteur multimédia",
                    icon: window.Win95Asset("assets/icons/media_player-0.png"),
                    title: "Lecteur multimédia",
                    kind: "audio-player"
                },
                // Panneau de configuration : ses applets ont `parentApp` (même droit d'accès que lui).
                "control-panel": {
                    label: "Panneau de configuration",
                    icon: window.Win95Asset("assets/icons/directory_control_panel-4.png"),
                    title: "Panneau de configuration",
                    kind: "control-panel"
                },
                "display-properties": {
                    label: "Propriétés de Affichage",
                    icon: window.Win95Asset("assets/icons/display_properties-4.png"),
                    title: "Propriétés de Affichage",
                    kind: "display-properties",
                    parentApp: "control-panel"
                },
                "date-time": {
                    label: "Propriétés de Date/Heure",
                    icon: window.Win95Asset("assets/icons/time_and_date-0.png"),
                    title: "Propriétés de Date/Heure",
                    kind: "date-time",
                    parentApp: "control-panel"
                },
                mouse: {
                    label: "Propriétés de Souris",
                    icon: window.Win95Asset("assets/icons/mouse-0.png"),
                    title: "Propriétés de Souris",
                    kind: "mouse",
                    parentApp: "control-panel"
                },
                sounds: {
                    label: "Propriétés de Sons",
                    icon: window.Win95Asset("assets/icons/computer_sound-0.png"),
                    title: "Propriétés de Sons",
                    kind: "sounds",
                    parentApp: "control-panel"
                },
                "system-properties": {
                    label: "Propriétés système",
                    icon: window.Win95Asset("assets/icons/computer_explorer-2.png"),
                    title: "Propriétés système",
                    kind: "system-properties",
                    parentApp: "control-panel"
                },
                "add-remove-programs": {
                    label: "Ajout/Suppression de programmes",
                    icon: window.Win95Asset("assets/icons/appwizard-2.png"),
                    title: "Propriétés de Ajout/Suppression de programmes",
                    kind: "add-remove-programs",
                    parentApp: "control-panel"
                },
                calculator: { label: "Calculatrice", icon: window.Win95Asset("assets/icons/calculator-0.png"), title: "Calculatrice", kind: "calculator" },
                clock: { label: "Horloge", icon: window.Win95Asset("assets/icons/clock-1.png"), title: "Horloge", kind: "clock" },
                charmap: { label: "Table des caractères", icon: window.Win95Asset("assets/icons/charmap-0.png"), title: "Table des caractères", kind: "charmap" },
                "local-link": { label: "Connexion locale", icon: window.Win95Asset("assets/icons/mobile_phone-0.png"), title: "Connexion locale", kind: "local-link" },
                minesweeper: { label: "Démineur", icon: window.Win95Asset("assets/icons/game_mine_1-0.png"), title: "Démineur", kind: "minesweeper" },
                solitaire: { label: "Solitaire", icon: window.Win95Asset("assets/icons/game_solitaire-0.png"), title: "Solitaire", kind: "solitaire" },
                freecell: { label: "FreeCell", icon: window.Win95Asset("assets/icons/game_freecell-0.png"), title: "FreeCell", kind: "freecell" },
                hearts: { label: "Cœurs", icon: window.Win95Asset("assets/icons/game_hearts.png"), title: "Cœurs", kind: "hearts" },
                // Réservé aux administrateurs (Win95Security.ADMIN_ONLY_APPS).
                "user-manager": {
                    label: "Gestion des utilisateurs",
                    icon: window.Win95Asset("assets/icons/user_computer-1.png"),
                    title: "Gestion des utilisateurs",
                    kind: "user-manager"
                }
            };
            this.boundHandleDocumentClick = this.handleDocumentClick.bind(this);
            this.boundHandleWindowFocus = this.handleWindowFocus.bind(this);
            this.boundHandleTaskbarClick = this.handleTaskbarClick.bind(this);
            this.boundHandleStartButtonClick = this.handleStartButtonClick.bind(this);
            this.boundHandleStartMenuClick = this.handleStartMenuClick.bind(this);
            this.boundHandleDocumentPointerDown = this.handleDocumentPointerDown.bind(this);
            this.boundHandleAuthChanged = this.handleAuthChanged.bind(this);
            this.boundHandleAuthLogout = this.handleAuthLogout.bind(this);
            this.boundRefreshSession = () => this.refreshSession();
            this.boundHandleContextMenu = this.handleContextMenu.bind(this);
            this.boundHandleDesktopIconActivate = this.handleDesktopIconActivate.bind(this);
            this.boundHandleDesktopIconKeydown = this.handleDesktopIconKeydown.bind(this);
            this.boundHandleDesktopIconPointerDown = this.handleDesktopIconPointerDown.bind(this);
            this.boundHandleDesktopIconPointerMove = this.handleDesktopIconPointerMove.bind(this);
            this.boundHandleDesktopIconPointerUp = this.handleDesktopIconPointerUp.bind(this);
            this.boundHandleDesktopIconPointerCancel = this.handleDesktopIconPointerCancel.bind(this);
            this.boundHandleDesktopDragOver = this.handleDesktopDragOver.bind(this);
            this.boundHandleDesktopDrop = this.handleDesktopDrop.bind(this);
            this.boundHandleDesktopDragLeave = this.handleDesktopDragLeave.bind(this);
            this.boundHandleRecycleBinDragOver = this.handleRecycleBinDragOver.bind(this);
            this.boundHandleRecycleBinDrop = this.handleRecycleBinDrop.bind(this);
            this.boundHandleRecycleBinDragLeave = this.handleRecycleBinDragLeave.bind(this);

            // Points d'extension (voir « API d'extension » plus bas) : un projet qui utilise la bibliothèque y branche ses
            // propres applications sans modifier ce fichier.
            this.factories = {};
            this.recycleProviders = [];
            this.shortcutOpeners = {};
            this.contextMenuProviders = [];
            this.startMenuTree = JSON.parse(JSON.stringify(START_MENU));
        }

        init() {
            this.windows = Array.from(document.querySelectorAll(this.windowSelector));
            this.taskbarButtons = Array.from(document.querySelectorAll(this.taskbarSelector));
            this.desktopIcons = Array.from(document.querySelectorAll(this.desktopIconSelector));
            this.desktopIconsContainer = document.querySelector(".desktop-icons");
            this.startButton = document.querySelector(".start-btn");
            this.startMenu = this.ensureStartMenu();
            this.ensureUserTray();
            // Icône « Connexion locale » : fournie par la bibliothèque (module « local-link »), absente si le module est exclu.
            if (window.Win95LocalLink) {
                this.registerDesktopIcon({ app: "local-link" });
            }

            this.setInitialStates();
            this.bindEvents();

            void this.loadDesktopState();

            const primaryWindow = this.getWindow("internet-explorer") || this.windows.find((windowElement) => !windowElement.classList.contains("is-hidden"));
            if (primaryWindow) {
                this.setActiveWindow(primaryWindow);
            }
        }

        setInitialStates() {
            this.positionDesktopIconsInGrid();

            this.windows.forEach((windowElement, index) => {
                if (!windowElement.style.zIndex) {
                    windowElement.style.zIndex = String(this.zIndexBase + index);
                }

                const appName = windowElement.dataset.windowApp;
                const taskbarButton = this.getTaskbarButton(appName);
                if (taskbarButton) {
                    taskbarButton.dataset.windowLinked = "true";
                }
            });
        }

        bindEvents() {
            // Phase de bouillonnement : les menus propres à un composant (explorateur…) passent avant ; le navigateur est déjà bloqué (context-guard.js).
            document.addEventListener("contextmenu", this.boundHandleContextMenu);
            window.addEventListener("win95:auth-changed", this.boundHandleAuthChanged);
            window.addEventListener("win95:auth-logout", this.boundHandleAuthLogout);
            window.addEventListener("win95:accounts-changed", this.boundRefreshSession);
            window.addEventListener("win95:programs-changed", this.boundRefreshSession);
            document.addEventListener("click", this.boundHandleDocumentClick);
            document.addEventListener("pointerdown", this.boundHandleDocumentPointerDown, true);
            document.addEventListener("mousedown", this.boundHandleWindowFocus, true);
            document.addEventListener("pointermove", this.boundHandleDesktopIconPointerMove);
            document.addEventListener("pointerup", this.boundHandleDesktopIconPointerUp);
            document.addEventListener("pointercancel", this.boundHandleDesktopIconPointerCancel);
            if (this.startButton) {
                this.startButton.addEventListener("click", this.boundHandleStartButtonClick);
            }
            if (this.startMenu) {
                this.startMenu.addEventListener("click", this.boundHandleStartMenuClick);
            }
            this.desktopIcons.forEach((iconElement) => this.bindDesktopIconEvents(iconElement));
            this.bindRecycleBinDropTargets();
            this.taskbarButtons.forEach((button) => {
                button.addEventListener("click", this.boundHandleTaskbarClick);
            });
            if (this.desktopIconsContainer) {
                this.desktopIconsContainer.addEventListener("dragover", this.boundHandleDesktopDragOver);
                this.desktopIconsContainer.addEventListener("drop", this.boundHandleDesktopDrop);
                this.desktopIconsContainer.addEventListener("dragenter", this.boundHandleDesktopDragOver);
                this.desktopIconsContainer.addEventListener("dragleave", this.boundHandleDesktopDragLeave);
            }
        }

        bindDesktopIconEvents(iconElement) {
            if (!iconElement || iconElement.dataset.desktopEventsBound === "true") {
                return;
            }

            // Les icônes se déplacent via pointer events : le drag HTML5 natif est désactivé.
            iconElement.draggable = false;
            iconElement.addEventListener("dblclick", this.boundHandleDesktopIconActivate);
            iconElement.addEventListener("keydown", this.boundHandleDesktopIconKeydown);
            iconElement.addEventListener("pointerdown", this.boundHandleDesktopIconPointerDown);
            if (!iconElement.hasAttribute("role")) {
                iconElement.setAttribute("role", "button");
            }
            if (!iconElement.hasAttribute("tabindex")) {
                iconElement.setAttribute("tabindex", "0");
            }

            iconElement.dataset.desktopEventsBound = "true";
        }

        getWindow(appName) {
            if (!appName) {
                return null;
            }

            return document.querySelector(`${this.windowSelector}[data-window-app="${appName}"]`);
        }

        getTaskbarButton(appName) {
            if (!appName) {
                return null;
            }

            return document.querySelector(`${this.taskbarSelector}[data-taskbar-app="${appName}"]`);
        }

        getDesktopIconLabel(iconElement, fallback = "Icône") {
            return iconElement?.querySelector("span:last-child")?.textContent?.trim() || iconElement?.title || fallback;
        }

        handleDesktopIconActivate(event) {
            // Un clic qui termine un déplacement d'icône ne doit pas ouvrir l'application.
            if (Date.now() < this.desktopIconSuppressClickUntil) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }

            const iconElement = event.currentTarget;
            const shortcutId = iconElement.dataset.desktopShortcutId;
            const appName = iconElement.dataset.desktopApp;
            if (!shortcutId && !appName) {
                return;
            }

            event.preventDefault();
            if (shortcutId) {
                this.openDesktopShortcut(shortcutId);
            } else {
                this.openApp(appName);
            }
        }

        handleDesktopIconKeydown(event) {
            if (event.key === "Enter" || event.key === " ") {
                this.handleDesktopIconActivate(event);
            }
        }

        // --- Déplacement des icônes du bureau (pointer events) -----------------------------
        // Une icône se déplace à la souris et se cale sur la grille ; un raccourci lâché sur la
        // Corbeille (icône du bureau ou fenêtre ouverte) y est envoyé.

        handleDesktopIconPointerDown(event) {
            const iconElement = event.currentTarget;
            if (event.button !== 0 || !iconElement) {
                return;
            }

            this.desktopIconDrag = {
                element: iconElement,
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                originLeft: this.parsePixelValue(iconElement.style.left),
                originTop: this.parsePixelValue(iconElement.style.top),
                moved: false
            };
            event.preventDefault();
        }

        handleDesktopIconPointerMove(event) {
            const drag = this.desktopIconDrag;
            if (!drag || drag.pointerId !== event.pointerId) {
                return;
            }

            const deltaX = event.clientX - drag.startX;
            const deltaY = event.clientY - drag.startY;
            if (!drag.moved && Math.hypot(deltaX, deltaY) < DESKTOP_DRAG_THRESHOLD_PX) {
                return;
            }

            drag.moved = true;
            const bounds = this.getDesktopIconBounds();
            this.setIconPosition(
                drag.element,
                this.clamp(drag.originLeft + deltaX, 0, bounds.maxLeft),
                this.clamp(drag.originTop + deltaY, 0, bounds.maxTop)
            );
            drag.element.classList.add("is-dragging");
        }

        handleDesktopIconPointerUp(event) {
            const drag = this.endDesktopIconDrag(event);
            if (!drag?.moved) {
                return;
            }

            const iconElement = drag.element;
            this.desktopIconSuppressClickUntil = Date.now() + DESKTOP_CLICK_SUPPRESS_MS;

            const shortcutId = iconElement.dataset.desktopShortcutId;
            const elementUnderPointer = shortcutId ? this.getElementUnderPointer(event.clientX, event.clientY, iconElement) : null;
            if (elementUnderPointer?.closest(RECYCLE_BIN_TARGET_SELECTOR)) {
                this.moveDesktopShortcutToRecycleBin(shortcutId);
                return;
            }

            const explorer = elementUnderPointer?.closest("[data-file-explorer]")?.__win95FileExplorerInstance;
            if (explorer?.canHostShortcuts()) {
                this.moveDesktopShortcutToFolder(shortcutId, explorer);
                return;
            }

            const proposed = this.getSnappedDesktopIconPosition(iconElement);
            if (this.isDesktopCellOccupied(proposed.left, proposed.top, iconElement)) {
                this.setIconPosition(iconElement, drag.originLeft, drag.originTop);
                return;
            }

            this.setIconPosition(iconElement, proposed.left, proposed.top);
            void this.saveDesktopState();
        }

        // Déplacement interrompu (perte du pointeur, changement d'onglet…) : l'icône revient à sa place.
        handleDesktopIconPointerCancel(event) {
            const drag = this.endDesktopIconDrag(event);
            if (drag?.moved) {
                this.setIconPosition(drag.element, drag.originLeft, drag.originTop);
            }
        }

        endDesktopIconDrag(event) {
            const drag = this.desktopIconDrag;
            if (!drag || drag.pointerId !== event.pointerId) {
                return null;
            }

            this.desktopIconDrag = null;
            drag.element.classList.remove("is-dragging");
            return drag;
        }

        setIconPosition(iconElement, left, top) {
            iconElement.style.position = "absolute";
            iconElement.style.left = `${left}px`;
            iconElement.style.top = `${top}px`;
        }

        getElementUnderPointer(clientX, clientY, draggedElement) {
            // L'icône déplacée est sous le curseur : on la rend transparente aux clics le temps du test.
            const previousPointerEvents = draggedElement.style.pointerEvents;
            draggedElement.style.pointerEvents = "none";
            try {
                return document.elementFromPoint(clientX, clientY);
            } finally {
                draggedElement.style.pointerEvents = previousPointerEvents;
            }
        }

        // --- Glisser-déposer HTML5 : explorateurs -> bureau / Corbeille ---------------------

        isRecycleBinTarget(target) {
            return Boolean(target?.closest?.(RECYCLE_BIN_TARGET_SELECTOR));
        }

        handleDesktopDragOver(event) {
            // L'icône Corbeille, posée sur le bureau, traite elle-même ses dépôts.
            if (this.isRecycleBinTarget(event.target) || !dragDrop.hasAnyType(event.dataTransfer, DESKTOP_DROP_TYPES)) {
                return;
            }

            event.preventDefault();
            event.dataTransfer.dropEffect = dragDrop.hasAnyType(event.dataTransfer, [MIME.recycleBinEntry]) ? "move" : "copy";
            this.desktopIconsContainer?.classList.add("is-drop-target");
        }

        handleDesktopDragLeave(event) {
            if (event.relatedTarget && this.desktopIconsContainer?.contains(event.relatedTarget)) {
                return;
            }

            this.desktopIconsContainer?.classList.remove("is-drop-target");
        }

        handleDesktopDrop(event) {
            if (this.isRecycleBinTarget(event.target)) {
                return;
            }

            this.desktopIconsContainer?.classList.remove("is-drop-target");
            const payload = dragDrop.readPayload(event.dataTransfer, DESKTOP_DROP_TYPES, (candidate) => typeof candidate?.name === "string");
            if (!payload) {
                return;
            }

            event.preventDefault();
            const dropPosition = { x: event.clientX, y: event.clientY };

            // Un élément sorti de la Corbeille est restauré, pas transformé en raccourci.
            if (payload.kind === "recycle-bin-item") {
                Promise.resolve(this.restoreRecycleBinItem(payload.recycleItem, dropPosition)).then((result) => this.showStatusMessage(result.message));
                return;
            }

            // Raccourci de Mes documents : il est déplacé (pas dupliqué) sur le bureau.
            if (payload.kind === "document-shortcut") {
                this.showStatusMessage(this.moveDocumentShortcutToDesktop(payload.shortcutId, dropPosition).message);
                return;
            }

            // Seuls les éléments d'un explorateur deviennent des raccourcis.
            if (!SHORTCUT_SOURCES.includes(payload.source)) {
                this.showStatusMessage(`${payload.name} ne peut pas être déposé sur le bureau.`);
                return;
            }

            this.createDesktopShortcutFromPayload(payload, dropPosition);
        }

        handleRecycleBinDragOver(event) {
            if (!dragDrop.hasAnyType(event.dataTransfer, RECYCLE_BIN_DROP_TYPES)) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "move";
            this.setRecycleBinDropHighlight(true);
        }

        handleRecycleBinDragLeave(event) {
            if (event.relatedTarget && event.currentTarget.contains(event.relatedTarget)) {
                return;
            }

            this.setRecycleBinDropHighlight(false);
        }

        handleRecycleBinDrop(event) {
            this.setRecycleBinDropHighlight(false);
            event.preventDefault();
            event.stopPropagation();

            const payload = dragDrop.readPayload(event.dataTransfer, RECYCLE_BIN_DROP_TYPES);
            if (payload) {
                Promise.resolve(this.moveToRecycleBin(payload)).then((result) => this.showStatusMessage(result.message));
            }
        }

        bindRecycleBinDropTargets() {
            document.querySelectorAll(RECYCLE_BIN_TARGET_SELECTOR).forEach((dropTarget) => {
                if (dropTarget.dataset.recycleBinDropBound === "true") {
                    return;
                }

                dropTarget.addEventListener("dragenter", this.boundHandleRecycleBinDragOver);
                dropTarget.addEventListener("dragover", this.boundHandleRecycleBinDragOver);
                dropTarget.addEventListener("dragleave", this.boundHandleRecycleBinDragLeave);
                dropTarget.addEventListener("drop", this.boundHandleRecycleBinDrop);
                dropTarget.dataset.recycleBinDropBound = "true";
            });
        }

        setRecycleBinDropHighlight(isActive) {
            document.querySelectorAll(RECYCLE_BIN_TARGET_SELECTOR).forEach((dropTarget) => {
                dropTarget.classList.toggle("is-drop-target", isActive);
            });
        }

        // Sans session ouverte (écran de connexion), le bureau n'est ni lu ni enregistré.
        hasSession() {
            return !window.Win95Security || Boolean(window.Win95Security.getCurrentUser());
        }

        async loadDesktopState() {
            if (!this.hasSession()) {
                return null;
            }
            if (this.desktopStateLoadPromise) {
                return this.desktopStateLoadPromise;
            }

            this.desktopStateLoadPromise = (async () => {
                const storageKey = this.getDesktopStateStorageKey(this.getCurrentUserPaths().userId);

                try {
                    const raw = localStorage.getItem(storageKey);
                    const payload = raw ? JSON.parse(raw) : null;
                    const records = Array.isArray(payload?.icons) ? payload.icons : [];
                    this.applyDesktopState(records);

                    if (records.length === 0) {
                        await this.saveDesktopState();
                    }
                } catch {
                    this.positionDesktopIconsInGrid();
                } finally {
                    this.desktopStateLoadPromise = null;
                }
            })();

            return this.desktopStateLoadPromise;
        }

        // --- API d'extension -----------------------------------------------------------------------------------
        // Pour un projet qui utilise la bibliothèque (voir LLM-GUIDE.md) : tout peut être enregistré à tout moment, y compris après
        // le démarrage du bureau (le menu Démarrer, les droits et les icônes sont mis à jour).

        // Enregistre une application :
        //   { key, label, icon, title?, parentApp?,
        //     create(manager, options, definition, userPaths) -> élément fenêtre     (construire avec createWindowElement + mountWindow,
        //                                                                              ou createToolWindow / createAppletWindow / createExplorerWindow)
        //     | tool: { width, height, attach } | applet: { width, height, attach }, // raccourcis pour les cas simples
        //     startMenu?: { path: ["Programmes", "Accessoires"], before? } ou true,   // entrée du menu Démarrer (before : application ou libellé)
        //     desktopIcon?: true | { label, icon },                                  // icône sur le bureau
        //     removable?: { size, description } }                                    // supprimable dans Ajout/Suppression de programmes
        // Les droits (comptes) s'appliquent à `key` ; `parentApp` fait hériter ceux d'une autre application.
        registerApp(spec) {
            const { key } = spec;
            if (!key) {
                throw new Error("registerApp : `key` obligatoire.");
            }
            this.windowDefinitions[key] = {
                label: spec.label || key,
                icon: spec.icon || window.Win95Asset("assets/icons/document-1.png"),
                title: spec.title || spec.label || key,
                kind: spec.kind || key,
                ...(spec.parentApp ? { parentApp: spec.parentApp } : {})
            };
            if (spec.create) {
                this.factories[key] = spec.create;
            } else if (spec.tool) {
                this.factories[key] = (manager, options, definition) => manager.createToolWindow(key, definition, spec.tool);
            } else if (spec.applet) {
                this.factories[key] = (manager, options, definition) => manager.createAppletWindow(key, definition, spec.applet);
            }
            if (spec.parentApp && window.Win95Security?.APP_PARENTS) {
                window.Win95Security.APP_PARENTS[key] = spec.parentApp;
            }
            if (spec.removable && window.Win95Programs?.register) {
                window.Win95Programs.register({ key, label: this.windowDefinitions[key].label, icon: this.windowDefinitions[key].icon, ...spec.removable });
            }
            if (spec.startMenu) {
                this.registerStartMenuItem({ app: key }, { path: spec.startMenu === true ? [] : spec.startMenu.path || [], before: spec.startMenu === true ? null : spec.startMenu.before || null });
            }
            if (spec.desktopIcon) {
                this.registerDesktopIcon({ app: key, ...(spec.desktopIcon === true ? {} : spec.desktopIcon) });
            }
            return this.windowDefinitions[key];
        }

        // Ajoute une entrée au menu Démarrer. path : groupes à traverser (créés s'ils n'existent pas), ex. ["Programmes", "Jeux"] ;
        // entry : { app } | { label, icon, items } | { separator: true } | { action: "logout", label, icon }.
        // before : { app } ou label de l'entrée devant laquelle insérer (sinon à la fin du groupe, avant « Arrêter » à la racine).
        registerStartMenuItem(entry, { path = [], before = null } = {}) {
            let list = this.startMenuTree;
            path.forEach((label) => {
                let group = list.find((candidate) => candidate.label === label && candidate.items);
                if (!group) {
                    group = { label, icon: FOLDER_ICON, items: [] };
                    list.splice(Math.max(0, list.length - (list === this.startMenuTree ? 3 : 0)), 0, group);
                }
                list = group.items;
            });
            const index = before ? list.findIndex((candidate) => candidate.label === before || candidate.app === before) : -1;
            if (index >= 0) {
                list.splice(index, 0, entry);
            } else if (list === this.startMenuTree) {
                // À la racine : avant le séparateur et « Arrêter ».
                list.splice(Math.max(0, list.length - 2), 0, entry);
            } else {
                list.push(entry);
            }
            this.rebuildStartMenu();
        }

        rebuildStartMenu() {
            const container = this.startMenu?.querySelector(".start-menu-items");
            if (container) {
                container.innerHTML = this.renderStartMenuItems(this.startMenuTree);
                this.refreshSession();
            }
        }

        // Ajoute une icône d'application au bureau : { app, label?, icon?, title? }.
        registerDesktopIcon({ app, label, icon, title }) {
            if (!this.desktopIconsContainer || this.desktopIconsContainer.querySelector(`[data-desktop-app="${app}"]`)) {
                return null;
            }
            const definition = this.windowDefinitions[app] || {};
            const element = document.createElement("div");
            element.className = "desktop-icon";
            element.dataset.desktopApp = app;
            element.title = title || `Ouvrir ${label || definition.label || app}`;
            const image = document.createElement("img");
            image.alt = "";
            image.src = icon || definition.icon || window.Win95Asset("assets/icons/document-1.png");
            const text = document.createElement("span");
            text.textContent = label || definition.label || app;
            element.append(image, text);
            this.desktopIconsContainer.appendChild(element);
            this.bindDesktopIconEvents(element);
            this.desktopIcons.push(element);
            element.style.position = "absolute";
            this.moveDesktopIconToFreeCell(element);
            this.refreshSession();
            return element;
        }

        // Corbeille : { canMove(payload), moveToBin(payload, manager) -> résultat | promesse, canRestore(item), restore(item, manager, dropPosition) }.
        // Pour des éléments propres au projet (profil, objets de jeu…) déposés sur la Corbeille ou restaurés depuis elle.
        registerRecycleBinProvider(provider) {
            this.recycleProviders.push(provider);
        }

        // Raccourci dont la cible porte `source` : opener(target, manager) -> { message } | promesse. La source est aussi
        // acceptée comme origine de glisser-déposer vers le bureau.
        registerShortcutOpener(source, opener) {
            this.shortcutOpeners[source] = opener;
            this.registerShortcutSource(source);
        }

        registerShortcutSource(source) {
            if (!SHORTCUT_SOURCES.includes(source)) {
                SHORTCUT_SOURCES.push(source);
            }
        }

        // Type MIME de glisser-déposer accepté par le bureau et/ou la Corbeille.
        registerDropType(type, { desktop = true, recycleBin = true } = {}) {
            if (desktop && !DESKTOP_DROP_TYPES.includes(type)) {
                DESKTOP_DROP_TYPES.push(type);
            }
            if (recycleBin && !RECYCLE_BIN_DROP_TYPES.includes(type)) {
                RECYCLE_BIN_DROP_TYPES.push(type);
            }
        }

        // Menu contextuel : provider(target, manager) -> éléments de menu | null (null = laisser les autres répondre).
        registerContextMenuProvider(provider) {
            this.contextMenuProviders.push(provider);
        }

        // Élément dans la zone de notification, avant l'horloge (ou avant `before`, un sélecteur).
        addTrayItem(element, { before = ".tray-clock" } = {}) {
            const anchor = document.querySelector(before);
            anchor?.parentElement?.insertBefore(element, anchor);
            return element;
        }

        // --- Menus contextuels de la simulation (clic droit) ---------------------------------------------

        handleContextMenu(event) {
            // Zone de saisie (menu natif conservé) ou menu déjà ouvert par un composant : rien à faire.
            if (!event.defaultPrevented || window.Win95ContextMenu.isOpen() || !(event.target instanceof Element) || !this.hasSession()) {
                return;
            }
            const target = event.target;
            const items = this.getContextMenuItems(target);
            if (items && items.length > 0) {
                window.Win95ContextMenu.open(event.clientX, event.clientY, items);
            }
        }

        getContextMenuItems(target) {
            if (target.closest("[data-start-menu], .start-btn, .logout-modal, .win95-dialog")) {
                return null;
            }
            for (const provider of this.contextMenuProviders) {
                const custom = provider(target, this);
                if (custom) {
                    return custom;
                }
            }

            // Barre de titre d'une fenêtre ou bouton de la barre des tâches : menu système de la fenêtre.
            const titleBar = target.closest(".window-title-bar");
            if (titleBar && !target.closest(".title-bar-controls")) {
                return this.getWindowMenuItems(titleBar.closest(this.windowSelector));
            }
            const taskButton = target.closest(".task-btn");
            if (taskButton) {
                return this.getWindowMenuItems(this.windows.find((candidate) => candidate.dataset.windowId === taskButton.dataset.taskbarWindow));
            }
            if (target.closest(this.windowSelector)) {
                return null;
            }

            const icon = target.closest(".desktop-icon");
            if (icon) {
                const shortcutId = icon.dataset.desktopShortcutId;
                const open = () => (shortcutId ? this.openDesktopShortcut(shortcutId) : this.openApp(icon.dataset.desktopApp));
                return [
                    { label: "Ouvrir", bold: true, onSelect: open },
                    ...(shortcutId ? [{ separator: true }, { label: "Supprimer", onSelect: () => this.moveDesktopShortcutToRecycleBin(shortcutId) }] : [])
                ];
            }

            if (target.closest("#tray-clock")) {
                return [{ label: "Ajuster la date/l'heure", onSelect: () => this.openApp("date-time") }];
            }
            if (target.closest(".taskbar")) {
                const visible = this.windows.filter((candidate) => !candidate.classList.contains("is-hidden"));
                return [
                    { label: "Cascade", disabled: visible.length === 0, onSelect: () => this.cascadeWindows() },
                    { label: "Réduire toutes les fenêtres", disabled: visible.length === 0, onSelect: () => visible.forEach((candidate) => this.hideWindow(candidate)) },
                    { separator: true },
                    { label: "Ajuster la date/l'heure", onSelect: () => this.openApp("date-time") }
                ];
            }

            if (target.closest(".desktop")) {
                return [
                    { label: "Aligner les icônes", onSelect: () => { this.positionDesktopIconsInGrid(); void this.saveDesktopState(); } },
                    { label: "Actualiser", onSelect: () => void this.loadDesktopState() },
                    { separator: true },
                    { label: "Propriétés", onSelect: () => this.openApp("display-properties") }
                ];
            }
            return null;
        }

        // Menu système d'une fenêtre : Restaurer / Réduire / Agrandir / Fermer.
        getWindowMenuItems(windowElement) {
            if (!windowElement) {
                return null;
            }
            const maximized = windowElement.dataset.maximized === "true";
            const fixed = windowElement.classList.contains("app-fixed-window") || windowElement.classList.contains("property-window");
            return [
                { label: "Restaurer", disabled: !maximized && !windowElement.classList.contains("is-hidden"), onSelect: () => (maximized ? this.toggleMaximize(windowElement) : this.showWindow(windowElement)) },
                { label: "Réduire", disabled: windowElement.classList.contains("property-window"), onSelect: () => this.hideWindow(windowElement) },
                { label: "Agrandir", disabled: maximized || fixed, onSelect: () => { this.showWindow(windowElement); this.toggleMaximize(windowElement); } },
                { separator: true },
                { label: "Fermer", bold: true, onSelect: () => this.closeWindow(windowElement) }
            ];
        }

        cascadeWindows() {
            const visible = this.getVisibleWindowsByZIndex();
            visible.forEach((windowElement, index) => {
                if (windowElement.dataset.maximized === "true") {
                    this.toggleMaximize(windowElement);
                }
                windowElement.style.left = `${24 + index * this.windowCascadeOffset.x}px`;
                windowElement.style.top = `${24 + index * this.windowCascadeOffset.y}px`;
            });
        }

        // --- Session : changement de compte, droits d'accès ------------------------------------------

        closeAllWindows() {
            [...this.windows].forEach((windowElement) => {
                windowElement.dispatchEvent(new CustomEvent("win95:window-closed"));
                windowElement.__win95TaskbarObserver?.disconnect();
                windowElement.remove();
            });
            this.windows = [];
            this.activeWindow = null;
            this.taskbarButtons.filter((button) => button.dataset.taskbarWindow).forEach((button) => button.remove());
            this.taskbarButtons = Array.from(document.querySelectorAll(this.taskbarSelector));
            this.closeStartMenu();
            this.closeLogoutModal();
        }

        handleAuthChanged() {
            this.closeAllWindows();
            this.refreshSession();
            void this.loadDesktopState();
        }

        handleAuthLogout() {
            this.closeAllWindows();
        }

        canOpen(appName) {
            if (window.Win95Loader?.disabledApps?.includes(appName)) {
                return false;
            }
            // Une sécurité fournie par le projet n'a pas forcément de droits par application : tout est alors ouvert.
            return typeof window.Win95Security?.canOpenApp !== "function" || window.Win95Security.canOpenApp(appName);
        }

        // Nom du compte dans la zone de notification, applications masquées selon les droits du compte.
        refreshSession() {
            if (this.userTray) {
                const user = window.Win95Security?.getCurrentUser();
                this.userTray.querySelector("span").textContent = user?.userName || "";
                this.userTray.title = user ? `Session ouverte : ${user.userName}${user.role === "admin" ? " (administrateur)" : ""}` : "";
            }
            this.startMenu?.querySelectorAll("[data-app-name]").forEach((item) => {
                item.style.display = this.canOpen(item.dataset.appName) ? "" : "none";
            });
            // Un sous-menu dont plus aucune application n'est accessible disparaît (du plus profond au plus haut).
            Array.from(this.startMenu?.querySelectorAll(".start-menu-group") || []).reverse().forEach((group) => {
                const hasVisible = Array.from(group.querySelectorAll(":scope > .start-submenu > [data-app-name], :scope > .start-submenu > .start-menu-group"))
                    .some((child) => child.style.display !== "none");
                group.style.display = hasVisible ? "" : "none";
            });
            this.desktopIcons.filter((icon) => icon.dataset.desktopApp).forEach((icon) => {
                const appName = icon.dataset.desktopApp;
                icon.style.visibility = appName.startsWith("desktop-shortcut:") || this.canOpen(appName) ? "" : "hidden";
            });
            // Une fenêtre ouverte dont l'accès vient d'être retiré à ce compte est fermée.
            [...this.windows].filter((windowElement) => !this.canOpen(windowElement.dataset.windowApp)).forEach((windowElement) => this.closeWindow(windowElement));
        }

        ensureUserTray() {
            const clock = document.querySelector(".tray-clock");
            // Win95Config.userTray = false : le projet affiche lui-même le compte (ex. un sélecteur de personnage).
            if (!clock || window.Win95Config?.userTray === false || document.querySelector("[data-user-tray]")) {
                return;
            }
            const badge = document.createElement("div");
            badge.className = "tray-user";
            badge.dataset.userTray = "";
            badge.innerHTML = `<img alt="" src="${window.Win95Asset("assets/icons/user_computer-1.png")}"><span></span>`;
            clock.parentElement.insertBefore(badge, clock);
            this.userTray = badge;
            this.refreshSession();
        }

        applyDesktopState(records) {
            Array.from(this.desktopIconsContainer?.querySelectorAll("[data-desktop-shortcut-id]") || []).forEach((iconElement) => {
                iconElement.remove();
            });

            this.desktopIcons = Array.from(document.querySelectorAll(this.desktopIconSelector));
            this.positionDesktopIconsInGrid();

            const normalizedRecords = Array.isArray(records)
                ? records
                    .map((record, index) => this.normalizeDesktopStateRecord(record, index + 1))
                    .filter(Boolean)
                : [];

            const recordMap = new Map(normalizedRecords.map((record) => [record.iconKey, record]));
            this.desktopIcons = Array.from(document.querySelectorAll(this.desktopIconSelector));

            this.desktopIcons.forEach((iconElement) => {
                const record = recordMap.get(this.getDesktopIconLayoutKey(iconElement));
                if (record) {
                    this.applyDesktopStateToIcon(iconElement, record);
                }
            });

            normalizedRecords
                .filter((record) => record.iconType === "shortcut")
                .forEach((record) => {
                    if (this.getDesktopShortcutElement(record.shortcutId)) {
                        return;
                    }

                    const iconElement = this.createDesktopShortcutIcon(this.recordToDesktopShortcut(record));
                    this.desktopIconsContainer?.appendChild(iconElement);
                    this.bindDesktopIconEvents(iconElement);
                    this.desktopIcons.push(iconElement);
                    this.applyDesktopStateToIcon(iconElement, record);
                });

            this.desktopIcons = Array.from(document.querySelectorAll(this.desktopIconSelector));

            // Icône d'application ajoutée depuis (sans position enregistrée) : si sa case de grille par défaut est
            // déjà prise par une icône placée, elle passe sur la première case libre au lieu d'être masquée.
            this.desktopIcons
                .filter((iconElement) => !iconElement.dataset.desktopShortcutId && !recordMap.has(this.getDesktopIconLayoutKey(iconElement)))
                .forEach((iconElement) => {
                    if (normalizedRecords.length > 0 && this.isDesktopCellOccupied(iconElement.style.left, iconElement.style.top, iconElement)) {
                        this.moveDesktopIconToFreeCell(iconElement);
                    }
                });
        }

        moveDesktopIconToFreeCell(iconElement) {
            const columns = this.getDesktopGridColumns();
            const rows = this.getDesktopGridRowsPerColumn();
            for (let col = 0; col < columns; col += 1) {
                for (let row = 0; row < rows; row += 1) {
                    const left = this.desktopGrid.offsetX + col * this.desktopGrid.x;
                    const top = this.desktopGrid.offsetY + row * this.desktopGrid.y;
                    if (!this.isDesktopCellOccupied(left, top, iconElement)) {
                        iconElement.style.left = `${left}px`;
                        iconElement.style.top = `${top}px`;
                        return;
                    }
                }
            }
        }

        normalizeDesktopStateRecord(record, fallbackOrder) {
            if (!record || typeof record !== "object") {
                return null;
            }

            const iconKey = String(record.iconKey || record.icon_key || record.id || "").trim();
            if (!iconKey) {
                return null;
            }

            const iconType = String(record.iconType || record.icon_type || (iconKey.startsWith("shortcut:") ? "shortcut" : "app")).trim().toLowerCase() === "shortcut"
                ? "shortcut"
                : "app";
            const label = String(record.label || record.fonctionnalite || record.functionality || "Icône").trim() || "Icône";
            const fonctionnalite = String(record.fonctionnalite || record.functionality || label).trim() || label;
            const image = String(record.image || record.image_path || record.iconImage || record.icon_image || "").trim();
            const appName = String(record.appName || record.cible_app || record.desktopApp || "").trim() || null;
            const shortcutId = iconType === "shortcut"
                ? String(record.shortcutId || record.shortcut_id || iconKey.replace(/^shortcut:/, "")).trim()
                : null;

            return {
                iconKey,
                iconType,
                fonctionnalite,
                label,
                image,
                appName,
                shortcutId,
                target: record.target || null,
                x: this.parsePixelValue(record.x ?? record.coord_x ?? record.left),
                y: this.parsePixelValue(record.y ?? record.coord_y ?? record.top),
                iconOrder: Number.isFinite(Number(record.iconOrder ?? record.icon_order)) ? Number(record.iconOrder ?? record.icon_order) : fallbackOrder
            };
        }

        applyDesktopStateToIcon(iconElement, record) {
            if (!iconElement || !record) {
                return;
            }

            if (record.iconType === "shortcut") {
                iconElement.__desktopShortcut = this.recordToDesktopShortcut(record);
            }

            iconElement.title = record.fonctionnalite || record.label || iconElement.title;
            iconElement.style.position = "absolute";
            iconElement.style.left = `${record.x}px`;
            iconElement.style.top = `${record.y}px`;

            const labelElement = iconElement.querySelector("span:last-child");
            if (labelElement) {
                labelElement.textContent = record.label || labelElement.textContent || "Icône";
            }

            const imageElement = iconElement.querySelector("img");
            if (imageElement && record.image) {
                imageElement.src = record.image;
                imageElement.alt = record.label || imageElement.alt;
            }
        }

        recordToDesktopShortcut(record) {
            if (!record) {
                return null;
            }

            return {
                id: String(record.shortcutId || record.iconKey.replace(/^shortcut:/, "")),
                label: record.label,
                image: record.image,
                target: record.target || null,
                createdAt: new Date().toISOString()
            };
        }

        getDesktopShortcutElement(shortcutId) {
            if (!shortcutId) {
                return null;
            }

            return document.querySelector(`[data-desktop-shortcut-id="${shortcutId}"]`);
        }

        collectDesktopIconRecords() {
            if (!this.desktopIconsContainer) {
                return [];
            }

            const currentShortcuts = this.collectDesktopShortcutRecords();
            const shortcutMap = new Map(currentShortcuts.map((shortcut) => [shortcut.id, shortcut]));
            const iconElements = Array.from(this.desktopIconsContainer.querySelectorAll(this.desktopIconSelector));

            return iconElements.map((iconElement, index) => this.buildDesktopIconRecord(iconElement, shortcutMap, index + 1)).filter(Boolean);
        }

        collectDesktopShortcutRecords() {
            return Array.from(this.desktopIconsContainer?.querySelectorAll("[data-desktop-shortcut-id]") || []).map((iconElement, index) => ({
                id: String(iconElement.dataset.desktopShortcutId || "").trim(),
                label: this.getDesktopIconLabel(iconElement, "Raccourci"),
                image: iconElement.__desktopShortcut?.image || iconElement.querySelector("img")?.getAttribute("src") || this.getShortcutTargetIcon(iconElement.__desktopShortcut?.target || null),
                target: iconElement.__desktopShortcut?.target || null,
                x: this.parsePixelValue(iconElement.style.left),
                y: this.parsePixelValue(iconElement.style.top),
                iconOrder: index + 1
            })).filter((shortcut) => shortcut.id.length > 0);
        }

        buildDesktopIconRecord(iconElement, shortcutMap, iconOrder) {
            if (!iconElement) {
                return null;
            }

            const shortcutId = String(iconElement.dataset.desktopShortcutId || "").trim();
            if (shortcutId) {
                const shortcut = shortcutMap.get(shortcutId) || null;
                const label = shortcut?.label || this.getDesktopIconLabel(iconElement, "Raccourci");
                const image = shortcut?.image || iconElement.querySelector("img")?.getAttribute("src") || this.getShortcutTargetIcon(shortcut?.target || null);
                return {
                    iconKey: `shortcut:${shortcutId}`,
                    iconType: "shortcut",
                    fonctionnalite: `Ouvrir ${label}`,
                    label,
                    image,
                    appName: null,
                    shortcutId,
                    target: shortcut?.target || null,
                    x: this.parsePixelValue(iconElement.style.left),
                    y: this.parsePixelValue(iconElement.style.top),
                    iconOrder
                };
            }

            const appName = String(iconElement.dataset.desktopApp || "").trim();
            const definition = this.windowDefinitions[appName] || {};
            const label = this.getDesktopIconLabel(iconElement, definition.label || appName || "Icône");
            const image = iconElement.querySelector("img")?.getAttribute("src") || definition.icon || window.Win95Asset("assets/icons/document-1.png");

            return {
                iconKey: `app:${appName || label.toLowerCase().replace(/\s+/g, "-")}`,
                iconType: "app",
                fonctionnalite: definition.title ? `Ouvrir ${definition.title}` : `Ouvrir ${label}`,
                label,
                image,
                appName: appName || null,
                shortcutId: null,
                target: {
                    kind: "app",
                    appName: appName || null
                },
                x: this.parsePixelValue(iconElement.style.left),
                y: this.parsePixelValue(iconElement.style.top),
                iconOrder
            };
        }

        async saveDesktopState() {
            if (!this.desktopIconsContainer || !this.hasSession()) {
                return;
            }

            if (this.desktopStateSavePromise && typeof this.desktopStateSavePromise.then === "function") {
                await this.desktopStateSavePromise;
            }

            const userName = this.getCurrentUserPaths().userName;
            const userId = this.getCurrentUserPaths().userId;
            const icons = this.collectDesktopIconRecords();

            this.desktopStateSavePromise = Promise.resolve().then(() => {
                const storageKey = this.getDesktopStateStorageKey(userId);
                localStorage.setItem(storageKey, JSON.stringify({
                    userName,
                    updatedAt: new Date().toISOString(),
                    icons
                }));
            }).catch(() => null);

            await this.desktopStateSavePromise;
        }

        getDesktopStateStorageKey(userId) {
            return `${this.desktopStateStoragePrefix}.${String(userId || "invite")}`;
        }

        // --- Raccourcis du bureau ------------------------------------------------------------

        createDesktopShortcutFromPayload(payload, dropPosition) {
            const shortcut = {
                id: utils.createUniqueId("sc"),
                label: this.generateShortcutLabel(payload.name, this.collectDesktopShortcutRecords()),
                image: this.getShortcutTargetIcon(payload),
                createdAt: new Date().toISOString(),
                target: { ...payload }
            };

            this.addDesktopShortcutIcon(shortcut, dropPosition);
            this.showStatusMessage(`${shortcut.label} créé sur le bureau.`);
        }

        addDesktopShortcutIcon(shortcut, dropPosition) {
            const iconElement = this.createDesktopShortcutIcon(shortcut);
            this.desktopIconsContainer?.appendChild(iconElement);
            this.bindDesktopIconEvents(iconElement);
            this.desktopIcons.push(iconElement);
            this.placeDesktopIcon(iconElement, dropPosition);
            void this.saveDesktopState();
            return iconElement;
        }

        generateShortcutLabel(baseName, existingShortcuts) {
            return documentShortcuts.createShortcutLabel(baseName, (existingShortcuts || []).map((entry) => entry?.label).filter(Boolean));
        }

        getDesktopShortcutLabels() {
            return this.collectDesktopShortcutRecords().map((shortcut) => shortcut.label);
        }

        // Raccourci rangé dans Mes documents -> bureau (même cible, même nom si disponible).
        moveDocumentShortcutToDesktop(shortcutId, dropPosition) {
            const shortcut = documentShortcuts.remove(shortcutId);
            if (!shortcut) {
                return { ok: false, message: "Raccourci introuvable." };
            }

            this.addDesktopShortcutIcon({
                id: utils.createUniqueId("sc"),
                label: documentShortcuts.createUniqueLabel(shortcut.label, this.getDesktopShortcutLabels()),
                image: shortcut.image,
                createdAt: new Date().toISOString(),
                target: shortcut.target
            }, dropPosition);
            return { ok: true, message: `${shortcut.label} déplacé sur le bureau.` };
        }

        // Raccourci du bureau -> dossier de Mes documents affiché par un explorateur.
        moveDesktopShortcutToFolder(shortcutId, explorer) {
            const iconElement = this.getDesktopShortcutElement(shortcutId);
            const shortcut = iconElement?.__desktopShortcut;
            if (!iconElement || !shortcut) {
                return;
            }

            const label = this.getDesktopIconLabel(iconElement, "Raccourci");
            documentShortcuts.add({
                label,
                image: shortcut.image || this.getShortcutTargetIcon(shortcut.target),
                target: shortcut.target || null,
                folderPath: explorer.getCurrentAbsoluteFolderPath()
            });

            iconElement.remove();
            this.desktopIcons = this.desktopIcons.filter((currentIcon) => currentIcon !== iconElement);
            void this.saveDesktopState();
            explorer.statusElement.textContent = `${label} déplacé dans ce dossier.`;
        }

        createDesktopShortcutIcon(shortcut) {
            const iconElement = document.createElement("div");
            iconElement.className = "desktop-icon desktop-shortcut-icon";
            iconElement.dataset.desktopShortcutId = shortcut.id;
            iconElement.dataset.desktopApp = `desktop-shortcut:${shortcut.id}`;
            // Le déplacement est géré par pointer events (pas de drag HTML5, qui entrerait en conflit).
            iconElement.draggable = false;
            iconElement.title = shortcut.label;
            iconElement.__desktopShortcut = shortcut;

            const iconWrapper = document.createElement("span");
            iconWrapper.className = "desktop-shortcut-icon-wrap";

            const iconImage = document.createElement("img");
            iconImage.src = shortcut.image || this.getShortcutTargetIcon(shortcut.target);
            iconImage.alt = "";

            const overlayImage = document.createElement("img");
            overlayImage.className = "desktop-shortcut-overlay";
            overlayImage.src = window.Win95Asset("assets/icons/overlay_shortcut-0.png");
            overlayImage.alt = "Raccourci";

            const labelElement = document.createElement("span");
            labelElement.textContent = shortcut.label;

            iconWrapper.appendChild(iconImage);
            iconWrapper.appendChild(overlayImage);
            iconElement.appendChild(iconWrapper);
            iconElement.appendChild(labelElement);
            return iconElement;
        }

        // --- Corbeille ------------------------------------------------------------------------

        moveToRecycleBin(payload) {
            if (payload?.kind === "recycle-bin-item") {
                return { ok: false, message: "Cet élément est déjà dans la Corbeille." };
            }
            const provider = this.recycleProviders.find((candidate) => candidate.canMove?.(payload));
            if (provider) {
                return provider.moveToBin(payload, this);
            }
            if ((payload?.kind === "file" || payload?.kind === "folder") && payload.fileId) {
                return userFiles.trash(payload.fileId);
            }
            if (payload?.kind === "document-shortcut") {
                return this.moveDocumentShortcutToRecycleBin(payload.shortcutId);
            }
            return { ok: false, message: "Cet élément ne peut pas être supprimé ici." };
        }

        // Supprimer un raccourci ne supprime que le raccourci : la cible d'origine reste intacte.
        moveDocumentShortcutToRecycleBin(shortcutId) {
            const shortcut = documentShortcuts.remove(shortcutId);
            if (!shortcut) {
                return { ok: false, message: "Raccourci introuvable." };
            }

            recycleBin.add({
                id: `rb-${shortcut.id}`,
                kind: "document-shortcut",
                label: shortcut.label,
                sourceShortcutId: shortcut.id,
                sourceFolderPath: shortcut.folderPath,
                target: shortcut.target,
                icon: shortcut.image
            });
            return { ok: true, message: `${shortcut.label} déplacé dans la Corbeille.` };
        }

        moveDesktopShortcutToRecycleBin(shortcutId) {
            const iconElement = this.getDesktopShortcutElement(shortcutId);
            if (!iconElement) {
                this.showStatusMessage("Raccourci introuvable.");
                return;
            }

            const shortcut = iconElement.__desktopShortcut || {};
            const label = this.getDesktopIconLabel(iconElement, "Raccourci");
            recycleBin.add({
                id: `rb-${shortcutId}`,
                kind: "desktop-shortcut",
                label,
                sourceShortcutId: shortcutId,
                target: shortcut.target || null,
                icon: shortcut.image || this.getShortcutTargetIcon(shortcut.target)
            });

            iconElement.remove();
            this.desktopIcons = this.desktopIcons.filter((currentIcon) => currentIcon !== iconElement);
            void this.saveDesktopState();
            this.showStatusMessage(`${label} déplacé dans la Corbeille.`);
        }

        // Restaure un élément sorti de la Corbeille (dépôt sur le bureau ou dans un explorateur).
        restoreRecycleBinItem(item, dropPosition = null) {
            const provider = this.recycleProviders.find((candidate) => candidate.canRestore?.(item));
            if (provider) {
                return provider.restore(item, this, dropPosition);
            }
            if (item?.kind === "desktop-shortcut") {
                return this.restoreDesktopShortcut(item, dropPosition);
            }
            // Un fichier de Mes documents retourne toujours dans son dossier d'origine.
            if (item?.kind === "user-file") {
                return userFiles.restore(item.fileId);
            }
            if (item?.kind === "document-shortcut") {
                return this.restoreDocumentShortcut(item, dropPosition);
            }
            return { ok: false, message: `${item?.label || "Cet élément"} ne peut pas être restauré.` };
        }

        // Déposé sur le bureau : il y devient un raccourci ; sinon il retrouve son dossier d'origine.
        restoreDocumentShortcut(item, dropPosition) {
            const label = item.label || "Raccourci";
            const shortcut = {
                image: item.icon || this.getShortcutTargetIcon(item.target),
                target: item.target || null
            };

            if (dropPosition) {
                this.addDesktopShortcutIcon({
                    ...shortcut,
                    id: utils.createUniqueId("sc"),
                    label: documentShortcuts.createUniqueLabel(label, this.getDesktopShortcutLabels()),
                    createdAt: new Date().toISOString()
                }, dropPosition);
            } else {
                documentShortcuts.add({ ...shortcut, id: item.sourceShortcutId, label, folderPath: item.sourceFolderPath });
            }

            recycleBin.remove(item);
            return { ok: true, message: `${label} restauré${dropPosition ? " sur le bureau" : ""}.` };
        }

        restoreDesktopShortcut(item, dropPosition) {
            const shortcutId = item.sourceShortcutId || utils.createUniqueId("sc");
            if (!this.getDesktopShortcutElement(shortcutId)) {
                this.addDesktopShortcutIcon({
                    id: shortcutId,
                    label: item.label || "Raccourci",
                    image: item.icon || this.getShortcutTargetIcon(item.target),
                    createdAt: new Date().toISOString(),
                    target: item.target || null
                }, dropPosition);
            }

            recycleBin.remove(item);
            return { ok: true, message: `${item.label || "Raccourci"} restauré sur le bureau.` };
        }

        getShortcutTargetIcon(target) {
            const fallbackIcon = window.Win95Asset("assets/icons/document-1.png");
            if (!target || typeof target !== "object") {
                return fallbackIcon;
            }

            if (target.kind === "folder" || target.fileKind === "folder") {
                return window.Win95Asset("assets/icons/directory_closed-4.png");
            }

            if (typeof target.icon === "string" && target.icon.length > 0) {
                return target.icon;
            }

            return fallbackIcon;
        }

        placeDesktopIcon(iconElement, dropPosition) {
            const desktopRect = this.desktopIconsContainer?.getBoundingClientRect?.() || { left: 0, top: 0 };
            const preferredLeft = Math.max(0, Math.round((dropPosition?.x ?? 0) - desktopRect.left - 38));
            const preferredTop = Math.max(0, Math.round((dropPosition?.y ?? 0) - desktopRect.top - 16));

            this.setIconPosition(iconElement, preferredLeft, preferredTop);

            const snapped = this.getSnappedDesktopIconPosition(iconElement);
            const freeCell = this.findFirstAvailableDesktopCell(snapped.left, snapped.top, iconElement);
            this.setIconPosition(iconElement, freeCell.left, freeCell.top);
        }

        findFirstAvailableDesktopCell(startLeft, startTop, movingElement) {
            const maxColumns = this.getDesktopGridColumns();
            const maxRows = this.getDesktopGridRowsPerColumn();
            const startColumn = Math.max(0, Math.round((startLeft - this.desktopGrid.offsetX) / this.desktopGrid.x));
            const startRow = Math.max(0, Math.round((startTop - this.desktopGrid.offsetY) / this.desktopGrid.y));
            const totalCells = Math.max(1, maxColumns * maxRows);

            for (let offset = 0; offset < totalCells; offset += 1) {
                const index = (startColumn * maxRows + startRow + offset) % totalCells;
                const col = Math.floor(index / maxRows);
                const row = index % maxRows;
                const left = this.desktopGrid.offsetX + col * this.desktopGrid.x;
                const top = this.desktopGrid.offsetY + row * this.desktopGrid.y;

                if (!this.isDesktopCellOccupied(left, top, movingElement)) {
                    return { left, top };
                }
            }

            return { left: startLeft, top: startTop };
        }

        openDesktopShortcut(shortcutId) {
            const target = this.getDesktopShortcutElement(shortcutId)?.__desktopShortcut?.target;
            if (!target) {
                this.showStatusMessage("Raccourci introuvable.");
                return;
            }

            this.openShortcutTarget(target);
        }

        openShortcutTarget(target) {
            if (!target || typeof target !== "object") {
                this.showStatusMessage("Cible du raccourci invalide.");
                return;
            }

            const opener = this.shortcutOpeners[target.source];
            if (opener) {
                Promise.resolve(opener(target, this)).then((result) => this.showStatusMessage(result?.message));
                return;
            }

            if (target.kind === "folder" || target.fileKind === "folder") {
                this.openShortcutFolder(target);
                return;
            }

            if (target.fileId) {
                Promise.resolve(userFiles.openFile(target.fileId)).then((result) => this.showStatusMessage(result.message));
                return;
            }

            // Raccourci vers un ancien fichier local (dossier Simulation supprimé).
            this.showStatusMessage(`${target.name || "Ce raccourci"} pointe vers un fichier qui n'existe plus.`);
        }

        openShortcutFolder(target) {
            const folderPath = String(target.folderPath || target.relativePath || "");
            if (!folderPath) {
                this.showStatusMessage("Chemin du dossier introuvable.");
                return;
            }

            const windowElement = this.openApp("internet-explorer", {
                forceNew: true,
                explorerRootName: target.name || "Dossier",
                explorerRootPath: folderPath,
                windowTitle: target.name || "Dossier"
            });

            if (windowElement) {
                this.showStatusMessage(`${target.name || "Dossier"} ouvert dans un nouvel explorateur.`);
                return;
            }

            this.showStatusMessage(`Impossible d'ouvrir ${target.name || "ce dossier"} depuis ce raccourci.`);
        }

        positionDesktopIconsInGrid() {
            const rowsPerColumn = this.getDesktopGridRowsPerColumn();
            this.desktopIcons.forEach((iconElement, index) => {
                const col = Math.floor(index / rowsPerColumn);
                const row = index % rowsPerColumn;
                const left = this.desktopGrid.offsetX + col * this.desktopGrid.x;
                const top = this.desktopGrid.offsetY + row * this.desktopGrid.y;

                iconElement.style.position = "absolute";
                iconElement.style.left = `${left}px`;
                iconElement.style.top = `${top}px`;
            });
        }

        getSnappedDesktopIconPosition(iconElement) {
            const left = this.parsePixelValue(iconElement.style.left);
            const top = this.parsePixelValue(iconElement.style.top);
            const bounds = this.getDesktopIconBounds();
            const maxColumns = this.getDesktopGridColumns();
            const maxRows = this.getDesktopGridRowsPerColumn();
            const snappedLeft = this.clamp(this.snapToGrid(left, this.desktopGrid.offsetX, this.desktopGrid.x), this.desktopGrid.offsetX, this.desktopGrid.offsetX + (Math.max(0, maxColumns - 1) * this.desktopGrid.x));
            const snappedTop = this.clamp(this.snapToGrid(top, this.desktopGrid.offsetY, this.desktopGrid.y), this.desktopGrid.offsetY, this.desktopGrid.offsetY + (Math.max(0, maxRows - 1) * this.desktopGrid.y));

            return {
                left: this.clamp(snappedLeft, 0, bounds.maxLeft),
                top: this.clamp(snappedTop, 0, bounds.maxTop)
            };
        }

        getDesktopIconLayoutKey(iconElement) {
            if (iconElement?.dataset?.desktopShortcutId) {
                return `shortcut:${iconElement.dataset.desktopShortcutId}`;
            }

            return `app:${iconElement?.dataset?.desktopApp || iconElement.querySelector("span")?.textContent?.trim() || "desktop-icon"}`;
        }

        getDesktopIconBounds() {
            const desktop = document.querySelector(".desktop");
            if (!desktop) {
                return { maxLeft: 0, maxTop: 0 };
            }

            const desktopRect = desktop.getBoundingClientRect();
            const taskbar = document.querySelector(".taskbar");
            const taskbarHeight = taskbar ? taskbar.offsetHeight : 36;
            return {
                maxLeft: Math.max(0, Math.floor(desktopRect.width - 96)),
                maxTop: Math.max(0, Math.floor(desktopRect.height - taskbarHeight - 72))
            };
        }

        getDesktopGridRowsPerColumn() {
            const bounds = this.getDesktopIconBounds();
            return Math.max(1, Math.floor((bounds.maxTop - this.desktopGrid.offsetY) / this.desktopGrid.y) + 1);
        }

        getDesktopGridColumns() {
            const bounds = this.getDesktopIconBounds();
            return Math.max(1, Math.floor((bounds.maxLeft - this.desktopGrid.offsetX) / this.desktopGrid.x) + 1);
        }

        isDesktopCellOccupied(left, top, movingElement) {
            const targetKey = this.getDesktopCellKey(left, top);
            return this.desktopIcons.some((iconElement) => {
                if (iconElement === movingElement) {
                    return false;
                }

                const occupiedKey = this.getDesktopCellKey(
                    this.parsePixelValue(iconElement.style.left),
                    this.parsePixelValue(iconElement.style.top)
                );

                return occupiedKey === targetKey;
            });
        }

        getDesktopCellKey(left, top) {
            return `${this.parsePixelValue(left)}:${this.parsePixelValue(top)}`;
        }

        snapToGrid(value, offset, step) {
            return Math.round((value - offset) / step) * step + offset;
        }

        parsePixelValue(value) {
            const parsed = Number.parseInt(value || "0", 10);
            return Number.isFinite(parsed) ? parsed : 0;
        }

        clamp(value, minimum, maximum) {
            return Math.min(maximum, Math.max(minimum, value));
        }

        openApp(appName, options = {}) {
            const definition = this.windowDefinitions[appName];
            if (definition?.kind === "placeholder") {
                this.showStatusMessage(`${definition.label} n'est pas encore disponible.`);
                return null;
            }

            if (!this.canOpen(appName)) {
                void window.Win95Dialog?.error({
                    title: definition?.label || appName,
                    message: `Accès refusé : ${definition?.label || appName} n'est pas disponible pour ce compte.`
                });
                return null;
            }

            const forceNew = options && options.forceNew === true;
            let windowElement = forceNew ? null : this.getWindow(appName);

            const isNewWindow = !windowElement;
            if (!windowElement) {
                windowElement = this.createWindow(appName, options);
            }

            if (!windowElement) {
                return null;
            }

            this.ensureTaskbarButton(windowElement);
            this.showWindow(windowElement);
            if (isNewWindow) {
                window.Win95Sounds?.play("open-program");
            }
            return windowElement;
        }

        // Identifiant unique d'une fenêtre (plusieurs fenêtres d'une même application : fiches, Bloc-notes...).
        getWindowId(windowElement) {
            if (!windowElement.dataset.windowId) {
                this.windowIdCounter = (this.windowIdCounter || 0) + 1;
                windowElement.dataset.windowId = `window-${this.windowIdCounter}`;
            }
            return windowElement.dataset.windowId;
        }

        getWindowTaskbarButton(windowElement) {
            if (!windowElement?.dataset.windowId) {
                return null;
            }
            return document.querySelector(`${this.taskbarSelector}[data-taskbar-window="${windowElement.dataset.windowId}"]`);
        }

        // Titre affiché par la fenêtre (barre de titre), sinon le nom de l'application.
        getWindowTitle(windowElement) {
            const definition = this.windowDefinitions[windowElement.dataset.windowApp] || {};
            return windowElement.querySelector(".title-bar-text")?.textContent?.trim() || definition.label || "Fenêtre";
        }

        // Barre des tâches : un bouton par fenêtre, avec l'icône de l'application et le titre de la fenêtre
        // (suivi en direct : "Tourelle.txt - Bloc-notes", "Poste de travail"...). Info-bulle = titre complet.
        ensureTaskbarButton(windowElement) {
            let button = this.getWindowTaskbarButton(windowElement);
            if (button) {
                return button;
            }

            const appName = windowElement.dataset.windowApp;
            const definition = this.windowDefinitions[appName];
            const taskbarLeft = document.querySelector(".taskbar-left");
            if (!definition || !taskbarLeft) {
                return null;
            }

            button = document.createElement("button");
            button.type = "button";
            button.className = "btn task-btn";
            button.dataset.taskbarApp = appName;
            button.dataset.taskbarWindow = this.getWindowId(windowElement);
            const icon = document.createElement("img");
            icon.src = definition.icon;
            icon.alt = "";
            const label = document.createElement("span");
            label.className = "task-btn-label";
            button.append(icon, label);
            button.addEventListener("click", this.boundHandleTaskbarClick);

            const updateLabel = () => {
                const title = this.getWindowTitle(windowElement);
                label.textContent = title;
                button.title = title;
                button.setAttribute("aria-label", title);
            };
            updateLabel();
            const titleElement = windowElement.querySelector(".title-bar-text");
            if (titleElement) {
                windowElement.__win95TaskbarObserver = new MutationObserver(updateLabel);
                windowElement.__win95TaskbarObserver.observe(titleElement, { childList: true, characterData: true, subtree: true });
            }

            taskbarLeft.appendChild(button);
            this.taskbarButtons.push(button);
            return button;
        }

        // --- Construction des fenêtres ---------------------------------------------------------

        createWindow(appName, options = {}) {
            const definition = this.windowDefinitions[appName];
            if (!definition) {
                return null;
            }

            const userPaths = this.getCurrentUserPaths();

            // Application enregistrée par un projet (registerApp) : sa fabrique prime sur les applications intégrées.
            if (this.factories[appName]) {
                return this.factories[appName](this, options, definition, userPaths);
            }

            switch (appName) {
                case "internet-explorer":
                    return this.createExplorerWindow(appName, {
                        title: options.windowTitle || definition.title,
                        ariaLabel: "Fenêtre dossier",
                        rootName: options.explorerRootName || "Mes documents",
                        rootPath: options.explorerRootPath || userPaths.documentsRelativePath,
                        addressValue: userPaths.documentsDisplayPath
                    });
                case "recycle-bin":
                    return this.createExplorerWindow(appName, {
                        title: "Corbeille",
                        ariaLabel: "Corbeille",
                        explorerLabel: "Corbeille Windows 95",
                        rootName: "Corbeille",
                        rootPath: userPaths.recycleBinRelativePath,
                        emptyMessage: "La Corbeille est vide.",
                        addressLabel: "Chemin de la corbeille",
                        addressValue: userPaths.recycleBinDisplayPath,
                        listLabel: "Contenu de la corbeille",
                        isRecycleBin: true
                    });
                case "user-manager":
                    return this.mountWindow(this.createWindowElement(appName, {
                        title: definition.title,
                        ariaLabel: "Gestion des utilisateurs",
                        bodyHtml: `<div class="window-body user-manager-body" data-user-manager></div>`
                    }), { width: "660px", height: "480px", attach: (element) => window.Win95UserManager?.attach?.(element) });
                case "calculator":
                    return this.createToolWindow(appName, definition, { width: "270px", height: "290px", attach: (element) => window.Win95Calculator?.attach?.(element) });
                case "clock":
                    return this.createToolWindow(appName, definition, { width: "260px", height: "300px", attach: (element) => window.Win95ClockApp?.attach?.(element) });
                case "charmap":
                    return this.createToolWindow(appName, definition, { width: "480px", height: "400px", attach: (element) => window.Win95CharMap?.attach?.(element) });
                case "local-link":
                    return this.createToolWindow(appName, definition, { width: "340px", height: "500px", attach: (element) => window.Win95LocalLinkApp?.attach?.(element) });
                case "minesweeper":
                    return this.createToolWindow(appName, definition, { width: "180px", height: "280px", attach: (element) => window.Win95Minesweeper?.attach?.(element) });
                case "solitaire":
                    return this.createToolWindow(appName, definition, { width: "640px", height: "520px", attach: (element) => window.Win95Solitaire?.attach?.(element) });
                case "freecell":
                    return this.createToolWindow(appName, definition, { width: "680px", height: "520px", attach: (element) => window.Win95FreeCell?.attach?.(element) });
                case "hearts":
                    return this.createToolWindow(appName, definition, { width: "700px", height: "560px", attach: (element) => window.Win95Hearts?.attach?.(element) });
                case "control-panel":
                    return this.mountWindow(this.createWindowElement(appName, {
                        title: definition.title,
                        ariaLabel: "Panneau de configuration",
                        bodyHtml: `
                            <div class="window-body window-content control-panel-body">
                                <div class="explorer" aria-label="Panneau de configuration">
                                    <div class="explorer-menu-bar"><span>Fichier</span><span>Édition</span><span>Affichage</span><span>Aide</span></div>
                                    <section class="explorer-list windows-scrollbar" data-control-panel-list aria-label="Applets du Panneau de configuration"></section>
                                    <div class="explorer-status" data-control-panel-status>Prêt</div>
                                </div>
                            </div>`
                    }), { width: "520px", height: "340px", attach: (element) => window.Win95ControlPanel?.attach?.(element) });
                case "display-properties":
                    return this.createAppletWindow(appName, definition, { width: "440px", height: "560px", attach: (element) => window.Win95DisplayProperties?.attach?.(element) });
                case "date-time":
                    return this.createAppletWindow(appName, definition, { width: "430px", height: "400px", attach: (element) => window.Win95DateTime?.attach?.(element) });
                case "mouse":
                    return this.createAppletWindow(appName, definition, { width: "400px", height: "390px", attach: (element) => window.Win95MouseProperties?.attach?.(element) });
                case "sounds":
                    return this.createAppletWindow(appName, definition, { width: "400px", height: "480px", attach: (element) => window.Win95SoundProperties?.attach?.(element) });
                case "system-properties":
                    return this.createAppletWindow(appName, definition, { width: "500px", height: "440px", attach: (element) => window.Win95SystemProperties?.attach?.(element) });
                case "add-remove-programs":
                    return this.createAppletWindow(appName, definition, { width: "500px", height: "510px", attach: (element) => window.Win95AddRemove?.attach?.(element) });
                case "image-viewer":
                    return this.mountWindow(this.createWindowElement(appName, {
                        className: "window mini-window image-viewer-window",
                        title: definition.title,
                        titleAttribute: "data-image-viewer-title",
                        ariaLabel: "Lecteur d'image",
                        withResizeHandle: false,
                        bodyHtml: `
                            <div class="window-body image-viewer-body" data-image-viewer>
                                <div class="image-viewer-toolbar">
                                    <button class="btn explorer-btn small-label" data-image-prev type="button">Précédent</button>
                                    <button class="btn explorer-btn small-label" data-image-next type="button">Suivant</button>
                                    <div class="image-viewer-status" data-image-status>0 / 0</div>
                                </div>
                                <div class="image-viewer-canvas">
                                    <img data-image-current alt="Image courante" hidden>
                                    <span class="image-viewer-empty" data-image-empty>Aucune image ouverte. Double-cliquez sur une image dans Mes documents.</span>
                                </div>
                                <div class="explorer-status" data-image-caption>Aucune image</div>
                            </div>`
                    }), { width: "360px", height: "300px", attach: (element) => window.Win95ImageViewer?.attach?.(element) });
                case "notepad":
                    return this.mountWindow(this.createWindowElement(appName, {
                        className: "window desktop-window notepad-window",
                        title: definition.title,
                        titleAttribute: "data-notepad-title",
                        ariaLabel: "Bloc-notes",
                        bodyHtml: `
                            <div class="window-body notepad-body" data-notepad>
                                <div class="notepad-menu-bar">
                                    <span>Fichier</span>
                                    <button type="button" class="notepad-menu-action" data-notepad-save hidden>Enregistrer</button>
                                    <span>Édition</span>
                                    <span>Rechercher</span>
                                    <span>Aide</span>
                                </div>
                                <textarea class="form-95 notepad-editor windows-scrollbar" data-notepad-editor spellcheck="false" wrap="soft" aria-label="Contenu du fichier"></textarea>
                                <div class="notepad-status" data-notepad-status>Prêt</div>
                            </div>`
                    }), { width: "520px", height: "380px", attach: (element) => window.Win95Notepad?.attach?.(element) });
                case "paint":
                    return this.mountWindow(this.createWindowElement(appName, {
                        className: "window desktop-window paint-window",
                        title: definition.title,
                        titleAttribute: "data-paint-title",
                        ariaLabel: "Paint",
                        bodyHtml: `<div class="window-body paint-body" data-paint></div>`
                    }), { width: "720px", height: "520px", attach: (element) => window.Win95Paint?.attach?.(element) });
                case "audio-player":
                    return this.createToolWindow(appName, definition, { width: "408px", height: "420px", attach: (element) => window.Win95MediaPlayer?.attach?.(element) });
                default:
                    return null;
            }
        }

        // Accessoire ou jeu à taille fixe (le jeu ajuste lui-même la fenêtre : voir Win95Utils.fitWindow) : pas d'agrandissement.
        createToolWindow(appName, definition, { width, height, attach }) {
            return this.mountWindow(this.createWindowElement(appName, {
                className: "window desktop-window app-fixed-window",
                title: definition.title,
                ariaLabel: definition.label,
                withResizeHandle: false,
                bodyHtml: `<div class="window-body app-body" data-app-body></div>`
            }), { width, height, attach });
        }

        // Applet du Panneau de configuration : feuille de propriétés (pas de réduction ni d'agrandissement).
        createAppletWindow(appName, definition, { width, height, attach }) {
            return this.mountWindow(this.createWindowElement(appName, {
                className: "window mini-window property-window",
                title: definition.title,
                ariaLabel: definition.label,
                withResizeHandle: false,
                bodyHtml: `<div class="window-body property-body" data-applet></div>`
            }), { width, height, attach });
        }

        createExplorerWindow(appName, config) {
            const windowElement = this.createWindowElement(appName, {
                title: config.title,
                titleAttribute: "data-explorer-title",
                ariaLabel: config.ariaLabel,
                dataset: {
                    fileExplorer: "",
                    explorerRootName: config.rootName,
                    explorerRootPath: config.rootPath,
                    explorerEmptyMessage: config.emptyMessage || "Ce dossier est vide.",
                    ...(config.space ? { explorerSpace: config.space } : {})
                },
                bodyHtml: this.renderExplorerBody({
                    prefix: "explorer",
                    explorerLabel: config.explorerLabel,
                    addressLabel: config.addressLabel,
                    addressValue: config.addressValue,
                    listLabel: config.listLabel,
                    // Boutons affichés selon le contexte par l'explorateur (Mes documents / Corbeille).
                    extraToolbarButtons: `
                        <button class="btn explorer-btn small-label" data-explorer-upload type="button" hidden>Importer</button>
                        <button class="btn explorer-btn small-label" data-explorer-new-folder type="button" hidden>Nouveau dossier</button>
                        <button class="btn explorer-btn small-label" data-explorer-empty-bin type="button" hidden>Vider la Corbeille</button>`,
                    isRecycleBinDropzone: config.isRecycleBin
                })
            });

            this.mountWindow(windowElement, {
                width: config.width,
                height: config.height,
                attach: (element) => window.Win95FileExplorer?.attach?.(element)
            });

            if (config.isRecycleBin) {
                this.bindRecycleBinDropTargets();
            }
            return windowElement;
        }

        createWindowElement(appName, { className = "window desktop-window", title, titleAttribute = "", ariaLabel, dataset = {}, bodyHtml, withResizeHandle = true }) {
            const windowElement = document.createElement("section");
            windowElement.className = className;
            windowElement.dataset.windowComponent = "";
            windowElement.dataset.windowApp = appName;
            Object.assign(windowElement.dataset, dataset);
            windowElement.setAttribute("aria-label", ariaLabel);
            windowElement.innerHTML = `
                <div class="title-bar active window-title-bar" data-window-drag>
                    <div class="title-bar-text" ${titleAttribute}>${utils.escapeHtml(title)}</div>
                    <div class="title-bar-controls">
                        <button aria-label="Réduire" title="Réduire" data-window-action="minimize">_</button>
                        <button aria-label="Agrandir" title="Agrandir" data-window-action="maximize">□</button>
                        <button aria-label="Fermer" title="Fermer" data-window-action="close">×</button>
                    </div>
                </div>
                ${bodyHtml}
                ${withResizeHandle ? `<div class="window-resize-bottom" data-window-resize-bottom aria-hidden="true"></div>` : ""}
            `;
            return windowElement;
        }

        // Corps d'explorateur partagé par les explorateurs de fichiers (prefix "explorer").
        renderExplorerBody({ prefix, explorerLabel = "Explorateur de fichiers Windows 95", addressLabel = "Chemin du dossier", addressValue, listLabel = "Contenu du dossier", extraToolbarButtons = "", isRecycleBinDropzone = false }) {
            return `
                <div class="window-body window-content">
                    <div class="explorer" aria-label="${utils.escapeHtml(explorerLabel)}"${isRecycleBinDropzone ? " data-recycle-bin-dropzone" : ""}>
                        <div class="explorer-menu-bar">
                            <span>Fichier</span>
                            <span>Édition</span>
                            <span>Affichage</span>
                            <span>Aller à</span>
                            <span>Favoris</span>
                            <span>Aide</span>
                        </div>
                        <div class="explorer-toolbar">
                            <button class="btn explorer-btn small-label" data-${prefix}-back type="button" aria-label="Précédent">Précédent</button>
                            <button class="btn explorer-btn small-label" data-${prefix}-up type="button" aria-label="Dossier parent" title="Dossier parent">Parent</button>
                            <button class="btn explorer-btn small-label" data-${prefix}-refresh type="button">Actualiser</button>
                            ${extraToolbarButtons}
                            <input class="form-95 explorer-address" data-${prefix}-address type="text" readonly aria-label="${utils.escapeHtml(addressLabel)}" value="${utils.escapeHtml(addressValue)}">
                        </div>
                        <div class="explorer-layout">
                            <aside class="explorer-tree windows-scrollbar" data-${prefix}-tree aria-label="Arborescence"></aside>
                            <section class="explorer-list windows-scrollbar" data-${prefix}-list aria-label="${utils.escapeHtml(listLabel)}"></section>
                        </div>
                        <div class="explorer-status" data-${prefix}-status>Prêt</div>
                    </div>
                </div>`;
        }

        mountWindow(windowElement, { width, height, attach } = {}) {
            document.querySelector(".desktop")?.appendChild(windowElement);
            // Taille par défaut avant l'attache : un composant peut ensuite l'ajuster à son contenu (Win95Utils.fitWindow).
            if (width) {
                windowElement.style.width = width;
            }
            if (height) {
                windowElement.style.height = height;
            }
            attach?.(windowElement);
            window.Win95WindowComponent?.attach?.(windowElement);

            this.windows.push(windowElement);
            this.setInitialWindowPosition(windowElement);
            return windowElement;
        }

        getCurrentUserPaths() {
            const userName = utils.getCurrentUserName();
            return {
                userName,
                userId: utils.getCurrentUserId(),
                documentsRelativePath: utils.getUserDocumentsPath(),
                recycleBinRelativePath: `Utilisateurs/${userName}/Corbeille`,
                documentsDisplayPath: `C:\\Utilisateurs\\${userName}\\Mes documents`,
                recycleBinDisplayPath: `C:\\Utilisateurs\\${userName}\\Corbeille`
            };
        }

        setInitialWindowPosition(windowElement) {
            if (!windowElement.style.width) {
                windowElement.style.width = "560px";
            }
            if (!windowElement.style.height) {
                windowElement.style.height = "360px";
            }

            this.centerWindow(windowElement);
            this.applyCascadedWindowOffset(windowElement);

            if (!windowElement.style.zIndex) {
                windowElement.style.zIndex = String(this.zIndexBase + this.windows.length + 1);
            }
        }

        applyCascadedWindowOffset(windowElement) {
            const desktop = document.querySelector(".desktop");
            if (!desktop) {
                return;
            }

            const referenceWindow = this.getCascadeReferenceWindow(windowElement);
            if (!referenceWindow) {
                return;
            }

            const referenceLeft = this.parsePixelValue(referenceWindow.style.left || `${referenceWindow.offsetLeft}px`);
            const referenceTop = this.parsePixelValue(referenceWindow.style.top || `${referenceWindow.offsetTop}px`);

            const taskbar = document.querySelector(".taskbar");
            const desktopRect = desktop.getBoundingClientRect();
            const taskbarHeight = taskbar ? taskbar.offsetHeight : 36;

            const windowWidth = windowElement.offsetWidth || this.parsePixelValue(windowElement.style.width) || 560;
            const windowHeight = windowElement.offsetHeight || this.parsePixelValue(windowElement.style.height) || 360;

            const maxLeft = Math.max(0, Math.floor(desktopRect.width - windowWidth));
            const maxTop = Math.max(0, Math.floor(desktopRect.height - taskbarHeight - windowHeight));

            let nextLeft = referenceLeft + this.windowCascadeOffset.x;
            let nextTop = referenceTop + this.windowCascadeOffset.y;

            if (nextLeft > maxLeft || nextTop > maxTop) {
                const centeredLeft = this.parsePixelValue(windowElement.style.left || "0px");
                const centeredTop = this.parsePixelValue(windowElement.style.top || "0px");
                nextLeft = centeredLeft;
                nextTop = centeredTop;
            }

            windowElement.style.left = `${this.clamp(nextLeft, 0, maxLeft)}px`;
            windowElement.style.top = `${this.clamp(nextTop, 0, maxTop)}px`;
        }

        getCascadeReferenceWindow(excludeWindow) {
            const visibleWindows = this.windows.filter((windowElement) => (
                windowElement
                && windowElement !== excludeWindow
                && !windowElement.classList.contains("is-hidden")
            ));

            if (visibleWindows.length === 0) {
                return null;
            }

            if (
                this.activeWindow
                && this.activeWindow !== excludeWindow
                && !this.activeWindow.classList.contains("is-hidden")
            ) {
                return this.activeWindow;
            }

            return visibleWindows
                .slice()
                .sort((leftWindow, rightWindow) => {
                    const leftZ = this.parsePixelValue(leftWindow.style.zIndex || "0");
                    const rightZ = this.parsePixelValue(rightWindow.style.zIndex || "0");
                    return rightZ - leftZ;
                })[0];
        }

        centerWindow(windowElement) {
            const desktop = document.querySelector(".desktop");
            if (!desktop) {
                windowElement.style.left = "0px";
                windowElement.style.top = "0px";
                return;
            }

            const taskbar = document.querySelector(".taskbar");
            const desktopRect = desktop.getBoundingClientRect();
            const taskbarHeight = taskbar ? taskbar.offsetHeight : 0;
            const availableWidth = Math.max(0, desktopRect.width);
            const availableHeight = Math.max(0, desktopRect.height - taskbarHeight);
            const windowWidth = windowElement.offsetWidth || parseInt(windowElement.style.width, 10) || 560;
            const windowHeight = windowElement.offsetHeight || parseInt(windowElement.style.height, 10) || 360;

            const centeredLeft = Math.max(0, Math.round((availableWidth - windowWidth) / 2));
            const centeredTop = Math.max(0, Math.round((availableHeight - windowHeight) / 2));

            windowElement.style.left = `${centeredLeft}px`;
            windowElement.style.top = `${centeredTop}px`;
        }

        handleDocumentClick(event) {
            const controlButton = event.target.closest("[data-window-action]");
            if (!controlButton) {
                return;
            }

            const windowElement = controlButton.closest(this.windowSelector);
            if (!windowElement) {
                return;
            }

            const action = controlButton.dataset.windowAction;
            event.preventDefault();
            event.stopPropagation();

            if (action === "minimize") {
                this.hideWindow(windowElement);
                return;
            }

            if (action === "close") {
                this.closeWindow(windowElement);
                return;
            }

            if (action === "maximize") {
                this.toggleMaximize(windowElement);
            }
        }

        handleWindowFocus(event) {
            const windowElement = event.target.closest(this.windowSelector);
            if (!windowElement) {
                return;
            }

            this.showWindow(windowElement);
        }

        handleDocumentPointerDown(event) {
            if (!this.startMenuOpen) {
                return;
            }

            const target = event.target;
            if (!target.closest(".start-btn") && !target.closest("[data-start-menu]")) {
                this.closeStartMenu();
            }
        }

        handleStartButtonClick(event) {
            event.preventDefault();
            event.stopPropagation();

            if (this.startMenuOpen) {
                this.closeStartMenu();
                return;
            }

            this.openStartMenu();
        }

        handleStartMenuClick(event) {
            const actionTarget = event.target.closest("[data-start-action]");
            if (!actionTarget) {
                return;
            }

            event.preventDefault();
            const action = actionTarget.dataset.startAction;
            window.Win95Sounds?.play("menu-command");

            if (action === "toggle") {
                this.closeStartMenu();
                return;
            }

            if (action === "logout") {
                this.closeStartMenu();
                this.openLogoutModal();
                return;
            }

            if (action === "open-app") {
                const appName = actionTarget.dataset.appName;
                if (appName) {
                    this.openApp(appName);
                }
                this.closeStartMenu();
            }
        }

        ensureStartMenu() {
            let menu = document.querySelector("[data-start-menu]");
            if (menu) {
                return menu;
            }

            const taskbar = document.querySelector(".taskbar");
            if (!taskbar) {
                return null;
            }

            menu = document.createElement("div");
            menu.className = "start-menu is-hidden";
            menu.dataset.startMenu = "";
            menu.innerHTML = `
                <div class="start-menu-banner">
                    <div class="start-menu-banner-text">Windows 95</div>
                </div>
                <div class="start-menu-items">${this.renderStartMenuItems(this.startMenuTree)}</div>
            `;

            taskbar.appendChild(menu);
            return menu;
        }

        // Éléments du menu Démarrer (récursif : un sous-menu s'ouvre au survol, à droite de son parent).
        renderStartMenuItems(entries) {
            return entries.map((entry) => {
                if (entry.separator) {
                    return '<div class="start-menu-separator"></div>';
                }
                if (entry.items) {
                    return `
                        <div class="start-menu-group">
                            <button type="button" class="start-menu-item has-submenu" aria-haspopup="menu">
                                <img src="${entry.icon}" alt="">
                                <span>${utils.escapeHtml(entry.label)}</span>
                            </button>
                            <div class="start-submenu" role="menu">${this.renderStartMenuItems(entry.items)}</div>
                        </div>`;
                }
                if (entry.action) {
                    return `
                        <button type="button" class="start-menu-item" data-start-action="${entry.action}">
                            <img src="${entry.icon}" alt="">
                            <span>${utils.escapeHtml(entry.label)}</span>
                        </button>`;
                }
                const definition = this.windowDefinitions[entry.app] || {};
                return `
                    <button type="button" class="start-menu-item" data-start-action="open-app" data-app-name="${entry.app}">
                        <img src="${definition.icon || window.Win95Asset("assets/icons/document-1.png")}" alt="">
                        <span>${utils.escapeHtml(entry.menuLabel || definition.label || entry.app)}</span>
                    </button>`;
            }).join("");
        }

        openStartMenu() {
            if (!this.startMenu) {
                return;
            }

            this.startMenu.classList.remove("is-hidden");
            this.startButton?.classList.add("active");
            this.startMenuOpen = true;
        }

        closeStartMenu() {
            if (!this.startMenu) {
                return;
            }

            this.startMenu.classList.add("is-hidden");
            this.startButton?.classList.remove("active");
            this.startMenuOpen = false;
        }

        ensureLogoutModal() {
            let modal = document.querySelector("[data-logout-modal]");
            if (modal) {
                this.attachLogoutModalListener(modal);
                return modal;
            }

            modal = document.createElement("div");
            modal.className = "modal logout-modal is-hidden";
            modal.dataset.logoutModal = "";
            modal.innerHTML = `
                <div class="modal-dialog logout-modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Arrêt de Windows</h5>
                            <button type="button" class="btn" data-logout-action="cancel" aria-label="Fermer">
                                <span aria-hidden="true">×</span>
                            </button>
                        </div>
                        <div class="modal-body logout-modal-body">
                            <p>Que voulez-vous que l'ordinateur fasse ?</p>
                        </div>
                        <div class="modal-footer logout-modal-footer">
                            <button type="button" class="btn start-btn" data-logout-action="cancel">Annuler</button>
                            <button type="button" class="btn start-btn" data-logout-action="confirm">Arrêter</button>
                            <button type="button" class="btn start-btn" data-logout-action="restart">Redémarrer</button>
                            <button type="button" class="btn start-btn" data-logout-action="disconnect">Fermer la session</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            this.attachLogoutModalListener(modal);
            return modal;
        }

        attachLogoutModalListener(modal) {
            if (!modal) {
                return;
            }

            if (!this.boundHandleLogoutModalClick) {
                this.boundHandleLogoutModalClick = this.handleLogoutModalClick.bind(this);
            }

            if (!modal.dataset.logoutListenerAttached) {
                modal.addEventListener("click", this.boundHandleLogoutModalClick);
                modal.dataset.logoutListenerAttached = "true";
            }
        }

        openLogoutModal() {
            this.logoutModal = this.ensureLogoutModal();
            if (!this.logoutModal) {
                return;
            }

            this.logoutModal.classList.remove("is-hidden");
            this.logoutModal.classList.add("show");
            this.logoutModal.style.display = "flex";
        }

        closeLogoutModal() {
            if (!this.logoutModal) {
                this.logoutModal = document.querySelector("[data-logout-modal]");
            }

            if (!this.logoutModal) {
                return;
            }

            this.logoutModal.classList.add("is-hidden");
            this.logoutModal.classList.remove("show");
            this.logoutModal.style.display = "none";
        }

        handleLogoutModalClick(event) {
            const actionButton = event.target.closest("[data-logout-action]");
            if (!actionButton) {
                return;
            }

            const action = actionButton.dataset.logoutAction;

            if (action === "cancel") {
                this.closeLogoutModal();
                return;
            }

            if (action === "confirm") {
                this.confirmLogout();
                return;
            }

            if (action === "restart") {
                window.Win95Sounds?.play("windows-exit");
                location.reload();
                return;
            }

            if (action === "disconnect") {
                this.disconnectUserSession();
                return;
            }
        }

        // Ferme la session : retour à l'écran d'ouverture de session.
        disconnectUserSession() {
            this.closeLogoutModal();
            this.closeStartMenu();
            window.Win95Security?.logout();
        }

        // Écran « Vous pouvez maintenant éteindre l'ordinateur » ; un clic relance le bureau.
        confirmLogout() {
            window.Win95Sounds?.play("windows-exit");
            this.closeLogoutModal();
            this.closeStartMenu();
            [...this.windows].forEach((windowElement) => this.closeWindow(windowElement));

            const screen = document.createElement("div");
            screen.className = "shutdown-screen";
            screen.innerHTML = "<p>Vous pouvez maintenant éteindre l'ordinateur.</p><p class=\"shutdown-hint\">Cliquez pour redémarrer.</p>";
            screen.addEventListener("click", () => location.reload());
            document.body.appendChild(screen);
        }

        showStatusMessage(message) {
            if (!message) {
                return;
            }

            const primaryWindow = this.activeWindow || this.getWindow("internet-explorer") || this.windows[0];
            const statusTarget = primaryWindow?.querySelector(STATUS_BAR_SELECTOR);
            if (statusTarget) {
                statusTarget.textContent = message;
            }
        }

        handleTaskbarClick(event) {
            const button = event.currentTarget;
            const appName = button.dataset.taskbarApp;
            const windowElement = this.windows.find((candidate) => candidate.dataset.windowId === button.dataset.taskbarWindow)
                || this.getWindow(appName) || this.openApp(appName);
            if (!windowElement) {
                return;
            }

            event.preventDefault();

            if (this.activeWindow === windowElement && !windowElement.classList.contains("is-hidden")) {
                this.hideWindow(windowElement);
            } else {
                this.showWindow(windowElement);
            }
        }

        showWindow(windowElement) {
            windowElement.classList.remove("is-hidden");
            this.setActiveWindow(windowElement);
        }

        hideWindow(windowElement) {
            window.Win95Sounds?.play("minimize");
            windowElement.classList.add("is-hidden");
            this.getWindowTaskbarButton(windowElement)?.classList.remove("active");

            if (this.activeWindow === windowElement) {
                this.activeWindow = null;
            }
        }

        // force : « Fin de tâche » (Ctrl+Alt+Suppr) ferme sans demander, même si le composant refuserait.
        closeWindow(windowElement, { force = false } = {}) {
            // Un composant peut refuser la fermeture (ex. Bloc-notes avec modifications non enregistrées).
            if (!windowElement.dispatchEvent(new CustomEvent("win95:window-closing", { cancelable: true })) && !force) {
                return;
            }

            const appName = windowElement.dataset.windowApp;

            // Les composants (explorateurs, Bloc-notes…) se désabonnent de leurs écouteurs globaux.
            windowElement.dispatchEvent(new CustomEvent("win95:window-closed"));
            windowElement.remove();
            this.windows = this.windows.filter((currentWindow) => currentWindow !== windowElement);
            window.Win95Sounds?.play("close-program");

            if (this.activeWindow === windowElement) {
                this.activeWindow = null;
            }

            // Bouton de cette fenêtre (ou, pour une fenêtre sans bouton propre, celui de son application s'il n'en reste aucune).
            windowElement.__win95TaskbarObserver?.disconnect();
            const taskbarButton = this.getWindowTaskbarButton(windowElement)
                || (!this.windows.some((currentWindow) => currentWindow.dataset.windowApp === appName) ? this.getTaskbarButton(appName) : null);
            taskbarButton?.remove();
            this.taskbarButtons = this.taskbarButtons.filter((button) => button !== taskbarButton);

            const nextWindow = this.getVisibleWindowsByZIndex().pop();
            if (nextWindow) {
                this.setActiveWindow(nextWindow);
            } else {
                this.taskbarButtons.forEach((button) => button.classList.remove("active"));
            }
        }

        getVisibleWindowsByZIndex() {
            return Array.from(document.querySelectorAll(this.windowSelector))
                .filter((currentWindow) => !currentWindow.classList.contains("is-hidden"))
                .sort((left, right) => (Number(left.style.zIndex) || 0) - (Number(right.style.zIndex) || 0));
        }

        // Renumérote les fenêtres visibles en conservant leur ordre d'empilement, la fenêtre active au-dessus.
        setActiveWindow(windowElement) {
            this.activeWindow = windowElement;

            const stack = this.getVisibleWindowsByZIndex().filter((currentWindow) => currentWindow !== windowElement);
            [...stack, windowElement].forEach((currentWindow, index) => {
                currentWindow.style.zIndex = String(this.zIndexBase + index);
            });

            this.taskbarButtons.forEach((button) => button.classList.remove("active"));
            (this.getWindowTaskbarButton(windowElement) || this.getTaskbarButton(windowElement.dataset.windowApp))?.classList.add("active");
        }

        toggleMaximize(windowElement) {
            window.Win95Sounds?.play("maximize");
            const desktop = document.querySelector(".desktop");
            if (!desktop) {
                return;
            }

            if (windowElement.dataset.maximized === "true") {
                try {
                    const rect = JSON.parse(windowElement.dataset.restoreRect || "{}");
                    Object.assign(windowElement.style, {
                        left: rect.left,
                        top: rect.top,
                        width: rect.width,
                        height: rect.height
                    });
                } catch {
                    // position de restauration illisible : on garde la taille courante
                }
                delete windowElement.dataset.restoreRect;
                windowElement.dataset.maximized = "false";
                return;
            }

            // La position de restauration est capturée à chaque agrandissement (et non une seule fois).
            windowElement.dataset.restoreRect = JSON.stringify({
                left: windowElement.style.left || `${windowElement.offsetLeft}px`,
                top: windowElement.style.top || `${windowElement.offsetTop}px`,
                width: windowElement.style.width || `${windowElement.offsetWidth}px`,
                height: windowElement.style.height || `${windowElement.offsetHeight}px`
            });

            const desktopRect = desktop.getBoundingClientRect();
            const taskbarHeight = document.querySelector(".taskbar")?.offsetHeight ?? 36;
            Object.assign(windowElement.style, {
                left: "0px",
                top: "0px",
                width: `${desktopRect.width}px`,
                height: `${Math.max(180, desktopRect.height - taskbarHeight)}px`
            });
            windowElement.dataset.maximized = "true";
            this.setActiveWindow(windowElement);
        }
    }

    function initializeWindowManager() {
        const manager = new WindowManager();
        manager.init();
        window.Win95WindowManager = manager;
        window.Win95Services?.register?.("Win95WindowManager", manager);
        // Les modules chargés avant le gestionnaire (applets déclaratifs du Panneau de configuration) enregistrent leurs applications ici.
        window.dispatchEvent(new CustomEvent("win95:window-manager-ready"));
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeWindowManager);
    } else {
        initializeWindowManager();
    }
})();
