import type { Acces, Agent, Jeu } from '../src/moteur/types';

/**
 * Une organisation minuscule, écrite à la main pour que chaque assertion des
 * tests soit vérifiable de tête.
 *
 *   dg ─┬── a  (Responsable commercial) ─┬── a1 (Chef de secteur) ─┬── a11
 *       │                                │                        ├── a12
 *       │                                │                        └── a13
 *       │                                ├── a2  a3  (Commercial)
 *       │                                └── p1  (prestataire)
 *       └── b  (Responsable commercial) ──── b1  b2  (Commercial)
 *
 * Deux niveaux d'encadrement sous dg : il y a donc vraiment quelque chose à
 * factoriser. La branche de b compte trois personnes, sous le seuil de 5 :
 * c'est elle qui bloque la remontée au niveau de dg.
 */

const agent = (
  sam: string,
  nom: string,
  departement: string,
  titre: string,
  responsable: string | null,
  prestataire = false,
  accueil: string | null = null,
): Agent => ({ sam, nom, departement, titre, site: 'Paris', responsable, prestataire, accueil });

export const AGENTS: Agent[] = [
  agent('dg', 'Diane Gérard', 'Direction Générale', 'Président-directeur général', null),
  agent('a', 'Alice Aubert', 'Ventes', 'Responsable commercial', 'dg'),
  agent('a1', 'Amir Un', 'Ventes', 'Chef de secteur', 'a'),
  agent('a11', 'Ana Onze', 'Ventes', 'Commercial', 'a1'),
  agent('a12', 'Ana Douze', 'Ventes', 'Commercial', 'a1'),
  agent('a13', 'Ana Treize', 'Ventes', 'Commercial', 'a1'),
  agent('a2', 'Ana Deux', 'Ventes', 'Commercial', 'a'),
  agent('a3', 'Ana Trois', 'Ventes', 'Commercial', 'a'),
  agent('b', 'Bruno Bonnet', 'Ventes', 'Responsable commercial', 'dg'),
  agent('b1', 'Bea Un', 'Ventes', 'Commercial', 'b'),
  agent('b2', 'Bea Deux', 'Ventes', 'Commercial', 'b'),
  agent('p1', 'Paul Prest', 'Prestataires Externes', 'Commercial', 'a', true, 'Ventes'),
];

export const CATALOGUE: Acces[] = [
  { code: 'SOC-MSG', nom: 'Messagerie', application: 'Messagerie', categorie: 'Socle', sensible: false, interditPrestataire: false },
  { code: 'CRM-LEC', nom: 'CRM — lecture', application: 'CRM', categorie: 'Métier', sensible: false, interditPrestataire: false },
  { code: 'DEVIS', nom: 'Devis', application: 'Devis', categorie: 'Métier', sensible: false, interditPrestataire: false },
  { code: 'PAO', nom: 'Chaîne graphique', application: 'PAO', categorie: 'Métier', sensible: false, interditPrestataire: false },
  { code: 'COFFRE', nom: 'Coffre de secrets', application: 'Sécurité', categorie: 'Sensible', sensible: true, interditPrestataire: true },
  { code: 'OBS', nom: 'GED historique', application: 'Legacy', categorie: 'Obsolète', sensible: false, interditPrestataire: false },
];

const tous = AGENTS.map((a) => a.sam);
/** Tout le département Ventes : a, sa branche, et la branche de b. */
const ventes = ['a', 'a1', 'a11', 'a12', 'a13', 'a2', 'a3', 'b', 'b1', 'b2'];
/** La branche de a seulement : le sous-arbre que DEVIS couvre entièrement. */
const brancheA = ['a', 'a1', 'a11', 'a12', 'a13', 'a2', 'a3'];

export const JEU: Jeu = {
  agents: AGENTS,
  catalogue: CATALOGUE,
  attributions: Object.fromEntries(
    tous.map((sam) => {
      const codes: string[] = ['SOC-MSG'];
      if (sam === 'dg' || ventes.includes(sam)) codes.push('CRM-LEC');
      if (sam === 'dg' || brancheA.includes(sam)) codes.push('DEVIS');
      if (sam === 'a11') codes.push('PAO');
      if (sam === 'dg' || sam === 'p1') codes.push('COFFRE');
      if (sam === 'b2') codes.push('OBS');
      return [sam, codes];
    }),
  ),
};
