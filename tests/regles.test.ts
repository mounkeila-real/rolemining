import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { analyser, decrire, figer, selectionner, type Critere } from '../src/moteur/regles';
import { CONDITIONS_PAR_DEFAUT, type Conditions, type Jeu } from '../src/moteur/types';
import { JEU } from './fixture';

const conditions = (modifs: Partial<Conditions> = {}): Conditions => ({
  ...CONDITIONS_PAR_DEFAUT,
  ...modifs,
});

const criteres = (modifs: Partial<Record<'departement' | 'titre' | 'site', string[]>>): Critere[] => [
  { attribut: 'departement', valeurs: modifs.departement ?? [] },
  { attribut: 'titre', valeurs: modifs.titre ?? [] },
  { attribut: 'site', valeurs: modifs.site ?? [] },
];

const ligne = (a: ReturnType<typeof analyser>, code: string) => {
  const l = a.lignes.find((x) => x.code === code);
  if (!l) throw new Error(`accès absent de l'analyse : ${code}`);
  return l;
};

describe('désignation de la population', () => {
  it('sans critère, prend toute la population du périmètre', () => {
    const s = selectionner(JEU, criteres({}), false);
    expect(s.membres).toHaveLength(11);
    expect(s.ecartes.map((a) => a.sam)).toEqual(['p1']);
  });

  it('combine les critères par ET', () => {
    expect(selectionner(JEU, criteres({ titre: ['Commercial'] }), false).membres).toHaveLength(7);
    expect(
      selectionner(JEU, criteres({ titre: ['Commercial'], departement: ['Ventes'] }), false).membres,
    ).toHaveLength(7);
    expect(
      selectionner(JEU, criteres({ titre: ['Commercial'], departement: ['Direction Générale'] }), false)
        .membres,
    ).toHaveLength(0);
  });

  it('accepte plusieurs valeurs pour un même attribut', () => {
    const s = selectionner(
      JEU,
      criteres({ titre: ['Commercial', 'Responsable commercial'] }),
      false,
    );
    expect(s.membres).toHaveLength(9);
  });

  it('réintègre les prestataires à la demande', () => {
    const s = selectionner(JEU, criteres({ titre: ['Commercial'] }), true);
    expect(s.membres.map((a) => a.sam)).toContain('p1');
    expect(s.ecartes).toHaveLength(0);
  });
});

describe('analyse d’une règle transverse', () => {
  it('propose les accès universels et sans réserve', () => {
    const a = analyser(JEU, criteres({ titre: ['Commercial'] }), conditions());
    expect(ligne(a, 'CRM-LEC')).toMatchObject({ taux: 1, retenu: true, reserves: [] });
    expect(ligne(a, 'SOC-MSG').retenu).toBe(true);
    // Quatre des sept commerciaux ont DEVIS : rien d'automatique là-dedans.
    expect(ligne(a, 'DEVIS')).toMatchObject({ detenteurs: 5, retenu: false });
  });

  it('calcule ce qu’il faudrait provisionner', () => {
    const a = analyser(JEU, criteres({ titre: ['Commercial'] }), conditions());
    const devis = ligne(a, 'DEVIS');
    expect(devis.aProvisionner.sort()).toEqual(['b1', 'b2']);
    expect(ligne(a, 'CRM-LEC').aProvisionner).toEqual([]);
  });

  it('respecte la sélection de l’utilisateur quand elle est donnée', () => {
    const a = analyser(JEU, criteres({ titre: ['Commercial'] }), conditions(), new Set(['DEVIS']));
    expect(ligne(a, 'DEVIS').retenu).toBe(true);
    expect(ligne(a, 'CRM-LEC').retenu).toBe(false);
  });

  it('ne propose jamais un accès sensible de sa propre initiative', () => {
    const a = analyser(JEU, criteres({ departement: ['Direction Générale'] }), conditions());
    const coffre = ligne(a, 'COFFRE');
    expect(coffre.taux).toBe(1);
    expect(coffre.retenu).toBe(false);
    expect(coffre.reserves.join(' ')).toContain('accès sensible');
  });

  it('retire du provisionnement les prestataires à qui l’accès est interdit', () => {
    const a = analyser(
      JEU,
      criteres({ titre: ['Commercial'] }),
      conditions({ inclurePrestataires: true }),
    );
    const coffre = ligne(a, 'COFFRE');
    expect(coffre.interdits).toEqual(['p1']);
    expect(coffre.aProvisionner).not.toContain('p1');
    expect(coffre.reserves.join(' ')).toContain('interdit à 1 prestataire');
  });

  it('signale une population trop petite pour conclure', () => {
    const a = analyser(JEU, criteres({ titre: ['Chef de secteur'] }), conditions());
    expect(a.membres).toHaveLength(1);
    expect(ligne(a, 'CRM-LEC').reserves.join(' ')).toContain('sous le seuil de 5');
    expect(ligne(a, 'CRM-LEC').retenu).toBe(false);
  });

  it('ne rend aucune ligne pour une population vide', () => {
    expect(analyser(JEU, criteres({ site: ['Nulle part'] }), conditions()).lignes).toEqual([]);
  });
});

describe('règle figée', () => {
  it('ne retient que les accès cochés et liste les actions', () => {
    const c = criteres({ titre: ['Commercial'] });
    const a = analyser(JEU, c, conditions(), new Set(['CRM-LEC', 'DEVIS']));
    const r = figer('Socle commercial', c, a);

    expect(r.nom).toBe('Socle commercial');
    expect(r.effectif).toBe(7);
    expect(r.acces.sort()).toEqual(['CRM-LEC', 'DEVIS']);
    expect(r.criteres).toEqual([{ attribut: 'titre', valeurs: ['Commercial'] }]);
    expect(r.provisionnements.sort((x, y) => x.agent.localeCompare(y.agent))).toEqual([
      { agent: 'b1', acces: 'DEVIS' },
      { agent: 'b2', acces: 'DEVIS' },
    ]);
  });

  it('décrit la population en clair', () => {
    expect(decrire(criteres({}))).toBe('Toute la population');
    expect(decrire(criteres({ titre: ['Commercial'], site: ['Paris'] }))).toBe(
      'Fonction : Commercial · Site : Paris',
    );
  });
});

describe('sur le jeu réel', () => {
  const JEU_REEL = JSON.parse(readFileSync('public/donnees/jeu.json', 'utf8')) as Jeu;

  it('trouve un socle transverse aux commerciaux des trois sites', () => {
    const c = criteres({ titre: ['Commercial'] });
    const a = analyser(JEU_REEL, c, conditions());
    expect(a.membres).toHaveLength(49);
    expect(new Set(a.membres.map((m) => m.site)).size).toBe(3);

    const retenus = a.lignes.filter((l) => l.retenu);
    expect(retenus.length).toBeGreaterThan(3);
    // Un socle transverse ne provisionne rien : il constate ce qui est déjà là.
    expect(retenus.every((l) => l.taux === 1 && l.aProvisionner.length === 0)).toBe(true);
    expect(retenus.map((l) => l.code)).toContain('CRM-LEC');
  });

  it('restreindre au site change le socle proposé', () => {
    const paris = analyser(JEU_REEL, criteres({ titre: ['Commercial'], site: ['Paris'] }), conditions());
    const metz = analyser(JEU_REEL, criteres({ titre: ['Commercial'], site: ['Metz'] }), conditions());

    expect(paris.membres.length).toBeGreaterThan(0);
    expect(metz.membres.length).toBeGreaterThan(0);
    const codeParis = new Set(paris.lignes.filter((l) => l.retenu).map((l) => l.code));
    const codeMetz = new Set(metz.lignes.filter((l) => l.retenu).map((l) => l.code));
    // Les accès de site diffèrent : c'est tout l'intérêt de « fonction + site ».
    expect(codeParis.has('SITE-BADGE-PAR')).toBe(true);
    expect(codeMetz.has('SITE-BADGE-PAR')).toBe(false);
    expect(codeMetz.has('SITE-BADGE-MTZ')).toBe(true);
  });

  it('une règle par fonction traverse les services', () => {
    // Les notes de frais suivent le métier et non le rattachement : les
    // consultants CRM sont répartis sur deux services et deux sites, et tous
    // les détiennent. Un découpage par service ne pourrait pas le voir.
    const a = analyser(JEU_REEL, criteres({ titre: ['Consultant CRM'] }), conditions());
    expect(a.membres).toHaveLength(9);
    expect(new Set(a.membres.map((m) => m.departement)).size).toBe(2);
    expect(new Set(a.membres.map((m) => m.site)).size).toBe(2);

    const ndf = a.lignes.find((l) => l.code === 'FCT-NDF');
    expect(ndf?.taux).toBe(1);
    expect(ndf?.retenu).toBe(true);
    expect(ndf?.aProvisionner).toEqual([]);
  });
});
