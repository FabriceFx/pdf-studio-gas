/**
 * ============================================================================
 * MODULE 2 : CHARGEMENT DES LIBRAIRIES EXTERNES ET CACHE SEGMENTÉ
 * ============================================================================
 *
 * Apps Script n'a pas de gestionnaire de paquets : pdf-lib et fontkit sont
 * téléchargées depuis un CDN puis évaluées dans le contexte d'exécution.
 * Le téléchargement représente plus d'une seconde et plus d'un méga-octet à
 * chaque appel, d'où la mise en cache.
 */

const GestionnaireLibrairies = {

  /**
   * Découpe une chaîne longue et la place dans le cache du script.
   *
   * Le compteur de segments est écrit en dernier : tant qu'il est absent,
   * une lecture concurrente considère le cache comme vide plutôt que de
   * reconstituer une chaîne à moitié écrite.
   *
   * @param {string} cle Préfixe des clés de cache.
   * @param {string} valeur Contenu à mettre en cache.
   * @return {boolean} Vrai si la mise en cache a réussi.
   */
  mettreEnCache_(cle, valeur) {
    const cache = CacheService.getScriptCache();
    const taille = CONFIG.TAILLE_SEGMENT_CACHE_CARACTERES;
    const nombreSegments = Math.ceil(valeur.length / taille);
    const segments = {};

    for (let i = 0; i < nombreSegments; i++) {
      const segment = valeur.substring(i * taille, (i + 1) * taille);
      const octets = Utilities.newBlob(segment).getBytes().length;
      if (octets > CONFIG.TAILLE_MAX_VALEUR_CACHE_OCTETS) {
        console.warn(
          `Segment ${i} de « ${cle} » trop volumineux (${octets} octets) : mise en cache abandonnée.`
        );
        return false;
      }
      segments[`${cle}_${i}`] = segment;
    }

    try {
      cache.putAll(segments, CONFIG.DUREE_CACHE_S);
      cache.put(`${cle}_segments`, String(nombreSegments), CONFIG.DUREE_CACHE_S);
      return true;
    } catch (e) {
      // Le cache est un accélérateur, pas une dépendance : un échec ici ne doit
      // pas interrompre le traitement. Il est en revanche journalisé, sinon une
      // librairie retéléchargée à chaque appel passe totalement inaperçue.
      console.warn(`Mise en cache de « ${cle} » impossible : ${e.message}`);
      return false;
    }
  },

  /**
   * Reconstitue une chaîne longue depuis le cache du script.
   *
   * @param {string} cle Préfixe des clés de cache.
   * @return {string|null} Le contenu complet, ou null si le cache est absent
   *   ou incomplet — les segments expirent indépendamment les uns des autres.
   */
  lireDepuisCache_(cle) {
    const cache = CacheService.getScriptCache();
    const compteur = cache.get(`${cle}_segments`);
    if (!compteur) return null;

    const nombreSegments = parseInt(compteur, 10);
    if (!Number.isInteger(nombreSegments) || nombreSegments <= 0) return null;

    const clesSegments = [];
    for (let i = 0; i < nombreSegments; i++) {
      clesSegments.push(`${cle}_${i}`);
    }

    const segments = cache.getAll(clesSegments);
    let contenu = "";
    for (const cleSegment of clesSegments) {
      const segment = segments[cleSegment];
      if (segment == null) {
        console.warn(`Segment de cache manquant pour « ${cle} » : cache ignoré.`);
        return null;
      }
      contenu += segment;
    }
    return contenu;
  },

  /**
   * Télécharge une librairie, éventuellement transformée, avec mise en cache.
   *
   * @param {Object} instance Instance PDFApp qui sert de contexte d'évaluation.
   * @param {string} nom Nom lisible de la librairie, pour les messages d'erreur.
   * @param {string} cleCache Préfixe des clés de cache.
   * @param {string} url URL du CDN, version épinglée.
   * @param {function(string): string} [transformer] Transformation à appliquer
   *   au code source avant évaluation.
   * @return {void}
   */
  charger_(instance, nom, cleCache, url, transformer) {
    let contenu = this.lireDepuisCache_(cleCache);

    if (!contenu) {
      let reponse;
      try {
        reponse = instance.recupererAvecRetentative_(url);
      } catch (e) {
        throw new Error(t("LIBRAIRIE_INDISPONIBLE", nom, e.message));
      }
      if (reponse.getResponseCode() !== 200) {
        throw new Error(t("LIBRAIRIE_INDISPONIBLE", nom, `HTTP ${reponse.getResponseCode()}`));
      }
      contenu = reponse.getContentText();
      if (transformer) contenu = transformer(contenu);
      this.mettreEnCache_(cleCache, contenu);
    }

    instance.evaluerLibrairie_(contenu);
  },

  /**
   * Charge pdf-lib et l'expose sur l'instance sous la propriété PDFLib.
   * Documentation de l'API : https://pdf-lib.js.org/docs/api/classes/pdfdocument
   *
   * @param {Object} instance Instance PDFApp.
   * @return {void}
   */
  chargerPdfLib(instance) {
    this.charger_(
      instance,
      "pdf-lib",
      "pdf_lib_content",
      CONFIG.CDN_PDF_LIB,
      // pdf-lib s'appuie sur setTimeout, qui n'existe pas dans Apps Script.
      // La substitution le remplace par une attente synchrone. C'est un
      // contournement fragile mais il n'a pas d'alternative : toute
      // modification de cette expression doit être testée sur un PDF réel.
      (code) => code.replace(/setTimeout\(.*?,.*?(\d*?)\)/g, "Utilities.sleep($1);return t();")
    );
  },

  /**
   * Charge fontkit et l'expose sur l'instance sous la propriété fontkit.
   * Nécessaire uniquement pour les polices personnalisées TTF et OTF.
   * Dépôt : https://github.com/Hopding/fontkit
   *
   * @param {Object} instance Instance PDFApp.
   * @return {void}
   */
  chargerFontkit(instance) {
    this.charger_(instance, "fontkit", "fontkit_content", CONFIG.CDN_FONTKIT);
  }
};
