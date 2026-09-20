/**
 * ============================================================================
 * MODULE 7 : APPLICATION WEB — POINT D'ENTRÉE ET ROUTEUR
 * ============================================================================
 *
 * Interface graphique exposant la boîte à outils PDF dans un navigateur.
 *
 * Déploiement attendu : « exécuter en tant qu'utilisateur accédant à
 * l'application ». Chaque visiteur emploie alors son propre Drive et son
 * propre quota, et rien n'est écrit chez le propriétaire du script. Le
 * manifeste le déclare, mais la boîte de dialogue de déploiement a le dernier
 * mot : vérifie-le au moment de publier.
 */

const CONFIG_WEBAPP = Object.freeze({
  TITRE: "PDFApplication",

  /**
   * Au-delà de ce poids, le résultat n'est pas renvoyé au navigateur mais
   * déposé dans Drive, et le client reçoit un lien.
   *
   * Le transfert par `google.script.run` sérialise le fichier en base64, ce
   * qui l'alourdit d'un tiers à l'aller comme au retour. Les appels échouent
   * bien avant les 50 Mo tolérés sur un blob, avec un message peu parlant :
   * mieux vaut basculer sur Drive avant d'y arriver.
   */
  SEUIL_RETOUR_DIRECT_OCTETS: 4 * 1024 * 1024,

  /**
   * Poids maximal accepté à l'envoi, tous fichiers confondus.
   */
  TAILLE_MAX_ENVOI_OCTETS: 20 * 1024 * 1024,

  /**
   * Plafond de pages pour la conversion en images.
   *
   * La conversion attend trois secondes par page, le temps que Drive prépare
   * la miniature. Au-delà d'une vingtaine de pages, le visiteur reste plus
   * d'une minute devant un écran de chargement et croit l'outil bloqué. Ce
   * n'est pas une limite technique mais une limite de patience.
   */
  MAX_PAGES_CONVERSION: 20,

  NOM_DOSSIER_RESULTATS: "PDFApplication - résultats"
});

/**
 * Libellés de l'interface. Séparés du dictionnaire de la bibliothèque, qui
 * ne porte que des messages d'erreur destinés aux développeurs.
 */
const DICTIONNAIRE_WEBAPP = Object.freeze({
  APP_SOUS_TITRE: { fr: "Boîte à outils PDF", en: "PDF toolbox" },
  APP_ACCROCHE: {
    fr: "Sept outils pour manipuler vos documents, sans rien installer.",
    en: "Seven tools to work on your documents, nothing to install."
  },
  A_PROPOS: { fr: "À propos", en: "About" },
  A_PROPOS_TEXTE: {
    fr: "Boîte à outils PDF construite sur Google Apps Script et pdf-lib. Vos fichiers sont traités dans votre propre espace Google et ne transitent par aucun serveur tiers.",
    en: "PDF toolbox built on Google Apps Script and pdf-lib. Your files are processed in your own Google account and never pass through a third-party server."
  },
  A_PROPOS_ORIGINE: {
    fr: "Dérivée de la bibliothèque PDFApp de Kanshi Tanaike, sous licence MIT.",
    en: "Derived from the PDFApp library by Kanshi Tanaike, MIT licensed."
  },
  FERMER: { fr: "Fermer", en: "Close" },
  ANNULER: { fr: "Annuler", en: "Cancel" },
  LANCER: { fr: "Lancer le traitement", en: "Run" },
  TELECHARGER: { fr: "Télécharger le résultat", en: "Download result" },
  OUVRIR_DRIVE: { fr: "Ouvrir dans Drive", en: "Open in Drive" },
  TRAITEMENT: { fr: "Traitement en cours", en: "Processing" },
  ETAPE_ENVOI: { fr: "Lecture des fichiers…", en: "Reading the files…" },
  ETAPE_TRAITEMENT: { fr: "Traitement du document…", en: "Working on the document…" },
  TRAITEMENT_PATIENCE: {
    fr: "Cela peut prendre une minute sur un document volumineux.",
    en: "This can take a minute on a large document."
  },
  DEPOSER_FICHIER: { fr: "Choisir un fichier PDF", en: "Choose a PDF file" },
  DEPOSER_FICHIERS: { fr: "Choisir plusieurs fichiers PDF", en: "Choose several PDF files" },
  AUCUN_FICHIER: { fr: "Aucun fichier sélectionné.", en: "No file selected." },
  DEUX_FICHIERS_MINIMUM: { fr: "Sélectionnez au moins deux fichiers.", en: "Select at least two files." },
  ENVOI_TROP_LOURD: {
    fr: "Ensemble trop volumineux : %s Mo pour un maximum de %s Mo.",
    en: "Upload too large: %s MB for a maximum of %s MB."
  },
  RESULTAT_PRET: { fr: "Résultat prêt", en: "Result ready" },
  TACHE_INCONNUE: {
    fr: "Traitement introuvable ou expiré. Relancez l'opération.",
    en: "Job not found or expired. Please run the operation again."
  },
  TACHE_TROP_LONGUE: {
    fr: "Le traitement dépasse le délai d'attente. Essayez avec un document plus court.",
    en: "Processing exceeded the waiting time. Try a shorter document."
  },
  RESULTAT_DANS_DRIVE: {
    fr: "Le fichier dépasse la taille transmissible au navigateur : il a été déposé dans votre Drive, dans le dossier « %s ».",
    en: "The file is too large to send to the browser: it was saved to your Drive, in the folder \"%s\"."
  },
  ERREUR_TITRE: { fr: "Le traitement a échoué", en: "Processing failed" },

  FUSIONNER: { fr: "Fusionner", en: "Merge" },
  FUSIONNER_DESC: {
    fr: "Réunir plusieurs PDF en un seul document, dans l'ordre choisi.",
    en: "Combine several PDFs into a single document, in the order you choose."
  },
  DECOUPER: { fr: "Découper", en: "Split" },
  DECOUPER_DESC: {
    fr: "Séparer chaque page en un fichier distinct, livrés dans une archive.",
    en: "Split every page into its own file, delivered as an archive."
  },
  EXTRAIRE: { fr: "Extraire des pages", en: "Extract pages" },
  EXTRAIRE_DESC: {
    fr: "Ne garder que les pages qui vous intéressent.",
    en: "Keep only the pages you need."
  },
  NUMEROTER: { fr: "Numéroter", en: "Add page numbers" },
  NUMEROTER_DESC: {
    fr: "Ajouter un numéro sur chaque page, à la position de votre choix.",
    en: "Add a number to every page, wherever you like."
  },
  CONVERTIR: { fr: "Convertir en images", en: "Convert to images" },
  CONVERTIR_DESC: {
    fr: "Transformer chaque page en PNG, livrés dans une archive.",
    en: "Turn each page into a PNG, delivered as an archive."
  },
  METADONNEES: { fr: "Métadonnées", en: "Metadata" },
  METADONNEES_DESC: {
    fr: "Lire les propriétés du document et les modifier.",
    en: "Read the document properties and change them."
  },
  ENTETE: { fr: "En-tête et pied de page", en: "Header and footer" },
  ENTETE_DESC: {
    fr: "Apposer un texte en haut ou en bas de chaque page.",
    en: "Place text at the top or bottom of every page."
  },
  REORGANISER: { fr: "Réorganiser", en: "Reorder" },
  REORGANISER_DESC: {
    fr: "Changer l'ordre des pages du document.",
    en: "Change the order of the pages."
  },
  SUPPRIMER: { fr: "Supprimer des pages", en: "Delete pages" },
  SUPPRIMER_DESC: {
    fr: "Retirer les pages dont vous n'avez pas besoin.",
    en: "Remove the pages you do not need."
  },
  PIVOTER: { fr: "Pivoter", en: "Rotate" },
  PIVOTER_DESC: {
    fr: "Redresser des pages scannées de travers, par quarts de tour.",
    en: "Straighten crooked scanned pages, a quarter turn at a time."
  },
  FORMULAIRE: { fr: "Formulaire PDF", en: "PDF form" },
  FORMULAIRE_DESC: {
    fr: "Lire les champs d'un formulaire et les remplir.",
    en: "Read the fields of a form and fill them in."
  },
  FILIGRANE: { fr: "Filigrane", en: "Watermark" },
  FILIGRANE_DESC: {
    fr: "Apposer un texte ou une image sur les pages.",
    en: "Stamp text or an image onto the pages."
  },

  CHAMP_NOUVEL_ORDRE: { fr: "Nouvel ordre des pages", en: "New page order" },
  CHAMP_NOUVEL_ORDRE_AIDE: {
    fr: "Dans l'ordre voulu : 3, 1, 2. Les pages omises sont placées à la fin.",
    en: "In the order you want: 3, 1, 2. Omitted pages are moved to the end."
  },
  CHAMP_PAGES_SUPPRIMER: { fr: "Pages à supprimer", en: "Pages to delete" },
  CHAMP_ANGLE: { fr: "Angle de rotation", en: "Rotation angle" },
  ANGLE_90: { fr: "Un quart de tour à droite", en: "Quarter turn clockwise" },
  ANGLE_180: { fr: "Un demi-tour", en: "Half turn" },
  ANGLE_270: { fr: "Un quart de tour à gauche", en: "Quarter turn counter-clockwise" },
  CHAMP_PAGES_PIVOTER: { fr: "Pages concernées", en: "Pages affected" },
  CHAMP_PAGES_PIVOTER_AIDE: {
    fr: "Laisser vide pour faire pivoter toutes les pages.",
    en: "Leave empty to rotate every page."
  },
  LIRE_FORMULAIRE: { fr: "Lire les champs", en: "Read the fields" },
  AUCUN_CHAMP: {
    fr: "Ce document ne contient aucun champ de formulaire.",
    en: "This document has no form fields."
  },
  CHAMPS_TROUVES: { fr: "%s champ(s) trouvé(s)", en: "%s field(s) found" },
  CHAMP_TEXTE_FILIGRANE: { fr: "Texte du filigrane", en: "Watermark text" },
  CHAMP_IMAGE: { fr: "Image (PNG ou JPEG)", en: "Image (PNG or JPEG)" },
  CHAMP_EMPLACEMENT: { fr: "Emplacement", en: "Placement" },
  PLACE_HAUT_GAUCHE: { fr: "En haut à gauche", en: "Top left" },
  PLACE_HAUT_DROITE: { fr: "En haut à droite", en: "Top right" },
  PLACE_CENTRE: { fr: "Au centre", en: "Center" },
  PLACE_BAS_GAUCHE: { fr: "En bas à gauche", en: "Bottom left" },
  PLACE_BAS_DROITE: { fr: "En bas à droite", en: "Bottom right" },
  CHAMP_PORTEE: { fr: "Pages concernées", en: "Pages affected" },
  PORTEE_TOUTES: { fr: "Toutes les pages", en: "Every page" },
  PORTEE_PREMIERE: { fr: "La première page seulement", en: "First page only" },
  CHAMP_LARGEUR_IMAGE: { fr: "Largeur de l'image", en: "Image width" },
  CHAMP_HAUTEUR_IMAGE: { fr: "Hauteur de l'image", en: "Image height" },
  CHAMP_DIMENSIONS_AIDE: {
    fr: "En points. L'image est étirée à ces dimensions : gardez les proportions de votre fichier.",
    en: "In points. The image is stretched to these dimensions: keep your file's proportions."
  },
  ERR_FILIGRANE_VIDE: {
    fr: "Indiquez un texte, une image, ou les deux.",
    en: "Provide text, an image, or both."
  },
  ERR_IMAGE_TYPE: {
    fr: "Seules les images PNG et JPEG peuvent être apposées.",
    en: "Only PNG and JPEG images can be stamped."
  },
  ERR_TOUT_SUPPRIME: {
    fr: "Vous supprimeriez toutes les pages du document.",
    en: "That would delete every page of the document."
  },

  CHAMP_PAGES: { fr: "Pages à extraire", en: "Pages to extract" },
  CHAMP_PAGES_AIDE: {
    fr: "Numéros séparés par des virgules, intervalles acceptés : 1, 3, 5-8",
    en: "Comma-separated numbers, ranges allowed: 1, 3, 5-8"
  },
  CHAMP_POSITION: { fr: "Position du numéro", en: "Number position" },
  POSITION_GAUCHE: { fr: "À gauche", en: "Left" },
  POSITION_CENTRE: { fr: "Au centre", en: "Center" },
  POSITION_DROITE: { fr: "À droite", en: "Right" },
  CHAMP_TAILLE: { fr: "Taille du texte", en: "Text size" },
  CHAMP_MARGE: { fr: "Marge depuis le bas", en: "Margin from the bottom" },
  CHAMP_TITRE: { fr: "Titre", en: "Title" },
  CHAMP_AUTEUR: { fr: "Auteur", en: "Author" },
  CHAMP_SUJET: { fr: "Sujet", en: "Subject" },
  CHAMP_MOTSCLES: { fr: "Mots-clés", en: "Keywords" },
  CHAMP_MOTSCLES_AIDE: { fr: "Séparés par des virgules", en: "Comma-separated" },
  LIRE_METADONNEES: { fr: "Lire les métadonnées", en: "Read metadata" },
  METADONNEES_ACTUELLES: { fr: "Valeurs actuelles", en: "Current values" },
  NOMBRE_PAGES: { fr: "Nombre de pages", en: "Number of pages" },
  CHAMP_ENTETE_GAUCHE: { fr: "En-tête, à gauche", en: "Header, left" },
  CHAMP_ENTETE_CENTRE: { fr: "En-tête, au centre", en: "Header, center" },
  CHAMP_ENTETE_DROITE: { fr: "En-tête, à droite", en: "Header, right" },
  CHAMP_PIED_CENTRE: { fr: "Pied de page, au centre", en: "Footer, center" },
  CHAMP_FACULTATIF: { fr: "facultatif", en: "optional" },

  AVERT_PAGES_MAX: {
    fr: "La conversion est limitée à %s pages : elle demande trois secondes par page.",
    en: "Conversion is limited to %s pages: it needs three seconds per page."
  },
  ERR_PAGES_INVALIDES: {
    fr: "Indiquez au moins un numéro de page valide.",
    en: "Please provide at least one valid page number."
  },
  ERR_TROP_DE_PAGES: {
    fr: "Ce document compte %s pages, la conversion est limitée à %s. Extrayez d'abord un sous-ensemble.",
    en: "This document has %s pages, conversion is limited to %s. Extract a subset first."
  },
  ERR_ACTION_INCONNUE: { fr: "Action inconnue : %s", en: "Unknown action: %s" },
  ERR_AUCUN_FICHIER: { fr: "Aucun fichier reçu.", en: "No file received." }
});

/**
 * Traduit une clé de l'interface web.
 *
 * @param {string} cle Clé dans DICTIONNAIRE_WEBAPP.
 * @param {...string} args Remplacements dynamiques.
 * @return {string} Le texte traduit.
 */
function tw(cle, ...args) {
  return traduireDepuis_(DICTIONNAIRE_WEBAPP, cle, args);
}

/**
 * Sert la page de l'application.
 *
 * @param {Object} e Paramètres de la requête.
 * @return {GoogleAppsScript.HTML.HtmlOutput} La page.
 */
function doGet(e) {
  const modele = HtmlService.createTemplateFromFile("Index");
  modele.libelles = JSON.stringify(libellesInterface_());
  modele.reglages = JSON.stringify({
    tailleMaxEnvoi: CONFIG_WEBAPP.TAILLE_MAX_ENVOI_OCTETS,
    maxPagesConversion: CONFIG_WEBAPP.MAX_PAGES_CONVERSION
  });
  modele.langue = langueActive();

  return modele.evaluate()
    .setTitle(`${CONFIG_WEBAPP.TITRE} — ${tw("APP_SOUS_TITRE")}`)
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Insère un fichier HTML dans un autre.
 *
 * @param {string} nomFichier Nom du fichier à inclure, sans extension.
 * @return {string} Son contenu.
 */
function include(nomFichier) {
  return HtmlService.createHtmlOutputFromFile(nomFichier).getContent();
}

/**
 * Construit l'ensemble des libellés traduits transmis au navigateur.
 * Traduire côté serveur évite d'embarquer les deux langues dans la page.
 *
 * @return {Object.<string, string>} Les libellés dans la langue active.
 */
function libellesInterface_() {
  const langue = langueActive();
  const libelles = {};
  for (const cle of Object.keys(DICTIONNAIRE_WEBAPP)) {
    libelles[cle] = DICTIONNAIRE_WEBAPP[cle][langue] || DICTIONNAIRE_WEBAPP[cle].en;
  }
  libelles.VERSION = CONFIG.VERSION;
  libelles.AUTEUR = CONFIG.AUTEUR;
  return libelles;
}

// ============================================================================
// Routeur
// ============================================================================

/**
 * Lance un traitement et rend la main aussitôt.
 *
 * Deux appels plutôt qu'un, et la raison est structurelle : les méthodes de la
 * bibliothèque sont asynchrones, or `google.script.run` capture la valeur de
 * retour de façon synchrone. Une fonction serveur `async` lui rendrait une
 * promesse, qu'il sérialiserait en objet vide. Il n'existe aucun moyen
 * d'attendre une promesse à l'intérieur d'un appel : les micro-tâches ne sont
 * traitées qu'une fois la pile vidée, donc après le retour.
 *
 * Le traitement est donc enchaîné dans un `.then`, dont le moteur exécute bien
 * le corps avant de clore l'exécution — après que la réponse est partie. Le
 * résultat est déposé dans le cache sous un jeton, que le client interroge.
 *
 * Cette architecture règle aussi la conversion en images, qui demande trois
 * secondes par page : le client peut afficher une attente honnête au lieu de
 * geler sur un appel qui semble ne jamais répondre.
 *
 * @param {string} action Outil demandé.
 * @param {Array<{nom: string, base64: string}>} fichiers Fichiers envoyés.
 * @param {Object} parametres Paramètres propres à l'outil.
 * @return {{jeton: string}} Le jeton à interroger.
 */
function serveurLancerTache(action, fichiers, parametres) {
  const jeton = Utilities.getUuid();
  ecrireEtat_(jeton, { etat: "encours" });

  try {
    // Le type est celui annoncé par le navigateur : le filigrane accepte une
    // image en plus du PDF, et la décoder en application/pdf la rendrait
    // inutilisable plus loin.
    const blobs = (fichiers || []).map(f =>
      Utilities.newBlob(Utilities.base64Decode(f.base64), f.type || MimeType.PDF, f.nom)
    );

    if (blobs.length === 0) throw new Error(tw("ERR_AUCUN_FICHIER"));

    executerAction_(action, blobs, parametres || {})
      .then(resultat => ecrireEtat_(jeton, { etat: "termine", ...resultat }))
      .catch(e => {
        console.error(`Échec de l'action « ${action} » : ${e.message}\n${e.stack}`);
        ecrireEtat_(jeton, { etat: "erreur", message: e.message });
      });
  } catch (e) {
    console.error(`Échec immédiat de l'action « ${action} » : ${e.message}`);
    ecrireEtat_(jeton, { etat: "erreur", message: e.message });
  }

  return { jeton };
}

/**
 * Rend l'état d'un traitement, et son résultat s'il est prêt.
 *
 * @param {string} jeton Jeton rendu par serveurLancerTache.
 * @return {Object} État courant, éventuellement accompagné du résultat.
 */
function serveurEtatTache(jeton) {
  const etat = lireEtat_(jeton);
  if (!etat) return { etat: "erreur", message: tw("TACHE_INCONNUE") };
  if (etat.etat !== "termine" || etat.mode !== "fichier") return etat;

  // Le fichier a été déposé dans Drive par le traitement. S'il est assez léger,
  // il repart vers le navigateur et la copie Drive est retirée ; sinon le
  // visiteur reçoit un lien, le transfert direct n'étant pas praticable.
  const fichier = DriveApp.getFileById(etat.idFichier);
  const blob = fichier.getBlob();
  const octets = blob.getBytes();

  if (octets.length <= CONFIG_WEBAPP.SEUIL_RETOUR_DIRECT_OCTETS) {
    fichier.setTrashed(true);
    return {
      etat: "termine",
      mode: "base64",
      nom: etat.nom,
      typeMime: etat.typeMime,
      taille: octets.length,
      contenu: Utilities.base64Encode(octets)
    };
  }

  return {
    etat: "termine",
    mode: "drive",
    nom: etat.nom,
    taille: octets.length,
    url: fichier.getUrl(),
    message: tw("RESULTAT_DANS_DRIVE", CONFIG_WEBAPP.NOM_DOSSIER_RESULTATS)
  };
}

/**
 * Exécute l'outil demandé et dépose son résultat.
 *
 * @param {string} action Outil demandé.
 * @param {GoogleAppsScript.Base.Blob[]} blobs Fichiers reçus.
 * @param {Object} options Paramètres de l'outil.
 * @return {Promise<Object>} Description du résultat.
 */
async function executerAction_(action, blobs, options) {
  const moteur = new PDFApp({});
  const base = nomSansExtension_(blobs[0].getName());

  switch (action) {
    case "fusionner":
      return deposer_(await moteur.mergePDFs(blobs), "fusion.pdf");

    case "decouper":
      return deposer_(
        Utilities.zip(await moteur.splitPDF(blobs[0]), `${base}-pages.zip`),
        `${base}-pages.zip`
      );

    case "extraire":
      return deposer_(
        await moteur.exportPages(blobs[0], analyserPages_(options.pages)),
        `${base}-extrait.pdf`
      );

    case "numeroter":
      return deposer_(
        await moteur.addPageNumbers(blobs[0], {
          size: Number(options.taille) || 10,
          x: options.position || "center",
          y: Number(options.marge) || 20
        }),
        `${base}-numerote.pdf`
      );

    case "convertir": {
      const metadonnees = await moteur.getMetadata(blobs[0]);
      if (metadonnees.numberOfPages > CONFIG_WEBAPP.MAX_PAGES_CONVERSION) {
        throw new Error(tw(
          "ERR_TROP_DE_PAGES",
          String(metadonnees.numberOfPages),
          String(CONFIG_WEBAPP.MAX_PAGES_CONVERSION)
        ));
      }
      const images = await moteur.convertPDFToPng(blobs[0]);
      return deposer_(Utilities.zip(images, `${base}-images.zip`), `${base}-images.zip`);
    }

    case "lireMetadonnees": {
      const metadonnees = await moteur.getMetadata(blobs[0]);
      return {
        mode: "donnees",
        donnees: {
          title: metadonnees.title || "",
          author: metadonnees.author || "",
          subject: metadonnees.subject || "",
          keywords: Array.isArray(metadonnees.keywords)
            ? metadonnees.keywords.join(", ")
            : (metadonnees.keywords || ""),
          numberOfPages: metadonnees.numberOfPages
        }
      };
    }

    case "reorganiser":
      return deposer_(
        await moteur.reorderPages(blobs[0], { nouvelOrdreDesPages: analyserPages_(options.ordre) }),
        `${base}-reorganise.pdf`
      );

    case "supprimer": {
      // Supprimer, c'est conserver le complément : aucune méthode nouvelle
      // n'est nécessaire, seulement la liste inverse.
      const aRetirer = analyserPages_(options.pages);
      const total = (await moteur.getMetadata(blobs[0])).numberOfPages;
      const aGarder = [];
      for (let i = 1; i <= total; i++) {
        if (!aRetirer.includes(i)) aGarder.push(i);
      }
      if (aGarder.length === 0) throw new Error(tw("ERR_TOUT_SUPPRIME"));
      return deposer_(await moteur.exportPages(blobs[0], aGarder), `${base}-allege.pdf`);
    }

    case "pivoter": {
      const pages = String(options.pages || "").trim() ? analyserPages_(options.pages) : [];
      return deposer_(
        await moteur.rotatePages(blobs[0], { angle: Number(options.angle), pages }),
        `${base}-pivote.pdf`
      );
    }

    case "lireFormulaire": {
      const champs = await moteur.getValuesFromPDFForm(blobs[0]);
      return { mode: "donnees", donnees: { champs } };
    }

    case "ecrireFormulaire":
      return deposer_(
        await moteur.setValuesToPDFForm(blobs[0], { values: options.valeurs || [] }),
        `${base}-rempli.pdf`
      );

    case "filigrane":
      return deposer_(await apposerFiligrane_(moteur, blobs, options), `${base}-filigrane.pdf`);

    case "ecrireMetadonnees":
      return deposer_(
        await moteur.updateMetadata(blobs[0], metadonneesDepuisFormulaire_(options)),
        `${base}-metadonnees.pdf`
      );

    case "entete":
      return deposer_(
        await moteur.insertHeaderFooter(blobs[0], enTeteDepuisFormulaire_(options)),
        `${base}-entete.pdf`
      );

    default:
      throw new Error(tw("ERR_ACTION_INCONNUE", action));
  }
}

/**
 * Appose un texte, une image, ou les deux, sur tout ou partie des pages.
 *
 * Les coordonnées sont calculées ici, à partir des dimensions réelles de
 * chaque page, plutôt que demandées au visiteur. Personne n'a envie de
 * réfléchir en points depuis le coin inférieur gauche, et une saisie libre
 * mènerait tout droit à l'élément dessiné hors cadre — invisible et sans
 * message, comme l'avertissement du moteur le rappelle.
 *
 * @param {PDFApp} moteur Moteur PDF.
 * @param {GoogleAppsScript.Base.Blob[]} blobs PDF source, puis image éventuelle.
 * @param {Object} options Paramètres du filigrane.
 * @return {Promise<GoogleAppsScript.Base.Blob>} Blob PDF marqué.
 */
async function apposerFiligrane_(moteur, blobs, options) {
  const texte = String(options.texte || "").trim();
  const image = blobs[1] || null;
  if (!texte && !image) throw new Error(tw("ERR_FILIGRANE_VIDE"));

  if (image && ![MimeType.PNG, MimeType.JPEG].includes(image.getContentType())) {
    throw new Error(tw("ERR_IMAGE_TYPE"));
  }

  const metadonnees = await moteur.getMetadata(blobs[0]);
  const pagesVisees = options.portee === "premiere"
    ? [1]
    : metadonnees.pageInfo.map(p => p.page);

  const marge = 40;
  const tailleTexte = Number(options.taille) || 24;
  const largeurImage = Number(options.largeurImage) || 120;
  const hauteurImage = Number(options.hauteurImage) || 120;

  // L'image n'est accessible à embedObjects que par un identifiant Drive.
  // Elle y est déposée le temps du traitement, puis retirée.
  let fichierImage = null;
  const elements = {};

  try {
    if (image) fichierImage = dossierResultats_().createFile(image);

    pagesVisees.forEach(numero => {
      const page = metadonnees.pageInfo[numero - 1];
      const aPoser = [];

      if (fichierImage) {
        const point = placer_(options.emplacement, page, largeurImage, hauteurImage, marge);
        aPoser.push({
          imageFileId: fichierImage.getId(),
          x: point.x, y: point.y,
          width: largeurImage, height: hauteurImage
        });
      }

      if (texte) {
        // Largeur approchée d'une police proportionnelle : environ la moitié
        // du corps par caractère. Suffisant pour ne pas déborder du cadre.
        const largeurTexte = texte.length * tailleTexte * 0.5;
        const decalage = fichierImage ? hauteurImage + 12 : 0;
        const point = placer_(options.emplacement, page, largeurTexte, tailleTexte, marge);
        aPoser.push({
          text: texte,
          x: point.x,
          y: Math.max(marge, point.y - decalage),
          size: tailleTexte,
          standardFont: "Helvetica"
        });
      }

      elements[`page${numero}`] = aPoser;
    });

    return await moteur.embedObjects(blobs[0], elements);
  } finally {
    if (fichierImage) {
      try {
        fichierImage.setTrashed(true);
      } catch (e) {
        console.warn(`Image temporaire non supprimée : ${e.message}`);
      }
    }
  }
}

/**
 * Calcule le coin inférieur gauche d'un élément selon l'emplacement demandé.
 *
 * @param {string} emplacement hautGauche, hautDroite, centre, basGauche, basDroite.
 * @param {InfoPage} page Dimensions de la page.
 * @param {number} largeur Encombrement horizontal de l'élément.
 * @param {number} hauteur Encombrement vertical de l'élément.
 * @param {number} marge Marge depuis les bords.
 * @return {{x: number, y: number}} Position, origine en bas à gauche.
 */
function placer_(emplacement, page, largeur, hauteur, marge) {
  const droite = Math.max(marge, page.pageWidth - marge - largeur);
  const haut = Math.max(marge, page.pageHeight - marge - hauteur);

  switch (emplacement) {
    case "hautGauche": return { x: marge, y: haut };
    case "hautDroite": return { x: droite, y: haut };
    case "basGauche": return { x: marge, y: marge };
    case "basDroite": return { x: droite, y: marge };
    default: return {
      x: Math.max(marge, (page.pageWidth - largeur) / 2),
      y: Math.max(marge, (page.pageHeight - hauteur) / 2)
    };
  }
}

// ============================================================================
// État des traitements
// ============================================================================

/**
 * Enregistre l'état d'un traitement.
 *
 * @param {string} jeton Identifiant du traitement.
 * @param {Object} etat État à conserver.
 * @return {void}
 */
function ecrireEtat_(jeton, etat) {
  CacheService.getUserCache().put(`tache_${jeton}`, JSON.stringify(etat), 3600);
}

/**
 * Relit l'état d'un traitement.
 *
 * @param {string} jeton Identifiant du traitement.
 * @return {Object|null} L'état, ou null s'il a expiré.
 */
function lireEtat_(jeton) {
  const brut = CacheService.getUserCache().get(`tache_${jeton}`);
  if (!brut) return null;
  try {
    return JSON.parse(brut);
  } catch (e) {
    return null;
  }
}

// ============================================================================
// Livraison des résultats
// ============================================================================

/**
 * Dépose le fichier produit dans Drive et décrit où le trouver.
 *
 * Le passage par Drive est imposé par l'architecture en deux appels : le
 * résultat naît dans un `.then`, après que la réponse du premier appel est
 * partie. Il faut donc le poser quelque part, et le cache ne convient pas —
 * il plafonne à 100 Ko par valeur. Le second appel décidera, au vu du poids,
 * de le renvoyer au navigateur ou d'en donner le lien.
 *
 * @param {GoogleAppsScript.Base.Blob} blob Fichier produit.
 * @param {string} nom Nom proposé au téléchargement.
 * @return {Object} Description du résultat.
 */
function deposer_(blob, nom) {
  blob.setName(nom);
  const fichier = dossierResultats_().createFile(blob);
  return {
    mode: "fichier",
    idFichier: fichier.getId(),
    nom,
    typeMime: blob.getContentType()
  };
}

/**
 * Renvoie le dossier Drive des résultats, en le créant au besoin.
 * Il appartient au visiteur, puisque le script s'exécute en son nom.
 *
 * @return {GoogleAppsScript.Drive.Folder} Le dossier.
 */
function dossierResultats_() {
  const dossiers = DriveApp.getFoldersByName(CONFIG_WEBAPP.NOM_DOSSIER_RESULTATS);
  return dossiers.hasNext()
    ? dossiers.next()
    : DriveApp.createFolder(CONFIG_WEBAPP.NOM_DOSSIER_RESULTATS);
}

// ============================================================================
// Conversion des saisies
// ============================================================================

/**
 * Transforme une saisie de pages en liste de numéros.
 * Accepte « 1, 3, 5-8 » et ignore les intervalles à l'envers.
 *
 * @param {string} saisie Texte saisi par le visiteur.
 * @return {number[]} Numéros de page, triés et dédoublonnés.
 */
function analyserPages_(saisie) {
  const numeros = new Set();

  String(saisie || "").split(",").forEach(morceau => {
    const partie = morceau.trim();
    if (!partie) return;

    const intervalle = partie.match(/^(\d+)\s*-\s*(\d+)$/);
    if (intervalle) {
      const debut = parseInt(intervalle[1], 10);
      const fin = parseInt(intervalle[2], 10);
      for (let i = debut; i <= fin; i++) numeros.add(i);
      return;
    }

    if (/^\d+$/.test(partie)) numeros.add(parseInt(partie, 10));
  });

  const liste = [...numeros].filter(n => n > 0).sort((a, b) => a - b);
  if (liste.length === 0) throw new Error(tw("ERR_PAGES_INVALIDES"));
  return liste;
}

/**
 * Construit l'objet de métadonnées à partir du formulaire, en ignorant les
 * champs laissés vides — écrire une chaîne vide effacerait la valeur existante.
 *
 * @param {Object} options Champs du formulaire.
 * @return {Object} Métadonnées à écrire.
 */
function metadonneesDepuisFormulaire_(options) {
  const metadonnees = {};

  ["title", "author", "subject"].forEach(cle => {
    if (options[cle] && options[cle].trim()) metadonnees[cle] = options[cle].trim();
  });

  if (options.keywords && options.keywords.trim()) {
    metadonnees.keywords = options.keywords.split(",").map(m => m.trim()).filter(Boolean);
  }

  return metadonnees;
}

/**
 * Construit l'objet d'en-tête et de pied de page à partir du formulaire.
 * Seules les zones renseignées sont transmises : une zone vide occuperait
 * de la largeur et décalerait les autres.
 *
 * @param {Object} options Champs du formulaire.
 * @return {OptionsEnTetePiedDePage} Configuration des bandeaux.
 */
function enTeteDepuisFormulaire_(options) {
  const configuration = {};
  const zone = (texte, alignement) => ({
    text: texte.trim(),
    height: 20,
    yOffset: 12,
    alignment: alignement
  });

  const header = {};
  if (options.enteteGauche && options.enteteGauche.trim()) header.gauche = zone(options.enteteGauche, "left");
  if (options.enteteCentre && options.enteteCentre.trim()) header.centre = zone(options.enteteCentre, "center");
  if (options.enteteDroite && options.enteteDroite.trim()) header.droite = zone(options.enteteDroite, "right");
  if (Object.keys(header).length > 0) configuration.header = header;

  if (options.piedCentre && options.piedCentre.trim()) {
    configuration.footer = { centre: zone(options.piedCentre, "center") };
  }

  return configuration;
}

/**
 * Retire l'extension d'un nom de fichier.
 *
 * @param {string} nom Nom complet.
 * @return {string} Le nom sans son extension.
 */
function nomSansExtension_(nom) {
  return String(nom || "document").replace(/\.[^.]+$/, "");
}
