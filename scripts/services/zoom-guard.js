(() => {
    // Empêche le zoom de la page (il décale les positions du bureau, des fenêtres et du glisser-déposer).
    // Bloqué : Ctrl/Cmd + molette ou pavé tactile, Ctrl/Cmd + (+ - = 0), pincement tactile, double-tap.
    // Non bloquable par une page web : le zoom choisi depuis le menu du navigateur.

    const ZOOM_KEYS = new Set(["+", "-", "=", "_", "0"]);
    const ZOOM_CODES = new Set(["NumpadAdd", "NumpadSubtract", "Numpad0", "Equal", "Minus", "Digit0"]);

    // Ctrl + molette (et le pincement du pavé tactile, que les navigateurs traduisent ainsi).
    window.addEventListener("wheel", (event) => {
        if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
        }
    }, { passive: false, capture: true });

    window.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && (ZOOM_KEYS.has(event.key) || ZOOM_CODES.has(event.code))) {
            event.preventDefault();
        }
    }, { capture: true });

    // Pincement sur écran tactile.
    document.addEventListener("touchmove", (event) => {
        if (event.touches.length > 1) {
            event.preventDefault();
        }
    }, { passive: false, capture: true });

    // Safari (macOS / iOS) : gestes de zoom propriétaires.
    ["gesturestart", "gesturechange", "gestureend"].forEach((type) => {
        document.addEventListener(type, (event) => event.preventDefault(), { passive: false, capture: true });
    });
})();
