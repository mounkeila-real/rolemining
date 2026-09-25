import type { Tableau } from './csv';
import type { Acces, Agent, Jeu } from './types';

/**
 * Reconstruction d'un jeu de minage à partir des exports du client.
 *
 * L'outil ne demande que deux fichiers : l'annuaire et les appartenances. Les
 * noms de colonnes changent d'un annuaire à l'autre, donc on les devine, puis on
 * laisse l'utilisateur corriger la correspondance — deviner est un confort, pas
 * une certitude, et se tromper en silence sur la colonne « responsable »
 * fausserait toute la hiérarchie.
 *
 * Rien ne sort du navigateur : les fichiers sont lus par l'API FileReader et
 * restent en mémoire le temps de la session.
 */

export interface Diagnostic {
  niveau: 'info' | 'attention' | 'erreur';
  message: string;
}

export interface Correspondance {
  identifiant: string;
  nom: string;
  departement: string;
  titre: string;
  site: string;
  responsable: string;
  dn: string;
}

export interface CorrespondanceHabilitations {
  agent: string;
  acces: string;
}

/** Garde-fous : au-delà, on refuse plutôt que de figer le navigateur. */
export const LIMITE_AGENTS = 50_000;
export const LIMITE_ATTRIBUTIONS = 500_000;

const ALIAS_ANNUAIRE: Record<keyof Correspondance, string[]> = {
  identifiant: ['samaccountname', 'sam', 'login', 'identifiant', 'uid', 'matricule',
    'employeeid', 'userprincipalname', 'upn', 'utilisateur', 'user', 'compte'],
  nom: ['displayname', 'name', 'nomcomplet', 'nom complet', 'fullname', 'cn', 'nom'],
  departement: ['department', 'departement', 'service', 'direction', 'entite', 'equipe'],
  titre: ['title', 'jobtitle', 'titre', 'fonction', 'intitule', 'poste', 'emploi'],
  site: ['physicaldeliveryofficename', 'office', 'site', 'localisation', 'etablissement',
    'implantation', 'agence', 'ville', 'city', 'bureau'],
  responsable: ['manager', 'responsable', 'superieur', 'reportsto', 'chef', 'managerdn'],
  dn: ['distinguishedname', 'dn'],
};

const ALIAS_HABILITATIONS: Record<keyof CorrespondanceHabilitations, string[]> = {
  agent: ['samaccountname', 'sam', 'login', 'identifiant', 'utilisateur', 'user',
    'membre', 'member', 'agent', 'uid', 'matricule'],
  acces: ['acces', 'access', 'groupe', 'group', 'droit', 'role', 'permission',
    'entitlement', 'habilitation', 'memberof', 'code'],
};

function replier(texte: string): string {
  return texte
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Cherche l'en-tête qui correspond le mieux. Égalité exacte d'abord : sans ça,
 * « managername » l'emporterait sur « manager » par simple inclusion.
 */
function choisir(entetes: string[], alias: string[]): string {
  const replies = entetes.map((e) => ({ brut: e, replie: replier(e) }));
  for (const a of alias) {
    const exact = replies.find((e) => e.replie === replier(a));
    if (exact) return exact.brut;
  }
  for (const a of alias) {
    const partiel = replies.find((e) => e.replie.includes(replier(a)));
    if (partiel) return partiel.brut;
  }
  return '';
}

export function detecterAnnuaire(entetes: string[]): Correspondance {
  const c = {} as Correspondance;
  for (const champ of Object.keys(ALIAS_ANNUAIRE) as (keyof Correspondance)[]) {
    c[champ] = choisir(entetes, ALIAS_ANNUAIRE[champ]);
  }
  // Deux champs ne peuvent pas viser la même colonne, sauf l'identifiant et le
  // nom quand l'annuaire n'en propose qu'un.
  if (c.departement && c.departement === c.titre) c.titre = '';
  if (c.responsable && c.responsable === c.dn) c.responsable = '';
  return c;
}

export function detecterHabilitations(entetes: string[]): CorrespondanceHabilitations {
  const agent = choisir(entetes, ALIAS_HABILITATIONS.agent);
  let acces = choisir(entetes, ALIAS_HABILITATIONS.acces);
  if (acces === agent) acces = '';
  // Deux colonnes sans en-tête reconnaissable : on prend l'ordre naturel.
  return {
    agent: agent || entetes[0] || '',
    acces: acces || entetes.find((e) => e !== (agent || entetes[0])) || '',
  };
}

export interface OptionsImport {
  annuaire: Tableau;
  habilitations: Tableau;
  catalogue?: Tableau;
  correspondance: Correspondance;
  correspondanceHabilitations: CorrespondanceHabilitations;
  /** Départements dont les membres sont traités comme des prestataires. */
  departementsPrestataires: string[];
}

export interface ResultatImport {
  jeu: Jeu;
  diagnostics: Diagnostic[];
}

/** Départements qui ressemblent à de la prestation, pour une proposition par défaut. */
export function devinerPrestataires(departements: string[]): string[] {
  // On replie les accents avant de comparer : « Intérim » doit être reconnu
  // aussi bien que « Interim ».
  return departements.filter((d) =>
    /prestataire|presta|contractor|1099|externe|soustrait|interim|freelance/.test(
      replier(d),
    ),
  );
}

export function construire(options: OptionsImport): ResultatImport {
  const {
    annuaire, habilitations, catalogue, correspondance: m,
    correspondanceHabilitations: mh, departementsPrestataires,
  } = options;
  const diagnostics: Diagnostic[] = [];

  if (!m.identifiant) {
    return {
      jeu: { agents: [], catalogue: [], attributions: {} },
      diagnostics: [{ niveau: 'erreur', message: "Aucune colonne d'identifiant n'est désignée dans l'annuaire." }],
    };
  }
  if (annuaire.lignes.length > LIMITE_AGENTS) {
    return {
      jeu: { agents: [], catalogue: [], attributions: {} },
      diagnostics: [{
        niveau: 'erreur',
        message: `L'annuaire compte ${annuaire.lignes.length.toLocaleString('fr-FR')} lignes, au-delà de la limite de ${LIMITE_AGENTS.toLocaleString('fr-FR')} que cet outil traite dans un navigateur.`,
      }],
    };
  }

  // --- agents ---
  const agents: Agent[] = [];
  const parSam = new Map<string, Agent>();
  const parDn = new Map<string, string>();
  const parNom = new Map<string, string>();
  const managerBrut = new Map<string, string>();
  let sansIdentifiant = 0;
  let doublons = 0;

  const prestataires = new Set(departementsPrestataires);

  for (const ligne of annuaire.lignes) {
    const sam = (ligne[m.identifiant] ?? '').trim();
    if (!sam) {
      sansIdentifiant += 1;
      continue;
    }
    if (parSam.has(sam)) {
      doublons += 1;
      continue;
    }

    const nom = (m.nom ? ligne[m.nom] : '') || sam;
    const departement = (m.departement ? ligne[m.departement] : '') || 'Sans département';

    const agent: Agent = {
      sam,
      nom,
      departement,
      titre: (m.titre ? ligne[m.titre] : '') || 'Sans intitulé',
      site: (m.site ? ligne[m.site] : '') || 'Sans site',
      responsable: null,
      prestataire: prestataires.has(departement),
      accueil: null,
    };

    agents.push(agent);
    parSam.set(sam, agent);
    if (m.dn && ligne[m.dn]) parDn.set((ligne[m.dn] ?? '').toLowerCase(), sam);
    if (!parNom.has(nom.toLowerCase())) parNom.set(nom.toLowerCase(), sam);
    if (m.responsable) managerBrut.set(sam, (ligne[m.responsable] ?? '').trim());
  }

  if (sansIdentifiant > 0) {
    diagnostics.push({
      niveau: 'attention',
      message: `${sansIdentifiant} ligne(s) sans identifiant, ignorée(s).`,
    });
  }
  if (doublons > 0) {
    diagnostics.push({
      niveau: 'attention',
      message: `${doublons} identifiant(s) en double, seule la première occurrence est retenue.`,
    });
  }

  // --- hiérarchie ---
  // La colonne responsable contient selon les annuaires un nom distinctif, un
  // identifiant ou un nom affiché. On essaie les trois, dans cet ordre.
  let nonResolus = 0;
  const exemplesNonResolus: string[] = [];

  for (const [sam, brut] of managerBrut) {
    if (!brut) continue;
    const agent = parSam.get(sam);
    if (!agent) continue;

    let cible = parDn.get(brut.toLowerCase());
    if (!cible && /^cn=/i.test(brut)) {
      const cn = brut.slice(3).split(',')[0]?.trim().toLowerCase() ?? '';
      cible = parNom.get(cn);
    }
    if (!cible) cible = parSam.has(brut) ? brut : undefined;
    if (!cible) cible = parNom.get(brut.toLowerCase());

    if (cible && cible !== sam) agent.responsable = cible;
    else {
      nonResolus += 1;
      if (exemplesNonResolus.length < 3) exemplesNonResolus.push(brut);
    }
  }

  if (nonResolus > 0) {
    diagnostics.push({
      niveau: 'attention',
      message: `${nonResolus} responsable(s) introuvable(s) dans l'annuaire — ces agents seront traités comme des racines. Exemples : ${exemplesNonResolus.join(', ')}.`,
    });
  }

  for (const agent of agents) {
    if (agent.prestataire && agent.responsable) {
      agent.accueil = parSam.get(agent.responsable)?.departement ?? null;
    }
  }

  const racines = agents.filter((a) => a.responsable === null).length;
  if (racines > 1) {
    diagnostics.push({
      niveau: 'info',
      message: `${racines} agents sans responsable : la hiérarchie est une forêt, la factorisation remontera jusqu'à chacune de ces racines.`,
    });
  }

  // --- catalogue déclaré, s'il y en a un ---
  const declares = new Map<string, Acces>();
  if (catalogue && catalogue.lignes.length > 0) {
    const e = catalogue.entetes;
    const col = {
      code: choisir(e, ['code', 'acces', 'groupe', 'group', 'identifiant']),
      nom: choisir(e, ['libelle', 'nom', 'label', 'description']),
      application: choisir(e, ['application', 'app', 'systeme', 'outil']),
      categorie: choisir(e, ['categorie', 'category', 'type', 'famille']),
      sensible: choisir(e, ['sensible', 'sensitive', 'critique']),
      interdit: choisir(e, ['interditprestataire', 'interdit', 'forbidden']),
    };
    const vrai = (v: string) => /^(1|true|vrai|oui|o|y|yes|x)$/i.test(v.trim());

    for (const ligne of catalogue.lignes) {
      const code = (col.code ? ligne[col.code] : '')?.trim();
      if (!code) continue;
      const categorie = (col.categorie ? ligne[col.categorie] : '') ?? '';
      declares.set(code, {
        code,
        nom: (col.nom ? ligne[col.nom] : '') || code,
        application: (col.application ? ligne[col.application] : '') || '—',
        categorie: (['Socle', 'Site', 'Fonction', 'Métier', 'Sensible', 'Obsolète'] as const)
          .find((c) => replier(c) === replier(categorie)) ?? 'Métier',
        sensible: col.sensible ? vrai(ligne[col.sensible] ?? '') : false,
        interditPrestataire: col.interdit ? vrai(ligne[col.interdit] ?? '') : false,
      });
    }
    diagnostics.push({
      niveau: 'info',
      message: `Catalogue fourni : ${declares.size} accès décrits (libellé, sensibilité, interdiction aux prestataires).`,
    });
  }

  // --- attributions ---
  const attributions: Record<string, string[]> = {};
  const vus = new Map<string, Set<string>>();
  const codesRencontres = new Set<string>();
  let inconnus = 0;
  let total = 0;

  if (habilitations.lignes.length > LIMITE_ATTRIBUTIONS) {
    diagnostics.push({
      niveau: 'erreur',
      message: `Le fichier d'habilitations compte ${habilitations.lignes.length.toLocaleString('fr-FR')} lignes, au-delà de la limite de ${LIMITE_ATTRIBUTIONS.toLocaleString('fr-FR')}.`,
    });
  } else {
    for (const ligne of habilitations.lignes) {
      const sam = (mh.agent ? ligne[mh.agent] : '')?.trim() ?? '';
      const code = (mh.acces ? ligne[mh.acces] : '')?.trim() ?? '';
      if (!sam || !code) continue;

      const cible = parSam.has(sam)
        ? sam
        : (parNom.get(sam.toLowerCase()) ?? parDn.get(sam.toLowerCase()));
      if (!cible) {
        inconnus += 1;
        continue;
      }

      let deja = vus.get(cible);
      if (!deja) {
        deja = new Set();
        vus.set(cible, deja);
        attributions[cible] = [];
      }
      if (deja.has(code)) continue;
      deja.add(code);
      attributions[cible]?.push(code);
      codesRencontres.add(code);
      total += 1;
    }
  }

  if (inconnus > 0) {
    diagnostics.push({
      niveau: 'attention',
      message: `${inconnus} attribution(s) visent un agent absent de l'annuaire, ignorée(s).`,
    });
  }

  for (const codes of Object.values(attributions)) codes.sort();

  const catalogueFinal: Acces[] = [...codesRencontres].sort().map(
    (code) =>
      declares.get(code) ?? {
        code,
        nom: code,
        application: '—',
        categorie: 'Métier' as const,
        sensible: false,
        interditPrestataire: false,
      },
  );

  const nonDecrits = catalogueFinal.filter((a) => !declares.has(a.code)).length;
  if (declares.size > 0 && nonDecrits > 0) {
    diagnostics.push({
      niveau: 'attention',
      message: `${nonDecrits} accès rencontrés ne figurent pas dans le catalogue fourni : ils sont traités comme des accès métier ordinaires, ni sensibles ni interdits.`,
    });
  }

  diagnostics.unshift({
    niveau: 'info',
    message: `${agents.length.toLocaleString('fr-FR')} agents, ${catalogueFinal.length.toLocaleString('fr-FR')} accès, ${total.toLocaleString('fr-FR')} attributions.`,
  });

  return { jeu: { agents, catalogue: catalogueFinal, attributions }, diagnostics };
}
