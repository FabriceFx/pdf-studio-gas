/**
 * ============================================================================
 * MODULE 6 : ÉCHANTILLONS VISUELS
 * ============================================================================
 *
 * Complément au banc de tests, pour la seule chose qu'un test automatique ne
 * sait pas faire : regarder le résultat. Les assertions de `Tests.gs` comptent
 * des pages et comparent des valeurs ; elles ne disent rien de ce qui s'imprime
 * réellement sur la page.
 *
 * Ce module produit trois PDF dans un dossier Drive et laisse les fichiers en
 * place — contrairement au banc, qui nettoie derrière lui. À toi de les ouvrir
 * et de juger.
 *
 * Dépend des fixtures de Tests.gs : les deux fichiers doivent être présents
 * dans le même projet.
 *
 * Point d'entrée : genererEchantillonsVisuels()
 */

const NOM_DOSSIER_ECHANTILLONS = "PDFApplication - échantillons visuels";

/**
 * Produit les échantillons et journalise leurs liens.
 * @return {Promise<void>}
 */
async function genererEchantillonsVisuels() {
  const dossier = dossierEchantillons_();
  const source = creerPresentationTest_(dossier, 4);
  const pdf = DriveApp.getFileById(source.getId()).getBlob();
  const image = creerImageTest_(dossier);

  console.log(`=== Échantillons visuels — ${aPropos()} ===`);

  // Les dimensions sont lues sur le document, jamais supposées. Un export
  // Google Slides fait 720 × 405 points en paysage, là où un A4 en fait
  // 595 × 842 : une ordonnée codée en dur pour l'un sort de la page pour
  // l'autre, et l'élément disparaît sans qu'aucune erreur ne soit levée.
  PDFApplicationLocale_().reinitialiser();
  const metadonnees = await PDFApplicationLocale_().setPDFBlob(pdf).getMetadata();
  const page = { largeur: metadonnees.pageInfo[0].pageWidth, hauteur: metadonnees.pageInfo[0].pageHeight };
  console.log(`Format des pages : ${Math.round(page.largeur)} × ${Math.round(page.hauteur)} points`);

  const echantillons = [
    ["1-entete-positions-explicites.pdf", () => echantillonEnTete_(pdf)],
    ["2-numerotation-centree.pdf", () => echantillonNumerotation_(pdf)],
    ["3-image-et-texte.pdf", () => echantillonIntegration_(pdf, image.getId(), page)]
  ];

  for (const [nom, produire] of echantillons) {
    try {
      PDFApplicationLocale_().reinitialiser();
      const blob = await produire();
      const fichier = dossier.createFile(blob.setName(nom));
      console.log(`✅ ${nom} — ${fichier.getUrl()}`);
    } catch (e) {
      console.error(`❌ ${nom} — ${e.message}`);
    }
  }

  console.log(`Dossier : ${dossier.getUrl()}`);
  console.log("Les fichiers sont conservés : supprime le dossier quand tu as fini.");
}

/**
 * Renvoie le dossier des échantillons, en le créant au besoin.
 * @return {GoogleAppsScript.Drive.Folder}
 */
function dossierEchantillons_() {
  const dossiers = DriveApp.getFoldersByName(NOM_DOSSIER_ECHANTILLONS);
  return dossiers.hasNext() ? dossiers.next() : DriveApp.createFolder(NOM_DOSSIER_ECHANTILLONS);
}

/**
 * En-tête et pied de page avec des positions explicites.
 *
 * C'est le changement de comportement n° 6 du rapport de revue. L'ancienne
 * version retirait x, y et width de l'objet de zone après la première page :
 * la page 1 suivait donc les positions demandées, les suivantes les positions
 * calculées. Elles doivent désormais être identiques.
 *
 * La zone de gauche impose son abscisse et sa largeur ; celle de droite laisse
 * la bibliothèque les calculer. L'ordonnée passe par `yOffset`, mesuré depuis
 * le haut de la page, et non par un `y` absolu qui dépendrait du format.
 *
 * À vérifier à l'œil : « CONFIDENTIEL » doit apparaître au même endroit sur
 * les quatre pages. S'il n'est visible que sur la première, ou s'il se déplace
 * à partir de la deuxième, le correctif est faux.
 *
 * @param {GoogleAppsScript.Base.Blob} pdf PDF source de 4 pages.
 * @return {Promise<GoogleAppsScript.Base.Blob>}
 */
function echantillonEnTete_(pdf) {
  return PDFApplicationLocale_().setPDFBlob(pdf).insertHeaderFooter({
    header: {
      gauche: { text: "CONFIDENTIEL", x: 40, width: 200, height: 20, yOffset: 10, alignment: "left" },
      droite: { text: "FF Labs", height: 20, yOffset: 10, alignment: "right" }
    },
    footer: {
      centre: { text: "Échantillon de contrôle", height: 20, yOffset: 10, alignment: "center" }
    }
  });
}

/**
 * Numérotation centrée en bas de page.
 * À vérifier à l'œil : le numéro est bien centré horizontalement, et lisible.
 *
 * @param {GoogleAppsScript.Base.Blob} pdf PDF source de 4 pages.
 * @return {Promise<GoogleAppsScript.Base.Blob>}
 */
function echantillonNumerotation_(pdf) {
  return PDFApplicationLocale_().setPDFBlob(pdf).addPageNumbers({ size: 12, x: "center", y: 25 });
}

/**
 * Image et texte intégrés en page 1.
 * À vérifier à l'œil : le carré rouge est présent, à l'endroit attendu et dans
 * le bon sens — l'origine des coordonnées d'un PDF est en bas à gauche, ce qui
 * est une source classique d'inversion verticale.
 *
 * @param {GoogleAppsScript.Base.Blob} pdf PDF source de 4 pages.
 * @param {string} identifiantImage ID du fichier image.
 * @param {{largeur: number, hauteur: number}} page Dimensions réelles des pages.
 * @return {Promise<GoogleAppsScript.Base.Blob>}
 */
function echantillonIntegration_(pdf, identifiantImage, page) {
  return PDFApplicationLocale_().setPDFBlob(pdf).embedObjects({
    page1: [
      { imageFileId: identifiantImage, x: 60, y: page.hauteur - 120, width: 60, height: 60 },
      { text: "Repère bas-gauche", x: 60, y: 40, size: 12, standardFont: "Helvetica" },
      { text: "Repère haut-gauche", x: 60, y: page.hauteur - 40, size: 12, standardFont: "Helvetica" },
      { text: "Repère bas-droite", x: page.largeur - 150, y: 40, size: 12, standardFont: "Helvetica" }
    ]
  });
}
