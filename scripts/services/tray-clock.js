(() => {
    // Horloge de la barre des tâches : heure de Win95Clock (réglée dans Panneau de configuration > Date/Heure) ;
    // sans ce service, heure de l'ordinateur. L'info-bulle donne la date complète.
    const trayClock = document.getElementById("tray-clock");
    if (!trayClock) {
        return;
    }

    function updateClock() {
        const clock = window.Win95Clock;
        const now = clock ? clock.nowMs() : Date.now();
        trayClock.textContent = clock
            ? clock.formatTime(now)
            : new Date(now).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", hour12: false });
        trayClock.title = clock ? clock.formatDate(now) : new Date(now).toLocaleDateString("fr-FR", { dateStyle: "full" });
    }

    updateClock();
    setInterval(updateClock, 1000);
    window.addEventListener("win95:clock-changed", updateClock);
})();
