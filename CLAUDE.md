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
