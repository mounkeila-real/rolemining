import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { construire, perimetre } from '../src/moteur/cohortes';
import { arbre, factoriser } from '../src/moteur/factorisation';
import { automatisable, miner, resumer, violations } from '../src/moteur/minage';
import { CONDITIONS_PAR_DEFAUT, type Conditions, type Jeu } from '../src/moteur/types';

/**
 * Le moteur passé sur le vrai jeu : organisation Contoso francisée, 272 agents.
 * On ne vérifie pas des chiffres au hasard, on vérifie que les propriétés
 * attendues du jeu se retrouvent bien dans le résultat.
 */
const JEU = JSON.parse(readFileSync('public/donnees/jeu.json', 'utf8')) as Jeu;

const conditions = (modifs: Partial<Conditions> = {}): Conditions => ({
  ...CONDITIONS_PAR_DEFAUT,
  ...modifs,
});

describe('jeu réel', () => {
  it('se charge avec la population et le catalogue attendus', () => {
    expect(JEU.agents).toHaveLength(272);
    expect(JEU.catalogue).toHaveLength(79);
    expect(JEU.agents.filter((a) => a.prestataire)).toHaveLength(29);
    expect(JEU.agents.filter((a) => a.responsable === null)).toHaveLength(1);
  });

  it('écarte les 29 prestataires du minage par défaut', () => {
    expect(perimetre(JEU, conditions())).toHaveLength(243);
  });

  it('produit 16 cohortes par département, dont 4 sous le seuil', () => {
    const c = construire(JEU, conditions());
    expect(c).toHaveLength(16);
    expect(c.filter((x) => !x.minable).map((x) => x.cle).sort()).toEqual([
      'Création', 'Direction Informatique', 'Ingénierie', 'Ressources Humaines',
    ]);
  });

  it('croiser avec le site multiplie les cohortes et les cas non minables', () => {
    const parSite = construire(JEU, conditions({ definitionEquipe: 'departement+site' }));
    expect(parSite).toHaveLength(26);
    expect(parSite.filter((x) => !x.minable)).toHaveLength(5);
  });

  it('trouve des recommandations dans chacune des quatre bandes', () => {
    const c = construire(JEU, conditions());
    const r = resumer(c, miner(JEU, c, conditions()));
    expect(r.forte).toBeGreaterThan(50);
    expect(r.aRevoir).toBeGreaterThan(10);
    expect(r.faible).toBeGreaterThan(5);
    expect(r.ecartee).toBeGreaterThan(20);
    expect(r.automatisables).toBeGreaterThan(30);
  });

  it('ne recommande jamais automatiquement un accès sensible', () => {
    const c = construire(JEU, conditions());
    const sensibles = new Set(
      JEU.catalogue.filter((a) => a.sensible).map((a) => a.code),
    );
    const fautes = miner(JEU, c, conditions()).filter(
      (r) => automatisable(r) && sensibles.has(r.acces),
    );
    expect(fautes).toEqual([]);
  });

  it('remonte le socle au sommet de la hiérarchie', () => {
    const noeuds = arbre(JEU, conditions());
    const socle = factoriser(JEU, noeuds, conditions()).filter(
      (f) => f.acces === 'SOC-MSG',
    );
    expect(socle).toHaveLength(1);
    expect(socle[0]?.statut).toBe('factorisable');
    expect(socle[0]?.effectif).toBe(243);
    // Un seul accès posé à la racine remplace autant de règles qu'il y a
    // d'encadrants dans l'entreprise.
    expect(socle[0]?.equipesCouvertes).toBeGreaterThan(20);
  });

  it('trouve des remontées bloquées par une équipe sous le seuil', () => {
    const noeuds = arbre(JEU, conditions());
    const bloquees = factoriser(JEU, noeuds, conditions()).filter(
      (f) => f.statut === 'bloquee',
    );
    expect(bloquees.length).toBeGreaterThan(0);
    for (const b of bloquees) {
      expect(b.bloqueurs.length).toBeGreaterThan(0);
      expect(b.manquants.length).toBeGreaterThan(0);
      // Tout bloqueur est bien une équipe sous le seuil qui n'a pas l'accès.
      for (const bl of b.bloqueurs) {
        expect(bl.effectif).toBeLessThan(5);
        expect(bl.porteurs).toBeLessThan(bl.effectif);
      }
    }
  });

  it('remonte les prestataires détenant un accès qui leur est interdit', () => {
    const interdits = violations(JEU).filter(
      (v) => v.motif === 'accès interdit aux prestataires',
    );
    expect(interdits.length).toBeGreaterThanOrEqual(3);
    const sams = new Set(interdits.map((v) => v.agent));
    for (const sam of sams) {
      expect(JEU.agents.find((a) => a.sam === sam)?.prestataire).toBe(true);
    }
  });

  it('tient dans un budget de temps compatible avec un calcul au clic', () => {
    const depart = performance.now();
    for (const definitionEquipe of ['departement', 'departement+site', 'titre'] as const) {
      const c = conditions({ definitionEquipe });
      miner(JEU, construire(JEU, c), c);
      factoriser(JEU, arbre(JEU, c), c);
    }
    expect(performance.now() - depart).toBeLessThan(3000);
  });
});
