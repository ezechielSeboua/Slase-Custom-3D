# Licences des modèles 3D

| Fichier | Source | Licence | Usage commercial |
| --- | --- | --- | --- |
| placeholder/*.glb (sauf tshirt-mockup.glb) | Générés par `scripts/make-placeholder-models.mjs` (formes simples, provisoires) | Propriété du projet | Oui |
| tshirt-oversize.glb | meshy.ai, fichier `tshirt-mockup(1).glb` préparé par `scripts/prepare-model.mjs` (échelle provisoire 78 cm) | [TBD] : CC BY 4.0 si généré avec la formule gratuite (crédit « Meshy » obligatoire), propriété privée si formule payante | Oui, sous réserve de la formule |
| tshirt-normal.glb | meshy.ai, fichier `tshirt-mockup(5).glb` préparé par `scripts/prepare-model.mjs` (échelle provisoire 72 cm) | [TBD] : même règle que ci-dessus | Oui, sous réserve de la formule |
| sweater-normal.glb | Fichier OBJ `public/models/sweater/` (source [TBD]), converti par `scripts/convert-obj.mjs` et préparé par `scripts/prepare-model.mjs` (texture retirée, échelle provisoire 72 cm) | [TBD] | [TBD] |
| sweater-oversize.glb | Dérivé de `tshirt-oversize.glb` par `scripts/derive-sweater.mjs` | Même licence que `tshirt-oversize.glb` | Oui, sous réserve de la formule |

`prepare-model.mjs` renomme le matériau en `fabric`, retire la texture de couleur (l'app colore le tissu), garde la texture de relief et place le haut du col à y = 0.

Pour remplacer un modèle ou corriger son échelle : `node scripts/prepare-model.mjs <original.glb> public/models/<nom>.glb <longueur en cm>`, puis reporter les repères affichés dans `config/garments.json`. Garder les originaux Meshy hors de `public/` : ils ne sont pas utilisés par l'app.
