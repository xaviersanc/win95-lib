(() => {
    // Horloge (Win95ClockApp) : l'accessoire « Horloge » de Windows 95, en analogique ou numérique.
    // Elle affiche l'heure du système (Win95Clock : réglée dans Panneau de configuration > Date/Heure).
    // Réglages (Paramètres) : Analogique / Numérique, Afficher la date, Afficher les secondes ; mémorisés par compte
    // dans localStorage "win95.clockapp.v1.<id>".

    const STORAGE_PREFIX = "win95.clockapp.v1";
    const utils = () => window.Win95Utils;

    class Win95ClockApp {
        constructor(rootElement) {
            this.rootElement = rootElement;
            this.bodyElement = rootElement.querySelector("[data-app-body]");
            if (!this.bodyElement) {
                return;
            }
            this.settings = { mode: "analog", showDate: true, showSeconds: true, ...(utils().readStoredJson(`${STORAGE_PREFIX}.${utils().getCurrentUserId()}`, {}) || {}) };

            window.Win95MenuBar.mount(this.bodyElement, [{
                label: "Paramètres",
                items: () => [
                    { label: "Analogique", checked: this.settings.mode === "analog", onSelect: () => this.update({ mode: "analog" }) },
                    { label: "Numérique", checked: this.settings.mode === "digital", onSelect: () => this.update({ mode: "digital" }) },
                    { separator: true },
                    { label: "Afficher la date", checked: this.settings.showDate, onSelect: () => this.update({ showDate: !this.settings.showDate }) },
                    { label: "Afficher les secondes", checked: this.settings.showSeconds, onSelect: () => this.update({ showSeconds: !this.settings.showSeconds }) }
                ]
            }, {
                label: "?",
                items: [{ label: "À propos de l'Horloge", onSelect: () => void window.Win95Dialog.alert({ title: "À propos de l'Horloge", message: "Horloge Windows 95 (simulation). Elle suit l'heure réglée dans Panneau de configuration > Date/Heure." }) }]
            }]);

            this.faceElement = document.createElement("div");
            this.faceElement.className = "clockapp";
            this.canvas = document.createElement("canvas");
            this.canvas.width = 220;
            this.canvas.height = 220;
            this.canvas.className = "clockapp-canvas";
            this.canvas.setAttribute("role", "img");
            this.digital = document.createElement("div");
            this.digital.className = "clockapp-digital";
            this.dateElement = document.createElement("div");
            this.dateElement.className = "clockapp-date";
            this.faceElement.append(this.canvas, this.digital, this.dateElement);
            this.bodyElement.appendChild(this.faceElement);

            this.timer = window.setInterval(() => this.tick(), 1000);
            rootElement.addEventListener("win95:window-closed", () => window.clearInterval(this.timer), { once: true });
            rootElement.__win95ClockAppInstance = this;
            this.tick();
        }

        update(changes) {
            this.settings = { ...this.settings, ...changes };
            utils().writeStoredJson(`${STORAGE_PREFIX}.${utils().getCurrentUserId()}`, this.settings);
            this.tick();
        }

        tick() {
            const clock = window.Win95Clock;
            const parts = clock.getParts();
            const analog = this.settings.mode === "analog";
            this.canvas.hidden = !analog;
            this.digital.hidden = analog;
            this.dateElement.hidden = !this.settings.showDate;
            this.dateElement.textContent = clock.formatDate();
            const two = (value) => String(value).padStart(2, "0");
            if (analog) {
                this.drawAnalog(parts);
            } else {
                this.digital.textContent = `${two(parts.hour)}:${two(parts.minute)}${this.settings.showSeconds ? `:${two(parts.second)}` : ""}`;
            }
            this.canvas.setAttribute("aria-label", `Il est ${two(parts.hour)} h ${two(parts.minute)}`);
        }

        drawAnalog({ hour, minute, second }) {
            const context = this.canvas.getContext("2d");
            const size = this.canvas.width;
            const center = size / 2;
            context.clearRect(0, 0, size, size);
            context.fillStyle = "#c0c0c0";
            context.fillRect(0, 0, size, size);
            // Cadran : disque blanc en creux, repères des heures et des minutes.
            context.fillStyle = "#fff";
            context.beginPath();
            context.arc(center, center, center - 6, 0, Math.PI * 2);
            context.fill();
            context.lineWidth = 3;
            context.strokeStyle = "#808080";
            context.beginPath();
            context.arc(center, center, center - 6, Math.PI * 0.75, Math.PI * 1.75);
            context.stroke();
            context.strokeStyle = "#404040";
            context.beginPath();
            context.arc(center, center, center - 6, Math.PI * 1.75, Math.PI * 2.75);
            context.stroke();
            for (let tick = 0; tick < 60; tick += 1) {
                const angle = (tick / 60) * Math.PI * 2;
                const major = tick % 5 === 0;
                const radius = center - 14;
                context.fillStyle = "#000";
                context.beginPath();
                context.arc(center + Math.sin(angle) * radius, center - Math.cos(angle) * radius, major ? 3 : 1.2, 0, Math.PI * 2);
                context.fill();
            }
            const hand = (fraction, length, width, color) => {
                const angle = fraction * Math.PI * 2;
                context.strokeStyle = color;
                context.lineWidth = width;
                context.lineCap = "round";
                context.beginPath();
                context.moveTo(center, center);
                context.lineTo(center + Math.sin(angle) * length, center - Math.cos(angle) * length);
                context.stroke();
            };
            hand(((hour % 12) + minute / 60) / 12, center * 0.5, 4, "#000080");
            hand((minute + second / 60) / 60, center * 0.74, 3, "#000080");
            if (this.settings.showSeconds) {
                hand(second / 60, center * 0.8, 1, "#c00000");
            }
            context.fillStyle = "#000";
            context.beginPath();
            context.arc(center, center, 4, 0, Math.PI * 2);
            context.fill();
        }
    }

    const api = {
        attach(rootElement) {
            return rootElement?.__win95ClockAppInstance || new Win95ClockApp(rootElement);
        }
    };

    window.Win95ClockApp = api;
    window.Win95Services?.register?.("Win95ClockApp", api);
})();
