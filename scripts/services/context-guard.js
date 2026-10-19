(() => {
    // Clic droit : le menu contextuel du navigateur est bloqué sur toute la page pour laisser place aux menus de la
    // simulation (Win95ContextMenu : bureau, icônes, barre des tâches, barre de titre, explorateur…).
    // Exception : les zones de saisie (champ, zone de texte, contenu éditable) gardent le menu du navigateur, qui seul
    // donne accès à Couper / Copier / Coller / Orthographe.
    // Charger ce script **tôt** : un clic droit avant son chargement ouvrirait le menu du navigateur.

    const EDITABLE = "input:not([type='button']):not([type='checkbox']):not([type='radio']):not([type='range']):not([type='submit']), textarea, [contenteditable=''], [contenteditable='true']";

    window.addEventListener("contextmenu", (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest(EDITABLE)) {
            return;
        }
        event.preventDefault();
    }, true);

    window.Win95Services?.register?.("Win95ContextGuard", { EDITABLE });
})();
