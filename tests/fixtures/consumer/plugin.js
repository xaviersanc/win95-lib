// Plugin du projet : son icône est relative à la PAGE du projet (pas à la bibliothèque).
window.Win95WindowManager.registerApp({
    key: "projet",
    label: "Mon appli",
    icon: "assets/own.png",
    tool: { width: "280px", height: "160px", attach: (element) => { element.querySelector("[data-app-body]").textContent = "Application du projet"; } },
    startMenu: { path: ["Programmes", "Projet"] },
    desktopIcon: true
});
window.__consumerReady = true;
