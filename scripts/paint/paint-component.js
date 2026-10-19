(() => {
    // Paint (façon Windows 95) : boîte à outils, palette de 28 couleurs, sélection, zoom, annuler/rétablir.
    // Les dessins sont des fichiers ".paint" de Mes documents : un PNG encodé en "data URL" dans un fichier texte,
    // ce qui permet de réutiliser tel quel le stockage texte de Mes documents (Bloc-notes).
    // Enregistrer : un fichier ouvert depuis Mes documents est mis à jour ; un nouveau dessin est créé à la racine de
    // Mes documents sous le nom choisi, puis suivi comme tel (même logique que le Bloc-notes).
    const DEFAULT_SIZE = { width: 640, height: 480 };
    const MAX_SIZE = 2000;
    const UNDO_LIMIT = 30;
    const PALETTE = [
        "#000000", "#ffffff", "#808080", "#c0c0c0", "#800000", "#ff0000", "#808000", "#ffff00",
        "#008000", "#00ff00", "#008080", "#00ffff", "#000080", "#0000ff", "#800080", "#ff00ff",
        "#808040", "#ffff80", "#004040", "#00ff80", "#0080ff", "#80ffff", "#004080", "#8080ff",
        "#4000ff", "#ff0080", "#804000", "#ff8040"
    ];
    const LINE_WIDTHS = [1, 2, 3, 4, 5];
    const ERASER_SIZES = [4, 6, 8, 10];
    const AIR_RADII = [4, 7, 10];
    const BRUSHES = [
        { shape: "round", size: 8 }, { shape: "round", size: 5 }, { shape: "round", size: 3 },
        { shape: "square", size: 7 }, { shape: "square", size: 5 }, { shape: "square", size: 3 },
        { shape: "slash", size: 8 }, { shape: "slash", size: 5 }, { shape: "slash", size: 3 },
        { shape: "backslash", size: 8 }, { shape: "backslash", size: 5 }, { shape: "backslash", size: 3 }
    ];
    const ZOOMS = [1, 2, 4, 6, 8];
    const SHAPE_TOOLS = ["line", "rect", "ellipse", "roundrect"];

    const svg = (body) => `<svg viewBox="0 0 16 16" width="16" height="16" shape-rendering="crispEdges" aria-hidden="true">${body}</svg>`;
    const TOOLS = [
        { id: "select", label: "Sélection", help: "Sélectionne une zone rectangulaire pour la déplacer, la copier ou la couper.",
            icon: svg(`<rect x="2.5" y="3.5" width="11" height="9" fill="none" stroke="#000" stroke-dasharray="2 2"/>`) },
        { id: "eraser", label: "Gomme", help: "Efface une partie de l'image avec la couleur d'arrière-plan.",
            icon: svg(`<path d="M2.5 10.5l6-6 5 5-4 4h-4z" fill="#f7a8b8" stroke="#000"/><path d="M5.5 7.5l5 5" stroke="#000"/>`) },
        { id: "fill", label: "Remplissage", help: "Remplit une zone avec la couleur de premier plan.",
            icon: svg(`<path d="M3.5 8.5l4-5 5 5-4 5z" fill="#fff" stroke="#000"/><path d="M13 10v3" stroke="#00f" stroke-width="2"/>`) },
        { id: "picker", label: "Pipette", help: "Prend une couleur de l'image et l'utilise pour le dessin.",
            icon: svg(`<path d="M3 13l5-5" stroke="#000" stroke-width="2"/><path d="M8 7l3-3 2 2-3 3z" fill="#808080" stroke="#000"/><path d="M10 3l3 3" stroke="#000" stroke-width="2"/>`) },
        { id: "magnifier", label: "Loupe", help: "Change le grossissement.",
            icon: svg(`<circle cx="6.5" cy="6.5" r="4" fill="#fff" stroke="#000"/><path d="M9.5 9.5l4 4" stroke="#000" stroke-width="2"/>`) },
        { id: "pencil", label: "Crayon", help: "Dessine une ligne à main levée, un pixel de large.",
            icon: svg(`<path d="M12 2l2 2-8 8-3 1 1-3z" fill="#ffe14d" stroke="#000"/><path d="M3 13l1-3 2 2z" fill="#000"/>`) },
        { id: "brush", label: "Pinceau", help: "Dessine avec un pinceau de forme et de taille choisies.",
            icon: svg(`<path d="M13 2l-5 6" stroke="#8b4513" stroke-width="2"/><path d="M8 7c2 0 2 2 1 3-1 2-4 3-6 3 1-2 1-4 2-5 1-1 2-1 3-1z" fill="#000"/>`) },
        { id: "airbrush", label: "Aérographe", help: "Projette de la peinture en spray.",
            icon: svg(`<rect x="2" y="8" width="5" height="6" fill="#c0c0c0" stroke="#000"/><path d="M4 6h1v2H4z" fill="#000"/><path d="M9 4h1v1H9zM12 3h1v1h-1zM11 6h1v1h-1zM14 5h1v1h-1zM10 9h1v1h-1zM13 8h1v1h-1z" fill="#000"/>`) },
        { id: "text", label: "Texte", help: "Insère du texte dans l'image.",
            icon: svg(`<text x="3" y="13" font-size="14" font-weight="bold" font-family="Times New Roman, serif" fill="#000">A</text>`) },
        { id: "line", label: "Ligne", help: "Trace une ligne droite (Maj : angles de 45°).",
            icon: svg(`<path d="M2 14L14 2" stroke="#000"/>`) },
        { id: "curve", label: "Courbe", help: "Trace une ligne, puis la courbe avec deux clics.",
            icon: svg(`<path d="M2 13C5 -1 9 17 14 3" fill="none" stroke="#000"/>`) },
        { id: "rect", label: "Rectangle", help: "Dessine un rectangle (Maj : carré).",
            icon: svg(`<rect x="2.5" y="4.5" width="11" height="8" fill="none" stroke="#000"/>`) },
        { id: "polygon", label: "Polygone", help: "Clic pour chaque sommet, double-clic pour terminer.",
            icon: svg(`<path d="M3.5 12.5l1-8 6-2 3 6-3 4z" fill="none" stroke="#000"/>`) },
        { id: "ellipse", label: "Ellipse", help: "Dessine une ellipse (Maj : cercle).",
            icon: svg(`<ellipse cx="8" cy="8" rx="6" ry="4.5" fill="none" stroke="#000"/>`) },
        { id: "roundrect", label: "Rectangle arrondi", help: "Dessine un rectangle aux coins arrondis.",
            icon: svg(`<rect x="2.5" y="4.5" width="11" height="8" rx="3" fill="none" stroke="#000"/>`) }
    ];

    const clamp = window.Win95Utils.clamp;

    function hexToRgb(hex) {
        const value = parseInt(String(hex).replace("#", ""), 16);
        return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
    }

    function makeCanvas(width, height) {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        return canvas;
    }

    function cloneCanvas(source) {
        const copy = makeCanvas(source.width, source.height);
        copy.getContext("2d").drawImage(source, 0, 0);
        return copy;
    }

    // Segment de Bresenham : appelle plot(x, y) pour chaque pixel.
    function plotLine(x0, y0, x1, y1, plot) {
        const dx = Math.abs(x1 - x0);
        const dy = -Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let error = dx + dy;
        let x = x0;
        let y = y0;
        for (;;) {
            plot(x, y);
            if (x === x1 && y === y1) {
                return;
            }
            const doubled = 2 * error;
            if (doubled >= dy) {
                error += dy;
                x += sx;
            }
            if (doubled <= dx) {
                error += dx;
                y += sy;
            }
        }
    }

    // Dessine une forme vectorielle sans anti-crénelage : la forme est tracée dans un canvas temporaire puis
    // l'opacité est seuillée (tout ou rien), pour garder des pixels nets comme dans le vrai Paint.
    const maskCanvas = makeCanvas(1, 1);
    function drawCrisp(target, box, color, draw) {
        const x = Math.floor(box.x);
        const y = Math.floor(box.y);
        const width = Math.max(1, Math.ceil(box.w));
        const height = Math.max(1, Math.ceil(box.h));
        if (width > 4096 || height > 4096) {
            return;
        }
        maskCanvas.width = width;
        maskCanvas.height = height;
        const ctx = maskCanvas.getContext("2d", { willReadFrequently: true });
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.save();
        ctx.translate(-x, -y);
        draw(ctx);
        ctx.restore();
        const image = ctx.getImageData(0, 0, width, height);
        const data = image.data;
        const [red, green, blue] = hexToRgb(color);
        for (let index = 0; index < data.length; index += 4) {
            if (data[index + 3] >= 96) {
                data[index] = red;
                data[index + 1] = green;
                data[index + 2] = blue;
                data[index + 3] = 255;
            } else {
                data[index + 3] = 0;
            }
        }
        ctx.putImageData(image, 0, 0);
        target.drawImage(maskCanvas, x, y);
    }

    function roundRectPath(ctx, x, y, w, h, r) {
        const radius = Math.max(0, Math.min(r, w / 2, h / 2));
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + w, y, x + w, y + h, radius);
        ctx.arcTo(x + w, y + h, x, y + h, radius);
        ctx.arcTo(x, y + h, x, y, radius);
        ctx.arcTo(x, y, x + w, y, radius);
        ctx.closePath();
    }

    // Segments épais (carré de côté `width`), pixel par pixel.
    function strokeSegments(ctx, points, width, color, closed = false) {
        ctx.fillStyle = color;
        const half = Math.floor(width / 2);
        const count = closed ? points.length : points.length - 1;
        for (let index = 0; index < count; index += 1) {
            const from = points[index];
            const to = points[(index + 1) % points.length];
            plotLine(from.x, from.y, to.x, to.y, (x, y) => ctx.fillRect(x - half, y - half, width, width));
        }
        if (points.length === 1) {
            ctx.fillRect(points[0].x - half, points[0].y - half, width, width);
        }
    }

    function bezierPoints(a, c1, c2, b) {
        const length = Math.hypot(c1.x - a.x, c1.y - a.y) + Math.hypot(c2.x - c1.x, c2.y - c1.y) + Math.hypot(b.x - c2.x, b.y - c2.y);
        const steps = Math.max(8, Math.ceil(length));
        const points = [];
        for (let step = 0; step <= steps; step += 1) {
            const t = step / steps;
            const u = 1 - t;
            points.push({
                x: Math.round(u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x),
                y: Math.round(u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y)
            });
        }
        return points;
    }

    function keyOutColor(source, color) {
        const result = cloneCanvas(source);
        const ctx = result.getContext("2d", { willReadFrequently: true });
        const image = ctx.getImageData(0, 0, result.width, result.height);
        const [red, green, blue] = hexToRgb(color);
        for (let index = 0; index < image.data.length; index += 4) {
            if (image.data[index] === red && image.data[index + 1] === green && image.data[index + 2] === blue) {
                image.data[index + 3] = 0;
            }
        }
        ctx.putImageData(image, 0, 0);
        return result;
    }

    const optionSvg = {
        line: (width) => `<svg viewBox="0 0 38 12" width="38" height="12" shape-rendering="crispEdges"><rect x="3" y="${6 - width / 2}" width="32" height="${width}" fill="#000"/></svg>`,
        square: (size) => `<svg viewBox="0 0 16 16" width="16" height="16" shape-rendering="crispEdges"><rect x="${8 - size / 2}" y="${8 - size / 2}" width="${size}" height="${size}" fill="#000"/></svg>`,
        fill: (mode) => `<svg viewBox="0 0 38 12" width="38" height="12" shape-rendering="crispEdges"><rect x="6.5" y="1.5" width="26" height="9" fill="${mode === 0 ? "none" : mode === 1 ? "#808080" : "#000"}" stroke="${mode === 2 ? "#000" : "#000"}"/></svg>`,
        opaque: (opaque) => `<svg viewBox="0 0 38 22" width="38" height="22" shape-rendering="crispEdges"><rect x="7.5" y="2.5" width="23" height="17" fill="${opaque ? "#808080" : "none"}" stroke="#000" ${opaque ? "" : `stroke-dasharray="2 2"`}/><circle cx="19" cy="11" r="4" fill="#fff" stroke="#000"/></svg>`,
        brush: (brush) => {
            const size = brush.size;
            const inner = {
                round: `<circle cx="8" cy="8" r="${size / 2}" fill="#000"/>`,
                square: `<rect x="${8 - size / 2}" y="${8 - size / 2}" width="${size}" height="${size}" fill="#000"/>`,
                slash: `<path d="M${8 - size / 2} ${8 + size / 2}L${8 + size / 2} ${8 - size / 2}" stroke="#000"/>`,
                backslash: `<path d="M${8 - size / 2} ${8 - size / 2}L${8 + size / 2} ${8 + size / 2}" stroke="#000"/>`
            }[brush.shape];
            return `<svg viewBox="0 0 16 16" width="16" height="16" shape-rendering="crispEdges">${inner}</svg>`;
        },
        airbrush: (radius) => `<svg viewBox="0 0 16 16" width="16" height="16" shape-rendering="crispEdges"><circle cx="8" cy="8" r="${radius * 0.75}" fill="none" stroke="#000" stroke-dasharray="1 2"/></svg>`
    };

    class Win95Paint {
        constructor(rootElement) {
            this.rootElement = rootElement;
            this.host = rootElement.querySelector("[data-paint]");
            this.titleElement = rootElement.querySelector("[data-paint-title]");
            if (!this.host) {
                return;
            }

            this.tool = "pencil";
            this.previousTool = "pencil";
            this.zoom = 1;
            this.fore = "#000000";
            this.back = "#ffffff";
            this.options = { line: 0, brush: 0, eraser: 2, air: 1, fill: 0, opaque: true };
            this.undoStack = [];
            this.redoStack = [];
            this.clipboard = null;
            this.sel = null;
            this.textBox = null;
            this.poly = null;
            this.curve = null;
            this.drag = null;
            this.preview = null;
            this.airTimer = null;
            this.brushCache = new Map();
            this.currentFileName = "";
            this.onSave = null;
            this.isSaving = false;
            this.isDirty = false;

            this.build();
            this.bind();
            this.doc = this.docCanvas;
            this.ctx = this.doc.getContext("2d", { willReadFrequently: true });
            this.ctx.imageSmoothingEnabled = false;
            this.newImage(DEFAULT_SIZE.width, DEFAULT_SIZE.height);
            this.setTool("pencil");
            this.rootElement.__win95PaintInstance = this;
        }

        // --- Construction de l'interface ------------------------------------------------------------------
        build() {
            this.host.innerHTML = `
                <div class="notepad-menu-bar paint-menu-bar" data-paint-menubar></div>
                <div class="paint-textbar" data-paint-textbar hidden></div>
                <div class="paint-workspace">
                    <div class="paint-left">
                        <div class="paint-toolbox" data-paint-toolbox></div>
                        <div class="paint-options" data-paint-options></div>
                    </div>
                    <div class="paint-scroll windows-scrollbar" data-paint-scroll>
                        <div class="paint-stage" data-paint-stage>
                            <canvas class="paint-doc" data-paint-doc></canvas>
                            <canvas class="paint-overlay" data-paint-overlay></canvas>
                            <div class="paint-selection" data-paint-selection hidden></div>
                        </div>
                    </div>
                </div>
                <div class="paint-bottom">
                    <div class="paint-colorbox" data-paint-colorbox>
                        <div class="paint-color-back" data-paint-back></div>
                        <div class="paint-color-fore" data-paint-fore></div>
                    </div>
                    <div class="paint-palette" data-paint-palette></div>
                </div>
                <div class="paint-status">
                    <span class="paint-status-help" data-paint-status>Prêt</span>
                    <span class="paint-status-cell" data-paint-coords></span>
                    <span class="paint-status-cell" data-paint-size></span>
                </div>
                <input type="file" accept="image/*" hidden data-paint-file>
                <input type="color" class="paint-color-input" data-paint-color-input tabindex="-1">`;
            this.host.tabIndex = -1;

            const q = (name) => this.host.querySelector(`[data-paint-${name}]`);
            this.menuBar = q("menubar");
            this.textBar = q("textbar");
            this.toolbox = q("toolbox");
            this.optionsPanel = q("options");
            this.scroll = q("scroll");
            this.stage = q("stage");
            this.docCanvas = q("doc");
            this.overlay = q("overlay");
            this.selectionElement = q("selection");
            this.foreBox = q("fore");
            this.backBox = q("back");
            this.paletteElement = q("palette");
            this.statusElement = q("status");
            this.coordsElement = q("coords");
            this.sizeElement = q("size");
            this.fileInput = q("file");
            this.colorInput = q("color-input");
            this.overlayCtx = this.overlay.getContext("2d");
            this.overlayCtx.imageSmoothingEnabled = false;

            this.buildMenus();
            this.buildToolbox();
            this.buildPalette();
            this.buildTextBar();
        }

        buildMenus() {
            const menus = [
                ["Fichier", () => [
                    { label: "Nouveau  Ctrl+N", onSelect: () => void this.newDocument() },
                    { label: "Importer depuis l'ordinateur…", onSelect: () => this.fileInput.click() },
                    { separator: true },
                    { label: "Enregistrer  Ctrl+S", onSelect: () => void this.save() },
                    { label: "Enregistrer sous…", onSelect: () => void this.saveAs() },
                    { label: "Exporter en PNG…", onSelect: () => this.exportPng() },
                    { separator: true },
                    { label: "Quitter", onSelect: () => window.Win95WindowManager?.closeWindow(this.rootElement) }
                ]],
                ["Édition", () => [
                    { label: "Annuler  Ctrl+Z", disabled: this.undoStack.length === 0 && !this.sel, onSelect: () => this.undo() },
                    { label: "Rétablir  Ctrl+Y", disabled: this.redoStack.length === 0, onSelect: () => this.redo() },
                    { separator: true },
                    { label: "Couper  Ctrl+X", disabled: !this.sel, onSelect: () => void this.copySelection(true) },
                    { label: "Copier  Ctrl+C", disabled: !this.sel, onSelect: () => void this.copySelection(false) },
                    { label: "Coller  Ctrl+V", onSelect: () => void this.paste() },
                    { label: "Effacer la sélection  Suppr", disabled: !this.sel, onSelect: () => this.clearSelection() },
                    { separator: true },
                    { label: "Tout sélectionner  Ctrl+A", onSelect: () => this.selectAll() }
                ]],
                ["Affichage", () => [{
                    label: "Zoom",
                    items: ZOOMS.map((zoom) => ({ label: `${this.zoom === zoom ? "✓ " : "   "}${zoom * 100} %`, onSelect: () => this.setZoom(zoom) }))
                }]],
                ["Image", () => [
                    { label: "Retourner horizontalement", onSelect: () => this.transform("flipH") },
                    { label: "Retourner verticalement", onSelect: () => this.transform("flipV") },
                    { label: "Pivoter de 90° à droite", onSelect: () => this.transform("rot90") },
                    { label: "Pivoter de 180°", onSelect: () => this.transform("rot180") },
                    { label: "Pivoter de 270°", onSelect: () => this.transform("rot270") },
                    { separator: true },
                    { label: "Inverser les couleurs  Ctrl+I", onSelect: () => this.transform("invert") },
                    { label: "Attributs…  Ctrl+E", onSelect: () => void this.editAttributes() },
                    { label: "Effacer l'image  Ctrl+Maj+N", onSelect: () => this.clearImage() },
                    { separator: true },
                    { label: `${this.options.opaque ? "✓ " : "   "}Dessin opaque`, onSelect: () => this.setOption("opaque", !this.options.opaque) }
                ]],
                ["Couleurs", () => [
                    { label: "Modifier la couleur de premier plan…", onSelect: () => this.pickColor("fore") },
                    { label: "Modifier la couleur d'arrière-plan…", onSelect: () => this.pickColor("back") }
                ]],
                ["?", () => [
                    { label: "À propos de Paint", onSelect: () => void window.Win95Dialog?.alert({ title: "À propos de Paint", message: "Paint.\nClic gauche : couleur de premier plan.\nClic droit : couleur d'arrière-plan.\nDouble-clic sur une couleur : la modifier." }) }
                ]]
            ];
            menus.forEach(([label, getItems]) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "notepad-menu-action";
                button.textContent = label;
                button.addEventListener("click", (event) => {
                    event.stopPropagation();
                    const rect = button.getBoundingClientRect();
                    window.Win95ContextMenu?.open(rect.left, rect.bottom, getItems());
                });
                this.menuBar.appendChild(button);
            });
        }

        buildToolbox() {
            this.toolButtons = new Map();
            TOOLS.forEach((tool) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "paint-tool";
                button.title = tool.label;
                button.innerHTML = tool.icon;
                button.addEventListener("click", () => this.setTool(tool.id));
                button.addEventListener("mouseenter", () => this.setStatus(tool.help));
                button.addEventListener("mouseleave", () => this.setStatus());
                this.toolbox.appendChild(button);
                this.toolButtons.set(tool.id, button);
            });
        }

        buildPalette() {
            this.paletteButtons = [];
            // Deux lignes de 14 : ordre colonne par colonne.
            PALETTE.forEach((color, index) => {
                const cell = document.createElement("button");
                cell.type = "button";
                cell.className = "paint-swatch";
                cell.style.background = color;
                cell.dataset.color = color;
                cell.style.gridColumn = String(Math.floor(index / 2) + 1);
                cell.style.gridRow = String((index % 2) + 1);
                cell.title = color;
                cell.addEventListener("click", () => this.setColor("fore", cell.dataset.color));
                cell.addEventListener("contextmenu", (event) => {
                    event.preventDefault();
                    this.setColor("back", cell.dataset.color);
                });
                cell.addEventListener("dblclick", () => this.pickColor("fore", cell));
                this.paletteElement.appendChild(cell);
                this.paletteButtons.push(cell);
            });
            this.foreBox.style.background = this.fore;
            this.backBox.style.background = this.back;
        }

        buildTextBar() {
            const fonts = ["Arial", "Times New Roman", "Courier New", "Comic Sans MS", "Verdana"];
            const sizes = [8, 10, 12, 14, 18, 24, 36, 48];
            this.textBar.innerHTML = `
                <select class="form-95 paint-text-font" data-paint-text-font aria-label="Police">${fonts.map((font) => `<option>${font}</option>`).join("")}</select>
                <select class="form-95 paint-text-size" data-paint-text-size aria-label="Taille">${sizes.map((size) => `<option${size === 12 ? " selected" : ""}>${size}</option>`).join("")}</select>
                <button type="button" class="btn win95-wordpad-btn is-bold" data-paint-text-bold title="Gras">G</button>
                <button type="button" class="btn win95-wordpad-btn is-italic" data-paint-text-italic title="Italique">I</button>
                <button type="button" class="btn win95-wordpad-btn is-underline" data-paint-text-underline title="Souligné">S</button>`;
            this.textFont = this.textBar.querySelector("[data-paint-text-font]");
            this.textSize = this.textBar.querySelector("[data-paint-text-size]");
            this.textToggles = {
                bold: this.textBar.querySelector("[data-paint-text-bold]"),
                italic: this.textBar.querySelector("[data-paint-text-italic]"),
                underline: this.textBar.querySelector("[data-paint-text-underline]")
            };
            this.textStyle = { bold: false, italic: false, underline: false };
            const refresh = () => this.applyTextStyle();
            this.textFont.addEventListener("change", refresh);
            this.textSize.addEventListener("change", refresh);
            Object.entries(this.textToggles).forEach(([key, button]) => {
                button.addEventListener("mousedown", (event) => event.preventDefault());
                button.addEventListener("click", () => {
                    this.textStyle[key] = !this.textStyle[key];
                    button.classList.toggle("is-active", this.textStyle[key]);
                    this.applyTextStyle();
                });
            });
        }

        bind() {
            this.stage.addEventListener("pointerdown", (event) => this.onPointerDown(event));
            this.stage.addEventListener("pointermove", (event) => this.onPointerMove(event));
            this.stage.addEventListener("pointerup", (event) => this.onPointerUp(event));
            this.stage.addEventListener("pointercancel", (event) => this.onPointerUp(event));
            this.stage.addEventListener("pointerleave", () => { this.coordsElement.textContent = ""; });
            this.stage.addEventListener("contextmenu", (event) => event.preventDefault());
            this.host.addEventListener("keydown", (event) => this.onKeyDown(event));
            this.rootElement.addEventListener("win95:window-closing", (event) => void this.handleWindowClosing(event));
            this.fileInput.addEventListener("change", () => this.importFromComputer());
            this.colorInput.addEventListener("input", () => {
                if (this.colorTarget) {
                    this.setColor(this.colorTarget, this.colorInput.value);
                    if (this.colorCell) {
                        this.colorCell.dataset.color = this.colorInput.value;
                        this.colorCell.style.background = this.colorInput.value;
                    }
                }
            });
        }

        // --- État général ---------------------------------------------------------------------------------
        setStatus(message) {
            this.statusElement.textContent = message || TOOLS.find((tool) => tool.id === this.tool)?.help || "Prêt";
        }

        updateTitle() {
            if (this.titleElement) {
                const name = this.currentFileName || "sans titre";
                this.titleElement.textContent = `${name}${this.isDirty ? " *" : ""} - Paint`;
            }
        }

        markDirty() {
            if (!this.isDirty) {
                this.isDirty = true;
                this.updateTitle();
            }
        }

        updateSizeLabel(text) {
            this.sizeElement.textContent = text || `${this.doc.width} x ${this.doc.height}`;
        }

        setColor(which, color) {
            this[which] = color;
            (which === "fore" ? this.foreBox : this.backBox).style.background = color;
        }

        pickColor(which, cell = null) {
            this.colorTarget = which;
            this.colorCell = cell;
            this.colorInput.value = this[which];
            this.colorInput.click();
        }

        setTool(id) {
            this.commitText();
            this.commitSelection();
            this.cancelPolygon();
            this.curve = null;
            this.clearPreview();
            if (id !== this.tool) {
                this.previousTool = this.tool;
            }
            this.tool = id;
            this.toolButtons.forEach((button, toolId) => button.classList.toggle("is-active", toolId === id));
            this.renderOptions();
            this.textBar.hidden = id !== "text";
            this.stage.dataset.tool = id;
            this.setStatus();
        }

        setOption(key, value) {
            this.options[key] = value;
            this.renderOptions();
            if (this.sel?.lifted) {
                this.renderOverlay();
            }
        }

        renderOptions() {
            const panel = this.optionsPanel;
            panel.innerHTML = "";
            let entries = [];
            let wide = false;
            switch (this.tool) {
                case "eraser":
                    entries = ERASER_SIZES.map((size, index) => ({ key: "eraser", value: index, html: optionSvg.square(size) }));
                    break;
                case "brush":
                    entries = BRUSHES.map((brush, index) => ({ key: "brush", value: index, html: optionSvg.brush(brush) }));
                    break;
                case "airbrush":
                    entries = AIR_RADII.map((radius, index) => ({ key: "air", value: index, html: optionSvg.airbrush(radius) }));
                    break;
                case "line":
                case "curve":
                    entries = LINE_WIDTHS.map((width, index) => ({ key: "line", value: index, html: optionSvg.line(width) }));
                    wide = true;
                    break;
                case "rect":
                case "ellipse":
                case "roundrect":
                case "polygon":
                    entries = [0, 1, 2].map((mode) => ({ key: "fill", value: mode, html: optionSvg.fill(mode) }));
                    entries.push(...LINE_WIDTHS.map((width, index) => ({ key: "line", value: index, html: optionSvg.line(width) })));
                    wide = true;
                    break;
                case "select":
                case "text":
                    entries = [true, false].map((opaque) => ({ key: "opaque", value: opaque, html: optionSvg.opaque(opaque) }));
                    wide = true;
                    break;
                case "magnifier":
                    entries = ZOOMS.map((zoom) => ({ key: "zoom", value: zoom, html: `${zoom}x` }));
                    wide = true;
                    break;
                default:
                    break;
            }
            panel.classList.toggle("is-wide", wide);
            panel.hidden = entries.length === 0;
            entries.forEach((entry) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "paint-option";
                button.innerHTML = entry.html;
                const isZoom = entry.key === "zoom";
                const current = isZoom ? this.zoom : this.options[entry.key];
                button.classList.toggle("is-active", current === entry.value);
                button.addEventListener("click", () => (isZoom ? this.setZoom(entry.value) : this.setOption(entry.key, entry.value)));
                panel.appendChild(button);
            });
        }

        // --- Image et annulation --------------------------------------------------------------------------
        newImage(width, height) {
            this.doc.width = width;
            this.doc.height = height;
            this.overlay.width = width;
            this.overlay.height = height;
            this.ctx = this.doc.getContext("2d", { willReadFrequently: true });
            this.ctx.imageSmoothingEnabled = false;
            this.overlayCtx = this.overlay.getContext("2d");
            this.overlayCtx.imageSmoothingEnabled = false;
            this.ctx.fillStyle = "#ffffff";
            this.ctx.fillRect(0, 0, width, height);
            this.undoStack = [];
            this.redoStack = [];
            this.sel = null;
            this.applyZoom();
            this.updateSelectionUi();
            this.updateSizeLabel();
        }

        resizeDoc(width, height) {
            this.doc.width = width;
            this.doc.height = height;
            this.overlay.width = width;
            this.overlay.height = height;
            this.ctx = this.doc.getContext("2d", { willReadFrequently: true });
            this.ctx.imageSmoothingEnabled = false;
            this.overlayCtx = this.overlay.getContext("2d");
            this.overlayCtx.imageSmoothingEnabled = false;
            this.applyZoom();
            this.updateSizeLabel();
        }

        pushUndo() {
            this.undoStack.push(cloneCanvas(this.doc));
            if (this.undoStack.length > UNDO_LIMIT) {
                this.undoStack.shift();
            }
            this.redoStack = [];
            this.markDirty();
        }

        restore(snapshot) {
            if (snapshot.width !== this.doc.width || snapshot.height !== this.doc.height) {
                this.resizeDoc(snapshot.width, snapshot.height);
            }
            this.ctx.clearRect(0, 0, snapshot.width, snapshot.height);
            this.ctx.drawImage(snapshot, 0, 0);
        }

        undo() {
            this.commitText(true);
            this.cancelPolygon();
            this.curve = null;
            this.sel = null;
            this.updateSelectionUi();
            this.clearPreview();
            const snapshot = this.undoStack.pop();
            if (!snapshot) {
                return;
            }
            this.redoStack.push(cloneCanvas(this.doc));
            this.restore(snapshot);
            this.markDirty();
        }

        redo() {
            const snapshot = this.redoStack.pop();
            if (!snapshot) {
                return;
            }
            this.undoStack.push(cloneCanvas(this.doc));
            this.restore(snapshot);
            this.markDirty();
        }

        applyZoom() {
            const width = this.doc.width * this.zoom;
            const height = this.doc.height * this.zoom;
            [this.stage, this.docCanvas, this.overlay].forEach((element) => {
                element.style.width = `${width}px`;
                element.style.height = `${height}px`;
            });
            this.updateSelectionUi();
            this.applyTextStyle();
        }

        setZoom(zoom, centerOn = null) {
            this.commitText();
            const previous = this.zoom;
            this.zoom = zoom;
            this.applyZoom();
            if (this.toolButtons) {
                this.renderOptions();
            }
            if (centerOn && previous !== zoom) {
                this.scroll.scrollLeft = centerOn.x * zoom - this.scroll.clientWidth / 2;
                this.scroll.scrollTop = centerOn.y * zoom - this.scroll.clientHeight / 2;
            }
        }

        // --- Entrées souris -------------------------------------------------------------------------------
        toPoint(event) {
            const rect = this.stage.getBoundingClientRect();
            return {
                x: clamp(Math.floor((event.clientX - rect.left) / this.zoom), 0, this.doc.width - 1),
                y: clamp(Math.floor((event.clientY - rect.top) / this.zoom), 0, this.doc.height - 1)
            };
        }

        constrain(tool, from, to, shift) {
            if (!shift) {
                return to;
            }
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            if (tool === "line") {
                const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
                const length = Math.hypot(dx, dy);
                return { x: Math.round(from.x + Math.cos(angle) * length), y: Math.round(from.y + Math.sin(angle) * length) };
            }
            const side = Math.max(Math.abs(dx), Math.abs(dy));
            return { x: from.x + Math.sign(dx || 1) * side, y: from.y + Math.sign(dy || 1) * side };
        }

        onPointerDown(event) {
            if (event.target === this.textarea) {
                return;
            }
            if (event.button !== 0 && event.button !== 2) {
                return;
            }
            event.preventDefault();
            this.host.focus({ preventScroll: true });
            const point = this.toPoint(event);
            if (this.textBox && this.tool !== "text") {
                this.commitText();
            }
            const right = event.button === 2;
            const fg = right ? this.back : this.fore;
            const bg = right ? this.fore : this.back;
            this.drag = { start: point, last: point, fg, bg, right, shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey, mode: this.tool };
            this.stage.setPointerCapture?.(event.pointerId);

            switch (this.tool) {
                case "pencil":
                case "brush":
                case "eraser":
                    this.pushUndo();
                    this.freehand(point, point);
                    break;
                case "airbrush":
                    this.pushUndo();
                    this.spray(point);
                    this.airTimer = window.setInterval(() => this.spray(this.drag?.last || point), 30);
                    break;
                case "fill":
                    this.pushUndo();
                    this.floodFill(point.x, point.y, fg);
                    this.drag = null;
                    break;
                case "picker": {
                    const pixel = this.ctx.getImageData(point.x, point.y, 1, 1).data;
                    const hex = `#${[pixel[0], pixel[1], pixel[2]].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
                    this.setColor(right ? "back" : "fore", hex);
                    this.drag = null;
                    this.setTool(this.previousTool === "picker" ? "pencil" : this.previousTool);
                    break;
                }
                case "magnifier":
                    this.setZoom(this.zoom === 1 ? 4 : 1, point);
                    this.drag = null;
                    break;
                case "select":
                    this.beginSelectDrag(point);
                    break;
                case "text":
                    if (this.textBox) {
                        this.commitText();
                    }
                    break;
                case "curve":
                    this.beginCurve(point);
                    break;
                case "polygon":
                    this.addPolygonPoint(point, event.detail >= 2);
                    this.drag = null;
                    break;
                default:
                    break;
            }
        }

        onPointerMove(event) {
            const point = this.toPoint(event);
            this.coordsElement.textContent = `${point.x}, ${point.y}`;
            if (this.tool === "polygon" && this.poly && !this.drag) {
                this.poly.cursor = point;
                this.previewPolygon();
                return;
            }
            if (!this.drag) {
                return;
            }
            const drag = this.drag;
            const previous = drag.last;
            drag.last = point;
            drag.shift = event.shiftKey;
            switch (drag.mode) {
                case "pencil":
                case "brush":
                case "eraser":
                    this.freehand(previous, point);
                    break;
                case "line":
                case "rect":
                case "ellipse":
                case "roundrect": {
                    const end = this.constrain(drag.mode, drag.start, point, drag.shift);
                    drag.end = end;
                    this.preview = () => this.drawShape(this.overlayCtx, drag.mode, drag.start, end, drag.fg, drag.bg);
                    this.renderOverlay();
                    this.updateSizeLabel(`${Math.abs(end.x - drag.start.x) + 1} x ${Math.abs(end.y - drag.start.y) + 1}`);
                    break;
                }
                case "select":
                    this.moveSelectDrag(point);
                    break;
                case "text":
                    this.previewTextRect(drag.start, point);
                    break;
                case "curve":
                    this.moveCurve(point);
                    break;
                default:
                    break;
            }
        }

        onPointerUp(event) {
            const drag = this.drag;
            if (!drag) {
                return;
            }
            this.stage.releasePointerCapture?.(event.pointerId);
            window.clearInterval(this.airTimer);
            this.airTimer = null;
            const point = this.toPoint(event);
            switch (drag.mode) {
                case "line":
                case "rect":
                case "ellipse":
                case "roundrect": {
                    const end = this.constrain(drag.mode, drag.start, point, event.shiftKey);
                    this.pushUndo();
                    this.drawShape(this.ctx, drag.mode, drag.start, end, drag.fg, drag.bg);
                    this.clearPreview();
                    this.updateSizeLabel();
                    break;
                }
                case "select":
                    this.endSelectDrag();
                    break;
                case "text":
                    this.beginText(drag.start, point);
                    break;
                case "curve":
                    this.endCurveDrag(point);
                    break;
                case "polygon":
                    break;
                default:
                    break;
            }
            this.drag = null;
        }

        onKeyDown(event) {
            const inField = event.target === this.textarea || event.target.closest?.("input, select");
            const ctrl = event.ctrlKey || event.metaKey;
            const key = event.key.toLowerCase();
            if (ctrl && key === "s") {
                event.preventDefault();
                void this.save();
                return;
            }
            if (event.key === "Escape") {
                this.cancelTransient();
                return;
            }
            if (inField) {
                return;
            }
            if (ctrl) {
                const actions = {
                    z: () => this.undo(),
                    y: () => this.redo(),
                    n: () => (event.shiftKey ? this.clearImage() : void this.newDocument()),
                    a: () => this.selectAll(),
                    c: () => void this.copySelection(false),
                    x: () => void this.copySelection(true),
                    v: () => void this.paste(),
                    i: () => this.transform("invert"),
                    e: () => void this.editAttributes()
                };
                if (actions[key]) {
                    event.preventDefault();
                    actions[key]();
                }
                return;
            }
            if (event.key === "Delete" || event.key === "Backspace") {
                event.preventDefault();
                this.clearSelection();
            } else if (event.key === "Enter" && this.poly) {
                this.finishPolygon();
            }
        }

        cancelTransient() {
            if (this.textBox) {
                this.removeTextBox();
            }
            this.cancelPolygon();
            this.curve = null;
            this.clearPreview();
            if (this.sel && !this.sel.lifted) {
                this.sel = null;
                this.updateSelectionUi();
            }
        }

        // --- Dessin à main levée --------------------------------------------------------------------------
        getBrushSprite(color) {
            const brush = BRUSHES[this.options.brush];
            const key = `${brush.shape}-${brush.size}-${color}`;
            if (!this.brushCache.has(key)) {
                const size = brush.size;
                const sprite = makeCanvas(size, size);
                const ctx = sprite.getContext("2d");
                ctx.fillStyle = color;
                if (brush.shape === "square") {
                    ctx.fillRect(0, 0, size, size);
                } else if (brush.shape === "round") {
                    drawCrisp(ctx, { x: 0, y: 0, w: size, h: size }, color, (c) => {
                        c.beginPath();
                        c.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
                        c.fill();
                    });
                } else {
                    const flip = brush.shape === "slash";
                    plotLine(0, flip ? size - 1 : 0, size - 1, flip ? 0 : size - 1, (x, y) => ctx.fillRect(x, y, 1, 1));
                }
                this.brushCache.set(key, sprite);
            }
            return this.brushCache.get(key);
        }

        freehand(from, to) {
            const drag = this.drag;
            const ctx = this.ctx;
            if (this.tool === "pencil") {
                ctx.fillStyle = drag.fg;
                plotLine(from.x, from.y, to.x, to.y, (x, y) => ctx.fillRect(x, y, 1, 1));
            } else if (this.tool === "eraser") {
                const size = ERASER_SIZES[this.options.eraser];
                ctx.fillStyle = this.back;
                plotLine(from.x, from.y, to.x, to.y, (x, y) => ctx.fillRect(x - Math.floor(size / 2), y - Math.floor(size / 2), size, size));
            } else {
                const sprite = this.getBrushSprite(drag.fg);
                const half = Math.floor(sprite.width / 2);
                plotLine(from.x, from.y, to.x, to.y, (x, y) => ctx.drawImage(sprite, x - half, y - half));
            }
        }

        spray(point) {
            const radius = AIR_RADII[this.options.air];
            this.ctx.fillStyle = this.drag?.fg || this.fore;
            for (let count = 0; count < 9; count += 1) {
                const angle = Math.random() * Math.PI * 2;
                const distance = Math.sqrt(Math.random()) * radius;
                this.ctx.fillRect(Math.round(point.x + Math.cos(angle) * distance), Math.round(point.y + Math.sin(angle) * distance), 1, 1);
            }
        }

        floodFill(startX, startY, color) {
            const { width, height } = this.doc;
            const image = this.ctx.getImageData(0, 0, width, height);
            const pixels = new Uint32Array(image.data.buffer);
            const [red, green, blue] = hexToRgb(color);
            const replacement = ((255 << 24) | (blue << 16) | (green << 8) | red) >>> 0;
            const target = pixels[startY * width + startX];
            if (target === replacement) {
                return;
            }
            const stack = [startX, startY];
            while (stack.length > 0) {
                const y = stack.pop();
                let x = stack.pop();
                while (x >= 0 && pixels[y * width + x] === target) {
                    x -= 1;
                }
                x += 1;
                let above = false;
                let below = false;
                while (x < width && pixels[y * width + x] === target) {
                    pixels[y * width + x] = replacement;
                    if (y > 0) {
                        const isTarget = pixels[(y - 1) * width + x] === target;
                        if (isTarget && !above) {
                            stack.push(x, y - 1);
                        }
                        above = isTarget;
                    }
                    if (y < height - 1) {
                        const isTarget = pixels[(y + 1) * width + x] === target;
                        if (isTarget && !below) {
                            stack.push(x, y + 1);
                        }
                        below = isTarget;
                    }
                    x += 1;
                }
            }
            this.ctx.putImageData(image, 0, 0);
        }

        // --- Formes ---------------------------------------------------------------------------------------
        drawShape(ctx, tool, a, b, fg, bg) {
            const lw = LINE_WIDTHS[this.options.line];
            if (tool === "line") {
                strokeSegments(ctx, [a, b], lw, fg);
                return;
            }
            const x = Math.min(a.x, b.x);
            const y = Math.min(a.y, b.y);
            const w = Math.abs(b.x - a.x) + 1;
            const h = Math.abs(b.y - a.y) + 1;
            const mode = this.options.fill;
            const box = { x: x - 1, y: y - 1, w: w + 2, h: h + 2 };
            const fillColor = mode === 1 ? bg : mode === 2 ? fg : null;
            if (tool === "rect") {
                if (fillColor) {
                    ctx.fillStyle = fillColor;
                    ctx.fillRect(x, y, w, h);
                }
                if (mode !== 2) {
                    ctx.fillStyle = fg;
                    const t = Math.min(lw, Math.ceil(Math.min(w, h) / 2));
                    ctx.fillRect(x, y, w, t);
                    ctx.fillRect(x, y + h - t, w, t);
                    ctx.fillRect(x, y, t, h);
                    ctx.fillRect(x + w - t, y, t, h);
                }
                return;
            }
            const path = (c) => {
                if (tool === "ellipse") {
                    c.beginPath();
                    c.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
                } else {
                    roundRectPath(c, x, y, w, h, Math.min(16, Math.min(w, h) / 2));
                }
            };
            if (fillColor) {
                drawCrisp(ctx, box, fillColor, (c) => {
                    path(c);
                    c.fill();
                });
            }
            if (mode !== 2) {
                drawCrisp(ctx, box, fg, (c) => {
                    c.lineWidth = lw;
                    // Le trait reste à l'intérieur du cadre de sélection.
                    const inset = lw / 2;
                    if (tool === "ellipse") {
                        c.beginPath();
                        c.ellipse(x + w / 2, y + h / 2, Math.max(0.5, w / 2 - inset), Math.max(0.5, h / 2 - inset), 0, 0, Math.PI * 2);
                    } else {
                        roundRectPath(c, x + inset, y + inset, Math.max(1, w - lw), Math.max(1, h - lw), Math.min(16, Math.min(w, h) / 2));
                    }
                    c.stroke();
                });
            }
        }

        // Courbe : une ligne, puis deux clics pour la courbure.
        beginCurve(point) {
            if (!this.curve) {
                this.curve = { a: point, b: point, c1: point, c2: point, phase: 0, fg: this.drag.fg };
                return;
            }
            this.curve.phase = this.curve.phase === 1 ? 11 : 21;
            this.moveCurve(point);
        }

        moveCurve(point) {
            const curve = this.curve;
            if (!curve) {
                return;
            }
            if (curve.phase === 0) {
                curve.b = this.constrain("line", curve.a, point, this.drag?.shift);
                curve.c1 = curve.a;
                curve.c2 = curve.b;
            } else if (curve.phase === 11) {
                curve.c1 = point;
                curve.c2 = point;
            } else if (curve.phase === 21) {
                curve.c2 = point;
            }
            this.previewCurve();
        }

        previewCurve() {
            const curve = this.curve;
            this.preview = () => strokeSegments(this.overlayCtx, bezierPoints(curve.a, curve.c1, curve.c2, curve.b), LINE_WIDTHS[this.options.line], curve.fg);
            this.renderOverlay();
        }

        endCurveDrag(point) {
            const curve = this.curve;
            if (!curve) {
                return;
            }
            if (curve.phase === 0) {
                if (curve.a.x === curve.b.x && curve.a.y === curve.b.y) {
                    this.commitCurve();
                } else {
                    curve.phase = 1;
                }
            } else if (curve.phase === 11) {
                curve.phase = 2;
            } else if (curve.phase === 21) {
                this.commitCurve();
            }
        }

        commitCurve() {
            const curve = this.curve;
            this.curve = null;
            if (!curve) {
                return;
            }
            this.pushUndo();
            strokeSegments(this.ctx, bezierPoints(curve.a, curve.c1, curve.c2, curve.b), LINE_WIDTHS[this.options.line], curve.fg);
            this.clearPreview();
        }

        // Polygone : clic par sommet, double-clic (ou Entrée) pour refermer.
        addPolygonPoint(point, isDoubleClick) {
            if (!this.poly) {
                this.poly = { points: [point], cursor: point, fg: this.drag.fg, bg: this.drag.bg };
            } else if (isDoubleClick) {
                this.finishPolygon();
                return;
            } else {
                this.poly.points.push(point);
            }
            this.previewPolygon();
        }

        previewPolygon() {
            const poly = this.poly;
            if (!poly) {
                return;
            }
            this.preview = () => this.drawPolygon(this.overlayCtx, [...poly.points, poly.cursor], false, poly);
            this.renderOverlay();
        }

        drawPolygon(ctx, points, closed, poly) {
            const lw = LINE_WIDTHS[this.options.line];
            const mode = this.options.fill;
            const fillColor = closed ? (mode === 1 ? poly.bg : mode === 2 ? poly.fg : null) : null;
            if (fillColor && points.length >= 3) {
                const xs = points.map((point) => point.x);
                const ys = points.map((point) => point.y);
                const box = { x: Math.min(...xs) - 1, y: Math.min(...ys) - 1, w: Math.max(...xs) - Math.min(...xs) + 3, h: Math.max(...ys) - Math.min(...ys) + 3 };
                drawCrisp(ctx, box, fillColor, (c) => {
                    c.beginPath();
                    points.forEach((point, index) => (index === 0 ? c.moveTo(point.x + 0.5, point.y + 0.5) : c.lineTo(point.x + 0.5, point.y + 0.5)));
                    c.closePath();
                    c.fill();
                });
            }
            if (!closed || mode !== 2) {
                strokeSegments(ctx, points, lw, poly.fg, closed);
            }
        }

        finishPolygon() {
            const poly = this.poly;
            this.poly = null;
            if (!poly) {
                return;
            }
            if (poly.points.length >= 2) {
                this.pushUndo();
                this.drawPolygon(this.ctx, poly.points, poly.points.length >= 3, poly);
            }
            this.clearPreview();
        }

        cancelPolygon() {
            this.poly = null;
            if (this.tool === "polygon") {
                this.clearPreview();
            }
        }

        // --- Aperçu (couche au-dessus de l'image) ---------------------------------------------------------
        renderOverlay() {
            const ctx = this.overlayCtx;
            ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
            if (this.sel?.lifted) {
                ctx.drawImage(this.getSelectionImage(), this.sel.x, this.sel.y);
            }
            this.preview?.();
        }

        clearPreview() {
            this.preview = null;
            this.renderOverlay();
        }

        // --- Sélection ------------------------------------------------------------------------------------
        getSelectionImage() {
            const sel = this.sel;
            if (this.options.opaque) {
                return sel.content;
            }
            if (!sel.keyed || sel.keyedColor !== this.back) {
                sel.keyed = keyOutColor(sel.content, this.back);
                sel.keyedColor = this.back;
            }
            return sel.keyed;
        }

        updateSelectionUi() {
            const element = this.selectionElement;
            if (!this.sel) {
                element.hidden = true;
                return;
            }
            element.hidden = false;
            element.style.left = `${this.sel.x * this.zoom}px`;
            element.style.top = `${this.sel.y * this.zoom}px`;
            element.style.width = `${this.sel.w * this.zoom}px`;
            element.style.height = `${this.sel.h * this.zoom}px`;
        }

        beginSelectDrag(point) {
            const sel = this.sel;
            if (sel && point.x >= sel.x && point.x < sel.x + sel.w && point.y >= sel.y && point.y < sel.y + sel.h) {
                if (!sel.lifted) {
                    this.pushUndo();
                    sel.content = makeCanvas(sel.w, sel.h);
                    sel.content.getContext("2d").drawImage(this.doc, sel.x, sel.y, sel.w, sel.h, 0, 0, sel.w, sel.h);
                    if (!this.drag.ctrl) {
                        this.ctx.fillStyle = this.back;
                        this.ctx.fillRect(sel.x, sel.y, sel.w, sel.h);
                    }
                    sel.lifted = true;
                }
                this.drag.mode = "select";
                this.drag.moving = { dx: point.x - sel.x, dy: point.y - sel.y };
                return;
            }
            this.commitSelection();
            this.drag.selecting = true;
        }

        moveSelectDrag(point) {
            const drag = this.drag;
            if (drag.moving && this.sel) {
                this.sel.x = point.x - drag.moving.dx;
                this.sel.y = point.y - drag.moving.dy;
                this.renderOverlay();
                this.updateSelectionUi();
            } else if (drag.selecting) {
                const x = Math.min(drag.start.x, point.x);
                const y = Math.min(drag.start.y, point.y);
                this.sel = { x, y, w: Math.abs(point.x - drag.start.x) + 1, h: Math.abs(point.y - drag.start.y) + 1, lifted: false, content: null };
                this.updateSelectionUi();
                this.updateSizeLabel(`${this.sel.w} x ${this.sel.h}`);
            }
        }

        endSelectDrag() {
            if (this.drag?.selecting && this.sel && this.sel.w * this.sel.h <= 1) {
                this.sel = null;
                this.updateSelectionUi();
            }
            this.updateSizeLabel();
        }

        commitSelection() {
            const sel = this.sel;
            if (!sel) {
                return;
            }
            if (sel.lifted) {
                this.ctx.drawImage(this.getSelectionImage(), sel.x, sel.y);
            }
            this.sel = null;
            this.updateSelectionUi();
            this.renderOverlay();
        }

        selectAll() {
            this.setTool("select");
            this.sel = { x: 0, y: 0, w: this.doc.width, h: this.doc.height, lifted: false, content: null };
            this.updateSelectionUi();
        }

        getSelectionCanvas() {
            const sel = this.sel;
            if (!sel) {
                return null;
            }
            if (sel.lifted) {
                return cloneCanvas(this.getSelectionImage());
            }
            const copy = makeCanvas(sel.w, sel.h);
            copy.getContext("2d").drawImage(this.doc, sel.x, sel.y, sel.w, sel.h, 0, 0, sel.w, sel.h);
            return copy;
        }

        async copySelection(cut) {
            const copy = this.getSelectionCanvas();
            if (!copy) {
                return;
            }
            this.clipboard = copy;
            copy.toBlob((blob) => {
                if (blob && navigator.clipboard?.write && window.ClipboardItem) {
                    navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]).catch(() => {});
                }
            });
            if (cut) {
                this.clearSelection();
            }
        }

        clearSelection() {
            const sel = this.sel;
            if (!sel) {
                return;
            }
            if (!sel.lifted) {
                this.pushUndo();
                this.ctx.fillStyle = this.back;
                this.ctx.fillRect(sel.x, sel.y, sel.w, sel.h);
            }
            this.sel = null;
            this.updateSelectionUi();
            this.renderOverlay();
        }

        async paste() {
            let image = null;
            try {
                const items = await navigator.clipboard?.read?.();
                for (const item of items || []) {
                    const type = item.types.find((candidate) => candidate.startsWith("image/"));
                    if (type) {
                        const bitmap = await createImageBitmap(await item.getType(type));
                        image = makeCanvas(bitmap.width, bitmap.height);
                        image.getContext("2d").drawImage(bitmap, 0, 0);
                        break;
                    }
                }
            } catch {
                image = null;
            }
            image = image || (this.clipboard ? cloneCanvas(this.clipboard) : null);
            if (!image) {
                this.setStatus("Le presse-papiers ne contient pas d'image.");
                return;
            }
            this.setTool("select");
            this.pushUndo();
            this.sel = { x: 0, y: 0, w: image.width, h: image.height, lifted: true, content: image };
            this.updateSelectionUi();
            this.renderOverlay();
        }

        // --- Texte ----------------------------------------------------------------------------------------
        previewTextRect(a, b) {
            const x = Math.min(a.x, b.x);
            const y = Math.min(a.y, b.y);
            this.sel = { x, y, w: Math.abs(b.x - a.x) + 1, h: Math.abs(b.y - a.y) + 1, lifted: false, content: null, textPreview: true };
            this.updateSelectionUi();
        }

        beginText(a, b) {
            this.sel = null;
            this.updateSelectionUi();
            const x = Math.min(a.x, b.x);
            const y = Math.min(a.y, b.y);
            const w = Math.max(Math.abs(b.x - a.x) + 1, 60);
            const h = Math.max(Math.abs(b.y - a.y) + 1, 24);
            const area = document.createElement("textarea");
            area.className = "paint-textarea";
            area.spellcheck = false;
            area.style.left = `${x * this.zoom}px`;
            area.style.top = `${y * this.zoom}px`;
            area.style.width = `${w * this.zoom}px`;
            area.style.height = `${h * this.zoom}px`;
            this.stage.appendChild(area);
            this.textarea = area;
            this.textBox = { x, y, w, h, fg: this.drag.fg, bg: this.drag.bg };
            this.applyTextStyle();
            window.setTimeout(() => area.focus(), 0);
        }

        getFontSpec(scale = 1) {
            const size = Number(this.textSize.value) * scale;
            const style = `${this.textStyle.italic ? "italic " : ""}${this.textStyle.bold ? "bold " : ""}`;
            return `${style}${size}px "${this.textFont.value}"`;
        }

        applyTextStyle() {
            if (!this.textarea) {
                return;
            }
            const area = this.textarea;
            area.style.font = this.getFontSpec(this.zoom);
            area.style.textDecoration = this.textStyle.underline ? "underline" : "none";
            area.style.color = this.textBox?.fg || this.fore;
            area.style.background = this.options.opaque ? (this.textBox?.bg || this.back) : "transparent";
        }

        removeTextBox() {
            this.textarea?.remove();
            this.textarea = null;
            this.textBox = null;
        }

        commitText(discard = false) {
            if (!this.textBox) {
                return;
            }
            const box = this.textBox;
            const text = this.textarea.value;
            this.removeTextBox();
            if (discard || !text.trim()) {
                return;
            }
            this.pushUndo();
            const ctx = this.ctx;
            if (this.options.opaque) {
                ctx.fillStyle = box.bg;
                ctx.fillRect(box.x, box.y, box.w, box.h);
            }
            ctx.save();
            ctx.beginPath();
            ctx.rect(box.x, box.y, box.w, box.h);
            ctx.clip();
            ctx.font = this.getFontSpec();
            ctx.textBaseline = "top";
            ctx.fillStyle = box.fg;
            const lineHeight = Math.round(Number(this.textSize.value) * 1.2);
            let y = box.y + 1;
            text.split("\n").forEach((paragraph) => {
                let line = "";
                const flush = () => {
                    ctx.fillText(line, box.x + 1, y);
                    if (this.textStyle.underline) {
                        ctx.fillRect(box.x + 1, y + lineHeight - 2, Math.ceil(ctx.measureText(line).width), 1);
                    }
                    y += lineHeight;
                    line = "";
                };
                paragraph.split(" ").forEach((word) => {
                    const candidate = line ? `${line} ${word}` : word;
                    if (line && ctx.measureText(candidate).width > box.w - 2) {
                        flush();
                        line = word;
                    } else {
                        line = candidate;
                    }
                });
                flush();
            });
            ctx.restore();
        }

        // --- Commandes de l'image -------------------------------------------------------------------------
        clearImage() {
            this.commitText(true);
            this.commitSelection();
            this.pushUndo();
            this.ctx.fillStyle = this.back;
            this.ctx.fillRect(0, 0, this.doc.width, this.doc.height);
        }

        transform(kind) {
            this.commitText();
            this.commitSelection();
            this.pushUndo();
            const source = cloneCanvas(this.doc);
            const { width, height } = source;
            const rotated = kind === "rot90" || kind === "rot270";
            if (rotated) {
                this.resizeDoc(height, width);
            }
            const ctx = this.ctx;
            ctx.save();
            ctx.clearRect(0, 0, this.doc.width, this.doc.height);
            if (kind === "flipH") {
                ctx.translate(width, 0);
                ctx.scale(-1, 1);
            } else if (kind === "flipV") {
                ctx.translate(0, height);
                ctx.scale(1, -1);
            } else if (kind === "rot90") {
                ctx.translate(height, 0);
                ctx.rotate(Math.PI / 2);
            } else if (kind === "rot180") {
                ctx.translate(width, height);
                ctx.rotate(Math.PI);
            } else if (kind === "rot270") {
                ctx.translate(0, width);
                ctx.rotate(-Math.PI / 2);
            }
            ctx.drawImage(source, 0, 0);
            ctx.restore();
            if (kind === "invert") {
                const image = ctx.getImageData(0, 0, this.doc.width, this.doc.height);
                for (let index = 0; index < image.data.length; index += 4) {
                    image.data[index] = 255 - image.data[index];
                    image.data[index + 1] = 255 - image.data[index + 1];
                    image.data[index + 2] = 255 - image.data[index + 2];
                }
                ctx.putImageData(image, 0, 0);
            }
        }

        async editAttributes() {
            this.commitText();
            this.commitSelection();
            const values = await window.Win95Dialog?.form({
                title: "Attributs",
                message: `Dimensions de l'image en pixels (maximum ${MAX_SIZE}).`,
                fields: [
                    { name: "width", label: "Largeur :", type: "text", value: String(this.doc.width) },
                    { name: "height", label: "Hauteur :", type: "text", value: String(this.doc.height) }
                ]
            });
            if (!values) {
                return;
            }
            const width = Number.parseInt(values.width, 10);
            const height = Number.parseInt(values.height, 10);
            if (!(width >= 1 && height >= 1 && width <= MAX_SIZE && height <= MAX_SIZE)) {
                void window.Win95Dialog.alert({ title: "Attributs", message: `Dimensions invalides (1 à ${MAX_SIZE} pixels).` });
                return;
            }
            this.pushUndo();
            const source = cloneCanvas(this.doc);
            this.resizeDoc(width, height);
            this.ctx.fillStyle = this.back;
            this.ctx.fillRect(0, 0, width, height);
            this.ctx.drawImage(source, 0, 0);
        }

        // --- Fichiers -------------------------------------------------------------------------------------
        getDataUrl() {
            this.commitText();
            this.commitSelection();
            return this.doc.toDataURL("image/png");
        }

        // Charge un dessin (data URL ou URL d'image) ; vide = nouvelle image blanche.
        loadSource(source) {
            return new Promise((resolve) => {
                const text = String(source || "").trim();
                if (!text.startsWith("data:image/") && !/^(blob:|https?:)/i.test(text)) {
                    this.newImage(DEFAULT_SIZE.width, DEFAULT_SIZE.height);
                    resolve(true);
                    return;
                }
                const image = new Image();
                image.onload = () => {
                    const width = clamp(image.naturalWidth, 1, MAX_SIZE);
                    const height = clamp(image.naturalHeight, 1, MAX_SIZE);
                    this.newImage(width, height);
                    this.ctx.drawImage(image, 0, 0, width, height);
                    resolve(true);
                };
                image.onerror = () => {
                    this.newImage(DEFAULT_SIZE.width, DEFAULT_SIZE.height);
                    resolve(false);
                };
                image.src = text;
            });
        }

        async setDocument({ fileName = "", content = "", onSave = null } = {}) {
            this.cancelTransient();
            this.removeTextBox();
            const ok = await this.loadSource(content);
            this.onSave = typeof onSave === "function" ? onSave : null;
            this.currentFileName = fileName;
            this.isDirty = false;
            this.updateTitle();
            this.setStatus(ok ? "" : "Impossible de lire ce dessin : nouvelle image créée.");
        }

        async newDocument() {
            if (this.isDirty && !(await this.confirmDiscard())) {
                return;
            }
            await this.setDocument({});
        }

        async confirmDiscard() {
            return window.Win95Dialog.confirm({
                title: "Paint",
                message: `Les modifications de « ${this.currentFileName || "sans titre"} » ne sont pas enregistrées.\nContinuer sans enregistrer ?`,
                confirmLabel: "Continuer"
            });
        }

        async importFromComputer() {
            const file = this.fileInput.files?.[0];
            this.fileInput.value = "";
            if (!file) {
                return;
            }
            if (this.isDirty && !(await this.confirmDiscard())) {
                return;
            }
            const url = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => resolve("");
                reader.readAsDataURL(file);
            });
            await this.setDocument({ content: url });
            this.currentFileName = "";
            this.markDirty();
            this.updateTitle();
        }

        exportPng() {
            const link = document.createElement("a");
            link.href = this.getDataUrl();
            link.download = `${(this.currentFileName || "dessin").replace(/\.paint$/i, "")}.png`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            this.setStatus("Image exportée en PNG.");
        }

        async save() {
            if (this.isSaving) {
                return;
            }
            if (!this.onSave) {
                await this.saveAs();
                return;
            }
            this.isSaving = true;
            this.setStatus("Enregistrement…");
            try {
                const result = await this.onSave(this.getDataUrl());
                if (result?.ok) {
                    this.isDirty = false;
                    this.updateTitle();
                }
                this.setStatus(result?.message || "");
            } catch (error) {
                this.setStatus(`Enregistrement impossible : ${error?.message || error}`);
            } finally {
                this.isSaving = false;
            }
        }

        // « Enregistrer sous » : crée le dessin à la racine de Mes documents, puis l'enregistrement suivant le met à jour.
        async saveAs() {
            const userFiles = window.Win95UserFiles;
            if (!userFiles) {
                this.setStatus("Mes documents indisponible.");
                return;
            }
            const suggested = String(this.currentFileName || "Nouveau dessin").replace(/\.paint$/i, "");
            const name = await window.Win95Dialog.prompt({
                title: "Paint — Enregistrer",
                message: "Enregistrer dans Mes documents sous le nom :",
                defaultValue: suggested
            });
            if (!name) {
                return;
            }
            const fileName = /\.paint$/i.test(name) ? name : `${name}.paint`;
            this.isSaving = true;
            this.setStatus("Enregistrement…");
            try {
                const result = await userFiles.createTextFile(null, fileName, this.getDataUrl());
                if (result.ok && result.file) {
                    const fileId = result.file.id;
                    this.onSave = (text) => userFiles.saveTextContent(fileId, text);
                    this.currentFileName = result.file.name;
                    this.isDirty = false;
                    this.updateTitle();
                }
                this.setStatus(result.message);
            } catch (error) {
                this.setStatus(`Enregistrement impossible : ${error?.message || error}`);
            } finally {
                this.isSaving = false;
            }
        }

        async handleWindowClosing(event) {
            if (!this.isDirty) {
                return;
            }
            event.preventDefault();
            const confirmed = await window.Win95Dialog.confirm({
                title: "Paint",
                message: `Les modifications de « ${this.currentFileName || "sans titre"} » ne sont pas enregistrées.\nFermer sans enregistrer ?`,
                confirmLabel: "Fermer"
            });
            if (confirmed) {
                this.isDirty = false;
                window.Win95WindowManager?.closeWindow(this.rootElement);
            }
        }
    }

    function initializePaint() {
        document.querySelectorAll("[data-window-app='paint']").forEach((element) => paintApi.attach(element));
    }

    const paintApi = {
        attach(rootElement) {
            return rootElement.__win95PaintInstance || new Win95Paint(rootElement);
        },
        initialize: initializePaint,
        // Ouvre un dessin dans une nouvelle fenêtre : { fileName, content (data URL, vide = image blanche), onSave }.
        openFromFile(fileDetail = {}) {
            const windowElement = window.Win95WindowManager?.openApp?.("paint", { forceNew: true });
            const instance = windowElement ? (windowElement.__win95PaintInstance || paintApi.attach(windowElement)) : null;
            if (instance) {
                void instance.setDocument(fileDetail);
            }
            return instance;
        }
    };

    window.Win95Paint = paintApi;
    window.Win95Services?.register?.("Win95Paint", paintApi);

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializePaint);
    } else {
        initializePaint();
    }
})();
