# Charte graphique

Référence pour toute interface ajoutée à la bibliothèque (fenêtre, boîte de dialogue, panneau, composant). Règle d'or : **l'interface doit ressembler à Windows 95, sans exception.**
Avant de créer une classe ou un style, vérifier qu'un composant du §4 ne fait pas déjà le travail.

Sources : `assets/win95.css` (base), `scripts/window-manager/window-manager.css` (fenêtres, dialogues, menus, écran d'arrêt), `scripts/file-explorer/file-explorer-component.css`,
`scripts/notepad/notepad-component.css`, `scripts/window-component/window-component.css`, `scripts/display-properties/display-properties-component.css`.

---

## 1. Règles impératives

1. **Contraste** : texte **noir (`#000`) sur fond gris (`#c0c0c0`) ou blanc**. **Jamais de texte blanc sur fond gris.** Le blanc n'est permis que sur le bleu marine `#000080`
   (sélection, barre de titre, survol de menu) ou sur un fond sombre équivalent. Gris de texte secondaire : `#404040` (`#808080` est réservé aux contours et au texte désactivé).
2. **Toujours déclarer `color` explicitement** : `body.win95-desktop` et `.desktop` héritent du **blanc** (pour les icônes du bureau). Un composant qui n'écrit pas `color: #000`
   affichera du blanc sur gris.
3. **Préfixer les sélecteurs par `body.win95-desktop`** et nommer les classes `composant-element` (`explorer-toolbar`, `display-properties-choice`).
4. **Pas d'angle arrondi**, pas de dégradé ni d'ombre moderne. Seuls dégradés autorisés : barre de titre et bandeau du menu Démarrer. Ombres : uniquement les biseaux et l'ombre
   portée dure `2px 2px 0 rgba(0,0,0,.5)` des fenêtres.
5. **Jamais la couleur seule** pour porter une information : symbole ou mot avec la couleur.
6. **Police** : `"MS Sans Serif", Tahoma, sans-serif`, **12 px** (11 px minimum pour les libellés secondaires). Gras pour les titres de section.
7. **Icônes** : PNG pixelisés de `assets/icons/` (`image-rendering: pixelated`), 16 × 16 (menus, listes, boutons) ou 32 × 32 (bureau). Pas d'icône vectorielle moderne.
8. **Textes en français**, phrases courtes, verbe à l'infinitif sur les boutons (« Enregistrer »), trois points (`…`) si le bouton ouvre une fenêtre qui demande encore quelque chose.
9. **Réutiliser les services** : `Win95Dialog` (confirm / alert / prompt / form), `Win95ContextMenu` (menus et sous-menus), `Win95Utils`. Jamais `alert`, `confirm`, `prompt`
   du navigateur ni une bibliothèque de composants.
10. **Clavier et focus** : tout élément cliquable est un `<button>` (ou un champ) ; focus visible en pointillé noir 1 px ; Échap ferme une fenêtre modale ; Entrée valide le bouton principal.
11. **Animations** : courtes, utiles, respectant `prefers-reduced-motion`.
12. **Versionner les fichiers** chargés dans `index.html` (`?v=`, à incrémenter à chaque modification) et respecter l'ordre de chargement documenté dans le README.

---

> **Exception** : l'écran de démarrage, l'écran bleu et l'écran de veille (`scripts/ambiance/`) reproduisent des écrans plein cadre de Windows 95 (texte clair sur fond sombre) ; ils ne suivent pas les règles de contraste ci-dessus.

## 2. Couleurs

| Rôle | Valeur | Usage |
|---|---|---|
| Fond de bureau | `#008080` | Bureau uniquement (ou fond d'écran choisi) |
| Surface (gris Windows) | `#c0c0c0` | Fenêtres, barres, dialogues, boutons |
| Surface de saisie / liste | `#fff` | Champs, listes, arbre |
| Texte principal | `#000` | Tout texte sur gris ou blanc |
| Texte secondaire | `#404040` | Notes, sous-libellés |
| Texte désactivé | `grey` + ombre `1px 1px #fff` | Boutons désactivés (déjà dans `.btn:disabled`) |
| Sélection, survol de menu | fond `#000080`, texte `#fff` | Élément sélectionné |
| Barre de titre | `linear-gradient(to right, #000080, #1084d0)`, texte `#fff` gras | Titre de fenêtre actif |
| Écran d'arrêt | texte `#ff8c00` sur `#000` | « Vous pouvez maintenant éteindre l'ordinateur » |

---

## 3. Biseaux et bordures (à copier tels quels)

| Élément | CSS |
|---|---|
| **En relief** (bouton, fenêtre) | `border: 2px solid; border-color: #fff #404040 #404040 #fff;` (+ `box-shadow: inset -1px -1px 0 #808080`) |
| **Enfoncé** (champ, liste, zone de contenu, pied de page) | `border: 2px solid; border-color: #808080 #fff #fff #808080;` (+ `inset 1px 1px 0 #404040`) |
| **Champ de saisie** | classe `form-95` : `2px inset #d5d5d5`, fond blanc |
| **Bouton** | classe `btn` (relief, fond `silver`, survol/focus/appui = `inset`) |
| **Cadre de groupe** | `fieldset` + `legend` : `2px groove #fff` |

---

## 4. Composants existants

| Composant | Classes / service | Fichier | Usage |
|---|---|---|---|
| **Fenêtre** | `window desktop-window` + `.window-title-bar` (`.title-bar-text`, `.title-bar-controls`) ; créée par `WindowManager.createWindowElement` | `window-manager.js`, `window-component.css` | Toute application. Redimensionnable, déplaçable. |
| **Corps de fenêtre** | `window-body window-content` | `win95.css` | Conteneur sous la barre de titre (hauteur `calc(100% - 24px)`). |
| **Barre de menus** | `explorer-menu-bar` / `notepad-menu-bar` ; déroulant via `Win95ContextMenu.open` | explorateur, bloc-notes | Fichier / Édition… |
| **Barre d'outils** | `explorer-toolbar` + `btn explorer-btn small-label` + `form-95 explorer-address` | explorateur | Précédent / Parent / Actualiser, adresse. |
| **Arbre** | `explorer-tree`, `tree-node`, `tree-button` (`.active`) | explorateur | Navigation hiérarchique (colonne = 1/4 de la largeur). |
| **Liste d'éléments** | `explorer-list`, `list-grid`, `list-item` (`.selected`, `.details-mode`) | explorateur | Icônes + libellés, vue détails. |
| **Barre d'état** | `explorer-status` / `notepad-status` | explorateur, bloc-notes | Dernière ligne de la fenêtre : message court. |
| **Barre de menus d'application** | `win95-menubar`, `win95-menubar-item` ; `Win95MenuBar.mount(...)` | `win95-menu-bar.js` | Jeu / Édition / ? sous la barre de titre ; survol navy + texte blanc. |
| **Menu contextuel** | `Win95ContextMenu.open(x, y, items)` | `win95-context-menu.js` | Clic droit, sous-menus (`items`). |
| **Boîte de dialogue** | `Win95Dialog.confirm / alert / prompt / form` (`win95-dialog-*`) | `win95-dialog.js` | Questions et saisies. |
| **Boîte « Arrêt de Windows »** | `modal logout-modal` | `window-manager.js` | Menu Démarrer > Arrêter. |
| **Fenêtre de connexion locale / page du téléphone** | `local-link-body`, `local-link-qr` (QR noir sur fond blanc enfoncé, zone de silence comprise), `local-link-phone` + `local-link-phone-window` | `local-link.css` | Application « Connexion locale » ; page de liaison plein écran du téléphone (fenêtre Windows 95 sur fond `#008080`, contenu blanc enfoncé, barre d'état). |
| **Champs de réglages** | `property-field`, `property-field-label`, `property-input` (`form-95`), `property-slider-row` / `property-slider`, `property-choices` / `property-choice` (`.selected`), `property-check`, `property-header`, `property-note` ; **générés** par `Win95PropertyFields` à partir d'une description | `control-panel.css`, `property-fields.js` | Réglages d'un applet : ne pas les écrire à la main, déclarer les champs (`Win95ControlPanel.registerApplet` / `addTab`). |
| **Vignette de choix** | `display-properties-choice` (`.selected`) | `display-properties-component.css` | Choisir un élément parmi plusieurs (fonds d'écran). |

Jeux de cartes et Démineur (`scripts/games/`) : tapis vert `#008000` et cartes blanches arrondies (cartes de jeu, hors règles d'angles de l'interface) ; compteurs rouges sur noir du Démineur. L'interface autour (menus, barre d'état) suit la charte.

Composants propres à une application (Paint : `paint-tool`, `paint-option`, `paint-swatch`) : à documenter ici quand ils sont créés.

---

## 5. Modèle de fenêtre d'application

Barre de titre → barre de menus (`notepad-menu-bar`) → (barre d'outils) → contenu (`#fff` enfoncé ou `#c0c0c0`) → barre d'état.

## 6. Liste de contrôle avant de livrer une interface

- [ ] Aucun texte blanc hors fond `#000080` / barre de titre ; `color: #000` explicite.
- [ ] Composants du §4 réutilisés ; toute nouvelle classe est préfixée `body.win95-desktop` et ajoutée au §4.
- [ ] Biseaux du §3, pas d'angle arrondi, police 12 px (11 px minimum).
- [ ] Un seul bouton principal ; libellés français.
- [ ] Information jamais portée par la couleur seule.
- [ ] Clavier : focus visible, Échap / Entrée ; éléments cliquables = `<button>`.
- [ ] Versions `?v=` mises à jour dans `index.html`.
- [ ] Vérifié à l'écran : rien ne déborde, le texte reste lisible.
