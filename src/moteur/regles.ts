import type { Acces, Agent, Conditions, Jeu } from './types';

/**
 * Construction d'une règle transverse.
 *
 * Le minage part du découpage de l'entreprise et cherche ce qui est commun. Une
 * règle transverse part de l'inverse : on désigne une population par ses
 * attributs — tous les chefs de projet, ou tous les commerciaux du site de Metz —
 * et on regarde ce qu'elle détient pour en faire un automatisme.
 *
 * C'est le même calcul de couverture, sur une cohorte que l'on dessine au lieu
 * de la subir. La différence est dans la responsabilité : ici, quelqu'un signe.
 */

export type Attribut = 'departement' | 'titre' | 'site';

export interface Critere {
  attribut: Attribut;
  /** Vide = aucune contrainte sur cet attribut. */
  valeurs: string[];
}

export interface LigneRegle {
  code: string;
  libelle: string;
  application: string;
  detenteurs: number;
  effectif: number;
  taux: number;
  /** Retenu dans la règle. Pré-coché sur les accès universels et sans réserve. */
  retenu: boolean;
  reserves: string[];
  /** Membres qui recevraient l'accès si la règle était appliquée. */
  aProvisionner: string[];
  /** Membres à qui cet accès est interdit : ils sont retirés du provisionnement. */
  interdits: string[];
}

export interface Analyse {
  membres: Agent[];
  /** Agents qui répondent aux critères mais sont hors périmètre du minage. */
  ecartes: Agent[];
  lignes: LigneRegle[];
}

export const CRITERES_VIDES: Critere[] = [
  { attribut: 'departement', valeurs: [] },
  { attribut: 'titre', valeurs: [] },
  { attribut: 'site', valeurs: [] },
];

/** Tous les agents qui satisfont chaque critère renseigné. */
export function selectionner(
  jeu: Jeu,
  criteres: Critere[],
  inclurePrestataires: boolean,
): { membres: Agent[]; ecartes: Agent[] } {
  const correspond = (a: Agent) =>
    criteres.every((c) => c.valeurs.length === 0 || c.valeurs.includes(a[c.attribut]));

  const tous = jeu.agents.filter(correspond);
  return {
    membres: tous.filter((a) => inclurePrestataires || !a.prestataire),
    ecartes: tous.filter((a) => !inclurePrestataires && a.prestataire),
  };
}

/**
 * Examine ce que détient la population désignée.
 *
 * `retenus` permet de rejouer l'analyse avec la sélection de l'utilisateur : sans
 * lui, on propose les accès universels et sans réserve, ce qui est le point de
 * départ raisonnable, pas la décision.
 */
export function analyser(
  jeu: Jeu,
  criteres: Critere[],
  conditions: Conditions,
  retenus?: ReadonlySet<string>,
): Analyse {
  const { membres, ecartes } = selectionner(jeu, criteres, conditions.inclurePrestataires);
  const parCode = new Map<string, Acces>(jeu.catalogue.map((a) => [a.code, a]));
  const effectif = membres.length;

  const detenteurs = new Map<string, string[]>();
  for (const m of membres) {
    for (const code of jeu.attributions[m.sam] ?? []) {
      const acces = parCode.get(code);
      if (!acces) continue;
      if (conditions.exclureObsoletes && acces.categorie === 'Obsolète') continue;
      const liste = detenteurs.get(code);
      if (liste) liste.push(m.sam);
      else detenteurs.set(code, [m.sam]);
    }
  }

  const lignes: LigneRegle[] = [];
  for (const [code, porteurs] of detenteurs) {
    const acces = parCode.get(code);
    if (!acces || effectif === 0) continue;

    const taux = porteurs.length / effectif;
    const possede = new Set(porteurs);
    const interdits = acces.interditPrestataire
      ? membres.filter((m) => m.prestataire).map((m) => m.sam)
      : [];
    const interditsSet = new Set(interdits);

    const reserves: string[] = [];
    if (effectif < conditions.tailleMinimale) {
      reserves.push(
        `population de ${effectif} : sous le seuil de ${conditions.tailleMinimale}`,
      );
    }
    if (acces.sensible && conditions.validerSensibles) {
      reserves.push('accès sensible : validation humaine requise');
    }
    if (interdits.length > 0) {
      reserves.push(
        `interdit à ${interdits.length} prestataire${interdits.length > 1 ? 's' : ''} de la population`,
      );
    }
    if (acces.categorie === 'Obsolète') {
      reserves.push("outil à l'abandon");
    }

    lignes.push({
      code,
      libelle: acces.nom,
      application: acces.application,
      detenteurs: porteurs.length,
      effectif,
      taux,
      retenu: retenus ? retenus.has(code) : taux === 1 && reserves.length === 0,
      reserves,
      aProvisionner: membres
        .filter((m) => !possede.has(m.sam) && !interditsSet.has(m.sam))
        .map((m) => m.sam),
      interdits,
    });
  }

  lignes.sort((a, b) => b.taux - a.taux || a.code.localeCompare(b.code));
  return { membres, ecartes, lignes };
}

export interface Regle {
  nom: string;
  criteres: Critere[];
  effectif: number;
  acces: string[];
  provisionnements: { agent: string; acces: string }[];
}

/** Fige l'analyse en une règle nommée, prête à être transmise. */
export function figer(nom: string, criteres: Critere[], analyse: Analyse): Regle {
  const retenues = analyse.lignes.filter((l) => l.retenu);
  return {
    nom,
    criteres: criteres.filter((c) => c.valeurs.length > 0),
    effectif: analyse.membres.length,
    acces: retenues.map((l) => l.code),
    provisionnements: retenues.flatMap((l) =>
      l.aProvisionner.map((agent) => ({ agent, acces: l.code })),
    ),
  };
}

const NOM_ATTRIBUT: Record<Attribut, string> = {
  departement: 'Service',
  titre: 'Fonction',
  site: 'Site',
};

/** Description lisible de la population visée, pour l'intitulé de la règle. */
export function decrire(criteres: Critere[]): string {
  const parlants = criteres.filter((c) => c.valeurs.length > 0);
  if (parlants.length === 0) return 'Toute la population';
  return parlants
    .map((c) => `${NOM_ATTRIBUT[c.attribut]} : ${c.valeurs.join(', ')}`)
    .join(' · ');
}
