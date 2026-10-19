// Plugin de test de la page du téléphone (déclaré `phone: true`) : remplit la page de liaison avec registerPhonePage.
(() => {
    window.__phone = { mounted: 0, cleaned: 0, context: null };
    window.Win95LocalLink.registerPhonePage((container, context) => {
        window.__phone.mounted += 1;
        window.__phone.context = { token: context.token, appName: context.appName };
        container.textContent = "Contenu du projet";
        context.setStatus("Projet prêt.");
        return () => { window.__phone.cleaned += 1; };
    });
})();
