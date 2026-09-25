import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { construire as cohortes } from '../src/moteur/cohortes';
import { parser } from '../src/moteur/csv';
import { arbre, factoriser } from '../src/moteur/factorisation';
import {
  construire,
  detecterAnnuaire,
  detecterHabilitations,
  devinerPrestataires,
} from '../src/moteur/importation';
import { automatisable, miner, resumer, violations } from '../src/moteur/minage';
import { CONDITIONS_PAR_DEFAUT } from '../src/moteur/types';

/**
 * Le jeu d'essai de `exemples/` sert à éprouver l'import devant un client. Ce
 * test garantit qu'il contient toujours ses défauts volontaires : si quelqu'un
 * « nettoie » les fichiers, la démonstration perdrait tout son intérêt et ce
 * test tomberait.
 */
const lire = (nom: string) => parser(readFileSync(`exemples/${nom}`, 'utf8'));

const annuaire = lire('annuaire.csv');
const habilitations = lire('habilitations.csv');
const catalogue = lire('catalogue.csv');

const correspondance = detecterAnnuaire(annuaire.entetes);
const resultat = construire({
  annuaire,
  habilitations,
  catalogue,
  correspondance,
  correspondanceHabilitations: detecterHabilitations(habilitations.entetes),
  departementsPrestataires: devinerPrestataires(
    annuaire.lignes.map((l) => l['Service'] ?? ''),
  ),
});

const messages = resultat.diagnostics.map((d) => d.message).join(' | ');

describe("jeu d'essai pour l'import", () => {
  it('fait reconnaître des en-têtes français sans rapport avec Active Directory', () => {
    expect(correspondance).toMatchObject({
      identifiant: 'Matricule',
      nom: 'Nom complet',
      departement: 'Service',
      titre: 'Fonction',
      site: 'Site',
      responsable: 'Responsable',
    });
  });

  it('retient 25 agents sur 27 lignes', () => {
    expect(annuaire.lignes).toHaveLength(27);
    expect(resultat.jeu.agents).toHaveLength(25);
    expect(messages).toContain('1 ligne(s) sans identifiant');
    expect(messages).toContain('1 identifiant(s) en double');
  });

  it('signale le responsable introuvable et l’habilitation orpheline', () => {
    expect(messages).toContain('responsable(s) introuvable');
    expect(messages).toContain('MOREAU Luc');
    expect(messages).toContain('1 attribution(s) visent un agent absent');
  });

  it('lit un libellé de service contenant le séparateur', () => {
    expect(resultat.jeu.agents.map((a) => a.departement)).toContain(
      'Audit; commissariat aux comptes',
    );
  });

  it('repère les prestataires sans qu’on les désigne', () => {
    expect(resultat.jeu.agents.filter((a) => a.prestataire)).toHaveLength(3);
  });

  it('reprend la sensibilité déclarée au catalogue', () => {
    const ad = resultat.jeu.catalogue.find((a) => a.code === 'AD-ADMIN');
    expect(ad).toMatchObject({ sensible: true, interditPrestataire: true });
  });

  it('remonte le prestataire administrateur de l’annuaire', () => {
    const interdits = violations(resultat.jeu).filter(
      (v) => v.motif === 'accès interdit aux prestataires',
    );
    expect(interdits.map((v) => `${v.agentNom} — ${v.acces}`)).toContain(
      'Pauline Adam — AD-ADMIN',
    );
  });

  it('se mine et produit les quatre bandes', () => {
    const c = cohortes(resultat.jeu, CONDITIONS_PAR_DEFAUT);
    const recos = miner(resultat.jeu, c, CONDITIONS_PAR_DEFAUT);
    const r = resumer(c, recos);

    const chiffres = {
      perimetre: c.reduce((n, x) => n + x.membres.length, 0),
      equipes: r.cohortes,
      minables: r.cohortesMinables,
      forte: r.forte,
      aRevoir: r.aRevoir,
      faible: r.faible,
      ecartee: r.ecartee,
      automatisables: r.automatisables,
      provisionnements: r.provisionnements,
      ecarts: violations(resultat.jeu).length,
      factorisations: factoriser(
        resultat.jeu,
        arbre(resultat.jeu, CONDITIONS_PAR_DEFAUT),
        CONDITIONS_PAR_DEFAUT,
      ).length,
    };
    // Figé : c'est ce que l'on annonce au client avant de lui montrer l'écran.
    expect(chiffres).toEqual({
      perimetre: 22,
      equipes: 5,
      minables: 2,
      forte: 27,
      aRevoir: 2,
      faible: 7,
      ecartee: 17,
      automatisables: 9,
      provisionnements: 2,
      ecarts: 1,
      factorisations: 3,
    });
    expect(recos.some(automatisable)).toBe(true);
  });
});
