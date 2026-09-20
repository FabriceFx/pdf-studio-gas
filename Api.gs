/**
 * ============================================================================
 * MODULE 4 : SURFACE PUBLIQUE DE LA BIBLIOTHÈQUE
 * ============================================================================
 *
 * Les noms de ces fonctions sont l'API que les projets appelants utilisent :
 * ils restent en anglais, comme dans la bibliothèque d'origine, pour ne pas
 * casser le code existant. Les mécanismes internes, eux, sont en français.
 *
 * Usage :
 *   PDFApplication.setPDFBlob(blob).exportPages([1, 3, 5]);
 *
 * Attention : l'état posé par setPDFBlob, useStandardFont et useCustomFont est
 * porté par la bibliothèque elle-même et persiste pendant toute l'exécution.
 * Une police définie pour un traitement s'appliquera aux suivants dans la même
 * exécution tant que `reinitialiser()` n'a pas été appelé.
 */

/**
 * Nom de la bibliothèque.
 *
 * Valeur littérale et non `CONFIG.NOM_APPLICATION` : Apps Script évalue les
 * fichiers dans l'ordre de l'éditeur, et une affectation de premier niveau qui
 * lit une constante déclarée dans un autre fichier échoue si ce fichier est
 * évalué après celui-ci.
 *
 * @type {string}
 */
var nomApplication = "PDFApplication";

/**
 * Définit le blob PDF source, point de départ de la plupart des traitements.
 *
 * @param {GoogleAppsScript.Base.Blob} blob Le blob PDF.
 * @return {Object} La bibliothèque, pour chaîner l'appel suivant.
 */
function setPDFBlob(blob = null) {
  if (!blob || blob.toString() !== "Blob" || blob.getContentType() !== MimeType.PDF) {
    throw new Error(t("BLOB_SOURCE_MANQUANT"));
  }
  this.blobPdf = blob;
  return this;
}

/**
 * Sélectionne une police standard intégrée à pdf-lib.
 *
 * Le nom attendu est la CLÉ de l'énumération StandardFonts, pas sa valeur :
 * « TimesRoman » et non « Times-Roman », « HelveticaBold » et non
 * « Helvetica-Bold ». Une valeur passée à la place de la clé rend `undefined`
 * et fait échouer pdf-lib beaucoup plus loin, sur un message incompréhensible :
 * d'où le contrôle immédiat ci-dessous.
 *
 * Valeurs acceptées : Courier, CourierBold, CourierOblique, CourierBoldOblique,
 * Helvetica, HelveticaBold, HelveticaOblique, HelveticaBoldOblique, TimesRoman,
 * TimesRomanBold, TimesRomanItalic, TimesRomanBoldItalic, Symbol, ZapfDingbats.
 *
 * Réf. https://pdf-lib.js.org/docs/api/enums/standardfonts
 *
 * @param {string} nom Clé de la police standard.
 * @return {Object} La bibliothèque, pour chaîner l'appel suivant.
 */
function useStandardFont(nom = null) {
  if (nom !== null && !CONFIG.POLICES_STANDARD.includes(nom)) {
    throw new Error(t("POLICE_STANDARD_INCONNUE", nom, CONFIG.POLICES_STANDARD.join(", ")));
  }
  this.policeStandard = nom;
  return this;
}

/**
 * Sélectionne une police personnalisée au format TTF ou OTF.
 *
 * @param {GoogleAppsScript.Base.Blob} blob Blob de la police.
 * @return {Object} La bibliothèque, pour chaîner l'appel suivant.
 */
function useCustomFont(blob = null) {
  this.policePersonnalisee = blob;
  return this;
}

/**
 * Efface le blob source et les polices retenues.
 * À appeler entre deux traitements indépendants d'une même exécution.
 *
 * @return {Object} La bibliothèque, pour chaîner l'appel suivant.
 */
function reinitialiser() {
  this.blobPdf = null;
  this.policeStandard = null;
  this.policePersonnalisee = null;
  return this;
}

/**
 * Vérifie qu'un blob source a bien été défini, et construit le moteur.
 *
 * @return {{blobPdf: GoogleAppsScript.Base.Blob, moteur: PDFApp}}
 */
function preparerMoteur_() {
  if (!this.blobPdf) {
    throw new Error(t("BLOB_SOURCE_MANQUANT"));
  }
  return { blobPdf: this.blobPdf, moteur: new PDFApp(this) };
}

/**
 * Exporte des pages précises du PDF source.
 *
 * @param {number[]} numerosPages Numéros des pages à exporter, à partir de 1.
 * @return {Promise<GoogleAppsScript.Base.Blob>} Blob PDF des pages exportées.
 */
function exportPages(numerosPages) {
  const { blobPdf, moteur } = preparerMoteur_.call(this);
  return moteur.exportPages(blobPdf, numerosPages);
}

/**
 * Lit les métadonnées et les dimensions de page du PDF source.
 *
 * @return {Promise<MetadonneesPdf>} Les métadonnées du document.
 */
function getMetadata() {
  const { blobPdf, moteur } = preparerMoteur_.call(this);
  return moteur.getMetadata(blobPdf);
}

/**
 * Met à jour les métadonnées du PDF source.
 *
 * @param {Object} objet Métadonnées à écrire.
 * @return {Promise<GoogleAppsScript.Base.Blob>} Blob PDF mis à jour.
 */
function updateMetadata(objet) {
  const { blobPdf, moteur } = preparerMoteur_.call(this);
  return moteur.updateMetadata(blobPdf, objet);
}

/**
 * Ancien nom, conservé pour ne pas casser les projets qui l'appellent déjà.
 * Il contient une faute de frappe (« udpate ») présente depuis l'origine.
 * Préférez `updateMetadata` dans tout nouveau code.
 *
 * @deprecated Utilisez updateMetadata.
 * @param {Object} objet Métadonnées à écrire.
 * @return {Promise<GoogleAppsScript.Base.Blob>} Blob PDF mis à jour.
 */
function udpateMetadata(objet) {
  console.warn("udpateMetadata est obsolète : utilisez updateMetadata.");
  return updateMetadata.call(this, objet);
}

/**
 * Réorganise les pages du PDF source.
 *
 * @param {Object} objet Paramètres de réorganisation.
 * @return {Promise<GoogleAppsScript.Base.Blob>} Blob PDF réorganisé.
 */
function reorderPages(objet) {
  const { blobPdf, moteur } = preparerMoteur_.call(this);
  return moteur.reorderPages(blobPdf, objet);
}

/**
 * Fait pivoter tout ou partie des pages du PDF source.
 *
 * @param {Object} objet Paramètres : `angle` en degrés (90, 180 ou 270) et,
 *   facultativement, `pages` pour ne viser que certaines pages.
 * @return {Promise<GoogleAppsScript.Base.Blob>} Blob PDF pivoté.
 */
function rotatePages(objet) {
  const { blobPdf, moteur } = preparerMoteur_.call(this);
  return moteur.rotatePages(blobPdf, objet);
}

/**
 * Fusionne plusieurs blobs PDF en un seul document.
 * Cette fonction n'utilise pas le blob source : elle prend ses entrées en argument.
 *
 * @param {GoogleAppsScript.Base.Blob[]} blobsPdf Blobs à fusionner, dans l'ordre.
 * @return {Promise<GoogleAppsScript.Base.Blob>} Blob PDF fusionné.
 */
function mergePDFs(blobsPdf) {
  if (!Array.isArray(blobsPdf) || blobsPdf.length === 0 ||
      !blobsPdf.every(b => b && b.toString() === "Blob" && b.getContentType() === MimeType.PDF)) {
    throw new Error(t("BLOBS_FUSION_INVALIDES"));
  }
  return new PDFApp(this).mergePDFs(blobsPdf);
}

/**
 * Convertit chaque page du PDF source en image PNG.
 *
 * @return {Promise<GoogleAppsScript.Base.Blob[]>} Un blob PNG par page.
 */
function convertPDFToPng() {
  const { blobPdf, moteur } = preparerMoteur_.call(this);
  return moteur.convertPDFToPng(blobPdf);
}

/**
 * Lit les champs du formulaire PDF source et leurs valeurs.
 *
 * @return {Promise<ChampFormulaire[]>} Les champs du formulaire.
 */
function getValuesFromPDFForm() {
  const { blobPdf, moteur } = preparerMoteur_.call(this);
  return moteur.getValuesFromPDFForm(blobPdf);
}

/**
 * Écrit des valeurs dans le formulaire PDF source.
 *
 * @param {Object} objet Paramètres contenant la liste `values`.
 * @return {Promise<GoogleAppsScript.Base.Blob>} Blob PDF renseigné.
 */
function setValuesToPDFForm(objet) {
  const { blobPdf, moteur } = preparerMoteur_.call(this);
  return moteur.setValuesToPDFForm(blobPdf, objet);
}

/**
 * Crée un formulaire PDF à partir d'un modèle Google Slides.
 * La présentation modèle n'est pas modifiée : le traitement opère sur une copie.
 *
 * @param {string} identifiant ID de la présentation modèle.
 * @param {Object} objet Paramètres contenant la liste `values`.
 * @return {Promise<GoogleAppsScript.Base.Blob>} Blob PDF du formulaire.
 */
function createPDFFormBySlideTemplate(identifiant, objet) {
  return new PDFApp(this).createPDFFormBySlideTemplate(identifiant, objet);
}

/**
 * Intègre images et textes dans le PDF source.
 *
 * @param {Object.<string, Object[]>} objet Éléments à intégrer, par clé `pageN`.
 * @return {Promise<GoogleAppsScript.Base.Blob>} Blob PDF enrichi.
 */
function embedObjects(objet) {
  const { blobPdf, moteur } = preparerMoteur_.call(this);
  return moteur.embedObjects(blobPdf, objet);
}

/**
 * Insère un en-tête et/ou un pied de page sur chaque page du PDF source.
 *
 * @param {OptionsEnTetePiedDePage} objet Contenu de l'en-tête et du pied de page.
 * @return {Promise<GoogleAppsScript.Base.Blob>} Blob PDF complété.
 */
function insertHeaderFooter(objet) {
  const { blobPdf, moteur } = preparerMoteur_.call(this);
  return moteur.insertHeaderFooter(blobPdf, objet);
}

/**
 * Divise chaque page du PDF source en un fichier PDF distinct.
 *
 * @return {Promise<GoogleAppsScript.Base.Blob[]>} Un blob par page.
 */
function splitPDF() {
  const { blobPdf, moteur } = preparerMoteur_.call(this);
  return moteur.splitPDF(blobPdf);
}

/**
 * Ajoute un numéro de page sur chaque page du PDF source.
 *
 * @param {Object} objet Format du numéro : size, x, y et options pdf-lib.
 * @return {Promise<GoogleAppsScript.Base.Blob>} Blob PDF numéroté.
 */
function addPageNumbers(objet) {
  const { blobPdf, moteur } = preparerMoteur_.call(this);
  return moteur.addPageNumbers(blobPdf, objet);
}
