(() => {
    // Écran de démarrage (Win95Boot) : texte de démarrage, puis écran de présentation « Windows 95 » avec barre de
    // progression, à chaque chargement de la page (un rechargement = un redémarrage). Un clic ou une touche l'abrège.
    // Désactivation : `?noboot` dans l'adresse, ou `window.Win95Config = { bootScreen: false }` avant win95-config.js.
    // Ce script se charge en tout premier : l'écran couvre la page avant que le reste ne s'affiche.
    // Émet "win95:boot-done" quand l'écran disparaît.

    const params = new URLSearchParams(window.location.search);
    if (params.has("noboot") || window.Win95Config?.bootScreen === false) {
        return;
    }

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const TEXT_PHASE_MS = reducedMotion ? 250 : 1100;
    const SPLASH_PHASE_MS = reducedMotion ? 600 : 2600;

    const screen = document.createElement("div");
    screen.className = "boot-screen";
    screen.setAttribute("role", "status");
    screen.setAttribute("aria-label", "Démarrage de Windows 95");
    screen.innerHTML = `
        <div class="boot-text" data-boot-text>
            <p>Démarrage de Windows 95...</p>
            <p class="boot-cursor">_</p>
        </div>
        <div class="boot-splash" data-boot-splash hidden>
            <div class="boot-logo">
                <span class="boot-brand">Microsoft</span>
                <span class="boot-title">Windows<span class="boot-95">95</span></span>
            </div>
            <div class="boot-progress" aria-hidden="true"><span class="boot-progress-bar"></span></div>
            <p class="boot-caption">Windows 95 démarre…</p>
        </div>
        <p class="boot-skip">Cliquez ou appuyez sur une touche pour continuer</p>`;

    let finished = false;
    const timers = [];

    function finish() {
        if (finished) {
            return;
        }
        finished = true;
        timers.forEach((timer) => window.clearTimeout(timer));
        ["keydown", "pointerdown"].forEach((type) => window.removeEventListener(type, finish, true));
        screen.classList.add("is-leaving");
        window.setTimeout(() => {
            screen.remove();
            window.dispatchEvent(new CustomEvent("win95:boot-done"));
        }, reducedMotion ? 0 : 280);
    }

    function showSplash() {
        screen.querySelector("[data-boot-text]").hidden = true;
        screen.querySelector("[data-boot-splash]").hidden = false;
        screen.classList.add("is-splash");
        timers.push(window.setTimeout(finish, SPLASH_PHASE_MS));
    }

    // Le corps n'existe pas toujours quand ce script s'exécute : on s'accroche dès qu'il est là.
    function mount() {
        document.body.appendChild(screen);
        ["keydown", "pointerdown"].forEach((type) => window.addEventListener(type, finish, true));
        timers.push(window.setTimeout(showSplash, TEXT_PHASE_MS));
    }

    if (document.body) {
        mount();
    } else {
        document.addEventListener("DOMContentLoaded", mount, { once: true });
    }

    window.Win95Boot = { skip: finish, isRunning: () => !finished };
})();
