/* =========================================================================
   Permavore — environnement de culture

   La compatibilité ne se calcule pas Culture × Lieu, mais
   Culture × Lieu × ENVIRONNEMENT. Une culture difficile en pleine terre peut
   être évidente sous serre au même endroit, et le moteur doit pouvoir le dire
   — mais seulement quand il le sait.

   Règle absolue : on n'invente JAMAIS « une serre apporte +3 °C ». L'effet
   réel dépend du type d'abri, de sa ventilation, de son chauffage, de son
   exposition et du jardin. Tant que le jardinier n'a rien mesuré ni déclaré,
   un abri rend le verdict INDÉTERMINÉ — jamais meilleur par principe.

   Un jardinier doit pouvoir dire « j'ai une serre froide » et rien d'autre.
   Tous les champs de précision sont facultatifs.
   ========================================================================= */

const ENVIRONNEMENTS = {
  pleine_terre:   { exterieur: true,  protege: false, chauffe: false, mobile: false, lumiere: "naturelle" },
  pot_exterieur:  { exterieur: true,  protege: false, chauffe: false, mobile: true,  lumiere: "naturelle" },
  tunnel:         { exterieur: false, protege: true,  chauffe: false, mobile: false, lumiere: "naturelle" },
  serre_froide:   { exterieur: false, protege: true,  chauffe: false, mobile: false, lumiere: "naturelle" },
  serre_chauffee: { exterieur: false, protege: true,  chauffe: true,  mobile: false, lumiere: "naturelle" },
  veranda:        { exterieur: false, protege: true,  chauffe: false, mobile: false, lumiere: "reduite" },
  interieur:      { exterieur: false, protege: true,  chauffe: true,  mobile: false, lumiere: "reduite" },
  pot_mobile:     { exterieur: true,  protege: true,  chauffe: false, mobile: true,  lumiere: "naturelle" },
};

/**
 * Construit un EnvironnementCulture. Tout est facultatif sauf le type :
 * « j'ai une serre froide » doit suffire. Les précisions viendront plus tard,
 * déclarées par le jardinier ou, un jour, relevées par un capteur.
 */
function environnementCulture(type, declare = {}) {
  const base = ENVIRONNEMENTS[type] || ENVIRONNEMENTS.pleine_terre;
  const nombre = (v) => (Number.isFinite(v) ? v : null);
  return {
    type: ENVIRONNEMENTS[type] ? type : "pleine_terre",
    ...base,
    temperatureMinConnue: nombre(declare.temperatureMinConnue),
    temperatureMaxConnue: nombre(declare.temperatureMaxConnue),
    horsGel: typeof declare.horsGel === "boolean" ? declare.horsGel : null,
    exposition: declare.exposition || null,
    irrigation: declare.irrigation || null,
    ventilation: declare.ventilation || null,
    donneesUtilisateur: Object.keys(declare).length > 0,
    confiance: Number.isFinite(declare.temperatureMinConnue) ? "moyenne" : "faible",
  };
}

/**
 * Profil climatique ressenti par la plante dans cet environnement.
 * Renvoie { profil, connu, raison } :
 *   - pleine terre et pot extérieur : le climat du lieu, tel quel ;
 *   - abri dont on ne sait rien : profil null, `raison` explique pourquoi. Le
 *     moteur conclura « indéterminé » plutôt que d'inventer un bonus ;
 *   - abri caractérisé par le jardinier : on n'utilise QUE ce qu'il a déclaré.
 */
function profilSousEnvironnement(profilLieu, env) {
  if (!profilLieu) return { profil: null, connu: false, raison: "lieu_inconnu" };
  if (!env || !env.protege) return { profil: profilLieu, connu: true, raison: null };

  const min = env.temperatureMinConnue;
  const horsGel = env.horsGel === true || (Number.isFinite(min) && min > 0);
  if (!Number.isFinite(min) && env.horsGel !== true) {
    return { profil: null, connu: false, raison: "abri_non_caracterise" };
  }

  // On ne modifie que ce que la déclaration du jardinier permet d'affirmer :
  // son minimum, et, s'il est hors gel, une saison sans gel continue. Rien de
  // plus : ni gain de chaleur estivale, ni allongement supposé du cycle.
  const profil = {
    ...profilLieu,
    minimumHivernal: Number.isFinite(min) ? min : profilLieu.minimumHivernal,
    saisonSansGel: horsGel ? 365 : profilLieu.saisonSansGel,
    sansGelToutelAnnee: horsGel ? true : profilLieu.sansGelToutelAnnee,
    origineEnvironnement: env.type,
  };
  if (Number.isFinite(min)) profil.zoneUSDA = null;   // la zone USDA décrit le climat extérieur
  return { profil, connu: true, raison: null };
}

if (typeof window !== "undefined") {
  window.Environnements = {
    ENVIRONNEMENTS, environnementCulture, profilSousEnvironnement,
    types: Object.keys(ENVIRONNEMENTS),
  };
}
