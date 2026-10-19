(() => {
    // Effets des écrans de veille (Win95ScreenSaverEffects) : dessinés sur un <canvas>, en plein écran ou en aperçu réduit.
    // Chaque effet est une fonction (canvas, options) => { stop() } ; il lit la taille du canvas (width / height) une seule fois,
    // donc l'appelant fixe ces dimensions avant de le démarrer. Aucune dépendance : Canvas 2D et requestAnimationFrame.
    //   options : { text, color }

    const PIPE_COLORS = ["#d02020", "#20a020", "#2050e0", "#e0c020", "#c030c0", "#20b0c0", "#e07020", "#b0b0b0"];

    function shade(hex, amount) {
        const value = parseInt(hex.slice(1), 16);
        const channel = (shift) => {
            const base = (value >> shift) & 255;
            return Math.max(0, Math.min(255, Math.round(amount < 0 ? base * (1 + amount) : base + (255 - base) * amount)));
        };
        return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
    }

    // Boucle d'animation : appelle draw(deltaSeconds) jusqu'à stop().
    function loop(draw) {
        let frame = 0;
        let last = performance.now();
        let stopped = false;
        const step = (now) => {
            if (stopped) {
                return;
            }
            draw(Math.min(0.1, (now - last) / 1000), now);
            last = now;
            frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
        return () => {
            stopped = true;
            cancelAnimationFrame(frame);
        };
    }

    // --- Champ d'étoiles : des étoiles qui foncent vers l'écran ------------------------------------------------
    function stars(canvas) {
        const context = canvas.getContext("2d");
        const { width, height } = canvas;
        const scale = Math.min(width, height) / 600;
        const count = Math.round(Math.min(400, Math.max(60, (width * height) / 3500)));
        const field = Array.from({ length: count }, () => ({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random() }));
        const stop = loop((delta) => {
            context.fillStyle = "#000";
            context.fillRect(0, 0, width, height);
            field.forEach((star) => {
                star.z -= delta * 0.45;
                if (star.z <= 0.02) {
                    star.x = Math.random() * 2 - 1;
                    star.y = Math.random() * 2 - 1;
                    star.z = 1;
                }
                const sx = (star.x / star.z) * (width / 2) * 0.5 + width / 2;
                const sy = (star.y / star.z) * (height / 2) * 0.5 + height / 2;
                if (sx < 0 || sx >= width || sy < 0 || sy >= height) {
                    star.z = 1;
                    return;
                }
                const size = Math.max(1, (1 - star.z) * 3.2 * Math.max(scale, 0.5));
                const light = Math.round(120 + (1 - star.z) * 135);
                context.fillStyle = `rgb(${light}, ${light}, ${light})`;
                context.fillRect(Math.round(sx), Math.round(sy), size, size);
            });
        });
        return { stop };
    }

    // --- Texte défilant : un message qui traverse l'écran en changeant de couleur ----------------------------------
    function text(canvas, options = {}) {
        const context = canvas.getContext("2d");
        const { width, height } = canvas;
        const message = String(options.text || "Windows 95");
        const fontSize = Math.max(14, Math.round(height * 0.16));
        const palette = ["#ff0000", "#00c000", "#4060ff", "#ffff00", "#ff00ff", "#00ffff", "#ffffff"];
        context.font = `italic bold ${fontSize}px "Times New Roman", serif`;
        context.textBaseline = "middle";
        const textWidth = context.measureText(message).width;
        let x = width;
        let y = height / 2;
        let colorIndex = 0;
        const stop = loop((delta) => {
            x -= delta * width * 0.22;
            if (x < -textWidth) {
                x = width;
                y = fontSize + Math.random() * Math.max(1, height - fontSize * 2);
                colorIndex = (colorIndex + 1) % palette.length;
            }
            context.fillStyle = "#000";
            context.fillRect(0, 0, width, height);
            context.font = `italic bold ${fontSize}px "Times New Roman", serif`;
            context.fillStyle = "#000";
            context.fillText(message, x + 3, y + 3);
            context.fillStyle = palette[colorIndex];
            context.fillText(message, x, y);
        });
        return { stop };
    }

    // --- Tuyaux 3D : des tuyaux qui poussent dans une grille 3D --------------------------------------------------------
    // Projection en perspective d'une grille de cellules ; chaque pas ajoute un tronçon (et une sphère à chaque coude).
    // Le dessin trie les éléments du plus loin au plus proche (algorithme du peintre) puis les ombre en trois traits.
    function pipes(canvas) {
        const context = canvas.getContext("2d");
        const { width, height } = canvas;
        const GRID = 9;
        const MAX_SEGMENTS = 520;
        const MAX_PIPES = 7;
        const yaw = 0.62;
        const pitch = 0.42;
        const cameraDistance = GRID * 2.1;
        const focal = Math.min(width, height) * 1.05;
        const radiusWorld = 0.26;
        const directions = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

        let segments = [];
        let joints = [];
        let occupied = new Set();
        let pipesStarted = 0;
        let pipe = null;
        let pause = 0;
        let sinceStep = 0;

        const key = (cell) => cell.join(",");
        const center = (cell) => cell.map((value) => value - (GRID - 1) / 2);

        // Point du monde -> écran ; z = profondeur après rotation (plus grand = plus loin).
        function project(point) {
            const [x, y, z] = point;
            const x1 = x * Math.cos(yaw) - z * Math.sin(yaw);
            const z1 = x * Math.sin(yaw) + z * Math.cos(yaw);
            const y2 = y * Math.cos(pitch) - z1 * Math.sin(pitch);
            const z2 = y * Math.sin(pitch) + z1 * Math.cos(pitch) + cameraDistance;
            const factor = focal / z2;
            return { x: width / 2 + x1 * factor, y: height / 2 + y2 * factor, z: z2, factor };
        }

        function startPipe() {
            if (pipesStarted >= MAX_PIPES || segments.length >= MAX_SEGMENTS) {
                return false;
            }
            for (let attempt = 0; attempt < 40; attempt += 1) {
                const cell = [0, 0, 0].map(() => Math.floor(Math.random() * GRID));
                if (!occupied.has(key(cell))) {
                    occupied.add(key(cell));
                    pipe = { cell, direction: directions[Math.floor(Math.random() * 6)], color: PIPE_COLORS[pipesStarted % PIPE_COLORS.length] };
                    pipesStarted += 1;
                    joints.push({ point: center(cell), color: pipe.color });
                    return true;
                }
            }
            return false;
        }

        function growPipe() {
            const options = directions.filter((direction) => {
                const reverse = direction.every((value, index) => value === -pipe.direction[index]);
                if (reverse) {
                    return false;
                }
                const next = pipe.cell.map((value, index) => value + direction[index]);
                return next.every((value) => value >= 0 && value < GRID) && !occupied.has(key(next));
            });
            if (options.length === 0) {
                pipe = null;
                return;
            }
            const straight = options.find((direction) => direction.every((value, index) => value === pipe.direction[index]));
            const turn = !straight || Math.random() < 0.32;
            const candidates = turn ? options.filter((direction) => direction !== straight) : [straight];
            const direction = (candidates.length > 0 ? candidates : options)[Math.floor(Math.random() * (candidates.length > 0 ? candidates : options).length)];
            const next = pipe.cell.map((value, index) => value + direction[index]);
            segments.push({ a: center(pipe.cell), b: center(next), color: pipe.color });
            if (direction !== pipe.direction && !direction.every((value, index) => value === pipe.direction[index])) {
                joints.push({ point: center(pipe.cell), color: pipe.color });
            }
            occupied.add(key(next));
            pipe.cell = next;
            pipe.direction = direction;
        }

        function draw() {
            context.fillStyle = "#000";
            context.fillRect(0, 0, width, height);
            const items = [
                ...segments.map((segment) => ({ kind: "segment", item: segment, a: project(segment.a), b: project(segment.b) })),
                ...joints.map((joint) => ({ kind: "joint", item: joint, a: project(joint.point) }))
            ];
            items.forEach((entry) => {
                entry.depth = entry.kind === "segment" ? (entry.a.z + entry.b.z) / 2 : entry.a.z - 0.01;
            });
            items.sort((left, right) => right.depth - left.depth);
            context.lineCap = "round";
            items.forEach((entry) => {
                const { item } = entry;
                if (entry.kind === "segment") {
                    const widthPx = Math.max(2, 2 * radiusWorld * entry.a.factor);
                    context.strokeStyle = shade(item.color, -0.45);
                    context.lineWidth = widthPx;
                    context.beginPath();
                    context.moveTo(entry.a.x, entry.a.y);
                    context.lineTo(entry.b.x, entry.b.y);
                    context.stroke();
                    const offset = widthPx * 0.12;
                    context.strokeStyle = item.color;
                    context.lineWidth = widthPx * 0.62;
                    context.beginPath();
                    context.moveTo(entry.a.x - offset, entry.a.y - offset);
                    context.lineTo(entry.b.x - offset, entry.b.y - offset);
                    context.stroke();
                    context.strokeStyle = shade(item.color, 0.6);
                    context.lineWidth = Math.max(1, widthPx * 0.16);
                    context.beginPath();
                    context.moveTo(entry.a.x - widthPx * 0.2, entry.a.y - widthPx * 0.2);
                    context.lineTo(entry.b.x - widthPx * 0.2, entry.b.y - widthPx * 0.2);
                    context.stroke();
                } else {
                    const radius = Math.max(2, radiusWorld * 1.18 * entry.a.factor);
                    const gradient = context.createRadialGradient(entry.a.x - radius * 0.35, entry.a.y - radius * 0.35, radius * 0.1, entry.a.x, entry.a.y, radius);
                    gradient.addColorStop(0, shade(item.color, 0.75));
                    gradient.addColorStop(0.45, item.color);
                    gradient.addColorStop(1, shade(item.color, -0.55));
                    context.fillStyle = gradient;
                    context.beginPath();
                    context.arc(entry.a.x, entry.a.y, radius, 0, Math.PI * 2);
                    context.fill();
                }
            });
        }

        function reset() {
            segments = [];
            joints = [];
            occupied = new Set();
            pipesStarted = 0;
            pipe = null;
            pause = 0;
        }

        startPipe();
        const stop = loop((delta) => {
            if (pause > 0) {
                pause -= delta;
                if (pause <= 0) {
                    reset();
                    startPipe();
                    draw();
                }
                return;
            }
            sinceStep += delta;
            let changed = false;
            while (sinceStep >= 0.03) {
                sinceStep -= 0.03;
                if (!pipe && !startPipe()) {
                    pause = 2.5;
                    break;
                }
                if (segments.length >= MAX_SEGMENTS) {
                    pipe = null;
                    if (!startPipe()) {
                        pause = 2.5;
                        break;
                    }
                }
                growPipe();
                changed = true;
            }
            if (changed) {
                draw();
            }
        });
        draw();
        return { stop };
    }

    function blank(canvas) {
        const context = canvas.getContext("2d");
        context.fillStyle = "#000";
        context.fillRect(0, 0, canvas.width, canvas.height);
        return { stop() {} };
    }

    window.Win95ScreenSaverEffects = { stars, text, pipes, blank };
    window.Win95Services?.register?.("Win95ScreenSaverEffects", window.Win95ScreenSaverEffects);
})();
