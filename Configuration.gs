/**
 * ============================================================================
 * MODULE 1 : CONFIGURATION ET INTERNATIONALISATION (i18n)
 * ============================================================================
 *
 * Bibliothèque PDFApplication — traitement de fichiers PDF dans Google Apps
 * Script via pdf-lib chargée dynamiquement.
 *
 * Dérivée de la bibliothèque PDFApp de Kanshi Tanaike (licence MIT).
 * https://github.com/tanaikech/PDFApp
 */

/**
 * @typedef {Object} InfoPage
 * @property {number} page - Numéro de page, à partir de 1.
 * @property {number} pageWidth - Largeur de la page en points.
 * @property {number} pageHeight - Hauteur de la page en points.
 * @property {number} defaultPositionX - Position X d'origine de la page.
 * @property {number} defaultPositionY - Position Y d'origine de la page.
 */

/**
 * @typedef {Object} MetadonneesPdf
 * @property {string|null} title - Titre du document.
 * @property {string|null} subject - Sujet du document.
 * @property {string|null} author - Auteur du document.
 * @property {string|null} creator - Application créatrice.
 * @property {Date|null} creationDate - Date de création.
 * @property {Date|null} modificationDate - Date de dernière modification.
 * @property {string[]|null} keywords - Mots-clés.
 * @property {string|null} producer - Producteur du fichier.
 * @property {number} numberOfPages - Nombre total de pages.
 * @property {InfoPage[]} pageInfo - Dimensions et position de chaque page.
 */

/**
 * @typedef {Object} ChampFormulaire
 * @property {string} name - Nom du champ dans le formulaire PDF.
 * @property {string} type - Textbox, Dropdown, Checkbox, Radiobutton ou non supporté.
 * @property {*} value - Valeur courante du champ.
 * @property {string[]} [options] - Options disponibles pour une liste ou un groupe radio.
 */

/**
 * @typedef {Object} OptionsEnTetePiedDePage
 * @property {Object.<string, Object>} [header] - Zones d'en-tête, indexées par position.
 * @property {Object.<string, Object>} [footer] - Zones de pied de page, indexées par position.
 */

const CONFIG = Object.freeze({
  VERSION: "v2.0 - Refactorisation septembre 2026",
  AUTEUR: "Fabrice FAUCHEUX (faucheux.bzh)",
  NOM_APPLICATION: "PDFApplication",
  ORIGINE: "Basée sur PDFApp de Kanshi Tanaike (MIT)",

  /**
   * Les URL de CDN sont épinglées sur une version précise.
   * Une URL sans numéro de version fait suivre au script chaque nouvelle
   * publication de la librairie, du jour au lendemain et sans prévenir :
   * un projet qui fonctionnait la veille peut casser sans qu'aucune ligne
   * de code n'ait bougé.
   */
  CDN_PDF_LIB: "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js",
  CDN_FONTKIT: "https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js",

  /**
   * CacheService plafonne chaque valeur à 100 Ko, comptés en octets.
   * substring() découpe en caractères UTF-16 : un caractère non ASCII pèse
   * jusqu'à 3 octets, donc un segment de 30 000 caractères reste sous la
   * limite dans le pire des cas. Une découpe à 100 000 caractères dépasse
   * la limite dès qu'un accent traîne dans la librairie minifiée.
   */
  TAILLE_SEGMENT_CACHE_CARACTERES: 30000,
  TAILLE_MAX_VALEUR_CACHE_OCTETS: 100 * 1024,
  DUREE_CACHE_S: 21600,

  MAX_TENTATIVES_HTTP: 5,
  DELAI_BASE_RETENTATIVE_MS: 1000,

  /**
   * Sous-ensemble de police pour les champs de formulaire restant modifiables.
   *
   * Sous-ensembler consiste à n'embarquer que les glyphes réellement employés :
   * un PDF d'une page passe de 1 900 Ko à 3 Ko avec une police variable de
   * 3,5 Mo. Le gain est donc considérable, mais il ne vaut que si le texte est
   * connu au moment de l'intégration. Un formulaire qu'un tiers remplira plus
   * tard peut recevoir des caractères absents du sous-ensemble, qui ne
   * s'afficheront pas — d'où la valeur false par défaut ici.
   *
   * Les textes dessinés et les champs en lecture seule, eux, sont toujours
   * sous-ensemblés : leur contenu est figé, le risque n'existe pas.
   */
  SOUS_ENSEMBLE_POLICE_FORMULAIRE: false,

  /**
   * Sous-ensemble pour les contenus figés : textes dessinés par embedObjects,
   * champs d'en-tête et de pied de page mis en lecture seule.
   *
   * DÉSACTIVÉ PAR DÉFAUT, et la raison mérite d'être connue avant d'y toucher.
   *
   * Le gain est considérable sur le papier : n'embarquer que les glyphes
   * utilisés fait passer un PDF d'une page de 1 900 Ko à 3 Ko avec une police
   * variable de 3,5 Mo. Mesuré et vérifié sous Node avec pdf-lib 1.17.1 et
   * fontkit 1.1.1.
   *
   * Mais sous Apps Script, le sous-ensemble d'une police variable de plusieurs
   * mégaoctets fait sortir le moteur JavaScript en cours d'exécution — « The
   * JavaScript runtime exited unexpectedly ». Ce n'est pas une exception que
   * l'on pourrait rattraper : le script entier s'arrête. Le coût d'un échec
   * dépasse donc largement le bénéfice d'un document plus léger.
   *
   * Le sous-ensemble reste envisageable avec une police statique de taille
   * modeste, quelques centaines de kilo-octets. À n'activer qu'après l'avoir
   * éprouvé sur la police précise que le projet utilise, et sur un document
   * représentatif.
   */
  SOUS_ENSEMBLE_POLICE_FIGEE: false,

  /**
   * Seuil au-delà duquel une police embarquée en entier fait l'objet d'un
   * avertissement : son poids se retrouve dans chaque document produit.
   */
  SEUIL_AVERTISSEMENT_POLICE_OCTETS: 1024 * 1024,

  /**
   * Avertir quand un élément est dessiné en dehors des limites de la page.
   * pdf-lib accepte sans broncher des coordonnées hors cadre : l'élément est
   * simplement invisible, sans erreur ni trace. C'est un mode d'échec
   * particulièrement coûteux à diagnostiquer.
   */
  AVERTIR_HORS_PAGE: true,

  /**
   * Budget de temps pour les traitements page par page. Apps Script coupe
   * l'exécution à 6 minutes : on s'arrête avant, avec un message explicite,
   * plutôt que de laisser la plateforme interrompre le script au milieu
   * d'une opération et abandonner des fichiers temporaires derrière elle.
   */
  DUREE_MAX_TRAITEMENT_MS: 280 * 1000,
  ATTENTE_MINIATURE_MS: 3000,
  LARGEUR_MINIATURE_PX: 1000,
  NOM_DOSSIER_TEMPORAIRE: "PDFApplication - fichiers temporaires",

  CLES_METADONNEES: Object.freeze([
    "title", "subject", "author", "creator",
    "creationDate", "modificationDate", "keywords", "producer"
  ]),

  /**
   * Polices intégrées à pdf-lib, désignées par la CLÉ de l'énumération
   * StandardFonts et non par sa valeur : le code résout `StandardFonts[nom]`,
   * donc « TimesRoman » fonctionne là où « Times-Roman » rend `undefined`
   * et fait échouer pdf-lib plus loin, sur un message sans rapport.
   * Réf. https://pdf-lib.js.org/docs/api/enums/standardfonts
   */
  POLICES_STANDARD: Object.freeze([
    "Courier", "CourierBold", "CourierOblique", "CourierBoldOblique",
    "Helvetica", "HelveticaBold", "HelveticaOblique", "HelveticaBoldOblique",
    "TimesRoman", "TimesRomanBold", "TimesRomanItalic", "TimesRomanBoldItalic",
    "Symbol", "ZapfDingbats"
  ])
});

/**
 * Messages destinés à l'appelant, en français et en anglais.
 * La bibliothèque étant publiée en open source, ses erreurs doivent être
 * lisibles par un développeur non francophone.
 */
const DICTIONNAIRE_I18N = Object.freeze({
  BLOB_SOURCE_MANQUANT: {
    fr: "Veuillez définir le blob PDF source en utilisant la méthode setPDFBlob.",
    en: "Please set the source PDF blob using the setPDFBlob method."
  },
  BLOB_SOURCE_INVALIDE: {
    fr: "Le blob fourni n'est pas un PDF valide.",
    en: "The provided blob is not a valid PDF."
  },
  BLOBS_FUSION_INVALIDES: {
    fr: "Veuillez définir des blobs PDF valides pour la fusion.",
    en: "Please provide valid PDF blobs to merge."
  },
  PAGES_A_EXPORTER_MANQUANTES: {
    fr: "Veuillez définir les numéros des pages que vous souhaitez exporter.",
    en: "Please provide the page numbers you want to export."
  },
  OBJET_METADONNEES_INVALIDE: {
    fr: "Veuillez définir un objet valide pour la mise à jour des métadonnées PDF.",
    en: "Please provide a valid object to update the PDF metadata."
  },
  OBJET_REORGANISATION_INVALIDE: {
    fr: "Veuillez définir un objet valide pour réorganiser les pages du PDF.",
    en: "Please provide a valid object to reorder the PDF pages."
  },
  ORDRE_PAGES_HORS_LIMITES: {
    fr: "Le nouvel ordre des pages référence la page %s alors que le document n'en compte que %s.",
    en: "The new page order references page %s while the document only has %s."
  },
  ORDRE_PAGES_MANQUANT: {
    fr: "La propriété nouvelOrdreDesPages doit être un tableau de numéros de page.",
    en: "The nouvelOrdreDesPages property must be an array of page numbers."
  },
  VALEURS_FORMULAIRE_INVALIDES: {
    fr: "Veuillez définir des valeurs valides pour le formulaire PDF.",
    en: "Please provide valid values for the PDF form."
  },
  CHAMP_FORMULAIRE_INTROUVABLE: {
    fr: "Le champ « %s » est absent du formulaire PDF.",
    en: "The field \"%s\" is missing from the PDF form."
  },
  IDENTIFIANT_SLIDE_MANQUANT: {
    fr: "Veuillez définir l'ID de la présentation Google Slides contenant le modèle.",
    en: "Please provide the file ID of the Google Slides presentation holding the template."
  },
  OBJET_SLIDE_INVALIDE: {
    fr: "Veuillez définir un objet valide pour créer un formulaire PDF à partir d'un modèle Google Slides.",
    en: "Please provide a valid object to create a PDF form from a Google Slides template."
  },
  TITRES_EN_DOUBLE: {
    fr: "Des titres de forme en double ont été trouvés dans le modèle : %s.",
    en: "Duplicate shape titles were found in the template: %s."
  },
  OBJET_INTEGRATION_INVALIDE: {
    fr: "Veuillez fournir un objet pour l'intégration des éléments.",
    en: "Please provide an object describing the elements to embed."
  },
  OBJET_ENTETE_INVALIDE: {
    fr: "Veuillez fournir un objet décrivant l'en-tête et le pied de page.",
    en: "Please provide an object describing the header and footer."
  },
  OBJET_NUMEROTATION_INVALIDE: {
    fr: "Veuillez fournir un objet contenant les propriétés size, x et y.",
    en: "Please provide an object holding the size, x and y properties."
  },
  POSITION_HORIZONTALE_INCONNUE: {
    fr: "Position horizontale « %s » inconnue : utilisez center, left, right ou une valeur numérique.",
    en: "Unknown horizontal position \"%s\": use center, left, right or a numeric value."
  },
  IMAGE_NON_SUPPORTEE: {
    fr: "Ce type d'image n'est pas supporté : seuls PNG et JPEG peuvent être intégrés.",
    en: "This image type is not supported: only PNG and JPEG can be embedded."
  },
  MINIATURE_INDISPONIBLE: {
    fr: "Impossible de générer la miniature de la page %s : %s",
    en: "Unable to generate the thumbnail for page %s: %s"
  },
  BUDGET_TEMPS_DEPASSE: {
    fr: "Traitement interrompu après %s page(s) : la limite d'exécution de Google Apps Script approche. Découpez le document en parties plus courtes.",
    en: "Processing stopped after %s page(s): the Google Apps Script execution limit is close. Split the document into smaller parts."
  },
  LIBRAIRIE_INDISPONIBLE: {
    fr: "Impossible de charger la librairie %s depuis le CDN : %s",
    en: "Unable to load the %s library from the CDN: %s"
  },
  ANGLE_INVALIDE: {
    fr: "Angle « %s » invalide : utilisez 90, 180 ou 270 degrés.",
    en: "Invalid angle \"%s\": use 90, 180 or 270 degrees."
  },
  PAGES_HORS_DOCUMENT: {
    fr: "La page %s n'existe pas : le document en compte %s.",
    en: "Page %s does not exist: the document has %s."
  },
  POLICE_STANDARD_INCONNUE: {
    fr: "Police standard « %s » inconnue. Valeurs acceptées : %s",
    en: "Unknown standard font \"%s\". Accepted values: %s"
  }
});

/**
 * Renvoie la langue à employer d'après les paramètres du compte Google actif.
 *
 * @return {string} « fr » ou « en ».
 */
function langueActive() {
  const locale = (Session.getActiveUserLocale() || "en").toLowerCase();
  return locale.startsWith("fr") ? "fr" : "en";
}

/**
 * Traduit une clé dans le dictionnaire fourni.
 *
 * Extraite de `t()` pour que l'application web dispose du même mécanisme sans
 * avoir à dupliquer la logique ni à entasser ses libellés d'interface dans le
 * dictionnaire de la bibliothèque, qui ne porte que des messages d'erreur.
 *
 * @param {Object} dictionnaire Dictionnaire à consulter.
 * @param {string} cle Clé recherchée.
 * @param {string[]} args Remplacements dynamiques, dans l'ordre des %s.
 * @return {string} Le texte traduit, ou la clé elle-même si elle est absente.
 */
function traduireDepuis_(dictionnaire, cle, args) {
  if (!dictionnaire[cle]) {
    console.warn(`Clé de traduction manquante : ${cle}`);
    return cle;
  }

  let texte = dictionnaire[cle][langueActive()] || dictionnaire[cle].en;
  for (const arg of args) {
    texte = texte.replace("%s", arg);
  }
  return texte;
}

/**
 * Traduit une clé du dictionnaire de la bibliothèque.
 *
 * @param {string} cle La clé dans le dictionnaire.
 * @param {...string} args Remplacements dynamiques, dans l'ordre des %s.
 * @return {string} Le texte traduit, ou la clé elle-même si elle est absente.
 */
function t(cle, ...args) {
  return traduireDepuis_(DICTIONNAIRE_I18N, cle, args);
}

/**
 * Renvoie la version et l'auteur de la bibliothèque.
 * Utile pour identifier la version en production lors d'un signalement.
 *
 * @return {string} Une ligne « nom · version · auteur ».
 */
function aPropos() {
  return `${CONFIG.NOM_APPLICATION} · ${CONFIG.VERSION} · ${CONFIG.AUTEUR} · ${CONFIG.ORIGINE}`;
}
