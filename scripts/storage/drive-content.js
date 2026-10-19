(() => {
    // Contenu des documents dans le Google Drive du propriétaire du site (Win95DriveContent), via les fonctions Vercel
    // de vercel/api/drive.js : le navigateur n'a jamais le jeton Google. Les fichiers sont lus par lien public.
    //  - actif seulement si le site est servi en http(s) et que la fonction est configurée (action "status") ;
    //  - référence d'un fichier : "drive:<id Google>" (colonne storage_path de la table user_files) ;
    //  - envoi par morceaux de 3,75 Mo (limite de taille des requêtes des fonctions Vercel) ;
    //  - identification : en-têtes X-Win95-User (id du compte) et X-Win95-Key (empreinte de son mot de passe), que la fonction
    //    vérifie dans la table des comptes (Win95Config.accounts.supabase.table) : les comptes doivent donc être dans Supabase.
    // Configuration : Win95Config.storage.drive { apiBase: "/api" }.

    const PREFIX = "drive:";
    // Multiple de 256 Kio (exigence de Google pour les morceaux intermédiaires), sous la limite de 4,5 Mo de Vercel.
    const CHUNK_BYTES = 15 * 256 * 1024;

    function create(config) {
        const endpoint = `${String(config.drive?.apiBase || "/api").replace(/\/+$/, "")}/drive`;
        let availability = null;

        function authHeaders() {
            const user = window.Win95Utils.getCurrentUser();
            return {
                "X-Win95-User": String(user.userId || "").toLowerCase(),
                "X-Win95-Key": String(window.Win95Accounts?.getAuthHash?.(user.userId) || "")
            };
        }

        async function readError(response) {
            const data = await response.json().catch(() => ({}));
            if (response.status === 401) {
                return "Session expirée pour Google Drive : fermez la session puis reconnectez-vous.";
            }
            return data.error || `Google Drive indisponible (${response.status}).`;
        }

        const fileId = (ref) => String(ref || "").slice(PREFIX.length);

        return {
            PREFIX,

            // true si le contenu doit aller dans Google Drive (vérifié une fois par session).
            isAvailable() {
                if (!availability) {
                    availability = /^https?:$/.test(window.location.protocol)
                        ? fetch(`${endpoint}?action=status`, { cache: "no-store" })
                            .then((response) => (response.ok ? response.json() : { configured: false }))
                            .then((data) => data.configured === true)
                            .catch(() => false)
                        : Promise.resolve(false);
                }
                return availability;
            },

            isDriveRef(ref) {
                return String(ref || "").startsWith(PREFIX);
            },

            // Lien public de lecture : image affichable directement, sinon téléchargement.
            getPublicUrl(ref, { image = false } = {}) {
                const id = encodeURIComponent(fileId(ref));
                return image ? `https://lh3.googleusercontent.com/d/${id}` : `https://drive.google.com/uc?export=download&id=${id}`;
            },

            // Envoie un File ou Blob ; renvoie sa référence "drive:<id>". shared : dossier « Documents partagés ».
            async upload(blob, { name, mimeType, shared = false }) {
                const size = blob.size;
                const start = await fetch(`${endpoint}?action=start`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", ...authHeaders() },
                    body: JSON.stringify({ name, mimeType: mimeType || "application/octet-stream", size, shared })
                });
                if (!start.ok) {
                    throw new Error(await readError(start));
                }
                const { session } = await start.json();
                let offset = 0;
                do {
                    const end = Math.min(size, offset + CHUNK_BYTES);
                    const response = await fetch(`${endpoint}?action=chunk&session=${encodeURIComponent(session)}`, {
                        method: "PUT",
                        headers: {
                            "Content-Type": "application/octet-stream",
                            "X-Content-Range": size === 0 ? "bytes */0" : `bytes ${offset}-${end - 1}/${size}`,
                            ...authHeaders()
                        },
                        body: blob.slice(offset, end)
                    });
                    if (!response.ok) {
                        throw new Error(await readError(response));
                    }
                    const data = await response.json();
                    if (data.done) {
                        return `${PREFIX}${data.fileId}`;
                    }
                    offset = end;
                } while (offset < size);
                throw new Error("Envoi interrompu : Google Drive n'a pas confirmé le fichier.");
            },

            // Copie côté serveur (sans téléchargement) ; renvoie la référence de la copie.
            async copy(ref, { name, shared = false }) {
                const response = await fetch(`${endpoint}?action=copy`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", ...authHeaders() },
                    body: JSON.stringify({ fileId: fileId(ref), name, shared })
                });
                if (!response.ok) {
                    throw new Error(await readError(response));
                }
                return `${PREFIX}${(await response.json()).fileId}`;
            },

            async remove(refs) {
                const fileIds = refs.filter((ref) => this.isDriveRef(ref)).map(fileId);
                if (fileIds.length === 0) {
                    return;
                }
                const response = await fetch(`${endpoint}?action=delete`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", ...authHeaders() },
                    body: JSON.stringify({ fileIds })
                });
                if (!response.ok) {
                    throw new Error(await readError(response));
                }
            },

            // Contenu texte (Bloc-notes) lu par la fonction : le lien public n'autorise pas la lecture par script.
            async readText(ref) {
                const response = await fetch(`${endpoint}?action=text&id=${encodeURIComponent(fileId(ref))}`, { headers: authHeaders(), cache: "no-store" });
                if (!response.ok) {
                    throw new Error(await readError(response));
                }
                return response.text();
            }
        };
    }

    window.Win95DriveContent = { PREFIX, create };
    window.Win95Services?.register?.("Win95DriveContent", window.Win95DriveContent);
})();
