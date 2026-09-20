/**
 * ============================================================================
 * MODULE 3 : MOTEUR PDF (CLASSE PDFApp)
 * ============================================================================
 *
 * Toutes les méthodes publiques sont `async` et renvoient donc une promesse,
 * comme auparavant. Elles n'enveloppent plus leur corps dans `new Promise`.
 * La raison est concrète : dans l'ancienne écriture, une exception levée dans
 * la fonction `async` passée à `new Promise` n'était pas transmise à la
 * promesse retournée, et l'appelant restait bloqué sur une promesse qui ne se
 * réglait jamais — sans message d'erreur.
 */

class PDFApp {

  /**
   * Prépare l'instance et charge les librairies nécessaires.
   *
   * @param {Object} e Contexte porté par la bibliothèque : police standard ou
   *   police personnalisée éventuellement définies par l'appelant.
   */
  constructor(e = {}) {
    GestionnaireLibrairies.chargerPdfLib(this);

    if (e.policePersonnalisee && e.policePersonnalisee.toString() === "Blob") {
      GestionnaireLibrairies.chargerFontkit(this);
      this.policeCustomisee = e.policePersonnalisee;
    } else if (e.policeStandard && typeof e.policeStandard === "string") {
      this.policeStandard = e.policeStandard;
    }
  }

  // ==========================================================================
  // Utilitaires d'infrastructure
  // ==========================================================================

  /**
   * Évalue le code source d'une librairie dans le contexte de l'instance.
   *
   * L'appel à `eval` est ici volontaire et ne peut pas être remplacé : les
   * librairies UMD s'auto-enregistrent sur l'objet `this` du contexte
   * d'évaluation, ce qui rend `this.PDFLib` et `this.fontkit` disponibles.
   * Ne pas transformer cette méthode en fonction fléchée, et ne pas en
   * extraire l'appel : `this` cesserait de désigner l'instance.
   *
   * @param {string} jsLib Code source de la librairie.
   * @return {void}
   */
  evaluerLibrairie_(jsLib) {
    // Apps Script n'a ni setTimeout ni clearTimeout. Les deux sont définis
    // ici, dans la portée de l'évaluation : le code évalué les résout comme
    // n'importe quelle variable de la portée englobante.
    //
    // C'est indispensable pour fontkit, dont le shim « process » hérité de
    // browserify exécute `if (U === setTimeout)`. Cette seule référence, même
    // sans appel, lève une ReferenceError qui remonte sous la forme
    // « setTimeout is not defined » au moment de sous-ensembler une police.
    //
    // L'exécution est synchrone : il n'y a pas de boucle d'événements ici, et
    // c'est déjà le parti pris de la substitution appliquée à pdf-lib.
    const setTimeout = (rappel, delai) => {
      if (delai > 0) Utilities.sleep(delai);
      if (typeof rappel === "function") rappel();
      return 0;
    };
    const clearTimeout = () => {};

    // Référencées pour que le moteur ne les élimine pas comme inutilisées.
    void setTimeout;
    void clearTimeout;

    eval(jsLib);
  }

  /**
   * Effectue une requête HTTP avec retentatives et recul exponentiel.
   *
   * Les codes 429 et 5xx déclenchent une retentative même lorsque l'appelant
   * demande `muteHttpExceptions` : ce sont précisément les réponses
   * transitoires que la retentative existe pour absorber, et l'ancienne
   * version les laissait passer sans réessayer.
   *
   * @param {string} url URL à appeler.
   * @param {Object} [params] Paramètres transmis à UrlFetchApp.
   * @return {GoogleAppsScript.URL_Fetch.HTTPResponse} La réponse obtenue.
   */
  recupererAvecRetentative_(url, params = {}) {
    const parametres = { muteHttpExceptions: true, ...params };
    let derniereErreur = null;

    for (let tentative = 1; tentative <= CONFIG.MAX_TENTATIVES_HTTP; tentative++) {
      try {
        const reponse = UrlFetchApp.fetch(url, parametres);
        const code = reponse.getResponseCode();
        const transitoire = code === 429 || (code >= 500 && code < 600);

        if (!transitoire) return reponse;
        derniereErreur = new Error(`HTTP ${code} : ${reponse.getContentText().substring(0, 200)}`);
      } catch (e) {
        derniereErreur = e;
      }

      if (tentative < CONFIG.MAX_TENTATIVES_HTTP) {
        const delai = Math.pow(2, tentative) * CONFIG.DELAI_BASE_RETENTATIVE_MS
          + Math.round(Math.random() * 500);
        Utilities.sleep(delai);
      }
    }

    throw derniereErreur;
  }

  /**
   * Charge un blob PDF en document pdf-lib.
   *
   * @param {GoogleAppsScript.Base.Blob} blob Blob PDF.
   * @return {Promise<Object>} Document pdf-lib.
   */
  async chargerDocument_(blob) {
    if (!blob || typeof blob.getBytes !== "function") {
      throw new Error(t("BLOB_SOURCE_INVALIDE"));
    }
    return await this.PDFLib.PDFDocument.load(new Uint8Array(blob.getBytes()));
  }

  /**
   * Convertit un document pdf-lib enregistré en blob PDF Apps Script.
   *
   * @param {Uint8Array} octets Octets renvoyés par PDFDocument.save().
   * @param {string} nom Nom du fichier produit.
   * @return {GoogleAppsScript.Base.Blob} Le blob PDF.
   */
  versBlob_(octets, nom) {
    return Utilities.newBlob([...new Int8Array(octets)], MimeType.PDF, nom);
  }

  /**
   * Vérifie qu'il reste du temps d'exécution avant la coupure de la plateforme.
   *
   * @param {number} heureDebut Horodatage de début du traitement.
   * @param {number} pagesTraitees Nombre de pages déjà traitées.
   * @return {void}
   */
  verifierBudgetTemps_(heureDebut, pagesTraitees) {
    if (Date.now() - heureDebut > CONFIG.DUREE_MAX_TRAITEMENT_MS) {
      throw new Error(t("BUDGET_TEMPS_DEPASSE", String(pagesTraitees)));
    }
  }

  /**
   * Signale un élément dessiné en dehors des limites de la page.
   *
   * pdf-lib accepte n'importe quelles coordonnées sans se plaindre : un élément
   * placé hors cadre est simplement absent du rendu, sans exception ni trace.
   * C'est le mode d'échec le plus coûteux à diagnostiquer, parce que rien ne
   * distingue « mal placé » de « jamais ajouté ». Le piège est d'autant plus
   * courant que les formats diffèrent beaucoup : 595 × 842 points pour un A4
   * portrait, 720 × 405 pour un export Google Slides en paysage.
   *
   * @param {Object} page Page pdf-lib.
   * @param {Object} options Options de dessin, contenant x et y.
   * @param {string} description Élément concerné, pour le message.
   * @return {void}
   */
  /**
   * Signale une police volumineuse embarquée sans sous-ensemble.
   *
   * Sans sous-ensemble, la police entière est copiée dans chaque document :
   * une police variable de 3,5 Mo ajoute près de 2 Mo à un PDF d'une page.
   * L'information est utile avant d'envoyer le résultat par courriel ou de
   * le multiplier sur un lot de documents.
   *
   * @param {GoogleAppsScript.Base.Blob} blobPolice Blob de la police.
   * @param {boolean} sousEnsemble Si le sous-ensemble est actif.
   * @return {void}
   */
  avertirSiPoliceVolumineuse_(blobPolice, sousEnsemble) {
    if (sousEnsemble || !blobPolice) return;

    const octets = blobPolice.getBytes().length;
    if (octets > CONFIG.SEUIL_AVERTISSEMENT_POLICE_OCTETS) {
      console.warn(
        `Police de ${Math.round(octets / 1024)} Ko embarquée en entier : ` +
        `chaque document produit en portera le poids. ` +
        `Une police statique allégerait sensiblement le résultat.`
      );
    }
  }

  avertirSiHorsPage_(page, options, description) {
    if (!CONFIG.AVERTIR_HORS_PAGE) return;

    const { x, y } = options;
    if (typeof x !== "number" || typeof y !== "number") return;

    const largeurPage = page.getWidth();
    const hauteurPage = page.getHeight();
    const largeur = typeof options.width === "number" ? options.width : 0;
    const hauteur = typeof options.height === "number" ? options.height : 0;

    if (x < 0 || y < 0 || x + largeur > largeurPage || y + hauteur > hauteurPage) {
      console.warn(
        `${description} sort de la page : position (${Math.round(x)}, ${Math.round(y)}), ` +
        `encombrement ${Math.round(largeur)} × ${Math.round(hauteur)}, ` +
        `page ${Math.round(largeurPage)} × ${Math.round(hauteurPage)} points. ` +
        `L'élément ne sera pas visible. Rappel : l'origine d'un PDF est en bas à gauche.`
      );
    }
  }

  /**
   * Renvoie le dossier Drive dédié aux fichiers temporaires, en le créant
   * au besoin. Les fichiers intermédiaires ne sont plus déposés à la racine
   * de Mon Drive, où ils se mélangeaient aux documents de l'utilisateur.
   *
   * @return {GoogleAppsScript.Drive.Folder} Le dossier temporaire.
   */
  dossierTemporaire_() {
    const dossiers = DriveApp.getFoldersByName(CONFIG.NOM_DOSSIER_TEMPORAIRE);
    return dossiers.hasNext()
      ? dossiers.next()
      : DriveApp.createFolder(CONFIG.NOM_DOSSIER_TEMPORAIRE);
  }

  // ==========================================================================
  // Opérations sur les pages
  // ==========================================================================

  /**
   * Exporte des pages précises d'un blob PDF.
   *
   * @param {GoogleAppsScript.Base.Blob} blobPdf Blob PDF source.
   * @param {number[]} numerosPages Numéros des pages à exporter, à partir de 1.
   * @return {Promise<GoogleAppsScript.Base.Blob>} Blob PDF des pages exportées.
   */
  async exportPages(blobPdf, numerosPages) {
    if (!Array.isArray(numerosPages) || numerosPages.length === 0) {
      throw new Error(t("PAGES_A_EXPORTER_MANQUANTES"));
    }

    const donneesPdf = await this.chargerDocument_(blobPdf);
    const docPdf = await this.PDFLib.PDFDocument.create();
    const pages = await docPdf.copyPages(donneesPdf, donneesPdf.getPageIndices());

    pages.forEach((page, i) => {
      if (numerosPages.includes(i + 1)) docPdf.addPage(page);
    });

    const octets = await docPdf.save();
    return this.versBlob_(octets, `nouveau_${blobPdf.getName()}`);
  }

  /**
   * Divise chaque page d'un PDF en un blob PDF distinct.
   *
   * @param {GoogleAppsScript.Base.Blob} blobPdf Blob PDF source.
   * @return {Promise<GoogleAppsScript.Base.Blob[]>} Un blob par page.
   */
  async splitPDF(blobPdf) {
    const heureDebut = Date.now();
    const donneesPdf = await this.chargerDocument_(blobPdf);
    const nombreDePages = donneesPdf.getPageCount();
    const blobsPdf = [];

    for (let i = 0; i < nombreDePages; i++) {
      this.verifierBudgetTemps_(heureDebut, i);
      const docPdf = await this.PDFLib.PDFDocument.create();
      const [page] = await docPdf.copyPages(donneesPdf, [i]);
      docPdf.addPage(page);
      const octets = await docPdf.save();
      blobsPdf.push(this.versBlob_(octets, `page${i + 1}.pdf`));
    }

    return blobsPdf;
  }

  /**
   * Réorganise les pages d'un blob PDF.
   *
   * @param {GoogleAppsScript.Base.Blob} blobPdf Blob PDF source.
   * @param {Object} objet Paramètres de réorganisation.
   * @param {number[]} objet.nouvelOrdreDesPages Nouvel ordre des pages.
   * @param {boolean} [objet.ignorerPagesSautees] Si vrai, les pages absentes du
   *   nouvel ordre sont supprimées ; sinon elles sont ajoutées à la fin.
   * @return {Promise<GoogleAppsScript.Base.Blob>} Blob PDF réorganisé.
   */
  async reorderPages(blobPdf, objet) {
    if (typeof objet !== "object" || objet === null || Object.keys(objet).length === 0) {
      throw new Error(t("OBJET_REORGANISATION_INVALIDE"));
    }

    const { nouvelOrdreDesPages, ignorerPagesSautees } = objet;
    if (!Array.isArray(nouvelOrdreDesPages) || nouvelOrdreDesPages.length === 0) {
      throw new Error(t("ORDRE_PAGES_MANQUANT"));
    }

    const donneesPdf = await this.chargerDocument_(blobPdf);
    const nombreDePages = donneesPdf.getPageCount();
    const pageMax = Math.max(...nouvelOrdreDesPages);

    if (nombreDePages < pageMax || nombreDePages < nouvelOrdreDesPages.length) {
      throw new Error(t("ORDRE_PAGES_HORS_LIMITES", String(pageMax), String(nombreDePages)));
    }

    let pagesSautees = [];
    if (!ignorerPagesSautees && nombreDePages > nouvelOrdreDesPages.length) {
      pagesSautees = [...Array(nombreDePages)]
        .map((_, i) => i + 1)
        .filter(e => !nouvelOrdreDesPages.includes(e));
    }

    const docPdf = await this.PDFLib.PDFDocument.create();
    const pages = await docPdf.copyPages(donneesPdf, donneesPdf.getPageIndices());
    [...nouvelOrdreDesPages, ...pagesSautees].forEach(e => docPdf.addPage(pages[e - 1]));

    const octets = await docPdf.save();
    return this.versBlob_(octets, `nouveau_${blobPdf.getName()}`);
  }

  /**
   * Fusionne plusieurs blobs PDF en un seul document.
   *
   * Les fichiers sont chargés un par un plutôt que tous d'avance : une fusion
   * d'une vingtaine de documents volumineux épuisait autrement la mémoire
   * avant même d'avoir commencé.
   *
   * @param {GoogleAppsScript.Base.Blob[]} blobsPdf Blobs à fusionner, dans l'ordre.
   * @return {Promise<GoogleAppsScript.Base.Blob>} Blob PDF fusionné.
   */
  async mergePDFs(blobsPdf) {
    const docPdf = await this.PDFLib.PDFDocument.create();

    for (const blob of blobsPdf) {
      const donneesPdf = await this.chargerDocument_(blob);
      const pages = await docPdf.copyPages(donneesPdf, donneesPdf.getPageIndices());
      pages.forEach(page => docPdf.addPage(page));
    }

    const octets = await docPdf.save();
    return this.versBlob_(octets, "nouveau_FichierPDF.pdf");
  }

  /**
   * Ajoute un numéro de page sur chaque page.
   *
   * @param {GoogleAppsScript.Base.Blob} blobPdf Blob PDF source.
   * @param {Object} objet Format du numéro : size, x, y et options pdf-lib.
   *   `x` accepte un nombre, ou l'une des valeurs center, left, right.
   * @return {Promise<GoogleAppsScript.Base.Blob>} Blob PDF numéroté.
   */
  async addPageNumbers(blobPdf, objet) {
    if (!objet || typeof objet !== "object" || !["size", "x", "y"].every(e => e in objet)) {
      throw new Error(t("OBJET_NUMEROTATION_INVALIDE"));
    }

    const donneesPdf = await this.chargerDocument_(blobPdf);
    const docPdf = await this.PDFLib.PDFDocument.create();
    const pages = await docPdf.copyPages(donneesPdf, donneesPdf.getPageIndices());

    pages.forEach((page, i) => {
      let options = objet;
      if (isNaN(objet.x)) {
        const { width } = page.getSize();
        const positions = { center: width / 2, left: 20, right: width - 20 };
        const position = positions[String(objet.x).toLowerCase()];
        if (position === undefined) {
          throw new Error(t("POSITION_HORIZONTALE_INCONNUE", String(objet.x)));
        }
        options = { ...objet, x: position };
      }
      this.avertirSiHorsPage_(page, options, `Numéro de la page ${i + 1}`);
      page.drawText(`${i + 1}`, options);
      docPdf.addPage(page);
    });

    const octets = await docPdf.save();
    return this.versBlob_(octets, `nouveau_${blobPdf.getName()}`);
  }

  /**
   * Fait pivoter tout ou partie des pages.
   *
   * La rotation est relative : elle s'ajoute à l'orientation déjà inscrite
   * dans le document. C'est le comportement attendu quand on redresse un
   * scan de travers, et cela évite de perdre une orientation posée par
   * l'outil qui a produit le fichier.
   *
   * Aucune page n'est redessinée : seule l'entrée /Rotate change, ce qui rend
   * l'opération instantanée quelle que soit la taille du document.
   *
   * @param {GoogleAppsScript.Base.Blob} blobPdf Blob PDF source.
   * @param {Object} objet Paramètres de rotation.
   * @param {number} objet.angle Angle en degrés : 90, 180 ou 270.
   * @param {number[]} [objet.pages] Pages à faire pivoter, à partir de 1.
   *   Toutes les pages si la liste est absente ou vide.
   * @return {Promise<GoogleAppsScript.Base.Blob>} Blob PDF pivoté.
   */
  async rotatePages(blobPdf, objet) {
    const angle = Number(objet && objet.angle);
    if (![90, 180, 270].includes(angle)) {
      throw new Error(t("ANGLE_INVALIDE", String(objet && objet.angle)));
    }

    const donneesPdf = await this.chargerDocument_(blobPdf);
    const pages = donneesPdf.getPages();

    const cibles = Array.isArray(objet.pages) && objet.pages.length > 0 ? objet.pages : null;
    if (cibles) {
      const horsLimites = cibles.find(n => n < 1 || n > pages.length);
      if (horsLimites !== undefined) {
        throw new Error(t("PAGES_HORS_DOCUMENT", String(horsLimites), String(pages.length)));
      }
    }

    pages.forEach((page, i) => {
      if (cibles && !cibles.includes(i + 1)) return;
      const actuel = page.getRotation().angle || 0;
      page.setRotation(this.PDFLib.degrees((actuel + angle) % 360));
    });

    const octets = await donneesPdf.save();
    return this.versBlob_(octets, `nouveau_${blobPdf.getName()}`);
  }

  // ==========================================================================
  // Métadonnées
  // ==========================================================================

  /**
   * Lit les métadonnées et les dimensions de page d'un blob PDF.
   *
   * @param {GoogleAppsScript.Base.Blob} blobPdf Blob PDF source.
   * @return {Promise<MetadonneesPdf>} Les métadonnées du document.
   */
  async getMetadata(blobPdf) {
    const donneesPdf = await this.chargerDocument_(blobPdf);

    const metadonnees = CONFIG.CLES_METADONNEES.reduce((o, cle) => {
      const accesseur = `get${cle.charAt(0).toUpperCase()}${cle.slice(1)}`;
      o[cle] = donneesPdf[accesseur]() || null;
      return o;
    }, {});

    metadonnees.numberOfPages = donneesPdf.getPageCount();

    const docPdf = await this.PDFLib.PDFDocument.create();
    const pages = await docPdf.copyPages(donneesPdf, donneesPdf.getPageIndices());
    metadonnees.pageInfo = pages.map((page, i) => {
      const { width, height } = page.getSize();
      const { x, y } = page.getPosition();
      return { page: i + 1, pageWidth: width, pageHeight: height, defaultPositionX: x, defaultPositionY: y };
    });

    return metadonnees;
  }

  /**
   * Met à jour les métadonnées d'un blob PDF.
   *
   * Les clés sont appliquées une par une, en séquence. L'ancienne version
   * construisait une promesse par clé et ne la réglait que si la clé était
   * présente dans l'objet fourni : dès qu'une seule des huit clés manquait —
   * c'est-à-dire à presque chaque appel réel — `Promise.all` attendait
   * indéfiniment et la méthode ne rendait jamais la main.
   *
   * @param {GoogleAppsScript.Base.Blob} blobPdf Blob PDF source.
   * @param {Object} objet Métadonnées à écrire. `title` accepte une chaîne, ou
   *   un tableau [titre, options] transmis tel quel à pdf-lib.
   * @return {Promise<GoogleAppsScript.Base.Blob>} Blob PDF mis à jour.
   */
  async updateMetadata(blobPdf, objet) {
    if (typeof objet !== "object" || objet === null || Object.keys(objet).length === 0) {
      throw new Error(t("OBJET_METADONNEES_INVALIDE"));
    }

    const donneesPdf = await this.chargerDocument_(blobPdf);

    for (const cle of CONFIG.CLES_METADONNEES) {
      if (!Object.prototype.hasOwnProperty.call(objet, cle)) continue;

      const mutateur = `set${cle.charAt(0).toUpperCase()}${cle.slice(1)}`;
      let valeur = objet[cle];

      if (["creationDate", "modificationDate"].includes(cle)) {
        valeur = new Date(valeur);
      }

      // Un tableau est étalé en arguments : c'est ainsi que pdf-lib reçoit
      // un titre accompagné de ses options. Étaler une chaîne enverrait
      // en revanche ses caractères un par un, d'où le test explicite.
      if (Array.isArray(valeur) && cle === "title") {
        donneesPdf[mutateur](...valeur);
      } else {
        donneesPdf[mutateur](valeur);
      }
    }

    const octets = await donneesPdf.save();
    return this.versBlob_(octets, `nouveau_${blobPdf.getName()}`);
  }

  // ==========================================================================
  // Conversion en images
  // ==========================================================================

  /**
   * Convertit chaque page du PDF en image PNG.
   *
   * Le procédé passe par Drive : chaque page est déposée en fichier temporaire
   * dont on récupère la miniature. Les fichiers créés sont supprimés dans un
   * bloc `finally`, y compris lorsque le traitement échoue en cours de route —
   * l'ancienne version ne nettoyait qu'en cas de succès et laissait sinon
   * autant de PDF orphelins que de pages déjà traitées à la racine du Drive.
   *
   * @param {GoogleAppsScript.Base.Blob} blobPdf Blob PDF source.
   * @return {Promise<GoogleAppsScript.Base.Blob[]>} Un blob PNG par page.
   */
  async convertPDFToPng(blobPdf) {
    const heureDebut = Date.now();
    const donneesPdf = await this.chargerDocument_(blobPdf);
    const nombreDePages = donneesPdf.getPageCount();
    console.log(`Nombre total de pages : ${nombreDePages}`);

    const jeton = ScriptApp.getOAuthToken();
    const dossier = this.dossierTemporaire_();
    const blobsImage = [];
    const idsTemporaires = [];

    try {
      for (let i = 0; i < nombreDePages; i++) {
        this.verifierBudgetTemps_(heureDebut, i);
        console.log(`Traitement de la page ${i + 1} sur ${nombreDePages}`);

        const docPdf = await this.PDFLib.PDFDocument.create();
        const [page] = await docPdf.copyPages(donneesPdf, [i]);
        docPdf.addPage(page);
        const octets = await docPdf.save();

        const fichier = dossier.createFile(
          this.versBlob_(octets, `temporaire_page${i + 1}.pdf`)
        );
        idsTemporaires.push(fichier.getId());

        // Drive génère la miniature de façon asynchrone : sans cette attente,
        // la requête suivante renvoie une erreur ou une image incomplète.
        Utilities.sleep(CONFIG.ATTENTE_MINIATURE_MS);

        const reponse = this.recupererAvecRetentative_(
          `https://drive.google.com/thumbnail?id=${fichier.getId()}&sz=w${CONFIG.LARGEUR_MINIATURE_PX}`,
          { headers: { authorization: `Bearer ${jeton}` } }
        );

        if (reponse.getResponseCode() !== 200) {
          throw new Error(t("MINIATURE_INDISPONIBLE", String(i + 1), reponse.getContentText()));
        }

        blobsImage.push(reponse.getBlob().setName(`page${i + 1}.png`));
      }
    } finally {
      idsTemporaires.forEach(id => {
        try {
          DriveApp.getFileById(id).setTrashed(true);
        } catch (e) {
          console.warn(`Fichier temporaire ${id} non supprimé : ${e.message}`);
        }
      });
    }

    return blobsImage;
  }

  // ==========================================================================
  // Formulaires PDF
  // ==========================================================================

  /**
   * Lit les champs d'un formulaire PDF et leurs valeurs.
   *
   * @param {GoogleAppsScript.Base.Blob} blobPdf Blob PDF source.
   * @return {Promise<ChampFormulaire[]>} Les champs du formulaire.
   */
  async getValuesFromPDFForm(blobPdf) {
    const donneesPdf = await this.chargerDocument_(blobPdf);
    const formulaire = donneesPdf.getForm();
    const { PDFTextField, PDFDropdown, PDFCheckBox, PDFRadioGroup } = this.PDFLib;

    return formulaire.getFields().map(champ => {
      const resultat = { name: champ.getName() };

      if (champ instanceof PDFTextField) {
        resultat.value = champ.getText();
        resultat.type = "Textbox";
      } else if (champ instanceof PDFDropdown) {
        resultat.value = champ.getSelected();
        resultat.options = champ.getOptions();
        resultat.type = "Dropdown";
      } else if (champ instanceof PDFCheckBox) {
        resultat.value = champ.isChecked();
        resultat.type = "Checkbox";
      } else if (champ instanceof PDFRadioGroup) {
        resultat.value = champ.getSelected();
        resultat.options = champ.getOptions();
        resultat.type = "Radiobutton";
      } else {
        resultat.type = "Type non supporté";
      }

      return resultat;
    });
  }

  /**
   * Écrit des valeurs dans un formulaire PDF.
   *
   * @param {GoogleAppsScript.Base.Blob} blobPdf Blob PDF source.
   * @param {Object} objet Paramètres.
   * @param {Array<{name: string, value: *}>} objet.values Valeurs à écrire.
   * @return {Promise<GoogleAppsScript.Base.Blob>} Blob PDF renseigné.
   */
  async setValuesToPDFForm(blobPdf, objet) {
    if (!objet || !Array.isArray(objet.values)) {
      throw new Error(t("VALEURS_FORMULAIRE_INVALIDES"));
    }

    const donneesPdf = await this.chargerDocument_(blobPdf);
    const formulaire = donneesPdf.getForm();

    if (this.policeStandard || this.policeCustomisee) {
      await this.definirPolice_(donneesPdf, formulaire);
    }

    const { PDFTextField, PDFDropdown, PDFCheckBox, PDFRadioGroup } = this.PDFLib;

    for (const { name, value } of objet.values) {
      let champ;
      try {
        champ = formulaire.getField(name);
      } catch (e) {
        // pdf-lib lève une exception peu explicite sur un champ absent.
        // Le nom du champ fautif est ce dont l'appelant a besoin.
        throw new Error(t("CHAMP_FORMULAIRE_INTROUVABLE", name));
      }

      if (champ instanceof PDFTextField) {
        champ.setText(value);
      } else if (champ instanceof PDFDropdown) {
        if (champ.isMultiselect()) {
          for (const v of value) champ.select(v);
        } else {
          champ.select(value);
        }
      } else if (champ instanceof PDFCheckBox) {
        champ[value ? "check" : "uncheck"]();
      } else if (champ instanceof PDFRadioGroup) {
        champ.select(value);
      }
    }

    const octets = await donneesPdf.save();
    return this.versBlob_(octets, `nouveau_${blobPdf.getName()}`);
  }

  /**
   * Crée un formulaire PDF à partir d'un modèle Google Slides.
   *
   * @param {string} identifiant ID de la présentation modèle.
   * @param {Object} objet Paramètres.
   * @param {Object[]} objet.values Description des champs, par titre de forme.
   * @return {Promise<GoogleAppsScript.Base.Blob>} Blob PDF du formulaire.
   */
  async createPDFFormBySlideTemplate(identifiant, objet) {
    if (!identifiant) {
      throw new Error(t("IDENTIFIANT_SLIDE_MANQUANT"));
    }
    if (!objet || !Array.isArray(objet.values) || objet.values.length === 0) {
      throw new Error(t("OBJET_SLIDE_INVALIDE"));
    }

    const donneesModele = this.lireModeleSlides_(identifiant, objet.values);
    return await this.creerChamps_(donneesModele);
  }

  /**
   * Intègre images et textes dans un blob PDF.
   *
   * @param {GoogleAppsScript.Base.Blob} blobPdf Blob PDF source.
   * @param {Object.<string, Object[]>} objet Éléments à intégrer, indexés par
   *   clé `pageN`.
   * @return {Promise<GoogleAppsScript.Base.Blob>} Blob PDF enrichi.
   */
  async embedObjects(blobPdf, objet) {
    if (!objet || typeof objet !== "object") {
      throw new Error(t("OBJET_INTEGRATION_INVALIDE"));
    }

    const { objetMisAJour, policePersonnaliseeRequise } = this.preparerElements_(objet);
    const donneesPdf = await this.chargerDocument_(blobPdf);
    const docPdf = await this.PDFLib.PDFDocument.create();

    if (policePersonnaliseeRequise) {
      GestionnaireLibrairies.chargerFontkit(this);
      docPdf.registerFontkit(this.fontkit);
    }

    const pages = await docPdf.copyPages(donneesPdf, donneesPdf.getPageIndices());

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const elements = objetMisAJour[`page${i + 1}`];

      if (elements) {
        for (const element of elements) {
          if (element.imageFileId) {
            const image = await docPdf[element.method](element.imageBytes);
            const dimensions = element.scale ? image.scale(element.scale) : image;
            const options = { ...element };
            if (options.rotate !== undefined) options.rotate = this.PDFLib.degrees(Number(options.rotate));
            options.width = element.width || dimensions.width;
            options.height = element.height || dimensions.height;
            delete options.imageBytes;
            delete options.method;
            delete options.imageFileId;
            delete options.scale;
            this.avertirSiHorsPage_(page, options, `Image ${element.imageFileId}`);
            page.drawImage(image, options);
          } else if (element.text) {
            const options = { ...element };
            if (options.rotate !== undefined) options.rotate = this.PDFLib.degrees(Number(options.rotate));
            if (element.standardFont || element.customFont) {
              // Le texte est connu ici et ne changera plus : sous-ensembler la
              // police n'a aucun inconvénient et divise le poids du document.
              options.font = await docPdf.embedFont(
                element.standardFont
                  ? this.PDFLib.StandardFonts[element.standardFont]
                  : element.customFont,
                { subset: CONFIG.SOUS_ENSEMBLE_POLICE_FIGEE }
              );
            }
            this.avertirSiHorsPage_(page, options, `Texte « ${String(element.text).substring(0, 30)} »`);
            page.drawText(element.text, options);
          }
        }
      }

      docPdf.addPage(page);
    }

    const octets = await docPdf.save();
    return this.versBlob_(octets, `nouveau_${blobPdf.getName()}`);
  }

  /**
   * Insère un en-tête et/ou un pied de page sur chaque page.
   *
   * @param {GoogleAppsScript.Base.Blob} blobPdf Blob PDF source.
   * @param {OptionsEnTetePiedDePage} objet Contenu de l'en-tête et du pied de page.
   * @return {Promise<GoogleAppsScript.Base.Blob>} Blob PDF complété.
   */
  async insertHeaderFooter(blobPdf, objet) {
    if (!objet || typeof objet !== "object") {
      throw new Error(t("OBJET_ENTETE_INVALIDE"));
    }

    const docPdf = await this.PDFLib.PDFDocument.create();
    const formulaire = docPdf.getForm();
    let police = null;

    if (this.policeStandard || this.policeCustomisee) {
      // Les champs d'en-tête et de pied de page sont mis en lecture seule plus
      // bas : leur texte ne changera jamais, le sous-ensemble est donc sans
      // risque et évite d'embarquer plusieurs mégaoctets de police.
      await this.definirPolice_(docPdf, formulaire, CONFIG.SOUS_ENSEMBLE_POLICE_FIGEE);
      police = await docPdf.embedFont(
        this.policeStandard
          ? this.PDFLib.StandardFonts[this.policeStandard]
          : new Uint8Array(this.policeCustomisee.getBytes()),
        { subset: CONFIG.SOUS_ENSEMBLE_POLICE_FIGEE }
      );
    }

    const donneesPdf = await this.chargerDocument_(blobPdf);
    const nombreDePages = donneesPdf.getPageCount();
    const pages = await docPdf.copyPages(donneesPdf, donneesPdf.getPageIndices());

    // Copie défensive : les zones sont dépouillées de leurs clés de position au
    // moment d'être dessinées. Sans copie, l'objet de l'appelant en ressortait
    // amputé et un second appel avec le même objet produisait un autre résultat.
    const { header, footer } = JSON.parse(JSON.stringify({
      header: objet.header || null,
      footer: objet.footer || null
    }));

    const ordreTri = ["left", "center", "right"];
    const trier = (entrees) => entrees.sort((a, b) => {
      const i1 = ordreTri.findIndex(e => a[0].toLowerCase().includes(e));
      const i2 = ordreTri.findIndex(e => b[0].toLowerCase().includes(e));
      return (i1 > -1 ? i1 : ordreTri.length) - (i2 > -1 ? i2 : ordreTri.length);
    });

    const enTetes = trier(header ? Object.entries(header).map(([k, v]) => [`header.${k}`, v]) : []);
    const piedsDePage = trier(footer ? Object.entries(footer).map(([k, v]) => [`footer.${k}`, v]) : []);
    const objAlignement = { center: "Center", left: "Left", right: "Right" };

    for (let i = 0; i < nombreDePages; i++) {
      const numeroPage = i + 1;
      const page = docPdf.addPage(pages[i]);
      const hauteurPage = page.getHeight();
      const largeurPage = page.getWidth();

      if (enTetes.length > 0) {
        const largeurZone = largeurPage / enTetes.length;
        enTetes.forEach(([cle, valeur], j) => {
          const options = {
            borderWidth: valeur.borderWidth || 0,
            x: j * largeurZone,
            y: hauteurPage - ((valeur.yOffset || 0) + (valeur.height || 20)),
            width: largeurZone,
            height: valeur.height || 30,
            ...valeur,
            font: police
          };
          this.ajouterChampEnTete_({ page, formulaire, numeroPage, cle, valeur, options, objAlignement });
        });
      }

      if (piedsDePage.length > 0) {
        const largeurZone = largeurPage / piedsDePage.length;
        piedsDePage.forEach(([cle, valeur], j) => {
          const options = {
            borderWidth: valeur.borderWidth || 0,
            x: j * largeurZone,
            y: valeur.yOffset || 0,
            width: largeurZone,
            height: valeur.height || 30,
            ...valeur,
            font: police
          };
          this.ajouterChampEnTete_({ page, formulaire, numeroPage, cle, valeur, options, objAlignement });
        });
      }
    }

    const octets = await docPdf.save();
    return this.versBlob_(octets, `nouveau_${blobPdf.getName()}`);
  }

  // ==========================================================================
  // Helpers privés
  // ==========================================================================

  /**
   * Crée un champ texte en lecture seule pour une zone d'en-tête ou de pied de page.
   *
   * @param {Object} params Contexte de création du champ.
   * @return {void}
   */
  ajouterChampEnTete_({ page, formulaire, numeroPage, cle, valeur, options, objAlignement }) {
    const boiteTexte = formulaire.createTextField(`${cle}.${numeroPage}`);

    if (valeur.text) boiteTexte.setText(valeur.text);
    if (valeur.alignment) {
      boiteTexte.setAlignment(this.PDFLib.TextAlignment[objAlignement[valeur.alignment.toLowerCase()]]);
    }

    boiteTexte.disableScrolling();
    boiteTexte.disableMultiline();
    boiteTexte.enableReadOnly();

    this.avertirSiHorsPage_(page, options, `Zone « ${cle} » page ${numeroPage}`);
    boiteTexte.addToPage(page, options);
  }

  /**
   * Applique la police retenue au formulaire PDF.
   *
   * La substitution de `updateFieldAppearances` est le contournement
   * recommandé en amont pour forcer pdf-lib à utiliser une police donnée
   * lors du rendu des champs.
   * Réf. https://github.com/Hopding/pdf-lib/issues/1152
   *
   * @param {Object} docPdf Document pdf-lib.
   * @param {Object} formulaire Formulaire pdf-lib.
   * @param {boolean} [sousEnsemble] Forcer le sous-ensemble de glyphes. Par
   *   défaut, la valeur de CONFIG.SOUS_ENSEMBLE_POLICE_FORMULAIRE, qui protège
   *   les formulaires destinés à être remplis plus tard.
   * @return {Promise<void>}
   */
  async definirPolice_(docPdf, formulaire, sousEnsemble = CONFIG.SOUS_ENSEMBLE_POLICE_FORMULAIRE) {
    let police;

    if (this.policeStandard) {
      police = await docPdf.embedFont(this.PDFLib.StandardFonts[this.policeStandard]);
    } else if (this.policeCustomisee) {
      docPdf.registerFontkit(this.fontkit);
      this.avertirSiPoliceVolumineuse_(this.policeCustomisee, sousEnsemble);
      police = await docPdf.embedFont(
        new Uint8Array(this.policeCustomisee.getBytes()),
        { subset: sousEnsemble }
      );
    } else {
      return;
    }

    const miseAJourOrigine = formulaire.updateFieldAppearances.bind(formulaire);
    formulaire.updateFieldAppearances = function () {
      return miseAJourOrigine(police);
    };
  }

  /**
   * Applique les méthodes de style demandées à un champ de formulaire.
   *
   * @param {Object} instance Instance du champ pdf-lib.
   * @param {Object} champ Champ extrait du modèle, dont la propriété
   *   `description.methods` liste les appels de style à effectuer.
   * @return {void}
   */
  appliquerStyles_(instance, champ) {
    const methodes = champ && champ.description && champ.description.methods;
    if (!methodes || methodes.length === 0) return;

    methodes.forEach(({ method, value }) => {
      const valeur = Array.isArray(value) ? [...value] : value;
      if (typeof instance[method] !== "function") {
        console.warn(`Méthode de style inconnue ignorée : ${method}`);
        return;
      }
      instance[method](valeur || null);
    });
  }

  /**
   * Lit un modèle Google Slides et en extrait la description des champs.
   *
   * Le modèle de l'appelant n'est jamais modifié : le traitement supprime les
   * formes repères pour produire l'arrière-plan du PDF, ce qui détruisait le
   * modèle d'origine. Il travaille désormais sur une copie, supprimée à la fin,
   * et la présentation d'origine reste intacte — y compris lorsque le modèle
   * contient des titres en double, cas dans lequel l'ancienne version mettait
   * la présentation de l'utilisateur à la corbeille avant de lever l'erreur.
   *
   * @param {string} identifiant ID de la présentation modèle.
   * @param {Object[]} valeurs Description des champs attendus.
   * @return {{obj: Map[], blob: GoogleAppsScript.Base.Blob}} Champs et arrière-plan.
   */
  lireModeleSlides_(identifiant, valeurs) {
    const objEntree = valeurs.reduce((o, e) => (o[e.shapeTitle] = e, o), {});
    const copie = DriveApp.getFileById(identifiant).makeCopy(
      `${CONFIG.NOM_APPLICATION} - copie de travail`,
      this.dossierTemporaire_()
    );
    const idCopie = copie.getId();

    try {
      const presentation = SlidesApp.openById(idCopie);
      const diapos = presentation.getSlides();

      const ar = diapos.map((diapo, i) =>
        diapo.getShapes().reduce((arr, forme) => {
          const titre = forme.getTitle() ? forme.getTitle().trim() : "";
          if (titre && objEntree[titre]) {
            const page = i + 1;
            const [type, groupe, nom] = titre.split(".").map(f => f.trim());
            let methodesDefinies = objEntree[titre];

            if (type === "radiobutton" && objEntree[titre].methods && objEntree[titre].methods.length > 0) {
              const temp = JSON.parse(JSON.stringify(objEntree[titre]));
              temp.methods.forEach(f => {
                if (f.method === "select") f.value = `${f.value}.page${page}`;
              });
              methodesDefinies = temp;
            }

            arr.push({
              title: `${titre}.page${page}`,
              page, type, group: groupe, name: nom, shape: forme,
              topOffset: forme.getTop(),
              leftOffset: forme.getLeft(),
              width: forme.getWidth(),
              height: forme.getHeight(),
              description: methodesDefinies
            });
          }
          return arr;
        }, [])
      );

      const compteurs = ar.reduce((m, page) => {
        page.forEach(({ title }) => m.set(title, (m.get(title) || 0) + 1));
        return m;
      }, new Map());
      const doublons = [...compteurs].filter(([, v]) => v > 1);

      if (doublons.length > 0) {
        throw new Error(t("TITRES_EN_DOUBLE", doublons.map(([k]) => k).join(", ")));
      }

      ar.forEach(page => page.forEach(({ shape }) => shape.remove()));
      presentation.saveAndClose();

      const blob = DriveApp.getFileById(idCopie).getBlob();

      const obj = ar.map(page =>
        page.reduce((m, e) => m.set(e.type, m.has(e.type) ? [...m.get(e.type), e] : [e]), new Map())
      );
      obj.forEach(page =>
        page.forEach((v, k, m) =>
          m.set(k, v.reduce((mm, e) => mm.set(e.group, mm.has(e.group) ? [...mm.get(e.group), e] : [e]), new Map()))
        )
      );

      return { obj, blob };
    } finally {
      try {
        DriveApp.getFileById(idCopie).setTrashed(true);
      } catch (e) {
        console.warn(`Copie de travail ${idCopie} non supprimée : ${e.message}`);
      }
    }
  }

  /**
   * Construit le PDF de formulaire à partir des champs extraits du modèle.
   *
   * @param {{obj: Map[], blob: GoogleAppsScript.Base.Blob}} donneesModele Champs et arrière-plan.
   * @return {Promise<GoogleAppsScript.Base.Blob>} Blob PDF du formulaire.
   */
  async creerChamps_(donneesModele) {
    const { obj, blob } = donneesModele;
    const docPdf = await this.PDFLib.PDFDocument.create();
    const formulaire = docPdf.getForm();

    if (this.policeStandard || this.policeCustomisee) {
      await this.definirPolice_(docPdf, formulaire);
    }

    const donneesPdf = await this.chargerDocument_(blob);
    const nombreDePages = donneesPdf.getPageCount();
    const pages = await docPdf.copyPages(donneesPdf, donneesPdf.getPageIndices());
    const decalage = 0.5;

    for (let i = 0; i < nombreDePages; i++) {
      const numeroPage = i + 1;
      const page = docPdf.addPage(pages[i]);
      const hauteurPage = page.getHeight();

      const position = (u) => ({
        x: u.leftOffset - decalage,
        y: hauteurPage - u.topOffset - u.height + decalage,
        width: u.width,
        height: u.height
      });

      obj[i].forEach((groupes, type) => {
        if (type === "checkbox") {
          groupes.forEach(champs => champs.forEach(u => {
            const caseACocher = formulaire.createCheckBox(u.title);
            caseACocher.addToPage(page, position(u));
            this.appliquerStyles_(caseACocher, u);
          }));
        } else if (type === "radiobutton") {
          groupes.forEach((champs, nomGroupe) => {
            const radio = formulaire.createRadioGroup(`radiobutton.${nomGroupe}.page${numeroPage}`);
            champs.forEach(u => {
              radio.addOptionToPage(u.title, page, position(u));
              this.appliquerStyles_(radio, u);
            });
          });
        } else if (type === "textbox") {
          groupes.forEach(champs => champs.forEach(u => {
            const boiteTexte = formulaire.createTextField(u.title);
            boiteTexte.addToPage(page, position(u));
            this.appliquerStyles_(boiteTexte, u);
          }));
        } else if (type === "dropdownlist") {
          groupes.forEach(champs => champs.forEach(u => {
            const listeDeroulante = formulaire.createDropdown(u.title);
            listeDeroulante.addToPage(page, position(u));
            this.appliquerStyles_(listeDeroulante, u);
          }));
        }
      });
    }

    const octets = await docPdf.save();
    return this.versBlob_(octets, `nouveau_${blob.getName()}`);
  }

  /**
   * Prépare les éléments à intégrer : résolution des images et des polices.
   *
   * Travaille sur une copie afin de ne pas amputer l'objet de l'appelant des
   * clés consommées pendant le traitement.
   *
   * @param {Object.<string, Object[]>} objet Éléments à intégrer.
   * @return {{objetMisAJour: Object, policePersonnaliseeRequise: boolean}}
   */
  preparerElements_(objet) {
    let policePersonnaliseeRequise = false;

    const objetMisAJour = Object.fromEntries(
      Object.entries(objet).map(([cle, elements]) => [
        cle,
        elements.map(source => {
          const element = { ...source };

          if (element.imageFileId) {
            const blobImage = DriveApp.getFileById(element.imageFileId).getBlob();
            const typeMime = blobImage.getContentType();

            if (typeMime === MimeType.PNG) {
              element.method = "embedPng";
            } else if (typeMime === MimeType.JPEG) {
              element.method = "embedJpg";
            } else {
              throw new Error(t("IMAGE_NON_SUPPORTEE"));
            }

            element.imageBytes = new Uint8Array(blobImage.getBytes());
          } else if (element.text && element.customFont) {
            policePersonnaliseeRequise = true;
            // Dernier moment où la police est encore un blob : c'est ici que
            // son poids peut être mesuré, avant conversion en octets bruts.
            this.avertirSiPoliceVolumineuse_(element.customFont, CONFIG.SOUS_ENSEMBLE_POLICE_FIGEE);
            element.customFont = new Uint8Array(element.customFont.getBytes());
          }

          return element;
        })
      ])
    );

    return { objetMisAJour, policePersonnaliseeRequise };
  }
}
