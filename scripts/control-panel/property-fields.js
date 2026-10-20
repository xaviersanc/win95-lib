(() => {
    // Champs déclaratifs des feuilles de propriétés (Win95PropertyFields) : on décrit les champs, l'interface Windows 95 est générée.
    // Utilisé par Win95ControlPanel.registerApplet / addTab et Win95PropertySheet.registerTab ; utilisable seul :
    //
    //   Win95PropertyFields.render(conteneur, fields, { values, onChange(field, value), setStatus(texte) })
    //
    // Types de champs (tous : label?, hint?, disabled?, enabledIf(values)?, visibleIf(values)?, onChange(value, values)?) :
    //   checkbox  { key, label, default }                          case à cocher
    //   slider    { key, label, min, max, step?, minLabel?, maxLabel?, format?(valeur) }   curseur ; format() texte de la barre d'état
    //   number    { key, label, min, max, step? }                  champ numérique
    //   text      { key, label, maxLength?, placeholder? }         champ texte
    //   select    { key, label, options: [{ value, label }] }      liste déroulante
    //   radio     { key, label, options: [{ value, label, description? }] }   liste de choix (un seul)
    //   group     { label, fields: [...] }                         cadre (fieldset + legend)
    //   header    { icon?, text }                                  bandeau d'introduction (icône 32 px + phrase)
    //   note      { text }                                         remarque en gris foncé
    //   button    { label, onClick({ values, setStatus }) }        bouton d'action (n'est pas un réglage)
    //   custom    { render(conteneur, { values, change(valeur), setStatus }), key? }   zone libre
    // Un champ avec `key` et un type de réglage (checkbox, slider, number, text, select, radio) est un réglage : Win95Settings le stocke.

    const settings = () => window.Win95Settings;

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) {
            node.className = className;
        }
        if (text !== undefined) {
            node.textContent = text;
        }
        return node;
    }

    // Tous les champs d'une liste, groupes compris.
    function flatten(fields = []) {
        return fields.flatMap((field) => (field.type === "group" ? flatten(field.fields) : [field]));
    }

    function settingFields(fields) {
        return flatten(fields).filter((field) => settings().isSetting(field));
    }

    // Dessine `fields` dans `container`. `values` est l'objet modifié en direct (copie de travail, pas encore enregistrée).
    function render(container, fields, { values = {}, onChange = () => {}, setStatus = () => {} } = {}) {
        const entries = [];

        const refresh = () => {
            entries.forEach(({ field, node, controls }) => {
                node.hidden = field.visibleIf ? !field.visibleIf(values) : false;
                const disabled = Boolean(field.disabled) || Boolean(field.enabledIf && !field.enabledIf(values));
                controls.forEach((control) => {
                    control.disabled = disabled;
                });
            });
        };

        const change = (field, value) => {
            values[field.key] = value;
            field.onChange?.(value, values);
            onChange(field, value);
            refresh();
        };

        const captionOf = (field, wrapper, forElement) => {
            if (!field.label) {
                return;
            }
            const caption = element("label", "property-field-label", field.label);
            if (forElement) {
                caption.htmlFor = forElement.id;
            }
            wrapper.appendChild(caption);
        };

        let counter = 0;
        const uniqueId = (field) => `property-field-${field.key || "x"}-${(counter += 1)}-${Math.random().toString(36).slice(2, 7)}`;

        const builders = {
            header(field, parent) {
                const node = element("div", "property-header");
                if (field.icon) {
                    const icon = element("img");
                    icon.alt = "";
                    icon.src = field.icon;
                    node.appendChild(icon);
                }
                node.appendChild(element("p", "", field.text));
                parent.appendChild(node);
                return { node, controls: [] };
            },

            note(field, parent) {
                const node = element("p", "property-note", field.text);
                parent.appendChild(node);
                return { node, controls: [] };
            },

            group(field, parent) {
                const node = window.Win95PropertySheet.createGroup(field.label || "");
                parent.appendChild(node);
                field.fields.forEach((child) => build(child, node));
                return { node, controls: [] };
            },

            checkbox(field, parent) {
                const node = element("label", "property-check");
                const input = element("input");
                input.type = "checkbox";
                input.checked = Boolean(values[field.key]);
                input.addEventListener("change", () => change(field, input.checked));
                node.append(input, element("span", "", field.label));
                parent.appendChild(node);
                return { node, controls: [input] };
            },

            slider(field, parent) {
                const node = element("div", "property-field");
                const input = element("input", "property-slider");
                input.id = uniqueId(field);
                input.type = "range";
                input.min = String(field.min ?? 0);
                input.max = String(field.max ?? 100);
                input.step = String(field.step ?? 1);
                input.value = String(values[field.key]);
                input.setAttribute("aria-label", field.label || field.key);
                captionOf(field, node, input);
                const row = element("div", "property-slider-row");
                row.append(element("span", "", field.minLabel ?? ""), input, element("span", "", field.maxLabel ?? ""));
                node.appendChild(row);
                input.addEventListener("input", () => {
                    const value = settings().coerce(field, input.value);
                    change(field, value);
                    setStatus(field.format ? field.format(value) : `${field.label || field.key} : ${value}`);
                });
                parent.appendChild(node);
                return { node, controls: [input] };
            },

            number(field, parent) {
                const node = element("div", "property-field");
                const input = element("input", "form-95 property-input");
                input.id = uniqueId(field);
                input.type = "number";
                if (field.min !== undefined) { input.min = String(field.min); }
                if (field.max !== undefined) { input.max = String(field.max); }
                if (field.step !== undefined) { input.step = String(field.step); }
                input.value = String(values[field.key]);
                captionOf(field, node, input);
                input.addEventListener("input", () => {
                    if (input.value !== "") {
                        change(field, settings().coerce(field, input.value));
                    }
                });
                // À la sortie du champ : valeur bornée affichée telle qu'elle sera enregistrée.
                input.addEventListener("change", () => {
                    input.value = String(settings().coerce(field, input.value));
                    change(field, Number(input.value));
                });
                node.appendChild(input);
                parent.appendChild(node);
                return { node, controls: [input] };
            },

            text(field, parent) {
                const node = element("div", "property-field");
                const input = element("input", "form-95 property-input");
                input.id = uniqueId(field);
                input.type = "text";
                input.maxLength = field.maxLength || 500;
                input.placeholder = field.placeholder || "";
                input.value = String(values[field.key] ?? "");
                captionOf(field, node, input);
                input.addEventListener("input", () => change(field, input.value));
                node.appendChild(input);
                parent.appendChild(node);
                return { node, controls: [input] };
            },

            select(field, parent) {
                const node = element("div", "property-field");
                const select = element("select", "form-95 property-input");
                select.id = uniqueId(field);
                settings().normalizeOptions(field.options).forEach((option) => {
                    const item = element("option", "", option.label);
                    item.value = String(option.value);
                    select.appendChild(item);
                });
                select.value = String(values[field.key]);
                captionOf(field, node, select);
                select.addEventListener("change", () => change(field, settings().coerce(field, select.value)));
                node.appendChild(select);
                parent.appendChild(node);
                return { node, controls: [select] };
            },

            radio(field, parent) {
                const node = element("div", "property-field");
                const list = element("div", "property-choices");
                list.setAttribute("role", "radiogroup");
                list.setAttribute("aria-label", field.label || field.key);
                if (field.label) {
                    node.appendChild(element("span", "property-field-label", field.label));
                }
                const options = settings().normalizeOptions(field.options);
                const buttons = options.map((option) => {
                    const button = element("button", "property-choice", option.label);
                    button.type = "button";
                    button.setAttribute("role", "radio");
                    button.addEventListener("click", () => {
                        change(field, option.value);
                        select();
                        setStatus(option.description || "");
                    });
                    list.appendChild(button);
                    return button;
                });
                const select = () => buttons.forEach((button, index) => {
                    const selected = String(options[index].value) === String(values[field.key]);
                    button.classList.toggle("selected", selected);
                    button.setAttribute("aria-checked", selected ? "true" : "false");
                });
                select();
                node.appendChild(list);
                parent.appendChild(node);
                return { node, controls: buttons };
            },

            button(field, parent) {
                const node = element("div", "property-field");
                const button = element("button", "btn start-btn", field.label);
                button.type = "button";
                button.addEventListener("click", () => field.onClick?.({ values, setStatus }));
                node.appendChild(button);
                parent.appendChild(node);
                return { node, controls: [button] };
            },

            custom(field, parent) {
                const node = element("div", "property-field");
                field.render?.(node, { values, change: (value) => change(field, value), setStatus });
                parent.appendChild(node);
                return { node, controls: [] };
            }
        };

        function build(field, parent) {
            const builder = builders[field.type];
            if (!builder) {
                throw new Error(`Win95PropertyFields : type de champ inconnu « ${field.type} ».`);
            }
            const entry = builder(field, parent);
            if (field.hint) {
                entry.node.title = field.hint;
            }
            entries.push({ field, ...entry });
        }

        fields.forEach((field) => build(field, container));
        refresh();
        return { refresh };
    }

    // --- Onglets déclaratifs ({ key, label, fields, intro?, ns? }) ------------------------------------------------------------

    // Déclare les réglages d'un onglet dans Win95Settings (dès l'enregistrement : `apply` doit jouer même si le panneau n'est jamais ouvert).
    function prepareTab(tab, { ns, apply = null }) {
        const fields = settingFields(tab.fields);
        if (fields.length > 0) {
            tab.store = settings().define(ns, { fields, apply });
            tab.fieldKeys = fields.map((field) => field.key);
        }
        return tab;
    }

    // Contenu d'un onglet : les valeurs en cours de modification sont partagées par feuille (sheet.pending).
    function renderTab(tab, panel, sheet) {
        const values = tab.store ? sheet.pending(tab.store) : {};
        if (tab.intro) {
            const header = { type: "header", ...tab.intro };
            render(panel, [header], {});
        }
        render(panel, tab.fields, {
            values,
            setStatus: (message) => sheet.setStatus(message),
            onChange: () => {
                tab.touched = true;
                sheet.markDirty();
            }
        });
    }

    // « Appliquer » : enregistre les seuls champs de cet onglet, et seulement s'il a été touché.
    function applyTab(tab, sheet) {
        if (!tab.store || !tab.touched) {
            return null;
        }
        const pending = sheet.pending(tab.store);
        const part = {};
        tab.fieldKeys.forEach((key) => {
            part[key] = pending[key];
        });
        const result = tab.store.save(part);
        if (result.ok) {
            tab.touched = false;
        }
        return result;
    }

    const api = { render, flatten, settingFields, prepareTab, renderTab, applyTab };
    window.Win95PropertyFields = api;
    window.Win95Services?.register?.("Win95PropertyFields", api);
})();
