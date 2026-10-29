# Cahier des charges — Configurateur 3D de vêtements

Oct 28, 2026 · @Mr Slase

> **Statut au 28 oct. 2026 : V1 terminée.** La seule évolution restante est la persistance des données sur un serveur, prévue en **V2** (section 15). Le bilan de la V1 est en section 14.

## 1. Contexte et objectif

L'app permet de concevoir un tee-shirt ou un sweater en 3D (type, coupe, couleur, logo, texte, image), de le voir sous tous les angles, puis d'exporter un aperçu et une fiche de fabrication pour l'atelier d'impression.

Techniquement, c'est un **configurateur de produit 3D** : l'app ne génère pas de 3D par IA, elle applique couleurs et visuels sur des modèles 3D de vêtements déjà prêts.

**Hypothèse de départ** : la première version est un outil personnel, sans comptes ni paiement. L'architecture doit toutefois permettre d'ajouter plus tard des comptes clients et des commandes sans tout réécrire.

Nom de l'app : **Slase Custom 3D** (« Slase Custom » là où la place manque : icône d'écran d'accueil, en-tête mobile).

## 2. Périmètre

La première version couvre le tee-shirt en coupes normale et oversize, avec impression sur tout le vêtement (devant, dos, manches). Le sweater est prêt techniquement mais affiché « bientôt disponible ».

| Livré en V1 | Prévu en V2 | Plus tard (hors périmètre) |
| --- | --- | --- |
| Tee-shirt ; sweater affiché « bientôt disponible » | Comptes et connexion | Autres vêtements (hoodie, polo, casquette) |
| Coupes normale et oversize | Créations enregistrées sur un serveur (Supabase : PostgreSQL, Auth, Storage) | Tailles détaillées S à XXL avec guide des tailles |
| Palette de couleurs du tissu | Synchronisation entre appareils | Textures de tissu (chiné, délavé) |
| Zones devant, dos, manche gauche, manche droite | Images importées stockées sur le serveur | Col, broderie |
| Emplacements standard (poitrine, grand dos, épaule…) | Reprise des créations du navigateur dans le compte | Génération de visuels par IA |
| Ajout de logo, image et texte : déplacer, redimensionner, pivoter | | Panier, paiement, commandes |
| Contrôles qualité (résolution, contraste, fond plein, emplacement) | | |
| Exports : aperçus PNG, fiche PDF, sources, `.json`, modèle 3D `.glb` | | |
| Réalité augmentée sur iPhone et iPad (Quick Look, USDZ) | | |
| Sauvegarde des créations dans le navigateur | | |

## 3. Stack technique

Application web en Next.js, sans backend dans la première version : tout tourne dans le navigateur, sur ordinateur comme sur mobile.

| Besoin | Choix | Pourquoi |
| --- | --- | --- |
| Application | Next.js (App Router) + TypeScript | Stack maîtrisée, déploiement Vercel |
| Scène 3D | Three.js via React Three Fiber + `@react-three/drei` | Rendu 3D déclaratif en React |
| Logo et texte sur le tissu | `Decal` de drei (projection qui suit les plis) | Pas besoin de toucher à la texture du modèle |
| Texte | Texte dessiné dans un canvas 2D puis appliqué comme décalque | Même traitement que les images |
| État de l'éditeur | Zustand, avec annuler / rétablir | Léger, simple à sérialiser |
| Interface | Tailwind CSS | Rapide, cohérent avec les tokens |
| Sauvegarde | IndexedDB dans le navigateur | Pas de serveur dans la première version |
| Export PDF | jsPDF côté navigateur | Fiche de fabrication sans serveur |

Claude Code choisit les versions stables actuelles de chaque paquet, les fixe dans `package.json` et me montre la liste avant l'installation.

Pour la suite (comptes et commandes), un backend pourra s'ajouter sans changer le front : le format d'une création (section 9) est déjà un JSON prêt à être envoyé à une API. **Décision du 28 oct. 2026** : la V2 utilise Supabase (PostgreSQL, comptes, stockage de fichiers) plutôt qu'un backend Laravel à héberger. Voir la section 15.

## 4. Modèles 3D

Il faut **4 modèles distincts** : tee-shirt normal, tee-shirt oversize, sweater normal, sweater oversize. Une coupe oversize change la forme (épaules tombées, manches et corps plus larges, longueur différente) : on ne l'obtient pas en agrandissant le modèle normal.

Exigences pour chaque modèle :

- Format **GLB** (glTF binaire), sous 5 Mo après compression.
- **Dépliage UV propre** : devant, dos et manches séparés sur la carte UV, sans chevauchement.
- Le matériau du tissu est un seul matériau nommé `fabric`, dont l'app change la couleur.
- Une orientation commune : le vêtement face à l'axe Z, le haut du col à la même hauteur pour les 4 modèles.
- **Une licence qui autorise l'usage commercial**, notée dans `public/models/LICENSES.md` avec la source.

Source des modèles : `[TBD]`, achat, banque de modèles libres ou création dans Blender. En attendant, Claude Code développe avec **un modèle provisoire** (un tee-shirt libre de droits, ou une forme simple) derrière la même interface de chargement, pour que le remplacement se fasse sans toucher au code.

Un fichier `garments.json` décrit chaque modèle : chemin du GLB, nom du matériau, et position des zones d'impression (section 6).

## 5. Fonctionnalités

L'éditeur tient sur un seul écran : la scène 3D au centre, les réglages du vêtement d'un côté, les éléments ajoutés de l'autre (en panneau du bas sur mobile).

### Le vêtement

- **Type** : tee-shirt ou sweater.
- **Coupe** : normale ou oversize. Changer de coupe garde les éléments placés, repositionnés dans leur zone.
- **Couleur du tissu** : une palette définie dans `colors.json` (nom + code hexadécimal), modifiable sans toucher au code. Liste des couleurs : `[TBD]`.

### Les éléments

- **Logo ou image** : import PNG, JPG ou SVG. Le PNG transparent est recommandé dans l'interface.
- **Texte** : saisie, police (une courte liste de polices libres), couleur, graisse, alignement.
- Chaque élément est rattaché à **une zone** (devant ou dos) et ne peut pas en sortir.
- Manipulation : déplacer, redimensionner, pivoter, à la souris ou au doigt, et par champs numériques en **centimètres réels**.
- Ordre des calques, dupliquer, supprimer, masquer.
- Annuler / rétablir, avec Ctrl+Z et Ctrl+Y sur ordinateur.

### La vue

- Rotation libre et zoom de la caméra, plus des vues rapides : face, dos, trois-quarts.
- Un fond neutre, clair ou sombre, pour juger le contraste.
- L'étiquette « Aperçu indicatif, les couleurs imprimées peuvent varier » reste visible.

### Les créations

- Sauvegarde automatique dans le navigateur, liste des créations, renommer, dupliquer, supprimer.
- Export et import d'une création en fichier `.json`, pour la sauvegarder ailleurs ou la transmettre.
- À partir de 6 créations : recherche (nom et texte imprimé), filtres par vêtement, coupe et couleur, tri (voir section 16).

## 6. Zones d'impression et contrôles qualité

Les dimensions des zones dépendent de l'atelier et de sa technique d'impression : elles ne sont pas fixées dans le code mais lues dans `print-zones.json`, à remplir avec l'atelier.

| Zone | Repère de position | Largeur max (cm) | Hauteur max (cm) |
| --- | --- | --- | --- |
| Devant, tee-shirt | depuis le bas du col, sur l'axe central | `[TBD]` | `[TBD]` |
| Dos, tee-shirt | depuis le bas du col, sur l'axe central | `[TBD]` | `[TBD]` |
| Devant, sweater | depuis le bas du col, sur l'axe central | `[TBD]` | `[TBD]` |
| Dos, sweater | depuis le bas du col, sur l'axe central | `[TBD]` | `[TBD]` |

Technique d'impression : `[TBD]` (sérigraphie, DTF, flex…). Tant que les valeurs manquent, l'app affiche la zone en pointillés avec la mention « dimensions à confirmer ».

Décision du 29 octobre 2026 : les pointillés de la zone ne s'affichent que **pendant qu'un élément bouge** (glisser, redimensionner, tourner), et seulement pour la zone de cet élément. Au repos, ils sont masqués ; sur un lien partagé, ils ne s'affichent jamais. Ils restent absents des aperçus exportés et de la fiche.

Contrôles automatiques, affichés en avertissement sans bloquer :

- **Résolution** : la résolution effective d'une image se calcule à sa taille d'impression. En dessous du seuil (300 dpi par défaut, modifiable), avertissement « l'image sera floue à cette taille » avec la taille maximale conseillée.
- **Dépassement** : un élément ne peut pas sortir de sa zone ; il est bloqué au bord.
- **Contraste** : avertissement si la couleur d'un texte est trop proche de celle du tissu.
- **Fond non transparent** : avertissement si une image a un fond plein, qui serait imprimé comme un rectangle.

## 7. Exports

Un bouton « Exporter » produit un dossier ZIP qui contient tout ce dont l'atelier a besoin.

1. **Aperçus PNG** : face, dos et trois-quarts, en 2048 px de large, sur fond clair et sur fond transparent.
2. **Fiche de fabrication PDF** (format A4), une page par zone imprimée :
   - type de vêtement, coupe, couleur du tissu (nom + code) ;
   - un schéma à plat de la zone avec chaque élément coté en **centimètres** : distance au bas du col, distance à l'axe central, largeur, hauteur, rotation ;
   - pour chaque élément : type, nom du fichier source, résolution effective en dpi, police et couleur pour un texte ;
   - les avertissements non résolus (section 6) ;
   - la mention « Aperçu indicatif » et la date ;
   - depuis le 29 octobre 2026 : le contenu réel de chaque élément dans le schéma, des pastilles numérotées (nom, dimensions, rotation, position), l'aperçu 3D du côté concerné, des échantillons de couleur, l'encombrement total, une barre d'échelle, un cadre « Notes de l'atelier · validation » et la référence de la création en pied de page (détail en section 16).
3. **Fichiers sources** : chaque image importée dans sa résolution d'origine, et chaque texte rendu en PNG transparent à 300 dpi à sa taille d'impression.
4. **La création en `.json`**, pour la rouvrir plus tard.

Le schéma de la fiche reprend le style des plans cotés (monochrome, cotes avec flèches). Le skill `app-blueprint` peut servir de référence pour ce rendu.

## 8. Écrans et parcours

L'app compte trois écrans (mes créations, choix du vêtement, éditeur 3D) et une fenêtre d'export. L'éditeur est le cœur : on y revient après chaque ajout.

&#91;embedded content: parcours de création · 6 étapes\]

Les maquettes détaillées (états, cotes, composants) sont produites en phase 1 avec le skill `app-blueprint`, à partir de ce cahier des charges.

## 9. Architecture du code

La configuration (vêtements, couleurs, zones) vit dans des fichiers JSON, séparée du code, pour qu'on puisse ajouter une couleur ou corriger une zone sans programmer.

```text
configurateur-3d/
├── CLAUDE.md
├── CAHIER_DES_CHARGES.md
├── docs/maquettes/                 feuilles produites par app-blueprint (phase 1)
├── public/models/                  4 fichiers GLB + LICENSES.md
├── config/
│   ├── garments.json               modèles, matériau, zones
│   ├── print-zones.json            dimensions réelles en cm (atelier)
│   ├── colors.json                 palette du tissu
│   └── fonts.json                  polices disponibles
└── src/
    ├── app/                        pages Next.js : accueil, éditeur, mes créations
    ├── features/scene/             vêtement 3D, caméra, décalques
    ├── features/editor/            panneaux, calques, manipulation
    ├── features/export/            PNG, PDF, ZIP
    ├── features/storage/           IndexedDB, import/export JSON
    ├── lib/units.ts                conversions cm ↔ unités 3D ↔ px
    ├── lib/quality.ts              résolution, contraste, transparence
    └── store/design.ts             état Zustand + historique
```

Format d'une création : toutes les positions sont stockées en **centimètres réels**, jamais en pixels écran ni en unités 3D. C'est ce qui rend la fiche de fabrication exacte.

```json
{
  "id": "uuid",
  "name": "Tee SLASE noir",
  "garment": "tshirt",
  "fit": "oversize",
  "color": "noir",
  "elements": [
    {
      "id": "uuid", "kind": "image", "zone": "front",
      "x_cm": 0, "y_cm": 8, "width_cm": 10, "rotation_deg": 0,
      "asset": "logo.png", "source_px": [2000, 800]
    },
    {
      "id": "uuid", "kind": "text", "zone": "back",
      "text": "Abidjan", "font": "[TBD]", "color": "#ffffff",
      "x_cm": 0, "y_cm": 12, "width_cm": 22, "rotation_deg": 0
    }
  ],
  "updated_at": "2026-10-28T14:00:00Z"
}
```

`x_cm` se mesure depuis l'axe central, `y_cm` depuis le bas du col. Les valeurs de l'exemple illustrent le format. Le ZIP d'export utilise une bibliothèque légère côté navigateur (JSZip ou équivalent).

## 10. Phases

Le projet avance en 6 phases ; Claude Code s'arrête à la fin de chacune et attend ta validation. La phase 3, la scène 3D, porte le plus de risque technique : c'est là qu'on vérifie la fluidité sur mobile.

&#91;embedded content: phases du projet · 6 phases, 6 validations\]

Les vrais modèles 3D n'arrivent qu'en phase 6 : jusque-là, tout se développe sur un modèle provisoire, pour ne pas bloquer le projet en attendant leur achat ou leur création.

## 11. Critères d'acceptation

La première version est livrée quand chaque case est vérifiée, sur ordinateur et sur un téléphone Android de milieu de gamme.

État au 28 oct. 2026, vérifié dans un navigateur automatisé (ordinateur 1440 px et mobile 390 px) :

- [x] Les combinaisons se chargent et changent de couleur sans délai perceptible. Vérifié pour les 2 tee-shirts ; les 2 sweaters se chargent aussi, mais sont masqués (« bientôt disponible »).
- [x] Un logo PNG placé au devant suit la forme du tissu, sans étirement visible.
- [x] Un texte se crée, se modifie et reste net à l'écran comme à l'export (texte exporté à 300 dpi).
- [x] Un élément ne peut pas sortir de sa zone.
- [x] Changer de coupe garde les éléments dans leur zone (et sur leur emplacement).
- [x] L'avertissement de résolution apparaît pour une image trop petite et indique la taille maximale conseillée.
- [x] Les cotes en cm de la fiche PDF correspondent aux valeurs saisies (reprises telles quelles, au dixième).
- [x] Le ZIP contient les aperçus, la fiche, les fichiers sources et le `.json` (plus le modèle 3D `.glb`).
- [x] Une création exportée en `.json` puis réimportée est identique (comparaison octet par octet).
- [ ] La scène tourne à au moins 30 images/s sur le téléphone de test. **À vérifier sur un vrai téléphone** (Android de milieu de gamme et iPhone 12 mini).
- [x] Annuler / rétablir fonctionne sur les actions de l'éditeur (Ctrl+Z / Ctrl+Y et boutons).
- [x] Aucune erreur dans la console du navigateur (seul reste un avertissement d'obsolescence interne à la bibliothèque 3D).

## 12. Contraintes

- **Performance mobile** : modèles compressés, textures de 2048 px maximum, rendu limité quand rien ne bouge.
- **Données** : les images importées restent dans le navigateur ; rien n'est envoyé à un serveur dans la première version. Cette contrainte est levée en V2 (section 15), avec les précautions qui s'imposent.
- **Licences** : chaque modèle 3D et chaque police a une licence compatible avec un usage commercial, listée avec sa source.
- **Windows** : scripts npm compatibles Windows (PowerShell) ; aucune commande bash obligatoire.
- **Accessibilité** : tous les réglages accessibles au clavier, cibles tactiles d'au moins 44 px, mouvement réduit respecté pour les animations de caméra.
- **Langue** : interface en français ; textes regroupés dans un fichier pour une traduction future.
- **Pas de valeur inventée** : ce qui dépend de l'atelier ou de mes choix reste `[TBD]` dans la config, et l'app l'affiche comme tel.

## 13. CLAUDE.md et prompt de lancement

Créer un dossier vide `configurateur-3d`, y enregistrer ce document en `CAHIER_DES_CHARGES.md` (export Markdown), puis y copier le bloc ci-dessous dans `CLAUDE.md`.

Pour que Claude Code dispose du skill de maquettes, copier aussi le fichier `SKILL.md` d'`app-blueprint` dans `configurateur-3d/.claude/skills/app-blueprint/`.

```markdown
# Configurateur 3D de vêtements — instructions pour Claude Code

## Référence
CAHIER_DES_CHARGES.md fait foi. En cas de doute ou de contradiction,
arrête-toi et pose-moi la question avant d'agir.

## Méthode
- Travaille phase par phase (section 10). À la fin de chaque phase :
  résumé de 5 lignes maximum (fait, fichiers, points ouverts), puis
  attends ma validation.
- Montre-moi la liste des paquets npm avant de les installer.
- Phase 1 : utilise le skill app-blueprint pour les maquettes.
- Scène 3D et interface : appuie-toi sur les skills immersive-3d-web
  et event-micro-animations quand ils sont disponibles ; vérifie le
  rendu avec visual-qa.

## Règles
- Toute position d'élément est stockée en centimètres réels.
- Les dimensions d'impression, couleurs et polices viennent de config/.
  Jamais de valeur codée en dur, jamais de valeur inventée : [TBD].
- Les modèles 3D sont chargés via garments.json ; un modèle
  provisoire doit pouvoir être remplacé sans toucher au code.
- Aucune donnée envoyée à un serveur.
- Scripts compatibles Windows.

## Vérification avant de rendre une phase
- npm run build sans erreur, aucune erreur console.
- Test sur largeur mobile (390 px) et ordinateur (1440 px).
- Les critères de la section 11 concernés par la phase sont cochés.

## Langue
Réponses et interface en français ; code et noms de fichiers en anglais.
```

Ouvrir ensuite Claude Code dans ce dossier et coller :

```text
Lis CAHIER_DES_CHARGES.md et CLAUDE.md en entier.

Commence par la phase 1 uniquement : avec le skill app-blueprint,
produis l'inventaire des écrans, le parcours, les composants et les
feuilles cotées dans docs/maquettes/.

Liste aussi les [TBD] du cahier des charges que je dois trancher.
Arrête-toi ensuite et attends ma validation.
```

## 14. Bilan de la V1

La V1 est terminée le 28 octobre 2026. Elle suit ce cahier des charges, avec les évolutions ci-dessous, décidées en cours de projet.

### Évolutions par rapport au cahier initial

| Sujet | Cahier initial | V1 livrée |
| --- | --- | --- |
| Zones d'impression | Devant et dos, dimensions de l'atelier `[TBD]` | Devant, dos et les deux manches ; l'atelier imprime sur tout le vêtement (`full_garment` dans `config/print-zones.json`), il n'y a donc plus de dimensions à confirmer |
| Placement | Libre, en cm | Libre, plus 12 emplacements standard (poitrine gauche et droite, centre poitrine, grand devant, nuque, haut du dos, grand dos, bas du dos, logos d'épaule, texte le long du bras) choisis sur un plan, avec aimant ; valeurs dans `config/placements.json` |
| Sweater | Inclus | Prêt (modèles, zones, emplacements) mais affiché « bientôt disponible » : drapeau `coming_soon` dans `config/garments.json` |
| Exports | PNG, PDF, sources, `.json` | En plus : modèle 3D `.glb` (bouton et ZIP) ; réalité augmentée Quick Look (USDZ) sur iPhone et iPad |
| Réalité augmentée | Plus tard | Livrée sur iPhone et iPad |
| Interface | Sobre, couleurs `[TBD]` | Style « Liquid Glass » (verre translucide, gouttes d'eau à l'appui), accent turquoise du logo SLASE, icônes SVG ; mouvement et transparence réduits respectés |
| Nom | `[TBD]` | Slase Custom 3D, logo SLASE, icône « S » |

### Modèles 3D

- **Tee-shirts normal et oversize** : modèles meshy.ai, préparés par `scripts/prepare-model.mjs`.
- **Sweater normal** : modèle OBJ converti par `scripts/convert-obj.mjs`.
- **Sweater oversize** : dérivé du tee-shirt oversize par `scripts/derive-sweater.mjs`.

### Points ouverts avant une mise en production

Ils ne bloquent pas l'usage de l'app, mais ils touchent l'exactitude de la fiche ou les droits d'usage.

- **Échelle des modèles** : la longueur réelle de chaque vêtement (aujourd'hui provisoire : 72 cm normal, 78 cm oversize) règle l'exactitude des cotes en cm. L'app l'affiche comme « à confirmer ».
- **Licence Meshy** : formule gratuite (CC BY 4.0, crédit obligatoire) ou payante. À reporter dans `public/models/LICENSES.md`. La source et la licence du modèle OBJ du sweater sont aussi `[TBD]`.
- **Polices** : les polices actuelles sont des polices système provisoires ; il faut une liste de polices libres pour un usage commercial (`config/fonts.json`).
- **Palette du tissu** : blanc, noir et rose clair, provisoires (`config/colors.json`).
- **Technique d'impression** : `[TBD]` dans `config/print-zones.json` (indiquée sur la fiche).
- **Fluidité sur téléphone** : 30 images/s à vérifier sur un vrai appareil (critère de la section 11).

## 15. V2 — Persistance des données sur un serveur

La V1 garde tout dans le navigateur (IndexedDB) : une création n'existe que sur l'appareil où elle a été faite, et disparaît si les données du navigateur sont effacées. La V2 ajoute un serveur pour conserver et retrouver ses créations partout.

### Objectifs

- **Comptes** : se connecter avec Google, se déconnecter, supprimer son compte.
- **Créations enregistrées sur le serveur** : la sauvegarde automatique envoie la création au serveur ; la liste « Mes créations » vient du compte.
- **Synchronisation entre appareils** : une création commencée sur ordinateur se reprend sur téléphone.
- **Images sur le serveur** : les images importées sont stockées avec la création, dans leur résolution d'origine.
- **Reprise de l'existant** : à la première connexion, l'app propose d'importer dans le compte les créations déjà présentes dans le navigateur.
- **Hors ligne** : l'éditeur continue de fonctionner sans connexion et synchronise au retour du réseau.

### Ce qui est déjà prêt dans la V1

- **Format de création** : le format JSON (section 9) est indépendant de l'écran, en centimètres réels, et prêt à être envoyé tel quel à une API.
- **Images regroupables** : l'export `.json` regroupe déjà une création et ses images en un seul fichier.
- **Stockage isolé** : toute la lecture et l'écriture des données passe par `src/features/storage/`. C'est le seul module à brancher sur l'API.

### Choix technique : Supabase

Décision du 28 octobre 2026 : la V2 s'appuie sur **Supabase** plutôt que sur un backend Laravel. Supabase fournit d'un seul tenant la base PostgreSQL, les comptes (Auth) et le stockage de fichiers (Storage). Il n'y a aucun serveur à héberger ni à maintenir, et le front Next.js parle directement à Supabase. Un backend sur mesure (Laravel ou fonctions Supabase) pourra s'ajouter plus tard sur la même base PostgreSQL, si les commandes et le paiement arrivent.

| Projet Supabase | |
| --- | --- |
| Nom | `slase-custom-3d` |
| Identifiant | `tcxsfoeyfrcuyztxgwvo` |
| Organisation | ezechielSeboua's Org, **formule gratuite** (la même que Bibliolingo) |
| Région | Paris (`eu-west-3`) |
| Base | PostgreSQL 17 |
| Tableau de bord | https://supabase.com/dashboard/project/tcxsfoeyfrcuyztxgwvo |

### Architecture

```text
Navigateur (Next.js, inchangé)
  ├─ IndexedDB : copie locale, l'app reste utilisable hors ligne
  └─ supabase-js ──► Supabase (Paris)
                      ├─ Auth : comptes
                      ├─ PostgreSQL : créations et métadonnées des images
                      └─ Storage : images d'origine et miniatures (espace privé)
```

### Modèle de données

- **Table `designs`** : une ligne par création. `id` (identifiant de la création, le même que dans l'app), `user_id` (propriétaire), `name`, `garment`, `fit`, `data` (la création complète au format JSON de la section 9), `created_at`, `updated_at`, `deleted_at`. Une création supprimée garde une ligne marquée `deleted_at`, pour que la suppression se propage aux autres appareils.
- **Table `assets`** : une ligne par image importée. `id`, `user_id`, `name`, `type`, `width`, `height`, `opaque_background`, `vector`, `path` (emplacement dans Storage), `created_at`.
- **Storage, espace privé `designs`** : `{user_id}/assets/{asset_id}` pour les images d'origine, `{user_id}/thumbs/{design_id}-front.png` et `-back.png` pour les miniatures.

Le schéma est appliqué par migrations SQL, relues avant application.

### Sécurité

- **Règles d'accès (Row Level Security)** activées sur `designs` et `assets` : un utilisateur ne lit, crée, modifie et supprime que ses propres lignes (`user_id = auth.uid()`).
- **Storage** : l'espace `designs` est privé, et un utilisateur n'accède qu'aux fichiers de son dossier (`{user_id}/…`).
- **Clés** : seule la clé publique (« publishable ») est utilisée dans le navigateur ; la sécurité repose sur les règles d'accès. La clé d'administration (« service role ») ne quitte jamais le serveur et n'apparaît pas dans le code de l'app.
- **Configuration** : l'URL du projet et la clé publique sont dans `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`), non versionné.

### Synchronisation

- **D'abord en local** : l'app écrit dans IndexedDB comme en V1, puis envoie les changements à Supabase en arrière-plan.
- **Hors ligne** : les changements attendent dans une file locale et partent au retour du réseau.
- **Conflits** (décision du 29 oct. 2026) : la dernière modification gagne (comparaison de `updated_at`), sans demander à l'utilisateur. La sauvegarde reste automatique, comme décrit plus haut.
- **Images** : envoyées une fois, à l'import ; une image déjà présente sur le serveur n'est pas renvoyée.
- **Reprise de l'existant** : à la première connexion, l'app propose d'importer dans le compte les créations déjà présentes dans le navigateur.

### Côté app

- **Paquets** : `@supabase/supabase-js` et `@supabase/ssr`. La liste des versions sera montrée avant installation.
- **Nouveaux écrans** : connexion (Google), menu « Mon compte » (déconnexion, suppression du compte), page de partage en lecture seule.

### Connexion

Décision du 29 octobre 2026 (remplace celle du 28 oct.) : **Google seulement**. Un clic, sans mot de passe. Il n'y a ni création de compte par e-mail, ni mot de passe, ni « mot de passe oublié », donc aucun e-mail à envoyer et aucun service d'envoi à brancher. La méthode « e-mail et mot de passe » est désactivée dans le tableau de bord Supabase (Authentication → Providers → Email).

À mettre en place :

- **Google** : créer un identifiant OAuth (« application Web ») dans la Google Cloud Console, avec l'adresse de retour `https://tcxsfoeyfrcuyztxgwvo.supabase.co/auth/v1/callback`, puis saisir l'identifiant et le secret dans le tableau de bord Supabase (Authentication → Providers → Google). Le secret ne va jamais dans le code de l'app.
- **Adresses autorisées** : déclarer l'adresse de l'app (développement et production) dans Authentication → URL Configuration, pour les retours de connexion.
- **Module de stockage** : `src/features/storage/` passe d'IndexedDB seul à IndexedDB + Supabase. L'éditeur, la scène 3D et les exports ne changent pas.

### Formule gratuite

- **Quota de projets** : la formule gratuite permet deux projets actifs ; ils sont tous les deux utilisés (Bibliolingo et slase-custom-3d).
- **Mise en pause** : un projet gratuit inactif plusieurs jours est mis en pause, et se réactive depuis le tableau de bord. Ça ne gêne pas le développement, mais c'est à prévoir pour une mise en ligne publique.
- **Limites** : la base, le stockage et la bande passante sont limités. Les images en haute résolution consomment le plus. Les quotas à jour sont sur la page tarifs de Supabase.

### Étapes de réalisation

1. **Base** : tables, règles d'accès et espace de stockage, par migration SQL relue avant application.
2. **Comptes** : connexion Google, menu « Mon compte », suppression du compte et de tous ses fichiers.
3. **Synchronisation** : envoi et réception des créations et des images, file hors ligne, propagation des suppressions.
4. **Reprise des créations locales** à la première connexion.
5. **Partage par lien** en lecture seule.
6. **Vérifications** : un compte ne voit jamais les données d'un autre, la synchronisation entre deux appareils, le hors ligne, le partage (lecture seule, lien désactivable), la page de mentions sur les données personnelles.

### État d'avancement (29 octobre 2026)

- **Étapes 1 à 5 : faites.** Base et règles d'accès (migrations `v2_designs_assets_storage` et `v2_shares`), connexion Google, « Mon compte », suppression du compte (fonction `delete-account`), synchronisation avec file hors ligne, reprise des créations locales, partage par lien (fonction `shared-design`), photo de profil.
- **Étape 6 : à faire**, une fois la connexion Google branchée dans le tableau de bord Supabase : tests à deux appareils, hors ligne, partage de bout en bout, rendu de « Mon compte » sur téléphone.
- **Réglages à faire dans les tableaux de bord** : identifiant OAuth Google, désactivation de la connexion par e-mail, adresses autorisées (développement et production).
- **Limites connues** : les images qui ne servent plus restent sur le serveur (pas encore de nettoyage) ; un même fichier `.json` importé dans deux comptes reste bloqué en erreur de synchronisation dans le second ; à la déconnexion, les créations du compte restent stockées dans le navigateur, masquées mais pas effacées.

### Données personnelles

Décision du 29 octobre 2026 : les données (créations, images, miniatures) sont conservées **tant que le compte existe**. La suppression du compte efface définitivement ses lignes et tous ses fichiers dans Storage. Elle passe par la fonction Supabase `delete-account` (source dans `supabase/functions/`), seule à utiliser la clé d'administration ; les créations encore présentes dans le navigateur n'y sont pas touchées. Le texte des mentions (RGPD et loi ivoirienne sur les données à caractère personnel) reste `[TBD]`.

### Partage par lien

Décision du 29 octobre 2026 : un bouton « Partager » crée pour une création un lien secret, désactivable à tout moment. La personne qui ouvre le lien voit la création en 3D, **en lecture seule**, sans compte : elle ne peut ni la modifier, ni la dupliquer, ni l'exporter. Les images restent dans l'espace privé et ne sont servies qu'à travers ce lien. Le détail technique (jeton, lecture côté serveur) est fixé par migration SQL relue avant application.

### Photo de profil

Décision du 29 octobre 2026 :

- **Par défaut**, la photo du compte Google, reçue à la connexion. Sans photo Google, l'initiale de l'adresse.
- **Remplacement** : depuis « Mon compte », l'utilisateur choisit une image sur son appareil. Elle est recadrée au centre en carré et réduite à 256 × 256 px (JPEG) avant l'envoi. « Retirer ma photo » revient à la photo Google.
- **Stockage** : dans l'espace privé `designs`, à `{user_id}/profile/avatar.jpg`, affichée par une adresse signée. Seul l'utilisateur la voit : il n'y a ni catalogue ni page publique (le catalogue est écarté pour l'instant).
- **Suppression** : effacée avec le compte, comme les autres fichiers du dossier de l'utilisateur.
- **Affichage** : pastille du compte dans l'en-tête et page « Mon compte ».

### Contraintes

- **Sécurité** : seules les créations du compte connecté sont accessibles ; les images ne sont pas publiques.
- **Contrainte « aucune donnée envoyée à un serveur »** (section 12) : levée pour la V2. Les images quittent désormais l'appareil, ce qui doit être annoncé clairement à l'utilisateur.

Le panier, le paiement et les commandes restent hors périmètre de la V2.

## 16. Évolutions du 29 octobre 2026 : ergonomie, fiche, accueil, identité

Décidées et livrées en cours de V2, sur la branche `dev`.

### Ergonomie mobile

- **Éditeur** : panneau du bas limité à 46 % de l'écran, scène qui s'agrandit quand le panneau est réduit, poignée de 44 px qu'on peut glisser, bandeau d'aperçu court, bouton « Modèle 3D » posé sur la scène, emplacements en rangée défilante, chaque onglet qui repart du haut.
- **Menus** : sur mobile, les menus (compte, cartes, calques, filtres, tri) s'ouvrent en feuille d'actions opaque en bas de l'écran ; la page est bloquée derrière, comme sous les fenêtres. Sur ordinateur, listes déroulantes opaques.
- **Cibles tactiles** : au moins 40 px pour les choix à onglets, 44 px pour les boutons ; libellés d'au moins 12 px.

### Fiche de fabrication

- **Schéma** : le contenu réel de chaque élément (image d'origine, texte dans sa police et sa couleur), à l'échelle et tourné, sur une zone à la couleur du tissu ; traits en gris clair sur un tissu foncé.
- **Pastilles numérotées** hors de la zone, reliées à chaque élément : nom, largeur × hauteur, rotation, position X et Y.
- **Colonne de droite** : aperçu 3D du côté concerné, échantillon et nom du tissu, encombrement total de la zone, barre d'échelle de 10 cm.
- **Tableau** : ligne de titre sur fond gris, échantillon de la couleur de chaque texte.
- **Bas de page** : cadre « Notes de l'atelier · validation » (bon à tirer, nom, signature) quand la place le permet, référence de la création (8 premiers caractères de son identifiant), date et numéro de page.

### Placement

- **Aimant avec taille** : un élément lâché sur un emplacement standard prend la largeur et la rotation proposées par `config/placements.json` (comme quand on le choisit dans le panneau). Il reprend sa taille de départ s'il quitte l'emplacement sans y être lâché.

### Accueil (« Mes créations »)

- **En-tête** : la marque, « Nouvelle création » et le compte. « Importer .json » passe dans le menu ⋯ à côté du titre.
- **Recherche et tri**, sous le titre, à partir de 6 créations, sans rester fixe au défilement : recherche sur le nom et le texte imprimé (sans accents ni majuscules) ; filtres séparés Vêtement, Coupe, Couleur, avec seulement les valeurs présentes ; tri par date ou par nom, gardé dans le navigateur ; compteur « 4 sur 12 » et message quand rien ne correspond.
- **Synchronisation** : pastille sur la photo de profil (enregistré, en cours, hors ligne ou erreur) et état détaillé dans le menu du compte.

### Compte

- **Connexion** : trois avantages illustrés, note sur les données envoyées en ligne, bouton Google avec indicateur de chargement.
- **« Mon compte »** : profil (photo, nom, adresse, « Connecté avec Google »), synchronisation (nombre de créations, dernière synchronisation, « Synchroniser maintenant »), liens partagés (copier, désactiver), téléchargement de toutes les créations en `.zip`, zone sensible pour la suppression.

### Identité

- **Logo** : nouvel emblème Slase (S dans un anneau), dans `public/brand/slase-emblem.png` ; il remplace le logo SLASE et l'icône « S » dans l'en-tête, les icônes Android et iPhone et l'icône d'onglet. Le nom « Slase Custom 3D » est écrit à côté de l'emblème.
- **Couleur d'accent** : alignée sur l'anneau de l'emblème, `#3caac1` ; version foncée `#287180` pour le texte et le focus (dans `src/app/globals.css`).
- **Sobriété** : pas de bordure ni de couleur ajoutée pour signaler un état (filtre actif, choix) ; l'accent reste réservé à l'action principale et aux éléments déjà prévus.

### Points ouverts

- **Partager** n'est proposé que depuis la liste « Mes créations », pas depuis l'éditeur.
- **Nombre d'ouvertures d'un lien partagé** : pas de limite.
- **Tri sur mobile** : avec plusieurs filtres actifs, le bouton de tri sort de l'écran à droite de la rangée (on le retrouve en la faisant défiler).
- **Zones étendues** : le dessus des épaules et le tour complet des manches demanderaient une nouvelle zone « épaule » ou une projection qui suit le patron du tissu ; à décider avec l'atelier (technique d'impression).
- **Mentions sur les données personnelles** : texte `[TBD]`.
- **Catalogue public d'un utilisateur** : écarté pour l'instant.
