(() => {
    // Propriétés système (Win95SystemProperties) : Général, Gestionnaire de périphériques, Profils matériels, Performances.
    // Les informations sont **réelles** quand le navigateur les donne (cœurs, mémoire, écran, stockage, langue, connexion)
    // et simulées sinon (version de Windows 95, noms de périphériques).

    const sheets = () => window.Win95PropertySheet;
    const WINDOWS_VERSION = "Microsoft Windows 95\nVersion 4.00.950 B";

    function formatBytes(bytes) {
        return window.Win95Utils.formatBytes(bytes);
    }

    function describeBrowser() {
        const ua = navigator.userAgent;
        const match = /(Edg|OPR|Firefox|Chrome|Safari)\/([\d.]+)/.exec(ua);
        const names = { Edg: "Microsoft Edge", OPR: "Opera", Firefox: "Firefox", Chrome: "Chrome", Safari: "Safari" };
        return match ? `${names[match[1]]} ${match[2].split(".")[0]}` : "Navigateur inconnu";
    }

    function getGraphicsName() {
        try {
            const gl = document.createElement("canvas").getContext("webgl");
            const info = gl?.getExtension("WEBGL_debug_renderer_info");
            return (info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) || "Adaptateur graphique standard";
        } catch {
            return "Adaptateur graphique standard";
        }
    }

    // Lignes d'infos de stockage et de mémoire, résolues de façon asynchrone.
    async function readStorage() {
        try {
            const estimate = await navigator.storage?.estimate?.();
            return estimate && estimate.quota ? estimate : null;
        } catch {
            return null;
        }
    }

    class Win95SystemProperties {
        constructor(rootElement) {
            this.rootElement = rootElement;
            this.bodyElement = rootElement.querySelector("[data-applet]");
            if (!this.bodyElement) {
                return;
            }

            this.sheet = sheets().mount(this.bodyElement, {
                id: "system-properties",
                tabs: [
                    { key: "general", label: "Général", render: (panel) => this.renderGeneral(panel) },
                    { key: "devices", label: "Gestionnaire de périphériques", render: (panel) => this.renderDevices(panel) },
                    { key: "profiles", label: "Profils matériels", render: (panel) => this.renderProfiles(panel) },
                    { key: "performance", label: "Performances", render: (panel) => this.renderPerformance(panel) }
                ],
                buttons: "ok-cancel",
                onClose: () => window.Win95WindowManager?.closeWindow(rootElement)
            });
            rootElement.__win95SystemInstance = this;
        }

        line(parent, title, value) {
            const row = document.createElement("div");
            row.className = "system-line";
            const label = document.createElement("span");
            label.className = "system-label";
            label.textContent = title;
            const text = document.createElement("span");
            text.className = "system-value";
            text.textContent = value;
            row.append(label, text);
            parent.appendChild(row);
            return text;
        }

        renderGeneral(panel) {
            const header = document.createElement("div");
            header.className = "system-header";
            header.innerHTML = `<img alt="" src="${window.Win95Asset("assets/icons/computer_2-2.png")}">`;
            const intro = document.createElement("div");
            intro.className = "system-intro";
            const lines = WINDOWS_VERSION.split("\n");
            lines.forEach((text, index) => {
                const paragraph = document.createElement("p");
                paragraph.textContent = text;
                paragraph.className = index === 0 ? "system-product" : "";
                intro.appendChild(paragraph);
            });
            header.appendChild(intro);

            const registered = sheets().createGroup("Inscrit à");
            const user = window.Win95Utils.getCurrentUser();
            this.line(registered, "Utilisateur :", user.userName);
            this.line(registered, "Rôle :", user.role === "admin" ? "Administrateur" : "Utilisateur");

            const computer = sheets().createGroup("Ordinateur");
            this.line(computer, "Navigateur :", describeBrowser());
            this.line(computer, "Processeur :", `${navigator.hardwareConcurrency || "?"} cœur(s) logique(s)`);
            this.line(computer, "Mémoire :", navigator.deviceMemory ? `≈ ${navigator.deviceMemory} Go de RAM` : "Non communiquée par le navigateur");
            this.line(computer, "Écran :", `${screen.width} × ${screen.height}, ${screen.colorDepth} bits`);
            this.line(computer, "Langue :", navigator.language || "fr-FR");

            panel.append(header, registered, computer);
        }

        renderDevices(panel) {
            const note = document.createElement("p");
            note.className = "property-note";
            note.textContent = "Double-cliquez sur une catégorie pour afficher ses périphériques.";
            const tree = document.createElement("div");
            tree.className = "system-tree windows-scrollbar";
            tree.setAttribute("role", "tree");
            const storageLine = { text: "Disque virtuel (stockage du navigateur)" };
            const groups = [
                { icon: window.Win95Asset("assets/icons/computer_2-2.png"), label: "Ordinateur", items: [`Ordinateur compatible PC (${describeBrowser()})`] },
                { icon: window.Win95Asset("assets/icons/hard_disk_drive-0.png"), label: "Contrôleurs de disque dur", items: [storageLine] },
                { icon: window.Win95Asset("assets/icons/keyboard-0.png"), label: "Clavier", items: [`Clavier standard 102 touches (${navigator.language || "fr-FR"})`] },
                { icon: window.Win95Asset("assets/icons/computer_explorer-2.png"), label: "Moniteur", items: [`Moniteur plug-and-play (${screen.width} × ${screen.height})`] },
                { icon: window.Win95Asset("assets/icons/mouse-0.png"), label: "Souris", items: [window.matchMedia?.("(pointer: coarse)").matches ? "Écran tactile" : "Souris compatible Microsoft"] },
                { icon: window.Win95Asset("assets/icons/hardware-2.png"), label: "Processeur", items: Array.from({ length: Math.min(navigator.hardwareConcurrency || 1, 16) }, (_, index) => `Processeur compatible x86 (${index + 1})`) },
                { icon: window.Win95Asset("assets/icons/computer_sound-0.png"), label: "Contrôleurs audio, vidéo et jeu", items: [`Carte graphique : ${getGraphicsName()}`, window.AudioContext || window.webkitAudioContext ? "Carte son compatible Web Audio" : "Aucune carte son détectée"] },
                { icon: window.Win95Asset("assets/icons/settings_gear-0.png"), label: "Cartes réseau", items: [navigator.onLine ? `Connexion réseau (${navigator.connection?.effectiveType || "en ligne"})` : "Aucune connexion réseau"] }
            ];
            groups.forEach((group) => {
                const node = document.createElement("div");
                node.className = "system-node";
                const head = document.createElement("button");
                head.type = "button";
                head.className = "system-node-head";
                head.setAttribute("role", "treeitem");
                head.setAttribute("aria-expanded", "false");
                const toggle = document.createElement("span");
                toggle.className = "system-toggle";
                toggle.textContent = "+";
                const icon = document.createElement("img");
                icon.alt = "";
                icon.src = group.icon;
                const label = document.createElement("span");
                label.textContent = group.label;
                head.append(toggle, icon, label);
                const children = document.createElement("div");
                children.className = "system-children";
                children.hidden = true;
                group.items.forEach((item) => {
                    const child = document.createElement("div");
                    child.className = "system-child";
                    child.textContent = typeof item === "string" ? item : item.text;
                    if (typeof item !== "string") {
                        item.element = child;
                    }
                    children.appendChild(child);
                });
                const flip = () => {
                    children.hidden = !children.hidden;
                    toggle.textContent = children.hidden ? "+" : "−";
                    head.setAttribute("aria-expanded", children.hidden ? "false" : "true");
                };
                head.addEventListener("click", flip);
                node.append(head, children);
                tree.appendChild(node);
            });
            panel.append(note, tree);
            readStorage().then((estimate) => {
                if (estimate && storageLine.element) {
                    storageLine.element.textContent = `Disque virtuel : ${formatBytes(estimate.usage || 0)} utilisés sur ${formatBytes(estimate.quota)} disponibles`;
                }
            });
        }

        renderProfiles(panel) {
            const note = document.createElement("p");
            note.className = "property-note";
            note.textContent = "Vous pouvez configurer des profils matériels différents pour les situations où votre ordinateur change de configuration. Sélectionnez un profil au démarrage de Windows.";
            const list = document.createElement("div");
            list.className = "system-profiles";
            const profile = document.createElement("div");
            profile.className = "system-profile selected";
            profile.textContent = "Configuration d'origine (actuelle)";
            list.appendChild(profile);
            const buttons = document.createElement("div");
            buttons.className = "system-profile-buttons";
            ["Propriétés", "Copier", "Renommer", "Supprimer"].forEach((label) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "btn start-btn";
                button.textContent = label;
                button.disabled = true;
                buttons.appendChild(button);
            });
            const info = document.createElement("p");
            info.className = "property-note";
            info.textContent = "Un seul profil matériel existe : l'ordinateur simulé ne change pas de configuration.";
            panel.append(note, list, buttons, info);
        }

        renderPerformance(panel) {
            const group = sheets().createGroup("Configuration des performances");
            const memory = this.line(group, "Mémoire installée (RAM) :", navigator.deviceMemory ? `≈ ${navigator.deviceMemory} Go` : "Non communiquée");
            const resources = this.line(group, "Ressources système :", "…");
            const fileSystem = this.line(group, "Système de fichiers :", "32 bits");
            const disk = this.line(group, "Mes documents :", "…");
            const virtualMemory = this.line(group, "Mémoire virtuelle :", "Gérée par Windows");
            const verdict = document.createElement("p");
            verdict.className = "system-verdict";
            panel.append(group, verdict);
            void memory;
            void fileSystem;
            void virtualMemory;

            // Ressources : tas JavaScript utilisé (Chrome / Edge seulement).
            const heap = performance.memory;
            let freePercent = null;
            if (heap?.jsHeapSizeLimit) {
                freePercent = Math.max(0, Math.round((1 - heap.usedJSHeapSize / heap.jsHeapSizeLimit) * 100));
                resources.textContent = `${freePercent} % libres`;
            } else {
                resources.textContent = "Non mesurées par ce navigateur";
            }
            const files = window.Win95UserFiles;
            disk.textContent = files?.isLoaded() ? files.getUsageLabel() : "Pas encore chargé (ouvrez Mes documents)";
            verdict.textContent = freePercent !== null && freePercent < 20
                ? "Les ressources système sont faibles : fermez des fenêtres."
                : "Les performances de votre système sont optimales.";
        }
    }

    const api = {
        attach(rootElement) {
            return rootElement?.__win95SystemInstance || new Win95SystemProperties(rootElement);
        }
    };

    window.Win95SystemProperties = api;
    window.Win95Services?.register?.("Win95SystemProperties", api);
})();
