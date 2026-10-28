# Brief — Configurateur 3D de vêtements

Source unique : `CAHIER_DES_CHARGES.md` (version du 28 oct. 2026).

```
Nom :               [TBD]
Plateforme :        web responsive (Next.js), ordinateur et mobile — cadres 390 px et 1440 px
Rôles d'utilisateurs : un seul, le propriétaire (outil personnel, sans comptes)
Fonctionnalités principales :
  - choisir le vêtement (tee-shirt / sweater), la coupe (normale / oversize), la couleur du tissu
  - ajouter logo, image, texte sur les zones devant / dos ; déplacer, redimensionner, pivoter (souris, doigt, champs en cm)
  - calques : ordre, dupliquer, supprimer, masquer ; annuler / rétablir
  - vue 3D : rotation, zoom, vues rapides face / dos / 3/4, fond clair / sombre
  - contrôles : résolution, dépassement de zone, contraste, fond non transparent
  - créations : sauvegarde auto (IndexedDB), liste, renommer, dupliquer, supprimer, import / export .json
  - export ZIP : aperçus PNG, fiche de fabrication PDF A4, fichiers sources, .json
Écrans déjà connus : mes créations, choix du vêtement, éditeur 3D, fenêtre d'export
Parcours principaux : nouvelle création → éditeur → export ; rouvrir une création ; importer un .json
Contraintes :
  - interface en français, textes dans un fichier unique
  - clavier partout, cibles tactiles ≥ 44 px, mouvement réduit respecté
  - mobile : Android de milieu de gamme, 30 images/s minimum
  - étiquette « Aperçu indicatif, les couleurs imprimées peuvent varier » toujours visible
  - aucune valeur inventée : dimensions de zones, couleurs, polices = config/ ou [TBD]
Points ouverts : voir index.html, section « À trancher »
```
