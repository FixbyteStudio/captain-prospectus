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

  nav: {
    today: "Tournée du jour",
    prospects: "Prospects",
    visits: "Visites",
    scripts: "Scripts",
    import: "Import",
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

  today: {
    title: "Tournée du jour",
    empty: "Aucun prospect à visiter. Synchronisez pour récupérer votre liste.",
    later: "Plus tard",
    distanceUnknown: "Position inconnue",
    navigate: "Y aller",
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
  },

  fieldProspect: {
    title: "Ajouter un prospect",
    name: "Nom",
    type: "Type",
    useMyPosition: "Utiliser ma position",
    save: "Ajouter",
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
