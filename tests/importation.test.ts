import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { devinerSeparateur, parser } from '../src/moteur/csv';
import {
  construire,
  detecterAnnuaire,
  detecterHabilitations,
  devinerPrestataires,
} from '../src/moteur/importation';
import { construire as cohortes } from '../src/moteur/cohortes';
import { miner } from '../src/moteur/minage';
import { CONDITIONS_PAR_DEFAUT } from '../src/moteur/types';

describe('analyse CSV', () => {
  it('devine le point-virgule comme la virgule', () => {
    expect(devinerSeparateur('a;b;c\n1;2;3')).toBe(';');
    expect(devinerSeparateur('a,b,c\n1,2,3')).toBe(',');
    expect(devinerSeparateur('a\tb\tc\n1\t2\t3')).toBe('\t');
  });

  it('ne compte pas un séparateur enfermé dans des guillemets', () => {
    expect(devinerSeparateur('"Dupont, Jean",b\n')).toBe(',');
    expect(devinerSeparateur('"Achats; Logistique";b;c\n')).toBe(';');
  });

  it('retire la marque d’ordre des octets et les fins de ligne Windows', () => {
    const t = parser('﻿"Nom";"Service"\r\n"Alice";"Ventes"\r\n');
    expect(t.entetes).toEqual(['Nom', 'Service']);
    expect(t.lignes).toEqual([{ Nom: 'Alice', Service: 'Ventes' }]);
  });

  it('gère les guillemets doublés et les séparateurs dans les cellules', () => {
    const t = parser('Nom;Titre\n"Bonnet";"Chef ""grands comptes"", Nord;Est"');
    expect(t.lignes[0]?.Titre).toBe('Chef "grands comptes", Nord;Est');
  });

  it('rend les en-têtes uniques et nomme les colonnes anonymes', () => {
    const t = parser('Nom;Nom;;Service\na;b;c;d');
    expect(t.entetes).toEqual(['Nom', 'Nom_2', 'colonne_3', 'Service']);
  });

  it('ignore les lignes vides', () => {
    expect(parser('a;b\n1;2\n\n\n3;4\n').lignes).toHaveLength(2);
  });

  it('complète les lignes plus courtes que l’en-tête', () => {
    expect(parser('a;b;c\n1;2').lignes[0]).toEqual({ a: '1', b: '2', c: '' });
  });
});

describe('détection des colonnes', () => {
  it('reconnaît un export Active Directory', () => {
    const m = detecterAnnuaire([
      'Department', 'DistinguishedName', 'GivenName', 'mail', 'Manager', 'Name',
      'Office', 'SamAccountName', 'Title',
    ]);
    expect(m).toMatchObject({
      identifiant: 'SamAccountName',
      nom: 'Name',
      departement: 'Department',
      titre: 'Title',
      site: 'Office',
      responsable: 'Manager',
      dn: 'DistinguishedName',
    });
  });

  it('reconnaît un export en français', () => {
    const m = detecterAnnuaire(['Matricule', 'Nom complet', 'Service', 'Fonction', 'Ville', 'Responsable']);
    expect(m).toMatchObject({
      identifiant: 'Matricule',
      nom: 'Nom complet',
      departement: 'Service',
      titre: 'Fonction',
      site: 'Ville',
      responsable: 'Responsable',
    });
  });

  it('ne confond pas « manager » avec une colonne qui le contient', () => {
    // L'égalité exacte doit l'emporter sur l'inclusion.
    expect(detecterAnnuaire(['ManagerDisplayName', 'Manager', 'sam']).responsable).toBe('Manager');
  });

  it('se rabat sur l’ordre des colonnes pour les habilitations sans en-tête parlant', () => {
    expect(detecterHabilitations(['qui', 'quoi'])).toEqual({ agent: 'qui', acces: 'quoi' });
    expect(detecterHabilitations(['Membre', 'Groupe'])).toEqual({ agent: 'Membre', acces: 'Groupe' });
  });

  it('propose les départements qui ressemblent à de la prestation', () => {
    expect(
      devinerPrestataires(['Ventes', '1099 Contractor', 'Prestataires Externes', 'Intérim', 'Achats']),
    ).toEqual(['1099 Contractor', 'Prestataires Externes', 'Intérim']);
  });
});

describe('reconstruction du jeu', () => {
  const annuaire = parser(
    [
      'Matricule;Nom complet;Service;Fonction;Ville;Responsable',
      'a1;Alice Aubert;Ventes;Responsable commercial;Lyon;',
      'a2;Bruno Bonnet;Ventes;Commercial;Lyon;a1',
      'a3;Chloé Colin;Ventes;Commercial;Metz;Alice Aubert',
      'p1;Paul Prest;Prestataires;Commercial;Lyon;a1',
      ';Sans identifiant;Ventes;Commercial;Lyon;a1',
      'a2;Doublon;Ventes;Commercial;Lyon;a1',
      'a4;Diane Dumas;Ventes;Commercial;Lyon;inconnu-du-fichier',
    ].join('\n'),
  );
  const habilitations = parser(
    [
      'Membre;Groupe',
      'a1;CRM', 'a2;CRM', 'a3;CRM', 'a4;CRM', 'p1;CRM',
      'a1;PAIE', 'a2;CRM', 'fantome;CRM',
    ].join('\n'),
  );

  const options = {
    annuaire,
    habilitations,
    correspondance: detecterAnnuaire(annuaire.entetes),
    correspondanceHabilitations: detecterHabilitations(habilitations.entetes),
    departementsPrestataires: ['Prestataires'],
  };

  it('bâtit les agents en signalant ce qu’il a écarté', () => {
    const { jeu, diagnostics } = construire(options);
    expect(jeu.agents.map((a) => a.sam)).toEqual(['a1', 'a2', 'a3', 'p1', 'a4']);
    const messages = diagnostics.map((d) => d.message).join(' | ');
    expect(messages).toContain('1 ligne(s) sans identifiant');
    expect(messages).toContain('1 identifiant(s) en double');
  });

  it('résout le responsable par identifiant comme par nom affiché', () => {
    const { jeu } = construire(options);
    const parSam = new Map(jeu.agents.map((a) => [a.sam, a]));
    expect(parSam.get('a2')?.responsable).toBe('a1');
    expect(parSam.get('a3')?.responsable).toBe('a1');
    expect(parSam.get('a1')?.responsable).toBeNull();
  });

  it('signale un responsable introuvable au lieu de l’inventer', () => {
    const { jeu, diagnostics } = construire(options);
    expect(jeu.agents.find((a) => a.sam === 'a4')?.responsable).toBeNull();
    expect(diagnostics.map((d) => d.message).join(' ')).toContain('responsable(s) introuvable');
  });

  it('marque les prestataires et leur département d’accueil', () => {
    const { jeu } = construire(options);
    const p = jeu.agents.find((a) => a.sam === 'p1');
    expect(p?.prestataire).toBe(true);
    expect(p?.accueil).toBe('Ventes');
    expect(jeu.agents.find((a) => a.sam === 'a2')?.prestataire).toBe(false);
  });

  it('déduplique les attributions et écarte les agents inconnus', () => {
    const { jeu, diagnostics } = construire(options);
    expect(jeu.attributions['a2']).toEqual(['CRM']);
    expect(jeu.attributions['fantome']).toBeUndefined();
    expect(diagnostics.map((d) => d.message).join(' ')).toContain('1 attribution(s) visent un agent absent');
  });

  it('fabrique un catalogue neutre quand aucun n’est fourni', () => {
    const { jeu } = construire(options);
    expect(jeu.catalogue.map((a) => a.code)).toEqual(['CRM', 'PAIE']);
    expect(jeu.catalogue.every((a) => !a.sensible && !a.interditPrestataire)).toBe(true);
  });

  it('reprend la sensibilité et l’interdiction du catalogue fourni', () => {
    const catalogue = parser(
      'Code;Libelle;Application;Categorie;Sensible;InterditPrestataire\nPAIE;Paie;SIRH;Sensible;oui;1',
    );
    const { jeu, diagnostics } = construire({ ...options, catalogue });
    const paie = jeu.catalogue.find((a) => a.code === 'PAIE');
    expect(paie).toMatchObject({ nom: 'Paie', categorie: 'Sensible', sensible: true, interditPrestataire: true });
    expect(diagnostics.map((d) => d.message).join(' ')).toContain('1 accès rencontrés ne figurent pas');
  });

  it('refuse un identifiant non désigné plutôt que de produire un jeu vide en silence', () => {
    const { jeu, diagnostics } = construire({
      ...options,
      correspondance: { ...options.correspondance, identifiant: '' },
    });
    expect(jeu.agents).toHaveLength(0);
    expect(diagnostics[0]?.niveau).toBe('erreur');
  });

  it('produit un jeu que le moteur mine sans rien savoir de son origine', () => {
    const { jeu } = construire(options);
    const c = cohortes(jeu, { ...CONDITIONS_PAR_DEFAUT, tailleMinimale: 2 });
    const recos = miner(jeu, c, { ...CONDITIONS_PAR_DEFAUT, tailleMinimale: 2 });
    const crm = recos.find((r) => r.cohorte === 'Ventes' && r.acces === 'CRM');
    // Les quatre internes des Ventes ont CRM ; le prestataire est hors périmètre.
    expect(crm?.effectif).toBe(4);
    expect(crm?.taux).toBe(1);
    expect(crm?.verdict).toBe('forte');
  });
});

describe('aller-retour sur les fichiers du projet', () => {
  it('réimporte les CSV générés et retrouve le jeu complet', () => {
    const annuaire = parser(readFileSync('donnees/ADUsers-fr.csv', 'utf8'));
    const habilitations = parser(readFileSync('donnees/habilitations.csv', 'utf8'));
    const catalogue = parser(readFileSync('donnees/catalogue.csv', 'utf8'));

    const m = detecterAnnuaire(annuaire.entetes);
    expect(m.identifiant).toBe('SamAccountName');
    expect(m.responsable).toBe('Manager');
    expect(m.site).toBe('Office');

    const { jeu, diagnostics } = construire({
      annuaire,
      habilitations,
      catalogue,
      correspondance: m,
      correspondanceHabilitations: detecterHabilitations(habilitations.entetes),
      departementsPrestataires: devinerPrestataires(
        annuaire.lignes.map((l) => l.Department ?? ''),
      ),
    });

    expect(jeu.agents).toHaveLength(272);
    expect(jeu.catalogue).toHaveLength(79);
    expect(jeu.agents.filter((a) => a.prestataire)).toHaveLength(29);
    expect(jeu.agents.filter((a) => a.responsable === null)).toHaveLength(1);
    expect(jeu.catalogue.find((a) => a.code === 'PAIE')?.interditPrestataire).toBe(true);
    // Aucune alerte : le fichier se relit entièrement.
    expect(diagnostics.filter((d) => d.niveau !== 'info')).toEqual([]);
  });
});
