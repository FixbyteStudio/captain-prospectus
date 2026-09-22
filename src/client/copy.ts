/**
 * Every French string in the app (ADR-0013, INVARIANT 15).
 *
 * Components import from here and never inline a French literal, so the whole
 * UI vocabulary is reviewable in one file and a second language would mean
 * replacing this module, not touching components.
 *
 * Enum labels must match the tables in docs/glossary.md. Copy style follows
 * CLAUDE.md: sentence case, active verbs, errors say what happened and what to do.
 */
import type { Outcome, ProspectType, QuestionType, Source, Status } from "../shared/constants";

export const copy = {
  appName: "Captain Prospectus",

  /** Used by vendored components that ship an English string (INVARIANT 15). */
  close: "Fermer",

  nav: {
    today: "Tournée du jour",
    prospects: "Prospects",
    visits: "Visites",
    scripts: "Scripts",
    import: "Import",
    duplicates: "Doublons",
  },

  prospects: {
    title: "Prospects",
    count: (n: number) => (n === 1 ? "1 prospect" : `${n} prospects`),
    importCta: "Importer un CSV",
    empty: "Aucun prospect. Importez un CSV pour commencer.",
    noMatch: "Aucun prospect ne correspond à ces filtres.",
    clearFilters: "Effacer les filtres",
    loading: "Chargement des prospects…",
    loadFailed: "Impossible de charger les prospects. Réessayez.",

    filters: {
      status: "Statut",
      agent: "Agent",
      source: "Source",
      anyStatus: "Tous les statuts",
      anyAgent: "Tous les agents",
      anySource: "Toutes les sources",
    },

    columns: {
      name: "Nom",
      type: "Type",
      address: "Adresse",
      status: "Statut",
      agent: "Agent",
      lastVisit: "Dernière visite",
    },

    selection: {
      // The toolbar replaces the filters in place, so this states the count.
      count: (n: number) => (n === 1 ? "1 sélectionné" : `${n} sélectionnés`),
      selectAll: "Tout sélectionner",
      selectOne: (name: string) => `Sélectionner ${name}`,
      assignTo: "Assigner à",
      chooseAgent: "Choisir un agent",
      assign: "Assigner",
      unassign: "Désassigner",
      cancel: "Annuler",
    },

    row: {
      menu: (name: string) => `Actions pour ${name}`,
      assignTo: "Assigner à",
      changeStatus: "Changer le statut",
      unassign: "Retirer l'assignation",
    },

    /** An action keeps its name through the flow: Assigner → Assigné. */
    assigned: (n: number) => (n === 1 ? "1 prospect assigné" : `${n} prospects assignés`),
    unassigned: (n: number) => (n === 1 ? "1 prospect désassigné" : `${n} prospects désassignés`),
    statusChanged: "Statut modifié",
    assignFailed: "L'assignation a échoué. Réessayez.",
    updateFailed: "La modification a échoué. Réessayez.",
    unknownAssignee: "Cette adresse ne figure pas parmi les agents.",
  },

  import: {
    title: "Importer des prospects",
    steps: {
      source: "Source",
      file: "Fichier",
      columns: "Colonnes",
      preview: "Aperçu",
      map: "Zone",
    },

    source: {
      lede: "D'où viennent les prospects ?",
      csv: "Un fichier CSV",
      csvHint: "Un export de tableur, lu dans votre navigateur.",
      map: "Une zone sur la carte",
      mapHint: "Les commerces qu'OpenStreetMap connaît dans la zone que vous dessinez.",
    },

    file: {
      choose: "Choisir un fichier CSV",
      hint: "Le fichier est lu dans votre navigateur. Il n'est jamais envoyé ni conservé.",
      chosen: (name: string, rows: number) =>
        rows === 1 ? `${name} — 1 ligne` : `${name} — ${rows} lignes`,
      unreadable: "Ce fichier ne se lit pas comme un CSV. Vérifiez le format et réessayez.",
      emptyFile: "Ce fichier ne contient aucune ligne.",
      noHeaders: "Ce fichier n'a pas d'en-têtes de colonnes.",
    },

    columns: {
      lede: "Indiquez quelle colonne correspond à quel champ. La valeur de la première ligne s'affiche sous chaque choix.",
      skip: "Ne pas importer",
      noSample: "Vide sur la première ligne",
      required: "Le nom est obligatoire : choisissez la colonne qui le contient.",
      unmappedNote: "Une colonne non associée laisse le champ inchangé lors d'un réimport.",
      fields: {
        name: "Nom",
        type: "Type",
        lat: "Latitude",
        lng: "Longitude",
        address: "Adresse",
        phone: "Téléphone",
        website: "Site web",
        cuisine: "Cuisine",
        sourceRef: "Identifiant source",
      },
      sourceRefHint:
        "Si votre fichier a un identifiant stable, un nom corrigé mettra à jour au lieu de créer un doublon.",
    },

    preview: {
      ready: (n: number) => (n === 1 ? "1 ligne à importer" : `${n} lignes à importer`),
      rejected: (n: number) => (n === 1 ? "1 ligne rejetée" : `${n} lignes rejetées`),
      coordinates: "Coordonnées",
      // Anything the admin should know about a line; blank when all is well.
      note: "Remarque",
      noCoordinates: "Sans coordonnées",
      line: (n: number) => `Ligne ${n}`,
      nothingToImport: "Aucune ligne valide à importer. Revenez aux colonnes.",
      showingFirst: (n: number) => `Les ${n} premières lignes sont affichées.`,
    },

    reasons: {
      missingName: "Nom manquant",
      invalid: "Valeur invalide",
    },

    actions: {
      back: "Retour",
      toColumns: "Associer les colonnes",
      toPreview: "Voir l'aperçu",
      start: (n: number) => (n === 1 ? "Importer 1 ligne" : `Importer ${n} lignes`),
      done: "Terminer",
      retry: "Réessayer",
    },

    running: (done: number, total: number) => `Import en cours : ${done} / ${total}`,
    result: {
      title: "Import terminé",
      created: (n: number) => (n === 1 ? "1 prospect créé" : `${n} prospects créés`),
      updated: (n: number) => (n === 1 ? "1 prospect mis à jour" : `${n} prospects mis à jour`),
      skipped: (n: number) => (n === 1 ? "1 ligne rejetée" : `${n} lignes rejetées`),
      seeProspects: "Voir les prospects",
    },
    failed:
      "L'import s'est interrompu. Les lignes déjà envoyées sont enregistrées ; réimporter le même fichier est sans risque.",
  },

  map: {
    lede: "Dessinez une zone : cliquez pour poser chaque sommet.",

    /** Which data source the area is searched against — ADR-0020. */
    provider: {
      label: "Données",
      osm: "OpenStreetMap",
      google: "Google Places",
      /**
       * A standing fact, not a warning: a Google search is a billable call and
       * a small circle is the habit that keeps it cheap. Said once, under the
       * choice, where it changes what the admin draws next.
       */
      googleHint:
        "Chaque recherche Google compte dans le quota mensuel. 20 lieux maximum par cercle.",
      osmHint: "Gratuit et sans limite. Couverture variable selon la ville.",
    },

    /** Google's Nearby Search takes a circle; there is no polygon search. */
    circle: {
      lede: "Dessinez un cercle : cliquez pour placer le centre, puis pour fixer le rayon.",
      radius: (m: number) => (m >= 1000 ? `Rayon ${(m / 1000).toFixed(1)} km` : `Rayon ${m} m`),
      hint: "Faites glisser le centre pour déplacer le cercle, le point à droite pour le redimensionner.",
      none: "Cliquez sur la carte pour placer le centre.",
    },

    vertices: (n: number) => (n === 1 ? "1 sommet" : `${n} sommets`),
    needMore: "Trois sommets au minimum.",
    full: "Nombre de sommets maximum atteint.",
    undo: "Annuler le dernier point",
    clear: "Effacer",
    search: "Rechercher dans la zone",
    searching: "Recherche en cours…",
    // ADR-0008: Overpass is a public service that is sometimes slow or down.
    failed: "OpenStreetMap n'a pas répondu. Réessayez dans quelques instants, ou réduisez la zone.",
    placesFailed:
      "Google n'a pas répondu. Réessayez dans quelques instants, ou réduisez le cercle.",
    // A server configuration fact, not a failure: it says who can fix it.
    placesUnconfigured:
      "Google Places n'est pas configuré sur ce serveur. Utilisez OpenStreetMap, ou demandez l'ajout de la clé API.",
    retry: "Réessayer",

    results: {
      // The panel before a search: an empty screen is an invitation, not a
      // void with a stray button in it (design.md).
      idle: "Dessinez une zone sur la carte, puis lancez la recherche pour voir ce qu'OpenStreetMap y connaît.",
      found: (n: number) => (n === 1 ? "1 lieu trouvé" : `${n} lieux trouvés`),
      unnamed: (n: number) => (n === 1 ? "1 sans nom" : `${n} sans nom`),
      empty: "Aucun commerce trouvé dans cette zone. Élargissez-la et cherchez à nouveau.",
      // The cache is up to seven days old, so the screen says so rather than
      // letting two identical searches look like two live ones.
      cached: "Résultat en cache, actualisé sous 7 jours.",
      truncated: "Zone trop vaste : seuls les premiers résultats sont affichés. Réduisez-la.",
      // Google's own ceiling, not ours: 20 per call and no next page.
      truncatedGoogle:
        "Google renvoie 20 lieux au maximum : voici les 20 plus proches du centre. Réduisez le cercle et cherchez à nouveau.",
      // The attribution Google's terms ask for; the tiles stay OSM (ADR-0020).
      poweredByGoogle: "Résultats fournis par Google",
      idleGoogle:
        "Dessinez un cercle sur la carte, puis lancez la recherche pour voir ce que Google y connaît.",
      // A place OSM has no name for cannot be imported: `name` is required.
      noName: "Sans nom",
      start: (n: number) => (n === 1 ? "Importer 1 prospect" : `Importer ${n} prospects`),
      nothingToImport: "Aucun lieu importable dans cette zone.",
    },
  },

  visits: {
    title: "Visites",
    lede: "Les visites arrivent ici dès qu'un agent synchronise.",
    count: (n: number) => (n === 1 ? "1 visite" : `${n} visites`),
    // An empty screen is an invitation, not a shrug (design.md).
    empty: "Aucune visite reçue. Les visites apparaissent ici dès qu'un agent synchronise.",
    loading: "Chargement des visites…",
    loadFailed: "Impossible de charger les visites. Réessayez.",
    flyer: "Flyer remis",
    /** Announced when rows arrive, for a reader that cannot see the highlight. */
    arrived: (n: number) => (n === 1 ? "1 nouvelle visite" : `${n} nouvelles visites`),
  },

  duplicates: {
    title: "Doublons",
    lede: "Ces prospects semblent désigner le même endroit. Un nom corrigé dans le fichier crée une nouvelle fiche : c'est ici qu'on les réunit.",
    empty: "Aucun doublon détecté.",
    loading: "Recherche des doublons…",
    loadFailed: "Impossible de chercher les doublons. Réessayez.",
    truncated:
      "Seules les premières paires sont affichées. Fusionnez-les et relancez la recherche.",
    count: (n: number) => (n === 1 ? "1 paire" : `${n} paires`),

    columns: {
      name: "Nom",
      status: "Statut",
      agent: "Agent",
      visits: "Visites",
      distance: "Distance",
    },

    distanceUnknown: "Position inconnue",
    keep: "Garder",
    keepAria: (name: string) => `Garder « ${name} » et fusionner l'autre`,
    /** Says which one survived, because that is the thing the admin chose. */
    merged: (name: string) => `Fusionné dans « ${name} »`,
    mergeFailed: "La fusion a échoué. Réessayez.",
  },

  scripts: {
    title: "Scripts",
    lede: "Le questionnaire posé à chaque visite. L'enregistrement crée une nouvelle version et l'active aussitôt ; les versions précédentes restent pour les visites déjà répondues.",
    loading: "Chargement du script…",
    loadFailed: "Impossible de charger les scripts. Réessayez.",

    name: "Nom du script",
    namePlaceholder: "default",

    question: {
      sectionTitle: "Questions",
      empty: "Aucune question. Ajoutez-en une pour commencer.",
      untitled: "Question sans intitulé",
      add: "Ajouter une question",
      remove: (label: string) => `Supprimer « ${label} »`,
      dragHandle: (label: string) => `Réordonner « ${label} »`,
      label: "Intitulé",
      labelPlaceholder: "Ex. Proposez-vous la livraison ?",
      key: "Clé",
      keyHint: "Identifie la réponse. Ne change plus une fois la version enregistrée.",
      keyLocked: "Cette clé existe déjà dans une version enregistrée.",
      unlockKey: "Modifier la clé",
      keyUnlockedWarning:
        "Les réponses déjà données sous l'ancienne clé resteront associées à celle-ci, pas à la nouvelle.",
      type: "Type de réponse",
      required: "Obligatoire",
      options: "Choix proposés",
      optionPlaceholder: (n: number) => `Choix ${n}`,
      removeOption: (n: number) => `Supprimer le choix ${n}`,
      addOption: "Ajouter un choix",
    },

    errors: {
      nameRequired: "Donnez un nom au script.",
      noQuestions: "Ajoutez au moins une question.",
      emptyLabel: "Indiquez l'intitulé de cette question.",
      invalidKey: "La clé doit être en minuscules, sans espaces, et commencer par une lettre.",
      duplicateKey: "Une autre question utilise déjà cette clé.",
      missingOptions: "Ajoutez au moins un choix pour cette question.",
    },

    editor: {
      saveWarning: "L'enregistrement crée une nouvelle version et l'active immédiatement.",
      save: "Enregistrer une nouvelle version",
      saving: "Enregistrement…",
      saved: (version: number) => `Version ${version} enregistrée et activée.`,
      saveFailed: "L'enregistrement a échoué. Réessayez.",
    },

    confirm: {
      title: "Enregistrer une nouvelle version ?",
      body: (version: number) =>
        `Cela crée la version ${version} et l'active pour toutes les prochaines visites. Les versions précédentes restent consultables.`,
      cancel: "Annuler",
      confirm: "Enregistrer",
    },

    history: {
      title: "Versions",
      empty: "Aucune version enregistrée pour l'instant.",
      version: (n: number) => `Version ${n}`,
      active: "Active",
      inactive: "Inactive",
      questionsCount: (n: number) => (n === 1 ? "1 question" : `${n} questions`),
    },
  },

  today: {
    title: "Tournée du jour",
    empty: "Aucun prospect à visiter. Synchronisez pour récupérer votre liste.",
    later: "Plus tard",
    distanceUnknown: "Position inconnue",
    navigate: "Y aller",
    visit: "Visiter",
    /** The stops are a walking order, so the round states its own length. */
    remaining: (n: number) => (n === 1 ? "1 arrêt" : `${n} arrêts`),
    nextStop: "Prochain arrêt",
    /** A field prospect the server has not accepted yet. */
    notSynced: "Pas encore envoyé",
    dueOn: (when: string) => `À relancer le ${when}`,
    addProspect: "Ajouter un prospect",
    locating: "Recherche de votre position…",
    positionDenied: "Sans votre position, la tournée n'est pas triée par distance.",
    retryPosition: "Réessayer",
  },

  visit: {
    title: "Nouvelle visite",
    flyerGiven: "Flyer remis",
    outcome: "Résultat",
    followUpAt: "Relancer le",
    notes: "Notes",
    save: "Enregistrer la visite",
    saved: "Visite enregistrée. Elle partira à la prochaine synchronisation.",
    followUpRequired: "Indiquez une date de relance pour ce résultat.",
    previousVisits: "Visites précédentes",
    back: "Retour à la tournée",
    outcomeRequired: "Choisissez un résultat.",
    followUpInvalid: "Cette date n'existe pas. Vérifiez le jour et le mois.",
    notesTooLong: "Ces notes sont trop longues. Raccourcissez-les.",
    noPreviousVisits: "Première visite à cet endroit.",
    historyOffline: "Les visites précédentes s'afficheront au retour du réseau.",
    flyerHint: "Cochez si vous avez laissé un flyer sur place.",
    saving: "Enregistrement…",
    /**
     * The outbox write itself failed, so nothing is queued and nothing will be
     * sent. Says the storage is full because that is the realistic cause on a
     * phone, and it is the one thing the agent can act on.
     */
    saveFailed:
      "Impossible d'enregistrer la visite sur cet appareil. Libérez de l'espace de stockage, puis réessayez.",

    /* --- the script's questions, step 2 (design.md) --- */
    continue: "Continuer",
    /** The back link on step 2 names where it goes: step 1, draft intact. */
    backToOutcome: "Résultat",
    questions: "Questions",
    /** Shown when the outcome is `no_contact`: nobody was there to ask. */
    questionsOptional: "Personne sur place : répondez seulement si vous savez.",
    answerRequired: "Répondez à cette question.",
    answerInvalid: "Cette réponse n'est pas valide. Vérifiez-la.",
    yes: "Oui",
    no: "Non",
  },

  fieldProspect: {
    title: "Ajouter un prospect",
    name: "Nom",
    namePlaceholder: "Le nom sur la devanture",
    nameRequired: "Indiquez le nom de l'établissement.",
    type: "Type",
    address: "Adresse",
    phone: "Téléphone",
    optional: "facultatif",
    position: "Position",
    useMyPosition: "Utiliser ma position",
    positionSet: (lat: string, lng: string) => `${lat}  ${lng}`,
    positionNone: "Aucune position enregistrée",
    positionRefresh: "Actualiser",
    save: "Ajouter",
    saving: "Ajout…",
    saved: "Prospect ajouté. Il partira à la prochaine synchronisation.",
    cancel: "Annuler",
    addressTooLong: "Cette adresse est trop longue. Raccourcissez-la.",
    phoneTooLong: "Ce numéro est trop long. Vérifiez-le.",
    saveFailed:
      "Impossible d'enregistrer ce prospect sur cet appareil. Libérez de l'espace de stockage, puis réessayez.",
  },

  sync: {
    pending: (count: number) =>
      count === 1 ? "1 élément en attente d'envoi" : `${count} éléments en attente d'envoi`,
    syncing: "Synchronisation…",
    lastSync: (when: string) => `Dernière synchronisation : ${when}`,
    never: "Jamais synchronisé",
    offline: "Hors ligne. Vos visites sont conservées et partiront au retour du réseau.",
    authExpired: "Votre session a expiré. Reconnectez-vous pour synchroniser.",
    upgrade: "Une mise à jour est nécessaire. Vos visites sont conservées.",
    failed: "La synchronisation a échoué. Nouvel essai automatique.",
  },

  /** The service worker has a new build waiting (registerType: "prompt"). */
  update: {
    available: "Une nouvelle version est disponible.",
    apply: "Mettre à jour",
    dismiss: "Plus tard",
  },

  errors: {
    generic: "Une erreur est survenue. Réessayez.",
    /** First run with no network: there is no cached identity to fall back on. */
    offlineFirstRun:
      "Impossible de vous identifier hors ligne. Connectez-vous une fois avec du réseau.",
    forbidden: "Vous n'avez pas accès à cette page.",
    notFound: "Page introuvable.",
  },

  attribution: "© les contributeurs OpenStreetMap",
} as const;

/** docs/glossary.md — stored in English, shown in French. */
export const OUTCOME_LABELS: Readonly<Record<Outcome, string>> = {
  no_contact: "Personne sur place",
  interested: "Intéressé",
  not_interested: "Pas intéressé",
  follow_up: "À relancer",
  converted: "Converti",
};

export const STATUS_LABELS: Readonly<Record<Status, string>> = {
  new: "Nouveau",
  assigned: "Assigné",
  follow_up: "À relancer",
  converted: "Converti",
  rejected: "Refusé",
};

export const SOURCE_LABELS: Readonly<Record<Source, string>> = {
  csv: "CSV",
  // Both map sources say "Carte" first, because that is the screen the admin
  // used; the provider is what tells them why two rows for the same restaurant
  // exist (ADR-0020).
  osm: "Carte (OSM)",
  google: "Carte (Google)",
  field: "Terrain",
};

export const QUESTION_TYPE_LABELS: Readonly<Record<QuestionType, string>> = {
  yes_no: "Oui / non",
  single: "Choix unique",
  multi: "Choix multiple",
  text: "Texte",
  number: "Nombre",
  rating: "Note (1 à 5)",
};

export const TYPE_LABELS: Readonly<Record<ProspectType, string>> = {
  restaurant: "Restaurant",
  fast_food: "Restauration rapide",
  cafe: "Café",
  bar: "Bar",
  food_truck: "Food truck",
  other: "Autre",
};
