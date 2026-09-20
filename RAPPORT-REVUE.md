# Revue — PDFApplication (outils-pdf)

**Type** : bibliothèque Apps Script (pas d'interface, appelée par d'autres projets)
**Fichiers analysés** : `Code.gs` (1169 lignes, fichier unique)
**Origine** : dérivée de [PDFApp](https://github.com/tanaikech/PDFApp) de Kanshi Tanaike (MIT), traduite en français et enrichie d'un cache de librairie et d'une retentative HTTP.

**Verdict** : le moteur PDF est solide et les ajouts par rapport à la bibliothèque d'origine vont dans le bon sens. Mais l'enveloppe asynchrone est bâtie sur un motif qui avale les erreurs : plusieurs méthodes renvoient une promesse qui ne se règle jamais, sans message, dans des cas de figure courants. `udpateMetadata` est dans ce cas à presque chaque appel réel. Le risque principal est là, avant tout problème de volume.

---

## 🔴 Bloquant

- **`udpateMetadata` ne rend jamais la main dès qu'une clé de métadonnée est absente** — `Code.gs:333-372`
  La méthode construit une promesse par clé parmi les huit possibles (`title`, `subject`, `author`, `creator`, `creationDate`, `modificationDate`, `keywords`, `producer`), mais n'appelle `r("Terminé")` qu'à l'intérieur du `if (objet.hasOwnProperty(k))` (ligne 346). Une clé non fournie produit donc une promesse qui ne se règle ni en succès ni en échec, et le `Promise.all` de la ligne 342 attend indéfiniment. Un appel typique ne renseignant qu'un ou deux champs, la méthode se bloque presque systématiquement. Le `.catch(err => console.log(err))` de la ligne 371 achève de masquer le problème : même en cas d'erreur réelle, la promesse extérieure n'est jamais rejetée.
  → Réécrite en boucle séquentielle : les clés absentes sont sautées, chaque écriture est attendue, et toute erreur remonte à l'appelant.

- **Le motif `new Promise(async …)` empêche les erreurs de remonter** — `Code.gs:281, 306, 338, 390, 419, 445, 492, 537, 587, 610, 674, 753, 788`
  Une exception levée dans la fonction `async` passée à `new Promise` ne rejette pas la promesse retournée : elle devient un rejet non traité de la fonction interne, et l'appelant reste bloqué. Combiné au motif `await this.getPDFObjectFromBlob_(blobPdf).catch(err => reject(err))` (treize occurrences), l'effet est double : `reject` est appelé, mais l'exécution **continue** avec `donneesPdf === undefined`, et la ligne suivante lève une `TypeError` dans le vide.
  → Toutes les méthodes publiques sont devenues des méthodes `async` ordinaires. Elles renvoient toujours une promesse, donc rien ne change pour l'appelant, mais une erreur rejette désormais la promesse avec son message d'origine.

- **`reorderPages` : rejet sans `return`, puis lecture hors limites** — `Code.gs:396`
  Quand le nouvel ordre référence une page inexistante, `reject(...)` est appelé mais l'exécution se poursuit. La ligne 400 accède alors à `pages[e - 1]` qui vaut `undefined`, et `docPdf.addPage(undefined)` lève une exception dans le vide. Le rejet porte en outre une chaîne et non un objet `Error`, ce qui prive l'appelant de la pile d'appels.
  → Validation déplacée avant tout traitement, avec un `throw new Error(...)` qui nomme la page fautive et le nombre réel de pages. La propriété `nouvelOrdreDesPages` est également vérifiée : absente, elle produisait auparavant un `Math.max()` sur `undefined`.

- **`convertPDFToPng` abandonne des fichiers dans Mon Drive en cas d'échec** — `Code.gs:443-480`
  Un fichier PDF temporaire est créé par page (ligne 459), et la suppression n'intervient qu'à la ligne 476, après la boucle. Tout échec en cours de route — une miniature indisponible (ligne 467), un dépassement du temps d'exécution — saute cette ligne et laisse autant de fichiers orphelins que de pages déjà traitées. Ils sont de plus créés à la racine de Mon Drive, mêlés aux documents de l'utilisateur.
  → Suppression déplacée dans un bloc `finally`, exécuté quoi qu'il arrive, et fichiers temporaires regroupés dans un dossier dédié.

- **`createPDFFormBySlideTemplate` détruit la présentation modèle** — `Code.gs:1009` et `Code.gs:1013`
  Deux mécanismes distincts, tous deux irréversibles pour l'utilisateur. Ligne 1013, les formes repères sont supprimées de la présentation **source** avant export de l'arrière-plan : le modèle est vidé de ses repères et inutilisable une seconde fois. Ligne 1009, le contrôle des titres en double met la présentation **à la corbeille** avant de lever l'erreur — une erreur de saisie dans un nom de forme coûte donc le modèle.
  → Le traitement opère maintenant sur une copie, créée dans le dossier temporaire et supprimée dans un `finally`. La présentation d'origine n'est jamais modifiée, y compris sur le chemin d'erreur.

---

## 🟠 Important

- **Le cache de pdf-lib ne fonctionne probablement jamais** — `Code.gs:1087-1101`
  La découpe se fait à 100 000 caractères (ligne 1089) alors que `CacheService` plafonne chaque valeur à 100 Ko **comptés en octets**. `substring` compte des caractères UTF-16 : le moindre caractère non ASCII dans la librairie minifiée fait dépasser la limite, `cache.put` lève une exception, et le `catch` vide de la ligne 1098 l'absorbe en silence. Conséquence probable en production : pdf-lib (≈ 1,5 Mo) est retéléchargée depuis le CDN **à chaque appel**, sans que rien ne le signale.
  → Segments ramenés à 30 000 caractères (sûr même à 3 octets par caractère), taille de chaque segment vérifiée avant écriture, et échec journalisé au lieu d'être avalé. Écriture via `putAll`, compteur de segments écrit en dernier pour qu'une lecture concurrente ne reconstitue pas une chaîne incomplète.

- **Les URL de CDN ne sont pas épinglées** — `Code.gs:259-260`
  `pdf-lib/dist/pdf-lib.min.js` et `@pdf-lib/fontkit/dist/fontkit.umd.min.js` désignent la dernière version publiée. Une publication amont modifie le comportement du script du jour au lendemain, sans qu'aucune ligne n'ait bougé — et la substitution de `setTimeout` (ligne 1126) repose sur une forme précise du code minifié, donc particulièrement exposée à ce genre de changement.
  → Versions épinglées dans `CONFIG` : pdf-lib 1.17.1 et fontkit 1.1.1, tous deux servis par jsDelivr. Le commentaire de la ligne 259 suggérait déjà 1.17.1.

- **La retentative HTTP est désactivée là où elle sert le plus** — `Code.gs:1072` et `Code.gs:465`
  `fetchWithBackoff_` ne déclenche une retentative que si `muteHttpExceptions` est absent. Or le seul appel qui en a besoin, la génération de miniature dans `convertPDFToPng`, passe justement `muteHttpExceptions: true` (ligne 465). Sur un document de plusieurs dizaines de pages, c'est exactement le moment où Drive renvoie des 429.
  → La retentative se déclenche désormais sur les codes 429 et 5xx quel que soit `muteHttpExceptions`, et laisse passer les autres codes à l'appelant.

- **`mergePDFs` charge tous les documents en mémoire avant de commencer** — `Code.gs:421`
  `blobsPdf.map(blob => new Uint8Array(blob.getBytes()))` matérialise l'intégralité des fichiers d'un coup. Sur une fusion d'une vingtaine de documents volumineux, la mémoire est épuisée avant la première page copiée.
  → Chargement décalé à l'intérieur de la boucle : un document à la fois.

- **Plusieurs méthodes modifient les objets qu'on leur passe** — `Code.gs:835` et `Code.gs:1036-1050`
  `addHeaderFooterFields_` supprime les clés `x`, `y`, `width` et `text` de l'objet `v` fourni par l'appelant (ligne 835) ; `updateObject_` fait de même avec `method`, `imageBytes` et `scale`. Un second appel avec le même objet de configuration produit donc un résultat différent du premier, ce qui est très difficile à diagnostiquer côté appelant.
  → Copies défensives dans les deux cas ; les objets de l'appelant ressortent intacts.

- **Aucun manifeste dans le projet**
  Sans `appsscript.json` explicite, les autorisations sont déduites du code et changent quand le code change, ce qui redemande une autorisation aux projets appelants. Pour une bibliothèque partagée, c'est une source de friction inutile.
  → Manifeste fourni, avec `runtimeVersion: V8`, `timeZone: Europe/Paris`, `exceptionLogging: STACKDRIVER` et les trois portées réellement utilisées : `drive`, `presentations`, `script.external_request`.

- **Un champ de formulaire absent produit une erreur illisible** — `Code.gs:560`
  `formulaire.getField(name)` lève une exception pdf-lib qui ne nomme pas le champ fautif. Sur un formulaire de trente champs, l'appelant n'a aucun moyen de savoir lequel pose problème.
  → Exception interceptée et remplacée par un message qui cite le nom du champ.

- **`addPageNumbers` accepte silencieusement une position inconnue** — `Code.gs:800-806`
  Si `x` vaut autre chose que `center`, `left` ou `right`, `obj[objet.x]` rend `undefined` et pdf-lib échoue plus loin avec un message sans rapport.
  → Position inconnue signalée immédiatement, avec la liste des valeurs admises.

---

## 🟡 Harmonisation

Écarts aux conventions FF Labs, corrigés dans la réécriture :

- **Découpage** : le fichier unique de 1169 lignes est réparti en quatre modules numérotés — `Configuration.gs` (constantes, i18n, types), `ChargeurLibrairies.gs` (CDN et cache), `PDFApp.gs` (le moteur), `Api.gs` (la surface publique) — chacun ouvert par le bandeau de module habituel.
- **`CONFIG` gelé** : les valeurs jusque-là dispersées dans le code sont remontées et nommées — URL de CDN, taille de segment de cache, durée de cache, nombre de tentatives, attente de miniature, largeur de miniature, budget de temps. `VERSION` et `AUTEUR` sont présents, avec une fonction `aPropos()` puisqu'une bibliothèque n'a pas d'interface où afficher un pied de page.
- **Nommage** : les helpers internes anglais sont passés en français (`fetchWithBackoff_` → `recupererAvecRetentative_`, `putLargeCache_`/`getLargeCache_` → `mettreEnCache_`/`lireDepuisCache_`, `loadPdfLib_` → `chargerPdfLib`, `updateObject_` → `preparerElements_`, `getObjectFromSlide_` → `lireModeleSlides_`), de même que les variables locales restées en anglais (`chunkSize`, `retries`, `content`, `result`). **Les noms publics restent en anglais** : voir « Changements de comportement ».
- **JSDoc** : les en-têtes `### Description` de la bibliothèque d'origine sont supprimés, les types précisés (`{promise}` → `{Promise<GoogleAppsScript.Base.Blob>}`), et quatre `@typedef` ajoutés dans `Configuration.gs` pour les structures qui circulent entre modules — `MetadonneesPdf`, `InfoPage`, `ChampFormulaire`, `OptionsEnTetePiedDePage`.
- **Bilinguisme** : les vingt-deux messages d'erreur, jusque-là codés en dur en français, passent par un dictionnaire FR/EN et la fonction `t()`, avec interpolation `%s`.
- **README** : absent, ajouté en version bilingue avec exemples d'utilisation, structure du projet, attribution à la bibliothèque d'origine et pied de page habituel.

---

## Changements de comportement

Sept différences réelles avec l'ancien code. Les six premières sont les corrections décrites plus haut ; la septième demande ton arbitrage.

1. **Le modèle Google Slides n'est plus modifié ni supprimé.** C'est le changement le plus important. Si un code appelant compensait en passant systématiquement une copie jetable, cette copie devient inutile — sans danger, mais elle ne sera plus détruite par la bibliothèque.
2. **`udpateMetadata` est renommée `updateMetadata`.** L'ancien nom, qui porte la faute de frappe d'origine, reste disponible et fonctionne : il journalise un avertissement et délègue au nouveau. Rien à changer dans le code existant.
3. **`updateMetadata` traite désormais `title` comme une chaîne.** L'ancienne écriture étalait toujours la valeur (`...objet[k]`), ce qui, sur une chaîne, envoyait ses caractères un par un à pdf-lib. Un tableau `[titre, options]` continue d'être étalé comme avant.
4. **Les traitements page par page s'arrêtent avant la limite des 6 minutes** (`convertPDFToPng`, `splitPDF`) avec un message indiquant combien de pages ont été traitées, au lieu d'être interrompus par la plateforme.
5. **Les fichiers temporaires vont dans un dossier dédié**, « PDFApplication - fichiers temporaires », créé au premier usage à la racine du Drive, au lieu d'être déposés en vrac.
6. **Les positions explicites d'en-tête s'appliquent maintenant à toutes les pages.** `Code.gs:835` supprimait `x`, `y`, `width` et `text` de l'objet de zone *après* avoir construit les options de la première page. Un appelant qui fournissait lui-même un `x` le voyait donc pris en compte sur la page 1 et ignoré sur toutes les suivantes. Ces clés ne sont plus supprimées : si elles sont fournies, elles s'appliquent partout ; si elles ne le sont pas, rien ne change. À vérifier visuellement si tu passes des positions explicites.
7. **Les noms publics sont restés en anglais** — `setPDFBlob`, `exportPages`, `mergePDFs`, `insertHeaderFooter`… Ta convention veut du français, mais ces noms sont l'interface de la bibliothèque : les traduire casse tous les projets appelants et s'éloigne de la bibliothèque d'origine dont les utilisateurs connaissent l'API. J'ai tranché pour la compatibilité. Si tu préfères franciser, le plus sûr est d'ajouter des alias français pointant vers les fonctions existantes plutôt que de renommer.

---

## Points à ta main

- **Corrections vérifiées par exécution le 20 septembre 2026.** `Tests.gs` : 23 tests, 23 réussis en 41 s. Sont confirmés par un test dédié : `updateMetadata` avec des clés partielles (le blocage qui justifiait toute la réécriture de l'enveloppe asynchrone), l'écriture effective du cache pdf-lib (18 segments) et fontkit (21 segments), le rejet d'un ordre de pages hors limites, la préservation du modèle Slides, l'absence de fichier abandonné après une panne provoquée en cours de conversion, l'intégrité de l'objet appelant après `insertHeaderFooter` et `embedObjects`, et le retour immédiat sur une erreur HTTP définitive (404 en 377 ms, donc sans dérouler les cinq retentatives).

  **Deux réserves sur ce résultat.** Le banc a été écrit par l'auteur de la refactorisation : il vérifie le comportement annoncé, pas l'absence d'angles morts. Et le test du cache prouve que la nouvelle découpe écrit bien en cache, pas que l'ancienne échouait — ce diagnostic reposait sur une hypothèse invérifiable depuis la suppression du fichier d'origine.

- **Rendu visuel contrôlé le 20 septembre 2026.** Les trois PDF produits par `Inspection.gs` ont été ouverts et examinés. Le changement de comportement n° 6 est confirmé : « CONFIDENTIEL », avec son abscisse et sa largeur imposées, apparaît au même endroit sur les quatre pages, alors que l'ancienne implémentation ne l'aurait honoré que sur la première. La numérotation centrée tombe bien au milieu de la page. L'image intégrée s'affiche à l'endroit attendu et les quatre repères textuels confirment l'orientation des axes : origine en bas à gauche, aucune inversion verticale.

- **Piste d'amélioration relevée à cette occasion.** Un élément dont les coordonnées sortent de la page est dessiné sans erreur ni avertissement : il disparaît, simplement. Le premier jeu d'échantillons est tombé dans ce piège, en appliquant des ordonnées de A4 portrait (842 points) à un export Slides en paysage (405 points). Un contrôle des coordonnées contre les dimensions de la page, au moins sous forme de `console.warn`, épargnerait à tes appelants un mode d'échec entièrement silencieux.

- **Polices personnalisées : couvertes, et un bug trouvé au passage.** Les deux tests `useCustomFont` passent désormais, sur un texte dessiné et sur un champ de formulaire. Ils ont révélé un défaut qui préexistait à la refactorisation : fontkit embarque le shim `process` de browserify, dont le code évalue `if (U === setTimeout)`. Cette simple référence lève une `ReferenceError` en Apps Script. La bibliothèque d'origine neutralisait `setTimeout` chez pdf-lib par une substitution textuelle, mais jamais chez fontkit — et cette substitution ne lui convenait pas, car elle suppose un rappel nommé `t`. `evaluerLibrairie_` déclare maintenant `setTimeout` et `clearTimeout` dans la portée d'évaluation, ce qui couvre les deux librairies quels que soient leurs noms internes.

- **Sous-ensemble de police : mesuré, puis écarté.** Sous Node, `embedFont(octets, { subset: true })` fait passer un PDF d'une page de 1 938 Ko à 3 Ko avec une police variable de 3,5 Mo. Sous Apps Script, la même opération fait sortir le moteur JavaScript — « The JavaScript runtime exited unexpectedly » — et arrête le script entier, sans exception rattrapable. `CONFIG.SOUS_ENSEMBLE_POLICE_FIGEE` reste donc à `false`. Le réglage demeure disponible pour une police statique de taille modeste, après essai sur la police et le document réels du projet.

- **Ce qui reste non vérifié.** Le comportement sur des PDF réels : scannés, pages pivotées, formulaires créés par Acrobat, documents de plus de cent pages. Toutes les fixtures du banc sont des exports Google Slides, donc anormalement propres et uniformes. C'est désormais la seule zone d'ombre.

- **Banc final : 26 tests, 26 réussis, 60 secondes.**
- **Licence et attribution.** ✅ Traité. Le `Code.gs` que tu m'as transmis ne portait plus aucune mention de la bibliothèque d'origine : ni l'en-tête « Author: Tanaike », ni les liens `ref:` vers les articles Medium et tanaikech.github.io présents dans le `PDFApp.js` amont. L'attribution a été rétablie en tête de `Configuration.gs`, dans `CONFIG.ORIGINE`, dans les deux versions du README, et un fichier `LICENSE` reprend le texte MIT avec le copyright 2023 Kanshi TANAIKE conservé à côté du tien.
- **Portées OAuth.** J'ai déclaré `drive` en accès complet parce que la bibliothèque crée des fichiers, copie une présentation et met des fichiers à la corbeille en dehors de ce qu'elle a créé. Si tous les appelants passent par des fichiers que la bibliothèque a elle-même créés, `drive.file` suffirait et allégerait nettement l'écran d'autorisation. À vérifier côté projets appelants.
- **Le fichier `Code.gs` d'origine est intact.** Les nouveaux fichiers sont dans le sous-dossier `refactoring-2026-09-20`, à toi de décider quand basculer.
- **Version de pdf-lib.** J'ai épinglé 1.17.1, la version que suggérait ton commentaire de la ligne 259. Si tu tournes en réalité sur une version plus récente et que tu en dépends, corrige `CONFIG.CDN_PDF_LIB` avant de déployer.
- **Les deux autres fichiers de la suite** (`AITools.gs`, `SheetsUI.gs`) ne sont pas dans ce dossier. S'ils appellent `udpateMetadata` ou s'appuient sur le fait que le modèle Slides est consommé, ils méritent un coup d'œil.

---

*Revue réalisée le 20 septembre 2026 · PDFApplication v2.0 · Fabrice FAUCHEUX (faucheux.bzh)*
