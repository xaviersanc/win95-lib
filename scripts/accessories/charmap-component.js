(() => {
    // Table des caractères (Win95CharMap) : grille de caractères Unicode par bloc ; un clic sélectionne et agrandit,
    // un double-clic (ou « Sélectionner ») ajoute le caractère à la zone « Caractères à copier » ; « Copier » les place dans le
    // presse-papiers. La barre d'état donne le code (U+00E9) et le nom du bloc.

    const BLOCKS = [
        { key: "latin", label: "Latin de base et supplément", ranges: [[0x20, 0x7e], [0xa0, 0xff]] },
        { key: "latin-ext", label: "Latin étendu", ranges: [[0x100, 0x17f]] },
        { key: "greek", label: "Grec", ranges: [[0x391, 0x3c9]] },
        { key: "cyrillic", label: "Cyrillique", ranges: [[0x410, 0x44f]] },
        { key: "punctuation", label: "Ponctuation et symboles monétaires", ranges: [[0x2010, 0x2027], [0x2030, 0x203a], [0x20a0, 0x20bf]] },
        { key: "arrows", label: "Flèches", ranges: [[0x2190, 0x21ff]] },
        { key: "math", label: "Opérateurs mathématiques", ranges: [[0x2200, 0x22ff]] },
        { key: "boxes", label: "Formes et pavés", ranges: [[0x2500, 0x259f], [0x25a0, 0x25ff]] },
        { key: "symbols", label: "Symboles divers", ranges: [[0x2600, 0x26ff]] }
    ];
    const FONTS = [
        { value: "Arial, sans-serif", label: "Arial" },
        { value: "\"Courier New\", monospace", label: "Courier New" },
        { value: "\"Times New Roman\", serif", label: "Times New Roman" },
        { value: "\"MS Sans Serif\", Tahoma, sans-serif", label: "MS Sans Serif" }
    ];
    const COLUMNS = 20;

    function codePoints(block) {
        const list = [];
        block.ranges.forEach(([start, end]) => {
            for (let code = start; code <= end; code += 1) {
                list.push(code);
            }
        });
        return list;
    }

    class Win95CharMap {
        constructor(rootElement) {
            this.rootElement = rootElement;
            this.bodyElement = rootElement.querySelector("[data-app-body]");
            if (!this.bodyElement) {
                return;
            }
            this.block = BLOCKS[0];
            this.font = FONTS[0].value;
            this.selected = null;

            window.Win95MenuBar.mount(this.bodyElement, [{
                label: "?",
                items: [{ label: "À propos de la Table des caractères", onSelect: () => void window.Win95Dialog.alert({ title: "À propos de la Table des caractères", message: "Table des caractères Windows 95 (simulation). Double-cliquez sur un caractère pour l'ajouter à la zone de copie." }) }]
            }]);

            const body = document.createElement("div");
            body.className = "charmap";
            body.innerHTML = `
                <div class="charmap-top">
                    <label for="charmap-font">Police :</label>
                    <select id="charmap-font" class="form-95"></select>
                    <label for="charmap-block">Bloc :</label>
                    <select id="charmap-block" class="form-95"></select>
                </div>
                <div class="charmap-grid" role="grid" aria-label="Caractères"></div>
                <div class="charmap-copy">
                    <label for="charmap-text">Caractères à copier :</label>
                    <input id="charmap-text" class="form-95" type="text" autocomplete="off">
                    <button type="button" class="btn start-btn" data-charmap-select>Sélectionner</button>
                    <button type="button" class="btn start-btn" data-charmap-copy>Copier</button>
                </div>
                <div class="charmap-status" role="status">Sélectionnez un caractère.</div>
                <div class="charmap-zoom" aria-hidden="true" hidden></div>`;
            this.bodyElement.appendChild(body);
            this.gridElement = body.querySelector(".charmap-grid");
            this.textInput = body.querySelector("#charmap-text");
            this.statusElement = body.querySelector(".charmap-status");
            this.zoomElement = body.querySelector(".charmap-zoom");
            this.fontSelect = body.querySelector("#charmap-font");
            this.blockSelect = body.querySelector("#charmap-block");
            FONTS.forEach((font) => this.fontSelect.add(new Option(font.label, font.value)));
            BLOCKS.forEach((block) => this.blockSelect.add(new Option(block.label, block.key)));
            this.fontSelect.addEventListener("change", () => {
                this.font = this.fontSelect.value;
                this.renderGrid();
            });
            this.blockSelect.addEventListener("change", () => {
                this.block = BLOCKS.find((candidate) => candidate.key === this.blockSelect.value);
                this.selected = null;
                this.renderGrid();
            });
            body.querySelector("[data-charmap-select]").addEventListener("click", () => this.addSelected());
            body.querySelector("[data-charmap-copy]").addEventListener("click", () => void this.copy());
            rootElement.__win95CharMapInstance = this;
            this.renderGrid();
        }

        renderGrid() {
            this.gridElement.textContent = "";
            this.gridElement.style.gridTemplateColumns = `repeat(${COLUMNS}, 1fr)`;
            codePoints(this.block).forEach((code) => {
                const cell = document.createElement("button");
                cell.type = "button";
                cell.className = "charmap-cell";
                cell.style.fontFamily = this.font;
                cell.textContent = String.fromCodePoint(code);
                cell.title = `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
                cell.setAttribute("role", "gridcell");
                cell.dataset.code = String(code);
                cell.classList.toggle("selected", this.selected === code);
                cell.addEventListener("click", () => this.select(code));
                cell.addEventListener("dblclick", () => {
                    this.select(code);
                    this.addSelected();
                });
                this.gridElement.appendChild(cell);
            });
            this.zoomElement.hidden = true;
        }

        select(code) {
            this.selected = code;
            this.gridElement.querySelectorAll(".charmap-cell").forEach((cell) => cell.classList.toggle("selected", Number(cell.dataset.code) === code));
            const hex = code.toString(16).toUpperCase().padStart(4, "0");
            this.statusElement.textContent = `Touche : U+${hex}  (${code})`;
            this.zoomElement.hidden = false;
            this.zoomElement.style.fontFamily = this.font;
            this.zoomElement.textContent = String.fromCodePoint(code);
        }

        addSelected() {
            if (this.selected === null) {
                return;
            }
            this.textInput.value += String.fromCodePoint(this.selected);
            this.statusElement.textContent = "Caractère ajouté à la zone de copie.";
        }

        async copy() {
            const text = this.textInput.value;
            if (!text) {
                this.statusElement.textContent = "Rien à copier : ajoutez d'abord des caractères.";
                return;
            }
            try {
                await navigator.clipboard.writeText(text);
                this.statusElement.textContent = "Caractères copiés dans le presse-papiers.";
            } catch {
                this.textInput.select();
                this.statusElement.textContent = "Copie automatique refusée : le texte est sélectionné, faites Ctrl+C.";
            }
        }
    }

    const api = {
        attach(rootElement) {
            return rootElement?.__win95CharMapInstance || new Win95CharMap(rootElement);
        }
    };

    window.Win95CharMap = api;
    window.Win95Services?.register?.("Win95CharMap", api);
})();
