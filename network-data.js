export const NETWORK_CONFIG = Object.freeze({
  apiBaseUrl: "/api/v1",
  featureEnabled: true,
  requestTimeoutMs: 4000,
  readRetries: 1,
});

export const VARIETIES_BY_PLANT = Object.freeze({
  tomate: [
    {
      id: "var-rose-de-berne",
      slug: "rose-de-berne",
      name: "Rose de Berne",
      availableOffers: 3,
      region: "Auvergne-Rhône-Alpes",
      reproductionDifficulty: "Intermédiaire",
      lineageCount: 7,
      germination: { rate: 82, sampleSize: 11, year: 2024 },
      protocol: {
        summary: "Limiter les croisements et conserver des fruits sains et typiques.",
        rules: [
          "Éloigner les autres variétés ou protéger les fleurs.",
          "Prélever sur plusieurs plants sains et conformes.",
          "Fermenter, rincer puis sécher complètement les graines.",
        ],
        sourceLabel: "Réseau Semences Paysannes — ressources techniques",
        sourceUrl: "https://ressources.semencespaysannes.org/",
      },
      lineage: [
        { id: "lot-root", label: "Lignée d’origine", parentId: null },
        { id: "lot-a", label: "Clara · 2023", parentId: "lot-root" },
        { id: "lot-b", label: "Mathieu · 2023", parentId: "lot-root" },
        { id: "lot-a1", label: "Julie · 2024", parentId: "lot-a" },
        { id: "lot-b1", label: "Lucie · 2024", parentId: "lot-b" },
      ],
    },
    {
      id: "var-noire-de-crimee",
      slug: "noire-de-crimee",
      name: "Noire de Crimée",
      availableOffers: 2,
      region: "Nouvelle-Aquitaine",
      reproductionDifficulty: "Intermédiaire",
      lineageCount: 5,
      germination: null,
      protocol: {
        summary: "Même protocole pilote que les autres tomates reproductibles.",
        rules: [
          "Identifier chaque porte-graines avant la récolte.",
          "Écarter les fruits atypiques ou issus de plants malades.",
          "Tester la germination avant toute nouvelle transmission.",
        ],
        sourceLabel: "Réseau Semences Paysannes — ressources techniques",
        sourceUrl: "https://ressources.semencespaysannes.org/",
      },
      lineage: [],
    },
    {
      id: "var-saint-pierre",
      slug: "saint-pierre",
      name: "Saint-Pierre",
      availableOffers: 0,
      region: "—",
      reproductionDifficulty: "Intermédiaire",
      lineageCount: 0,
      germination: null,
      protocol: {
        summary: "Protocole pilote pour tomates reproductibles.",
        rules: ["Documenter l’origine du lot.", "Éviter les hybridations.", "Tester avant partage."],
        sourceLabel: "Réseau Semences Paysannes — ressources techniques",
        sourceUrl: "https://ressources.semencespaysannes.org/",
      },
      lineage: [],
    },
  ],
});
