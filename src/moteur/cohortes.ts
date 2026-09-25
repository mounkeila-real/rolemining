import type { Agent, Cohorte, Conditions, Jeu } from './types';

/**
 * Découpage de la population en cohortes, selon les conditions posées.
 *
 * Deux étapes distinctes, et l'ordre compte : on réduit d'abord la population au
 * périmètre demandé, puis on la découpe. Filtrer après le découpage donnerait des
 * effectifs faux, donc des pourcentages faux.
 */

/** Réduit la population au périmètre demandé. */
export function perimetre(jeu: Jeu, c: Conditions): Agent[] {
  return jeu.agents.filter((a) => {
    if (a.prestataire && !c.inclurePrestataires) return false;
    if (c.departements && !c.departements.includes(a.departement)) return false;
    if (c.sites && !c.sites.includes(a.site)) return false;
    return true;
  });
}

function cle(a: Agent, d: Conditions['definitionEquipe']): string | null {
  switch (d) {
    case 'departement':
      return a.departement;
    case 'departement+site':
      return `${a.departement} · ${a.site}`;
    case 'titre':
      return a.titre;
    case 'titre+site':
      return `${a.titre} · ${a.site}`;
    case 'site':
      return a.site;
    case 'responsable':
      // La racine n'a pas de responsable : elle n'appartient à aucune équipe.
      return a.responsable;
  }
}

/**
 * Construit les cohortes.
 *
 * Pour la définition « responsable », l'équipe est faite des subordonnés directs,
 * **sans le responsable**. L'inclure fausserait le calcul : ses droits
 * d'encadrement (validation, budget) apparaîtraient à 1/n et seraient lus comme
 * de la dérive.
 */
export function construire(jeu: Jeu, c: Conditions): Cohorte[] {
  const population = perimetre(jeu, c);
  const nomDe = new Map(jeu.agents.map((a) => [a.sam, a.nom]));

  const groupes = new Map<string, Agent[]>();
  for (const a of population) {
    const k = cle(a, c.definitionEquipe);
    if (k === null) continue;
    const existant = groupes.get(k);
    if (existant) existant.push(a);
    else groupes.set(k, [a]);
  }

  const cohortes: Cohorte[] = [];
  for (const [k, membres] of groupes) {
    const minable = membres.length >= c.tailleMinimale;
    const libelle =
      c.definitionEquipe === 'responsable' ? `Équipe de ${nomDe.get(k) ?? k}` : k;

    cohortes.push({
      cle: k,
      libelle,
      membres,
      minable,
      raison: minable
        ? undefined
        : `${membres.length} personne${membres.length > 1 ? 's' : ''} : sous le seuil de ${c.tailleMinimale}`,
      aRisque: c.groupesARisque.includes(k),
    });
  }

  return cohortes.sort((x, y) => y.membres.length - x.membres.length);
}

/** Les valeurs disponibles pour une définition d'équipe, pour alimenter l'interface. */
export function valeurs(jeu: Jeu, champ: 'departement' | 'site' | 'titre'): string[] {
  return [...new Set(jeu.agents.map((a) => a[champ]))].sort((a, b) =>
    a.localeCompare(b, 'fr'),
  );
}
