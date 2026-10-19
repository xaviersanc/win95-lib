(() => {
    // Propriétés de Souris (Win95MouseProperties) : vitesse du double-clic (avec zone de test) et forme du pointeur.
    // Les réglages sont enregistrés dans Win95Mouse par OK ou Appliquer.

    const mouse = () => window.Win95Mouse;
    const sheets = () => window.Win95PropertySheet;

    class Win95MouseProperties {
        constructor(rootElement) {
            this.rootElement = rootElement;
            this.bodyElement = rootElement.querySelector("[data-applet]");
            if (!this.bodyElement) {
                return;
            }

            const state = mouse().getState();
            this.pending = { ...state };
            this.sheet = sheets().mount(this.bodyElement, {
                tabs: [
                    { key: "buttons", label: "Boutons", render: (panel) => this.renderButtonsTab(panel) },
                    { key: "pointers", label: "Pointeurs", render: (panel) => this.renderPointersTab(panel) }
                ],
                onApply: () => {
                    const result = mouse().save(this.pending);
                    return result;
                },
                onClose: () => window.Win95WindowManager?.closeWindow(rootElement)
            });
            rootElement.__win95MouseInstance = this;
        }

        // Curseur du curseur : 0 (lent) à 100 (rapide) <-> délai maximal entre deux clics.
        msToSlider(ms) {
            const { MIN_DOUBLE_CLICK_MS: min, MAX_DOUBLE_CLICK_MS: max } = mouse();
            return Math.round(((max - ms) / (max - min)) * 100);
        }

        sliderToMs(value) {
            const { MIN_DOUBLE_CLICK_MS: min, MAX_DOUBLE_CLICK_MS: max } = mouse();
            return Math.round(max - (value / 100) * (max - min));
        }

        renderButtonsTab(panel) {
            const header = document.createElement("div");
            header.className = "mouse-header";
            header.innerHTML = `<img alt="" src="${window.Win95Asset("assets/icons/mouse-0.png")}"><p>Réglez la vitesse du double-clic, puis essayez dans la zone de test.</p>`;

            const group = sheets().createGroup("Vitesse du double-clic");
            const speedRow = document.createElement("div");
            speedRow.className = "mouse-speed-row";
            const slow = document.createElement("span");
            slow.textContent = "Lent";
            const slider = document.createElement("input");
            slider.type = "range";
            slider.min = "0";
            slider.max = "100";
            slider.value = String(this.msToSlider(this.pending.doubleClickMs));
            slider.className = "mouse-slider";
            slider.setAttribute("aria-label", "Vitesse du double-clic");
            const fast = document.createElement("span");
            fast.textContent = "Rapide";
            speedRow.append(slow, slider, fast);

            // Zone de test : double-clic détecté ici avec la vitesse en cours de réglage (avant Appliquer).
            const testRow = document.createElement("div");
            testRow.className = "mouse-test-row";
            const testLabel = document.createElement("span");
            testLabel.textContent = "Zone de test :";
            const testBox = document.createElement("button");
            testBox.type = "button";
            testBox.className = "mouse-test-box";
            testBox.setAttribute("aria-label", "Zone de test du double-clic : double-cliquez ici");
            testBox.innerHTML = `<img alt="" src="${window.Win95Asset("assets/icons/mouse-0.png")}">`;
            let last = 0;
            let open = false;
            testBox.addEventListener("click", () => {
                const now = performance.now();
                if (now - last <= this.pending.doubleClickMs) {
                    open = !open;
                    testBox.classList.toggle("is-open", open);
                    testResult.textContent = open ? "Double-clic détecté !" : "Double-clic détecté (retour).";
                    last = 0;
                } else {
                    last = now;
                    testResult.textContent = "Clic simple.";
                }
            });
            const testResult = document.createElement("span");
            testResult.className = "mouse-test-result";
            testResult.setAttribute("aria-live", "polite");
            testRow.append(testLabel, testBox, testResult);

            slider.addEventListener("input", () => {
                this.pending.doubleClickMs = this.sliderToMs(Number(slider.value));
                this.sheet.markDirty();
                this.sheet.setStatus(`Délai entre les deux clics : ${this.pending.doubleClickMs} ms.`);
            });

            group.append(speedRow, testRow);
            panel.append(header, group);
        }

        renderPointersTab(panel) {
            const group = sheets().createGroup("Schéma de pointeur");
            const list = document.createElement("div");
            list.className = "mouse-schemes";
            list.setAttribute("role", "radiogroup");
            list.setAttribute("aria-label", "Schéma de pointeur");

            const preview = document.createElement("div");
            preview.className = "mouse-cursor-preview";
            const previewLabel = document.createElement("span");
            preview.appendChild(previewLabel);
            const description = document.createElement("p");
            description.className = "property-note";

            const show = () => {
                const scheme = mouse().SCHEMES.find((candidate) => candidate.key === this.pending.cursorScheme);
                preview.dataset.cursorScheme = scheme.key;
                previewLabel.textContent = "Passez le pointeur ici pour l'essayer";
                description.textContent = scheme.description;
                list.querySelectorAll(".mouse-scheme").forEach((button) => {
                    const selected = button.dataset.key === scheme.key;
                    button.classList.toggle("selected", selected);
                    button.setAttribute("aria-checked", selected ? "true" : "false");
                });
            };

            mouse().SCHEMES.forEach((scheme) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "mouse-scheme";
                button.dataset.key = scheme.key;
                button.setAttribute("role", "radio");
                button.textContent = scheme.label;
                button.addEventListener("click", () => {
                    this.pending.cursorScheme = scheme.key;
                    this.sheet.markDirty();
                    show();
                });
                list.appendChild(button);
            });
            group.append(list, preview, description);
            panel.appendChild(group);
            show();
        }
    }

    const api = {
        attach(rootElement) {
            return rootElement?.__win95MouseInstance || new Win95MouseProperties(rootElement);
        }
    };

    window.Win95MouseProperties = api;
    window.Win95Services?.register?.("Win95MouseProperties", api);
})();
