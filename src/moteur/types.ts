/**
 * Vocabulaire du moteur.
 *
 * Un principe tient tout le reste : le moteur ne décide rien tout seul. Chaque
 * seuil, chaque exclusion, chaque définition d'équipe est un paramètre posé par
 * l'utilisateur dans `Conditions`. C'est ce qui rend le minage « conditionnel » :
 * la même population, minée sous deux jeux de conditions, donne deux réponses,
 * et les deux sont justes.
 */

export interface Agent {
  sam: string;
  nom: string;
  departement: string;
  titre: string;
  site: string;
  /** Identifiant du responsable hiérarchique. `null` pour la racine seulement. */
  responsable: string | null;
  prestataire: boolean;
  /** Pour un prestataire : le département de son responsable. */
  accueil: string | null;
}

export interface Acces {
  code: string;
  nom: string;
  application: string;
  categorie: 'Socle' | 'Site' | 'Fonction' | 'Métier' | 'Sensible' | 'Obsolète';
  /** Demande une validation humaine, même à 100 %. */
  sensible: boolean;
  /** Jamais affectable à un prestataire, quel que soit le pourcentage. */
  interditPrestataire: boolean;
}

export interface Jeu {
  agents: Agent[];
  catalogue: Acces[];
  /** identifiant d'agent -> codes d'accès détenus */
  attributions: Record<string, string[]>;
}

/** Ce qui définit une équipe. Le choix change le résultat, pas la méthode. */
export type DefinitionEquipe =
  | 'departement'
  | 'departement+site'
  | 'titre'
  | 'titre+site'
  | 'site'
  | 'responsable';

export interface Conditions {
  definitionEquipe: DefinitionEquipe;

  // --- périmètre de population ---
  /** Les prestataires sont hors minage par défaut. */
  inclurePrestataires: boolean;
  /** `null` = tous. Sinon, on ne mine que ces départements. */
  departements: string[] | null;
  sites: string[] | null;
  /** Clés de cohortes marquées à risque : minées mais jamais automatisées. */
  groupesARisque: string[];

  // --- seuils ---
  /** En dessous, une équipe n'est pas minable. */
  tailleMinimale: number;
  /** Une équipe sous le seuil reste traitée si l'accès est à 100 %. */
  exceptionCentPourCent: boolean;
  /** Pourcentage au-dessus duquel la recommandation est forte. 100 par défaut. */
  seuilFort: number;
  /** Pourcentage au-dessus duquel l'accès est « à revoir ». */
  seuilARevoir: number;
  /** En dessous, l'accès est considéré comme du bruit. */
  seuilFaible: number;

  // --- périmètre d'accès ---
  exclureObsoletes: boolean;
  /** Les accès sensibles ne produisent jamais de recommandation forte. */
  validerSensibles: boolean;
}

export const CONDITIONS_PAR_DEFAUT: Conditions = {
  definitionEquipe: 'departement',
  inclurePrestataires: false,
  departements: null,
  sites: null,
  groupesARisque: [],
  tailleMinimale: 5,
  exceptionCentPourCent: true,
  seuilFort: 100,
  seuilARevoir: 85,
  seuilFaible: 60,
  exclureObsoletes: true,
  validerSensibles: true,
};

export interface Cohorte {
  /** Clé stable, utilisable comme identifiant. */
  cle: string;
  libelle: string;
  membres: Agent[];
  minable: boolean;
  /** Renseigné quand `minable` est faux. */
  raison?: string;
  aRisque: boolean;
}

export type Verdict = 'forte' | 'a-revoir' | 'faible' | 'ecartee';

export interface Recommandation {
  cohorte: string;
  cohorteLibelle: string;
  effectif: number;
  acces: string;
  accesLibelle: string;
  porteurs: number;
  /** Entre 0 et 1. */
  taux: number;
  verdict: Verdict;
  /** Pourquoi la recommandation n'est pas automatisable telle quelle. */
  reserves: string[];
  /** Membres sans l'accès : l'écart à provisionner si l'on suit la reco. */
  manquants: string[];
  /** Prestataires de la cohorte à qui cet accès est interdit. */
  interdits: string[];
}

export interface Violation {
  agent: string;
  agentNom: string;
  acces: string;
  accesLibelle: string;
  motif: string;
}
