# Changelog

Tous les changements notables apportés à ce projet seront documentés dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

## [2.1.0] - 2026-09-20

### Ajouté
- **UI/UX :** Le nom technique des champs de formulaire extraits est désormais nettoyé et rendu lisible (suppression des index et traits de soulignement, ajout de majuscules).
- **Filigrane :** Ajout d'une option d'opacité (1 à 100%) réglable par curseur, avec un aperçu dynamique en temps réel avant application.

### Modifié
- **Filigrane :** Le texte ou l'image est dorénavant appliqué avec une opacité par défaut (25%) pour créer un véritable effet d'arrière-plan grisé plutôt qu'une superposition opaque.

## [2.0.0] - 2026-09-20

### Ajouté
- **Web App (Nouveau) :** Création de l'interface utilisateur autonome complète de type "Single Page Application" (SPA) avec design Glassmorphism et modales natives HTML5 (`<dialog>`).
- **Moteur Asynchrone :** Mise en place d'un système de jetons par `CacheService` pour contourner la limite de temps de 6 minutes de Google Apps Script.
- **Gestion Google Drive :** Basculement automatique du téléchargement vers Google Drive pour les fichiers dépassant 4 Mo (limite des transferts Base64 via `google.script.run`).
- **Sécurité :** Nettoyage automatique des fichiers temporaires (Trash) déposés sur Drive lors des traitements lourds (comme l'application d'images dans un filigrane).

### Modifié
- **Architecture :** Refonte majeure séparant strictement le moteur de traitement PDF (`PDFApp.gs`) et le contrôleur de l'application Web (`WebApp.gs`).
