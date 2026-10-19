(() => {
    // Cœurs (Win95Hearts) : vous (en bas) contre trois joueurs automatiques (Ouest, Nord, Est).
    // Règles : 13 cartes chacun ; passage de 3 cartes (à gauche, à droite, en face, puis sans passage) ; le 2 de trèfle ouvre ;
    // pas de cœur ni de dame de pique au premier pli (sauf si l'on n'a rien d'autre) ; on ne coupe pas à cœur tant qu'aucun cœur
    // n'est tombé (sauf main de cœurs) ; chaque cœur vaut 1 point, la dame de pique 13 ; « tout prendre » (26 points) donne
    // 0 au preneur et 26 aux autres ; la partie s'arrête quand un joueur atteint 100 points : le plus bas score gagne.
    //  - Engine : règles et intelligence artificielle, sans interface (testable) ;
    //  - ordre de jeu : 0 = vous, 1 = Ouest, 2 = Nord, 3 = Est (sens des aiguilles d'une montre).

    const cards = () => window.Win95Cards;
    const NAMES = ["Vous", "Ouest", "Nord", "Est"];
    const END_SCORE = 100;
    const QUEEN_OF_SPADES = { suit: 3, rank: 12 };
    const CANVAS_WIDTH = 640;
    const CANVAS_HEIGHT = 470;

    const power = (card) => (card.rank === 1 ? 14 : card.rank);   // l'as est la plus forte carte
    const isQueenOfSpades = (card) => card.suit === 3 && card.rank === 12;
    const pointsOf = (card) => (card.suit === 2 ? 1 : isQueenOfSpades(card) ? 13 : 0);
    const sortHand = (hand) => hand.sort((left, right) => left.suit - right.suit || power(left) - power(right));

    // --- Moteur -------------------------------------------------------------------------------------------------

    class Engine {
        constructor(random = Math.random) {
            this.random = random;
            this.newGame();
        }

        newGame() {
            this.scores = [0, 0, 0, 0];
            this.handNumber = 0;
            this.winner = null;
            this.newHand();
        }

        // Direction du passage : 0 gauche (vers le joueur suivant), 1 droite, 2 en face, 3 aucun.
        get passDirection() {
            return this.handNumber % 4;
        }

        newHand() {
            const deck = cards().shuffle(cards().createDeck(), this.random);
            this.hands = [0, 1, 2, 3].map((player) => sortHand(deck.slice(player * 13, player * 13 + 13)));
            this.trick = [];
            this.taken = [[], [], [], []];
            this.heartsBroken = false;
            this.trickNumber = 0;
            this.handScores = [0, 0, 0, 0];
            this.pending = null;
            if (this.passDirection === 3) {
                this.phase = "playing";
                this.startPlay();
            } else {
                this.phase = "passing";
            }
        }

        startPlay() {
            this.phase = "playing";
            const opener = this.hands.findIndex((hand) => hand.some((card) => card.suit === 0 && card.rank === 2));
            this.leader = opener;
            this.turn = opener;
        }

        // --- Passage ---
        passTarget(player) {
            return [(player + 1) % 4, (player + 3) % 4, (player + 2) % 4][this.passDirection];
        }

        // Les automates choisissent, puis le joueur humain donne ses trois cartes ; l'échange se fait d'un coup.
        submitPass(humanCards) {
            if (this.phase !== "passing" || humanCards.length !== 3 || !humanCards.every((card) => this.hands[0].some((owned) => owned.id === card.id))) {
                return false;
            }
            const chosen = [humanCards, this.aiChoosePass(1), this.aiChoosePass(2), this.aiChoosePass(3)];
            const received = [[], [], [], []];
            chosen.forEach((give, player) => {
                this.hands[player] = this.hands[player].filter((card) => !give.some((given) => given.id === card.id));
                received[this.passTarget(player)].push(...give);
            });
            received.forEach((cardsIn, player) => {
                this.hands[player].push(...cardsIn);
                sortHand(this.hands[player]);
            });
            this.received = received[0];
            this.startPlay();
            return true;
        }

        aiChoosePass(player) {
            const hand = this.hands[player];
            const spades = hand.filter((card) => card.suit === 3);
            const hasQueen = spades.some(isQueenOfSpades);
            const suitCount = [0, 1, 2, 3].map((suit) => hand.filter((card) => card.suit === suit).length);
            const risk = (card) => {
                if (isQueenOfSpades(card)) {
                    return spades.length >= 6 ? 20 : 100;
                }
                if (card.suit === 3 && power(card) > 12) {
                    return !hasQueen && spades.length <= 4 ? 60 : 8;
                }
                if (card.suit === 2) {
                    return 10 + power(card) * 3;
                }
                // Se créer une couleur vide aide à défausser ensuite.
                return power(card) + (suitCount[card.suit] <= 2 ? 22 : 0);
            };
            return hand.slice().sort((left, right) => risk(right) - risk(left)).slice(0, 3);
        }

        // --- Règles du pli ---
        legalPlays(player) {
            const hand = this.hands[player];
            if (this.trick.length === 0) {
                if (this.trickNumber === 0) {
                    return hand.filter((card) => card.suit === 0 && card.rank === 2);
                }
                const nonHearts = hand.filter((card) => card.suit !== 2);
                return !this.heartsBroken && nonHearts.length > 0 ? nonHearts : hand.slice();
            }
            const ledSuit = this.trick[0].card.suit;
            const follow = hand.filter((card) => card.suit === ledSuit);
            if (follow.length > 0) {
                return follow;
            }
            if (this.trickNumber === 0) {
                const safe = hand.filter((card) => pointsOf(card) === 0);
                return safe.length > 0 ? safe : hand.slice();
            }
            return hand.slice();
        }

        play(player, card) {
            if (this.phase !== "playing" || player !== this.turn || this.trick.length >= 4 || !this.legalPlays(player).some((legal) => legal.id === card.id)) {
                return false;
            }
            this.hands[player] = this.hands[player].filter((owned) => owned.id !== card.id);
            this.trick.push({ player, card });
            if (card.suit === 2) {
                this.heartsBroken = true;
            }
            if (this.trick.length < 4) {
                this.turn = (player + 1) % 4;
            }
            return true;
        }

        get trickComplete() {
            return this.trick.length === 4;
        }

        trickWinner() {
            const ledSuit = this.trick[0].card.suit;
            return this.trick.filter((entry) => entry.card.suit === ledSuit).sort((left, right) => power(right.card) - power(left.card))[0].player;
        }

        // Ramasse le pli ; renvoie { winner, points, handOver }.
        collectTrick() {
            const winner = this.trickWinner();
            const taken = this.trick.map((entry) => entry.card);
            const points = taken.reduce((total, card) => total + pointsOf(card), 0);
            this.taken[winner].push(...taken);
            this.trick = [];
            this.trickNumber += 1;
            this.leader = winner;
            this.turn = winner;
            const handOver = this.trickNumber === 13;
            if (handOver) {
                this.finishHand();
            }
            return { winner, points, handOver };
        }

        finishHand() {
            const raw = this.taken.map((pile) => pile.reduce((total, card) => total + pointsOf(card), 0));
            const moonShooter = raw.findIndex((value) => value === 26);
            this.moonShooter = moonShooter;
            this.handScores = moonShooter >= 0 ? raw.map((_, player) => (player === moonShooter ? 0 : 26)) : raw;
            this.handScores.forEach((points, player) => {
                this.scores[player] += points;
            });
            if (Math.max(...this.scores) >= END_SCORE) {
                this.phase = "gameOver";
                const best = Math.min(...this.scores);
                this.winner = this.scores.indexOf(best);
            } else {
                this.phase = "handOver";
            }
        }

        nextHand() {
            this.handNumber += 1;
            this.newHand();
        }

        // --- Intelligence artificielle ---
        aiChoosePlay(player) {
            const legal = this.legalPlays(player);
            if (legal.length === 1) {
                return legal[0];
            }
            const byPower = (cardsList) => cardsList.slice().sort((left, right) => power(left) - power(right));
            // Entame : la plus petite carte, en évitant les cœurs et les piques dangereux.
            if (this.trick.length === 0) {
                const safe = legal.filter((card) => card.suit !== 2 && !(card.suit === 3 && power(card) >= 12));
                return byPower(safe.length > 0 ? safe : legal)[0];
            }
            const ledSuit = this.trick[0].card.suit;
            const trickPoints = this.trick.reduce((total, entry) => total + pointsOf(entry.card), 0);
            const winning = this.trick.filter((entry) => entry.card.suit === ledSuit).sort((left, right) => power(right.card) - power(left.card))[0].card;
            const following = legal.filter((card) => card.suit === ledSuit);
            if (following.length > 0) {
                const lower = byPower(following.filter((card) => power(card) < power(winning)));
                if (lower.length > 0) {
                    return lower[lower.length - 1];     // la plus haute carte qui ne prend pas le pli
                }
                const sorted = byPower(following);
                const last = this.trick.length === 3;
                if (last && trickPoints === 0) {
                    const withoutQueen = sorted.filter((card) => !isQueenOfSpades(card));
                    return (withoutQueen.length > 0 ? withoutQueen : sorted)[(withoutQueen.length > 0 ? withoutQueen : sorted).length - 1];
                }
                return sorted[0];
            }
            // Défausse : dame de pique d'abord, puis le plus gros cœur, puis la plus forte carte.
            const queen = legal.find(isQueenOfSpades);
            if (queen) {
                return queen;
            }
            const hearts = byPower(legal.filter((card) => card.suit === 2));
            if (hearts.length > 0) {
                return hearts[hearts.length - 1];
            }
            const highSpade = legal.find((card) => card.suit === 3 && power(card) > 12 && !this.taken.some((pile) => pile.some(isQueenOfSpades)));
            return highSpade || byPower(legal)[legal.length - 1];
        }
    }

    // --- Interface --------------------------------------------------------------------------------------------------

    class Win95Hearts {
        constructor(rootElement) {
            this.rootElement = rootElement;
            this.bodyElement = rootElement.querySelector("[data-app-body]");
            if (!this.bodyElement) {
                return;
            }
            this.engine = new Engine();
            this.selection = new Set();
            this.message = "";
            this.timers = new Set();
            this.destroyed = false;
            this.collecting = false;

            window.Win95MenuBar.mount(this.bodyElement, [
                {
                    label: "Jeu",
                    items: () => [
                        { label: "Nouvelle partie", hint: "F2", onSelect: () => this.newGame() },
                        { label: "Scores…", onSelect: () => void this.showScores() },
                        { separator: true },
                        { label: "Quitter", onSelect: () => window.Win95WindowManager?.closeWindow(rootElement) }
                    ]
                },
                {
                    label: "?",
                    items: [
                        { label: "Règles du jeu…", onSelect: () => void window.Win95Dialog.alert({ title: "Règles de Cœurs", message: "Évitez les cœurs (1 point) et la dame de pique (13 points).\nLe 2 de trèfle ouvre. On ne peut pas jouer cœur en premier tant qu'un cœur n'est pas tombé.\nSi un joueur prend tous les points, il marque 0 et les autres 26.\nLa partie s'arrête à 100 points : le plus petit score gagne." }) },
                        { label: "À propos de Cœurs", onSelect: () => void window.Win95Dialog.alert({ title: "À propos de Cœurs", message: "Cœurs Windows 95 (simulation)." }) }
                    ]
                }
            ]);

            this.canvas = document.createElement("canvas");
            this.canvas.width = CANVAS_WIDTH;
            this.canvas.height = CANVAS_HEIGHT;
            this.canvas.className = "cards-table";
            this.canvas.tabIndex = 0;
            this.canvas.setAttribute("aria-label", "Table de Cœurs");
            this.bar = document.createElement("div");
            this.bar.className = "explorer-status cards-status hearts-bar";
            this.statusText = document.createElement("span");
            this.statusText.className = "hearts-message";
            this.passButton = document.createElement("button");
            this.passButton.type = "button";
            this.passButton.className = "btn start-btn hearts-pass";
            this.passButton.textContent = "Passer";
            this.passButton.addEventListener("click", () => this.submitPass());
            this.bar.append(this.statusText, this.passButton);
            this.frame = document.createElement("div");
            this.frame.className = "cards-frame";
            this.frame.append(this.canvas, this.bar);
            this.bodyElement.appendChild(this.frame);
            this.canvas.addEventListener("click", (event) => this.click(event));
            rootElement.tabIndex = -1;
            rootElement.addEventListener("keydown", (event) => {
                if (event.key === "F2") {
                    event.preventDefault();
                    this.newGame();
                }
            });
            rootElement.addEventListener("win95:window-closed", () => {
                this.destroyed = true;
                this.timers.forEach((timer) => window.clearTimeout(timer));
            }, { once: true });
            rootElement.__win95HeartsInstance = this;
            window.Win95Utils.fitWindow(rootElement, this.frame, { extraHeight: this.bodyElement.querySelector(".win95-menubar").offsetHeight + 1 });
            this.startHand();
        }

        later(callback, delay) {
            const timer = window.setTimeout(() => {
                this.timers.delete(timer);
                if (!this.destroyed) {
                    callback();
                }
            }, delay);
            this.timers.add(timer);
        }

        newGame() {
            this.timers.forEach((timer) => window.clearTimeout(timer));
            this.timers.clear();
            this.collecting = false;
            this.engine.newGame();
            this.startHand();
        }

        startHand() {
            this.selection.clear();
            const { engine } = this;
            if (engine.phase === "passing") {
                const direction = ["à votre gauche (Ouest)", "à votre droite (Est)", "en face (Nord)"][engine.passDirection];
                this.message = `Choisissez 3 cartes à passer ${direction}.`;
            } else {
                this.message = "Pas de passage cette manche.";
            }
            this.render();
            this.advance();
        }

        // --- Déroulement ------------------------------------------------------------------------------------------

        advance() {
            const { engine } = this;
            if (this.destroyed || engine.phase !== "playing") {
                return;
            }
            if (engine.trickComplete) {
                if (!this.collecting) {
                    this.collecting = true;
                    this.later(() => this.collect(), 1000);
                }
                return;
            }
            if (engine.turn === 0) {
                this.message = engine.trickNumber === 0 && engine.trick.length === 0 ? "Jouez le 2 de trèfle." : "À vous de jouer.";
                this.render();
                return;
            }
            this.message = `${NAMES[engine.turn]} réfléchit…`;
            this.render();
            this.later(() => {
                const card = engine.aiChoosePlay(engine.turn);
                if (engine.play(engine.turn, card)) {
                    this.render();
                    this.advance();
                }
            }, 650);
        }

        async collect() {
            const { engine } = this;
            const result = engine.collectTrick();
            this.collecting = false;
            this.message = result.points > 0 ? `${NAMES[result.winner]} prend le pli (${result.points} point${result.points > 1 ? "s" : ""}).` : `${NAMES[result.winner]} prend le pli.`;
            this.render();
            if (result.handOver) {
                await this.endHand();
                return;
            }
            this.advance();
        }

        async endHand() {
            const { engine } = this;
            const lines = NAMES.map((name, player) => `${name.padEnd(6, " ")} ${String(engine.handScores[player]).padStart(3, " ")}  (total ${engine.scores[player]})`);
            const moon = engine.moonShooter >= 0 ? `\n${NAMES[engine.moonShooter]} a pris tous les points : 0 pour lui, 26 pour les autres !` : "";
            window.Win95Sounds?.play("asterisk");
            await window.Win95Dialog.alert({ title: "Fin de la manche", message: `${lines.join("\n")}${moon}` });
            if (this.destroyed) {
                return;
            }
            if (engine.phase === "gameOver") {
                const youWon = engine.winner === 0;
                const again = await window.Win95Dialog.confirm({
                    title: "Fin de la partie",
                    message: `${youWon ? "Bravo, vous avez gagné la partie !" : `${NAMES[engine.winner]} gagne la partie.`}\nVoulez-vous jouer une nouvelle partie ?`,
                    confirmLabel: "Oui",
                    icon: "msg_question-0.png"
                });
                if (again && !this.destroyed) {
                    this.newGame();
                }
                return;
            }
            engine.nextHand();
            this.startHand();
        }

        async showScores() {
            const { engine } = this;
            const lines = NAMES.map((name, player) => `${name.padEnd(6, " ")} ${String(engine.scores[player]).padStart(4, " ")}`);
            await window.Win95Dialog.alert({ title: "Scores", message: `Manche n° ${engine.handNumber + 1}\n${lines.join("\n")}` });
        }

        submitPass() {
            const { engine } = this;
            if (engine.phase !== "passing" || this.selection.size !== 3) {
                return;
            }
            const chosen = engine.hands[0].filter((card) => this.selection.has(card.id));
            if (engine.submitPass(chosen)) {
                this.selection.clear();
                const received = engine.received.map((card) => cards().describe(card)).join(", ");
                this.message = `Vous recevez : ${received}.`;
                this.render();
                this.later(() => this.advance(), 900);
            }
        }

        // --- Dessin -----------------------------------------------------------------------------------------------------

        humanCardRects() {
            const hand = this.engine.hands[0];
            const { CARD_WIDTH: W } = cards();
            const step = Math.min(32, (CANVAS_WIDTH - 100 - W) / Math.max(1, hand.length - 1));
            const width = W + (hand.length - 1) * step;
            const startX = (CANVAS_WIDTH - width) / 2;
            return hand.map((card, index) => ({ card, x: startX + index * step, y: CANVAS_HEIGHT - cards().CARD_HEIGHT - 14, w: index === hand.length - 1 ? W : step }));
        }

        render() {
            const context = this.canvas.getContext("2d");
            const { engine } = this;
            const { CARD_WIDTH: W, CARD_HEIGHT: H } = cards();
            context.fillStyle = "#008000";
            context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

            const legal = engine.phase === "playing" && engine.turn === 0 && !engine.trickComplete ? engine.legalPlays(0) : null;
            this.humanRects = this.humanCardRects();
            this.humanRects.forEach(({ card, x, y }) => {
                const raised = this.selection.has(card.id) ? -18 : 0;
                cards().drawCard(context, card, x, y + raised);
                if (legal && !legal.some((candidate) => candidate.id === card.id)) {
                    context.fillStyle = "rgba(128, 128, 128, 0.55)";
                    context.fillRect(x + 1, y + raised + 1, W - 2, H - 2);
                }
            });

            // Mains des automates : dos de cartes qui se chevauchent.
            const drawBacks = (count, x0, y0, dx, dy) => {
                for (let index = 0; index < count; index += 1) {
                    cards().drawCard(context, null, x0 + index * dx, y0 + index * dy, { faceUp: false });
                }
            };
            drawBacks(engine.hands[1].length, 14, 70, 0, 16);
            drawBacks(engine.hands[2].length, (CANVAS_WIDTH - (W + 12 * 16)) / 2, 14, 16, 0);
            drawBacks(engine.hands[3].length, CANVAS_WIDTH - W - 14, 70, 0, 16);

            // Noms et scores
            context.fillStyle = "#fff";
            context.font = "bold 13px Arial, sans-serif";
            context.textBaseline = "top";
            context.textAlign = "left";
            context.fillText(`Ouest : ${engine.scores[1]}`, 14, 48);
            context.textAlign = "center";
            context.fillText(`Nord : ${engine.scores[2]}`, CANVAS_WIDTH / 2, H + 18);
            context.textAlign = "right";
            context.fillText(`Est : ${engine.scores[3]}`, CANVAS_WIDTH - 14, 48);
            context.textAlign = "left";
            context.fillText(`Vous : ${engine.scores[0]}`, 14, CANVAS_HEIGHT - 26);

            // Pli en cours
            const center = { x: CANVAS_WIDTH / 2 - W / 2, y: 150 };
            const slots = [{ x: center.x, y: center.y + 54 }, { x: center.x - 70, y: center.y + 6 }, { x: center.x, y: center.y - 44 }, { x: center.x + 70, y: center.y + 6 }];
            engine.trick.forEach((entry) => cards().drawCard(context, entry.card, slots[entry.player].x, slots[entry.player].y));

            this.statusText.textContent = this.message;
            this.passButton.hidden = engine.phase !== "passing";
            this.passButton.disabled = this.selection.size !== 3;
        }

        click(event) {
            const { engine } = this;
            const rect = this.canvas.getBoundingClientRect();
            const x = ((event.clientX - rect.left) * CANVAS_WIDTH) / rect.width;
            const y = ((event.clientY - rect.top) * CANVAS_HEIGHT) / rect.height;
            // La carte du dessus est la dernière de la liste dont la zone contient le point.
            const target = [...this.humanRects].reverse().find((entry) => {
                const lift = this.selection.has(entry.card.id) ? -18 : 0;
                return x >= entry.x && x < entry.x + entry.w && y >= entry.y + lift && y < entry.y + lift + cards().CARD_HEIGHT;
            });
            if (!target) {
                return;
            }
            if (engine.phase === "passing") {
                if (this.selection.has(target.card.id)) {
                    this.selection.delete(target.card.id);
                } else if (this.selection.size < 3) {
                    this.selection.add(target.card.id);
                }
                this.render();
                return;
            }
            if (engine.phase === "playing" && engine.turn === 0 && !engine.trickComplete) {
                if (engine.play(0, target.card)) {
                    this.render();
                    this.advance();
                } else {
                    this.message = engine.trickNumber === 0 && engine.trick.length === 0
                        ? "Le 2 de trèfle ouvre la manche."
                        : engine.trick.length === 0 && !engine.heartsBroken ? "Les cœurs ne sont pas encore « cassés »." : "Vous devez fournir la couleur demandée.";
                    this.render();
                    window.Win95Sounds?.play("default-beep");
                }
            }
        }
    }

    const api = {
        Engine,
        NAMES,
        attach(rootElement) {
            return rootElement?.__win95HeartsInstance || new Win95Hearts(rootElement);
        }
    };

    window.Win95Hearts = api;
    window.Win95Services?.register?.("Win95Hearts", api);
})();
