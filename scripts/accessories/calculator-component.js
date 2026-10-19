(() => {
    // Calculatrice (Win95Calculator) : standard et scientifique, mémoire, clavier.
    //  - Engine : le moteur de calcul, sans interface (testable) ; il fonctionne « à la Windows » : opérations exécutées dans
    //    l'ordre de saisie (2 + 3 × 4 = 20), `=` répété rejoue la dernière opération, `%` calcule un pourcentage de l'accumulateur ;
    //  - l'affichage emploie la virgule décimale française et au plus 12 chiffres significatifs ;
    //  - Affichage > Scientifique : fonctions trigonométriques (degrés ou radians), logarithmes, puissances, factorielle, π ;
    //    la case « Inv » donne les fonctions inverses (arcsin, e^x, 10^x, racine…).

    const MAX_DIGITS = 12;
    const BINARY = {
        "+": (a, b) => a + b,
        "-": (a, b) => a - b,
        "*": (a, b) => a * b,
        "/": (a, b) => (b === 0 ? NaN : a / b),
        "pow": (a, b) => Math.pow(a, b)
    };
    const BINARY_SYMBOL = { "+": "+", "-": "−", "*": "×", "/": "÷", "pow": "^" };

    function factorial(value) {
        if (!Number.isInteger(value) || value < 0 || value > 170) {
            return NaN;
        }
        let result = 1;
        for (let factor = 2; factor <= value; factor += 1) {
            result *= factor;
        }
        return result;
    }

    // Chiffres significatifs limités, sans zéros inutiles ; notation scientifique pour les très grands / petits nombres.
    function formatNumber(value) {
        if (Number.isNaN(value) || !Number.isFinite(value)) {
            return null;
        }
        if (value === 0) {
            return "0";
        }
        let text = Number(value.toPrecision(MAX_DIGITS)).toString();
        if (/e/i.test(text)) {
            const [mantissa, exponent] = Number(value.toPrecision(MAX_DIGITS)).toExponential().split("e");
            text = `${mantissa}e${exponent}`;
        }
        return text;
    }

    class Engine {
        constructor() {
            this.memory = 0;
            this.angleUnit = "deg";
            this.inverse = false;
            this.reset();
        }

        reset() {
            this.entry = "0";
            this.fresh = true;       // la prochaine saisie remplace l'affichage
            this.accumulator = null;
            this.operator = null;
            this.repeat = null;      // { operator, operand } pour « = » répété
            this.error = null;
        }

        // Valeur affichée (texte avec virgule).
        getDisplay() {
            return this.error || this.entry.replace(".", ",");
        }

        get value() {
            return Number(this.entry);
        }

        setValue(value) {
            const text = formatNumber(value);
            if (text === null) {
                this.error = Number.isNaN(value) ? "Valeur incorrecte" : "Dépassement";
                return false;
            }
            this.entry = text;
            this.fresh = true;
            return true;
        }

        guard() {
            return !this.error;
        }

        digit(character) {
            if (!this.guard()) {
                return;
            }
            if (this.fresh) {
                this.entry = character;
                this.fresh = false;
            } else if (this.entry.replace(/[-.]/g, "").length < MAX_DIGITS) {
                this.entry = this.entry === "0" ? character : this.entry + character;
            }
        }

        decimal() {
            if (!this.guard()) {
                return;
            }
            if (this.fresh) {
                this.entry = "0.";
                this.fresh = false;
            } else if (!this.entry.includes(".") && !/e/i.test(this.entry)) {
                this.entry += ".";
            }
        }

        backspace() {
            if (!this.guard() || this.fresh) {
                return;
            }
            this.entry = this.entry.length > 1 && !(this.entry.length === 2 && this.entry.startsWith("-")) ? this.entry.slice(0, -1) : "0";
        }

        clearEntry() {
            if (this.error) {
                this.reset();
                return;
            }
            this.entry = "0";
            this.fresh = true;
        }

        clear() {
            this.reset();
        }

        negate() {
            if (!this.guard() || this.value === 0) {
                return;
            }
            this.entry = this.entry.startsWith("-") ? this.entry.slice(1) : `-${this.entry}`;
        }

        // Division par zéro : message dédié (et non « valeur incorrecte »).
        divisionByZero(operator, operand) {
            if (operator === "/" && operand === 0) {
                this.error = "Division par zéro impossible";
                return true;
            }
            return false;
        }

        // Exécute l'opération en attente avec la valeur affichée.
        commit() {
            if (this.operator && !this.fresh) {
                if (this.divisionByZero(this.operator, this.value)) {
                    return false;
                }
                const result = BINARY[this.operator](this.accumulator, this.value);
                this.repeat = { operator: this.operator, operand: this.value };
                if (!this.setValue(result)) {
                    return false;
                }
            }
            return true;
        }

        operate(operator) {
            if (!this.guard()) {
                return;
            }
            if (this.operator && this.fresh) {
                this.operator = operator;   // changement d'opérateur sans nouvelle saisie
                return;
            }
            if (!this.commit()) {
                return;
            }
            this.accumulator = this.value;
            this.operator = operator;
            this.fresh = true;
            this.repeat = null;
        }

        equals() {
            if (!this.guard()) {
                return;
            }
            if (this.operator) {
                const operand = this.fresh && this.repeat ? this.repeat.operand : this.value;
                if (this.divisionByZero(this.operator, operand)) {
                    return;
                }
                const result = BINARY[this.operator](this.accumulator, operand);
                this.repeat = { operator: this.operator, operand };
                this.operator = null;
                this.accumulator = null;
                this.setValue(result);
            } else if (this.repeat) {
                this.setValue(BINARY[this.repeat.operator](this.value, this.repeat.operand));
            }
            this.fresh = true;
        }

        // Pourcentage : « 200 + 10 % » donne 20 (10 % de l'accumulateur) ; sans opération, 0.
        percent() {
            if (!this.guard()) {
                return;
            }
            this.setValue(this.operator ? (this.accumulator * this.value) / 100 : 0);
        }

        unary(name) {
            if (!this.guard()) {
                return;
            }
            const x = this.value;
            const toRadians = (angle) => (this.angleUnit === "deg" ? (angle * Math.PI) / 180 : angle);
            const fromRadians = (angle) => (this.angleUnit === "deg" ? (angle * 180) / Math.PI : angle);
            const inv = this.inverse;
            const table = {
                sqrt: () => (x < 0 ? NaN : Math.sqrt(x)),
                reciprocal: () => (x === 0 ? Infinity : 1 / x),
                square: () => (inv ? (x < 0 ? NaN : Math.sqrt(x)) : x * x),
                cube: () => (inv ? Math.cbrt(x) : x * x * x),
                factorial: () => factorial(x),
                int: () => Math.trunc(x),
                sin: () => (inv ? fromRadians(Math.asin(x)) : Math.sin(toRadians(x))),
                cos: () => (inv ? fromRadians(Math.acos(x)) : Math.cos(toRadians(x))),
                tan: () => (inv ? fromRadians(Math.atan(x)) : Math.tan(toRadians(x))),
                ln: () => (inv ? Math.exp(x) : (x <= 0 ? NaN : Math.log(x))),
                log: () => (inv ? Math.pow(10, x) : (x <= 0 ? NaN : Math.log10(x)))
            };
            if (!table[name]) {
                return;
            }
            let result = table[name]();
            // Nettoie le bruit des flottants (sin 180° = 1,2e-16 → 0).
            if (Math.abs(result) < 1e-14 && result !== 0) {
                result = 0;
            }
            if (name === "reciprocal" && !Number.isFinite(result)) {
                this.error = "Division par zéro impossible";
                return;
            }
            this.setValue(result);
            this.inverse = false;
        }

        pi() {
            if (this.guard()) {
                this.setValue(Math.PI);
            }
        }

        // Mémoire : MC, MR, MS, M+.
        memoryClear() {
            this.memory = 0;
        }

        memoryRecall() {
            if (this.guard()) {
                this.setValue(this.memory);
            }
        }

        memoryStore() {
            if (this.guard()) {
                this.memory = this.value;
                this.fresh = true;
            }
        }

        memoryAdd() {
            if (this.guard()) {
                this.memory += this.value;
                this.fresh = true;
            }
        }

        hasMemory() {
            return this.memory !== 0;
        }

        // Texte de l'opération en attente (indicateur sous l'affichage).
        getPending() {
            return this.operator ? `${formatNumber(this.accumulator)?.replace(".", ",")} ${BINARY_SYMBOL[this.operator]}` : "";
        }
    }

    class Win95Calculator {
        constructor(rootElement) {
            this.rootElement = rootElement;
            this.bodyElement = rootElement.querySelector("[data-app-body]");
            if (!this.bodyElement) {
                return;
            }
            this.engine = new Engine();
            this.scientific = false;
            window.Win95MenuBar.mount(this.bodyElement, [
                {
                    label: "Édition",
                    items: () => [
                        { label: "Copier", hint: "Ctrl+C", onSelect: () => this.copy() },
                        { label: "Coller", hint: "Ctrl+V", onSelect: () => void this.paste() }
                    ]
                },
                {
                    label: "Affichage",
                    items: () => [
                        { label: "Standard", checked: !this.scientific, onSelect: () => this.setScientific(false) },
                        { label: "Scientifique", checked: this.scientific, onSelect: () => this.setScientific(true) }
                    ]
                },
                {
                    label: "?",
                    items: [{
                        label: "À propos de la Calculatrice",
                        onSelect: () => void window.Win95Dialog.alert({ title: "À propos de la Calculatrice", message: "Calculatrice Windows 95 (simulation).\nLes opérations sont exécutées dans l'ordre de saisie." })
                    }]
                }
            ]);
            this.contentElement = document.createElement("div");
            this.contentElement.className = "calc";
            this.bodyElement.appendChild(this.contentElement);
            this.boundKeydown = (event) => this.handleKey(event);
            rootElement.addEventListener("keydown", this.boundKeydown);
            rootElement.tabIndex = -1;
            rootElement.__win95CalculatorInstance = this;
            this.render();
        }

        setScientific(value) {
            this.scientific = value;
            this.render();
        }

        // Boutons : { label, action, kind } ; kind = number | operator | memory | clear | function.
        buildStandardRows() {
            const e = this.engine;
            const button = (label, kind, action) => ({ label, kind, action });
            return [
                [button("MC", "memory", () => e.memoryClear()), button("7", "number", () => e.digit("7")), button("8", "number", () => e.digit("8")), button("9", "number", () => e.digit("9")), button("÷", "operator", () => e.operate("/")), button("√", "function", () => e.unary("sqrt"))],
                [button("MR", "memory", () => e.memoryRecall()), button("4", "number", () => e.digit("4")), button("5", "number", () => e.digit("5")), button("6", "number", () => e.digit("6")), button("×", "operator", () => e.operate("*")), button("%", "function", () => e.percent())],
                [button("MS", "memory", () => e.memoryStore()), button("1", "number", () => e.digit("1")), button("2", "number", () => e.digit("2")), button("3", "number", () => e.digit("3")), button("−", "operator", () => e.operate("-")), button("1/x", "function", () => e.unary("reciprocal"))],
                [button("M+", "memory", () => e.memoryAdd()), button("0", "number", () => e.digit("0")), button("+/−", "number", () => e.negate()), button(",", "number", () => e.decimal()), button("+", "operator", () => e.operate("+")), button("=", "operator", () => e.equals())]
            ];
        }

        buildScientificRows() {
            const e = this.engine;
            const button = (label, kind, action, id) => ({ label, kind, action, id });
            return [
                [button("sin", "function", () => e.unary("sin")), button("x²", "function", () => e.unary("square")), button("n!", "function", () => e.unary("factorial"))],
                [button("cos", "function", () => e.unary("cos")), button("x³", "function", () => e.unary("cube")), button("π", "function", () => e.pi())],
                [button("tan", "function", () => e.unary("tan")), button("xʸ", "function", () => e.operate("pow")), button("Int", "function", () => e.unary("int"))],
                [button("ln", "function", () => e.unary("ln")), button("log", "function", () => e.unary("log")), button("1/x", "function", () => e.unary("reciprocal"))]
            ];
        }

        render() {
            const e = this.engine;
            const root = this.contentElement;
            root.textContent = "";
            root.classList.toggle("is-scientific", this.scientific);

            const display = document.createElement("div");
            display.className = "calc-display";
            display.setAttribute("role", "status");
            display.setAttribute("aria-label", "Résultat");
            this.displayElement = display;
            const pending = document.createElement("div");
            pending.className = "calc-pending";
            this.pendingElement = pending;
            root.append(display, pending);

            const top = document.createElement("div");
            top.className = "calc-top";
            const memory = document.createElement("span");
            memory.className = "calc-memory-flag";
            memory.textContent = "M";
            this.memoryElement = memory;
            top.appendChild(memory);
            [["Retour arrière", "←", () => e.backspace()], ["CE", "CE", () => e.clearEntry()], ["C", "C", () => e.clear()]].forEach(([title, label, action]) => {
                top.appendChild(this.createButton({ label, kind: "clear", action }, title));
            });
            root.appendChild(top);

            const keys = document.createElement("div");
            keys.className = "calc-keys";
            if (this.scientific) {
                const sci = document.createElement("div");
                sci.className = "calc-sci";
                const toggles = document.createElement("div");
                toggles.className = "calc-sci-toggles";
                const inv = document.createElement("label");
                inv.className = "property-check";
                const invBox = document.createElement("input");
                invBox.type = "checkbox";
                invBox.checked = e.inverse;
                invBox.addEventListener("change", () => {
                    e.inverse = invBox.checked;
                });
                inv.append(invBox, document.createTextNode("Inv"));
                const angle = document.createElement("button");
                angle.type = "button";
                angle.className = "btn calc-btn calc-angle";
                angle.textContent = e.angleUnit === "deg" ? "Deg" : "Rad";
                angle.title = "Unité d'angle : degrés ou radians";
                angle.addEventListener("click", () => {
                    e.angleUnit = e.angleUnit === "deg" ? "rad" : "deg";
                    angle.textContent = e.angleUnit === "deg" ? "Deg" : "Rad";
                });
                toggles.append(inv, angle);
                sci.appendChild(toggles);
                this.buildScientificRows().forEach((row) => {
                    const line = document.createElement("div");
                    line.className = "calc-row calc-row-sci";
                    row.forEach((definition) => line.appendChild(this.createButton(definition)));
                    sci.appendChild(line);
                });
                keys.appendChild(sci);
            }
            const standard = document.createElement("div");
            standard.className = "calc-standard";
            this.buildStandardRows().forEach((row) => {
                const line = document.createElement("div");
                line.className = "calc-row";
                row.forEach((definition) => line.appendChild(this.createButton(definition)));
                standard.appendChild(line);
            });
            keys.appendChild(standard);
            root.appendChild(keys);
            this.refresh();
            window.Win95Utils.fitWindow(this.rootElement, root, { extraHeight: this.bodyElement.querySelector(".win95-menubar").offsetHeight + 1 });
        }

        createButton(definition, title) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = `btn calc-btn calc-${definition.kind}`;
            button.textContent = definition.label;
            if (title) {
                button.title = title;
                button.setAttribute("aria-label", title);
            }
            button.addEventListener("click", () => {
                definition.action();
                this.refresh();
            });
            return button;
        }

        refresh() {
            this.displayElement.textContent = this.engine.getDisplay();
            this.pendingElement.textContent = this.engine.getPending();
            this.memoryElement.style.visibility = this.engine.hasMemory() ? "visible" : "hidden";
        }

        handleKey(event) {
            if (event.ctrlKey || event.altKey || event.metaKey) {
                if (event.ctrlKey && event.key.toLowerCase() === "c") {
                    this.copy();
                } else if (event.ctrlKey && event.key.toLowerCase() === "v") {
                    void this.paste();
                }
                return;
            }
            const e = this.engine;
            const { key } = event;
            let handled = true;
            if (/^[0-9]$/.test(key)) {
                e.digit(key);
            } else if (key === "," || key === ".") {
                e.decimal();
            } else if (["+", "-", "*", "/"].includes(key)) {
                e.operate(key);
            } else if (key === "Enter" || key === "=") {
                e.equals();
            } else if (key === "Backspace") {
                e.backspace();
            } else if (key === "Delete") {
                e.clearEntry();
            } else if (key === "Escape") {
                e.clear();
            } else if (key === "%") {
                e.percent();
            } else {
                handled = false;
            }
            if (handled) {
                event.preventDefault();
                this.refresh();
            }
        }

        copy() {
            const text = this.engine.getDisplay();
            void navigator.clipboard?.writeText(text).catch(() => {});
        }

        async paste() {
            try {
                const text = (await navigator.clipboard.readText()).trim().replace(",", ".");
                if (/^-?\d+(\.\d+)?$/.test(text)) {
                    this.engine.entry = String(Number(text));
                    this.engine.fresh = true;
                    this.engine.error = null;
                    this.refresh();
                }
            } catch {
                // Presse-papiers indisponible ou refusé : rien à coller.
            }
        }
    }

    const api = {
        Engine,
        attach(rootElement) {
            return rootElement?.__win95CalculatorInstance || new Win95Calculator(rootElement);
        }
    };

    window.Win95Calculator = api;
    window.Win95Services?.register?.("Win95Calculator", api);
})();
