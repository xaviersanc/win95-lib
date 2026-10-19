(() => {
    // Cartes à jouer (Win95Cards) : paquet, mélange, donne numérotée de FreeCell, dessin des cartes sur un <canvas>.
    // Une carte = { id: 0..51, rank: 1..13, suit: 0..3 } ; couleurs ♣ (0) ♦ (1) ♥ (2) ♠ (3), comme l'ordre des donnes de FreeCell.
    // Les cartes sont dessinées une fois dans des canvas hors écran (sprites) puis simplement recopiées : le glisser-déposer
    // reste fluide. Dimensions classiques : 71 × 96.

    const SUITS = ["♣", "♦", "♥", "♠"];
    const SUIT_NAMES = ["trèfle", "carreau", "cœur", "pique"];
    const RANK_LABELS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "V", "D", "R"];
    const RANK_NAMES = ["", "as", "2", "3", "4", "5", "6", "7", "8", "9", "10", "valet", "dame", "roi"];
    const CARD_WIDTH = 71;
    const CARD_HEIGHT = 96;
    const BACKS = [
        { key: "crosshatch", label: "Croisillons bleus" },
        { key: "diamonds", label: "Losanges rouges" },
        { key: "dots", label: "Pois verts" },
        { key: "stripes", label: "Rayures" }
    ];

    function makeCard(id) {
        return { id, rank: Math.floor(id / 4) + 1, suit: id % 4 };
    }

    function isRed(card) {
        return card.suit === 1 || card.suit === 2;
    }

    function describe(card) {
        return `${RANK_NAMES[card.rank]} de ${SUIT_NAMES[card.suit]}`;
    }

    function createDeck() {
        return Array.from({ length: 52 }, (_, id) => makeCard(id));
    }

    // Mélange de Fisher-Yates avec un générateur donné (Math.random par défaut).
    function shuffle(cards, random = Math.random) {
        const deck = cards.slice();
        for (let index = deck.length - 1; index > 0; index -= 1) {
            const swap = Math.floor(random() * (index + 1));
            [deck[index], deck[swap]] = [deck[swap], deck[index]];
        }
        return deck;
    }

    // Générateur congruentiel de Microsoft (celui des donnes numérotées de FreeCell).
    function microsoftRandom(seed) {
        let state = seed >>> 0;
        return () => {
            state = (Math.imul(state, 214013) + 2531011) >>> 0;
            return (state >>> 16) & 0x7fff;
        };
    }

    // Donne n° `seed` de FreeCell : 8 colonnes (4 de 7 cartes puis 4 de 6), tableau de colonnes de cartes.
    function dealFreeCell(seed) {
        const next = microsoftRandom(seed);
        const deck = Array.from({ length: 52 }, (_, id) => id);
        const columns = Array.from({ length: 8 }, () => []);
        let remaining = 52;
        for (let dealt = 0; dealt < 52; dealt += 1) {
            const pick = next() % remaining;
            columns[dealt % 8].push(makeCard(deck[pick]));
            deck[pick] = deck[remaining - 1];
            remaining -= 1;
        }
        return columns;
    }

    // --- Dessin ---------------------------------------------------------------------------------------------

    function roundRect(context, x, y, width, height, radius) {
        context.beginPath();
        context.moveTo(x + radius, y);
        context.arcTo(x + width, y, x + width, y + height, radius);
        context.arcTo(x + width, y + height, x, y + height, radius);
        context.arcTo(x, y + height, x, y, radius);
        context.arcTo(x, y, x + width, y, radius);
        context.closePath();
    }

    function drawFace(context, card, width, height) {
        roundRect(context, 0.5, 0.5, width - 1, height - 1, 5);
        context.fillStyle = "#fff";
        context.fill();
        context.strokeStyle = "#000";
        context.lineWidth = 1;
        context.stroke();
        const color = isRed(card) ? "#d00000" : "#000";
        context.fillStyle = color;
        context.textBaseline = "top";
        context.textAlign = "left";
        context.font = "bold 15px Arial, sans-serif";
        context.fillText(RANK_LABELS[card.rank], 5, 3);
        context.font = "14px Arial, sans-serif";
        context.fillText(SUITS[card.suit], 5, 19);
        // Coin opposé, retourné.
        context.save();
        context.translate(width, height);
        context.rotate(Math.PI);
        context.font = "bold 15px Arial, sans-serif";
        context.fillText(RANK_LABELS[card.rank], 5, 3);
        context.font = "14px Arial, sans-serif";
        context.fillText(SUITS[card.suit], 5, 19);
        context.restore();
        // Centre : grande couleur ; figures : lettre encadrée.
        context.textAlign = "center";
        context.textBaseline = "middle";
        if (card.rank >= 11) {
            context.strokeStyle = color;
            context.strokeRect(width / 2 - 17, height / 2 - 24, 34, 48);
            context.font = "bold 30px Georgia, serif";
            context.fillText(RANK_LABELS[card.rank], width / 2, height / 2 - 6);
            context.font = "20px Arial, sans-serif";
            context.fillText(SUITS[card.suit], width / 2, height / 2 + 16);
        } else {
            context.font = card.rank === 1 ? "40px Arial, sans-serif" : "30px Arial, sans-serif";
            context.fillText(SUITS[card.suit], width / 2, height / 2 + 2);
        }
    }

    function drawBackSprite(context, width, height, style) {
        roundRect(context, 0.5, 0.5, width - 1, height - 1, 5);
        context.fillStyle = "#fff";
        context.fill();
        context.strokeStyle = "#000";
        context.stroke();
        context.save();
        roundRect(context, 4, 4, width - 8, height - 8, 3);
        context.clip();
        const palette = { crosshatch: ["#0000a0", "#8080ff"], diamonds: ["#a00000", "#ffb0b0"], dots: ["#006000", "#90e090"], stripes: ["#800080", "#e0a0e0"] }[style] || ["#0000a0", "#8080ff"];
        context.fillStyle = palette[0];
        context.fillRect(0, 0, width, height);
        context.strokeStyle = palette[1];
        context.lineWidth = 1;
        if (style === "crosshatch") {
            for (let offset = -height; offset < width + height; offset += 6) {
                context.beginPath();
                context.moveTo(offset, 0);
                context.lineTo(offset + height, height);
                context.moveTo(offset + height, 0);
                context.lineTo(offset, height);
                context.stroke();
            }
        } else if (style === "diamonds") {
            for (let y = 6; y < height; y += 12) {
                for (let x = 6; x < width; x += 12) {
                    context.beginPath();
                    context.moveTo(x, y - 4);
                    context.lineTo(x + 4, y);
                    context.lineTo(x, y + 4);
                    context.lineTo(x - 4, y);
                    context.closePath();
                    context.stroke();
                }
            }
        } else if (style === "dots") {
            context.fillStyle = palette[1];
            for (let y = 6; y < height; y += 8) {
                for (let x = 6 + ((y / 8) % 2) * 4; x < width; x += 8) {
                    context.fillRect(x, y, 2, 2);
                }
            }
        } else {
            for (let x = 4; x < width; x += 6) {
                context.beginPath();
                context.moveTo(x, 0);
                context.lineTo(x, height);
                context.stroke();
            }
        }
        context.restore();
    }

    const spriteCache = new Map();

    function makeSprite(width, height, paint) {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        paint(canvas.getContext("2d"));
        return canvas;
    }

    // Sprite d'une carte (visage) ou du dos (card = null).
    function getSprite(card, backStyle = "crosshatch") {
        const key = card ? `f${card.id}` : `b${backStyle}`;
        if (!spriteCache.has(key)) {
            spriteCache.set(key, makeSprite(CARD_WIDTH, CARD_HEIGHT, (context) => {
                if (card) {
                    drawFace(context, card, CARD_WIDTH, CARD_HEIGHT);
                } else {
                    drawBackSprite(context, CARD_WIDTH, CARD_HEIGHT, backStyle);
                }
            }));
        }
        return spriteCache.get(key);
    }

    // Emplacement vide : contour discret, avec un symbole facultatif (ex. « A » d'une fondation, « R » d'une colonne vide).
    function drawSlot(context, x, y, symbol = "") {
        context.save();
        roundRect(context, x + 0.5, y + 0.5, CARD_WIDTH - 1, CARD_HEIGHT - 1, 5);
        context.fillStyle = "rgba(0, 0, 0, 0.12)";
        context.fill();
        context.strokeStyle = "rgba(0, 0, 0, 0.45)";
        context.stroke();
        if (symbol) {
            context.fillStyle = "rgba(255, 255, 255, 0.55)";
            context.font = "bold 30px Arial, sans-serif";
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText(symbol, x + CARD_WIDTH / 2, y + CARD_HEIGHT / 2);
        }
        context.restore();
    }

    function drawCard(context, card, x, y, { faceUp = true, backStyle = "crosshatch", highlight = false } = {}) {
        context.drawImage(getSprite(faceUp ? card : null, backStyle), x, y);
        if (highlight) {
            context.save();
            roundRect(context, x + 0.5, y + 0.5, CARD_WIDTH - 1, CARD_HEIGHT - 1, 5);
            context.fillStyle = "rgba(0, 0, 128, 0.35)";
            context.fill();
            context.restore();
        }
    }

    // Cascade de victoire : les cartes de `items` ({ card, x, y }, dans l'ordre de lancement) rebondissent sur le sol et
    // laissent leur traînée (pas d'effacement du canvas). Renvoie une fonction d'annulation ; `onDone` est appelé à la fin.
    function cascade(canvas, items, onDone) {
        const context = canvas.getContext("2d");
        const queue = items.map((item) => ({ ...item, vx: (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random() * 3.5), vy: -Math.random() * 3 }));
        const flying = [];
        let lastLaunch = 0;
        let frame = 0;
        let cancelled = false;
        const step = (now) => {
            if (cancelled) {
                return;
            }
            if (queue.length > 0 && now - lastLaunch > 90) {
                flying.push(queue.shift());
                lastLaunch = now;
            }
            flying.forEach((item) => {
                item.vy += 0.45;
                item.x += item.vx;
                item.y += item.vy;
                if (item.y + CARD_HEIGHT > canvas.height) {
                    item.y = canvas.height - CARD_HEIGHT;
                    item.vy = -item.vy * 0.82;
                }
                drawCard(context, item.card, item.x, item.y);
            });
            if (queue.length === 0 && flying.every((item) => item.x < -CARD_WIDTH || item.x > canvas.width)) {
                onDone?.();
                return;
            }
            frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
        return () => {
            cancelled = true;
            cancelAnimationFrame(frame);
        };
    }

    window.Win95Cards = {
        SUITS, SUIT_NAMES, RANK_LABELS, BACKS, CARD_WIDTH, CARD_HEIGHT,
        makeCard, isRed, describe, createDeck, shuffle, microsoftRandom, dealFreeCell,
        getSprite, drawCard, drawSlot, cascade
    };
    window.Win95Services?.register?.("Win95Cards", window.Win95Cards);
})();
