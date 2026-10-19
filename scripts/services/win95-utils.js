(() => {
    // Utilitaires partagés : chemins, identifiants, index des documents, utilisateur courant.
    // Centralisés ici pour éviter les copies divergentes dans chaque composant.

    function normalizePath(value) {
        return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
    }

    function toSafeUrl(path) {
        if (typeof path !== "string") {
            return "";
        }
        // URL complète (https:, blob:, data:…) : déjà prête à l'emploi.
        if (/^[a-z][a-z0-9+.-]*:/i.test(path)) {
            return path;
        }
        return path.split("/").map(encodeURIComponent).join("/");
    }

    function toIdentifier(value, fallbackPrefix = "item") {
        const normalized = String(value || "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
        return normalized || `${fallbackPrefix}-${Date.now().toString(36)}`;
    }

    function createUniqueId(prefix) {
        return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    }

    function getFileNameFromPath(relativePath) {
        const parts = String(relativePath || "").split("/").filter(Boolean);
        return parts.length > 0 ? parts[parts.length - 1] : "";
    }

    // Type d'un fichier d'après son extension : détermine l'icône et l'application d'ouverture.
    function getFileKind(fileName) {
        const name = String(fileName || "");
        if (/\.(mp3|wav|ogg|m4a|flac)$/i.test(name)) {
            return "audio";
        }
        if (/\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(name)) {
            return "image";
        }
        // Dessin Paint : PNG encodé en data URL dans un fichier texte (voir scripts/paint/paint-component.js).
        if (/\.paint$/i.test(name)) {
            return "paint";
        }
        if (/\.(txt|md|log|csv|json|xml|ini|rtf)$/i.test(name)) {
            return "text";
        }
        return "generic";
    }

    function getFileIcon(fileName) {
        return {
            audio: window.Win95Asset("assets/icons/media_player_file-0.png"),
            image: window.Win95Asset("assets/icons/imagjpeg-1.png"),
            text: window.Win95Asset("assets/icons/notepad_file-1.png"),
            paint: window.Win95Asset("assets/icons/paint_file-0.png")
        }[getFileKind(fileName)] || window.Win95Asset("assets/icons/document-1.png");
    }

    function formatBytes(bytes) {
        const value = Number(bytes) || 0;
        if (value < 1024) {
            return `${value} o`;
        }
        if (value < 1024 * 1024) {
            return `${(value / 1024).toFixed(1).replace(".", ",")} Ko`;
        }
        return `${(value / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
    }

    // Compte connecté (Win95Security, scripts/security/security-manager.js) ; sans session : profil « Invité ».
    function getCurrentUser() {
        try {
            const user = window.Win95Security?.getCurrentUser?.();
            if (user) {
                return user;
            }
        } catch {
            // Sécurité pas encore chargée : profil invité.
        }
        return { userId: "invite", userName: "Invité", role: "user", allowedApps: null };
    }

    function getCurrentUserName() {
        return getCurrentUser().userName;
    }

    // Identifiant stable du compte (ne change pas si le compte est renommé) : clé des données locales.
    function getCurrentUserId() {
        return getCurrentUser().userId;
    }

    function getUserDocumentsPath() {
        return `Utilisateurs/${getCurrentUserId()}/Mes documents`;
    }

    function isCurrentUserAdmin() {
        return getCurrentUser().role === "admin";
    }

    function readStoredJson(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch {
            return fallback;
        }
    }

    function writeStoredJson(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch {
            return false;
        }
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    // Minuscules sans accents ni espaces de bord : clé de comparaison commune aux stores.
    function simplifyText(value) {
        return String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    // Ajuste la fenêtre d'une application à taille fixe à son contenu (jeux dont la grille change de taille, calculatrice
    // standard / scientifique…). contentElement : le bloc qui définit la taille ; le corps de fenêtre est `[data-app-body]`.
    function fitWindow(rootElement, contentElement, { extraHeight: contentExtraHeight = 0 } = {}) {
        const body = rootElement.querySelector("[data-app-body]");
        if (!body || !contentElement) {
            return;
        }
        const extraWidth = rootElement.offsetWidth - body.clientWidth;
        const extraHeight = rootElement.offsetHeight - body.clientHeight;
        rootElement.style.width = `${Math.ceil(contentElement.offsetWidth + extraWidth)}px`;
        rootElement.style.height = `${Math.ceil(contentElement.offsetHeight + contentExtraHeight + extraHeight)}px`;
    }

    const utils = {
        fitWindow,
        normalizePath,
        toSafeUrl,
        toIdentifier,
        createUniqueId,
        getFileNameFromPath,
        getFileKind,
        getFileIcon,
        formatBytes,
        getCurrentUser,
        getCurrentUserName,
        getCurrentUserId,
        getUserDocumentsPath,
        isCurrentUserAdmin,
        readStoredJson,
        writeStoredJson,
        escapeHtml,
        simplifyText,
        clamp
    };

    window.Win95Utils = utils;
    window.Win95Services?.register?.("Win95Utils", utils);
})();
