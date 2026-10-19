(() => {
    // Propriétés de Date/Heure (Win95DateTime) : calendrier, horloge analogique, heure numérique, fuseau horaire.
    // Les changements sont appliqués à Win95Clock (horloge de la barre des tâches) par OK ou Appliquer.

    const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
    const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

    const clock = () => window.Win95Clock;
    const sheets = () => window.Win95PropertySheet;

    class Win95DateTime {
        constructor(rootElement) {
            this.rootElement = rootElement;
            this.bodyElement = rootElement.querySelector("[data-applet]");
            if (!this.bodyElement) {
                return;
            }

            // Heure affichée : suit l'horloge tant que l'utilisateur n'a rien modifié.
            this.pending = clock().getParts();
            this.pendingZone = clock().getTimeZone();
            this.touched = false;
            this.zoneTouched = false;
            this.viewYear = this.pending.year;
            this.viewMonth = this.pending.month;

            this.sheet = sheets().mount(this.bodyElement, {
                tabs: [
                    { key: "date", label: "Date et heure", render: (panel) => this.renderDateTab(panel) },
                    { key: "zone", label: "Fuseau horaire", render: (panel) => this.renderZoneTab(panel) }
                ],
                onApply: () => this.apply(),
                onClose: () => window.Win95WindowManager?.closeWindow(rootElement)
            });

            this.timer = window.setInterval(() => this.tick(), 1000);
            rootElement.addEventListener("win95:window-closed", () => window.clearInterval(this.timer), { once: true });
            rootElement.__win95DateTimeInstance = this;
        }

        // --- Onglet Date et heure -------------------------------------------------------------

        renderDateTab(panel) {
            panel.classList.add("datetime-panel");

            const dateGroup = sheets().createGroup("Date");
            const controls = document.createElement("div");
            controls.className = "datetime-date-controls";
            this.monthSelect = document.createElement("select");
            this.monthSelect.className = "form-95";
            this.monthSelect.setAttribute("aria-label", "Mois");
            MONTHS.forEach((name, index) => this.monthSelect.add(new Option(name.charAt(0).toUpperCase() + name.slice(1), String(index + 1))));
            this.yearInput = document.createElement("input");
            this.yearInput.type = "number";
            this.yearInput.min = "1980";
            this.yearInput.max = "2099";
            this.yearInput.className = "form-95 datetime-year";
            this.yearInput.setAttribute("aria-label", "Année");
            this.monthSelect.addEventListener("change", () => {
                this.viewMonth = Number(this.monthSelect.value);
                this.touch();
                this.renderCalendar();
            });
            this.yearInput.addEventListener("input", () => {
                const year = Number(this.yearInput.value);
                if (year >= 1980 && year <= 2099) {
                    this.viewYear = year;
                    this.touch();
                    this.renderCalendar();
                }
            });
            controls.append(this.monthSelect, this.yearInput);
            this.calendarElement = document.createElement("div");
            this.calendarElement.className = "datetime-calendar";
            this.calendarElement.setAttribute("role", "grid");
            dateGroup.append(controls, this.calendarElement);

            const timeGroup = sheets().createGroup("Heure");
            this.canvas = document.createElement("canvas");
            this.canvas.className = "datetime-analog";
            this.canvas.width = 120;
            this.canvas.height = 120;
            this.canvas.setAttribute("role", "img");
            const timeRow = document.createElement("div");
            timeRow.className = "datetime-time-row";
            this.timeInputs = ["hour", "minute", "second"].map((field, index) => {
                const input = document.createElement("input");
                input.type = "number";
                input.className = "form-95 datetime-time-input";
                input.min = "0";
                input.max = field === "hour" ? "23" : "59";
                input.setAttribute("aria-label", ["Heures", "Minutes", "Secondes"][index]);
                input.addEventListener("input", () => {
                    const value = Number(input.value);
                    if (Number.isInteger(value) && value >= 0 && value <= Number(input.max)) {
                        this.pending[field] = value;
                        this.touch();
                        this.drawClock();
                    }
                });
                timeRow.appendChild(input);
                if (index < 2) {
                    const separator = document.createElement("span");
                    separator.textContent = ":";
                    timeRow.appendChild(separator);
                }
                return input;
            });
            this.zoneLabel = document.createElement("p");
            this.zoneLabel.className = "datetime-zone";
            timeGroup.append(this.canvas, timeRow, this.zoneLabel);

            panel.append(dateGroup, timeGroup);
            this.refresh();
        }

        // --- Onglet Fuseau horaire --------------------------------------------------------------

        renderZoneTab(panel) {
            const group = sheets().createGroup("Fuseau horaire");
            const select = document.createElement("select");
            select.className = "form-95 datetime-zone-list";
            select.size = 12;
            select.setAttribute("aria-label", "Fuseau horaire");
            const zones = clock().TIME_ZONES.some((zone) => zone.id === this.pendingZone)
                ? clock().TIME_ZONES
                : [...clock().TIME_ZONES, { id: this.pendingZone, label: this.pendingZone.replace(/_/g, " ") }];
            zones.forEach((zone) => select.add(new Option(clock().describeZone(zone.id), zone.id)));
            select.value = this.pendingZone;
            select.addEventListener("change", () => {
                this.pendingZone = select.value;
                this.zoneTouched = true;
                this.zoneLabel && (this.zoneLabel.textContent = clock().describeZone(this.pendingZone));
                this.sheet.markDirty();
                note.textContent = `L'heure sera affichée pour : ${clock().describeZone(this.pendingZone)}.`;
            });
            const note = document.createElement("p");
            note.className = "property-note";
            note.textContent = "Le passage à l'heure d'été et à l'heure d'hiver est automatique.";
            group.append(select, note);
            panel.appendChild(group);
        }

        // --- Mise à jour ------------------------------------------------------------------------

        touch() {
            this.touched = true;
            this.sheet.markDirty();
        }

        // Chaque seconde : tant que rien n'est modifié, l'affichage suit l'horloge.
        tick() {
            if (!this.touched) {
                this.pending = clock().getParts(undefined, this.pendingZone);
                this.viewYear = this.pending.year;
                this.viewMonth = this.pending.month;
                this.refresh();
            }
        }

        refresh() {
            if (!this.canvas) {
                return;
            }
            this.monthSelect.value = String(this.viewMonth);
            if (document.activeElement !== this.yearInput) {
                this.yearInput.value = String(this.viewYear);
            }
            this.timeInputs.forEach((input, index) => {
                if (document.activeElement !== input) {
                    input.value = String(this.pending[["hour", "minute", "second"][index]]).padStart(2, "0");
                }
            });
            this.zoneLabel.textContent = clock().describeZone(this.pendingZone);
            this.renderCalendar();
            this.drawClock();
        }

        renderCalendar() {
            const grid = this.calendarElement;
            grid.textContent = "";
            WEEKDAYS.forEach((letter) => {
                const head = document.createElement("span");
                head.className = "datetime-weekday";
                head.textContent = letter;
                grid.appendChild(head);
            });
            // Lundi = 0.
            const offset = (new Date(Date.UTC(this.viewYear, this.viewMonth - 1, 1)).getUTCDay() + 6) % 7;
            const daysInMonth = new Date(Date.UTC(this.viewYear, this.viewMonth, 0)).getUTCDate();
            for (let blank = 0; blank < offset; blank += 1) {
                grid.appendChild(document.createElement("span"));
            }
            for (let day = 1; day <= daysInMonth; day += 1) {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "datetime-day";
                button.textContent = String(day);
                const selected = this.pending.year === this.viewYear && this.pending.month === this.viewMonth && this.pending.day === day;
                button.classList.toggle("selected", selected);
                button.setAttribute("aria-pressed", selected ? "true" : "false");
                button.addEventListener("click", () => {
                    this.pending = { ...this.pending, year: this.viewYear, month: this.viewMonth, day };
                    this.touch();
                    this.renderCalendar();
                });
                grid.appendChild(button);
            }
        }

        // Horloge analogique : cadran, aiguilles des heures, minutes (noires) et secondes (rouge).
        drawClock() {
            const context = this.canvas.getContext("2d");
            const size = this.canvas.width;
            const center = size / 2;
            const { hour, minute, second } = this.pending;
            context.clearRect(0, 0, size, size);
            context.fillStyle = "#fff";
            context.beginPath();
            context.arc(center, center, center - 4, 0, Math.PI * 2);
            context.fill();
            context.lineWidth = 2;
            context.strokeStyle = "#808080";
            context.stroke();
            context.strokeStyle = "#000";
            for (let tick = 0; tick < 60; tick += 1) {
                const angle = (tick / 60) * Math.PI * 2;
                const inner = tick % 5 === 0 ? center - 14 : center - 10;
                context.lineWidth = tick % 5 === 0 ? 2 : 1;
                context.beginPath();
                context.moveTo(center + Math.sin(angle) * inner, center - Math.cos(angle) * inner);
                context.lineTo(center + Math.sin(angle) * (center - 8), center - Math.cos(angle) * (center - 8));
                context.stroke();
            }
            const hand = (fraction, length, width, color) => {
                const angle = fraction * Math.PI * 2;
                context.strokeStyle = color;
                context.lineWidth = width;
                context.beginPath();
                context.moveTo(center, center);
                context.lineTo(center + Math.sin(angle) * length, center - Math.cos(angle) * length);
                context.stroke();
            };
            hand(((hour % 12) + minute / 60) / 12, center * 0.5, 3, "#000");
            hand((minute + second / 60) / 60, center * 0.75, 2, "#000");
            hand(second / 60, center * 0.8, 1, "#c00000");
            this.canvas.setAttribute("aria-label", `Il est ${String(hour).padStart(2, "0")} h ${String(minute).padStart(2, "0")}`);
        }

        apply() {
            if (this.pendingZone !== clock().getTimeZone()) {
                const zoneResult = clock().setTimeZone(this.pendingZone);
                if (!zoneResult.ok) {
                    return zoneResult;
                }
            }
            if (this.touched) {
                // L'heure saisie est celle du fuseau choisi : on la règle après le changement de fuseau.
                const timeResult = clock().setDateTime(this.pending);
                if (!timeResult.ok) {
                    return timeResult;
                }
            }
            this.touched = false;
            this.zoneTouched = false;
            this.pendingZone = clock().getTimeZone();
            this.tick();
            return { ok: true, message: "Date, heure et fuseau enregistrés." };
        }
    }

    const api = {
        attach(rootElement) {
            return rootElement?.__win95DateTimeInstance || new Win95DateTime(rootElement);
        }
    };

    window.Win95DateTime = api;
    window.Win95Services?.register?.("Win95DateTime", api);
})();
