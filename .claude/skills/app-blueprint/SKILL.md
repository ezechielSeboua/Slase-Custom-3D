---
name: app-blueprint
description: "Génère les maquettes d'une app mobile ou web à partir d'un brief, en plans cotés monochromes : écrans, états, parcours, composants et tokens CSS, Tailwind, Flutter."
---

# App Blueprint

Transforme un brief d'application en un dossier de maquettes **basse et moyenne fidélité** : des plans cotés monochromes, dans le style des « dimensional drawings » d'Apple, qui fixent la structure (espacements, hiérarchie, comportement FILL / HUG) avant tout travail visuel. Tous les écrans partagent une seule table de variables, exportée ensuite vers le code.

Style inspiré du skill `dimensional-drawing` d'Enes Ozturk (github.com/enesozturk/dimensional-drawing, licence MIT). Ce skill est autonome : il n'a pas besoin de l'original pour fonctionner.

## Quand l'utiliser

- On demande des maquettes, wireframes, zonings ou plans d'écrans pour une app mobile ou web.
- On veut l'inventaire des écrans, le parcours utilisateur ou un premier design system (espacements, rayons, hauteurs).
- On veut coter un écran ou un composant existant décrit par un brief, une capture ou du code.

Ne pas l'utiliser pour la haute fidélité (couleurs de marque, images, animations finales). Une fois les tokens posés, passer le relais à `mobile-ui-upgrade` (Flutter / React Native) ou `animated-ui-upgrade` (React / Next.js).

## Règles absolues

1. **Le brief est la seule source.** N'utilise aucune information venant d'un autre projet, d'une ancienne version du même projet ou de ta mémoire sur l'utilisateur, même si le nom de l'app te semble familier. Si l'utilisateur veut réutiliser quelque chose, il le met dans le brief.
2. **Aucune valeur inventée.** Ce qui n'est ni dans le brief ni déductible d'une règle de ce skill s'écrit `[TBD]`, dans la feuille comme dans les tokens.
3. **Une seule table de variables.** Toute cote vient de `tokens`. Un écran n'invente pas ses propres espacements : s'il en faut un nouveau, il est ajouté à la table avec une note qui le justifie.
4. **L'architecture, pas le contenu.** Les textes et images sont des emplacements nommés (`TITLE SLOT · FILL`), jamais du faux contenu ni du lorem ipsum.

## Étape 1 · Lire le brief

Le brief peut être libre. Ramène-le à cette grille, et montre-la à l'utilisateur :

```
Nom :
Plateforme : mobile | web | les deux   (mobile : iOS, Android ou les deux)
Rôles d'utilisateurs :
Fonctionnalités principales :
Écrans déjà connus :
Parcours principaux :
Contraintes (charte, accessibilité, appareils cibles) :
Points ouverts :
```

S'il manque une information **bloquante** (la plateforme, ou les fonctionnalités), pose **au plus 3 questions**, toutes dans un seul message. Le reste devient `[TBD]` et tu avances.

## Étape 2 · Inventaire des écrans

Un tableau, un écran par ligne :

| ID | Écran | Rôle(s) | Ce qu'il permet | États |
|---|---|---|---|---|

- IDs : `APP-SCR-001`, `APP-SCR-002`… dans l'ordre du parcours principal.
- États à envisager pour chaque écran : vide, chargement, erreur, succès, plus les états propres (permission refusée, hors ligne, en attente de validation…). Ne garde que ceux qui ont un sens pour cet écran.
- N'ajoute pas d'écran que le brief n'implique pas. Un écran déduit (ex. « mot de passe oublié » derrière une connexion) est marqué *(déduit)* pour que l'utilisateur confirme.

## Étape 3 · La table de tokens

Pose la table **avant** de dessiner. Format de référence :

```json
{
  "project": "<nom>",
  "grid": 4,
  "space":  { "S1": 16, "S2": 8, "S3": 24, "S4": 12 },
  "radius": { "R1": 16, "R2": "R1 - B - S1", "R_PILL": "H_CHIP / 2" },
  "size":   { "H_BTN": 48, "H_FIELD": 52, "H_CHIP": 24, "TOUCH_MIN": 44 },
  "border": { "B": 1 },
  "layout": { "W_MAX": 1200, "COLS_MOBILE": 4, "COLS_TABLET": 8, "COLS_DESKTOP": 12 },
  "tbd":    ["shadow.card"]
}
```

- Toutes les valeurs sont des multiples de `grid` (4 par défaut), sauf les bordures.
- Les formules (`R2 = R1 − B − S1`) sont écrites telles quelles et évaluées à l'export. Un coin imbriqué est toujours concentrique : rayon intérieur = rayon extérieur − bordure − marge.
- Cibles tactiles : au moins 44 pour iOS, 48 pour Android. Toute cote inférieure est signalée en note.
- Les valeurs proposées (16, 8, 48…) sont des **propositions** que l'utilisateur valide. Dis-le en une ligne quand tu présentes la table.

## Étape 4 · Les feuilles

Ordre de production :

1. **Feuille de parcours** (`APP-FLW-001`…) : les écrans en boîtes, reliés par des flèches annotées par l'action (« tap Scanner », « erreur réseau »). Les branches (succès / erreur, rôle A / rôle B) sont visibles. Aucun écran isolé.
2. **Feuille de composants** (`UI-BTN-001`, `UI-FLD-001`, `UI-CRD-001`, `UI-TAB-001`…) : chaque composant réutilisable coté **une seule fois** (vue en plan + variantes d'état : normal, appuyé, désactivé, erreur).
3. **Une feuille par écran** (`APP-SCR-###`), qui renvoie aux composants (« voir UI-BTN-001 ») au lieu de les recoter.

### Contenu d'une feuille d'écran

- **Cartouche** en tête : ID, nom, plateforme, cadre, variables clés.
- **Vue en plan cotée**, dans son cadre d'appareil, à l'échelle 1:1 du cadre.
- **Vue éclatée des couches** si l'écran superpose des éléments (barre fixe, bouton flottant, feuille modale, overlay) : L0 fond, L1 surface, L2 contenu, L3 éléments fixes, L4 overlays.
- **Détails A, B, C** : cercles agrandis sur les points délicats (coin imbriqué, zone sûre, cible tactile).
- **Tableau des variables** utilisées par la feuille, avec rôle et valeur ou formule.
- **Notes** numérotées : comportements (défilement, clavier, troncature), états, `[TBD]`.

### Cadres d'appareil

- **Mobile iOS** : 390 × 844. Zone sûre haute 47, basse 34. Zone du pouce : le tiers bas, où vont les actions principales.
- **Mobile Android** : 412 × 915. Barre d'état et barre de navigation dessinées comme zones réservées ; leurs hauteurs sont `[TBD]` si l'appareil cible n'est pas précisé.
- **Web** : trois largeurs, 375, 768 et 1440, sur la même feuille. Montre comment la grille passe de 4 à 8 à 12 colonnes et ce qui se réorganise (navigation, colonnes, cartes).

Ces dimensions sont des références par défaut ; le brief peut en imposer d'autres.

## Conventions de dessin

Monochrome uniquement : on distingue les éléments par l'épaisseur du trait, les pointillés et les hachures, jamais par la couleur.

| Élément | Trait |
|---|---|
| Contour d'objet (carte, bouton, cadre) | plein, 1,5 |
| Sous-objet (media, champ, badge) | plein, 0,8 |
| Emplacement de contenu (slot) | pointillé 4/3, 0,9 |
| Image ou media | rectangle barré de ses deux diagonales, 0,6 |
| Ligne de cote | 0,7, flèches pleines aux extrémités |
| Cotes en chaîne | 0,7, petits traits obliques au lieu de flèches |
| Ligne d'attache | 0,5, gris clair |
| Axe | trait mixte (10/2/2/2) |
| Ombre, overlay, zone réservée | hachures à 45° |
| Appel de détail | cercle pointillé + lettre A, B, C |

Libellés : MAJUSCULES en police condensée, sous la forme `NOM · COMPORTEMENT`. Comportements : `FILL` (prend la place disponible), `HUG` (s'ajuste au contenu), `FIXED` (taille fixe, cotée). Les chiffres sont en police monospace. Une cote affiche la variable, et la valeur quand elle aide : `H3 = 40`.

## Format de sortie

Chaque feuille est une page HTML autonome : HTML et CSS en ligne, SVG pour les dessins, aucune ressource externe obligatoire (les polices ont un repli système), lisible à 390 px comme à 1440 px, en thème clair et sombre.

- **Dans Claude Code** : un dossier `projects/<nom>/` avec `brief.md`, `tokens.json`, `sheets/` (un fichier HTML par feuille, plus un `index.html` qui les liste) et `export/`. Une ancienne version n'est jamais écrasée : elle part dans `projects/<nom>/archive/<AAAA-MM-JJ>/`.
- **Dans l'app Claude (claude.ai)** : un seul artifact HTML « carnet de maquettes », une section par feuille, avec un sommaire et une navigation par ancre (`#inventaire`, `#parcours`, `#composants`, `#scr-001`…). Les exports de tokens y figurent dans des blocs à copier.

### Base CSS et SVG à réutiliser

```html
<style>
:root{
  --paper:#eef0f1; --sheet:#f6f7f8; --ink:#1b1e22; --line2:#4f555c; --line3:#9298a0; --rule:#c4c9ce;
  --cond:"Barlow Condensed","Arial Narrow",Arial,sans-serif;
  --mono:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){
  --paper:#111316; --sheet:#171a1d; --ink:#e4e7ea; --line2:#a6acb3; --line3:#646a72; --rule:#30353a; color-scheme:dark}}
:root[data-theme="dark"]{--paper:#111316; --sheet:#171a1d; --ink:#e4e7ea; --line2:#a6acb3; --line3:#646a72; --rule:#30353a; color-scheme:dark}
body{background:var(--paper);color:var(--ink)}
svg text{font-family:var(--mono);fill:var(--ink)}
.o{fill:none;stroke:var(--ink);stroke-width:1.5}
.o2{fill:none;stroke:var(--ink);stroke-width:.8}
.slot{fill:none;stroke:var(--line2);stroke-width:.9;stroke-dasharray:4 3}
.ph{fill:none;stroke:var(--line3);stroke-width:.6}
.dim{fill:none;stroke:var(--line2);stroke-width:.7}
.ext{fill:none;stroke:var(--line3);stroke-width:.5}
.cen{fill:none;stroke:var(--line3);stroke-width:.5;stroke-dasharray:10 2 2 2}
.call{fill:none;stroke:var(--line2);stroke-width:.8;stroke-dasharray:2 2}
.hatchf{fill:url(#hatch);stroke:var(--line2);stroke-width:.8;stroke-dasharray:4 3}
.cap{font-family:var(--cond)!important;letter-spacing:.08em}
</style>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <marker id="arr" viewBox="0 0 10 10" refX="10" refY="5" markerUnits="userSpaceOnUse" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,1.8 L10,5 L0,8.2 z" fill="var(--line2)"/></marker>
  <marker id="tk" viewBox="0 0 10 10" refX="5" refY="5" markerUnits="userSpaceOnUse" markerWidth="7" markerHeight="7" orient="auto"><path d="M2,8 L8,2" stroke="var(--line2)" stroke-width="1.2"/></marker>
  <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="var(--line3)" stroke-width=".7"/></pattern>
</defs></svg>
```

Une cote : `<line class="dim" x1 y1 x2 y2 marker-start="url(#arr)" marker-end="url(#arr)"/>` entre deux lignes d'attache `.ext`. Une chaîne : une `<polyline class="dim">` avec `marker-start`, `marker-mid` et `marker-end` sur `url(#tk)`.

## Étape 5 · Export des tokens

À partir de la même table, en évaluant les formules. Un `[TBD]` devient un commentaire `TODO`, jamais une valeur.

**CSS** (`tokens.css`) :
```css
:root{ --s1:16px; --s2:8px; --r1:16px; --r2:3px; --h-btn:48px; /* TODO shadow-card */ }
```

**Tailwind** (`tailwind.tokens.js`, à fusionner dans `theme.extend`) :
```js
module.exports = {
  spacing: { s1: '16px', s2: '8px' },
  borderRadius: { r1: '16px', r2: '3px' },
  height: { btn: '48px', field: '52px' },
};
```

**Flutter** (`app_tokens.dart`) :
```dart
import 'package:flutter/material.dart';

class AppTokens {
  static const double s1 = 16;
  static const double s2 = 8;
  static const double r1 = 16;
  static const double r2 = 3; // R1 - B - S1
  static const double hBtn = 48;
  // TODO shadow.card : [TBD]
}

ThemeData appTheme() => ThemeData(
  useMaterial3: true,
  filledButtonTheme: FilledButtonThemeData(
    style: FilledButton.styleFrom(
      minimumSize: const Size.fromHeight(AppTokens.hBtn),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppTokens.r1)),
    ),
  ),
);
```

Ne génère que les cibles utiles au projet : Flutter pour une app Flutter, CSS et Tailwind pour du web, les trois si la stack n'est pas précisée.

## Étape 6 · Vérifier avant de rendre

- [ ] Chaque écran de l'inventaire a sa feuille, et chaque feuille est reliée au parcours.
- [ ] Chaque cote existe dans `tokens` ou est marquée `[TBD]`.
- [ ] Aucune information ne vient d'ailleurs que du brief.
- [ ] Les cibles tactiles inférieures au minimum sont signalées en note.
- [ ] Les libellés et les cotes ne se chevauchent pas ; rien ne déborde du cadre.
- [ ] La page s'affiche à 390 px et à 1440 px, en clair et en sombre.

## Rendu à l'utilisateur

Un message court : ce qui a été produit (nombre d'écrans, de composants, de parcours), la liste des `[TBD]` à trancher, et les valeurs de tokens proposées à valider. Ne recopie pas le contenu des feuilles dans la réponse.
