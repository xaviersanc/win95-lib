(() => {
    // FreeCell (Win95FreeCell) : 8 colonnes, 4 cellules libres, 4 fondations.
    //  - donnes numérotées avec l'algorithme de Microsoft (Win95Cards.dealFreeCell) : « Jeu n° 1 », « Jeu n° 11982 »…
    //  - déplacement d'une carte ou d'une suite : limité par le nombre de cellules et de colonnes vides, comme à l'origine ;
    //  - cliquer une carte la sélectionne, cliquer une destination la déplace ; glisser-déposer aussi ; double-clic = fondation,
    //    sinon cellule libre ; annuler (Ctrl+Z), rejouer la donne, choisir un numéro de donne.
    //  - Engine : les règles, sans interface (testable).

    const cards = () => window.Win95Cards;
    const MARGIN = 14;
    const COLUMN = 83;
    const TOP_ROW = 10;
    const TABLEAU_TOP = 125;
    const CANVAS_WIDTH = MARGIN * 2 + COLUMN * 7 + 71;
    const CANVAS_HEIGHT = 500;
    const CASCADE_STEP = 24;
    const MAX_GAME = 1000000;

    // --- Moteur -------------------------------------------------------------------------------------------------

    class Engine {
        constructor(number = 1) {
            this.deal(number);
        }

        deal(number) {
            this.number = number;
            this.cascades = cards().dealFreeCell(number);
            this.cells = [null, null, null, null];
            this.foundations = [[], [], [], []];
            this.moves = 0;
            this.history = [];
        }

        snapshot() {
            return {
                cascades: this.cascades.map((pile) => pile.slice()),
                cells: this.cells.slice(),
                foundations: this.foundations.map((pile) => pile.slice()),
                moves: this.moves
            };
        }

        undo() {
            const previous = this.history.pop();
            if (!previous) {
                return false;
            }
            Object.assign(this, previous);
            return true;
        }

        freeCells() {
            return this.cells.filter((cell) => cell === null).length;
        }

        emptyCascades() {
            return this.cascades.filter((pile) => pile.length === 0).length;
        }

        // Nombre maximal de cartes déplaçables d'un coup : (cellules libres + 1) × 2^(colonnes vides).
        // Vers une colonne vide, celle-ci ne compte pas comme une colonne vide disponible.
        maxRun(targetIsEmpty) {
            return (this.freeCells() + 1) * 2 ** Math.max(0, this.emptyCascades() - (targetIsEmpty ? 1 : 0));
        }

        isSequence(run) {
            return run.every((card, index) => index === 0 || (run[index - 1].rank === card.rank + 1 && cards().isRed(run[index - 1]) !== cards().isRed(card)));
        }

        canPlaceOnFoundation(card, foundation) {
            const top = foundation[foundation.length - 1];
            return top ? top.suit === card.suit && card.rank === top.rank + 1 : card.rank === 1;
        }

        canPlaceOnCascade(card, pile) {
            const top = pile[pile.length - 1];
            return !top || (top.rank === card.rank + 1 && cards().isRed(top) !== cards().isRed(card));
        }

        sourceCards(from) {
            if (from.zone === "cell") {
                return this.cells[from.pile] ? [this.cells[from.pile]] : [];
            }
            if (from.zone === "foundation") {
                return this.foundations[from.pile].slice(-1);
            }
            const run = this.cascades[from.pile].slice(from.index);
            return run.length > 0 && this.isSequence(run) ? run : [];
        }

        canMove(from, to) {
            const moving = this.sourceCards(from);
            if (moving.length === 0) {
                return false;
            }
            if (to.zone === "foundation") {
                return moving.length === 1 && from.zone !== "foundation" && this.canPlaceOnFoundation(moving[0], this.foundations[to.pile]);
            }
            if (to.zone === "cell") {
                return moving.length === 1 && this.cells[to.pile] === null && from.zone !== "foundation";
            }
            if (from.zone === "cascade" && from.pile === to.pile) {
                return false;
            }
            const target = this.cascades[to.pile];
            return moving.length <= this.maxRun(target.length === 0) && this.canPlaceOnCascade(moving[0], target);
        }

        move(from, to) {
            if (!this.canMove(from, to)) {
                return false;
            }
            this.history.push(this.snapshot());
            const moving = this.sourceCards(from);
            if (from.zone === "cell") {
                this.cells[from.pile] = null;
            } else if (from.zone === "foundation") {
                this.foundations[from.pile].pop();
            } else {
                this.cascades[from.pile].splice(from.index);
            }
            if (to.zone === "foundation") {
                this.foundations[to.pile].push(...moving);
            } else if (to.zone === "cell") {
                this.cells[to.pile] = moving[0];
            } else {
                this.cascades[to.pile].push(...moving);
            }
            this.moves += 1;
            return true;
        }

        // Double-clic : fondation si possible, sinon première cellule libre.
        autoMove(from) {
            const moving = this.sourceCards(from);
            if (moving.length !== 1) {
                return false;
            }
            const foundation = this.foundations.findIndex((pile) => this.canPlaceOnFoundation(moving[0], pile));
            if (foundation >= 0) {
                return this.move(from, { zone: "foundation", pile: foundation });
            }
            const cell = this.cells.findIndex((value) => value === null);
            return from.zone === "cascade" && cell >= 0 && this.move(from, { zone: "cell", pile: cell });
        }

        hasWon() {
            return this.foundations.every((pile) => pile.length === 13);
        }
    }

    // --- Interface --------------------------------------------------------------------------------------------------

    class Win95FreeCell {
        constructor(rootElement) {
            this.rootElement = rootElement;
            this.bodyElement = rootElement.querySelector("[data-app-body]");
            if (!this.bodyElement) {
                return;
            }
            this.titleElement = rootElement.querySelector(".title-bar-text");
            this.engine = new Engine(this.randomNumber());
            this.selected = null;
            this.drag = null;
            this.animation = null;
            this.hitBoxes = [];

            window.Win95MenuBar.mount(this.bodyElement, [
                {
                    label: "Jeu",
                    items: () => [
                        { label: "Nouvelle donne", hint: "F2", onSelect: () => this.newGame(this.randomNumber()) },
                        { label: "Sélectionner une donne…", onSelect: () => void this.askNumber() },
                        { label: "Redémarrer cette donne", onSelect: () => this.newGame(this.engine.number) },
                        { separator: true },
                        { label: "Annuler", hint: "Ctrl+Z", disabled: this.engine.history.length === 0, onSelect: () => this.undo() },
                        { separator: true },
                        { label: "Quitter", onSelect: () => window.Win95WindowManager?.closeWindow(rootElement) }
                    ]
                },
                { label: "?", items: [{ label: "À propos de FreeCell", onSelect: () => void window.Win95Dialog.alert({ title: "À propos de FreeCell", message: "FreeCell Windows 95 (simulation).\nDéplacez toutes les cartes sur les fondations, de l'as au roi, par couleur.\nPresque toutes les donnes sont gagnables." }) }] }
            ]);

            this.canvas = document.createElement("canvas");
            this.canvas.width = CANVAS_WIDTH;
            this.canvas.height = CANVAS_HEIGHT;
            this.canvas.className = "cards-table";
            this.canvas.tabIndex = 0;
            this.canvas.setAttribute("aria-label", "Table de FreeCell");
            this.statusElement = document.createElement("div");
            this.statusElement.className = "explorer-status cards-status";
            this.frame = document.createElement("div");
            this.frame.className = "cards-frame";
            this.frame.append(this.canvas, this.statusElement);
            this.bodyElement.appendChild(this.frame);

            this.canvas.addEventListener("pointerdown", (event) => this.pointerDown(event));
            this.canvas.addEventListener("pointermove", (event) => this.pointerMove(event));
            this.canvas.addEventListener("pointerup", (event) => this.pointerUp(event));
            this.canvas.addEventListener("pointercancel", () => this.cancelDrag());
            this.canvas.addEventListener("dblclick", (event) => this.doubleClick(event));
            rootElement.tabIndex = -1;
            rootElement.addEventListener("keydown", (event) => {
                if (event.key === "F2") {
                    event.preventDefault();
                    this.newGame(this.randomNumber());
                } else if (event.ctrlKey && event.key.toLowerCase() === "z") {
                    event.preventDefault();
                    this.undo();
                }
            });
            rootElement.addEventListener("win95:window-closed", () => this.stopAnimation(), { once: true });
            rootElement.__win95FreeCellInstance = this;
            window.Win95Utils.fitWindow(rootElement, this.frame, { extraHeight: this.bodyElement.querySelector(".win95-menubar").offsetHeight + 1 });
            this.render();
        }

        randomNumber() {
            return 1 + Math.floor(Math.random() * 32000);
        }

        newGame(number) {
            this.stopAnimation();
            this.engine = new Engine(number);
            this.selected = null;
            this.render();
        }

        undo() {
            if (!this.animation && this.engine.undo()) {
                this.selected = null;
                this.render();
            }
        }

        async askNumber() {
            const values = await window.Win95Dialog.form({
                title: "Sélectionner une donne",
                message: `Entrez un numéro de donne (1 à ${MAX_GAME}) :`,
                fields: [{ name: "number", type: "text", label: "Donne n° :", value: String(this.engine.number) }]
            });
            const number = Math.round(Number(values?.number));
            if (values && Number.isFinite(number) && number >= 1 && number <= MAX_GAME) {
                this.newGame(number);
            }
        }

        columnX(column) {
            return MARGIN + column * COLUMN;
        }

        cascadeStep(pile) {
            const available = CANVAS_HEIGHT - TABLEAU_TOP - cards().CARD_HEIGHT - 8;
            return pile.length > 1 && (pile.length - 1) * CASCADE_STEP > available ? Math.max(10, available / (pile.length - 1)) : CASCADE_STEP;
        }

        // --- Dessin -----------------------------------------------------------------------------------------------

        render() {
            const context = this.canvas.getContext("2d");
            const { engine } = this;
            const { CARD_WIDTH: W, CARD_HEIGHT: H } = cards();
            context.fillStyle = "#008000";
            context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            this.hitBoxes = [];
            const dragged = this.drag?.moved ? new Set(this.drag.cards.map((card) => card.id)) : new Set();
            const isSelected = (card) => this.selected && this.engine.sourceCards(this.selected.from).some((candidate) => candidate.id === card.id);

            engine.cells.forEach((card, pile) => {
                const x = this.columnX(pile);
                cards().drawSlot(context, x, TOP_ROW);
                if (card && !dragged.has(card.id)) {
                    cards().drawCard(context, card, x, TOP_ROW, { highlight: isSelected(card) });
                }
                this.hitBoxes.push({ zone: "cell", pile, x, y: TOP_ROW, w: W, h: H, card: dragged.has(card?.id) ? null : card, drop: true });
            });
            engine.foundations.forEach((foundation, pile) => {
                const x = this.columnX(4 + pile);
                cards().drawSlot(context, x, TOP_ROW, "A");
                const top = foundation[foundation.length - 1];
                if (top) {
                    cards().drawCard(context, top, x, TOP_ROW);
                }
                this.hitBoxes.push({ zone: "foundation", pile, x, y: TOP_ROW, w: W, h: H, card: top, drop: true });
            });
            engine.cascades.forEach((pile, column) => {
                const x = this.columnX(column);
                cards().drawSlot(context, x, TABLEAU_TOP, pile.length === 0 ? "" : "");
                const step = this.cascadeStep(pile);
                let lastY = TABLEAU_TOP;
                pile.forEach((card, index) => {
                    const y = TABLEAU_TOP + index * step;
                    lastY = y;
                    if (!dragged.has(card.id)) {
                        cards().drawCard(context, card, x, y, { highlight: isSelected(card) });
                        this.hitBoxes.push({ zone: "cascade", pile: column, index, x, y, w: W, h: H, card });
                    }
                });
                this.hitBoxes.push({ zone: "cascade-drop", pile: column, x, y: pile.length ? lastY : TABLEAU_TOP, w: W, h: H, drop: true });
            });
            if (this.drag?.moved) {
                this.drag.cards.forEach((card, index) => cards().drawCard(context, card, this.drag.x, this.drag.y + index * CASCADE_STEP));
            }
            this.titleElement.textContent = `FreeCell - Jeu n° ${engine.number}`;
            this.statusElement.textContent = `Cellules libres : ${engine.freeCells()}   Coups : ${engine.moves}   Suite maximale : ${engine.maxRun(false)} cartes`;
        }

        // --- Souris -----------------------------------------------------------------------------------------------------

        position(event) {
            const rect = this.canvas.getBoundingClientRect();
            return { x: ((event.clientX - rect.left) * CANVAS_WIDTH) / rect.width, y: ((event.clientY - rect.top) * CANVAS_HEIGHT) / rect.height };
        }

        // Zone sous le point : les cartes d'abord ; avec includeDrops, à défaut, l'emplacement d'une colonne (vide ou non).
        hit(point, { includeDrops = false } = {}) {
            const inside = (box) => point.x >= box.x && point.x < box.x + box.w && point.y >= box.y && point.y < box.y + box.h;
            for (let index = this.hitBoxes.length - 1; index >= 0; index -= 1) {
                const box = this.hitBoxes[index];
                if (box.zone !== "cascade-drop" && inside(box)) {
                    return box;
                }
            }
            return includeDrops ? this.hitBoxes.find((box) => box.zone === "cascade-drop" && inside(box)) || null : null;
        }

        toFrom(box) {
            return box.zone === "cascade" ? { zone: "cascade", pile: box.pile, index: box.index } : { zone: box.zone, pile: box.pile };
        }

        toTarget(box) {
            if (box.zone === "cascade" || box.zone === "cascade-drop") {
                return { zone: "cascade", pile: box.pile };
            }
            return { zone: box.zone, pile: box.pile };
        }

        pointerDown(event) {
            if (event.button !== 0 || this.animation) {
                return;
            }
            const point = this.position(event);
            const box = this.hit(point, { includeDrops: true });
            this.canvas.focus();
            this.clickBox = box;
            if (box?.card && box.zone !== "foundation") {
                const from = this.toFrom(box);
                const moving = this.engine.sourceCards(from);
                if (moving.length > 0) {
                    this.drag = { from, cards: moving, offsetX: point.x - box.x, offsetY: point.y - box.y, startX: point.x, startY: point.y, x: box.x, y: box.y, moved: false };
                    this.canvas.setPointerCapture(event.pointerId);
                }
            }
        }

        pointerMove(event) {
            if (!this.drag) {
                return;
            }
            const point = this.position(event);
            if (!this.drag.moved && Math.hypot(point.x - this.drag.startX, point.y - this.drag.startY) < 4) {
                return;
            }
            this.drag.moved = true;
            this.drag.x = point.x - this.drag.offsetX;
            this.drag.y = point.y - this.drag.offsetY;
            this.render();
        }

        findDropTarget(drag) {
            const { CARD_WIDTH: W, CARD_HEIGHT: H } = cards();
            let best = null;
            this.hitBoxes.filter((box) => box.drop).forEach((box) => {
                const overlapX = Math.min(drag.x + W, box.x + box.w) - Math.max(drag.x, box.x);
                const overlapY = Math.min(drag.y + H, box.y + box.h) - Math.max(drag.y, box.y);
                if (overlapX <= 0 || overlapY <= 0) {
                    return;
                }
                const to = this.toTarget(box);
                if (this.engine.canMove(drag.from, to) && (!best || overlapX * overlapY > best.area)) {
                    best = { to, area: overlapX * overlapY };
                }
            });
            return best?.to || null;
        }

        pointerUp(event) {
            const drag = this.drag;
            this.drag = null;
            if (drag) {
                this.canvas.releasePointerCapture?.(event.pointerId);
            }
            if (drag?.moved) {
                const target = this.findDropTarget(drag);
                if (target && this.engine.move(drag.from, target)) {
                    this.selected = null;
                }
                this.render();
                this.checkWin();
                return;
            }
            // Simple clic : sélection d'une carte, ou déplacement de la sélection vers la case cliquée.
            const box = this.hit(this.position(event), { includeDrops: true });
            if (this.selected && box) {
                const target = this.toTarget(box);
                if (this.engine.move(this.selected.from, target)) {
                    this.selected = null;
                    this.render();
                    this.checkWin();
                    return;
                }
            }
            this.selected = box?.card && box.zone !== "foundation" && this.engine.sourceCards(this.toFrom(box)).length > 0 && !(this.selected && this.sameFrom(this.selected.from, this.toFrom(box)))
                ? { from: this.toFrom(box) }
                : null;
            this.render();
        }

        sameFrom(left, right) {
            return left.zone === right.zone && left.pile === right.pile && left.index === right.index;
        }

        cancelDrag() {
            this.drag = null;
            this.render();
        }

        doubleClick(event) {
            if (this.animation) {
                return;
            }
            const box = this.hit(this.position(event));
            if (box?.card && box.zone !== "foundation") {
                const from = this.toFrom(box);
                // Seule la dernière carte d'une colonne (ou une cellule) part au double-clic.
                const isLast = box.zone !== "cascade" || box.index === this.engine.cascades[box.pile].length - 1;
                if (isLast && this.engine.autoMove(from)) {
                    this.selected = null;
                    this.render();
                    this.checkWin();
                }
            }
        }

        // --- Victoire ---------------------------------------------------------------------------------------------------

        checkWin() {
            if (!this.engine.hasWon() || this.animation) {
                return;
            }
            window.Win95Sounds?.play("exclamation");
            const items = [];
            for (let rank = 13; rank >= 1; rank -= 1) {
                this.engine.foundations.forEach((foundation, pile) => {
                    items.push({ card: foundation[rank - 1], x: this.columnX(4 + pile), y: TOP_ROW });
                });
            }
            const cancel = window.Win95Cards.cascade(this.canvas, items, () => {
                this.animation = null;
                window.setTimeout(() => void this.askAgain(), 400);
            });
            this.animation = { cancel };
        }

        stopAnimation() {
            this.animation?.cancel();
            this.animation = null;
        }

        async askAgain() {
            if (!this.rootElement.isConnected) {
                return;
            }
            const again = await window.Win95Dialog.confirm({
                title: "FreeCell",
                message: `Bravo, vous avez gagné la donne n° ${this.engine.number} !\nVoulez-vous jouer une nouvelle donne ?`,
                confirmLabel: "Oui",
                icon: "msg_question-0.png"
            });
            if (again) {
                this.newGame(this.randomNumber());
            }
        }
    }

    const api = {
        Engine,
        attach(rootElement) {
            return rootElement?.__win95FreeCellInstance || new Win95FreeCell(rootElement);
        }
    };

    window.Win95FreeCell = api;
    window.Win95Services?.register?.("Win95FreeCell", api);
})();
