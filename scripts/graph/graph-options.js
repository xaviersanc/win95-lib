(() => {
    // Options de la vue graphique (Win95GraphOptions), sur le modèle de la vue graphique d'Obsidian : un panneau gris flottant en haut à droite
    // du graphe (à poser dans le conteneur du graphe), en rubriques repliables.
    //  - Filtres : recherche par mots et cases à cocher propres au projet (types affichés, relations neutres…).
    //  - Groupes : une couleur par requête ; le premier groupe qui correspond colore le nœud (matchGroup).
    //  - Affichage : flèches, épaisseur des liens, taille des nœuds (fixe ou selon le nombre de relations), zoom d'apparition des noms.
    //  - Forces : répulsion, attraction et distance des liens, gravité vers le centre.
    //  - Graphe local : profondeur (degrés) du voisinage affiché et mis en clair.
    // Les réglages sont propres à chaque compte et gardés dans le navigateur (localStorage, clé `<storageKey>.<id du compte>`).
    //
    // create({
    //   onChange(options, kind),          kind = "data" (nœuds à recalculer), "groups" (couleurs des nœuds) ou "view" (dessin et forces seulement)
    //   storageKey,                       préfixe de la clé de stockage (défaut « win95.graph.options »)
    //   title,                            titre du panneau (défaut « Options du graphe »)
    //   search: { placeholder, ariaLabel }   champ de recherche par mots dans les Filtres (absent : pas de recherche)
    //   filters: [{ key, label, default }]   cases à cocher des Filtres ; leur valeur est dans options[key]
    //   groups: false | { placeholder, note, actions: [{ label, title, build({ colors, max }) -> [{ query, color? }] }] }
    //   local: false | { label, note }    rubrique « Graphe local » (curseur de profondeur)
    // }) -> { element, options, isOpen, toggle(open), createOpener(), matchSearch(texte), matchGroup(texte) }

    const GROUP_MAX = 12;
    // Couleurs de la palette Windows 95 (ni blanc, ni gris clair, ni bleu marine de la sélection) ; le nom accompagne toujours la couleur.
    // Rouges et verts en dernier : ce sont aussi les couleurs habituelles des relations hostiles et amicales.
    const COLORS = [
        ["#0000ff", "Bleu"], ["#ffff00", "Jaune"], ["#800080", "Violet"], ["#00ffff", "Cyan"], ["#ff00ff", "Magenta"], ["#808000", "Olive"],
        ["#008080", "Sarcelle"], ["#808080", "Gris"], ["#00ff00", "Vert clair"], ["#800000", "Bordeaux"], ["#ff0000", "Rouge"], ["#008000", "Vert"]
    ];
    const number = (digits, unit = "") => (value) => `${value.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}${unit}`;
    // Curseurs : clé, libellé, bornes, pas, affichage de la valeur.
    const SLIDERS = {
        linkWidth: { label: "Épaisseur des liens", min: 0.5, max: 3, step: 0.1, format: (value) => `×${number(1)(value)}` },
        nodeSize: { label: "Taille des nœuds", min: 0.5, max: 2, step: 0.1, format: (value) => `×${number(1)(value)}` },
        labelZoom: { label: "Noms visibles dès le zoom", min: 0.25, max: 3, step: 0.05, format: (value) => `×${number(2)(value)}` },
        repulsion: { label: "Répulsion", min: 500, max: 8000, step: 100, format: number(0) },
        linkStrength: { label: "Attraction des liens", min: 0.005, max: 0.1, step: 0.005, format: number(3) },
        linkDistance: { label: "Distance des liens", min: 30, max: 250, step: 5, format: number(0, " px") },
        gravity: { label: "Gravité (centre)", min: 0, max: 0.1, step: 0.005, format: number(3) },
        depth: { label: "Profondeur", min: 1, max: 5, step: 1, format: (value) => `${value} degré${value > 1 ? "s" : ""}` }
    };
    const simple = (text) => String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const words = (text) => simple(text).split(/\s+/).filter(Boolean);

    const element = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) {
            node.className = className;
        }
        if (text !== undefined) {
            node.textContent = text;
        }
        return node;
    };

    const button = (label, onClick, { className = "btn explorer-btn small-label", title } = {}) => {
        const node = element("button", className, label);
        node.type = "button";
        if (title) {
            node.title = title;
        }
        node.addEventListener("click", onClick);
        return node;
    };

    class GraphOptions {
        constructor({ onChange, storageKey = "win95.graph.options", title = "Options du graphe", search = null, filters = [], groups = {}, local = {} } = {}) {
            this.onChange = onChange;
            this.storageKey = storageKey;
            this.title = title;
            this.search = search;
            this.filters = filters;
            this.groupsConfig = groups === false ? null : groups;
            this.localConfig = local === false ? null : local;
            // Réglages qui changent les nœuds affichés (le reste ne touche qu'au dessin).
            this.dataKeys = ["search", ...filters.map((filter) => filter.key), "depth"];
            this.options = this.load();
            this.collapsed = new Set();
            this.element = element("div", "gv-options");
            this.element.hidden = true;
            this.element.setAttribute("role", "dialog");
            this.element.setAttribute("aria-label", title);
            this.element.addEventListener("keydown", (event) => {
                if (event.key === "Escape") {
                    event.stopPropagation();
                    this.toggle(false);
                    this.opener?.focus();
                }
            });
            this.render();
        }

        defaults() {
            return {
                search: "", groups: [],
                ...Object.fromEntries(this.filters.map((filter) => [filter.key, filter.default !== false])),
                ...window.Win95GraphView.DEFAULT_OPTIONS
            };
        }

        userKey() {
            return `${this.storageKey}.${window.Win95Utils?.getCurrentUserId?.() || "local"}`;
        }

        // Réglages enregistrés, remis dans leurs bornes ; un réglage illisible reprend sa valeur par défaut.
        load() {
            const base = this.defaults();
            let saved = {};
            try {
                saved = JSON.parse(localStorage.getItem(this.userKey()) || "{}") || {};
            } catch {
                saved = {};
            }
            Object.keys(base).forEach((key) => {
                const value = saved[key];
                if (SLIDERS[key] && typeof value === "number" && Number.isFinite(value)) {
                    base[key] = Math.min(SLIDERS[key].max, Math.max(SLIDERS[key].min, value));
                } else if (typeof base[key] === "boolean" && typeof value === "boolean") {
                    base[key] = value;
                } else if (key === "search" && typeof value === "string") {
                    base[key] = value;
                }
            });
            if (Array.isArray(saved.groups)) {
                base.groups = saved.groups
                    .filter((group) => group && typeof group.query === "string" && COLORS.some(([color]) => color === group.color))
                    .slice(0, GROUP_MAX)
                    .map(({ query, color }) => ({ query, color }));
            }
            return base;
        }

        save() {
            try {
                localStorage.setItem(this.userKey(), JSON.stringify(this.options));
            } catch {
                // Stockage indisponible (navigation privée) : les réglages valent pour cette session.
            }
        }

        isOpen() {
            return !this.element.hidden;
        }

        toggle(open = !this.isOpen()) {
            this.element.hidden = !open;
            this.opener?.classList.toggle("is-active", open);
            this.opener?.setAttribute("aria-pressed", open ? "true" : "false");
            if (open) {
                this.element.querySelector("input, button:not(.gv-options-close)")?.focus();
            }
        }

        // Bouton de la barre d'outils qui ouvre et ferme le panneau.
        createOpener() {
            this.opener = button(this.title, () => this.toggle(), { title: "Filtres, groupes de couleur, affichage et forces du graphe" });
            this.opener.classList.add("gv-options-toggle");
            this.opener.setAttribute("aria-pressed", "false");
            return this.opener;
        }

        set(patch) {
            const keys = Object.keys(patch);
            const kind = keys.some((key) => this.dataKeys.includes(key)) ? "data" : keys.includes("groups") ? "groups" : "view";
            this.options = { ...this.options, ...patch };
            this.save();
            this.onChange?.(this.options, kind);
        }

        // Vrai si tous les mots de la recherche (Filtres) se trouvent dans le texte du nœud ; une recherche vide laisse tout passer.
        matchSearch(text) {
            const haystack = simple(text);
            return words(this.options.search).every((word) => haystack.includes(word));
        }

        // Premier groupe dont tous les mots se trouvent dans le texte du nœud : { query, color } ou null.
        matchGroup(text) {
            const haystack = simple(text);
            return this.options.groups.find((group) => {
                const wanted = words(group.query);
                return wanted.length > 0 && wanted.every((word) => haystack.includes(word));
            }) || null;
        }

        // --- Panneau ----------------------------------------------------------------------------------------------------------

        render() {
            const head = element("div", "gv-options-head");
            head.append(element("span", "gv-options-title", this.title),
                button("×", () => {
                    this.toggle(false);
                    this.opener?.focus();
                }, { className: "btn explorer-btn gv-options-close", title: "Fermer les options (Échap)" }));
            head.lastChild.setAttribute("aria-label", "Fermer les options");
            const reset = button("Rétablir les réglages par défaut", () => {
                this.options = this.defaults();
                this.save();
                this.render();
                this.onChange?.(this.options, "data");
                this.element.querySelector(".gv-options-reset")?.focus();
            });
            reset.classList.add("gv-options-reset");
            const sections = [head];
            if (this.search || this.filters.length > 0) {
                sections.push(this.section("filtres", "Filtres", () => this.createFilters()));
            }
            if (this.groupsConfig) {
                sections.push(this.section("groupes", "Groupes", () => this.createGroups()));
            }
            sections.push(
                this.section("affichage", "Affichage", () => [
                    this.check("arrows", "Flèches de direction"),
                    this.slider("linkWidth"),
                    this.check("sizeByLinks", "Taille selon le nombre de relations"),
                    this.slider("nodeSize"),
                    this.slider("labelZoom")
                ]),
                this.section("forces", "Forces", () => ["repulsion", "linkStrength", "linkDistance", "gravity"].map((key) => this.slider(key)))
            );
            if (this.localConfig) {
                sections.push(this.section("local", this.localConfig.label || "Graphe local", () => [
                    this.slider("depth"),
                    element("div", "gv-note", this.localConfig.note || "Degrés affichés autour du sujet et voisinage mis en clair au survol.")
                ]));
            }
            sections.push(reset);
            this.element.replaceChildren(...sections);
        }

        // Rubrique repliable : cadre de groupe dont la légende est un bouton.
        section(key, label, build) {
            const fieldset = element("fieldset", "gv-section");
            fieldset.dataset.section = key;
            const legend = element("legend");
            const open = !this.collapsed.has(key);
            const fold = button(`${open ? "−" : "+"} ${label}`, () => {
                if (this.collapsed.has(key)) {
                    this.collapsed.delete(key);
                } else {
                    this.collapsed.add(key);
                }
                const next = this.section(key, label, build);
                fieldset.replaceWith(next);
                next.querySelector(".gv-options-fold").focus();
            }, { className: "gv-options-fold" });
            fold.setAttribute("aria-expanded", open ? "true" : "false");
            legend.appendChild(fold);
            fieldset.appendChild(legend);
            if (open) {
                fieldset.append(...build());
            }
            return fieldset;
        }

        check(key, label) {
            const wrapper = element("label", "gv-check");
            const input = element("input");
            input.type = "checkbox";
            input.checked = Boolean(this.options[key]);
            input.addEventListener("change", () => this.set({ [key]: input.checked }));
            wrapper.append(input, document.createTextNode(` ${label}`));
            return wrapper;
        }

        slider(key) {
            const def = SLIDERS[key];
            const row = element("label", "gv-option-row");
            const value = element("span", "gv-option-value", def.format(this.options[key]));
            const input = element("input", "gv-range");
            Object.assign(input, { type: "range", min: def.min, max: def.max, step: def.step });
            input.value = this.options[key];
            input.addEventListener("input", () => {
                const next = Number(input.value);
                value.textContent = def.format(next);
                this.set({ [key]: next });
            });
            row.append(element("span", "gv-option-label", def.label), value, input);
            return row;
        }

        createFilters() {
            const controls = [];
            if (this.search) {
                const search = element("input", "form-95 gv-options-search");
                Object.assign(search, { type: "search", value: this.options.search, placeholder: this.search.placeholder || "Rechercher…" });
                search.setAttribute("aria-label", this.search.ariaLabel || "Mots à rechercher");
                search.addEventListener("input", () => this.set({ search: search.value }));
                controls.push(search);
            }
            this.filters.forEach((filter) => controls.push(this.check(filter.key, filter.label)));
            return controls;
        }

        createGroups() {
            const config = this.groupsConfig;
            const list = element("div", "gv-groups");
            const redraw = () => {
                const next = this.section("groupes", "Groupes", () => this.createGroups());
                this.element.querySelector('[data-section="groupes"]').replaceWith(next);
                return next;
            };
            this.options.groups.forEach((group, index) => {
                const row = element("div", "gv-group");
                const swatch = element("span", "gv-swatch");
                swatch.style.background = group.color;
                const color = element("select", "form-95 gv-select gv-group-color");
                color.setAttribute("aria-label", `Couleur du groupe ${index + 1}`);
                COLORS.forEach(([value, name]) => color.appendChild(Object.assign(element("option", "", name), { value })));
                color.value = group.color;
                color.addEventListener("change", () => {
                    swatch.style.background = color.value;
                    this.set({ groups: this.options.groups.map((item, position) => (position === index ? { ...item, color: color.value } : item)) });
                });
                const query = element("input", "form-95 gv-group-query");
                Object.assign(query, { type: "text", value: group.query, placeholder: config.placeholder || "Mots du groupe…" });
                query.setAttribute("aria-label", `Requête du groupe ${index + 1}`);
                query.addEventListener("input", () => this.set({ groups: this.options.groups.map((item, position) => (position === index ? { ...item, query: query.value } : item)) }));
                const remove = button("×", () => {
                    this.set({ groups: this.options.groups.filter((_, position) => position !== index) });
                    redraw().querySelector(".gv-group-query, .gv-options-fold")?.focus();
                }, { className: "btn explorer-btn gv-group-remove is-danger", title: "Supprimer ce groupe" });
                remove.setAttribute("aria-label", `Supprimer le groupe ${index + 1}`);
                row.append(swatch, color, query, remove);
                list.appendChild(row);
            });
            if (this.options.groups.length === 0) {
                list.appendChild(element("div", "gv-empty", "Aucun groupe : les nœuds gardent leur couleur."));
            }
            const actions = element("div", "gv-group-actions");
            const used = () => new Set(this.options.groups.map((group) => group.color));
            const add = button("Nouveau groupe", () => {
                const color = (COLORS.find(([value]) => !used().has(value)) || COLORS[0])[0];
                this.set({ groups: [...this.options.groups, { query: "", color }] });
                const queries = redraw().querySelectorAll(".gv-group-query");
                queries[queries.length - 1]?.focus();
            });
            add.disabled = this.options.groups.length >= GROUP_MAX;
            actions.appendChild(add);
            // Actions du projet : remplacent les groupes par une série calculée (ex. une couleur par famille d'entités).
            (config.actions || []).forEach((action) => {
                actions.appendChild(button(action.label, () => {
                    const colors = COLORS.map(([value]) => value);
                    const built = (action.build({ colors, max: GROUP_MAX }) || []).slice(0, GROUP_MAX);
                    this.set({ groups: built.map(({ query, color }, index) => ({ query, color: colors.includes(color) ? color : colors[index % colors.length] })) });
                    redraw().querySelector(".gv-options-fold").focus();
                }, { title: action.title }));
            });
            return [
                list, actions,
                element("div", "gv-note", config.note || "Le premier groupe dont tous les mots figurent dans le texte d'un nœud lui donne sa couleur.")
            ];
        }
    }

    const api = {
        COLORS,
        create: (options) => new GraphOptions(options)
    };

    window.Win95GraphOptions = api;
    window.Win95Services?.register?.("Win95GraphOptions", api);
})();
