/**
 * Analyseur CSV minimal mais sérieux.
 *
 * Un export d'annuaire arrive rarement propre : séparateur point-virgule sur un
 * poste français et virgule sur un autre, marque d'ordre des octets en tête de
 * fichier, fins de ligne Windows, guillemets doublés, et des libellés qui
 * contiennent eux-mêmes le séparateur. On traite tout ça ici, une fois, plutôt
 * que de découper naïvement sur une virgule et de s'étonner ensuite.
 */

export interface Tableau {
  entetes: string[];
  lignes: Record<string, string>[];
  separateur: string;
}

const SEPARATEURS = [';', ',', '\t', '|'];

/**
 * Devine le séparateur en comptant les occurrences hors guillemets sur la
 * première ligne. Celui qui revient le plus souvent gagne ; à égalité, on suit
 * l'ordre de SEPARATEURS, qui place le point-virgule en premier parce que c'est
 * ce que produit Excel en français.
 */
export function devinerSeparateur(texte: string): string {
  const premiere = texte.slice(0, texte.search(/\r?\n/) + 1 || undefined);
  let meilleur = SEPARATEURS[0] ?? ';';
  let record = 0;

  for (const candidat of SEPARATEURS) {
    let compte = 0;
    let dansGuillemets = false;
    for (const c of premiere) {
      if (c === '"') dansGuillemets = !dansGuillemets;
      else if (c === candidat && !dansGuillemets) compte += 1;
    }
    if (compte > record) {
      record = compte;
      meilleur = candidat;
    }
  }
  return meilleur;
}

/** Découpe le texte en cellules, en respectant les guillemets. */
function cellules(texte: string, separateur: string): string[][] {
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let cellule = '';
  let dansGuillemets = false;

  for (let i = 0; i < texte.length; i += 1) {
    const c = texte[i];

    if (dansGuillemets) {
      if (c === '"') {
        // Deux guillemets consécutifs : un guillemet littéral.
        if (texte[i + 1] === '"') {
          cellule += '"';
          i += 1;
        } else {
          dansGuillemets = false;
        }
      } else {
        cellule += c;
      }
      continue;
    }

    if (c === '"' && cellule === '') dansGuillemets = true;
    else if (c === separateur) {
      ligne.push(cellule);
      cellule = '';
    } else if (c === '\n') {
      ligne.push(cellule);
      lignes.push(ligne);
      ligne = [];
      cellule = '';
    } else if (c !== '\r') {
      cellule += c;
    }
  }

  if (cellule !== '' || ligne.length > 0) {
    ligne.push(cellule);
    lignes.push(ligne);
  }
  return lignes;
}

export function parser(texte: string, separateurImpose?: string): Tableau {
  const propre = texte.replace(/^﻿/, '');
  const separateur = separateurImpose ?? devinerSeparateur(propre);
  const brut = cellules(propre, separateur).filter((l) =>
    l.some((c) => c.trim() !== ''),
  );

  const premiere = brut[0];
  if (!premiere) return { entetes: [], lignes: [], separateur };

  // Un en-tête vide ou en double casserait l'accès par nom : on le rend unique.
  const vus = new Map<string, number>();
  const entetes = premiere.map((e, i) => {
    const base = e.trim() || `colonne_${i + 1}`;
    const deja = vus.get(base) ?? 0;
    vus.set(base, deja + 1);
    return deja === 0 ? base : `${base}_${deja + 1}`;
  });

  const lignes = brut.slice(1).map((cells) => {
    const objet: Record<string, string> = {};
    entetes.forEach((entete, i) => {
      objet[entete] = (cells[i] ?? '').trim();
    });
    return objet;
  });

  return { entetes, lignes, separateur };
}
