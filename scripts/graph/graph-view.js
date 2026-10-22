(() => {
    // Vue graphique animée (Win95GraphView), dans l'esprit de la vue graphique d'Obsidian : des nœuds reliés par des flèches colorées. Composant générique,
    // sans rien de propre à un projet : le projet fournit les nœuds, les relations, leur couleur et ce que signifie un clic.
    // Dessin SVG persistant : les nœuds gardent leur place d'une mise à jour à l'autre et glissent vers leur nouvelle position (simulation de forces :
    // répulsion, ressorts le long des relations).
    //  - Le sujet visé (`selected`) et ses voisins directs (1er degré) sont en pleine clarté ; ceux du 2e et du 3e degré sont de plus en plus pâles ;
    //    les nœuds sans lien avec le sujet (vue générale) sont à peine visibles. Survoler un nœud met en clair son propre voisinage.
    //  - `radial` (vue locale) range les nœuds en anneaux selon leur degré autour du sujet ; sinon (vue générale) la disposition reste stable et seule
    //    la mise en clair change quand on choisit un autre sujet.
    //  - Molette = zoom, glisser le fond = déplacer la vue, glisser un nœud = le déplacer, clic ou Entrée = choisir le nœud (onSelect).
    //  - prefers-reduced-motion : la disposition est calculée d'un coup, sans glissement.
    //  - setOptions règle l'affichage (flèches, épaisseur des liens, taille des nœuds, seuil des noms), la physique (répulsion, attraction, distance,
    //    gravité) et la profondeur du voisinage mis en clair, comme les options de la vue graphique d'Obsidian (voir DEFAULT_OPTIONS ; le panneau qui les
    //    propose à l'utilisateur est Win95GraphOptions).
    //
    // create(container, { onSelect(key), colorOf(valeur), values: [valeurs possibles], ariaLabel }) -> { setData, setOptions, recolor, setMessage, fit, destroy }
    //  - colorOf(valeur) : couleur d'une flèche ; values : toutes les valeurs que peut prendre une flèche (une pointe de flèche par valeur).
    //  - setData({ nodes, edges, selected, radial, refit }) :
    //      nodes : [{ key, nom, kind, shape, kindLabel, title, color }] ; kind = classe `is-<kind>` du nœud (pour le style du projet), shape = "circle"
    //              (défaut) ou "square", kindLabel = type en toutes lettres pour les lecteurs d'écran, title = infobulle, color = remplissage ;
    //      edges : [{ key, from, to, value, label, tooltip }] ; label = texte du badge posé sur la flèche (seules les flèches du sujet en portent un) ;
    //      selected : clé du sujet ("" si aucun) ; radial : anneaux par degré autour du sujet ; refit : recentre la vue une fois les nœuds en place.

    const SVG_NS = "http://www.w3.org/2000/svg";
    const FAR_OPACITY = 0.1;
    const RING_RADIUS = [0, 125, 220, 295];
    const RING_STEP = 70;
    const NODE_SIZE = 11;
    const SELECTED_SIZE = 15;
    const RADIAL_STRENGTH = 0.12;
    const DAMPING = 0.78;
    const ALPHA_DECAY = 0.985;
    const ALPHA_MIN = 0.02;
    const FIT_MARGIN = 70;
    const ZOOM_MIN = 0.25;
    const ZOOM_MAX = 3;
    const DRAG_THRESHOLD = 4;
    const FADE_MS = 300;
    // Réglages par défaut (setOptions) : flèches, épaisseur des liens et taille des nœuds (multiplicateurs), taille selon le nombre de relations,
    // zoom à partir duquel tous les noms s'affichent, forces de la simulation, profondeur (degrés) du voisinage mis en clair.
    const DEFAULT_OPTIONS = {
        arrows: true, linkWidth: 1, nodeSize: 1, sizeByLinks: false, labelZoom: 0.6,
        repulsion: 2600, linkStrength: 0.03, linkDistance: 85, gravity: 0.02, depth: 3
    };
    let uid = 0;

    const svg = (name, attributes = {}) => {
        const element = document.createElementNS(SVG_NS, name);
        Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
        return element;
    };
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const reducedMotion = () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
    // Nombre pseudo-aléatoire stable pour une clé : un même nœud apparaît toujours au même endroit.
    const seeded = (key, salt) => {
        let hash = salt * 2654435761;
        for (let index = 0; index < key.length; index += 1) {
            hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
        }
        return ((hash >>> 0) % 10000) / 10000;
    };

    class GraphView {
        constructor(container, { onSelect, colorOf, values = [], ariaLabel = "Graphe de relations" }) {
            this.container = container;
            this.onSelect = onSelect;
            this.colorOf = colorOf;
            this.id = `gv${(uid += 1)}`;
            this.nodes = new Map();
            this.edges = new Map();
            this.list = [];
            this.links = [];
            this.adjacency = new Map();
            this.degreeCache = new Map();
            this.selected = "";
            this.hover = "";
            this.radial = false;
            this.alpha = 0;
            this.raf = 0;
            this.size = { width: 600, height: 400 };
            this.view = { k: 1, x: 0, y: 0 };
            this.fitting = false;
            this.fitFrames = 0;
            this.drag = null;
            this.labeled = null;
            this.destroyed = false;
            this.options = { ...DEFAULT_OPTIONS };

            container.classList.add("gv-container");
            this.svg = svg("svg", { class: "gv-svg", role: "group", "aria-label": ariaLabel });
            const defs = svg("defs");
            // Une pointe de flèche par valeur possible, de la couleur de cette valeur.
            this.markers = new Map();
            values.forEach((value, index) => {
                const id = `${this.id}-arrow-${index}`;
                this.markers.set(value, id);
                const marker = svg("marker", { id, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 9, markerHeight: 9, markerUnits: "userSpaceOnUse", orient: "auto" });
                marker.appendChild(svg("path", { d: "M0,0 L10,5 L0,10 z", fill: colorOf(value) }));
                defs.appendChild(marker);
            });
            this.viewport = svg("g", { class: "gv-viewport" });
            this.edgeLayer = svg("g", { class: "gv-edges" });
            this.labelLayer = svg("g", { class: "gv-edge-labels" });
            this.nodeLayer = svg("g", { class: "gv-nodes" });
            this.viewport.append(this.edgeLayer, this.labelLayer, this.nodeLayer);
            this.svg.append(defs, this.viewport);
            this.message = document.createElement("div");
            this.message.className = "gv-message";
            this.message.hidden = true;
            container.replaceChildren(this.svg, this.message);

            this.bindEvents();
            if (typeof ResizeObserver === "function") {
                this.resizer = new ResizeObserver(() => this.measure());
                this.resizer.observe(container);
            }
            this.measure();
        }

        measure() {
            const { clientWidth, clientHeight } = this.container;
            if (clientWidth > 0 && clientHeight > 0) {
                this.size = { width: clientWidth, height: clientHeight };
                this.start();
            }
        }

        setMessage(text) {
            this.message.textContent = text;
            this.message.hidden = !text;
            this.svg.style.display = text ? "none" : "";
        }

        // Change une partie des réglages ; une force modifiée relance la simulation pour que les nœuds trouvent leur nouvelle place.
        setOptions(options) {
            const previous = this.options;
            this.options = { ...previous, ...options };
            const physics = ["repulsion", "linkStrength", "linkDistance", "gravity", "depth"].some((key) => previous[key] !== this.options[key]);
            this.degreeCache.clear();
            this.nodes.forEach((node) => this.updateNodeShape(node));
            this.edges.forEach((edge) => this.updateEdgeStyle(edge));
            this.restyle();
            if (physics) {
                this.alpha = Math.max(this.alpha, 0.5);
                this.settle();
            } else {
                this.render();
            }
        }

        // Fait avancer la simulation : animée, ou d'un coup si l'utilisateur limite les animations.
        settle() {
            if (reducedMotion()) {
                for (let step = 0; step < 300 && this.alpha > ALPHA_MIN; step += 1) {
                    this.step();
                }
                if (this.fitting) {
                    this.snapView();
                    this.fitting = false;
                }
                this.render();
            } else {
                this.start();
            }
        }

        // Taille d'un nœud : le sujet est plus grand ; en option, elle croît avec le nombre de relations (comme les références dans Obsidian).
        sizeOf(node) {
            const scale = this.options.nodeSize;
            const links = this.options.sizeByLinks ? (this.adjacency.get(node.key)?.size || 0) : 0;
            return ((node.key === this.selected ? SELECTED_SIZE : NODE_SIZE) + Math.sqrt(links) * 3) * scale;
        }

        ringRadius(degree) {
            const last = RING_RADIUS.length - 1;
            return degree <= last ? RING_RADIUS[degree] : RING_RADIUS[last] + (degree - last) * RING_STEP;
        }

        // --- Données ---------------------------------------------------------------------------------------------------------------

        setData({ nodes, edges, selected, radial, refit }) {
            this.selected = selected;
            this.radial = radial;
            this.degreeCache.clear();
            const wanted = new Set(nodes.map((node) => node.key));
            this.nodes.forEach((node, key) => {
                if (!wanted.has(key)) {
                    this.nodes.delete(key);
                    this.fadeOut(node.el);
                }
            });
            const edgeKeys = new Set(edges.map((edge) => edge.key));
            this.edges.forEach((edge, key) => {
                if (!edgeKeys.has(key)) {
                    this.edges.delete(key);
                    this.fadeOut(edge.el);
                    this.fadeOut(edge.badge);
                }
            });

            this.adjacency = new Map(nodes.map((node) => [node.key, new Set()]));
            edges.forEach((edge) => {
                this.adjacency.get(edge.from)?.add(edge.to);
                this.adjacency.get(edge.to)?.add(edge.from);
            });
            const layout = this.degreesOf(selected);
            nodes.forEach((node) => {
                const known = this.nodes.get(node.key);
                if (known) {
                    Object.assign(known, node);
                    known.label.textContent = node.nom;
                    known.el.querySelector("title").textContent = node.title || node.nom;
                    this.updateNodeShape(known);
                } else {
                    this.nodes.set(node.key, this.createNode(node, selected, layout));
                }
            });
            const pairs = new Set(edges.map((edge) => `${edge.from}>${edge.to}`));
            edges.forEach((edge) => {
                const touches = edge.from === selected || edge.to === selected;
                const known = this.edges.get(edge.key);
                const data = { ...edge, touches, offset: pairs.has(`${edge.to}>${edge.from}`) ? (edge.from < edge.to ? 3.5 : -3.5) : 0 };
                if (known) {
                    Object.assign(known, data);
                    if (touches && edge.label && !known.badge) {
                        known.badge = this.createEdgeBadge(known);
                    } else if (known.badge) {
                        this.updateEdgeBadge(known);
                    }
                    known.el.querySelector("title").textContent = edge.tooltip || "";
                    this.updateEdgeStyle(known);
                } else {
                    this.edges.set(edge.key, this.createEdge(data));
                }
            });
            this.list = [...this.nodes.values()];
            const seen = new Set();
            this.links = [];
            edges.forEach((edge) => {
                const pair = edge.from < edge.to ? `${edge.from}|${edge.to}` : `${edge.to}|${edge.from}`;
                const from = this.nodes.get(edge.from);
                const to = this.nodes.get(edge.to);
                if (from && to && from !== to && !seen.has(pair)) {
                    seen.add(pair);
                    this.links.push([from, to]);
                }
            });
            // Les éléments neufs partent de la transparence : un rendu intermédiaire fixe ce point de départ avant la mise en clair.
            void this.svg.getBoundingClientRect();
            this.restyle();
            this.alpha = 1;
            if (refit) {
                this.fitting = true;
                this.fitFrames = 0;
            }
            this.settle();
        }

        // Change la couleur et l'infobulle des nœuds ([{ key, color, title }]) sans relancer la simulation.
        recolor(nodes) {
            nodes.forEach(({ key, color, title }) => {
                const node = this.nodes.get(key);
                if (node) {
                    Object.assign(node, { color, title });
                    node.el.querySelector("title").textContent = title || node.nom;
                    this.updateNodeShape(node);
                }
            });
        }

        fadeOut(element) {
            if (!element) {
                return;
            }
            element.style.opacity = 0;
            element.style.pointerEvents = "none";
            window.setTimeout(() => element.remove(), FADE_MS);
        }

        // Place d'un nouveau nœud : près d'un voisin déjà posé, sinon sur l'anneau de son degré (vue locale) ou autour du centre.
        createNode(data, selected, layout) {
            const neighbour = [...(this.adjacency.get(data.key) || [])].map((key) => this.nodes.get(key)).find(Boolean);
            const angle = seeded(data.key, 1) * Math.PI * 2;
            const degree = layout.get(data.key);
            const radius = neighbour ? 30 + seeded(data.key, 2) * 20 : this.radial && degree !== undefined ? this.ringRadius(degree) : 80 + seeded(data.key, 3) * 160;
            const base = neighbour || { x: 0, y: 0 };
            const node = {
                ...data, x: base.x + Math.cos(angle) * radius, y: base.y + Math.sin(angle) * radius, vx: 0, vy: 0, pinned: false, degree: Infinity, size: NODE_SIZE
            };
            const square = data.shape === "square";
            const group = svg("g", {
                class: `gv-node gv-shape-${square ? "square" : "circle"}${data.kind ? ` is-${data.kind}` : ""}`, tabindex: 0, role: "button", "data-key": data.key,
                "aria-label": data.kindLabel ? `${data.nom}, ${data.kindLabel}` : data.nom
            });
            const title = svg("title");
            title.textContent = data.title || data.nom;
            node.figure = square ? svg("rect", {}) : svg("circle", { cx: 0, cy: 0 });
            node.square = square;
            const label = svg("text", { x: 0, class: "gv-node-label", "text-anchor": "middle" });
            label.textContent = data.nom;
            node.label = label;
            group.append(title, node.figure, label);
            group.style.opacity = 0;
            group.addEventListener("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    this.onSelect?.(data.key);
                }
            });
            this.nodeLayer.appendChild(group);
            node.el = group;
            this.updateNodeShape(node);
            return node;
        }

        updateNodeShape(node) {
            const size = this.sizeOf(node);
            node.size = size;
            if (node.square) {
                node.figure.setAttribute("x", -size);
                node.figure.setAttribute("y", -size);
                node.figure.setAttribute("width", size * 2);
                node.figure.setAttribute("height", size * 2);
            } else {
                node.figure.setAttribute("r", size);
            }
            node.label.setAttribute("y", size + 14);
            node.el.classList.toggle("is-selected", node.key === this.selected);
            node.el.setAttribute("aria-pressed", node.key === this.selected ? "true" : "false");
            // Couleur de groupe (options) : variable CSS, la sélection garde son bleu marine.
            if (node.color) {
                node.el.style.setProperty("--gv-fill", node.color);
            } else {
                node.el.style.removeProperty("--gv-fill");
            }
        }

        updateEdgeStyle(edge) {
            edge.el.setAttribute("stroke", this.colorOf(edge.value));
            const marker = this.markers.get(edge.value);
            if (this.options.arrows && marker) {
                edge.el.setAttribute("marker-end", `url(#${marker})`);
            } else {
                edge.el.removeAttribute("marker-end");
            }
        }

        createEdge(data) {
            const line = svg("line", { class: "gv-edge" });
            const title = svg("title");
            title.textContent = data.tooltip || "";
            line.appendChild(title);
            line.style.opacity = 0;
            this.edgeLayer.appendChild(line);
            const edge = { ...data, el: line, badge: null };
            this.updateEdgeStyle(edge);
            if (data.touches && data.label) {
                edge.badge = this.createEdgeBadge(edge);
            }
            return edge;
        }

        // Badge au bord de la flèche (par exemple la valeur chiffrée) : seules les flèches du sujet en portent un (les autres ont une infobulle).
        createEdgeBadge(edge) {
            const group = svg("g", { class: "gv-badge" });
            group.append(
                svg("rect", { x: -10, y: -7, width: 20, height: 14, fill: "#fff", "stroke-width": 1 }),
                svg("text", { y: 4, "text-anchor": "middle", class: "gv-edge-label" })
            );
            group.style.opacity = 0;
            this.labelLayer.appendChild(group);
            edge.badge = group;
            this.updateEdgeBadge(edge);
            return group;
        }

        updateEdgeBadge(edge) {
            edge.badge.querySelector("text").textContent = edge.label || "";
            edge.badge.querySelector("rect").setAttribute("stroke", this.colorOf(edge.value));
        }

        // --- Degrés et mise en clair ------------------------------------------------------------------------------------------------

        // Degré de séparation de chaque nœud par rapport à `from` (0 = lui-même), jusqu'à la profondeur choisie ; les autres sont absents.
        degreesOf(from) {
            if (this.degreeCache.has(from)) {
                return this.degreeCache.get(from);
            }
            const degrees = new Map();
            if (this.adjacency.has(from)) {
                degrees.set(from, 0);
                let frontier = [from];
                for (let degree = 1; degree <= this.options.depth && frontier.length > 0; degree += 1) {
                    const next = [];
                    frontier.forEach((key) => this.adjacency.get(key).forEach((other) => {
                        if (!degrees.has(other)) {
                            degrees.set(other, degree);
                            next.push(other);
                        }
                    }));
                    frontier = next;
                }
            }
            this.degreeCache.set(from, degrees);
            return degrees;
        }

        // Sujet et 1er degré en pleine clarté, puis de plus en plus pâles jusqu'à la profondeur choisie (0,55 au 2e degré, 0,3 au dernier).
        opacityOf(degree) {
            const depth = this.options.depth;
            if (degree <= 1) {
                return 1;
            }
            if (degree > depth) {
                return FAR_OPACITY;
            }
            return depth === 2 ? 0.55 : 0.55 - ((degree - 2) / (depth - 2)) * 0.25;
        }

        // Opacité des nœuds et des flèches selon leur degré par rapport au nœud survolé, ou au sujet choisi.
        restyle() {
            const focus = this.hover || this.selected;
            const degrees = this.degreesOf(focus);
            const degreeOf = (key) => degrees.get(key) ?? Infinity;
            this.nodes.forEach((node) => {
                node.degree = degreeOf(node.key);
                node.el.style.opacity = this.opacityOf(node.degree);
                node.el.classList.toggle("is-near", node.degree <= 1);
            });
            this.edges.forEach((edge) => {
                const degree = Math.max(degreeOf(edge.from), degreeOf(edge.to));
                const own = edge.touches;
                const strong = edge.from === focus || edge.to === focus;
                edge.el.style.opacity = this.opacityOf(degree);
                edge.el.setAttribute("stroke-width", (strong ? (edge.from === focus ? 3 : 2) : 1.2) * this.options.linkWidth);
                if (edge.badge) {
                    edge.badge.style.opacity = own ? this.opacityOf(degree) : 0;
                    edge.badge.style.display = own ? "" : "none";
                }
            });
        }

        setHover(key) {
            if (key !== this.hover && !this.drag) {
                this.hover = key;
                this.restyle();
            }
        }

        // --- Simulation ------------------------------------------------------------------------------------------------------------

        step() {
            const alpha = this.alpha;
            const list = this.list;
            const { repulsion, linkStrength, linkDistance, gravity } = this.options;
            for (let first = 0; first < list.length; first += 1) {
                const a = list[first];
                for (let second = first + 1; second < list.length; second += 1) {
                    const b = list[second];
                    let dx = b.x - a.x;
                    let dy = b.y - a.y;
                    let squared = dx * dx + dy * dy;
                    if (squared > 160000) {
                        continue;
                    }
                    if (squared < 1) {
                        dx = seeded(a.key, 4) - 0.5;
                        dy = seeded(b.key, 5) - 0.5;
                        squared = 1;
                    }
                    const distance = Math.sqrt(squared);
                    const force = (repulsion / Math.max(squared, 400)) * alpha;
                    a.vx -= (dx / distance) * force;
                    a.vy -= (dy / distance) * force;
                    b.vx += (dx / distance) * force;
                    b.vy += (dy / distance) * force;
                }
            }
            const rest = this.radial ? linkDistance + 20 : linkDistance;
            this.links.forEach(([a, b]) => {
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const distance = Math.hypot(dx, dy) || 1;
                const force = (distance - rest) * linkStrength * alpha;
                a.vx += (dx / distance) * force;
                a.vy += (dy / distance) * force;
                b.vx -= (dx / distance) * force;
                b.vy -= (dy / distance) * force;
            });
            const layout = this.radial ? this.degreesOf(this.selected) : null;
            list.forEach((node) => {
                const ring = layout?.get(node.key);
                if (ring !== undefined) {
                    const distance = Math.hypot(node.x, node.y) || 1;
                    const pull = (this.ringRadius(ring) - distance) * RADIAL_STRENGTH * alpha;
                    node.vx += (node.x / distance) * pull;
                    node.vy += (node.y / distance) * pull;
                } else {
                    node.vx -= node.x * gravity * alpha;
                    node.vy -= node.y * gravity * alpha;
                }
                if (node.pinned) {
                    node.vx = 0;
                    node.vy = 0;
                } else {
                    node.vx *= DAMPING;
                    node.vy *= DAMPING;
                    node.x += node.vx;
                    node.y += node.vy;
                }
            });
            this.alpha *= ALPHA_DECAY;
        }

        // Vue qui cadre tous les nœuds : { k, x, y }.
        fitTarget() {
            if (this.list.length === 0) {
                return { k: 1, x: 0, y: 0 };
            }
            const xs = this.list.map((node) => node.x);
            const ys = this.list.map((node) => node.y);
            const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
            const { width, height } = this.size;
            const k = clamp(Math.min((width - FIT_MARGIN * 2) / Math.max(maxX - minX, 1), (height - FIT_MARGIN * 2) / Math.max(maxY - minY, 1)), 0.35, 1.3);
            return { k, x: -((minX + maxX) / 2) * k, y: -((minY + maxY) / 2) * k };
        }

        snapView() {
            this.view = this.fitTarget();
        }

        fit() {
            this.fitting = true;
            this.fitFrames = 0;
            if (reducedMotion()) {
                this.snapView();
                this.render();
            } else {
                this.start();
            }
        }

        start() {
            if (!this.raf && !this.destroyed) {
                this.raf = window.requestAnimationFrame(() => this.tick());
            }
        }

        tick() {
            this.raf = 0;
            if (this.destroyed) {
                return;
            }
            const simulating = this.alpha > ALPHA_MIN || Boolean(this.drag?.node);
            if (simulating) {
                this.step();
            }
            if (this.fitting) {
                const target = this.fitTarget();
                const ease = 0.14;
                this.view = { k: this.view.k + (target.k - this.view.k) * ease, x: this.view.x + (target.x - this.view.x) * ease, y: this.view.y + (target.y - this.view.y) * ease };
                this.fitFrames += 1;
                if (!simulating && this.fitFrames > 20 && Math.abs(target.k - this.view.k) < 0.002 && Math.abs(target.x - this.view.x) < 0.5 && Math.abs(target.y - this.view.y) < 0.5) {
                    this.fitting = false;
                }
            }
            this.render();
            if (simulating || this.fitting) {
                this.start();
            }
        }

        // --- Dessin ----------------------------------------------------------------------------------------------------------------

        render() {
            const { width, height } = this.size;
            const { k, x, y } = this.view;
            this.viewport.setAttribute("transform", `translate(${(width / 2 + x).toFixed(1)} ${(height / 2 + y).toFixed(1)}) scale(${k.toFixed(3)})`);
            // Les noms des nœuds éloignés ne s'affichent qu'à partir du zoom choisi dans les options (sinon ils se chevauchent).
            const labeled = k >= this.options.labelZoom;
            if (labeled !== this.labeled) {
                this.labeled = labeled;
                this.container.classList.toggle("is-labeled", labeled);
            }
            this.list.forEach((node) => node.el.setAttribute("transform", `translate(${node.x.toFixed(1)} ${node.y.toFixed(1)})`));
            this.edges.forEach((edge) => {
                const from = this.nodes.get(edge.from);
                const to = this.nodes.get(edge.to);
                if (!from || !to) {
                    return;
                }
                const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
                const ux = (to.x - from.x) / length;
                const uy = (to.y - from.y) / length;
                // Deux sens d'un même couple : deux flèches décalées de part et d'autre.
                const ox = -uy * edge.offset;
                const oy = ux * edge.offset;
                const startX = from.x + ux * (from.size + 2) + ox;
                const startY = from.y + uy * (from.size + 2) + oy;
                const endX = to.x - ux * (to.size + 4) + ox;
                const endY = to.y - uy * (to.size + 4) + oy;
                edge.el.setAttribute("x1", startX.toFixed(1));
                edge.el.setAttribute("y1", startY.toFixed(1));
                edge.el.setAttribute("x2", endX.toFixed(1));
                edge.el.setAttribute("y2", endY.toFixed(1));
                if (edge.badge) {
                    const ratio = edge.from === this.selected ? 0.62 : 0.38;
                    edge.badge.setAttribute("transform", `translate(${(startX + (endX - startX) * ratio).toFixed(1)} ${(startY + (endY - startY) * ratio).toFixed(1)})`);
                }
            });
        }

        // --- Souris et clavier -----------------------------------------------------------------------------------------------------

        toWorld(event) {
            const rect = this.svg.getBoundingClientRect();
            return {
                x: (event.clientX - rect.left - this.size.width / 2 - this.view.x) / this.view.k,
                y: (event.clientY - rect.top - this.size.height / 2 - this.view.y) / this.view.k
            };
        }

        bindEvents() {
            this.svg.addEventListener("wheel", (event) => {
                event.preventDefault();
                const rect = this.svg.getBoundingClientRect();
                const px = event.clientX - rect.left - this.size.width / 2;
                const py = event.clientY - rect.top - this.size.height / 2;
                const k = clamp(this.view.k * Math.exp(-event.deltaY * 0.0015), ZOOM_MIN, ZOOM_MAX);
                const wx = (px - this.view.x) / this.view.k;
                const wy = (py - this.view.y) / this.view.k;
                this.view = { k, x: px - wx * k, y: py - wy * k };
                this.fitting = false;
                this.render();
            }, { passive: false });

            this.svg.addEventListener("pointerdown", (event) => {
                if (event.button !== 0) {
                    return;
                }
                const key = event.target.closest?.(".gv-node")?.dataset.key;
                const node = key ? this.nodes.get(key) : null;
                this.drag = { node, startX: event.clientX, startY: event.clientY, moved: false, view: { ...this.view } };
                try {
                    this.svg.setPointerCapture(event.pointerId);
                } catch {
                    // Capture indisponible : le glisser fonctionne tant que le pointeur reste dans le graphe.
                }
            });
            this.svg.addEventListener("pointermove", (event) => {
                const drag = this.drag;
                if (!drag) {
                    return;
                }
                const dx = event.clientX - drag.startX;
                const dy = event.clientY - drag.startY;
                if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) {
                    return;
                }
                drag.moved = true;
                if (drag.node) {
                    const point = this.toWorld(event);
                    Object.assign(drag.node, { x: point.x, y: point.y, vx: 0, vy: 0, pinned: true });
                    this.alpha = Math.max(this.alpha, 0.3);
                } else {
                    this.view = { ...drag.view, x: drag.view.x + dx, y: drag.view.y + dy };
                    this.fitting = false;
                }
                this.svg.classList.add("is-dragging");
                this.start();
                this.render();
            });
            const release = () => {
                const drag = this.drag;
                this.drag = null;
                this.svg.classList.remove("is-dragging");
                if (drag?.node) {
                    drag.node.pinned = false;
                    if (!drag.moved) {
                        this.onSelect?.(drag.node.key);
                    }
                }
            };
            this.svg.addEventListener("pointerup", release);
            this.svg.addEventListener("pointercancel", release);
            this.svg.addEventListener("pointerover", (event) => this.setHover(event.target.closest?.(".gv-node")?.dataset.key || ""));
            this.svg.addEventListener("pointerleave", () => this.setHover(""));
            this.svg.addEventListener("dblclick", (event) => {
                if (!event.target.closest?.(".gv-node")) {
                    this.fit();
                }
            });
        }

        destroy() {
            this.destroyed = true;
            window.cancelAnimationFrame(this.raf);
            this.resizer?.disconnect();
        }
    }

    const api = {
        DEFAULT_OPTIONS,
        create: (container, options) => new GraphView(container, options)
    };

    window.Win95GraphView = api;
    window.Win95Services?.register?.("Win95GraphView", api);
})();
