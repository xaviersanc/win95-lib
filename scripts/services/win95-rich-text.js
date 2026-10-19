(() => {
    // Texte mis en forme, stocké en markdown (fichiers .txt/.md) :
    //  - renderMarkdown(texte) : affichage (retours à la ligne, **gras**, *italique*, ++souligné++, ~~barré~~,
    //    `code`, # titres, listes "- " et "1. ", ligne "---", liens http(s)) ; construit en DOM, sans innerHTML ;
    //  - createEditor() : éditeur façon WordPad (barre de mise en forme + zone éditable) qui relit et
    //    réécrit ce même markdown. Les séquences littérales "\n" sont traitées comme des retours à la ligne.

    const INLINE_RULES = [
        { pattern: /\*\*(.+?)\*\*/, tag: "strong" },
        { pattern: /\+\+(.+?)\+\+/, tag: "u" },
        { pattern: /~~(.+?)~~/, tag: "s" },
        { pattern: /(?<![*\w])\*(?![\s*])(.+?)(?<![\s*])\*(?![*\w])/, tag: "em" },
        { pattern: /(?<![\w])_(?![\s_])(.+?)(?<![\s_])_(?![\w])/, tag: "em" },
        { pattern: /`([^`]+)`/, tag: "code", raw: true },
        { pattern: /\bhttps?:\/\/[^\s<>"']+/, link: true }
    ];

    function normalizeText(text) {
        return String(text ?? "").replace(/\r\n?/g, "\n").replace(/\\n/g, "\n");
    }

    // Texte d'une ligne → nœuds en ligne (gras, italique, liens...).
    function appendInline(parent, text) {
        let rest = text;
        while (rest.length > 0) {
            let best = null;
            INLINE_RULES.forEach((rule) => {
                const match = rule.pattern.exec(rest);
                if (match && (!best || match.index < best.match.index)) {
                    best = { rule, match };
                }
            });
            if (!best) {
                parent.appendChild(document.createTextNode(rest));
                return;
            }
            const { rule, match } = best;
            if (match.index > 0) {
                parent.appendChild(document.createTextNode(rest.slice(0, match.index)));
            }
            if (rule.link) {
                const url = match[0].replace(/[.,;:!?)\]]+$/, "");
                const link = document.createElement("a");
                link.href = url;
                link.target = "_blank";
                link.rel = "noopener noreferrer nofollow";
                link.textContent = url;
                parent.appendChild(link);
                rest = rest.slice(match.index + url.length);
                continue;
            }
            const element = document.createElement(rule.tag);
            if (rule.raw) {
                element.textContent = match[1];
            } else {
                appendInline(element, match[1]);
            }
            parent.appendChild(element);
            rest = rest.slice(match.index + match[0].length);
        }
    }

    // Markdown → fragment : une ligne = un bloc (div), pour conserver exactement les retours à la ligne.
    function renderMarkdown(text) {
        const fragment = document.createDocumentFragment();
        let list = null;
        normalizeText(text).split("\n").forEach((line) => {
            const heading = /^(#{1,3})\s+(.*)$/.exec(line);
            const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
            const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
            if (bullet || numbered) {
                const tag = bullet ? "ul" : "ol";
                if (!list || list.tagName.toLowerCase() !== tag) {
                    list = document.createElement(tag);
                    fragment.appendChild(list);
                }
                const item = document.createElement("li");
                appendInline(item, (bullet || numbered)[1]);
                list.appendChild(item);
                return;
            }
            list = null;
            if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
                fragment.appendChild(document.createElement("hr"));
                return;
            }
            const block = document.createElement(heading ? `h${heading[1].length}` : "div");
            if (heading) {
                appendInline(block, heading[2]);
            } else if (line.length === 0) {
                block.appendChild(document.createElement("br"));
            } else {
                appendInline(block, line);
            }
            fragment.appendChild(block);
        });
        return fragment;
    }

    // Texte court sans structure de blocs : rendu en ligne, sinon en blocs.
    function renderInto(container, text) {
        const value = normalizeText(text);
        container.replaceChildren();
        container.classList.add("win95-rich-text");
        if (!value.includes("\n") && !/^(#{1,3}\s|\s*[-*•]\s|\s*\d+[.)]\s)/.test(value)) {
            appendInline(container, value);
            return container;
        }
        container.appendChild(renderMarkdown(value));
        return container;
    }

    // --- Éditeur (HTML → markdown) -----------------------------------------------------------

    const INLINE_MARKERS = { B: "**", STRONG: "**", I: "*", EM: "*", U: "++", INS: "++", S: "~~", STRIKE: "~~", DEL: "~~" };
    const BLOCK_TAGS = new Set(["DIV", "P", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "HR", "BLOCKQUOTE", "PRE"]);

    function inlineToMarkdown(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent.replace(/ /g, " ");
        }
        if (node.nodeType !== Node.ELEMENT_NODE) {
            return "";
        }
        const tag = node.tagName;
        if (tag === "BR") {
            return "\n";
        }
        const inner = Array.from(node.childNodes).map(inlineToMarkdown).join("");
        if (tag === "CODE") {
            return `\`${node.textContent}\``;
        }
        if (tag === "A") {
            const href = node.getAttribute("href") || "";
            return /^https?:\/\//i.test(href) && href !== inner ? `${inner} (${href})` : inner;
        }
        // Styles posés par le navigateur (span style="font-weight: bold"...).
        let marker = INLINE_MARKERS[tag] || "";
        if (!marker && tag === "SPAN") {
            const style = node.style;
            if (/bold|[6-9]00/.test(style.fontWeight)) {
                marker = "**";
            } else if (style.fontStyle === "italic") {
                marker = "*";
            } else if (/underline/.test(style.textDecorationLine || style.textDecoration)) {
                marker = "++";
            } else if (/line-through/.test(style.textDecorationLine || style.textDecoration)) {
                marker = "~~";
            }
        }
        if (!marker || inner.trim() === "") {
            return inner;
        }
        // Les marqueurs entourent le texte, pas les espaces de bord.
        const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
        return `${lead}${marker}${core}${marker}${trail}`;
    }

    function blocksToMarkdown(root) {
        const lines = [];
        let inlineRun = [];
        const flush = () => {
            if (inlineRun.length > 0) {
                lines.push(inlineRun.map(inlineToMarkdown).join(""));
                inlineRun = [];
            }
        };
        Array.from(root.childNodes).forEach((node) => {
            if (node.nodeType !== Node.ELEMENT_NODE || !BLOCK_TAGS.has(node.tagName)) {
                inlineRun.push(node);
                return;
            }
            flush();
            const tag = node.tagName;
            if (tag === "HR") {
                lines.push("---");
            } else if (tag === "UL" || tag === "OL") {
                Array.from(node.children).forEach((item, index) => {
                    lines.push(`${tag === "UL" ? "-" : `${index + 1}.`} ${inlineToMarkdown(item).replace(/\n+$/, "").replace(/\n/g, " ")}`);
                });
            } else if (/^H[1-6]$/.test(tag)) {
                lines.push(`${"#".repeat(Math.min(3, Number(tag[1])))} ${inlineToMarkdown(node).replace(/\n/g, " ").trim()}`);
            } else if (Array.from(node.childNodes).some((child) => child.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(child.tagName))) {
                lines.push(blocksToMarkdown(node));
            } else {
                // Un bloc vide (<div><br></div>) est une ligne vide.
                lines.push(inlineToMarkdown(node).replace(/\n$/, ""));
            }
        });
        flush();
        return lines.join("\n");
    }

    const TOOLBAR = [
        { command: "bold", label: "G", title: "Gras (Ctrl+B)", className: "is-bold" },
        { command: "italic", label: "I", title: "Italique (Ctrl+I)", className: "is-italic" },
        { command: "underline", label: "S", title: "Souligné (Ctrl+U)", className: "is-underline" },
        { command: "strikeThrough", label: "B", title: "Barré", className: "is-strike" },
        { separator: true },
        { command: "insertUnorderedList", label: "• Liste", title: "Liste à puces" },
        { command: "insertOrderedList", label: "1. Liste", title: "Liste numérotée" },
        { command: "insertHorizontalRule", label: "―", title: "Ligne de séparation" },
        { separator: true },
        { command: "undo", label: "↶", title: "Annuler (Ctrl+Z)" },
        { command: "redo", label: "↷", title: "Rétablir (Ctrl+Y)" }
    ];
    const STYLES = [
        { value: "div", label: "Normal" },
        { value: "h1", label: "Titre 1" },
        { value: "h2", label: "Titre 2" },
        { value: "h3", label: "Titre 3" }
    ];

    // Éditeur WordPad : { element, getValue, setValue, setReadOnly, focus }. onInput est appelé à chaque saisie.
    function createEditor({ value = "", readOnly = false, onInput = () => {}, ariaLabel = "Document" } = {}) {
        const element = document.createElement("div");
        element.className = "win95-wordpad";

        const toolbar = document.createElement("div");
        toolbar.className = "win95-wordpad-toolbar";
        const styleSelect = document.createElement("select");
        styleSelect.className = "form-95 win95-wordpad-style";
        styleSelect.title = "Style du paragraphe";
        STYLES.forEach((style) => styleSelect.add(new Option(style.label, style.value)));
        toolbar.appendChild(styleSelect);
        TOOLBAR.forEach((entry) => {
            if (entry.separator) {
                const separator = document.createElement("span");
                separator.className = "win95-wordpad-separator";
                toolbar.appendChild(separator);
                return;
            }
            const button = document.createElement("button");
            button.type = "button";
            button.className = `btn win95-wordpad-btn ${entry.className || ""}`.trim();
            button.textContent = entry.label;
            button.title = entry.title;
            button.setAttribute("aria-label", entry.title);
            button.dataset.command = entry.command;
            toolbar.appendChild(button);
        });

        const area = document.createElement("div");
        area.className = "win95-wordpad-area win95-rich-text windows-scrollbar";
        area.setAttribute("role", "textbox");
        area.setAttribute("aria-multiline", "true");
        area.setAttribute("aria-label", ariaLabel);
        area.spellcheck = true;
        element.append(toolbar, area);

        const exec = (command, argument = null) => {
            area.focus();
            document.execCommand("styleWithCSS", false, false);
            document.execCommand(command, false, argument);
            onInput();
        };
        // mousedown empêché : la sélection reste dans le document.
        toolbar.addEventListener("mousedown", (event) => {
            if (event.target.closest("[data-command]")) {
                event.preventDefault();
            }
        });
        toolbar.addEventListener("click", (event) => {
            const command = event.target.closest("[data-command]")?.dataset.command;
            if (command) {
                exec(command);
            }
        });
        styleSelect.addEventListener("change", () => {
            exec("formatBlock", `<${styleSelect.value}>`);
        });
        area.addEventListener("input", () => onInput());
        // Collage en texte brut : pas de mise en forme étrangère.
        area.addEventListener("paste", (event) => {
            event.preventDefault();
            const text = event.clipboardData?.getData("text/plain") || "";
            document.execCommand("insertText", false, text);
        });
        // Style courant affiché dans la liste.
        document.addEventListener("selectionchange", () => {
            const node = document.getSelection()?.anchorNode;
            if (!node || !area.contains(node)) {
                return;
            }
            const block = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement)?.closest("h1, h2, h3, div, li");
            const tag = block && area.contains(block) ? block.tagName.toLowerCase() : "div";
            styleSelect.value = STYLES.some((style) => style.value === tag) ? tag : "div";
        });

        const api = {
            element,
            area,
            getValue() {
                return blocksToMarkdown(area);
            },
            setValue(markdown) {
                area.replaceChildren(renderMarkdown(markdown));
            },
            setReadOnly(isReadOnly) {
                area.contentEditable = isReadOnly ? "false" : "true";
                toolbar.hidden = isReadOnly;
                element.classList.toggle("is-readonly", isReadOnly);
            },
            focus() {
                area.focus();
            }
        };
        api.setValue(value);
        api.setReadOnly(readOnly);
        return api;
    }

    const richText = {
        normalizeText,
        renderMarkdown,
        renderInto,
        createEditor,
        htmlToMarkdown: blocksToMarkdown
    };

    window.Win95RichText = richText;
    window.Win95Services?.register?.("Win95RichText", richText);
})();
