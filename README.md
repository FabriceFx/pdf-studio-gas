# 📄 PDFApplication — bibliothèque Google Apps Script (v2.0)

[🇫🇷 Version Française](#-version-française) | [🇬🇧 English Version](#-english-version)

---

## 🇫🇷 Version Française

> Bibliothèque Google Apps Script pour manipuler des fichiers PDF : export de pages, fusion, découpe, métadonnées, numérotation, en-têtes et pieds de page, formulaires PDF et conversion en images. Elle s'appuie sur pdf-lib, chargée dynamiquement depuis un CDN et mise en cache.

<a href="https://developers.google.com/apps-script"><img src="https://img.shields.io/badge/Google%20Apps%20Script-4285F4?style=for-the-badge&logo=google-apps-script&logoColor=white" alt="Google Apps Script"></a>
<a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-indigo?style=for-the-badge" alt="License: MIT"></a>
<a href="README.md"><img src="https://img.shields.io/badge/Status-Production-brightgreen?style=for-the-badge" alt="Status: Production"></a>

---

### ✨ Fonctionnalités clés

- 📑 **Opérations sur les pages** : export de pages choisies, découpe page par page, réorganisation, fusion de plusieurs documents.
- 🏷️ **Métadonnées** : lecture complète (titre, auteur, dates, dimensions de chaque page) et mise à jour.
- 🔢 **Numérotation** : ajout d'un numéro de page positionnable à gauche, au centre, à droite ou en coordonnées libres.
- 📌 **En-têtes et pieds de page** : jusqu'à trois zones par bandeau, avec alignement et police personnalisée.
- 📝 **Formulaires PDF** : lecture des champs, remplissage, et génération d'un formulaire complet à partir d'un modèle Google Slides.
- 🖼️ **Conversion en images** : chaque page exportée en PNG via Drive, avec nettoyage automatique des fichiers temporaires.
- ⏱️ **Garde-fou d'exécution** : les traitements page par page s'interrompent avec un message explicite avant la limite des 6 minutes d'Apps Script.
- 🌍 **Messages bilingues** : les erreurs remontent en français ou en anglais selon les paramètres régionaux du compte Google.

---

### 🚀 Installation & configuration

1. Créez un projet Google Apps Script et copiez le code source dans quatre fichiers distincts : `Configuration.gs`, `ChargeurLibrairies.gs`, `PDFApp.gs` et `Api.gs`.
2. Remplacez le contenu du manifeste par celui de [appsscript.json](appsscript.json), qui déclare les autorisations nécessaires.
3. Déployez le projet en tant que bibliothèque, puis notez son ID de script.
4. Dans le projet appelant, ajoutez la bibliothèque sous l'identifiant `PDFApplication`.
5. Premier appel : la librairie pdf-lib est téléchargée puis mise en cache pour six heures ; les appels suivants sont sensiblement plus rapides.

---

### 📘 Exemples d'utilisation

```javascript
// Exporter les pages 1, 3 et 5
const blob = DriveApp.getFileById(identifiant).getBlob();
const resultat = await PDFApplication.setPDFBlob(blob).exportPages([1, 3, 5]);

// Lire les métadonnées
const metadonnees = await PDFApplication.setPDFBlob(blob).getMetadata();

// Ajouter un numéro de page centré en bas
const numerote = await PDFApplication
  .setPDFBlob(blob)
  .addPageNumbers({ size: 10, x: "center", y: 20 });

// Fusionner plusieurs documents
const fusionne = await PDFApplication.mergePDFs([blobA, blobB, blobC]);
```

L'état posé par `setPDFBlob`, `useStandardFont` et `useCustomFont` persiste pendant toute l'exécution : appelez `PDFApplication.reinitialiser()` entre deux traitements indépendants.

---

### 🛠️ Structure du projet

- **[Configuration.gs](Configuration.gs)** : constantes `CONFIG`, dictionnaire de traductions, définitions de types.
- **[ChargeurLibrairies.gs](ChargeurLibrairies.gs)** : téléchargement de pdf-lib et fontkit, cache segmenté.
- **[PDFApp.gs](PDFApp.gs)** : le moteur, classe `PDFApp` qui porte toutes les opérations PDF.
- **[Api.gs](Api.gs)** : les fonctions publiques exposées aux projets appelants.
- **[appsscript.json](appsscript.json)** : manifeste et autorisations OAuth.

---

### 👤 Auteur

- **[Fabrice Faucheux](https://faucheux.bzh)** (FF Labs) — [GitHub](https://github.com/FabriceFx)

Cette bibliothèque dérive de **[PDFApp](https://github.com/tanaikech/PDFApp)** de Kanshi Tanaike, publiée sous licence MIT.

---

### 📄 Licence

Ce projet est disponible sous licence **MIT**.

---

---

## 🇬🇧 English Version

> A Google Apps Script library to work with PDF files: page export, merging, splitting, metadata, page numbering, headers and footers, PDF forms and image conversion. It builds on pdf-lib, loaded dynamically from a CDN and cached.

<a href="https://developers.google.com/apps-script"><img src="https://img.shields.io/badge/Google%20Apps%20Script-4285F4?style=for-the-badge&logo=google-apps-script&logoColor=white" alt="Google Apps Script"></a>
<a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-indigo?style=for-the-badge" alt="License: MIT"></a>
<a href="README.md"><img src="https://img.shields.io/badge/Status-Production-brightgreen?style=for-the-badge" alt="Status: Production"></a>

---

### ✨ Key features

- 📑 **Page operations**: export selected pages, split page by page, reorder, merge several documents.
- 🏷️ **Metadata**: full read (title, author, dates, per-page dimensions) and update.
- 🔢 **Page numbering**: add a page number aligned left, centered, right, or at free coordinates.
- 📌 **Headers and footers**: up to three zones per band, with alignment and custom font.
- 📝 **PDF forms**: read fields, fill them in, and generate a complete form from a Google Slides template.
- 🖼️ **Image conversion**: each page exported to PNG through Drive, with automatic cleanup of temporary files.
- ⏱️ **Execution guard**: page-by-page processing stops with an explicit message before the Apps Script 6-minute limit.
- 🌍 **Bilingual messages**: errors surface in French or English according to the Google account locale.

---

### 🚀 Installation & setup

1. Create a Google Apps Script project and copy the source into four separate files: `Configuration.gs`, `ChargeurLibrairies.gs`, `PDFApp.gs` and `Api.gs`.
2. Replace the manifest with [appsscript.json](appsscript.json), which declares the required scopes.
3. Deploy the project as a library and note its script ID.
4. In the calling project, add the library under the identifier `PDFApplication`.
5. On the first call, pdf-lib is downloaded and then cached for six hours; later calls are noticeably faster.

---

### 📘 Usage examples

```javascript
// Export pages 1, 3 and 5
const blob = DriveApp.getFileById(fileId).getBlob();
const result = await PDFApplication.setPDFBlob(blob).exportPages([1, 3, 5]);

// Read metadata
const metadata = await PDFApplication.setPDFBlob(blob).getMetadata();

// Add a centered page number at the bottom
const numbered = await PDFApplication
  .setPDFBlob(blob)
  .addPageNumbers({ size: 10, x: "center", y: 20 });

// Merge several documents
const merged = await PDFApplication.mergePDFs([blobA, blobB, blobC]);
```

State set by `setPDFBlob`, `useStandardFont` and `useCustomFont` persists for the whole execution: call `PDFApplication.reinitialiser()` between two independent runs.

---

### 🛠️ Project structure

- **[Configuration.gs](Configuration.gs)**: `CONFIG` constants, translation dictionary, type definitions.
- **[ChargeurLibrairies.gs](ChargeurLibrairies.gs)**: pdf-lib and fontkit download, chunked cache.
- **[PDFApp.gs](PDFApp.gs)**: the engine, the `PDFApp` class holding every PDF operation.
- **[Api.gs](Api.gs)**: the public functions exposed to calling projects.
- **[appsscript.json](appsscript.json)**: manifest and OAuth scopes.

---

### 👤 Author

- **[Fabrice Faucheux](https://faucheux.bzh)** (FF Labs) — [GitHub](https://github.com/FabriceFx)

This library derives from **[PDFApp](https://github.com/tanaikech/PDFApp)** by Kanshi Tanaike, released under the MIT license.

---

### 📄 License

This project is licensed under the terms of the **MIT License**.

---

---
<p align="center"><a href="https://faucheux.bzh" target="_blank" style="color: inherit; text-decoration: none;">&lt;&gt; par Fabrice Faucheux</a></p>
