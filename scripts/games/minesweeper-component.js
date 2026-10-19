(() => {
    // Démineur (Win95Minesweeper) : trois niveaux + personnalisé, marques (?), accord (clic milieu ou gauche+droit),
    // premier clic toujours sûr, compteur de mines, chronomètre, meilleurs temps par compte.
    //  - Engine : la logique du jeu, sans interface (testable) ;
    //  - sauvegarde : localStorage "win95.minesweeper.v1.<id>" = { level, custom, marks, best }.

    const LEVELS = {
        beginner: { label: "Débutant", cols: 9, rows: 9, mines: 10 },
        intermediate: { label: "Intermédiaire", cols: 16, rows: 16, mines: 40 },
        expert: { label: "Expert", cols: 30, rows: 16, mines: 99 }
    };
    const STORAGE_PREFIX = "win95.minesweeper.v1";
    const CELL_PX = 16;

    // --- Moteur -------------------------------------------------------------------------------------------

    class Engine {
        constructor(cols, rows, mines, random = Math.random) {
            this.cols = cols;
            this.rows = rows;
            this.mines = Math.min(mines, cols * rows - 1);
            this.random = random;
            this.reset();
        }

        reset() {
            this.cells = Array.from({ length: this.cols * this.rows }, () => ({ mine: false, adjacent: 0, revealed: false, mark: 0, exploded: false, wrongFlag: false }));
            this.status = "ready";     // ready | playing | won | lost
            this.revealedCount = 0;
            this.placed = false;
        }

        index(x, y) {
            return y * this.cols + x;
        }

        inside(x, y) {
            return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
        }

        cell(x, y) {
            return this.cells[this.index(x, y)];
        }

        neighbors(x, y) {
            const list = [];
            for (let dy = -1; dy <= 1; dy += 1) {
                for (let dx = -1; dx <= 1; dx += 1) {
                    if ((dx || dy) && this.inside(x + dx, y + dy)) {
                        list.push([x + dx, y + dy]);
                    }
                }
            }
            return list;
        }

        // Les mines sont posées au premier clic, jamais sur la case cliquée.
        placeMines(safeX, safeY) {
            const candidates = [];
            for (let y = 0; y < this.rows; y += 1) {
                for (let x = 0; x < this.cols; x += 1) {
                    if (x !== safeX || y !== safeY) {
                        candidates.push([x, y]);
                    }
                }
            }
            for (let placed = 0; placed < this.mines; placed += 1) {
                const pick = Math.floor(this.random() * candidates.length);
                const [x, y] = candidates.splice(pick, 1)[0];
                this.cell(x, y).mine = true;
            }
            for (let y = 0; y < this.rows; y += 1) {
                for (let x = 0; x < this.cols; x += 1) {
                    this.cell(x, y).adjacent = this.neighbors(x, y).filter(([nx, ny]) => this.cell(nx, ny).mine).length;
                }
            }
            this.placed = true;
        }

        get flags() {
            return this.cells.filter((cell) => cell.mark === 1).length;
        }

        get minesLeft() {
            return this.mines - this.flags;
        }

        // Révèle une case (et, si elle est vide, ses voisines). Renvoie true si l'état du jeu a changé.
        reveal(x, y) {
            if (this.status === "won" || this.status === "lost" || !this.inside(x, y)) {
                return false;
            }
            const cell = this.cell(x, y);
            if (cell.revealed || cell.mark === 1) {
                return false;
            }
            if (!this.placed) {
                this.placeMines(x, y);
                this.status = "playing";
            }
            if (cell.mine) {
                cell.exploded = true;
                this.lose();
                return true;
            }
            const stack = [[x, y]];
            while (stack.length > 0) {
                const [cx, cy] = stack.pop();
                const current = this.cell(cx, cy);
                if (current.revealed || current.mark === 1) {
                    continue;
                }
                current.revealed = true;
                current.mark = 0;
                this.revealedCount += 1;
                if (current.adjacent === 0) {
                    this.neighbors(cx, cy).forEach(([nx, ny]) => {
                        if (!this.cell(nx, ny).revealed) {
                            stack.push([nx, ny]);
                        }
                    });
                }
            }
            this.checkWin();
            return true;
        }

        // Pose / retire un drapeau (puis un point d'interrogation si les marques sont activées).
        toggleMark(x, y, marks = false) {
            if (this.status === "won" || this.status === "lost" || !this.inside(x, y)) {
                return false;
            }
            const cell = this.cell(x, y);
            if (cell.revealed) {
                return false;
            }
            cell.mark = cell.mark === 0 ? 1 : cell.mark === 1 ? (marks ? 2 : 0) : 0;
            return true;
        }

        // Accord : sur un chiffre dont les drapeaux sont au complet, révèle les autres voisines.
        chord(x, y) {
            if (this.status !== "playing" || !this.inside(x, y)) {
                return false;
            }
            const cell = this.cell(x, y);
            if (!cell.revealed || cell.adjacent === 0) {
                return false;
            }
            const around = this.neighbors(x, y);
            if (around.filter(([nx, ny]) => this.cell(nx, ny).mark === 1).length !== cell.adjacent) {
                return false;
            }
            let changed = false;
            around.forEach(([nx, ny]) => {
                if (this.status === "playing") {
                    changed = this.reveal(nx, ny) || changed;
                }
            });
            return changed;
        }

        checkWin() {
            if (this.revealedCount === this.cols * this.rows - this.mines) {
                this.status = "won";
                this.cells.forEach((cell) => {
                    if (cell.mine) {
                        cell.mark = 1;
                    }
                });
            }
        }

        lose() {
            this.status = "lost";
            this.cells.forEach((cell) => {
                if (cell.mark === 1 && !cell.mine) {
                    cell.wrongFlag = true;
                }
            });
        }
    }

    // --- Visage (canvas 24 x 24) ------------------------------------------------------------------------------

    function drawFace(canvas, mood) {
        const context = canvas.getContext("2d");
        const size = canvas.width;
        context.clearRect(0, 0, size, size);
        context.fillStyle = "#ffff00";
        context.strokeStyle = "#000";
        context.lineWidth = 1;
        context.beginPath();
        context.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        context.fillStyle = "#000";
        if (mood === "cool") {
            context.fillRect(4, 8, 16, 4);
            context.fillRect(3, 8, 2, 2);
            context.fillRect(19, 8, 2, 2);
        } else if (mood === "dead") {
            context.lineWidth = 1.5;
            [[8, 10], [16, 10]].forEach(([cx, cy]) => {
                context.beginPath();
                context.moveTo(cx - 2, cy - 2);
                context.lineTo(cx + 2, cy + 2);
                context.moveTo(cx + 2, cy - 2);
                context.lineTo(cx - 2, cy + 2);
                context.stroke();
            });
        } else {
            context.fillRect(8, 8, 2, 3);
            context.fillRect(14, 8, 2, 3);
        }
        context.strokeStyle = "#000";
        context.lineWidth = 1.5;
        context.beginPath();
        if (mood === "scared") {
            context.arc(12, 16, 2.5, 0, Math.PI * 2);
        } else if (mood === "dead") {
            context.arc(12, 18, 4, Math.PI * 1.15, Math.PI * 1.85);
        } else {
            context.arc(12, 12, 6, Math.PI * 0.2, Math.PI * 0.8);
        }
        context.stroke();
    }

    // --- Interface ------------------------------------------------------------------------------------------------

    const utils = () => window.Win95Utils;

    class Win95Minesweeper {
        constructor(rootElement) {
            this.rootElement = rootElement;
            this.bodyElement = rootElement.querySelector("[data-app-body]");
            if (!this.bodyElement) {
                return;
            }
            this.storageKey = `${STORAGE_PREFIX}.${utils().getCurrentUserId()}`;
            const saved = utils().readStoredJson(this.storageKey, {}) || {};
            this.level = LEVELS[saved.level] || saved.level === "custom" ? saved.level : "beginner";
            this.custom = saved.custom || { cols: 9, rows: 9, mines: 10 };
            this.marks = saved.marks !== false;
            this.best = saved.best || {};
            this.seconds = 0;
            this.timer = null;
            this.mouse = { left: false, right: false, chording: false };
            this.boundMouseUp = (event) => this.handleMouseUp(event);
            window.addEventListener("mouseup", this.boundMouseUp);

            window.Win95MenuBar.mount(this.bodyElement, [
                {
                    label: "Jeu",
                    items: () => [
                        { label: "Nouvelle partie", hint: "F2", onSelect: () => this.newGame() },
                        { separator: true },
                        ...Object.entries(LEVELS).map(([key, level]) => ({ label: level.label, checked: this.level === key, onSelect: () => this.setLevel(key) })),
                        { label: "Personnalisé…", checked: this.level === "custom", onSelect: () => void this.askCustom() },
                        { separator: true },
                        { label: "Marques (?)", checked: this.marks, onSelect: () => { this.marks = !this.marks; this.save(); } },
                        { separator: true },
                        { label: "Meilleurs temps…", onSelect: () => void this.showBest() },
                        { separator: true },
                        { label: "Quitter", onSelect: () => window.Win95WindowManager?.closeWindow(rootElement) }
                    ]
                },
                { label: "?", items: [{ label: "À propos du Démineur", onSelect: () => void window.Win95Dialog.alert({ title: "À propos du Démineur", message: "Démineur Windows 95 (simulation).\nClic gauche : découvrir. Clic droit : drapeau. Clic milieu ou gauche+droit sur un chiffre : accord." }) }] }
            ]);

            this.gameElement = document.createElement("div");
            this.gameElement.className = "ms";
            this.bodyElement.appendChild(this.gameElement);
            rootElement.tabIndex = -1;
            rootElement.addEventListener("keydown", (event) => {
                if (event.key === "F2") {
                    event.preventDefault();
                    this.newGame();
                }
            });
            rootElement.addEventListener("win95:window-closed", () => {
                this.stopTimer();
                window.removeEventListener("mouseup", this.boundMouseUp);
            }, { once: true });
            rootElement.__win95MinesweeperInstance = this;
            this.newGame();
        }

        get config() {
            return this.level === "custom" ? this.custom : LEVELS[this.level];
        }

        save() {
            utils().writeStoredJson(this.storageKey, { level: this.level, custom: this.custom, marks: this.marks, best: this.best });
        }

        setLevel(key) {
            this.level = key;
            this.save();
            this.newGame();
        }

        async askCustom() {
            const values = await window.Win95Dialog.form({
                title: "Champ personnalisé",
                message: "Taille et nombre de mines (largeur 9 à 30, hauteur 9 à 24) :",
                fields: [
                    { name: "rows", label: "Hauteur :", type: "text", value: String(this.custom.rows) },
                    { name: "cols", label: "Largeur :", type: "text", value: String(this.custom.cols) },
                    { name: "mines", label: "Mines :", type: "text", value: String(this.custom.mines) }
                ],
                confirmLabel: "OK"
            });
            if (!values) {
                return;
            }
            const clamp = (value, min, max, fallback) => (Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Math.round(Number(value)))) : fallback);
            const cols = clamp(values.cols, 9, 30, 9);
            const rows = clamp(values.rows, 9, 24, 9);
            this.custom = { cols, rows, mines: clamp(values.mines, 10, Math.min(668, cols * rows - 1), 10) };
            this.setLevel("custom");
        }

        newGame() {
            this.stopTimer();
            const { cols, rows, mines } = this.config;
            this.engine = new Engine(cols, rows, mines);
            this.seconds = 0;
            this.render();
        }

        startTimer() {
            if (!this.timer) {
                this.timer = window.setInterval(() => {
                    this.seconds = Math.min(999, this.seconds + 1);
                    this.updateCounters();
                }, 1000);
            }
        }

        stopTimer() {
            window.clearInterval(this.timer);
            this.timer = null;
        }

        // --- Dessin ----------------------------------------------------------------------------------------------

        render() {
            const { engine } = this;
            this.gameElement.textContent = "";
            const header = document.createElement("div");
            header.className = "ms-header";
            this.mineCounter = document.createElement("div");
            this.mineCounter.className = "ms-counter";
            this.mineCounter.setAttribute("aria-label", "Mines restantes");
            this.timeCounter = document.createElement("div");
            this.timeCounter.className = "ms-counter";
            this.timeCounter.setAttribute("aria-label", "Temps écoulé");
            this.faceButton = document.createElement("button");
            this.faceButton.type = "button";
            this.faceButton.className = "ms-face";
            this.faceButton.setAttribute("aria-label", "Nouvelle partie");
            this.faceCanvas = document.createElement("canvas");
            this.faceCanvas.width = 24;
            this.faceCanvas.height = 24;
            this.faceButton.appendChild(this.faceCanvas);
            this.faceButton.addEventListener("click", () => this.newGame());
            header.append(this.mineCounter, this.faceButton, this.timeCounter);

            this.gridElement = document.createElement("div");
            this.gridElement.className = "ms-grid";
            this.gridElement.style.gridTemplateColumns = `repeat(${engine.cols}, ${CELL_PX}px)`;
            this.gridElement.addEventListener("contextmenu", (event) => event.preventDefault());
            this.cellElements = [];
            for (let y = 0; y < engine.rows; y += 1) {
                for (let x = 0; x < engine.cols; x += 1) {
                    const cell = document.createElement("div");
                    cell.className = "ms-cell";
                    cell.dataset.x = String(x);
                    cell.dataset.y = String(y);
                    cell.setAttribute("role", "gridcell");
                    this.cellElements.push(cell);
                    this.gridElement.appendChild(cell);
                }
            }
            this.bindMouse();
            this.gameElement.append(header, this.gridElement);
            this.updateCells();
            this.updateCounters();
            this.setFace("smile");
            window.Win95Utils.fitWindow(this.rootElement, this.gameElement, { extraHeight: this.bodyElement.querySelector(".win95-menubar").offsetHeight + 1 });
        }

        setFace(mood) {
            this.mood = mood;
            drawFace(this.faceCanvas, mood);
        }

        cellFromEvent(event) {
            const element = event.target.closest(".ms-cell");
            return element ? { x: Number(element.dataset.x), y: Number(element.dataset.y) } : null;
        }

        // Souris : gauche = découvrir (au relâchement), droit = drapeau (à l'appui), milieu ou gauche+droit = accord.
        // L'écouteur de relâchement est posé une seule fois (sur window : on peut relâcher hors de la grille).
        bindMouse() {
            const state = this.mouse;
            this.gridElement.addEventListener("mousedown", (event) => {
                const position = this.cellFromEvent(event);
                if (!position || ["won", "lost"].includes(this.engine.status)) {
                    return;
                }
                if (event.button === 1) {
                    event.preventDefault();
                    this.finishChord(position);
                    return;
                }
                if (event.button === 0) {
                    state.left = true;
                } else if (event.button === 2) {
                    state.right = true;
                }
                if (state.left && state.right) {
                    state.chording = true;
                    this.setFace("scared");
                    return;
                }
                if (event.button === 2) {
                    if (this.engine.toggleMark(position.x, position.y, this.marks)) {
                        this.updateCells();
                        this.updateCounters();
                    }
                } else if (event.button === 0) {
                    this.setFace("scared");
                }
            });
        }

        finishChord(position) {
            if (position && this.engine.chord(position.x, position.y)) {
                this.afterMove();
            }
            this.mouse.chording = false;
            this.updateCells();
        }

        restoreFace() {
            this.setFace(this.engine.status === "lost" ? "dead" : this.engine.status === "won" ? "cool" : "smile");
        }

        handleMouseUp(event) {
            const state = this.mouse;
            const wasLeft = state.left;
            const wasChording = state.chording;
            if (event.button === 0) {
                state.left = false;
            } else if (event.button === 2) {
                state.right = false;
            }
            const position = this.cellFromEvent(event);
            if (wasChording && (event.button === 0 || event.button === 2)) {
                if (!state.left && !state.right) {
                    this.finishChord(position);
                    this.restoreFace();
                }
                return;
            }
            if (event.button === 0 && wasLeft) {
                if (position && !["won", "lost"].includes(this.engine.status) && this.engine.reveal(position.x, position.y)) {
                    this.afterMove();
                }
                this.restoreFace();
            }
        }

        afterMove() {
            const { engine } = this;
            if (engine.status === "playing") {
                this.startTimer();
            }
            this.updateCells();
            this.updateCounters();
            if (engine.status === "lost") {
                this.stopTimer();
                this.setFace("dead");
                window.Win95Sounds?.play("critical-stop");
            } else if (engine.status === "won") {
                this.stopTimer();
                this.setFace("cool");
                void this.recordWin();
            }
        }

        updateCells() {
            const { engine } = this;
            this.cellElements.forEach((element, index) => {
                const cell = engine.cells[index];
                const lost = engine.status === "lost";
                let className = "ms-cell";
                if (cell.revealed) {
                    className += ` is-open${cell.adjacent > 0 ? ` n-${cell.adjacent}` : ""}`;
                } else if (lost && cell.mine && cell.mark !== 1) {
                    className += " is-open has-mine";
                } else if (cell.wrongFlag) {
                    className += " is-open is-wrong";
                } else if (cell.mark === 1) {
                    className += " has-flag";
                } else if (cell.mark === 2) {
                    className += " has-question";
                }
                if (cell.exploded) {
                    className += " is-exploded";
                }
                element.className = className;
                element.textContent = cell.revealed && cell.adjacent > 0 ? String(cell.adjacent) : cell.mark === 2 && !cell.revealed ? "?" : "";
            });
        }

        updateCounters() {
            const format = (value) => {
                const clamped = Math.max(-99, Math.min(999, value));
                return clamped < 0 ? `-${String(Math.abs(clamped)).padStart(2, "0")}` : String(clamped).padStart(3, "0");
            };
            this.mineCounter.textContent = format(this.engine.minesLeft);
            this.timeCounter.textContent = format(this.seconds);
        }

        // --- Meilleurs temps --------------------------------------------------------------------------------------

        async recordWin() {
            if (this.level === "custom") {
                return;
            }
            const current = this.best[this.level];
            if (current && current.time <= this.seconds) {
                return;
            }
            const name = await window.Win95Dialog.prompt({
                title: "Meilleur temps",
                message: `Record ${LEVELS[this.level].label.toLowerCase()} : ${this.seconds} secondes ! Entrez votre nom :`,
                defaultValue: utils().getCurrentUserName()
            });
            this.best[this.level] = { time: this.seconds, name: name || "Anonyme" };
            this.save();
        }

        async showBest() {
            const lines = Object.entries(LEVELS).map(([key, level]) => {
                const record = this.best[key];
                return `${level.label.padEnd(14, " ")} ${record ? `${String(record.time).padStart(3, " ")} secondes   ${record.name}` : "999 secondes   Anonyme"}`;
            });
            await window.Win95Dialog.alert({ title: "Meilleurs temps", message: lines.join("\n") });
        }
    }

    const api = {
        Engine,
        LEVELS,
        attach(rootElement) {
            return rootElement?.__win95MinesweeperInstance || new Win95Minesweeper(rootElement);
        }
    };

    window.Win95Minesweeper = api;
    window.Win95Services?.register?.("Win95Minesweeper", api);
})();
