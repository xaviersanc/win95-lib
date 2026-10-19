(() => {
    // Générateur de QR code (Win95QR), sans dépendance ni réseau : mode octets (UTF-8), correction d'erreurs M (environ 15 %),
    // versions 1 à 10 (jusqu'à 213 octets, largement assez pour une adresse). Écrit d'après la norme ISO/IEC 18004.
    //  - encode(texte)  -> { version, size, modules } où modules[ligne][colonne] vaut true pour un module noir ;
    //  - draw(canvas, qr, { scale, margin }) dessine le code (zone de silence de 4 modules par défaut, exigée par les lecteurs).
    // Les tests (tests/run.mjs) re-décodent le code produit avec un décodeur indépendant.

    // Par version (1 à 10), niveau M : [octets de correction par bloc, [nombre de blocs, octets de données par bloc], …].
    const BLOCKS = [
        null,
        [10, [1, 16]],
        [16, [1, 28]],
        [26, [1, 44]],
        [18, [2, 32]],
        [24, [2, 43]],
        [16, [4, 27]],
        [18, [4, 31]],
        [22, [2, 38], [2, 39]],
        [22, [3, 36], [2, 37]],
        [26, [4, 43], [1, 44]]
    ];
    const ALIGNMENT = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
    const MAX_VERSION = 10;
    const FORMAT_LEVEL_M = 0;
    const PAD_BYTES = [0xec, 0x11];

    function dataCapacity(version) {
        const [, ...groups] = BLOCKS[version];
        return groups.reduce((total, [count, size]) => total + count * size, 0);
    }

    // --- Corps de Galois GF(256), polynôme 0x11D, pour le code de Reed-Solomon ---------------------------------

    function multiply(x, y) {
        let product = 0;
        for (let bit = 7; bit >= 0; bit -= 1) {
            product = (product << 1) ^ ((product >>> 7) * 0x11d);
            product ^= ((y >>> bit) & 1) * x;
        }
        return product;
    }

    function divisorOf(degree) {
        const result = new Array(degree).fill(0);
        result[degree - 1] = 1;
        let root = 1;
        for (let i = 0; i < degree; i += 1) {
            for (let j = 0; j < degree; j += 1) {
                result[j] = multiply(result[j], root);
                if (j + 1 < degree) {
                    result[j] ^= result[j + 1];
                }
            }
            root = multiply(root, 2);
        }
        return result;
    }

    function remainderOf(data, divisor) {
        const result = new Array(divisor.length).fill(0);
        data.forEach((byte) => {
            const factor = byte ^ result.shift();
            result.push(0);
            divisor.forEach((coefficient, index) => {
                result[index] ^= multiply(coefficient, factor);
            });
        });
        return result;
    }

    // --- Données : flux de bits, remplissage, blocs entrelacés -------------------------------------------------

    function buildDataCodewords(bytes, version) {
        const capacity = dataCapacity(version);
        const bits = [];
        const push = (value, length) => {
            for (let i = length - 1; i >= 0; i -= 1) {
                bits.push((value >>> i) & 1);
            }
        };
        push(0b0100, 4);                              // mode octets
        push(bytes.length, version >= 10 ? 16 : 8);   // nombre de caractères
        bytes.forEach((byte) => push(byte, 8));
        push(0, Math.min(4, capacity * 8 - bits.length)); // terminateur
        while (bits.length % 8 !== 0) {
            bits.push(0);
        }
        const codewords = [];
        for (let i = 0; i < bits.length; i += 8) {
            codewords.push(parseInt(bits.slice(i, i + 8).join(""), 2));
        }
        for (let i = 0; codewords.length < capacity; i += 1) {
            codewords.push(PAD_BYTES[i % 2]);
        }
        return codewords;
    }

    function interleave(dataCodewords, version) {
        const [eccLength, ...groups] = BLOCKS[version];
        const divisor = divisorOf(eccLength);
        const dataBlocks = [];
        let offset = 0;
        groups.forEach(([count, size]) => {
            for (let i = 0; i < count; i += 1) {
                dataBlocks.push(dataCodewords.slice(offset, offset + size));
                offset += size;
            }
        });
        const eccBlocks = dataBlocks.map((block) => remainderOf(block, divisor));
        const result = [];
        const longest = Math.max(...dataBlocks.map((block) => block.length));
        for (let i = 0; i < longest; i += 1) {
            dataBlocks.forEach((block) => {
                if (i < block.length) {
                    result.push(block[i]);
                }
            });
        }
        for (let i = 0; i < eccLength; i += 1) {
            eccBlocks.forEach((block) => result.push(block[i]));
        }
        return result;
    }

    // --- Matrice -----------------------------------------------------------------------------------------------

    function createMatrix(size) {
        return {
            size,
            modules: Array.from({ length: size }, () => new Array(size).fill(false)),
            reserved: Array.from({ length: size }, () => new Array(size).fill(false))
        };
    }

    function setFunction(matrix, x, y, dark) {
        matrix.modules[y][x] = dark;
        matrix.reserved[y][x] = true;
    }

    function drawFinder(matrix, centerX, centerY) {
        for (let dy = -4; dy <= 4; dy += 1) {
            for (let dx = -4; dx <= 4; dx += 1) {
                const x = centerX + dx;
                const y = centerY + dy;
                if (x >= 0 && x < matrix.size && y >= 0 && y < matrix.size) {
                    const distance = Math.max(Math.abs(dx), Math.abs(dy));
                    setFunction(matrix, x, y, distance !== 2 && distance !== 4);
                }
            }
        }
    }

    function drawAlignment(matrix, centerX, centerY) {
        for (let dy = -2; dy <= 2; dy += 1) {
            for (let dx = -2; dx <= 2; dx += 1) {
                setFunction(matrix, centerX + dx, centerY + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
            }
        }
    }

    // Format (niveau + masque) : 5 bits de données + 10 bits de correction BCH, masqués par 0x5412 ; écrit deux fois.
    function drawFormat(matrix, mask) {
        const data = (FORMAT_LEVEL_M << 3) | mask;
        let remainder = data;
        for (let i = 0; i < 10; i += 1) {
            remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
        }
        const bits = ((data << 10) | remainder) ^ 0x5412;
        const bit = (index) => ((bits >>> index) & 1) !== 0;
        const { size } = matrix;
        for (let i = 0; i <= 5; i += 1) {
            setFunction(matrix, 8, i, bit(i));
        }
        setFunction(matrix, 8, 7, bit(6));
        setFunction(matrix, 8, 8, bit(7));
        setFunction(matrix, 7, 8, bit(8));
        for (let i = 9; i < 15; i += 1) {
            setFunction(matrix, 14 - i, 8, bit(i));
        }
        for (let i = 0; i < 8; i += 1) {
            setFunction(matrix, size - 1 - i, 8, bit(i));
        }
        for (let i = 8; i < 15; i += 1) {
            setFunction(matrix, 8, size - 15 + i, bit(i));
        }
        setFunction(matrix, 8, size - 8, true); // module noir fixe
    }

    // Version (à partir de la 7) : 6 bits + 12 bits de correction BCH, écrits deux fois.
    function drawVersion(matrix, version) {
        if (version < 7) {
            return;
        }
        let remainder = version;
        for (let i = 0; i < 12; i += 1) {
            remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
        }
        const bits = (version << 12) | remainder;
        for (let i = 0; i < 18; i += 1) {
            const dark = ((bits >>> i) & 1) !== 0;
            const a = matrix.size - 11 + (i % 3);
            const b = Math.floor(i / 3);
            setFunction(matrix, a, b, dark);
            setFunction(matrix, b, a, dark);
        }
    }

    function drawFunctionPatterns(matrix, version) {
        const { size } = matrix;
        for (let i = 0; i < size; i += 1) {
            setFunction(matrix, 6, i, i % 2 === 0);
            setFunction(matrix, i, 6, i % 2 === 0);
        }
        drawFinder(matrix, 3, 3);
        drawFinder(matrix, size - 4, 3);
        drawFinder(matrix, 3, size - 4);
        const centers = ALIGNMENT[version];
        centers.forEach((cy, row) => {
            centers.forEach((cx, column) => {
                const onFinder = (row === 0 && column === 0) || (row === 0 && column === centers.length - 1) || (row === centers.length - 1 && column === 0);
                if (!onFinder) {
                    drawAlignment(matrix, cx, cy);
                }
            });
        });
        drawFormat(matrix, 0);
        drawVersion(matrix, version);
    }

    // Parcours en zigzag par colonnes de deux modules, de bas en haut puis de haut en bas, en sautant la colonne de synchronisation.
    function placeCodewords(matrix, codewords) {
        const { size } = matrix;
        let index = 0;
        for (let right = size - 1; right >= 1; right -= 2) {
            if (right === 6) {
                right = 5;
            }
            for (let vertical = 0; vertical < size; vertical += 1) {
                for (let j = 0; j < 2; j += 1) {
                    const x = right - j;
                    const upward = ((right + 1) & 2) === 0;
                    const y = upward ? size - 1 - vertical : vertical;
                    if (!matrix.reserved[y][x] && index < codewords.length * 8) {
                        matrix.modules[y][x] = ((codewords[index >>> 3] >>> (7 - (index & 7))) & 1) !== 0;
                        index += 1;
                    }
                }
            }
        }
    }

    const MASKS = [
        (x, y) => (x + y) % 2 === 0,
        (x, y) => y % 2 === 0,
        (x) => x % 3 === 0,
        (x, y) => (x + y) % 3 === 0,
        (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
        (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
        (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
        (x, y) => ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0
    ];

    function applyMask(matrix, mask) {
        for (let y = 0; y < matrix.size; y += 1) {
            for (let x = 0; x < matrix.size; x += 1) {
                if (!matrix.reserved[y][x] && MASKS[mask](x, y)) {
                    matrix.modules[y][x] = !matrix.modules[y][x];
                }
            }
        }
    }

    // Pénalités de la norme : séries de 5 modules identiques ou plus, blocs 2 × 2, motifs de type viseur, déséquilibre noir/blanc.
    function penalty(matrix) {
        const { size, modules } = matrix;
        let total = 0;
        const lines = [];
        for (let i = 0; i < size; i += 1) {
            lines.push(modules[i], modules.map((row) => row[i]));
        }
        const finderLike = [1, 0, 1, 1, 1, 0, 1];
        lines.forEach((line) => {
            let run = 1;
            for (let i = 1; i <= size; i += 1) {
                if (i < size && line[i] === line[i - 1]) {
                    run += 1;
                } else {
                    if (run >= 5) {
                        total += 3 + (run - 5);
                    }
                    run = 1;
                }
            }
            for (let i = 0; i + 7 <= size; i += 1) {
                if (finderLike.every((value, offset) => Number(line[i + offset]) === value)) {
                    const lightBefore = i >= 4 && [1, 2, 3, 4].every((offset) => !line[i - offset]);
                    const lightAfter = i + 11 <= size && [7, 8, 9, 10].every((offset) => !line[i + offset]);
                    if (lightBefore || lightAfter) {
                        total += 40;
                    }
                }
            }
        });
        for (let y = 0; y < size - 1; y += 1) {
            for (let x = 0; x < size - 1; x += 1) {
                const color = modules[y][x];
                if (modules[y][x + 1] === color && modules[y + 1][x] === color && modules[y + 1][x + 1] === color) {
                    total += 3;
                }
            }
        }
        const dark = modules.reduce((count, row) => count + row.filter(Boolean).length, 0);
        total += (Math.ceil(Math.abs(dark * 20 - size * size * 10) / (size * size)) - 1) * 10;
        return total;
    }

    function encode(text) {
        const bytes = Array.from(new TextEncoder().encode(String(text ?? "")));
        let version = 1;
        while (version <= MAX_VERSION && dataCapacity(version) - (version >= 10 ? 3 : 2) < bytes.length) {
            version += 1;
        }
        if (version > MAX_VERSION) {
            throw new Error(`QR code : texte trop long (${bytes.length} octets, maximum ${dataCapacity(MAX_VERSION) - 3}).`);
        }
        const size = version * 4 + 17;
        const codewords = interleave(buildDataCodewords(bytes, version), version);

        const base = createMatrix(size);
        drawFunctionPatterns(base, version);
        placeCodewords(base, codewords);

        let best = null;
        for (let mask = 0; mask < 8; mask += 1) {
            const candidate = { size, reserved: base.reserved, modules: base.modules.map((row) => row.slice()) };
            applyMask(candidate, mask);
            drawFormat(candidate, mask);
            const score = penalty(candidate);
            if (!best || score < best.score) {
                best = { score, mask, modules: candidate.modules };
            }
        }
        return { version, size, mask: best.mask, modules: best.modules };
    }

    // Dessine le code dans un <canvas> (carrés nets, sans lissage). Noir sur blanc : c'est ce que lisent les téléphones.
    function draw(canvas, qr, { scale = 4, margin = 4 } = {}) {
        const pixels = (qr.size + margin * 2) * scale;
        canvas.width = pixels;
        canvas.height = pixels;
        const context = canvas.getContext("2d");
        context.fillStyle = "#fff";
        context.fillRect(0, 0, pixels, pixels);
        context.fillStyle = "#000";
        qr.modules.forEach((row, y) => row.forEach((dark, x) => {
            if (dark) {
                context.fillRect((x + margin) * scale, (y + margin) * scale, scale, scale);
            }
        }));
        return canvas;
    }

    const api = { encode, draw, dataCapacity: (version = MAX_VERSION) => dataCapacity(version) - (version >= 10 ? 3 : 2) };
    window.Win95QR = api;
    window.Win95Services?.register?.("Win95QR", api);
})();
