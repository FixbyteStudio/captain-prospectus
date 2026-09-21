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
import type { Outcome, ProspectType, Source, Status } from "../shared/constants";

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
    title: "Importer un CSV",
    steps: { file: "Fichier", columns: "Colonnes", preview: "Aperçu" },

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
  osm: "Carte",
  field: "Terrain",
};

export const TYPE_LABELS: Readonly<Record<ProspectType, string>> = {
  restaurant: "Restaurant",
  fast_food: "Restauration rapide",
  cafe: "Café",
  bar: "Bar",
  food_truck: "Food truck",
  other: "Autre",
};
