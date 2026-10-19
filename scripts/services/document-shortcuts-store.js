(() => {
    // Raccourcis rangés dans « Mes documents » (et ses sous-dossiers), par utilisateur.
    // Un raccourci ne contient qu'une cible : le supprimer ou le déplacer ne touche jamais l'élément d'origine,
    // et il ne permet pas de modifier cet élément.
    // Toute modification émet "win95:document-shortcuts-changed" pour que les explorateurs se mettent à jour.

    const STORAGE_PREFIX = "win95.documentShortcuts.v1";
    const CHANGE_EVENT = "win95:document-shortcuts-changed";

    const utils = () => window.Win95Utils;

    function getStorageKey() {
        return `${STORAGE_PREFIX}.${utils().getCurrentUserId()}`;
    }

    function readAll() {
        const list = utils().readStoredJson(getStorageKey(), []);
        return Array.isArray(list) ? list : [];
    }

    function writeAll(shortcuts) {
        utils().writeStoredJson(getStorageKey(), shortcuts);
        window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    }

    function isSameFolder(left, right) {
        return utils().normalizePath(left).toLowerCase() === utils().normalizePath(right).toLowerCase();
    }

    // "Nom - raccourci", puis "Nom - raccourci (2)"… si le nom est déjà pris.
    function createUniqueLabel(baseLabel, existingLabels) {
        const labels = new Set(existingLabels);
        if (!labels.has(baseLabel)) {
            return baseLabel;
        }

        let suffix = 2;
        while (labels.has(`${baseLabel} (${suffix})`)) {
            suffix += 1;
        }
        return `${baseLabel} (${suffix})`;
    }

    function createShortcutLabel(targetName, existingLabels) {
        return createUniqueLabel(`${String(targetName || "Fichier")} - raccourci`, existingLabels);
    }

    function getLabelsInFolder(folderPath, excludedId = null) {
        return readAll()
            .filter((shortcut) => shortcut.id !== excludedId && isSameFolder(shortcut.folderPath, folderPath))
            .map((shortcut) => shortcut.label);
    }

    const store = {
        CHANGE_EVENT,
        createShortcutLabel,
        createUniqueLabel,

        // Seul l'arbre « Mes documents » de l'utilisateur courant accepte des raccourcis.
        canHostShortcuts(folderPath) {
            const documentsPath = utils().normalizePath(utils().getUserDocumentsPath()).toLowerCase();
            const candidate = utils().normalizePath(folderPath).toLowerCase();
            return candidate === documentsPath || candidate.startsWith(`${documentsPath}/`);
        },

        list(folderPath) {
            return readAll().filter((shortcut) => isSameFolder(shortcut.folderPath, folderPath));
        },

        get(id) {
            return readAll().find((shortcut) => shortcut.id === id) || null;
        },

        // `label` : nom conservé lors d'un déplacement ; sinon un nom « … - raccourci » est généré.
        add({ id, label, targetName, image, target, folderPath }) {
            const labels = getLabelsInFolder(folderPath);
            const shortcut = {
                id: id || utils().createUniqueId("dsc"),
                label: label ? createUniqueLabel(label, labels) : createShortcutLabel(targetName, labels),
                image: image || window.Win95Asset("assets/icons/document-1.png"),
                target: target || null,
                folderPath,
                createdAt: new Date().toISOString()
            };
            writeAll([...readAll().filter((existing) => existing.id !== shortcut.id), shortcut]);
            return shortcut;
        },

        move(id, folderPath) {
            const shortcuts = readAll();
            const shortcut = shortcuts.find((entry) => entry.id === id);
            if (!shortcut || isSameFolder(shortcut.folderPath, folderPath)) {
                return shortcut || null;
            }

            shortcut.label = createUniqueLabel(shortcut.label, getLabelsInFolder(folderPath, id));
            shortcut.folderPath = folderPath;
            writeAll(shortcuts);
            return shortcut;
        },

        remove(id) {
            const shortcuts = readAll();
            const shortcut = shortcuts.find((entry) => entry.id === id) || null;
            if (shortcut) {
                writeAll(shortcuts.filter((entry) => entry.id !== id));
            }
            return shortcut;
        }
    };

    window.Win95DocumentShortcuts = store;
    window.Win95Services?.register?.("Win95DocumentShortcuts", store);
})();
