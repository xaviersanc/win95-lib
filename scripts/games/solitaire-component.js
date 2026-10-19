(() => {
    // Solitaire (Win95Solitaire) : le Klondike de Windows 95.
    //  - Engine : les règles, sans interface (testable) ;
    //  - interface : canvas, glisser-déposer des cartes ou piles, double-clic = envoi vers une fondation, pioche par 1 ou 3,
    //    annuler (Ctrl+Z), score standard ou aucun, dos de carte au choix, cascade de cartes à la victoire ;
    //  - réglages par compte : localStorage "win95.solitaire.v1.<id>" = { drawCount, scoring, back }.

    const cards = () => window.Win95Cards;
    const STORAGE_PREFIX = "win95.solitaire.v1";
    const MARGIN = 14;
    const COLUMN = 83;                      // largeur de colonne : carte (71) + espace (12)
    const TOP_ROW = 10;
    const TABLEAU_TOP = 125;
    const CANVAS_WIDTH = MARGIN * 2 + COLUMN * 6 + 71;
    const CANVAS_HEIGHT = 490;
    const FACE_DOWN_STEP = 6;
    const FACE_UP_STEP = 18;

    // --- Moteur -------------------------------------------------------------------------------------------------

    class Engine {
        constructor({ drawCount = 3, scoring = "standard", random = Math.random } = {}) {
            this.drawCount = drawCount;
            this.scoring = scoring;
            this.random = random;
            this.deal();
        }

        deal() {
            const deck = cards().shuffle(cards().createDeck(), this.random).map((card) => ({ ...card, up: false }));
            this.tableau = Array.from({ length: 7 }, () => []);
            for (let pile = 0; pile < 7; pile += 1) {
                for (let count = 0; count <= pile; count += 1) {
                    this.tableau[pile].push(deck.pop());
                }
                this.tableau[pile][pile].up = true;
            }
            this.stock = deck;
            this.waste = [];
            this.foundations = [[], [], [], []];
            this.score = 0;
            this.moves = 0;
            this.history = [];
        }

        // --- Annuler ---
        snapshot() {
            const copy = (pile) => pile.map((card) => ({ ...card }));
            return {
                tableau: this.tableau.map(copy),
                stock: copy(this.stock),
                waste: copy(this.waste),
                foundations: this.foundations.map(copy),
                score: this.score,
                moves: this.moves
            };
        }

        remember() {
            this.history.push(this.snapshot());
            if (this.history.length > 500) {
                this.history.shift();
            }
        }

        undo() {
            const previous = this.history.pop();
            if (!previous) {
                return false;
            }
            Object.assign(this, previous);
            return true;
        }

        addScore(points) {
            if (this.scoring === "standard") {
                this.score = Math.max(0, this.score + points);
            }
        }

        // --- Règles ---
        canPlaceOnFoundation(card, foundation) {
            const top = foundation[foundation.length - 1];
            return top ? top.suit === card.suit && card.rank === top.rank + 1 : card.rank === 1;
        }

        canPlaceOnTableau(card, pile) {
            const top = pile[pile.length - 1];
            return top ? top.up && top.rank === card.rank + 1 && cards().isRed(top) !== cards().isRed(card) : card.rank === 13;
        }

        // Cartes qu'une source désigne (waste : la dernière ; tableau : de index à la fin ; fondation : la dernière).
        sourceCards(from) {
            if (from.zone === "waste") {
                return this.waste.slice(-1);
            }
            if (from.zone === "foundation") {
                return this.foundations[from.pile].slice(-1);
            }
            const pile = this.tableau[from.pile];
            const run = pile.slice(from.index);
            return run.length > 0 && run.every((card) => card.up) ? run : [];
        }

        canMove(from, to) {
            const moving = this.sourceCards(from);
            if (moving.length === 0) {
                return false;
            }
            if (to.zone === "foundation") {
                return moving.length === 1 && this.canPlaceOnFoundation(moving[0], this.foundations[to.pile]);
            }
            if (from.zone === "tableau" && from.pile === to.pile) {
                return false;
            }
            return this.canPlaceOnTableau(moving[0], this.tableau[to.pile]);
        }

        move(from, to) {
            if (!this.canMove(from, to)) {
                return false;
            }
            this.remember();
            const moving = this.sourceCards(from);
            if (from.zone === "waste") {
                this.waste.pop();
            } else if (from.zone === "foundation") {
                this.foundations[from.pile].pop();
            } else {
                this.tableau[from.pile].splice(from.index);
                const exposed = this.tableau[from.pile][this.tableau[from.pile].length - 1];
                if (exposed && !exposed.up) {
                    exposed.up = true;
                    this.addScore(5);
                }
            }
            if (to.zone === "foundation") {
                this.foundations[to.pile].push(...moving);
                this.addScore(from.zone === "foundation" ? 0 : 10);
            } else {
                this.tableau[to.pile].push(...moving);
                this.addScore(from.zone === "waste" ? 5 : from.zone === "foundation" ? -15 : 0);
            }
            this.moves += 1;
            return true;
        }

        // Envoie la carte d'une source vers la première fondation qui l'accepte.
        autoMove(from) {
            const moving = this.sourceCards(from);
            if (moving.length !== 1) {
                return false;
            }
            const target = this.foundations.findIndex((foundation) => this.canPlaceOnFoundation(moving[0], foundation));
            return target >= 0 && this.move(from, { zone: "foundation", pile: target });
        }

        // Pioche : 1 ou 3 cartes ; pioche vide : la défausse est retournée (recyclage).
        drawStock() {
            if (this.stock.length === 0 && this.waste.length === 0) {
                return false;
            }
            this.remember();
            if (this.stock.length === 0) {
                this.stock = this.waste.reverse().map((card) => ({ ...card, up: false }));
                this.waste = [];
                if (this.drawCount === 1) {
                    this.addScore(-100);
                }
            } else {
                for (let count = 0; count < this.drawCount && this.stock.length > 0; count += 1) {
                    const card = this.stock.pop();
                    card.up = true;
                    this.waste.push(card);
                }
            }
            this.moves += 1;
            return true;
        }

        hasWon() {
            return this.foundations.every((foundation) => foundation.length === 13);
        }
    }

    // --- Interface --------------------------------------------------------------------------------------------------

    const utils = () => window.Win95Utils;

    class Win95Solitaire {
        constructor(rootElement) {
            this.rootElement = rootElement;
            this.bodyElement = rootElement.querySelector("[data-app-body]");
            if (!this.bodyElement) {
                return;
            }
            this.storageKey = `${STORAGE_PREFIX}.${utils().getCurrentUserId()}`;
            const saved = utils().readStoredJson(this.storageKey, {}) || {};
            this.settings = { drawCount: saved.drawCount === 1 ? 1 : 3, scoring: saved.scoring === "none" ? "none" : "standard", back: saved.back || "crosshatch" };
            this.engine = new Engine(this.settings);
            this.seconds = 0;
            this.timer = null;
            this.drag = null;
            this.animation = null;
            this.hitBoxes = [];

            window.Win95MenuBar.mount(this.bodyElement, [
                {
                    label: "Jeu",
                    items: () => [
                        { label: "Nouvelle donne", hint: "F2", onSelect: () => this.newGame() },
                        { label: "Annuler", hint: "Ctrl+Z", disabled: this.engine.history.length === 0, onSelect: () => this.undo() },
                        { separator: true },
                        { label: "Dos des cartes…", onSelect: () => void this.chooseBack() },
                        { label: "Options…", onSelect: () => void this.options() },
                        { separator: true },
                        { label: "Quitter", onSelect: () => window.Win95WindowManager?.closeWindow(rootElement) }
                    ]
                },
                { label: "?", items: [{ label: "À propos du Solitaire", onSelect: () => void window.Win95Dialog.alert({ title: "À propos du Solitaire", message: "Solitaire Windows 95 (simulation).\nDéplacez les cartes à la souris ; double-cliquez sur une carte pour l'envoyer à une fondation." }) }] }
            ]);

            this.canvas = document.createElement("canvas");
            this.canvas.width = CANVAS_WIDTH;
            this.canvas.height = CANVAS_HEIGHT;
            this.canvas.className = "cards-table";
            this.canvas.tabIndex = 0;
            this.canvas.setAttribute("aria-label", "Table de Solitaire");
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
                    this.newGame();
                } else if (event.ctrlKey && event.key.toLowerCase() === "z") {
                    event.preventDefault();
                    this.undo();
                }
            });
            rootElement.addEventListener("win95:window-closed", () => {
                this.stopTimer();
                this.stopAnimation();
            }, { once: true });
            rootElement.__win95SolitaireInstance = this;
            window.Win95Utils.fitWindow(rootElement, this.frame, { extraHeight: this.bodyElement.querySelector(".win95-menubar").offsetHeight + 1 });
            this.render();
        }

        save() {
            utils().writeStoredJson(this.storageKey, this.settings);
        }

        newGame() {
            this.stopAnimation();
            this.stopTimer();
            this.engine = new Engine(this.settings);
            this.seconds = 0;
            this.render();
        }

        undo() {
            if (this.animation) {
                return;
            }
            if (this.engine.undo()) {
                this.render();
            }
        }

        async chooseBack() {
            const values = await window.Win95Dialog.form({
                title: "Dos des cartes",
                message: "Choisissez le dos des cartes :",
                fields: [{ name: "back", type: "select", label: "Dos :", value: this.settings.back, options: cards().BACKS.map((back) => ({ value: back.key, label: back.label })) }]
            });
            if (values) {
                this.settings.back = values.back;
                this.save();
                this.render();
            }
        }

        async options() {
            const values = await window.Win95Dialog.form({
                title: "Options",
                message: "Les changements s'appliquent à la prochaine donne.",
                fields: [
                    { name: "draw", type: "select", label: "Tirer :", value: String(this.settings.drawCount), options: [{ value: "1", label: "Une carte" }, { value: "3", label: "Trois cartes" }] },
                    { name: "scoring", type: "select", label: "Score :", value: this.settings.scoring, options: [{ value: "standard", label: "Standard" }, { value: "none", label: "Aucun" }] }
                ]
            });
            if (values) {
                this.settings.drawCount = values.draw === "1" ? 1 : 3;
                this.settings.scoring = values.scoring === "none" ? "none" : "standard";
                this.save();
                this.newGame();
            }
        }

        startTimer() {
            if (!this.timer) {
                this.timer = window.setInterval(() => {
                    this.seconds += 1;
                    this.updateStatus();
                }, 1000);
            }
        }

        stopTimer() {
            window.clearInterval(this.timer);
            this.timer = null;
        }

        updateStatus() {
            const { engine } = this;
            this.statusElement.textContent = `${engine.scoring === "standard" ? `Score : ${engine.score}   ` : ""}Temps : ${this.seconds} s   Coups : ${engine.moves}`;
        }

        // --- Géométrie --------------------------------------------------------------------------------------------

        columnX(column) {
            return MARGIN + column * COLUMN;
        }

        // Décalage vertical des cartes d'une colonne, réduit si la colonne dépasserait de la table.
        tableauSteps(pile) {
            const available = CANVAS_HEIGHT - TABLEAU_TOP - cards().CARD_HEIGHT - 8;
            const down = pile.filter((card) => !card.up).length;
            const up = pile.length - down;
            const wanted = down * FACE_DOWN_STEP + Math.max(0, up - 1) * FACE_UP_STEP;
            const upStep = wanted > available && up > 1 ? Math.max(8, (available - down * FACE_DOWN_STEP) / (up - 1)) : FACE_UP_STEP;
            return { down: FACE_DOWN_STEP, up: upStep };
        }

        // Construit la liste des zones cliquables en dessinant (du fond vers le dessus).
        render() {
            const context = this.canvas.getContext("2d");
            const { engine } = this;
            const back = this.settings.back;
            context.fillStyle = "#008000";
            context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            this.hitBoxes = [];
            const { CARD_WIDTH: W, CARD_HEIGHT: H } = cards();
            const dragged = this.drag?.moved ? new Set(this.drag.cards.map((card) => card.id)) : new Set();

            // Pioche
            const stockX = this.columnX(0);
            if (engine.stock.length > 0) {
                cards().drawCard(context, null, stockX, TOP_ROW, { faceUp: false, backStyle: back });
            } else {
                cards().drawSlot(context, stockX, TOP_ROW, engine.waste.length > 0 ? "↺" : "");
            }
            this.hitBoxes.push({ zone: "stock", x: stockX, y: TOP_ROW, w: W, h: H });

            // Défausse : jusqu'à 3 cartes en éventail (tirage par 3), seule la dernière est jouable.
            const wasteX = this.columnX(1);
            cards().drawSlot(context, wasteX, TOP_ROW);
            const shown = engine.waste.slice(-(engine.drawCount === 3 ? 3 : 1));
            shown.forEach((card, index) => {
                if (dragged.has(card.id)) {
                    return;
                }
                const x = wasteX + index * 14;
                cards().drawCard(context, card, x, TOP_ROW);
                if (index === shown.length - 1) {
                    this.hitBoxes.push({ zone: "waste", x, y: TOP_ROW, w: W, h: H, card });
                }
            });

            // Fondations
            engine.foundations.forEach((foundation, pile) => {
                const x = this.columnX(3 + pile);
                cards().drawSlot(context, x, TOP_ROW, "A");
                const visible = foundation.filter((card) => !dragged.has(card.id));
                const top = visible[visible.length - 1];
                if (top) {
                    cards().drawCard(context, top, x, TOP_ROW);
                }
                this.hitBoxes.push({ zone: "foundation", pile, x, y: TOP_ROW, w: W, h: H, card: top, drop: true });
            });

            // Colonnes
            engine.tableau.forEach((pile, column) => {
                const x = this.columnX(column);
                cards().drawSlot(context, x, TABLEAU_TOP, pile.length === 0 ? "R" : "");
                const steps = this.tableauSteps(pile);
                let y = TABLEAU_TOP;
                let lastY = TABLEAU_TOP;
                pile.forEach((card, index) => {
                    lastY = y;
                    if (!dragged.has(card.id)) {
                        cards().drawCard(context, card, x, y, { faceUp: card.up, backStyle: back });
                        if (card.up) {
                            this.hitBoxes.push({ zone: "tableau", pile: column, index, x, y, w: W, h: H, card, bottom: index === pile.length - 1 });
                        }
                    }
                    y += card.up ? steps.up : steps.down;
                });
                this.hitBoxes.push({ zone: "tableau-drop", pile: column, x, y: pile.length ? lastY : TABLEAU_TOP, w: W, h: H, drop: true });
            });

            // Cartes en cours de glissement, par-dessus tout.
            if (this.drag?.moved) {
                this.drag.cards.forEach((card, index) => {
                    cards().drawCard(context, card, this.drag.x, this.drag.y + index * FACE_UP_STEP);
                });
            }
            this.updateStatus();
        }

        // --- Souris -----------------------------------------------------------------------------------------------------

        position(event) {
            const rect = this.canvas.getBoundingClientRect();
            return { x: ((event.clientX - rect.left) * CANVAS_WIDTH) / rect.width, y: ((event.clientY - rect.top) * CANVAS_HEIGHT) / rect.height };
        }

        hit(point) {
            for (let index = this.hitBoxes.length - 1; index >= 0; index -= 1) {
                const box = this.hitBoxes[index];
                if (box.zone !== "tableau-drop" && point.x >= box.x && point.x < box.x + box.w && point.y >= box.y && point.y < box.y + box.h) {
                    // Une pile : la carte du dessus recouvre celles d'en dessous.
                    return box;
                }
            }
            return null;
        }

        pointerDown(event) {
            if (event.button !== 0 || this.animation) {
                return;
            }
            const point = this.position(event);
            const box = this.hit(point);
            this.canvas.focus();
            if (!box) {
                return;
            }
            if (box.zone === "stock") {
                if (this.engine.drawStock()) {
                    this.startTimer();
                    this.render();
                }
                return;
            }
            if (!box.card) {
                return;
            }
            const from = box.zone === "tableau" ? { zone: "tableau", pile: box.pile, index: box.index } : { zone: box.zone, pile: box.pile };
            const moving = this.engine.sourceCards(from);
            if (moving.length === 0) {
                return;
            }
            this.drag = { from, cards: moving, offsetX: point.x - box.x, offsetY: point.y - box.y, startX: point.x, startY: point.y, x: box.x, y: box.y, moved: false };
            this.canvas.setPointerCapture(event.pointerId);
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

        // Cible de dépôt : la zone valide qui recouvre le plus la carte déposée.
        findDropTarget() {
            const { drag } = this;
            const { CARD_WIDTH: W, CARD_HEIGHT: H } = cards();
            let best = null;
            this.hitBoxes.filter((box) => box.drop).forEach((box) => {
                const overlapX = Math.min(drag.x + W, box.x + box.w) - Math.max(drag.x, box.x);
                const overlapY = Math.min(drag.y + H, box.y + box.h) - Math.max(drag.y, box.y);
                if (overlapX <= 0 || overlapY <= 0) {
                    return;
                }
                const to = box.zone === "foundation" ? { zone: "foundation", pile: box.pile } : { zone: "tableau", pile: box.pile };
                if (this.engine.canMove(drag.from, to) && (!best || overlapX * overlapY > best.area)) {
                    best = { to, area: overlapX * overlapY };
                }
            });
            return best?.to || null;
        }

        pointerUp(event) {
            const { drag } = this;
            if (!drag) {
                return;
            }
            this.drag = null;
            this.canvas.releasePointerCapture?.(event.pointerId);
            if (drag.moved) {
                this.drag = drag;
                const target = this.findDropTarget();
                this.drag = null;
                if (target && this.engine.move(drag.from, target)) {
                    this.startTimer();
                }
            }
            this.render();
            this.checkWin();
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
            if (box?.card && (box.zone === "waste" || (box.zone === "tableau" && box.bottom))) {
                const from = box.zone === "tableau" ? { zone: "tableau", pile: box.pile, index: box.index } : { zone: "waste" };
                if (this.engine.autoMove(from)) {
                    this.startTimer();
                    this.render();
                    this.checkWin();
                }
            }
        }

        // --- Victoire : cascade de cartes rebondissantes ---------------------------------------------------------

        checkWin() {
            if (!this.engine.hasWon() || this.animation) {
                return;
            }
            this.stopTimer();
            window.Win95Sounds?.play("exclamation");
            this.startWinAnimation();
        }

        startWinAnimation() {
            const items = [];
            for (let rank = 13; rank >= 1; rank -= 1) {
                this.engine.foundations.forEach((foundation, pile) => {
                    items.push({ card: foundation[rank - 1], x: this.columnX(3 + pile), y: TOP_ROW });
                });
            }
            const cancel = window.Win95Cards.cascade(this.canvas, items, () => {
                this.animation = null;
                window.setTimeout(() => void this.askAgain(), 400);
            });
            this.animation = { cancel };
        }

        stopAnimation() {
            if (this.animation) {
                this.animation.cancel();
                this.animation = null;
            }
        }

        async askAgain() {
            if (!this.rootElement.isConnected) {
                return;
            }
            const again = await window.Win95Dialog.confirm({
                title: "Solitaire",
                message: `Vous avez gagné en ${this.seconds} secondes !\nVoulez-vous jouer une nouvelle partie ?`,
                confirmLabel: "Oui",
                icon: "msg_question-0.png"
            });
            if (again) {
                this.newGame();
            }
        }
    }

    const api = {
        Engine,
        attach(rootElement) {
            return rootElement?.__win95SolitaireInstance || new Win95Solitaire(rootElement);
        }
    };

    window.Win95Solitaire = api;
    window.Win95Services?.register?.("Win95Solitaire", api);
})();
