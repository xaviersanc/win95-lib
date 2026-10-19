(() => {
    const root = window;
    const existing = root.Win95Services && typeof root.Win95Services === "object"
        ? root.Win95Services
        : {};
    const store = existing._store && typeof existing._store === "object"
        ? existing._store
        : {};

    const isObject = (value) => value && typeof value === "object";

    const services = {
        ...existing,
        _store: store,
        config: isObject(existing.config) ? existing.config : {},
        register(name, value) {
            if (typeof name !== "string" || !name) {
                return value;
            }

            store[name] = value;
            return value;
        },
        get(name) {
            if (typeof name !== "string" || !name) {
                return null;
            }

            if (Object.prototype.hasOwnProperty.call(store, name)) {
                return store[name];
            }

            return root[name] || null;
        }
    };

    root.Win95Services = services;
})();