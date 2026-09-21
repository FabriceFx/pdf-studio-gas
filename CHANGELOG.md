# Changelog

Tous les changements notables apportés à ce projet seront documentés dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

## [2.1.4] - 2026-09-21

### Modifié
- **Formulaire PDF :** Les noms de champs sont mis en forme avant affichage. « TxtLieuDisporation » devient « Lieu disporation », « DatDisparition » devient « Disparition », « numSIRET » devient « Num SIRET ». Le préfixe de type est retiré, les mots collés séparés, la capitalisation de phrase française appliquée, et les sigles conservés en capitales. Le nom technique reste accessible en infobulle sur l'étiquette.
- **Formulaire PDF :** La mise en forme est calculée côté serveur, dans `libelleLisible_`, plutôt que dans le navigateur : c'est une fonction pure, et l'y placer la rend vérifiable par le banc.

### Ajouté
- **Configuration :** `CONFIG_WEBAPP.PREFIXES_TECHNIQUES` liste les préfixes retirés, ajustable selon les conventions de nommage. « num » en est délibérément absent : dans un formulaire français il désigne un numéro plus souvent qu'un type, et le retirer ferait perdre du sens.
- **Tests :** `testLibelleLisible_` couvre dix-neuf noms de champs, dont ceux relevés sur un formulaire réel et les formes qui font trébucher la transformation — un mot commençant comme un préfixe, un sigle, un nom hiérarchique. Trente-cinq tests au total.

## [2.1.3] - 2026-09-21

### Ajouté
- **Métadonnées :** `getMetadata` rapporte désormais l'orientation de chaque page dans `pageInfo[].rotation`. `getSize()` de pdf-lib rend les dimensions du MediaBox et ignore l'entrée `/Rotate` : sans cette information, rien ne permettait de savoir comment une page s'affiche réellement.
- **Tests :** `testClassificationErreursHttp_` éprouve le tri des codes HTTP sur seize valeurs, sans aucun appel réseau. Trente-quatre tests au total.

### Corrigé
- **Tests :** `testRotationPages_` vérifiait la rotation en comparant largeur et hauteur, ce qui était un contresens — la rotation ne touche pas le MediaBox. Le test portait donc une fausse accusation contre une implémentation correcte. Il s'appuie maintenant sur l'orientation rapportée, et couvre en plus le caractère cumulatif de la rotation.
- **Tests :** `testPasDeRetentativeSurErreurDefinitive_` exigeait une réponse en moins de cinq secondes. Une défaillance passagère du CDN a déclenché une retentative — le comportement attendu — et fait échouer le test : il mesurait la santé du service tiers, pas la justesse du code. La durée est désormais rapportée sans assertion.

### Modifié
- **Moteur :** Le tri entre échec passager et définitif est extrait dans `estTransitoire_`, afin d'être vérifiable sans réseau.

## [2.1.2] - 2026-09-21

### Corrigé
- **Outils en deux temps :** Choisir un autre document après une lecture laissait les champs du document précédent à l'écran, le bouton proposant d'écrire. Selon les cas, cela produisait une erreur « champ introuvable » ou, si les noms coïncidaient, des valeurs déposées au mauvais endroit sans aucun signalement. La lecture est désormais annulée dès qu'un fichier change.

### Ajouté
- **Tests :** Cinq tests couvrant les fonctions pures de `WebApp.gs` — interprétation d'une saisie de pages, placement d'un élément, construction de l'en-tête et des métadonnées, nom de fichier. Ce sont elles qui interprètent la saisie humaine, et elles étaient jusqu'ici les seules du projet sans aucune couverture. Trente-trois tests au total.
- **Diagnostic :** `diagnostiquerFileDAttente()` vérifie l'hypothèse sur laquelle repose l'application web — que le moteur vide la file des micro-tâches avant de clore l'exécution. `lancerTacheDiagnostic()` et `relireTacheDiagnostic()` éprouvent le cycle complet lancement puis interrogation en deux exécutions, sans passer par le navigateur.

## [2.1.1] - 2026-09-21

### Corrigé
- **Aperçu du filigrane :** L'aperçu ne s'affichait jamais. La détection de pdf.js interrogeait `window['pdfjs-dist/build/pdf']`, qui est le nom de module AMD et non la globale du navigateur : la condition restait toujours vraie, un script était réinjecté à chaque fichier choisi, et le rendu échouait sur un objet indéfini. La globale correcte est `window.pdfjsLib`.
- **Aperçu du filigrane :** L'aperçu ne correspondait pas au document produit dès que l'angle n'était pas nul. pdf-lib pivote un élément autour de son point d'ancrage, CSS autour de son centre : `transform-origin` est désormais aligné sur le coin inférieur gauche.
- **Avertissement hors page :** Le contrôle ignorait la rotation et laissait passer un filigrane incliné sorti de la page. Le rectangle englobant est maintenant calculé après rotation.
- **Journalisation :** Un commentaire JSDoc orphelin, laissé par l'ajout de `avertirSiPoliceVolumineuse_`, est replacé sur la méthode qu'il décrit.

### Ajouté
- **Outillage :** Fichier `.claspignore`. Sans lui, `clasp push` tentait d'envoyer `node_modules` — plus d'un millier de fichiers en `.js`, `.html` et `.json` depuis l'installation de jsdom.
- **UI :** Style propre au curseur d'opacité, qui conservait jusqu'ici l'apparence native du navigateur.

### Modifié
- **UI :** L'aiguillage des champs de type curseur se fait sur le type et non sur le nom du champ.
- **UI :** La hauteur de l'aperçu s'adapte à la fenêtre, au lieu de 400 px fixes qui imposaient un défilement permanent sur portable.
- **Outillage :** `.gitignore` exclut `node_modules`, les polices et les sorties d'essai.

## [2.1.0] - 2026-09-20

### Ajouté
- **UI/UX :** Le nom technique des champs de formulaire extraits est désormais nettoyé et rendu lisible (suppression des index et traits de soulignement, ajout de majuscules).
- **Filigrane :** Ajout d'une option d'opacité (1 à 100%) réglable par curseur, avec un aperçu dynamique en temps réel avant application.

### Modifié
- **Filigrane :** Le texte ou l'image est dorénavant appliqué avec une opacité par défaut (25%) pour créer un véritable effet d'arrière-plan grisé plutôt qu'une superposition opaque.

## [2.0.0] - 2026-09-20

### Ajouté
- **Web App (Nouveau) :** Création de l'interface utilisateur autonome complète de type "Single Page Application" (SPA), avec modales natives HTML5 (`<dialog>`) et un habillage conforme aux interfaces Google Workspace.
- **Moteur Asynchrone :** Mise en place d'un système de jetons par `CacheService` pour contourner la limite de temps de 6 minutes de Google Apps Script.
- **Gestion Google Drive :** Basculement automatique du téléchargement vers Google Drive pour les fichiers dépassant 4 Mo (limite des transferts Base64 via `google.script.run`).
- **Sécurité :** Nettoyage automatique des fichiers temporaires (Trash) déposés sur Drive lors des traitements lourds (comme l'application d'images dans un filigrane).

### Modifié
- **Architecture :** Refonte majeure séparant strictement le moteur de traitement PDF (`PDFApp.gs`) et le contrôleur de l'application Web (`WebApp.gs`).
