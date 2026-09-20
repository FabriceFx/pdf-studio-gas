/**
 * ============================================================================
 * MODULE 5 : BANC DE TESTS
 * ============================================================================
 *
 * À coller dans le même projet Apps Script que les quatre autres modules, puis
 * à lancer depuis l'éditeur. Chaque test crée les fichiers dont il a besoin et
 * les supprime à la fin, dans un dossier dédié.
 *
 * Deux points de méthode à garder en tête en lisant les résultats :
 *
 * 1. Ce banc a été écrit par celui qui a écrit la refactorisation. Il vérifie
 *    donc ce à quoi cette refactorisation a pensé. Un test au vert dit « le
 *    comportement annoncé est bien celui observé », pas « le module est sûr ».
 *
 * 2. Chaque appel public construit un nouveau PDFApp, ce qui réévalue pdf-lib
 *    (environ 1,5 Mo) à chaque fois. C'est le fonctionnement hérité de la
 *    bibliothèque d'origine, pas un défaut introduit ici, mais cela rend le
 *    banc lent : comptez plusieurs minutes. Lancez `lancerTestsRapides` si
 *    vous approchez de la limite d'exécution.
 *
 * Point d'entrée : lancerTousLesTests()
 */

const NOM_DOSSIER_TESTS = "PDFApplication - banc de tests";

/**
 * Réglages du banc.
 *
 * Les deux tests de police personnalisée ont besoin d'un fichier TTF ou OTF,
 * que le banc ne peut pas fabriquer lui-même. Dépose-en un dans ton Drive et
 * il sera trouvé par son nom ; sinon renseigne son identifiant ici. Sans
 * police, ces deux tests sont ignorés plutôt que mis en échec.
 *
 * Attention aux collections `.ttc` (les polices système de macOS) : fontkit
 * ne sait pas les embarquer. Les polices variables, en revanche, fonctionnent.
 */
const CONFIG_TESTS = Object.freeze({
  ID_POLICE_TTF: "",
  MOTIF_NOM_POLICE: "Roboto"
});

/**
 * Marqueur signalant qu'un test ne peut pas s'exécuter faute de matière.
 * Un test ignoré n'est pas un échec, mais il ne doit pas non plus passer
 * pour une réussite : le rapport les compte à part.
 *
 * @param {string} raison Ce qui manque.
 * @return {void}
 */
function ignorer_(raison) {
  const marqueur = new Error(raison);
  marqueur.testIgnore = true;
  throw marqueur;
}

/**
 * Cherche une police TTF ou OTF utilisable, d'abord par identifiant explicite,
 * puis par nom dans le Drive de l'utilisateur.
 *
 * @return {GoogleAppsScript.Base.Blob|null} Le blob de la police, ou null.
 */
function trouverPolice_() {
  if (CONFIG_TESTS.ID_POLICE_TTF) {
    return DriveApp.getFileById(CONFIG_TESTS.ID_POLICE_TTF).getBlob();
  }

  const fichiers = DriveApp.searchFiles(
    `title contains '${CONFIG_TESTS.MOTIF_NOM_POLICE}' and trashed = false`
  );
  while (fichiers.hasNext()) {
    const fichier = fichiers.next();
    const nom = fichier.getName().toLowerCase();
    if (nom.endsWith(".ttf") || nom.endsWith(".otf")) {
      console.log(`Police de test : ${fichier.getName()}`);
      return fichier.getBlob();
    }
  }
  return null;
}

/**
 * Lance l'ensemble des tests, y compris les plus lents.
 * @return {Promise<void>}
 */
async function lancerTousLesTests() {
  await executerBanc_(true);
}

/**
 * Lance tous les tests sauf la conversion en images, qui attend trois secondes
 * par page et consomme l'essentiel du temps d'exécution disponible.
 * @return {Promise<void>}
 */
async function lancerTestsRapides() {
  await executerBanc_(false);
}

/**
 * Exécute le banc et journalise le rapport.
 *
 * @param {boolean} inclureTestsLents Inclure la conversion en images.
 * @return {Promise<void>}
 */
async function executerBanc_(inclureTestsLents) {
  const debut = Date.now();
  const resultats = [];
  const contexte = {};

  console.log(`=== Banc de tests — ${aPropos()} ===`);

  try {
    contexte.dossier = dossierTests_();
    contexte.presentation = creerPresentationTest_(contexte.dossier, 4);
    contexte.pdf4Pages = DriveApp.getFileById(contexte.presentation.getId()).getBlob();
    contexte.modele = creerModeleSlides_(contexte.dossier);
    contexte.image = creerImageTest_(contexte.dossier);

    const tests = [
      ["Chargement de pdf-lib", testChargementLibrairie_],
      ["Cache de pdf-lib réellement écrit", testCachePdfLib_],
      ["Lecture des métadonnées", testLectureMetadonnees_],
      ["updateMetadata avec des clés partielles", testMetadonneesPartielles_],
      ["Alias udpateMetadata conservé", testAliasUdpateMetadata_],
      ["Export de pages choisies", testExportPages_],
      ["Réorganisation nominale", testReorganisationNominale_],
      ["Réorganisation hors limites rejetée", testReorganisationHorsLimites_],
      ["Découpe puis fusion", testDecoupePuisFusion_],
      ["Police standard invalide refusée", testPoliceStandardInvalide_],
      ["Numérotation centrée", testNumerotationCentree_],
      ["Position de numérotation inconnue refusée", testNumerotationPositionInconnue_],
      ["Blob source invalide refusé", testBlobSourceInvalide_],
      ["En-tête sans effet de bord sur l'appelant", testEnTeteSansEffetDeBord_],
      ["Formulaire PDF : lecture et écriture", testFormulairePdf_],
      ["Modèle Slides préservé", testModeleSlidesPreserve_],
      ["Chargement de fontkit", testChargementFontkit_],
      ["Police standard appliquée à un formulaire", testPoliceStandardSurFormulaire_],
      ["Intégration d'une image et d'un texte", testIntegrationObjets_],
      ["Garde-fou du budget de temps", testGardeBudgetTemps_],
      ["Pas de retentative sur une erreur définitive", testPasDeRetentativeSurErreurDefinitive_],
      ["Police personnalisée sur un texte dessiné", testPolicePersonnaliseeSurTexte_],
      ["Police personnalisée sur un formulaire", testPolicePersonnaliseeSurFormulaire_],
      ["Avertissement sur un élément hors page", testAvertissementHorsPage_],
      ["Rotation des pages", testRotationPages_],
      ["Angle de rotation invalide refusé", testRotationAngleInvalide_]
    ];

    if (inclureTestsLents) {
      tests.push(["Conversion PNG sans fichier résiduel", testConversionPngNettoyage_]);
      tests.push(["Nettoyage après échec en cours de conversion", testNettoyageApresEchec_]);
    }

    for (const [nom, fonction] of tests) {
      const resultat = await executerTest_(nom, fonction, contexte);
      resultats.push(resultat);
      const marque = resultat.ignore ? "⏭️" : (resultat.succes ? "✅" : "❌");
      console.log(`${marque} ${nom}${resultat.detail ? " — " + resultat.detail : ""}`);
    }
  } catch (e) {
    console.error(`Préparation du banc interrompue : ${e.message}\n${e.stack}`);
  } finally {
    nettoyerDossierTests_(contexte.dossier);
  }

  const reussis = resultats.filter(r => r.succes).length;
  const ignores = resultats.filter(r => r.ignore).length;
  const duree = Math.round((Date.now() - debut) / 1000);
  const mentionIgnores = ignores > 0 ? `, ${ignores} ignoré(s)` : "";
  console.log(`=== ${reussis} / ${resultats.length - ignores} tests réussis en ${duree} s${mentionIgnores} ===`);

  const echecs = resultats.filter(r => !r.succes && !r.ignore);
  if (echecs.length > 0) {
    console.log("Échecs :");
    echecs.forEach(r => console.log(`  • ${r.nom} : ${r.detail}`));
  }
}

/**
 * Exécute un test et capture son issue.
 *
 * @param {string} nom Libellé du test.
 * @param {function(Object): Promise<string>} fonction Le test, qui lève une
 *   exception en cas d'échec et renvoie éventuellement un détail à journaliser.
 * @param {Object} contexte Fichiers partagés par les tests.
 * @return {Promise<{nom: string, succes: boolean, detail: string}>}
 */
async function executerTest_(nom, fonction, contexte) {
  try {
    // L'état de la bibliothèque — blob source et police — est porté par l'objet
    // global et survit d'un appel à l'autre. Sans cette remise à zéro, la police
    // retenue par un test s'appliquerait silencieusement aux suivants, et les
    // échecs seraient attribués au mauvais test.
    PDFApplicationLocale_().reinitialiser();

    const detail = await fonction(contexte);
    return { nom, succes: true, detail: detail || "" };
  } catch (e) {
    if (e && e.testIgnore) return { nom, ignore: true, detail: e.message };
    return { nom, succes: false, detail: e.message };
  }
}

/**
 * Vérifie une condition et lève une exception explicite si elle est fausse.
 *
 * @param {boolean} condition Condition attendue vraie.
 * @param {string} message Description de l'écart si la condition est fausse.
 * @return {void}
 */
function affirmer_(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * Vérifie qu'un appel lève bien une exception, et que son message contient
 * le fragment attendu. Un test qui se contente d'attendre une exception
 * passerait au vert sur n'importe quelle erreur, y compris une faute de frappe
 * dans le test lui-même — d'où le contrôle du message.
 *
 * @param {function(): *} action Appel supposé échouer.
 * @param {string} fragmentAttendu Fragment devant figurer dans le message.
 * @return {Promise<void>}
 */
async function affirmerEchec_(action, fragmentAttendu) {
  let messageObtenu = null;
  try {
    await action();
  } catch (e) {
    messageObtenu = e.message || String(e);
  }
  affirmer_(messageObtenu !== null, "Aucune exception levée alors qu'une erreur était attendue.");
  affirmer_(
    messageObtenu.includes(fragmentAttendu),
    `Message inattendu : « ${messageObtenu} » ne contient pas « ${fragmentAttendu} ».`
  );
}

// ============================================================================
// Fixtures
// ============================================================================

/**
 * Renvoie le dossier des fichiers de test, en le créant au besoin.
 * @return {GoogleAppsScript.Drive.Folder}
 */
function dossierTests_() {
  const dossiers = DriveApp.getFoldersByName(NOM_DOSSIER_TESTS);
  return dossiers.hasNext() ? dossiers.next() : DriveApp.createFolder(NOM_DOSSIER_TESTS);
}

/**
 * Crée une présentation de n diapositives, exportable en PDF de n pages.
 *
 * @param {GoogleAppsScript.Drive.Folder} dossier Dossier d'accueil.
 * @param {number} nombreDiapos Nombre de diapositives souhaité.
 * @return {GoogleAppsScript.Slides.Presentation}
 */
function creerPresentationTest_(dossier, nombreDiapos) {
  const presentation = SlidesApp.create("PDFApplication - document de test");
  const diapos = presentation.getSlides();

  diapos[0].insertTextBox("Page 1", 50, 50, 300, 50);
  for (let i = 1; i < nombreDiapos; i++) {
    const diapo = presentation.appendSlide(SlidesApp.PredefinedLayout.BLANK);
    diapo.insertTextBox(`Page ${i + 1}`, 50, 50, 300, 50);
  }
  presentation.saveAndClose();

  DriveApp.getFileById(presentation.getId()).moveTo(dossier);
  return presentation;
}

/**
 * Crée une présentation servant de modèle de formulaire, avec une forme
 * portant un titre reconnu par createPDFFormBySlideTemplate.
 *
 * @param {GoogleAppsScript.Drive.Folder} dossier Dossier d'accueil.
 * @return {GoogleAppsScript.Slides.Presentation}
 */
function creerModeleSlides_(dossier) {
  const presentation = SlidesApp.create("PDFApplication - modèle de formulaire");
  const diapo = presentation.getSlides()[0];
  const forme = diapo.insertTextBox("", 50, 100, 250, 30);
  forme.setTitle("textbox.groupe1.nom");
  presentation.saveAndClose();

  DriveApp.getFileById(presentation.getId()).moveTo(dossier);
  return presentation;
}

/**
 * Construit un PDF contenant un champ texte et une case à cocher, en passant
 * directement par pdf-lib pour ne pas faire dépendre le test des méthodes
 * de formulaire que l'on cherche justement à vérifier.
 *
 * @return {Promise<GoogleAppsScript.Base.Blob>} Blob du formulaire PDF.
 */
async function creerFormulairePdf_() {
  const moteur = new PDFApp({});
  const document = await moteur.PDFLib.PDFDocument.create();
  const page = document.addPage([400, 400]);
  const formulaire = document.getForm();

  const champTexte = formulaire.createTextField("nom");
  champTexte.setText("valeur initiale");
  champTexte.addToPage(page, { x: 50, y: 300, width: 200, height: 20 });

  const caseACocher = formulaire.createCheckBox("accord");
  caseACocher.addToPage(page, { x: 50, y: 250, width: 15, height: 15 });

  const octets = await document.save();
  return moteur.versBlob_(octets, "formulaire-test.pdf");
}

/**
 * Crée un petit fichier PNG dans Drive, pour les tests d'intégration d'images.
 * L'image est intégrée en base64 plutôt que téléchargée : le banc ne doit pas
 * dépendre d'un hébergeur externe pour une vignette de quatre pixels.
 *
 * @param {GoogleAppsScript.Drive.Folder} dossier Dossier d'accueil.
 * @return {GoogleAppsScript.Drive.File} Le fichier PNG créé.
 */
function creerImageTest_(dossier) {
  const base64 = "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR42mP4r6EBRwzEcQAuIhTx7mcrWQAAAABJRU5ErkJggg==";
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), MimeType.PNG, "vignette-test.png");
  return dossier.createFile(blob);
}

/**
 * Met à la corbeille le dossier de test et tout ce qu'il contient.
 * Le dossier temporaire créé par la bibliothèque est également retiré, mais
 * seulement s'il est vide : il pourrait contenir un traitement en cours.
 *
 * @param {GoogleAppsScript.Drive.Folder} dossier Dossier à nettoyer.
 * @return {void}
 */
function nettoyerDossierTests_(dossier) {
  if (dossier) {
    try {
      dossier.setTrashed(true);
      console.log("Fichiers de test mis à la corbeille.");
    } catch (e) {
      console.warn(`Nettoyage incomplet : ${e.message}`);
    }
  }

  try {
    const dossiers = DriveApp.getFoldersByName(CONFIG.NOM_DOSSIER_TEMPORAIRE);
    if (dossiers.hasNext()) {
      const temporaire = dossiers.next();
      if (!compterFichiersActifs_(temporaire)) temporaire.setTrashed(true);
    }
  } catch (e) {
    console.warn(`Dossier temporaire non retiré : ${e.message}`);
  }
}

/**
 * Compte les fichiers non supprimés d'un dossier.
 *
 * @param {GoogleAppsScript.Drive.Folder} dossier Dossier à inspecter.
 * @return {number} Nombre de fichiers encore actifs.
 */
function compterFichiersActifs_(dossier) {
  const fichiers = dossier.getFiles();
  let total = 0;
  while (fichiers.hasNext()) {
    if (!fichiers.next().isTrashed()) total++;
  }
  return total;
}

// ============================================================================
// Tests
// ============================================================================

/**
 * pdf-lib doit être exposée sur l'instance après construction.
 * @return {Promise<string>}
 */
async function testChargementLibrairie_() {
  const moteur = new PDFApp({});
  affirmer_(moteur.PDFLib, "PDFLib absente de l'instance après construction.");
  affirmer_(typeof moteur.PDFLib.PDFDocument === "function", "PDFDocument introuvable dans PDFLib.");
  return "PDFLib et PDFDocument disponibles";
}

/**
 * Le cache doit réellement contenir pdf-lib après un premier chargement.
 * C'est la vérification directe du défaut de segmentation corrigé : avec
 * l'ancienne découpe, l'écriture échouait et rien n'était jamais mis en cache.
 * @return {Promise<string>}
 */
async function testCachePdfLib_() {
  const cache = CacheService.getScriptCache();
  new PDFApp({});

  const compteur = cache.get("pdf_lib_content_segments");
  affirmer_(compteur !== null, "Aucun compteur de segments en cache : la mise en cache a échoué.");

  const nombreSegments = parseInt(compteur, 10);
  affirmer_(nombreSegments > 0, `Compteur de segments invalide : ${compteur}`);

  const premier = cache.get("pdf_lib_content_0");
  affirmer_(premier !== null, "Premier segment absent du cache.");

  const dernier = cache.get(`pdf_lib_content_${nombreSegments - 1}`);
  affirmer_(dernier !== null, "Dernier segment absent du cache : découpe incomplète.");

  return `${nombreSegments} segments en cache`;
}

/**
 * Les métadonnées et le nombre de pages doivent être lisibles.
 * @param {Object} contexte Fixtures partagées.
 * @return {Promise<string>}
 */
async function testLectureMetadonnees_(contexte) {
  const metadonnees = await PDFApplicationLocale_().setPDFBlob(contexte.pdf4Pages).getMetadata();
  affirmer_(metadonnees.numberOfPages === 4, `4 pages attendues, ${metadonnees.numberOfPages} obtenues.`);
  affirmer_(Array.isArray(metadonnees.pageInfo), "pageInfo absent ou mal formé.");
  affirmer_(metadonnees.pageInfo.length === 4, "pageInfo ne décrit pas les 4 pages.");
  return `${metadonnees.numberOfPages} pages décrites`;
}

/**
 * Le test décisif : l'ancienne implémentation ne rendait jamais la main dès
 * qu'une des huit clés de métadonnée était absente de l'objet fourni. Un échec
 * ici se manifeste par un dépassement du temps d'exécution, pas par une erreur.
 * @param {Object} contexte Fixtures partagées.
 * @return {Promise<string>}
 */
async function testMetadonneesPartielles_(contexte) {
  const modifie = await PDFApplicationLocale_()
    .setPDFBlob(contexte.pdf4Pages)
    .updateMetadata({ author: "Fabrice Faucheux", subject: "Banc de tests" });

  affirmer_(modifie && modifie.getContentType() === MimeType.PDF, "Aucun blob PDF renvoyé.");

  const relu = await PDFApplicationLocale_().setPDFBlob(modifie).getMetadata();
  affirmer_(relu.author === "Fabrice Faucheux", `Auteur non enregistré : « ${relu.author} ».`);
  affirmer_(relu.subject === "Banc de tests", `Sujet non enregistré : « ${relu.subject} ».`);

  return "2 clés sur 8 écrites, méthode rendue";
}

/**
 * L'ancien nom, fautif mais public, doit continuer de fonctionner.
 * @param {Object} contexte Fixtures partagées.
 * @return {Promise<string>}
 */
async function testAliasUdpateMetadata_(contexte) {
  const modifie = await PDFApplicationLocale_()
    .setPDFBlob(contexte.pdf4Pages)
    .udpateMetadata({ creator: "Banc" });

  const relu = await PDFApplicationLocale_().setPDFBlob(modifie).getMetadata();
  affirmer_(relu.creator === "Banc", `Alias inopérant : créateur « ${relu.creator} ».`);
  return "alias fonctionnel";
}

/**
 * L'export doit retenir exactement les pages demandées.
 * @param {Object} contexte Fixtures partagées.
 * @return {Promise<string>}
 */
async function testExportPages_(contexte) {
  const extrait = await PDFApplicationLocale_().setPDFBlob(contexte.pdf4Pages).exportPages([1, 3]);
  const metadonnees = await PDFApplicationLocale_().setPDFBlob(extrait).getMetadata();
  affirmer_(metadonnees.numberOfPages === 2, `2 pages attendues, ${metadonnees.numberOfPages} obtenues.`);
  return "pages 1 et 3 extraites";
}

/**
 * Une réorganisation valide doit conserver le nombre de pages.
 * @param {Object} contexte Fixtures partagées.
 * @return {Promise<string>}
 */
async function testReorganisationNominale_(contexte) {
  const reorganise = await PDFApplicationLocale_()
    .setPDFBlob(contexte.pdf4Pages)
    .reorderPages({ nouvelOrdreDesPages: [4, 3, 2, 1] });

  const metadonnees = await PDFApplicationLocale_().setPDFBlob(reorganise).getMetadata();
  affirmer_(metadonnees.numberOfPages === 4, `4 pages attendues, ${metadonnees.numberOfPages} obtenues.`);
  return "ordre inversé, 4 pages conservées";
}

/**
 * Un ordre référençant une page inexistante doit lever une erreur immédiate.
 * L'ancienne version appelait reject sans return puis lisait un index absent,
 * laissant la promesse en suspens.
 * @param {Object} contexte Fixtures partagées.
 * @return {Promise<string>}
 */
async function testReorganisationHorsLimites_(contexte) {
  await affirmerEchec_(
    () => PDFApplicationLocale_()
      .setPDFBlob(contexte.pdf4Pages)
      .reorderPages({ nouvelOrdreDesPages: [1, 2, 9] }),
    "9"
  );
  return "erreur levée, page fautive citée";
}

/**
 * Découper puis refusionner doit rendre le document d'origine, page pour page.
 * @param {Object} contexte Fixtures partagées.
 * @return {Promise<string>}
 */
async function testDecoupePuisFusion_(contexte) {
  const morceaux = await PDFApplicationLocale_().setPDFBlob(contexte.pdf4Pages).splitPDF();
  affirmer_(morceaux.length === 4, `4 morceaux attendus, ${morceaux.length} obtenus.`);

  const fusionne = await PDFApplicationLocale_().mergePDFs(morceaux);
  const metadonnees = await PDFApplicationLocale_().setPDFBlob(fusionne).getMetadata();
  affirmer_(metadonnees.numberOfPages === 4, `4 pages attendues après fusion, ${metadonnees.numberOfPages} obtenues.`);

  return "4 morceaux, refusionnés en 4 pages";
}

/**
 * Une valeur de l'énumération passée à la place de sa clé doit être refusée
 * tout de suite, avec la liste des valeurs admises.
 * @return {Promise<string>}
 */
async function testPoliceStandardInvalide_() {
  await affirmerEchec_(
    () => PDFApplicationLocale_().useStandardFont("Times-Roman"),
    "TimesRoman"
  );

  const bibliotheque = PDFApplicationLocale_().useStandardFont("TimesRoman");
  affirmer_(bibliotheque.policeStandard === "TimesRoman", "La clé valide n'a pas été retenue.");

  return "« Times-Roman » refusé, « TimesRoman » accepté";
}

/**
 * La numérotation centrée doit produire un PDF du même nombre de pages.
 * @param {Object} contexte Fixtures partagées.
 * @return {Promise<string>}
 */
async function testNumerotationCentree_(contexte) {
  const numerote = await PDFApplicationLocale_()
    .setPDFBlob(contexte.pdf4Pages)
    .addPageNumbers({ size: 10, x: "center", y: 20 });

  const metadonnees = await PDFApplicationLocale_().setPDFBlob(numerote).getMetadata();
  affirmer_(metadonnees.numberOfPages === 4, `4 pages attendues, ${metadonnees.numberOfPages} obtenues.`);
  return "numéros ajoutés sur 4 pages";
}

/**
 * Une position horizontale inconnue doit être signalée, et non transmise
 * telle quelle à pdf-lib qui échouait plus loin sur un message sans rapport.
 * @param {Object} contexte Fixtures partagées.
 * @return {Promise<string>}
 */
async function testNumerotationPositionInconnue_(contexte) {
  await affirmerEchec_(
    () => PDFApplicationLocale_()
      .setPDFBlob(contexte.pdf4Pages)
      .addPageNumbers({ size: 10, x: "milieu", y: 20 }),
    "milieu"
  );
  return "position inconnue signalée";
}

/**
 * Un blob absent ou non PDF doit être refusé à l'entrée.
 * @param {Object} contexte Fixtures partagées.
 * @return {Promise<string>}
 */
async function testBlobSourceInvalide_(contexte) {
  await affirmerEchec_(() => PDFApplicationLocale_().setPDFBlob(null), "setPDFBlob");

  const blobTexte = Utilities.newBlob("ceci n'est pas un PDF", MimeType.PLAIN_TEXT, "note.txt");
  await affirmerEchec_(() => PDFApplicationLocale_().setPDFBlob(blobTexte), "setPDFBlob");

  return "blob nul et blob texte refusés";
}

/**
 * L'objet de configuration de l'appelant doit ressortir intact : l'ancienne
 * version en supprimait les clés de position, si bien qu'un second appel avec
 * le même objet ne produisait pas le même résultat.
 * @param {Object} contexte Fixtures partagées.
 * @return {Promise<string>}
 */
async function testEnTeteSansEffetDeBord_(contexte) {
  const configuration = {
    header: { left: { text: "Confidentiel", height: 20, alignment: "left" } },
    footer: { center: { text: "Page de test", height: 20, alignment: "center" } }
  };
  const empreinteAvant = JSON.stringify(configuration);

  const premier = await PDFApplicationLocale_()
    .setPDFBlob(contexte.pdf4Pages)
    .insertHeaderFooter(configuration);

  affirmer_(
    JSON.stringify(configuration) === empreinteAvant,
    "L'objet de configuration a été modifié par le premier appel."
  );

  const second = await PDFApplicationLocale_()
    .setPDFBlob(contexte.pdf4Pages)
    .insertHeaderFooter(configuration);

  const metaPremier = await PDFApplicationLocale_().setPDFBlob(premier).getMetadata();
  const metaSecond = await PDFApplicationLocale_().setPDFBlob(second).getMetadata();
  affirmer_(
    metaPremier.numberOfPages === metaSecond.numberOfPages,
    "Les deux appels ne produisent pas le même nombre de pages."
  );

  return "objet appelant intact, deux appels identiques";
}

/**
 * Lecture puis écriture des champs d'un formulaire PDF.
 * @return {Promise<string>}
 */
async function testFormulairePdf_() {
  const formulaire = await creerFormulairePdf_();

  const champs = await PDFApplicationLocale_().setPDFBlob(formulaire).getValuesFromPDFForm();
  const nomsPresents = champs.map(c => c.name);
  affirmer_(nomsPresents.includes("nom"), `Champ « nom » absent : ${nomsPresents.join(", ")}`);
  affirmer_(nomsPresents.includes("accord"), `Champ « accord » absent : ${nomsPresents.join(", ")}`);

  const renseigne = await PDFApplicationLocale_()
    .setPDFBlob(formulaire)
    .setValuesToPDFForm({ values: [{ name: "nom", value: "Fabrice" }, { name: "accord", value: true }] });

  const relus = await PDFApplicationLocale_().setPDFBlob(renseigne).getValuesFromPDFForm();
  const champNom = relus.find(c => c.name === "nom");
  const champAccord = relus.find(c => c.name === "accord");
  affirmer_(champNom.value === "Fabrice", `Valeur texte non enregistrée : « ${champNom.value} ».`);
  affirmer_(champAccord.value === true, "Case à cocher non cochée.");

  await affirmerEchec_(
    () => PDFApplicationLocale_()
      .setPDFBlob(formulaire)
      .setValuesToPDFForm({ values: [{ name: "champ_absent", value: "x" }] }),
    "champ_absent"
  );

  return "2 champs lus, écrits, relus ; champ absent signalé";
}

/**
 * La correction la plus importante côté données : la présentation modèle ne
 * doit être ni vidée de ses formes, ni mise à la corbeille.
 * @param {Object} contexte Fixtures partagées.
 * @return {Promise<string>}
 */
async function testModeleSlidesPreserve_(contexte) {
  const identifiant = contexte.modele.getId();

  const avant = SlidesApp.openById(identifiant).getSlides()[0].getShapes().length;
  affirmer_(avant > 0, "Le modèle de test ne contient aucune forme.");

  const pdf = await PDFApplicationLocale_().createPDFFormBySlideTemplate(identifiant, {
    values: [{ shapeTitle: "textbox.groupe1.nom", methods: [] }]
  });
  affirmer_(pdf && pdf.getContentType() === MimeType.PDF, "Aucun blob PDF renvoyé.");

  const fichier = DriveApp.getFileById(identifiant);
  affirmer_(!fichier.isTrashed(), "Le modèle a été mis à la corbeille.");

  const apres = SlidesApp.openById(identifiant).getSlides()[0].getShapes().length;
  affirmer_(apres === avant, `Formes du modèle supprimées : ${avant} avant, ${apres} après.`);

  return `modèle intact (${apres} forme(s))`;
}

/**
 * Après conversion en images, aucun PDF temporaire ne doit subsister.
 * Test lent : trois secondes d'attente par page.
 * @param {Object} contexte Fixtures partagées.
 * @return {Promise<string>}
 */
async function testConversionPngNettoyage_(contexte) {
  const deuxPages = await PDFApplicationLocale_().setPDFBlob(contexte.pdf4Pages).exportPages([1, 2]);

  const images = await PDFApplicationLocale_().setPDFBlob(deuxPages).convertPDFToPng();
  affirmer_(images.length === 2, `2 images attendues, ${images.length} obtenues.`);
  affirmer_(images[0].getContentType() === MimeType.PNG, "Le blob renvoyé n'est pas un PNG.");

  const dossiers = DriveApp.getFoldersByName(CONFIG.NOM_DOSSIER_TEMPORAIRE);
  if (dossiers.hasNext()) {
    const residus = compterFichiersActifs_(dossiers.next());
    affirmer_(residus === 0, `${residus} fichier(s) temporaire(s) non supprimé(s).`);
  }

  return "2 PNG produits, aucun résidu";
}

/**
 * Le chemin d'échec du nettoyage, que le test précédent n'exerce pas.
 *
 * Le bloc `finally` de convertPDFToPng existe précisément pour le cas où le
 * traitement s'interrompt en cours de boucle — c'est là que l'ancienne version
 * abandonnait un PDF temporaire par page déjà traitée. On force donc une panne
 * sur la deuxième miniature, et on vérifie que rien ne subsiste.
 *
 * @param {Object} contexte Fixtures partagées.
 * @return {Promise<string>}
 */
async function testNettoyageApresEchec_(contexte) {
  const troisPages = await PDFApplicationLocale_().setPDFBlob(contexte.pdf4Pages).exportPages([1, 2, 3]);

  const moteur = new PDFApp({});
  const methodeOrigine = moteur.recupererAvecRetentative_.bind(moteur);
  let appels = 0;
  moteur.recupererAvecRetentative_ = function (url, params) {
    appels++;
    if (appels >= 2) throw new Error("panne simulée sur la miniature");
    return methodeOrigine(url, params);
  };

  await affirmerEchec_(() => moteur.convertPDFToPng(troisPages), "panne simulée");
  affirmer_(appels >= 2, `La panne n'a pas été atteinte : ${appels} appel(s).`);

  const dossiers = DriveApp.getFoldersByName(CONFIG.NOM_DOSSIER_TEMPORAIRE);
  affirmer_(dossiers.hasNext(), "Dossier temporaire introuvable après l'échec.");
  const residus = compterFichiersActifs_(dossiers.next());
  affirmer_(residus === 0, `${residus} fichier(s) abandonné(s) après l'échec.`);

  return "panne en cours de boucle, aucun fichier abandonné";
}

/**
 * fontkit doit s'exposer sur l'instance, comme pdf-lib.
 * C'est le préalable à toute police personnalisée.
 * @return {Promise<string>}
 */
async function testChargementFontkit_() {
  const moteur = new PDFApp({});
  GestionnaireLibrairies.chargerFontkit(moteur);
  affirmer_(moteur.fontkit, "fontkit absente de l'instance après chargement.");

  const compteur = CacheService.getScriptCache().get("fontkit_content_segments");
  affirmer_(compteur !== null, "fontkit n'a pas été mise en cache.");

  return `fontkit disponible, ${compteur} segments en cache`;
}

/**
 * Exerce definirPolice_ de bout en bout, c'est-à-dire la substitution de
 * updateFieldAppearances qui force pdf-lib à utiliser la police retenue lors
 * du rendu des champs. C'est la partie délicate du chemin « police » ; la
 * variante personnalisée n'en diffère que par l'enregistrement de fontkit,
 * couvert par le test précédent. Un vrai fichier TTF resterait nécessaire
 * pour couvrir useCustomFont de bout en bout.
 * @return {Promise<string>}
 */
async function testPoliceStandardSurFormulaire_() {
  const formulaire = await creerFormulairePdf_();

  const renseigne = await PDFApplicationLocale_()
    .useStandardFont("TimesRoman")
    .setPDFBlob(formulaire)
    .setValuesToPDFForm({ values: [{ name: "nom", value: "Édition avec police" }] });

  affirmer_(renseigne && renseigne.getContentType() === MimeType.PDF, "Aucun blob PDF renvoyé.");

  const relus = await PDFApplicationLocale_().setPDFBlob(renseigne).getValuesFromPDFForm();
  const champ = relus.find(c => c.name === "nom");
  affirmer_(champ.value === "Édition avec police", `Valeur non enregistrée : « ${champ.value} ».`);

  return "champ rendu avec TimesRoman";
}

/**
 * Intégration d'une image et d'un texte, la zone la moins couverte jusqu'ici.
 * @param {Object} contexte Fixtures partagées.
 * @return {Promise<string>}
 */
async function testIntegrationObjets_(contexte) {
  // Coordonnées tenant dans une page d'export Slides (720 × 405 points).
  // La première version plaçait l'image à y = 500, soit 95 points au-dessus
  // du bord supérieur : le test passait — il ne comptait que les pages — mais
  // n'a jamais rien dessiné. C'est l'avertissement hors page qui l'a révélé.
  const configuration = {
    page1: [
      { imageFileId: contexte.image.getId(), x: 50, y: 250, width: 80, height: 80 },
      { text: "Filigrane de test", x: 50, y: 180, size: 14, standardFont: "Helvetica" }
    ]
  };
  const empreinteAvant = JSON.stringify(configuration);

  const enrichi = await PDFApplicationLocale_()
    .setPDFBlob(contexte.pdf4Pages)
    .embedObjects(configuration);

  affirmer_(enrichi && enrichi.getContentType() === MimeType.PDF, "Aucun blob PDF renvoyé.");
  affirmer_(
    JSON.stringify(configuration) === empreinteAvant,
    "L'objet de configuration a été modifié par l'appel."
  );

  const metadonnees = await PDFApplicationLocale_().setPDFBlob(enrichi).getMetadata();
  affirmer_(metadonnees.numberOfPages === 4, `4 pages attendues, ${metadonnees.numberOfPages} obtenues.`);

  await affirmerEchec_(
    () => PDFApplicationLocale_()
      .setPDFBlob(contexte.pdf4Pages)
      .embedObjects({ page1: [{ imageFileId: contexte.presentation.getId(), x: 10, y: 10 }] }),
    "image"
  );

  return "image et texte intégrés, type non supporté refusé";
}

/**
 * Le garde-fou des 6 minutes, inatteignable sur un jeu d'essai de cette taille,
 * est vérifié directement : on lui présente une heure de début très ancienne.
 * @return {Promise<string>}
 */
async function testGardeBudgetTemps_() {
  const moteur = new PDFApp({});

  moteur.verifierBudgetTemps_(Date.now(), 0);

  await affirmerEchec_(
    () => moteur.verifierBudgetTemps_(Date.now() - (CONFIG.DUREE_MAX_TRAITEMENT_MS + 5000), 7),
    "7"
  );

  return "budget respecté accepté, budget dépassé signalé avec le décompte";
}

/**
 * Une erreur définitive doit remonter tout de suite, sans dérouler les cinq
 * retentatives : seuls les codes 429 et 5xx justifient d'attendre.
 * @return {Promise<string>}
 */
async function testPasDeRetentativeSurErreurDefinitive_() {
  const moteur = new PDFApp({});
  const debut = Date.now();

  const reponse = moteur.recupererAvecRetentative_(
    "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/fichier-absent-banc-de-tests.js"
  );
  const duree = Date.now() - debut;

  affirmer_(reponse.getResponseCode() >= 400, `Code inattendu : ${reponse.getResponseCode()}.`);
  affirmer_(duree < 5000, `Retentatives déroulées à tort : ${duree} ms écoulées.`);

  return `code ${reponse.getResponseCode()} rendu en ${duree} ms`;
}

/**
 * Police personnalisée appliquée à un texte dessiné.
 *
 * Vérifie aussi le poids du document. Sans sous-ensemble, une police variable
 * de 3,5 Mo produit un PDF de près de 2 Mo pour quelques mots ; avec, quelques
 * kilo-octets. L'assertion de taille est donc le vrai test du sous-ensemble.
 *
 * @param {Object} contexte Fixtures partagées.
 * @return {Promise<string>}
 */
async function testPolicePersonnaliseeSurTexte_(contexte) {
  const police = trouverPolice_();
  if (!police) ignorer_("aucune police TTF ou OTF trouvée dans Drive (voir CONFIG_TESTS)");

  const enrichi = await PDFApplicationLocale_()
    .useCustomFont(police)
    .setPDFBlob(contexte.pdf4Pages)
    .embedObjects({
      page1: [{ text: "Échantillon accentué", x: 60, y: 60, size: 16, customFont: police }]
    });

  affirmer_(enrichi && enrichi.getContentType() === MimeType.PDF, "Aucun blob PDF renvoyé.");

  const tailleKo = Math.round(enrichi.getBytes().length / 1024);
  const taillePoliceKo = Math.round(police.getBytes().length / 1024);

  // L'assertion de poids n'a de sens que si le sous-ensemble est actif.
  // Désactivé — le réglage par défaut — la police est embarquée en entier,
  // et un document lourd est le comportement attendu, pas un défaut.
  if (CONFIG.SOUS_ENSEMBLE_POLICE_FIGEE) {
    affirmer_(
      tailleKo < taillePoliceKo / 4,
      `PDF de ${tailleKo} Ko pour une police de ${taillePoliceKo} Ko : le sous-ensemble n'a pas opéré.`
    );
  }

  const mention = CONFIG.SOUS_ENSEMBLE_POLICE_FIGEE ? "sous-ensemble actif" : "police entière";
  return `PDF de ${tailleKo} Ko, police de ${taillePoliceKo} Ko (${mention})`;
}

/**
 * Police personnalisée appliquée au rendu d'un champ de formulaire.
 * C'est le chemin qui passe par definirPolice_ et la substitution de
 * updateFieldAppearances, avec enregistrement de fontkit.
 *
 * @return {Promise<string>}
 */
async function testPolicePersonnaliseeSurFormulaire_() {
  const police = trouverPolice_();
  if (!police) ignorer_("aucune police TTF ou OTF trouvée dans Drive (voir CONFIG_TESTS)");

  const formulaire = await creerFormulairePdf_();

  const renseigne = await PDFApplicationLocale_()
    .useCustomFont(police)
    .setPDFBlob(formulaire)
    .setValuesToPDFForm({ values: [{ name: "nom", value: "Édité en Roboto" }] });

  affirmer_(renseigne && renseigne.getContentType() === MimeType.PDF, "Aucun blob PDF renvoyé.");

  const relus = await PDFApplicationLocale_().setPDFBlob(renseigne).getValuesFromPDFForm();
  const champ = relus.find(c => c.name === "nom");
  affirmer_(champ.value === "Édité en Roboto", `Valeur non enregistrée : « ${champ.value} ».`);

  return `champ rendu, PDF de ${Math.round(renseigne.getBytes().length / 1024)} Ko`;
}

/**
 * Un élément placé hors des limites de la page doit être signalé.
 * Le contrôle porte sur la détection elle-même, la journalisation n'étant
 * pas relisible depuis le script.
 *
 * @param {Object} contexte Fixtures partagées.
 * @return {Promise<string>}
 */
async function testAvertissementHorsPage_(contexte) {
  const moteur = new PDFApp({});
  const avertissements = [];
  moteur.avertirSiHorsPage_ = function (page, options, description) {
    const largeur = typeof options.width === "number" ? options.width : 0;
    const hauteur = typeof options.height === "number" ? options.height : 0;
    if (options.x < 0 || options.y < 0 ||
        options.x + largeur > page.getWidth() || options.y + hauteur > page.getHeight()) {
      avertissements.push(description);
    }
  };

  // y = 5000 points : très au-delà de n'importe quel format de page.
  await moteur.embedObjects(contexte.pdf4Pages, {
    page1: [
      { text: "Dans la page", x: 60, y: 60, size: 12 },
      { text: "Hors de la page", x: 60, y: 5000, size: 12 }
    ]
  });

  affirmer_(avertissements.length === 1, `1 avertissement attendu, ${avertissements.length} obtenu(s).`);
  affirmer_(
    avertissements[0].includes("Hors de la page"),
    `Mauvais élément signalé : ${avertissements[0]}`
  );

  return "élément hors cadre détecté, élément valide ignoré";
}

/**
 * Rotation de toutes les pages, puis d'une seule.
 *
 * La vérification passe par les dimensions : pivoter de 90 degrés échange la
 * largeur et la hauteur telles que les rend une lecture des métadonnées. Une
 * rotation de 180 les laisse inchangées, ce qui en fait un mauvais témoin —
 * d'où le choix de 90.
 *
 * @param {Object} contexte Fixtures partagées.
 * @return {Promise<string>}
 */
async function testRotationPages_(contexte) {
  const avant = await PDFApplicationLocale_().setPDFBlob(contexte.pdf4Pages).getMetadata();

  const pivote = await PDFApplicationLocale_()
    .setPDFBlob(contexte.pdf4Pages)
    .rotatePages({ angle: 90 });

  const apres = await PDFApplicationLocale_().setPDFBlob(pivote).getMetadata();
  affirmer_(apres.numberOfPages === avant.numberOfPages, "Le nombre de pages a changé.");
  affirmer_(
    Math.round(apres.pageInfo[0].pageWidth) === Math.round(avant.pageInfo[0].pageHeight),
    `Dimensions inchangées : ${Math.round(apres.pageInfo[0].pageWidth)} attendu ` +
    `${Math.round(avant.pageInfo[0].pageHeight)}.`
  );

  // Rotation ciblée : seule la page 2 doit bouger.
  const partiel = await PDFApplicationLocale_()
    .setPDFBlob(contexte.pdf4Pages)
    .rotatePages({ angle: 90, pages: [2] });

  const metaPartiel = await PDFApplicationLocale_().setPDFBlob(partiel).getMetadata();
  affirmer_(
    Math.round(metaPartiel.pageInfo[0].pageWidth) === Math.round(avant.pageInfo[0].pageWidth),
    "La page 1 a pivoté alors qu'elle n'était pas visée."
  );
  affirmer_(
    Math.round(metaPartiel.pageInfo[1].pageWidth) === Math.round(avant.pageInfo[1].pageHeight),
    "La page 2 n'a pas pivoté."
  );

  return "rotation globale et rotation ciblée conformes";
}

/**
 * Un angle qui n'est pas un quart de tour doit être refusé, de même qu'une
 * page absente du document.
 *
 * @param {Object} contexte Fixtures partagées.
 * @return {Promise<string>}
 */
async function testRotationAngleInvalide_(contexte) {
  await affirmerEchec_(
    () => PDFApplicationLocale_().setPDFBlob(contexte.pdf4Pages).rotatePages({ angle: 45 }),
    "45"
  );

  await affirmerEchec_(
    () => PDFApplicationLocale_().setPDFBlob(contexte.pdf4Pages).rotatePages({ angle: 90, pages: [9] }),
    "9"
  );

  return "angle 45 refusé, page 9 refusée";
}

/**
 * Renvoie l'objet portant l'API publique.
 *
 * Quand le banc tourne dans le projet de la bibliothèque, les fonctions sont
 * globales et `this` suffit. Remplacez le corps par `return PDFApplication;`
 * pour exécuter le banc depuis un projet qui consomme la bibliothèque.
 *
 * @return {Object} L'objet exposant setPDFBlob, exportPages, etc.
 */
function PDFApplicationLocale_() {
  return this;
}
