(() => {
    // Format commun des glisser-déposer HTML5 entre explorateurs, bureau, Corbeille et Poste de travail.
    // Chaque composant écrit/lit ses payloads via ces helpers au lieu de recopier la logique MIME.

    const MIME = {
        explorerEntry: "application/x-win95-explorer-entry",
        recycleBinEntry: "application/x-win95-recycle-bin-entry",
        text: "text/plain"
    };

    function getTypes(dataTransfer) {
        return Array.from(dataTransfer?.types || []);
    }

    // Utilisable pendant dragenter/dragover, où seuls les types sont lisibles (pas les données).
    function hasAnyType(dataTransfer, mimeTypes) {
        const types = getTypes(dataTransfer);
        return mimeTypes.some((mimeType) => types.includes(mimeType));
    }

    function readPayload(dataTransfer, mimeTypes, isValid = (payload) => Boolean(payload) && typeof payload === "object") {
        if (!dataTransfer) {
            return null;
        }

        for (const mimeType of mimeTypes) {
            try {
                const raw = dataTransfer.getData(mimeType);
                if (!raw) {
                    continue;
                }
                const parsed = JSON.parse(raw);
                if (isValid(parsed)) {
                    return parsed;
                }
            } catch {
                // payload malformé : on essaie le type suivant
            }
        }
        return null;
    }

    function writePayload(dataTransfer, payload, mimeTypes, effectAllowed = "move") {
        if (!dataTransfer || !payload) {
            return false;
        }

        try {
            const raw = JSON.stringify(payload);
            dataTransfer.effectAllowed = effectAllowed;
            new Set([...mimeTypes, MIME.text]).forEach((mimeType) => dataTransfer.setData(mimeType, raw));
            return true;
        } catch {
            return false;
        }
    }

    const api = { MIME, getTypes, hasAnyType, readPayload, writePayload };

    window.Win95DragDrop = api;
    window.Win95Services?.register?.("Win95DragDrop", api);
})();
