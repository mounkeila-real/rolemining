import type {
  Acces,
  Cohorte,
  Conditions,
  Jeu,
  Recommandation,
  Verdict,
  Violation,
} from './types';

/**
 * Le calcul central : pour chaque cohorte et chaque accès, quelle part de
 * l'équipe le détient, et qu'en conclut-on.
 *
 * Le pourcentage n'est qu'un chiffre ; ce qui compte est ce qu'on en fait. Un
 * accès à 100 % dans une équipe de 40 personnes est une évidence. Le même 100 %
 * dans une équipe de 3 ne prouve rien — d'où le seuil de taille. Et un accès
 * sensible à 100 % reste une décision humaine, pas un automatisme.
 */

function verdictDe(taux: number, c: Conditions): Verdict {
  const pct = taux * 100;
  if (pct >= c.seuilFort) return 'forte';
  if (pct >= c.seuilARevoir) return 'a-revoir';
  if (pct >= c.seuilFaible) return 'faible';
  return 'ecartee';
}

export function miner(jeu: Jeu, cohortes: Cohorte[], c: Conditions): Recommandation[] {
  const parCode = new Map<string, Acces>(jeu.catalogue.map((a) => [a.code, a]));
  const recommandations: Recommandation[] = [];

  for (const cohorte of cohortes) {
    const effectif = cohorte.membres.length;
    if (effectif === 0) continue;

    // Qui détient quoi, dans cette cohorte seulement.
    const porteurs = new Map<string, string[]>();
    for (const membre of cohorte.membres) {
      for (const code of jeu.attributions[membre.sam] ?? []) {
        const acces = parCode.get(code);
        if (!acces) continue;
        if (c.exclureObsoletes && acces.categorie === 'Obsolète') continue;
        const liste = porteurs.get(code);
        if (liste) liste.push(membre.sam);
        else porteurs.set(code, [membre.sam]);
      }
    }

    for (const [code, detenteurs] of porteurs) {
      const acces = parCode.get(code);
      if (!acces) continue;

      const taux = detenteurs.length / effectif;
      const possede = new Set(detenteurs);
      const manquants = cohorte.membres
        .filter((m) => !possede.has(m.sam))
        .map((m) => m.sam);
      const interdits = acces.interditPrestataire
        ? cohorte.membres.filter((m) => m.prestataire).map((m) => m.sam)
        : [];

      let verdict = verdictDe(taux, c);
      const reserves: string[] = [];

      // L'exception que tu as posée : une équipe trop petite ne se mine pas,
      // sauf quand l'accès est détenu par tout le monde sans exception.
      if (!cohorte.minable) {
        if (c.exceptionCentPourCent && taux === 1) {
          reserves.push(
            `équipe de ${effectif} retenue au titre de l'exception 100 %`,
          );
        } else {
          verdict = 'ecartee';
          reserves.push(cohorte.raison ?? 'équipe non minable');
        }
      }

      if (cohorte.aRisque) {
        reserves.push('groupe à risque : exclu des automatismes');
      }
      if (acces.sensible && c.validerSensibles) {
        reserves.push('accès sensible : validation humaine requise');
      }
      if (interdits.length > 0) {
        reserves.push(
          `interdit à ${interdits.length} prestataire${interdits.length > 1 ? 's' : ''} de l'équipe`,
        );
      }
      if (acces.categorie === 'Obsolète') {
        reserves.push("outil à l'abandon : à retirer plutôt qu'à étendre");
      }

      recommandations.push({
        cohorte: cohorte.cle,
        cohorteLibelle: cohorte.libelle,
        effectif,
        acces: code,
        accesLibelle: acces.nom,
        porteurs: detenteurs.length,
        taux,
        verdict,
        reserves,
        manquants,
        interdits,
      });
    }
  }

  return recommandations.sort(
    (a, b) => b.taux - a.taux || b.effectif - a.effectif || a.acces.localeCompare(b.acces),
  );
}

/** Une recommandation est automatisable si rien ne s'y oppose. */
export function automatisable(r: Recommandation): boolean {
  return r.verdict === 'forte' && r.reserves.length === 0;
}

/**
 * Les écarts que le minage n'a pas à trancher mais qu'il faut voir : un accès
 * interdit aux prestataires et pourtant détenu, un outil abandonné toujours actif.
 */
export function violations(jeu: Jeu): Violation[] {
  const parCode = new Map<string, Acces>(jeu.catalogue.map((a) => [a.code, a]));
  const trouvees: Violation[] = [];

  for (const agent of jeu.agents) {
    for (const code of jeu.attributions[agent.sam] ?? []) {
      const acces = parCode.get(code);
      if (!acces) continue;

      if (agent.prestataire && acces.interditPrestataire) {
        trouvees.push({
          agent: agent.sam,
          agentNom: agent.nom,
          acces: code,
          accesLibelle: acces.nom,
          motif: 'accès interdit aux prestataires',
        });
      } else if (acces.categorie === 'Obsolète') {
        trouvees.push({
          agent: agent.sam,
          agentNom: agent.nom,
          acces: code,
          accesLibelle: acces.nom,
          motif: "outil à l'abandon",
        });
      }
    }
  }

  return trouvees.sort(
    (a, b) => a.motif.localeCompare(b.motif) || a.agentNom.localeCompare(b.agentNom, 'fr'),
  );
}

export interface Resume {
  cohortes: number;
  cohortesMinables: number;
  forte: number;
  aRevoir: number;
  faible: number;
  ecartee: number;
  automatisables: number;
  provisionnements: number;
}

export function resumer(cohortes: Cohorte[], recos: Recommandation[]): Resume {
  const compte = (v: Verdict) => recos.filter((r) => r.verdict === v).length;
  return {
    cohortes: cohortes.length,
    cohortesMinables: cohortes.filter((c) => c.minable).length,
    forte: compte('forte'),
    aRevoir: compte('a-revoir'),
    faible: compte('faible'),
    ecartee: compte('ecartee'),
    automatisables: recos.filter(automatisable).length,
    // Une recommandation forte est à 100 % : elle ne provisionne rien. Le travail
    // réel est sur les « à revoir », où il manque l'accès à quelques personnes.
    provisionnements: recos
      .filter((r) => r.verdict === 'a-revoir')
      .reduce((n, r) => n + r.manquants.length, 0),
  };
}
