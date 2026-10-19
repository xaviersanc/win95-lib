// Plugin « avant l'explorateur » : enregistre ce qui existe au moment où il s'exécute (ordre de chargement).
window.__beforeSeen = {
    paint: typeof window.Win95Paint,
    explorer: typeof window.Win95FileExplorer,
    windowManager: typeof window.Win95WindowManager,
    utils: typeof window.Win95Utils
};
// Un `Win95UserFiles` du projet doit être visible par l'explorateur chargé juste après.
window.__beforeUserFiles = window.Win95UserFiles;
