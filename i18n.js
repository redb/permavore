/* =========================================================================
   Permavore — internationalisation (FR / EN)

   Architecture (voir aussi le commentaire en tête de data.js) :
   - `LANG` est la langue courante ("fr" ou "en"), détectée au premier
     lancement depuis `navigator.language` (repli sur "fr"), puis persistée
     dans localStorage sous la clé `permavore.lang` (cohérent avec les autres
     clés `permavore.*` du projet).
   - `t(cle, vars)` renvoie la chaîne d'interface correspondant à `cle` dans
     la langue courante, avec un remplacement simple `{nom}` -> valeur.
   - `bi(fr, en)` crée un petit objet bilingue utilisé par data.js pour tout
     champ éditorial (nom de plante, description, conseil, libellé…). Cet
     objet redéfinit `toString()`/`valueOf()` pour renvoyer le texte dans la
     langue courante : la quasi-totalité du code existant (template strings
     `${plante.nom}`, concaténations, affectations à `textContent`/
     `innerHTML`) continue donc de fonctionner SANS modification, puisque le
     moteur JS appelle automatiquement `toString()` lors de la conversion en
     chaîne. Les rares endroits qui appellent une méthode de String
     directement sur un champ bilingue (ex. `.localeCompare(...)`) sont
     adaptés au cas par cas dans app.js.
   - `setLang()` change `LANG`, sauvegarde le choix, retraduit le texte
     statique de la page puis déclenche un nouveau rendu (`rendre()`) pour
     que tout le contenu dynamique se redessine dans la nouvelle langue.
   ========================================================================= */

const LS_LANG = "permavore.lang";
const LANGUES_SUPPORTEES = ["fr", "en"];

function detecterLangueNavigateur() {
  try {
    const brut = (navigator.language || navigator.userLanguage || "fr").toLowerCase();
    if (brut.startsWith("en")) return "en";
    if (brut.startsWith("fr")) return "fr";
  } catch (e) { /* navigator indisponible : repli sur fr */ }
  return "fr";
}

function chargerLangue() {
  try {
    const enregistree = localStorage.getItem(LS_LANG);
    if (LANGUES_SUPPORTEES.includes(enregistree)) return enregistree;
  } catch (e) { /* localStorage indispo */ }
  return detecterLangueNavigateur();
}

let LANG = chargerLangue();

function getLang() { return LANG; }

function sauverLangue(lang) {
  try { localStorage.setItem(LS_LANG, lang); } catch (e) { /* ignore */ }
}

/** Change la langue courante, retraduit le texte statique et redessine l'appli. */
function setLang(lang) {
  if (!LANGUES_SUPPORTEES.includes(lang) || lang === LANG) return;
  LANG = lang;
  sauverLangue(lang);
  document.documentElement.lang = lang;
  if (typeof traduireStatique === "function") traduireStatique();
  if (typeof construireSelecteurLangue === "function") construireSelecteurLangue();
  if (typeof rendre === "function") rendre();
}

/** Remplace {cle} dans `chaine` par vars[cle]. */
function interpoler(chaine, vars) {
  if (!vars) return chaine;
  return chaine.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** Traduction d'une chaîne d'interface fixe. */
function t(cle, vars) {
  const entree = I18N[cle];
  if (!entree) { console.warn("[permavore] clé i18n manquante :", cle); return cle; }
  const chaine = entree[LANG] || entree.fr || cle;
  return interpoler(chaine, vars);
}

/* ---------- Champ bilingue (utilisé par data.js) ------------------------- */
class Bi {
  constructor(fr, en) { this.fr = fr; this.en = en != null ? en : fr; }
  toString() { return LANG === "en" ? this.en : this.fr; }
  valueOf() { return this.toString(); }
  localeCompare(autre, ...reste) {
    return this.toString().localeCompare(String(autre), LANG === "en" ? "en" : "fr", ...reste);
  }
  toLowerCase() { return this.toString().toLowerCase(); }
  toUpperCase() { return this.toString().toUpperCase(); }
  includes(...a) { return this.toString().includes(...a); }
  get length() { return this.toString().length; }
}
function bi(fr, en) { return new Bi(fr, en); }
/** Convertit en chaîne un champ qui peut être bilingue (Bi) ou déjà une chaîne. */
function txt(x) { return x == null ? "" : String(x); }

/* ---------- Mois (calendrier) -------------------------------------------- */
const MOIS_FR = ["janvier","février","mars","avril","mai","juin","juillet",
                 "août","septembre","octobre","novembre","décembre"];
const MOIS_EN = ["January","February","March","April","May","June","July",
                 "August","September","October","November","December"];

/* ---------- Dictionnaire d'interface (FR / EN) ---------------------------- */
const I18N = {
  // Titre / méta
  "page.title": { fr: "Permavore — le potager adapté à ton jardin", en: "Permavore — the vegetable garden built for your yard" },
  "page.description": { fr: "Trouve les fruits et légumes adaptés à ta ville et à la surface de ton jardin. Que planter aujourd'hui ? Permavore te le dit.",
    en: "Find the fruits and vegetables suited to your town and garden size. What should you plant today? Permavore tells you." },

  // En-tête
  "surface.balcon": { fr: "Balcon", en: "Balcony" },
  "surface.balcon.detail": { fr: "moins de 5 m²", en: "under 5 m²" },
  "surface.petit": { fr: "Petit", en: "Small" },
  "surface.petit.detail": { fr: "≈ 15 m²", en: "≈ 15 m²" },
  "surface.moyen": { fr: "Moyen", en: "Medium" },
  "surface.moyen.detail": { fr: "≈ 50 m²", en: "≈ 50 m²" },
  "surface.grand": { fr: "Grand", en: "Large" },
  "surface.grand.detail": { fr: "150 m² et +", en: "150 m² +" },
  "avance.titre": { fr: "Réglages avancés", en: "Advanced settings" },
  "climat.detecte": { fr: "Climat détecté : {zone}", en: "Detected climate: {zone}" },
  "climat.choisi": { fr: "Climat choisi : {zone}", en: "Chosen climate: {zone}" },
  "climat.corriger": { fr: "corriger", en: "change" },
  "erreur.ville.vide": { fr: "Indique ta commune, ou utilise « Me localiser ».", en: "Enter your town, or use “Locate me”." },
  "erreur.ville.introuvable": { fr: "« {v} » introuvable : vérifie l'orthographe ou choisis dans la liste.", en: "“{v}” not found: check the spelling or pick from the list." },
  "geo.remplie": { fr: "📡 {v} trouvée. Choisis ta surface puis lance la recherche.", en: "📡 Found {v}. Pick your area, then start." },
  "btn.filtrer": { fr: "⚙️ Filtrer", en: "⚙️ Filter" },
  "outils.plus": { fr: "🧰 Plus d'outils", en: "🧰 More tools" },
  "now.vide": { fr: "Rien à semer ni à planter ce mois-ci dans ta zone. Regarde ce qui arrive bientôt 👇", en: "Nothing to sow or plant this month in your zone. See what's coming soon 👇" },
  "soon.sous": { fr: "La fenêtre s'ouvre le mois prochain : de quoi préparer la place et les graines.", en: "The window opens next month: time to prepare space and seeds." },
  "carte.pourquoi": { fr: "Pourquoi ?", en: "Why?" },
  "carte.adopter.court": { fr: "Ajouter à mon potager", en: "Add to my garden" },
  "carte.dansPotager.court": { fr: "Dans mon potager", en: "In my garden" },
  "carte.recolte.label": { fr: "Récolte", en: "Harvest" },
  "carte.surface.label": { fr: "Place", en: "Space" },
  "duree.semaines": { fr: "≈ {n} semaines avant récolte", en: "≈ {n} weeks to harvest" },
  "duree.mois": { fr: "≈ {n} mois avant récolte", en: "≈ {n} month to harvest" },
  "duree.mois.pl": { fr: "≈ {n} mois avant récolte", en: "≈ {n} months to harvest" },
  "rendement.label": { fr: "≈ {min}–{max} {unite} (source : {source})", en: "≈ {min}–{max} {unite} (source: {source})" },
  "atout.nourrissant": { fr: "Nourrissant", en: "Filling" },
  "atout.rapide": { fr: "Rapide", en: "Quick" },
  "atout.productif": { fr: "Productif", en: "Productive" },
  "atout.facile": { fr: "Facile", en: "Easy" },
  "atout.conservation": { fr: "Se conserve", en: "Keeps well" },
  "atout.vivace": { fr: "Vivace", en: "Perennial" },
  "atout.estimation": { fr: "estimation", en: "estimate" },
  "atout.estimation.title": { fr: "Classement indicatif, pas une mesure", en: "Indicative ranking, not a measurement" },
  "objectif.titre": { fr: "Qu'attends-tu principalement de ton jardin ?", en: "What do you mainly want from your garden?" },
  "objectif.sous": { fr: "Ton choix change l'ordre des suggestions, sans rien retirer.", en: "Your choice reorders the suggestions without removing any." },
  "objectif.passer": { fr: "Plus tard", en: "Later" },
  "objectif.actif": { fr: "🎯 Priorité : {label}", en: "🎯 Priority: {label}" },
  "objectif.changer": { fr: "Changer", en: "Change" },
  "objectif.aucun": { fr: "Aucune", en: "None" },
  "objectif.nourriture": { fr: "🥔 Produire le maximum de nourriture", en: "🥔 Grow as much food as possible" },
  "objectif.rapide": { fr: "⚡ Récolter rapidement", en: "⚡ Harvest quickly" },
  "objectif.peu_travail": { fr: "😌 Demander le moins de travail possible", en: "😌 As little work as possible" },
  "objectif.annee": { fr: "📅 Produire toute l'année", en: "📅 Food all year round" },
  "objectif.resilient": { fr: "🌳 Créer un jardin résilient", en: "🌳 A resilient garden" },
  "objectif.plaisir": { fr: "🍓 Mélanger productivité et plaisir", en: "🍓 Mix productivity and pleasure" },
  "pq.titre.now": { fr: "Pourquoi maintenant ?", en: "Why now?" },
  "pq.titre.soon": { fr: "Pourquoi bientôt ?", en: "Why soon?" },
  "pq.titre.later": { fr: "Quand la cultiver ?", en: "When to grow it?" },
  "pq.semer": { fr: "semer", en: "sow" },
  "pq.planter": { fr: "planter", en: "plant" },
  "pq.now": { fr: "Dans ta zone ({zone}), on peut {verbe} de {debut} à {fin} : nous sommes en plein dans la fenêtre.", en: "In your zone ({zone}), you can {verbe} from {debut} to {fin}: we're right in the window." },
  "pq.now.unmois": { fr: "Dans ta zone ({zone}), on peut {verbe} en {mois} : c'est maintenant.", en: "In your zone ({zone}), you can {verbe} in {mois}: that's now." },
  "pq.now.dernier": { fr: "Dans ta zone ({zone}), {mois} est le dernier mois pour {verbe} : ne tarde pas.", en: "In your zone ({zone}), {mois} is the last month to {verbe}: don't wait." },
  "pq.soon": { fr: "Dans ta zone ({zone}), la fenêtre pour {verbe} s'ouvre en {mois} : prévois la place dès maintenant.", en: "In your zone ({zone}), the window to {verbe} opens in {mois}: plan the space now." },
  "pq.later": { fr: "Pas encore le moment dans ta zone ({zone}) : on peut {verbe} en {fenetre}.", en: "Not the right time yet in your zone ({zone}): you can {verbe} in {fenetre}." },
  "pq.frileuse": { fr: "Elle craint le gel : ne la mets dehors qu'une fois les gelées passées chez toi.", en: "It's frost-tender: only put it outside once frosts are over where you live." },
  "pq.row.periode": { fr: "Semis / plantation (ta zone)", en: "Sowing / planting (your zone)" },
  "pq.row.recolte": { fr: "Récolte", en: "Harvest" },
  "pq.row.cycle": { fr: "Avant récolte", en: "To harvest" },
  "pq.row.gel": { fr: "Craint le gel", en: "Frost-tender" },
  "pq.row.exposition": { fr: "Exposition", en: "Sun" },
  "pq.row.atouts": { fr: "Atouts", en: "Strengths" },
  "pq.oui": { fr: "oui", en: "yes" },
  "pq.non": { fr: "non", en: "no" },
  "pq.note": { fr: "Calendrier indicatif pour ta zone. La météo réelle (gelées annoncées, fortes chaleurs) n'est pas encore prise en compte : jette un œil aux prévisions avant de semer.", en: "Indicative calendar for your zone. Actual weather (forecast frosts, heat waves) isn't taken into account yet: check the forecast before sowing." },
  "invite.plan.titre": { fr: "Tu veux optimiser leur emplacement ?", en: "Want to optimise where they go?" },
  "invite.plan.sous": { fr: "Dessine ton jardin pour organiser tes planches et la rotation des cultures.", en: "Draw your garden to organise your beds and crop rotation." },
  "invite.plan.btn": { fr: "Dessiner mon jardin", en: "Draw my garden" },
  "invite.plan.plustard": { fr: "Plus tard", en: "Later" },
  "duree.court.semaines": { fr: "≈ {n} semaines", en: "≈ {n} weeks" },
  "duree.court.mois": { fr: "≈ {n} mois", en: "≈ {n} month" },
  "duree.court.mois.pl": { fr: "≈ {n} mois", en: "≈ {n} months" },
  "hero.marque": { fr: "Permavore", en: "Permavore" },
  "hero.titre": { fr: "Que planter chez toi ?", en: "What can you plant at home?" },
  "hero.intro": { fr: "Indique où se trouve ton jardin pour découvrir ce que tu peux planter maintenant.", en: "Tell us where your garden is to discover what you can plant right now." },
  "hero.chargement": { fr: "📅 …", en: "📅 …" },

  // Sélecteur de langue
  "lang.libelle": { fr: "Langue", en: "Language" },
  "lang.fr": { fr: "Français", en: "French" },
  "lang.en": { fr: "Anglais", en: "English" },

  // Barre compacte
  "bc.modifier": { fr: "✎ Modifier", en: "✎ Edit" },

  // Panneau réglages
  "champ.ville.label": { fr: "📍 Où est ton jardin ?", en: "📍 Where is your garden?" },
  "champ.ville.placeholder": { fr: "Ta commune", en: "Your town" },
  "champ.surface.label": { fr: "📐 Surface cultivable, environ", en: "📐 Growing area, roughly" },
  "champ.surface.placeholder": { fr: "ou précise en m²", en: "or enter m²" },
  "champ.zone.label": { fr: "🌍 Climat (détecté automatiquement)", en: "🌍 Climate (detected automatically)" },
  "btn.geo": { fr: "📡 Me localiser", en: "📡 Locate me" },
  "btn.geo.title": { fr: "Me localiser", en: "Locate me" },
  "btn.go": { fr: "Voir ce que je peux planter", en: "See what I can plant" },
  "zone.note.defaut": { fr: "Climat de référence. Ajuste-le si besoin.", en: "Reference climate. Adjust it if needed." },

  // Barre d'outils
  "recherche.placeholder": { fr: "🔍 Rechercher une culture", en: "🔍 Search for a crop" },
  "affichage.label": { fr: "Affichage", en: "Display" },
  "vue.liste.title": { fr: "Liste compacte", en: "Compact list" },
  "vue.cartes.title": { fr: "Cartes", en: "Cards" },
  "mon.potager": { fr: "🌱 Mon potager ({n})", en: "🌱 My garden ({n})" },
  "btn.ajouter": { fr: "➕ Ajouter", en: "➕ Add" },
  "btn.ressources": { fr: "🧰 Mes ressources", en: "🧰 My resources" },
  "btn.photo": { fr: "📷 Photo sachet", en: "📷 Seed packet photo" },
  "btn.identifier": { fr: "🔍 Identifier une plante", en: "🔍 Identify a plant" },
  "id.titre": { fr: "🔍 Identifier une plante", en: "🔍 Identify a plant" },
  "id.sous": { fr: "Que montre la photo ? Le préciser rend l'identification plus fiable.",
               en: "What does the photo show? Saying so makes identification more reliable." },
  "id.organe.auto": { fr: "❔ Je ne sais pas", en: "❔ Not sure" },
  "id.organe.leaf": { fr: "🍃 Feuille", en: "🍃 Leaf" },
  "id.organe.flower": { fr: "🌸 Fleur", en: "🌸 Flower" },
  "id.organe.fruit": { fr: "🍎 Fruit", en: "🍎 Fruit" },
  "id.organe.bark": { fr: "🪵 Écorce / tige", en: "🪵 Bark / stem" },
  "id.lancer": { fr: "Identifier", en: "Identify" },
  "id.analyse": { fr: "Identification en cours…", en: "Identifying…" },
  "id.confiance": { fr: "{pct} % de confiance", en: "{pct}% confidence" },
  "id.voirfiche": { fr: "Voir la fiche", en: "View sheet" },
  "id.ajouter": { fr: "Ajouter à la base", en: "Add to the database" },
  "id.reprendre": { fr: "Reprendre une photo", en: "Take another photo" },
  "id.incertain": { fr: "Identification incertaine : reprends une photo nette et rapprochée d'une feuille ou d'une fleur, sur un fond dégagé.",
                    en: "Uncertain identification: take a sharp close-up of a leaf or flower against a plain background." },
  "id.aucun": { fr: "Aucune espèce reconnue. Essaie une photo plus nette d'une feuille ou d'une fleur.",
                en: "No species recognised. Try a sharper photo of a leaf or flower." },
  "id.securite": { fr: "⚠️ Ne mange jamais une plante sur la seule foi d'une identification automatique : plusieurs espèces comestibles ont des sosies toxiques.",
                   en: "⚠️ Never eat a plant based on an automatic identification alone: several edible species have toxic look-alikes." },
  "id.source": { fr: "Identification : Pl@ntNet", en: "Identification: Pl@ntNet" },
  "id.err.titre": { fr: "Identification impossible", en: "Identification failed" },
  "id.err.non_configure": { fr: "L'identification n'est pas encore activée sur ce site.",
                            en: "Identification is not enabled on this site yet." },
  "id.err.trop_de_demandes": { fr: "Trop de demandes rapprochées. Réessaie dans une minute.",
                               en: "Too many requests. Try again in a minute." },
  "id.err.quota": { fr: "Le quota quotidien d'identifications est atteint. Réessaie demain.",
                    en: "The daily identification quota is reached. Try again tomorrow." },
  "id.err.reseau": { fr: "Le service d'identification ne répond pas. Réessaie plus tard.",
                     en: "The identification service is not responding. Try again later." },
  "id.err.photo": { fr: "Cette image n'a pas pu être lue.", en: "This image could not be read." },
  "btn.plan": { fr: "🗺️ Plan du jardin", en: "🗺️ Garden plan" },

  "filtres.aria": { fr: "Filtres", en: "Filters" },

  // Sections
  "lune.bandeau.title": { fr: "Voir le calendrier lunaire", en: "View the lunar calendar" },

  "plan.titre": { fr: "Mon plan de jardin", en: "My garden plan" },
  "plan.taille.btn": { fr: "📐 Taille du jardin", en: "📐 Garden size" },
  "plan.aide": { fr: "Dessine une planche en glissant le doigt, puis valide avec ✓ (ou annule avec ✕). Un tap simple propose une planche d'1 m². Clique une planche pour la cultiver.",
    en: "Draw a bed by dragging, then confirm with ✓ (or cancel with ✕). A simple tap proposes a 1 m² bed. Click a bed to plant something in it." },
  "plan.legende.libre": { fr: "Planche libre", en: "Empty bed" },
  "plan.legende.culture": { fr: "En culture", en: "Planted" },
  "plan.legende.recolte": { fr: "Récolte en cours", en: "Harvest under way" },
  "plan.legende.echelle": { fr: "📐 1 carreau fin = 0,5 m · 1 carreau épais = 1 m", en: "📐 1 thin square = 0.5 m · 1 thick square = 1 m" },

  "etapes.titre": { fr: "Prochaines étapes au potager", en: "Upcoming garden tasks" },
  "etapes.sous": { fr: "Prévisions calculées d'après tes dates de semis et de plantation.", en: "Forecasts calculated from your sowing and planting dates." },
  "etapes.cemois": { fr: "Ce mois-ci", en: "This month" },

  "now.titre": { fr: "À planter maintenant", en: "Plant now" },
  "now.sous": { fr: "Nous sommes le {date} : voici les cultures à semer ou planter dans ta zone.", en: "Today is {date}: here are the crops to sow or plant in your zone." },

  "soon.titre": { fr: "Bientôt", en: "Coming soon" },

  "autres.titre": { fr: "Autres cultures adaptées", en: "Other suitable crops" },
  "autres.sous.defaut": { fr: "Toutes les cultures qui s'accommodent de ton climat.", en: "All the crops that suit your climate." },
  "autres.sous.surface": { fr: "Estimations calculées pour un jardin de {surface} m².", en: "Estimates calculated for a {surface} m² garden." },
  "vide.defaut": { fr: "Aucune culture ne correspond à ces filtres.", en: "No crop matches these filters." },
  "vide.recherche": { fr: "Aucune plante ne correspond à « {q} ».", en: "No plant matches “{q}”." },
  "vide.ajouter": { fr: "➕ Ajouter « {q} » à la base", en: "➕ Add “{q}” to the catalog" },
  "total.count": { fr: "{n} culture adaptée", en: "{n} suitable crop" },
  "total.count.pl": { fr: "{n} cultures adaptées", en: "{n} suitable crops" },

  // Footer
  "footer.marque": { fr: "<strong>Permavore</strong> — sélecteur de cultures pour jardin nourricier.", en: "<strong>Permavore</strong> — crop picker for a home food garden." },
  "footer.note": { fr: "Calendrier indicatif (France métropolitaine), à adapter à la météo réelle et à ton microclimat.",
    en: "Indicative calendar (mainland France), to be adjusted to actual weather and your microclimate." },
  "footer.credit": { fr: "Police du nom « Permavore » : Graham par <a href=\"https://www.zetafonts.com\" target=\"_blank\" rel=\"noopener\">Zetafonts</a>. Photo d'accueil : <a href=\"https://pixabay.com/fr/photos/pousse-plante-sol-germination-10339344/\" target=\"_blank\" rel=\"noopener\">Pixabay</a>.", en: "Font used for the “Permavore” name: Graham by <a href=\"https://www.zetafonts.com\" target=\"_blank\" rel=\"noopener\">Zetafonts</a>. Home photo: <a href=\"https://pixabay.com/fr/photos/pousse-plante-sol-germination-10339344/\" target=\"_blank\" rel=\"noopener\">Pixabay</a>." },

  // Filtres catégories/cycle
  "filtre.tout": { fr: "Tout", en: "All" },
  "filtre.legumes": { fr: "🥕 Légumes", en: "🥕 Vegetables" },
  "filtre.fruits": { fr: "🍓 Fruits", en: "🍓 Fruits" },
  "filtre.aromatiques": { fr: "🌿 Aromatiques", en: "🌿 Herbs" },
  "filtre.exotiques": { fr: "🥭 Exotiques", en: "🥭 Exotic" },
  "filtre.annuelles": { fr: "🌱 Annuelles", en: "🌱 Annuals" },
  "filtre.bisannuelles": { fr: "🔄 Bisannuelles", en: "🔄 Biennials" },
  "filtre.vivaces": { fr: "♻️ Vivaces", en: "♻️ Perennials" },
  "filtre.petits": { fr: "📦 Petits espaces", en: "📦 Small spaces" },

  // Carte / ligne / modale plante
  "carte.aplanter": { fr: "🌱 À planter", en: "🌱 Plant now" },
  "carte.bientot": { fr: "⏳ Bientôt", en: "⏳ Coming soon" },
  "carte.partenaire": { fr: "Partenaire ✦", en: "Partner ✦" },
  "carte.piedsconseilles": { fr: "🪴 ≈ {n} conseillé", en: "🪴 ≈ {n} recommended" },
  "carte.piedsconseilles.pl": { fr: "🪴 ≈ {n} conseillés", en: "🪴 ≈ {n} recommended" },
  "carte.semer": { fr: "🌱 Semer / planter : ", en: "🌱 Sow / plant: " },
  "carte.recolte": { fr: "🧺 Récolte : ", en: "🧺 Harvest: " },
  "carte.trouver": { fr: "🛒 Trouver", en: "🛒 Find seeds" },
  "carte.plante": { fr: "✓ Dans mon potager", en: "✓ In my garden" },
  "carte.adopter": { fr: "＋ Ajouter à mon potager", en: "＋ Add to my garden" },
  "ligne.aplanter": { fr: "🌱 à planter maintenant", en: "🌱 plant now" },
  "modale.aplanter": { fr: "à planter maintenant", en: "plant now" },
  "modale.ajouteeparToi": { fr: "Ajoutée par toi", en: "Added by you" },
  "modale.enracinee": { fr: "🌱 Enracinée", en: "🌱 Growing" },
  "modale.calendrier": { fr: "📅 Calendrier (zone {zone})", en: "📅 Calendar (zone {zone})" },
  "modale.semerplanter": { fr: "Semer / planter : ", en: "Sow / plant: " },
  "modale.recolte": { fr: "Récolte : ", en: "Harvest: " },
  "modale.estimation": { fr: "🌾 Estimation pour ton jardin", en: "🌾 Estimate for your garden" },
  "modale.calc.avecsurface": { fr: "Pour ton jardin de <strong>{surface} m²</strong>, en lui consacrant ~{dediee} m² (une portion raisonnable), tu peux viser <strong>{pieds}</strong> — {densite}.",
    en: "For your <strong>{surface} m²</strong> garden, devoting ~{dediee} m² to it (a reasonable share), you can aim for <strong>{pieds}</strong> — {densite}." },
  "modale.calc.sanssurface": { fr: "Densité : <strong>{densite}</strong>. Renseigne la surface de ton jardin pour une estimation personnalisée.",
    en: "Density: <strong>{densite}</strong>. Enter your garden's size for a personalized estimate." },
  "modale.suivi": { fr: "📆 Suivi de culture", en: "📆 Growing tracker" },
  "modale.suivi.date": { fr: "Semé / planté le", en: "Sown / planted on" },
  "modale.suivi.note": { fr: "Estimations indicatives, à ajuster à la météo réelle.", en: "Indicative estimates, to be adjusted to actual weather." },
  "modale.fiche": { fr: "🧭 Fiche technique", en: "🧭 Fact sheet" },
  "fiche.cycle": { fr: "Cycle", en: "Cycle" },
  "fiche.difficulte": { fr: "Difficulté", en: "Difficulty" },
  "fiche.exposition": { fr: "Exposition", en: "Exposure" },
  "fiche.encombrement": { fr: "Encombrement", en: "Footprint" },
  "fiche.densite": { fr: "Densité", en: "Density" },
  "fiche.espacement": { fr: "Espacement", en: "Spacing" },
  "modale.conseils": { fr: "💡 Conseils", en: "💡 Tips" },
  "modale.sachets": { fr: "🌾 Mes sachets archivés", en: "🌾 My archived seed packets" },
  "lien.trouvergraines": { fr: "🛒 Où trouver graines / plants", en: "🛒 Where to find seeds / plants" },
  "lien.partenaire": { fr: "Lien partenaire ✦", en: "Partner link ✦" },
  "btn.supprplante": { fr: "🗑️ Supprimer cette plante ajoutée", en: "🗑️ Delete this added plant" },
  "confirm.supprplante": { fr: "Supprimer « {nom} » de ta base ?", en: "Delete “{nom}” from your catalog?" },
  "etape.vide": { fr: "Renseigne la date pour prévoir les étapes.", en: "Enter the date to see the upcoming steps." },

  // Formulaire d'ajout
  "form.titre": { fr: "➕ Ajouter une plante", en: "➕ Add a plant" },
  "form.sous": { fr: "Enregistrée dans ton navigateur, elle apparaîtra comme les autres.", en: "Saved in your browser, it will appear like any other plant." },
  "form.nom": { fr: "Nom *", en: "Name *" },
  "form.nom.placeholder": { fr: "Ex. Topinambour", en: "E.g. Jerusalem artichoke" },
  "form.autoremplir": { fr: "✨ Auto-remplir", en: "✨ Auto-fill" },
  "form.latin": { fr: "Nom latin", en: "Latin name" },
  "form.facultatif": { fr: "Facultatif", en: "Optional" },
  "form.categorie": { fr: "Catégorie", en: "Category" },
  "form.emoji": { fr: "Emoji", en: "Emoji" },
  "form.photo": { fr: "Photo (URL)", en: "Photo (URL)" },
  "form.photo.placeholder": { fr: "https://… (facultatif)", en: "https://… (optional)" },
  "form.cycle": { fr: "Cycle", en: "Cycle" },
  "form.difficulte": { fr: "Difficulté", en: "Difficulty" },
  "form.encombrement": { fr: "Encombrement", en: "Footprint" },
  "form.exposition": { fr: "Exposition", en: "Exposure" },
  "form.densite": { fr: "Densité (pieds/m²)", en: "Density (plants/m²)" },
  "form.espacement": { fr: "Espacement", en: "Spacing" },
  "form.espacement.placeholder": { fr: "Ex. 30 cm", en: "E.g. 30 cm" },
  "form.semisdeb": { fr: "Semer/planter — début", en: "Sow/plant — start" },
  "form.semisfin": { fr: "Semer/planter — fin", en: "Sow/plant — end" },
  "form.recolte": { fr: "Période de récolte", en: "Harvest period" },
  "form.recolte.placeholder": { fr: "Ex. Juillet → octobre", en: "E.g. July → October" },
  "form.court": { fr: "Description courte", en: "Short description" },
  "form.court.placeholder": { fr: "Une phrase d'accroche", en: "A one-line teaser" },
  "form.long": { fr: "Description longue", en: "Long description" },
  "form.conseils": { fr: "Conseils (un par ligne)", en: "Tips (one per line)" },
  "form.conseils.placeholder": { fr: "Un conseil par ligne", en: "One tip per line" },
  "form.lien": { fr: "Lien d'achat (affilié possible)", en: "Purchase link (affiliate allowed)" },
  "form.enracinee.titre": { fr: "🌱 J'ai enraciné cette plante", en: "🌱 I'm already growing this plant" },
  "form.enracinee.sous": { fr: "Elle pousse déjà chez moi. Cela ne publie pas encore d'offre de graines.", en: "It's already growing at my place. This doesn't publish a seed listing yet." },
  "form.frileux": { fr: "Frileuse (sensible au gel — exclue en montagne)", en: "Frost-sensitive (excluded from mountain climate)" },
  "form.sponsorise": { fr: "Lien sponsorisé (badge « Partenaire »)", en: "Sponsored link (“Partner” badge)" },
  "form.annuler": { fr: "Annuler", en: "Cancel" },
  "form.enregistrer": { fr: "Enregistrer la plante", en: "Save the plant" },

  "erreur.nomrequis": { fr: "Le nom de la plante est obligatoire.", en: "The plant name is required." },
  "erreur.photo.title": { fr: "URL non reconnue comme image (jpg/png/webp/gif attendu — pas de .ogg/.svg/vidéo)",
    en: "URL not recognized as an image (jpg/png/webp/gif expected — no .ogg/.svg/video)" },
  "erreur.photo": { fr: "La photo doit utiliser une URL HTTP(S) vers une image JPG, PNG, WebP, GIF ou AVIF.",
    en: "The photo must be an HTTP(S) URL to a JPG, PNG, WebP, GIF or AVIF image." },
  "erreur.enregistrement": { fr: "Impossible d'enregistrer : {erreurs}", en: "Could not save: {erreurs}" },

  // Wikipédia auto-remplissage
  "auto.recherche": { fr: "Recherche sur Wikipédia…", en: "Searching Wikipedia…" },
  "auto.introuvable": { fr: "Aucune page Wikipédia trouvée pour ce nom — remplis à la main.", en: "No Wikipedia page found for this name — fill in manually." },
  "auto.injoignable": { fr: "Wikipédia injoignable pour le moment — remplis à la main.", en: "Wikipedia is unreachable right now — fill in manually." },
  "auto.homonymie": { fr: "« {nom} » désigne plusieurs choses sur Wikipédia (homonymie) — précise (ex. « {nom} commun », « {nom} (plante) ») puis relance Auto-remplir.",
    en: "“{nom}” refers to several things on Wikipedia (disambiguation) — be more specific (e.g. “common {nom}”, “{nom} (plant)”) then run Auto-fill again." },
  "auto.rempli.manque": { fr: "✓ Rempli depuis Wikipédia ({manques} introuvable{s} — l'emoji sert d'illustration) — relis avant d'enregistrer.",
    en: "✓ Filled in from Wikipedia ({manques} not found — the emoji is used as illustration) — review before saving." },
  "auto.rempli.ok": { fr: "✓ Rempli depuis Wikipédia + Wikidata (texte, nom latin, photo) — relis avant d'enregistrer.",
    en: "✓ Filled in from Wikipedia + Wikidata (text, Latin name, photo) — review before saving." },
  "auto.manque.latin": { fr: "nom latin", en: "Latin name" },
  "auto.manque.photo": { fr: "photo", en: "photo" },
  "auto.et": { fr: " et ", en: " and " },

  // Question "déjà plantée ?"
  "plantee.titre.sachet": { fr: "Sachet archivé ✅", en: "Seed packet archived ✅" },
  "plantee.titre.ajout": { fr: "{nom} ajoutée ✅", en: "{nom} added ✅" },
  "plantee.sous.sachet": { fr: "Il est rattaché à {nom}.", en: "It's linked to {nom}." },
  "plantee.sous.ajout": { fr: "Elle fait maintenant partie de ta base.", en: "It's now part of your catalog." },
  "plantee.question": { fr: "🌱 Tu l'as déjà en terre ?", en: "🌱 Is it already planted?" },
  "plantee.explication": { fr: "Si oui, je la mets dans « Mon potager » et je te préviendrai pour l'arrosage, l'entretien et la récolte.",
    en: "If so, I'll add it to “My garden” and remind you about watering, care and harvest." },
  "plantee.date": { fr: "Date de plantation", en: "Planting date" },
  "plantee.non": { fr: "Pas encore", en: "Not yet" },
  "plantee.oui": { fr: "✓ Oui, elle est plantée", en: "✓ Yes, it's planted" },

  // Ressources
  "ressources.titre": { fr: "🧰 Mes ressources", en: "🧰 My resources" },
  "ressources.sous": { fr: "Dis-moi ce que tu as sous la main : je te le rappellerai au bon moment.", en: "Tell me what you have on hand: I'll remind you at the right time." },
  "ressources.possede": { fr: "Ce que je possède ({n})", en: "What I have ({n})" },
  "ressources.retirer": { fr: "Retirer", en: "Remove" },
  "ressources.rien": { fr: "Rien pour l'instant — ajoute ce que tu as ci-dessous.", en: "Nothing yet — add what you have below." },
  "ressources.ajouter": { fr: "Ajouter", en: "Add" },
  "ressources.toutajoute": { fr: "Tu as déjà tout ajouté 👍", en: "You've already added everything 👍" },
  "ressources.maintenant": { fr: "c'est le moment", en: "it's time" },
  "ressources.desmois": { fr: "dès {mois} (le mois prochain)", en: "starting {mois} (next month)" },
  "ressources.apartirde": { fr: "à partir de {mois}", en: "starting {mois}" },
  "ressource.detail.souscat": { fr: "Ta ressource · {quand}", en: "Your resource · {quand}" },
  "ressource.periode": { fr: "📅 Période d'emploi", en: "📅 Time to use" },
  "ressource.surquoi": { fr: "🎯 Sur quoi l'utiliser", en: "🎯 What to use it on" },
  "ressource.tonpotager": { fr: "Dans <strong>ton</strong> potager : {liste}.", en: "In <strong>your</strong> garden: {liste}." },
  "ressource.aucune": { fr: "Aucune de tes plantes adoptées n'est concernée pour l'instant.", en: "None of your added plants are concerned for now." },
  "ressource.adapteesgeneral": { fr: "Plantes adaptées en général : {liste}{suite}", en: "Generally suitable plants: {liste}{suite}" },
  "ressource.pourliste": { fr: " — pour {liste}", en: " — for {liste}" },

  // Lune
  "lune.croissante": { fr: "croissante", en: "waxing" },
  "lune.decroissante": { fr: "décroissante", en: "waning" },
  "lune.montante": { fr: "montante ↗", en: "ascending ↗" },
  "lune.descendante": { fr: "descendante ↘", en: "descending ↘" },
  "lune.aprofite": { fr: " — {n} de tes plantes en profite.", en: " — {n} of your plants benefits from it." },
  "lune.aprofitent": { fr: " — {n} de tes plantes en profitent.", en: " — {n} of your plants benefit from it." },
  "lune.agejours": { fr: "Lune de {age} jour(s) · constellation du {constellation}", en: "Moon at {age} day(s) · in the constellation of {constellation}" },
  "lune.croissantelabel": { fr: "🌒 Croissante", en: "🌒 Waxing" },
  "lune.decroissantelabel": { fr: "🌘 Décroissante", en: "🌘 Waning" },
  "lune.montantelabel": { fr: "↗ Montante", en: "↗ Ascending" },
  "lune.descendantelabel": { fr: "↘ Descendante", en: "↘ Descending" },
  "lune.favorise": { fr: "{picto} Aujourd'hui, on favorise…", en: "{picto} Today's the day for…" },
  "lune.aplanteret": { fr: "À planter maintenant et en phase avec le jour : <strong>{liste}</strong>.", en: "To plant now and in tune with the day: <strong>{liste}</strong>." },
  "lune.prochains": { fr: "📅 Prochains jours favorables", en: "📅 Next favorable days" },
  "lune.asavoir": { fr: "ℹ️ À savoir", en: "ℹ️ Good to know" },
  "lune.disclaimer": { fr: "Les positions de la Lune sont calculées précisément. Le découpage racine / feuille / fleur / fruit relève, lui, d'une tradition de jardinage (biodynamie) dont l'effet n'est pas démontré scientifiquement : à prendre comme un repère de rythme, jamais avant la météo et l'état réel de ton sol.",
    en: "The Moon's positions are calculated precisely. The root / leaf / flower / fruit breakdown, on the other hand, comes from a gardening tradition (biodynamics) whose effect is not scientifically proven: treat it as a rhythm to follow, never ahead of the weather and the actual state of your soil." },
  "lune.jour": { fr: "Jour {type}", en: "{type} day" },

  // Étapes
  "etape.recoltecours": { fr: "Récolte en cours (jusqu'à fin {mois})", en: "Harvest under way (until end of {mois})" },
  "etape.debutrecolte": { fr: "Début de récolte (estimation)", en: "Harvest start (estimate)" },
  "etape.horscalendrier": { fr: "Mise en place hors calendrier — récolte de référence {debut} → {fin}", en: "Planted outside the usual calendar — reference harvest {debut} → {fin}" },
  "etape.leveeattendue": { fr: "Levée attendue (~{n} jours)", en: "Germination expected (~{n} days)" },
  "etape.leveeattendue.range": { fr: "Levée attendue ({min} à {max} jours)", en: "Germination expected ({min} to {max} days)" },
  "etape.eclaircir": { fr: "Éclaircir à {espacement}", en: "Thin to {espacement}" },
  "mode.semis": { fr: "Semis", en: "Sowing" },
  "mode.plant": { fr: "Plantation du plant", en: "Transplanting" },
  "mode.tubercule": { fr: "Plantation des tubercules", en: "Planting the tubers" },
  "mode.caieu": { fr: "Plantation des caïeux", en: "Planting the cloves" },
  "mode.rhizome": { fr: "Plantation du rhizome", en: "Planting the rhizome" },

  // Semences (non affiché directement mais gardé pour cohérence future)
  "semences.bisannuelle": { fr: "Montée en graines vers l'été {annee}", en: "Bolting to seed around summer {annee}" },
  "semences.bisannuelle.note": { fr: "Bisannuelle : elle ne fait pas de graines la première année. Les pieds porte-graines doivent passer l'hiver en place.",
    en: "Biennial: it doesn't set seed the first year. Seed-bearing plants must overwinter in place." },
  "semences.graines": { fr: "Graines récoltables vers {mois} {annee}", en: "Seeds harvestable around {mois} {annee}" },
  "semences.note": { fr: "Laisser les fruits porte-graines mûrir au-delà du stade de consommation, sur des pieds sains et conformes.",
    en: "Let seed-bearing fruit ripen beyond the eating stage, on healthy, true-to-type plants." },

  // Ville / géolocalisation
  "ac.aucune": { fr: "Aucune commune trouvée", en: "No town found" },
  "ville.introuvable": { fr: "« {v} » non reconnue — ajuste le climat", en: "“{v}” not recognized — adjust the climate" },
  "ville.introuvable2": { fr: "« {v} » introuvable — ajuste le climat", en: "“{v}” not found — adjust the climate" },
  "geo.indisponible": { fr: "Géolocalisation non disponible sur ce navigateur.", en: "Geolocation is not available in this browser." },
  "geo.encours": { fr: "Localisation en cours…", en: "Locating…" },
  "geo.positiondetectee": { fr: "📡 Position détectée (estimation)", en: "📡 Position detected (estimate)" },
  "geo.recherchecommune": { fr: "Recherche de ta ville…", en: "Looking up your town…" },
  "geo.refusee": { fr: "Localisation refusée : saisis simplement le nom de ta commune.", en: "Location access denied: just type the name of your town." },
  "geo.altitudependant": { fr: "⛰️ {alt} m d'altitude", en: "⛰️ {alt} m elevation" },
  "geo.altitudepiemont": { fr: "⛰️ {alt} m — surveille les gelées tardives", en: "⛰️ {alt} m — watch for late frosts" },
  "geo.altitude": { fr: "{alt} m d'altitude", en: "{alt} m elevation" },

  // Sachets
  "sachet.aucun": { fr: "Aucun sachet archivé. Utilise <strong>📷 Photo sachet</strong> pour garder la trace de la variété et des consignes du semencier.",
    en: "No seed packet archived yet. Use <strong>📷 Seed packet photo</strong> to keep track of the variety and the seed company's instructions." },
  "sachet.alt": { fr: "Sachet {nom}", en: "{nom} seed packet" },
  "sachet.titredefaut": { fr: "Sachet", en: "Seed packet" },
  "sachet.archivele": { fr: "archivé le", en: "archived on" },
  "sachet.infos": { fr: "Informations relevées", en: "Recorded details" },
  "sachet.semencier": { fr: "Semencier", en: "Seed company" },
  "sachet.anneedluo": { fr: "Année / DLUO", en: "Year / best-by" },
  "sachet.retour": { fr: "← Retour à la fiche", en: "← Back to the plant sheet" },
  "sachet.supprimer": { fr: "🗑️ Supprimer", en: "🗑️ Delete" },
  "sachet.traitement": { fr: "Traitement de la photo…", en: "Processing the photo…" },
  "sachet.uninstant": { fr: "Un instant…", en: "One moment…" },
  "sachet.illisible.titre": { fr: "Photo illisible", en: "Unreadable photo" },
  "sachet.illisible.msg": { fr: "Ce fichier n'a pas pu être lu comme une image. Réessaie.", en: "This file could not be read as an image. Please try again." },
  "sachet.photographie": { fr: "📷 Sachet photographié", en: "📷 Seed packet photographed" },
  "sachet.rattacher": { fr: "Rattache-le à une plante : il servira de guide et d'archive.", en: "Link it to a plant: it will serve as a guide and an archive." },
  "sachet.apercu": { fr: "Aperçu du sachet", en: "Seed packet preview" },
  "sachet.quelleplante": { fr: "Quelle plante ?", en: "Which plant?" },
  "sachet.tapelenom": { fr: "Tape le nom lu sur le sachet…", en: "Type the name shown on the packet…" },
  "sachet.aucuneconnue": { fr: "Aucune plante connue sous ce nom.", en: "No known plant matches this name." },
  "sachet.creerfiche": { fr: "➕ Créer une nouvelle fiche", en: "➕ Create a new plant sheet" },
  "sachet.creerfichepour": { fr: "➕ Créer une nouvelle fiche pour « {filtre} »", en: "➕ Create a new plant sheet for “{filtre}”" },
  "sachet.recopie": { fr: "Recopie ce qui est utile sur le sachet (tout est facultatif).", en: "Copy over anything useful from the packet (all optional)." },
  "sachet.variete": { fr: "Variété", en: "Variety" },
  "sachet.variete.placeholder": { fr: "Ex. Cœur de bœuf", en: "E.g. Brandywine" },
  "sachet.semencier.placeholder": { fr: "Ex. Kokopelli", en: "E.g. Baker Creek" },
  "sachet.datelimite": { fr: "Année / date limite de semis", en: "Year / sow-by date" },
  "sachet.datelimite.placeholder": { fr: "Ex. à semer avant 2029", en: "E.g. sow before 2029" },
  "sachet.notes": { fr: "Notes du sachet", en: "Packet notes" },
  "sachet.notes.placeholder": { fr: "Profondeur, éclaircissage, conseils du semencier…", en: "Depth, thinning, seed company tips…" },
  "sachet.illustrer": { fr: "Utiliser cette photo pour illustrer la plante (identification)", en: "Use this photo to illustrate the plant (identification)" },
  "sachet.changerplante": { fr: "← Changer de plante", en: "← Change plant" },
  "sachet.archiver": { fr: "🌾 Archiver le sachet", en: "🌾 Archive the seed packet" },
  "sachet.archimpossible.titre": { fr: "Archivage impossible", en: "Could not archive" },
  "sachet.archimpossible.msg": { fr: "Le stockage local du navigateur a refusé l'enregistrement (espace saturé ou navigation privée). La photo n'a pas été conservée.",
    en: "The browser's local storage refused to save it (storage full or private browsing). The photo was not kept." },
  "msg.fermer": { fr: "Fermer", en: "Close" },

  // Plan du jardin
  "plan.taillejardin.titre": { fr: "📐 Taille du jardin", en: "📐 Garden size" },
  "plan.taillejardin.sous": { fr: "En mètres, par pas de {pas} m. Les planches déjà posées doivent tenir dans le nouveau plan.",
    en: "In meters, in steps of {pas} m. Existing beds must fit within the new plan." },
  "plan.largeur": { fr: "Largeur (m)", en: "Width (m)" },
  "plan.longueur": { fr: "Longueur (m)", en: "Length (m)" },
  "plan.appliquer": { fr: "Appliquer", en: "Apply" },
  "plan.tailleinvalide": { fr: "Largeur et longueur doivent être entre {min} et {max} m.", en: "Width and length must be between {min} and {max} m." },
  "plan.deborde": { fr: "Une ou plusieurs planches existantes sortiraient du nouveau plan. Déplace ou supprime-les d'abord, ou choisis une taille plus grande.",
    en: "One or more existing beds would fall outside the new plan. Move or delete them first, or choose a larger size." },
  "plan.occupe.titre": { fr: "Emplacement occupé", en: "Space already taken" },
  "plan.occupe.msg": { fr: "Une planche se trouve déjà à cet endroit. Dessine ailleurs, ou supprime la planche existante.",
    en: "A bed already exists at this spot. Draw elsewhere, or delete the existing bed." },
  "plan.anneuler": { fr: "Annuler cette planche", en: "Cancel this bed" },
  "plan.valider": { fr: "Valider cette planche", en: "Confirm this bed" },
  "planche.libre": { fr: "🟫 Planche libre", en: "🟫 Empty bed" },
  "planche.recolteencours": { fr: "Récolte en cours", en: "Harvest under way" },
  "planche.cultureenplace": { fr: "🌱 Culture en place", en: "🌱 Currently growing" },
  "planche.semeele": { fr: "Semée / plantée le", en: "Sown / planted on" },
  "planche.famille": { fr: "Famille : {famille} · ", en: "Family: {famille} · " },
  "planche.recolteterminee": { fr: "🧺 Récolte terminée", en: "🧺 Harvest finished" },
  "planche.quecultiver": { fr: "🌱 Que cultiver ici ?", en: "🌱 What to grow here?" },
  "planche.historique": { fr: "📜 Historique de la planche", en: "📜 Bed history" },
  "planche.aucunhistorique": { fr: "Aucune culture précédente enregistrée.", en: "No previous crop recorded." },
  "planche.fermer": { fr: "Fermer", en: "Close" },
  "planche.supprimer": { fr: "🗑️ Supprimer la planche", en: "🗑️ Delete the bed" },
  "planche.inconnue": { fr: "?", en: "?" },
  "rotation.apres": { fr: "Après {precedent}, l'étape suivante du cycle est <strong>{suivant}</strong>.",
    en: "After {precedent}, the next step in the cycle is <strong>{suivant}</strong>." },
  "rotation.precedentedefaut": { fr: "la culture précédente", en: "the previous crop" },
  "rotation.neuve": { fr: "Planche neuve : on démarre par une <strong>légumineuse</strong>, qui enrichit le sol en azote.",
    en: "New bed: start with a <strong>legume</strong>, which enriches the soil with nitrogen." },
  "rotation.aucune": { fr: "Aucune culture adaptée trouvée.", en: "No suitable crop found." },
  "rotation.aeviter": { fr: "À éviter ici :", en: "Avoid here:" },
  "rotation.compatible": { fr: "compatible avec cette planche", en: "compatible with this bed" },
  "rotation.dejacultivee": { fr: "{famille} déjà cultivée ici il y a {ecart} — attendre 3 ans",
    en: "{famille} was already grown here {ecart} — wait 3 years" },
  "rotation.cetteannee": { fr: "cette année", en: "this year" },
  "rotation.ans": { fr: "{n} an(s)", en: "{n} year(s)" },
  "rotation.memecategorie": { fr: "même catégorie que la culture précédente", en: "same category as the previous crop" },
  "rotation.restaureazote": { fr: "restaure l'azote après une culture gourmande", en: "restores nitrogen after a hungry crop" },
  "rotation.plantablemaintenant": { fr: "se sème ou se plante en ce moment", en: "can be sown or planted right now" },
  "rotation.legumineuse.label": { fr: "Légumineuse", en: "Legume" },
  "rotation.legumineuse.role": { fr: "fixe l'azote dans le sol", en: "fixes nitrogen in the soil" },
  "rotation.feuille.label": { fr: "Feuille", en: "Leaf" },
  "rotation.feuille.role": { fr: "consomme l'azote laissé par les légumineuses", en: "uses up the nitrogen left by legumes" },
  "rotation.fruit.label": { fr: "Fruit", en: "Fruit" },
  "rotation.fruit.role": { fr: "gourmand, profite d'un sol encore riche", en: "hungry, benefits from soil that's still rich" },
  "rotation.racine.label": { fr: "Racine", en: "Root" },
  "rotation.racine.role": { fr: "peu exigeant, termine le cycle", en: "undemanding, ends the cycle" },

  // Date du jour / bandeau
  "datedujour": { fr: "📅 Aujourd'hui : {date}", en: "📅 Today: {date}" },

  // Validation d'une fiche plante personnelle (messages techniques, rarement
  // visibles — la plupart des cas sont déjà interceptés par le formulaire).
  "plante.ajouteeparToi": { fr: "Plante ajoutée par toi.", en: "Plant added by you." },
  "valid.pasunobjet": { fr: "La fiche n'est pas un objet.", en: "The plant record is not an object." },
  "valid.doittexte": { fr: "{champ} doit être un texte.", en: "{champ} must be text." },
  "valid.requis": { fr: "{champ} est requis.", en: "{champ} is required." },
  "valid.tropong": { fr: "{champ} dépasse {max} caractères.", en: "{champ} exceeds {max} characters." },
  "valid.invalide": { fr: "{champ} est invalide.", en: "{champ} is invalid." },
  "valid.idinvalide": { fr: "id contient des caractères invalides.", en: "id contains invalid characters." },
  "valid.densite": { fr: "densite doit être comprise entre 0 et 1000.", en: "density must be between 0 and 1000." },
  "valid.semis": { fr: "semis doit contenir de 1 à 4 périodes valides.", en: "sowing dates must contain 1 to 4 valid periods." },
  "valid.photourl": { fr: "photo doit être une URL d'image HTTP(S).", en: "photo must be an HTTP(S) image URL." },
  "valid.lienurl": { fr: "lien doit être une URL HTTP(S).", en: "link must be an HTTP(S) URL." },
};
