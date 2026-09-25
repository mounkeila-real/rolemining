import { describe, expect, it } from 'vitest';

import { construire, perimetre } from '../src/moteur/cohortes';
import { arbre, factoriser } from '../src/moteur/factorisation';
import { automatisable, miner, resumer, violations } from '../src/moteur/minage';
import { CONDITIONS_PAR_DEFAUT, type Conditions } from '../src/moteur/types';
import { JEU } from './fixture';

const conditions = (modifs: Partial<Conditions> = {}): Conditions => ({
  ...CONDITIONS_PAR_DEFAUT,
  ...modifs,
});

const trouver = (recos: ReturnType<typeof miner>, cohorte: string, acces: string) => {
  const r = recos.find((x) => x.cohorte === cohorte && x.acces === acces);
  if (!r) throw new Error(`recommandation absente : ${cohorte} / ${acces}`);
  return r;
};

describe('périmètre', () => {
  it('écarte les prestataires par défaut', () => {
    expect(perimetre(JEU, conditions()).map((a) => a.sam)).not.toContain('p1');
    expect(perimetre(JEU, conditions()).length).toBe(11);
  });

  it('les réintègre quand on le demande', () => {
    expect(perimetre(JEU, conditions({ inclurePrestataires: true })).length).toBe(12);
  });

  it('filtre sur le département sans casser le calcul', () => {
    const p = perimetre(JEU, conditions({ departements: ['Ventes'] }));
    expect(p.length).toBe(10);
    expect(p.every((a) => a.departement === 'Ventes')).toBe(true);
  });
});

describe('cohortes', () => {
  it('découpe par département et marque ce qui est minable', () => {
    const c = construire(JEU, conditions());
    const ventes = c.find((x) => x.cle === 'Ventes');
    const dg = c.find((x) => x.cle === 'Direction Générale');
    expect(ventes?.membres.length).toBe(10);
    expect(ventes?.minable).toBe(true);
    expect(dg?.membres.length).toBe(1);
    expect(dg?.minable).toBe(false);
    expect(dg?.raison).toContain('sous le seuil de 5');
  });

  it('par responsable, exclut le responsable de sa propre équipe', () => {
    const c = construire(JEU, conditions({ definitionEquipe: 'responsable' }));
    const equipeA = c.find((x) => x.cle === 'a');
    expect(equipeA?.membres.map((m) => m.sam).sort()).toEqual(['a1', 'a2', 'a3']);
    expect(equipeA?.libelle).toBe('Équipe de Alice Aubert');
    // Deux niveaux : l'équipe de a1 existe indépendamment de celle de a.
    expect(c.find((x) => x.cle === 'a1')?.membres.map((m) => m.sam).sort()).toEqual([
      'a11', 'a12', 'a13',
    ]);
    // La racine n'appartient à aucune équipe : elle n'a pas de responsable.
    expect(c.flatMap((x) => x.membres.map((m) => m.sam))).not.toContain('dg');
  });

  it('change de découpage quand la définition change', () => {
    const parTitre = construire(JEU, conditions({ definitionEquipe: 'titre' }));
    expect(parTitre.find((x) => x.cle === 'Commercial')?.membres.length).toBe(7);
    expect(parTitre.find((x) => x.cle === 'Responsable commercial')?.minable).toBe(false);
  });
});

describe('minage', () => {
  const recos = miner(JEU, construire(JEU, conditions()), conditions());

  it('recommande fortement un accès détenu par toute l’équipe', () => {
    const r = trouver(recos, 'Ventes', 'CRM-LEC');
    expect(r.porteurs).toBe(10);
    expect(r.taux).toBe(1);
    expect(r.verdict).toBe('forte');
    expect(r.reserves).toEqual([]);
    expect(automatisable(r)).toBe(true);
  });

  it('classe en « faible » un accès détenu par les deux tiers', () => {
    const r = trouver(recos, 'Ventes', 'DEVIS');
    expect(r.porteurs).toBe(7);
    expect(r.verdict).toBe('faible');
    expect(r.manquants.sort()).toEqual(['b', 'b1', 'b2']);
  });

  it('écarte la dérive d’une seule personne', () => {
    const r = trouver(recos, 'Ventes', 'PAO');
    expect(r.porteurs).toBe(1);
    expect(r.verdict).toBe('ecartee');
    expect(automatisable(r)).toBe(false);
  });

  it('applique l’exception 100 % à une équipe sous le seuil', () => {
    const r = trouver(recos, 'Direction Générale', 'CRM-LEC');
    expect(r.verdict).toBe('forte');
    expect(r.reserves.join(' ')).toContain('exception 100 %');
    // Retenue, mais pas automatisable sans regard humain.
    expect(automatisable(r)).toBe(false);
  });

  it('écarte une équipe sous le seuil quand l’exception est levée', () => {
    const sansException = conditions({ exceptionCentPourCent: false });
    const r = trouver(
      miner(JEU, construire(JEU, sansException), sansException),
      'Direction Générale',
      'CRM-LEC',
    );
    expect(r.verdict).toBe('ecartee');
  });

  it('exige une validation humaine sur un accès sensible', () => {
    const r = trouver(recos, 'Direction Générale', 'COFFRE');
    expect(r.taux).toBe(1);
    expect(r.reserves.join(' ')).toContain('accès sensible');
    expect(automatisable(r)).toBe(false);
  });

  it('signale les prestataires à qui l’accès est interdit', () => {
    const avec = conditions({ inclurePrestataires: true });
    const r = trouver(
      miner(JEU, construire(JEU, avec), avec),
      'Prestataires Externes',
      'COFFRE',
    );
    expect(r.interdits).toEqual(['p1']);
    expect(r.reserves.join(' ')).toContain('interdit à 1 prestataire');
    expect(automatisable(r)).toBe(false);
  });

  it('n’automatise rien sur un groupe marqué à risque', () => {
    const risque = conditions({ groupesARisque: ['Ventes'] });
    const r = trouver(
      miner(JEU, construire(JEU, risque), risque),
      'Ventes',
      'CRM-LEC',
    );
    expect(r.verdict).toBe('forte');
    expect(r.reserves.join(' ')).toContain('groupe à risque');
    expect(automatisable(r)).toBe(false);
  });

  it('ignore les outils à l’abandon, et les reprend si on le demande', () => {
    expect(recos.some((r) => r.acces === 'OBS')).toBe(false);
    const avec = conditions({ exclureObsoletes: false });
    const r = trouver(miner(JEU, construire(JEU, avec), avec), 'Ventes', 'OBS');
    expect(r.reserves.join(' ')).toContain("à l'abandon");
  });

  it('compte les provisionnements que l’on s’engage à faire', () => {
    const r = resumer(construire(JEU, conditions()), recos);
    expect(r.cohortes).toBe(2);
    expect(r.cohortesMinables).toBe(1);
    // Les recommandations automatisables sont toutes à 100 % : rien à provisionner.
    expect(r.provisionnements).toBe(0);
  });
});

describe('écarts', () => {
  it('remonte un accès interdit détenu par un prestataire', () => {
    const v = violations(JEU);
    expect(v).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ agent: 'p1', acces: 'COFFRE', motif: 'accès interdit aux prestataires' }),
      ]),
    );
  });

  it('remonte les outils à l’abandon encore détenus', () => {
    expect(violations(JEU).filter((v) => v.acces === 'OBS').map((v) => v.agent)).toEqual(['b2']);
  });
});

describe('factorisation', () => {
  const noeuds = arbre(JEU, conditions());

  it('construit l’arbre et raccroche les orphelins au premier ancêtre présent', () => {
    expect(noeuds.size).toBe(11);
    expect(noeuds.get('dg')?.sousArbre.length).toBe(11);
    expect(noeuds.get('a')?.sousArbre.length).toBe(7);
    expect(noeuds.get('a1')?.sousArbre.length).toBe(4);
    expect(noeuds.get('b')?.sousArbre.length).toBe(3);
    // p1 est hors périmètre : il ne compte pas dans le sous-arbre de a.
    expect(noeuds.get('a')?.sousArbre.map((x) => x.sam)).not.toContain('p1');
  });

  it('remonte au nœud le plus haut un accès détenu par tout le sous-arbre', () => {
    const f = factoriser(JEU, noeuds, conditions()).filter((x) => x.acces === 'CRM-LEC');
    expect(f).toHaveLength(1);
    expect(f[0]?.noeud).toBe('dg');
    expect(f[0]?.statut).toBe('factorisable');
    expect(f[0]?.effectif).toBe(11);
    expect(f[0]?.equipesCouvertes).toBe(4);
    expect(f[0]?.manquants).toEqual([]);
  });

  it('bloque la remontée quand une équipe sous le seuil ne détient pas l’accès', () => {
    const f = factoriser(JEU, noeuds, conditions()).filter((x) => x.acces === 'DEVIS');
    expect(f).toHaveLength(1);
    const cas = f[0];
    expect(cas?.noeud).toBe('dg');
    expect(cas?.statut).toBe('bloquee');
    expect(cas?.bloqueurs).toEqual([
      { sam: 'b', nom: 'Bruno Bonnet', effectif: 3, porteurs: 0 },
    ]);
    // Les trois personnes qui hériteraient de l'accès sans l'avoir validé.
    expect(cas?.manquants.sort()).toEqual(['b', 'b1', 'b2']);
  });

  it('sans le seuil de taille, plus rien ne bloque et la remontée devient muette', () => {
    const sansSeuil = conditions({ tailleMinimale: 1 });
    const f = factoriser(JEU, arbre(JEU, sansSeuil), sansSeuil).filter(
      (x) => x.acces === 'DEVIS',
    );
    // L'équipe de b n'est plus « petite » : elle ne bloque plus, et la
    // factorisation s'arrête donc au nœud a, qui est complet et couvre bien
    // deux équipes, la sienne et celle de a1.
    expect(f.map((x) => x.noeud)).toEqual(['a']);
    expect(f[0]?.statut).toBe('factorisable');
  });

  it('ne factorise pas un accès isolé', () => {
    expect(factoriser(JEU, noeuds, conditions()).some((x) => x.acces === 'PAO')).toBe(false);
  });
});
