(() => {
    // Propriétés de Sons (Win95SoundProperties) : événements Windows, son associé, schéma, volume, aperçu.
    // Les réglages sont enregistrés dans Win95Sounds par OK ou Appliquer.

    const sounds = () => window.Win95Sounds;
    const sheets = () => window.Win95PropertySheet;
    const SPEAKER_ICON = window.Win95Asset("assets/icons/loudspeaker_rays-0.png");

    class Win95SoundProperties {
        constructor(rootElement) {
            this.rootElement = rootElement;
            this.bodyElement = rootElement.querySelector("[data-applet]");
            if (!this.bodyElement) {
                return;
            }

            const state = sounds().getState();
            this.pending = { scheme: state.scheme, map: { ...state.map }, volume: state.volume };
            this.selectedEvent = sounds().EVENTS[0].key;
            this.sheet = sheets().mount(this.bodyElement, {
                id: "sounds",
                tabs: [{ key: "sounds", label: "Sons", render: (panel) => this.renderPanel(panel) }],
                onApply: () => sounds().save(this.pending),
                onClose: () => window.Win95WindowManager?.closeWindow(rootElement)
            });
            rootElement.__win95SoundsInstance = this;
        }

        renderPanel(panel) {
            const eventsGroup = sheets().createGroup("Événements");
            this.listElement = document.createElement("div");
            this.listElement.className = "sound-events windows-scrollbar";
            this.listElement.setAttribute("role", "listbox");
            this.listElement.setAttribute("aria-label", "Événements Windows");
            eventsGroup.appendChild(this.listElement);

            const nameRow = document.createElement("div");
            nameRow.className = "sound-name-row";
            const nameLabel = document.createElement("label");
            nameLabel.textContent = "Nom :";
            nameLabel.htmlFor = "sound-select";
            this.soundSelect = document.createElement("select");
            this.soundSelect.id = "sound-select";
            this.soundSelect.className = "form-95";
            sounds().SOUNDS.forEach((sound) => this.soundSelect.add(new Option(sound.label, sound.key)));
            this.soundSelect.addEventListener("change", () => {
                this.pending.map[this.selectedEvent] = this.soundSelect.value;
                this.pending.scheme = "custom";
                this.schemeSelect.value = "custom";
                this.sheet.markDirty();
                this.renderList();
                sounds().preview(this.soundSelect.value, this.pending.volume);
            });
            const previewButton = document.createElement("button");
            previewButton.type = "button";
            previewButton.className = "btn start-btn sound-preview";
            previewButton.textContent = "Aperçu";
            previewButton.addEventListener("click", () => {
                const played = sounds().preview(this.soundSelect.value, this.pending.volume);
                this.sheet.setStatus(played ? "" : (this.soundSelect.value === "none" ? "Aucun son associé à cet événement." : "Son indisponible (volume à zéro ou audio bloqué par le navigateur)."));
            });
            nameRow.append(nameLabel, this.soundSelect, previewButton);
            eventsGroup.appendChild(nameRow);

            const schemeGroup = sheets().createGroup("Schémas");
            this.schemeSelect = document.createElement("select");
            this.schemeSelect.className = "form-95";
            this.schemeSelect.setAttribute("aria-label", "Schéma de sons");
            sounds().SCHEMES.forEach((scheme) => this.schemeSelect.add(new Option(scheme.label, scheme.key)));
            this.schemeSelect.add(new Option("(Personnalisé)", "custom"));
            this.schemeSelect.value = this.pending.scheme;
            this.schemeSelect.addEventListener("change", () => {
                const scheme = sounds().SCHEMES.find((candidate) => candidate.key === this.schemeSelect.value);
                if (scheme) {
                    this.pending.scheme = scheme.key;
                    this.pending.map = { ...scheme.map };
                    this.sheet.markDirty();
                    this.renderList();
                }
            });
            schemeGroup.appendChild(this.schemeSelect);

            const volumeGroup = sheets().createGroup("Volume");
            const volumeRow = document.createElement("div");
            volumeRow.className = "mouse-speed-row";
            const low = document.createElement("span");
            low.textContent = "Faible";
            const slider = document.createElement("input");
            slider.type = "range";
            slider.min = "0";
            slider.max = "100";
            slider.className = "mouse-slider";
            slider.value = String(Math.round(this.pending.volume * 100));
            slider.setAttribute("aria-label", "Volume des sons");
            slider.addEventListener("input", () => {
                this.pending.volume = Number(slider.value) / 100;
                this.sheet.markDirty();
            });
            const high = document.createElement("span");
            high.textContent = "Fort";
            volumeRow.append(low, slider, high);
            volumeGroup.appendChild(volumeRow);

            panel.append(eventsGroup, schemeGroup, volumeGroup);
            this.renderList();
        }

        renderList() {
            this.listElement.textContent = "";
            sounds().EVENTS.forEach((event) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "sound-event";
                button.setAttribute("role", "option");
                const selected = event.key === this.selectedEvent;
                button.classList.toggle("selected", selected);
                button.setAttribute("aria-selected", selected ? "true" : "false");
                const icon = document.createElement("img");
                icon.alt = "";
                icon.src = SPEAKER_ICON;
                icon.className = "sound-event-icon";
                icon.style.visibility = this.pending.map[event.key] && this.pending.map[event.key] !== "none" ? "visible" : "hidden";
                const label = document.createElement("span");
                label.textContent = event.label;
                button.append(icon, label);
                button.addEventListener("click", () => {
                    this.selectedEvent = event.key;
                    this.renderList();
                });
                this.listElement.appendChild(button);
            });
            this.soundSelect.value = this.pending.map[this.selectedEvent] || "none";
        }
    }

    const api = {
        attach(rootElement) {
            return rootElement?.__win95SoundsInstance || new Win95SoundProperties(rootElement);
        }
    };

    window.Win95SoundProperties = api;
    window.Win95Services?.register?.("Win95SoundProperties", api);
})();
