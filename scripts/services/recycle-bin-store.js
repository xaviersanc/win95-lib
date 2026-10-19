(() => {
    // Corbeille des éléments « locaux » : raccourcis (bureau, Mes documents).
    // Les fichiers de Mes documents ont leur propre corbeille (trashedAt, voir user-files-store.js) ;
    // la fenêtre Corbeille affiche les deux.
    // Toute modification émet "win95:recycle-bin-changed".

    const ITEMS_KEY_PREFIX = "win95.recycleBin.items.v1";
    const CHANGE_EVENT = "win95:recycle-bin-changed";

    const utils = () => window.Win95Utils;

    // Une Corbeille par compte.
    const getItemsKey = () => `${ITEMS_KEY_PREFIX}.${utils().getCurrentUserId()}`;

    function readItems() {
        const list = utils().readStoredJson(getItemsKey(), []);
        return Array.isArray(list) ? list : [];
    }

    function writeItems(items) {
        utils().writeStoredJson(getItemsKey(), items);
        window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    }

    const store = {
        CHANGE_EVENT,

        getEntries() {
            return readItems();
        },

        add(item) {
            if (!item || typeof item !== "object") {
                return null;
            }
            const entry = {
                ...item,
                id: item.id || utils().createUniqueId("rb"),
                droppedAt: item.droppedAt || new Date().toISOString()
            };
            writeItems([entry, ...readItems().filter((existing) => existing?.id !== entry.id)]);
            return entry;
        },

        remove(item) {
            const items = readItems();
            const nextItems = items.filter((existing) => existing?.id !== item?.id);
            if (nextItems.length === items.length) {
                return false;
            }
            writeItems(nextItems);
            return true;
        },

        clear() {
            writeItems([]);
        }
    };

    window.Win95RecycleBin = store;
    window.Win95Services?.register?.("Win95RecycleBin", store);
})();
