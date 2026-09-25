import { perimetre } from './cohortes';
import type { Acces, Agent, Conditions, Jeu } from './types';

/**
 * Factorisation : remonter un accès commun au nœud le plus haut de la hiérarchie
 * plutôt que de le répéter équipe par équipe.
 *
 * Et la règle qui protège cette remontée : **une équipe non minable bloque la
 * factorisation de son nœud parent**. Sans elle, une équipe de trois personnes
 * hériterait d'un accès que personne n'a validé pour elle, simplement parce que
 * les grandes équipes voisines le détiennent toutes. On préfère signaler le
 * blocage et laisser un humain trancher.
 */

export interface Noeud {
  sam: string;
  nom: string;
  titre: string;
  departement: string;
  parent: string | null;
  enfants: string[];
  /** Tous les agents du sous-arbre, le responsable compris. */
  sousArbre: Agent[];
  /** Vrai si le nœud encadre au moins une personne. */
  encadrant: boolean;
}

export interface Bloqueur {
  sam: string;
  nom: string;
  effectif: number;
  porteurs: number;
}

export interface Factorisation {
  acces: string;
  accesLibelle: string;
  sensible: boolean;
  noeud: string;
  noeudNom: string;
  noeudTitre: string;
  effectif: number;
  porteurs: number;
  taux: number;
  statut: 'factorisable' | 'bloquee';
  /** Équipes sous le seuil qui empêchent la remontée. */
  bloqueurs: Bloqueur[];
  /** Nombre de nœuds encadrants couverts : autant de règles remplacées par une. */
  equipesCouvertes: number;
  /** Agents du sous-arbre sans l'accès (vide si `factorisable`). */
  manquants: string[];
}

/**
 * Construit l'arbre hiérarchique sur la population retenue.
 *
 * Quand un responsable est hors périmètre — un prestataire exclu, un département
 * filtré — ses subordonnés sont rattachés au premier ancêtre encore présent. Sans
 * ce raccrochage on obtiendrait une forêt de fragments, et la factorisation
 * n'aurait plus de sommet où remonter.
 */
export function arbre(jeu: Jeu, c: Conditions): Map<string, Noeud> {
  const population = perimetre(jeu, c);
  const dedans = new Set(population.map((a) => a.sam));
  const parTous = new Map(jeu.agents.map((a) => [a.sam, a]));

  const parentDe = (a: Agent): string | null => {
    let courant = a.responsable;
    const vus = new Set<string>([a.sam]);
    while (courant && !vus.has(courant)) {
      vus.add(courant);
      if (dedans.has(courant)) return courant;
      courant = parTous.get(courant)?.responsable ?? null;
    }
    return null;
  };

  const noeuds = new Map<string, Noeud>();
  for (const a of population) {
    noeuds.set(a.sam, {
      sam: a.sam,
      nom: a.nom,
      titre: a.titre,
      departement: a.departement,
      parent: parentDe(a),
      enfants: [],
      sousArbre: [],
      encadrant: false,
    });
  }
  for (const n of noeuds.values()) {
    if (n.parent) noeuds.get(n.parent)?.enfants.push(n.sam);
  }

  // Sous-arbres en une passe, des feuilles vers la racine.
  const parSam = new Map(population.map((a) => [a.sam, a]));
  const ordre: string[] = [];
  const pile = [...noeuds.values()].filter((n) => n.parent === null).map((n) => n.sam);
  while (pile.length > 0) {
    const sam = pile.pop();
    if (sam === undefined) break;
    ordre.push(sam);
    pile.push(...(noeuds.get(sam)?.enfants ?? []));
  }
  for (const sam of [...ordre].reverse()) {
    const n = noeuds.get(sam);
    const moi = parSam.get(sam);
    if (!n || !moi) continue;
    n.sousArbre = [moi, ...n.enfants.flatMap((e) => noeuds.get(e)?.sousArbre ?? [])];
    n.encadrant = n.enfants.length > 0;
  }

  return noeuds;
}

/**
 * Cherche, pour chaque accès, le nœud le plus haut où il peut être posé.
 *
 * Deux résultats possibles et il faut les distinguer nettement :
 *  - `factorisable` : tout le sous-arbre détient l'accès, la remontée ne
 *    provisionne rien à personne, elle ne fait que simplifier ;
 *  - `bloquee` : la remontée serait justifiée si l'on ne regardait que les
 *    équipes minables, mais une ou plusieurs équipes sous le seuil ne détiennent
 *    pas l'accès. On nomme le bloqueur au lieu de passer outre.
 */
export function factoriser(
  jeu: Jeu,
  noeuds: Map<string, Noeud>,
  c: Conditions,
): Factorisation[] {
  const parCode = new Map<string, Acces>(jeu.catalogue.map((a) => [a.code, a]));
  const codes = jeu.catalogue
    .filter((a) => !(c.exclureObsoletes && a.categorie === 'Obsolète'))
    .map((a) => a.code);

  const detient = new Map<string, Set<string>>(
    jeu.agents.map((a) => [a.sam, new Set(jeu.attributions[a.sam] ?? [])]),
  );

  const resultats: Factorisation[] = [];

  for (const code of codes) {
    const acces = parCode.get(code);
    if (!acces) continue;

    const porteursDe = new Map<string, number>();
    for (const n of noeuds.values()) {
      porteursDe.set(
        n.sam,
        n.sousArbre.filter((a) => detient.get(a.sam)?.has(code)).length,
      );
    }

    const complet = (sam: string): boolean => {
      const n = noeuds.get(sam);
      return !!n && n.sousArbre.length > 0 && porteursDe.get(sam) === n.sousArbre.length;
    };

    // Un nœud est bloqué si tous ses manquants se trouvent dans des équipes
    // sous le seuil qui, elles, ne détiennent pas l'accès.
    const bloqueursDe = (n: Noeud): Bloqueur[] | null => {
      const petits = n.enfants
        .map((e) => noeuds.get(e))
        .filter((e): e is Noeud => !!e)
        .filter((e) => e.sousArbre.length < c.tailleMinimale && !complet(e.sam));
      if (petits.length === 0) return null;

      const couverts = new Set(petits.flatMap((e) => e.sousArbre.map((a) => a.sam)));
      const manquantsHorsPetits = n.sousArbre.filter(
        (a) => !detient.get(a.sam)?.has(code) && !couverts.has(a.sam),
      );
      if (manquantsHorsPetits.length > 0) return null;

      return petits.map((e) => ({
        sam: e.sam,
        nom: e.nom,
        effectif: e.sousArbre.length,
        porteurs: porteursDe.get(e.sam) ?? 0,
      }));
    };

    for (const n of noeuds.values()) {
      if (n.sousArbre.length < c.tailleMinimale) continue;

      // Factoriser n'a de sens que si l'on consolide plusieurs équipes. Un nœud
      // qui n'en couvre qu'une seule redit ce que l'onglet des recommandations
      // dit déjà, en moins lisible.
      const equipesCouvertes = n.sousArbre.filter(
        (a) => noeuds.get(a.sam)?.encadrant,
      ).length;
      if (equipesCouvertes < 2) continue;

      const porteurs = porteursDe.get(n.sam) ?? 0;
      const effectif = n.sousArbre.length;
      const estComplet = complet(n.sam);
      const bloqueurs = estComplet ? null : bloqueursDe(n);
      if (!estComplet && !bloqueurs) continue;

      // On ne garde que le nœud le plus haut : si le parent est lui aussi
      // retenu, c'est lui qui portera l'accès.
      const parent = n.parent ? noeuds.get(n.parent) : undefined;
      if (parent && (complet(parent.sam) || bloqueursDe(parent))) continue;

      resultats.push({
        acces: code,
        accesLibelle: acces.nom,
        sensible: acces.sensible,
        noeud: n.sam,
        noeudNom: n.nom,
        noeudTitre: n.titre,
        effectif,
        porteurs,
        taux: porteurs / effectif,
        statut: estComplet ? 'factorisable' : 'bloquee',
        bloqueurs: bloqueurs ?? [],
        equipesCouvertes,
        manquants: estComplet
          ? []
          : n.sousArbre.filter((a) => !detient.get(a.sam)?.has(code)).map((a) => a.sam),
      });
    }
  }

  // Taux décroissant : une remontée bloquée à 95 % mérite le regard avant une
  // remontée bloquée à 60 %.
  return resultats.sort(
    (a, b) =>
      b.taux - a.taux || b.effectif - a.effectif || a.acces.localeCompare(b.acces),
  );
}
