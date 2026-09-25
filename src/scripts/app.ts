import {
  arbre,
  automatisable,
  construire,
  factoriser,
  miner,
  resumer,
  valeurs,
  violations,
  CONDITIONS_PAR_DEFAUT,
  type Cohorte,
  type Conditions,
  type DefinitionEquipe,
  type Factorisation,
  type Jeu,
  type Recommandation,
  type Verdict,
  type Violation,
} from '../moteur';

/* ------------------------------------------------------------------ outils -- */

function q<T extends Element>(selecteur: string, racine: ParentNode = document): T {
  const el = racine.querySelector<T>(selecteur);
  if (!el) throw new Error(`élément introuvable : ${selecteur}`);
  return el;
}

/** Tout ce qui vient des données passe par là : un export client peut contenir
 *  n'importe quoi, y compris du balisage. */
function e(valeur: unknown): string {
  return String(valeur).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

const nombre = (n: number) => n.toLocaleString('fr-FR');

function pourcent(taux: number): string {
  const p = taux * 100;
  return `${p >= 99.95 || Number.isInteger(p) ? p.toFixed(0) : p.toFixed(1)} %`;
}

const COULEUR: Record<Verdict, string> = {
  forte: 'var(--forte)',
  'a-revoir': 'var(--revoir)',
  faible: 'var(--faible)',
  ecartee: 'var(--ecartee)',
};

const NOM_VERDICT: Record<Verdict, string> = {
  forte: 'Forte',
  'a-revoir': 'À revoir',
  faible: 'Faible',
  ecartee: 'Écartée',
};

const AIDE_DEFINITION: Record<DefinitionEquipe, string> = {
  departement:
    "L'équipe est le département déclaré dans l'annuaire. C'est le découpage le plus lisible pour le métier.",
  'departement+site':
    'Le même département sur deux sites devient deux équipes. Nécessaire quand les accès dépendent du lieu.',
  responsable:
    "L'équipe est faite des subordonnés directs d'un responsable, sans lui. Le découpage le plus proche du terrain, et le plus fragmenté.",
  titre:
    "Transverse : tous ceux qui exercent la même fonction, quel que soit leur service. C'est ce qui révèle les accès liés au métier et non au rattachement.",
  'titre+site': 'Même fonction, même lieu : le découpage le plus fin des automatismes transverses.',
  site: "Tout le monde sur un même site. Ne sert qu'aux accès d'infrastructure.",
};

/* ------------------------------------------------------------------- état -- */

interface Etat {
  jeu: Jeu;
  cohortes: Cohorte[];
  recos: Recommandation[];
  facto: Factorisation[];
  ecarts: Violation[];
  conditions: Conditions;
}

let etat: Etat | null = null;
let bande = 'automatisables';
const risques = new Set<string>();
const deplies = new Set<string>();

/* --------------------------------------------------- lecture des réglages -- */

function lireConditions(): Conditions {
  const coche = (id: string) => q<HTMLInputElement>(`#${id}`).checked;
  const cochees = (attribut: string): string[] =>
    [...document.querySelectorAll<HTMLInputElement>(`input[data-${attribut}]:checked`)].map(
      (i) => i.value,
    );
  const total = (attribut: string) =>
    document.querySelectorAll(`input[data-${attribut}]`).length;

  const departements = cochees('dept');
  const sites = cochees('site');

  return {
    definitionEquipe: q<HTMLSelectElement>('#definition').value as DefinitionEquipe,
    inclurePrestataires: coche('prestataires'),
    // Tout coché revient à ne pas filtrer : on passe `null` pour l'exprimer.
    departements: departements.length === total('dept') ? null : departements,
    sites: sites.length === total('site') ? null : sites,
    groupesARisque: [...risques],
    tailleMinimale: Math.max(1, Number(q<HTMLInputElement>('#taille').value) || 1),
    exceptionCentPourCent: coche('exception'),
    seuilFort: 100,
    seuilARevoir: Number(q<HTMLInputElement>('#seuil-revoir').value),
    seuilFaible: Number(q<HTMLInputElement>('#seuil-faible').value),
    exclureObsoletes: coche('obsoletes'),
    validerSensibles: coche('sensibles'),
  };
}

/* ------------------------------------------------------------- rendus ----- */

function rendreSynthese(et: Etat): void {
  const r = resumer(et.cohortes, et.recos);
  const population = et.cohortes.reduce((n, c) => n + c.membres.length, 0);
  const exclus = et.jeu.agents.length - population;
  const aValider = et.recos.filter(
    (x) => x.verdict === 'forte' && x.reserves.length > 0,
  ).length;

  q('[data-chiffres]').innerHTML = [
    [nombre(population), 'agents dans le périmètre'],
    [nombre(exclus), 'écartés du périmètre'],
    [`${nombre(r.cohortesMinables)} / ${nombre(r.cohortes)}`, 'équipes minables'],
    [nombre(r.automatisables), 'recommandations automatisables'],
    [nombre(aValider), 'à faire valider par un humain'],
    [nombre(r.provisionnements), 'accès à provisionner sur les « à revoir »'],
  ]
    .map(([v, l]) => `<div class="chiffre"><b>${e(v)}</b><span>${e(l)}</span></div>`)
    .join('');

  const bandes: { v: Verdict; n: number }[] = (
    ['forte', 'a-revoir', 'faible', 'ecartee'] as Verdict[]
  ).map((v) => ({ v, n: et.recos.filter((x) => x.verdict === v).length }));
  const totalObs = bandes.reduce((n, b) => n + b.n, 0) || 1;

  q('[data-total-observations]').textContent =
    `${nombre(totalObs)} couples équipe × accès examinés`;
  q('[data-barre]').innerHTML = bandes
    .map(
      (b) =>
        `<i style="width:${((b.n / totalObs) * 100).toFixed(2)}%;background:${COULEUR[b.v]}" title="${e(NOM_VERDICT[b.v])} : ${b.n}"></i>`,
    )
    .join('');
  q('[data-legende]').innerHTML = bandes
    .map(
      (b) =>
        `<span><i style="background:${COULEUR[b.v]}"></i>${e(NOM_VERDICT[b.v])} — <b>${nombre(b.n)}</b></span>`,
    )
    .join('');

  const parCohorte = new Map<string, Recommandation[]>();
  for (const reco of et.recos) {
    const liste = parCohorte.get(reco.cohorte);
    if (liste) liste.push(reco);
    else parCohorte.set(reco.cohorte, [reco]);
  }

  q('[data-table-cohortes]').innerHTML = `
    <table>
      <thead><tr>
        <th>Équipe</th><th class="num">Effectif</th><th>État</th>
        <th class="num">Accès observés</th><th class="num">Automatisables</th>
      </tr></thead>
      <tbody>
        ${et.cohortes
          .map((c) => {
            const recos = parCohorte.get(c.cle) ?? [];
            const auto = recos.filter(automatisable).length;
            const etatLib = c.aRisque
              ? '<span class="etiquette etiquette--alerte">à risque</span>'
              : c.minable
                ? '<span class="etiquette etiquette--ok">minable</span>'
                : `<span class="etiquette etiquette--ecartee">${e(c.raison ?? 'non minable')}</span>`;
            return `<tr>
              <td>${e(c.libelle)}</td>
              <td class="num">${nombre(c.membres.length)}</td>
              <td>${etatLib}</td>
              <td class="num">${nombre(recos.length)}</td>
              <td class="num">${nombre(auto)}</td>
            </tr>`;
          })
          .join('')}
      </tbody>
    </table>`;
}

function filtrer(recos: Recommandation[]): Recommandation[] {
  if (bande === 'toutes') return recos;
  if (bande === 'automatisables') return recos.filter(automatisable);
  return recos.filter((r) => r.verdict === bande);
}

function rendreRecos(et: Etat): void {
  const visibles = filtrer(et.recos);
  q('[data-compte-recos]').textContent = nombre(et.recos.length);
  q('[data-sous-titre-recos]').textContent =
    `${nombre(visibles.length)} sur ${nombre(et.recos.length)} couples équipe × accès`;

  if (visibles.length === 0) {
    q('[data-table-recos]').innerHTML =
      '<p class="vide">Aucune recommandation dans cette bande, sous ces conditions.</p>';
    return;
  }

  const nomDe = new Map(et.jeu.agents.map((a) => [a.sam, a.nom]));

  q('[data-table-recos]').innerHTML = `
    <table>
      <thead><tr>
        <th>Équipe</th><th>Accès</th><th>Couverture</th>
        <th>Verdict</th><th>Réserves et écart</th>
      </tr></thead>
      <tbody>
        ${visibles
          .map((r) => {
            const id = `${r.cohorte}::${r.acces}`;
            const ouvert = deplies.has(id);
            const manquants = r.manquants
              .map((s) => nomDe.get(s) ?? s)
              .sort((a, b) => a.localeCompare(b, 'fr'));
            return `<tr>
              <td>${e(r.cohorteLibelle)}<br /><span class="reserve" style="font-size:.75rem">${nombre(r.effectif)} personnes</span></td>
              <td>${e(r.accesLibelle)}<br /><code>${e(r.acces)}</code></td>
              <td>
                <span class="jauge">
                  <span class="jauge__piste"><span class="jauge__part" style="width:${(r.taux * 100).toFixed(1)}%;background:${COULEUR[r.verdict]}"></span></span>
                  <b>${pourcent(r.taux)}</b>
                </span>
                <span class="reserve" style="font-size:.75rem">${nombre(r.porteurs)} / ${nombre(r.effectif)}</span>
              </td>
              <td><span class="etiquette etiquette--${r.verdict}">${e(NOM_VERDICT[r.verdict])}</span></td>
              <td>
                ${
                  r.reserves.length > 0
                    ? `<div class="reserves">${r.reserves.map((x) => `<span class="reserve">${e(x)}</span>`).join('')}</div>`
                    : '<span class="reserve">rien à signaler</span>'
                }
                ${
                  manquants.length > 0
                    ? `<button type="button" class="detail" data-detail="${e(id)}">${ouvert ? 'Masquer' : `Voir les ${nombre(manquants.length)} sans l'accès`}</button>
                       ${ouvert ? `<p class="liste-agents">${manquants.map((n) => e(n)).join(' · ')}</p>` : ''}`
                    : ''
                }
              </td>
            </tr>`;
          })
          .join('')}
      </tbody>
    </table>`;
}

function rendreFacto(et: Etat): void {
  const bloquees = et.facto.filter((f) => f.statut === 'bloquee');
  const propres = et.facto.filter((f) => f.statut === 'factorisable');
  q('[data-compte-facto]').textContent = nombre(et.facto.length);

  const nomDe = new Map(et.jeu.agents.map((a) => [a.sam, a.nom]));

  const ligne = (f: Factorisation): string => `
    <article class="noeud">
      <div class="noeud__haut">
        <span class="noeud__nom">${e(f.noeudNom)}</span>
        <span class="noeud__titre">${e(f.noeudTitre)}</span>
        <span class="noeud__droite">
          <span class="reserve" style="font-size:.78rem">${nombre(f.effectif)} personnes · ${nombre(f.equipesCouvertes)} encadrants couverts</span>
          <span class="etiquette etiquette--${f.statut === 'bloquee' ? 'alerte' : 'forte'}">
            ${f.statut === 'bloquee' ? 'remontée bloquée' : 'factorisable'}
          </span>
        </span>
      </div>
      <p class="noeud__acces">
        ${e(f.accesLibelle)} <code>${e(f.acces)}</code>
        ${f.sensible ? ' <span class="etiquette etiquette--a-revoir">sensible</span>' : ''}
        — détenu par ${nombre(f.porteurs)} / ${nombre(f.effectif)} (${pourcent(f.taux)})
      </p>
      ${
        f.bloqueurs.length > 0
          ? `<div class="bloqueurs">
               Bloquée par ${f.bloqueurs
                 .map(
                   (b) =>
                     `<b>l'équipe de ${e(b.nom)}</b> (${nombre(b.effectif)} personnes, ${nombre(b.porteurs)} détenteur${b.porteurs > 1 ? 's' : ''})`,
                 )
                 .join(', ')}.
               Remonter l'accès ici donnerait le droit à
               ${nombre(f.manquants.length)} personne${f.manquants.length > 1 ? 's' : ''}
               qui ne l'${f.manquants.length > 1 ? 'ont' : 'a'} pas :
               ${f.manquants
                 .slice(0, 8)
                 .map((s) => e(nomDe.get(s) ?? s))
                 .join(' · ')}${f.manquants.length > 8 ? ' …' : ''}
             </div>`
          : ''
      }
    </article>`;

  const section = (titre: string, sous: string, liste: Factorisation[]) =>
    liste.length === 0
      ? ''
      : `<div class="carte__entete" style="border-top:1px solid var(--bord)">
           <h3>${e(titre)}</h3><p>${e(sous)}</p>
         </div>
         <div class="facto">${liste.map(ligne).join('')}</div>`;

  const html =
    section(
      `${nombre(bloquees.length)} remontée${bloquees.length > 1 ? 's' : ''} bloquée${bloquees.length > 1 ? 's' : ''}`,
      "Une équipe sous le seuil ne détient pas l'accès : la factorisation lui ferait hériter d'un droit que personne n'a validé pour elle",
      bloquees,
    ) +
    section(
      `${nombre(propres.length)} remontée${propres.length > 1 ? 's' : ''} sans réserve`,
      'Tout le sous-arbre détient déjà cet accès : la remontée ne provisionne rien, elle simplifie',
      propres,
    );

  q('[data-facto]').innerHTML =
    html || '<p class="vide">Aucun accès ne remonte, sous ces conditions.</p>';
}

function rendreEcarts(et: Etat): void {
  q('[data-compte-ecarts]').textContent = nombre(et.ecarts.length);
  if (et.ecarts.length === 0) {
    q('[data-table-ecarts]').innerHTML = '<p class="vide">Aucun écart.</p>';
    return;
  }

  const parSam = new Map(et.jeu.agents.map((a) => [a.sam, a]));

  q('[data-table-ecarts]').innerHTML = `
    <table>
      <thead><tr><th>Agent</th><th>Rattachement</th><th>Accès</th><th>Motif</th></tr></thead>
      <tbody>
        ${et.ecarts
          .map((v) => {
            const a = parSam.get(v.agent);
            return `<tr>
              <td>${e(v.agentNom)}<br /><code>${e(v.agent)}</code></td>
              <td>${e(a?.departement ?? '—')}<br /><span class="reserve" style="font-size:.75rem">${e(a?.site ?? '')}${a?.prestataire ? ' · prestataire' : ''}</span></td>
              <td>${e(v.accesLibelle)}<br /><code>${e(v.acces)}</code></td>
              <td><span class="etiquette etiquette--${v.motif.includes('interdit') ? 'alerte' : 'ecartee'}">${e(v.motif)}</span></td>
            </tr>`;
          })
          .join('')}
      </tbody>
    </table>`;
}

/* ------------------------------------------------------------- pilotage --- */

function calculer(): void {
  if (!etat) return;
  const conditions = lireConditions();
  const cohortes = construire(etat.jeu, conditions);

  etat = {
    ...etat,
    conditions,
    cohortes,
    recos: miner(etat.jeu, cohortes, conditions),
    facto: factoriser(etat.jeu, arbre(etat.jeu, conditions), conditions),
    ecarts: violations(etat.jeu),
  };

  q('[data-aide-definition]').textContent = AIDE_DEFINITION[conditions.definitionEquipe];
  rendreSynthese(etat);
  rendreRecos(etat);
  rendreFacto(etat);
  rendreEcarts(etat);
  rendreRisques(etat);
}

function rendreRisques(et: Etat): void {
  const cible = q('[data-liste-risques]');
  cible.innerHTML = et.cohortes
    .map(
      (c) =>
        `<button type="button" class="pastille" data-risque="${e(c.cle)}" aria-pressed="${risques.has(c.cle)}">${e(c.libelle)}</button>`,
    )
    .join('');
}

function rendreFiltresPopulation(jeu: Jeu): void {
  const compteur = (champ: 'departement' | 'site', v: string) =>
    jeu.agents.filter((a) => a[champ] === v).length;

  q('[data-liste-departements]').innerHTML = valeurs(jeu, 'departement')
    .map(
      (d) =>
        `<label class="case"><input type="checkbox" data-dept value="${e(d)}" checked /><span>${e(d)}</span><em>${compteur('departement', d)}</em></label>`,
    )
    .join('');

  q('[data-liste-sites]').innerHTML = valeurs(jeu, 'site')
    .map(
      (s) =>
        `<label class="case"><input type="checkbox" data-site value="${e(s)}" checked /><span>${e(s)}</span><em>${compteur('site', s)}</em></label>`,
    )
    .join('');
}

function exporter(): void {
  if (!etat) return;
  const lignes = [
    ['Equipe', 'Effectif', 'Acces', 'Libelle', 'Porteurs', 'Taux', 'Verdict', 'Reserves', 'AProvisionner'],
    ...filtrer(etat.recos).map((r) => [
      r.cohorteLibelle,
      String(r.effectif),
      r.acces,
      r.accesLibelle,
      String(r.porteurs),
      (r.taux * 100).toFixed(1),
      NOM_VERDICT[r.verdict],
      r.reserves.join(' ; '),
      r.manquants.join(' '),
    ]),
  ];
  const csv = lignes
    .map((l) => l.map((c) => `"${c.replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');

  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `minage-${bande}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ----------------------------------------------------------- branchements -- */

/**
 * En écran étroit, le panneau de conditions passe au-dessus des résultats. Le
 * laisser déplié repousserait le tableau deux écrans plus bas.
 */
function plierConditions(replie: boolean): void {
  const panneau = q<HTMLElement>('#conditions');
  const bouton = q<HTMLElement>('[data-plier]');
  panneau.dataset.replie = String(replie);
  bouton.textContent = replie ? 'Afficher' : 'Replier';
  bouton.setAttribute('aria-expanded', String(!replie));
}

function basculerConditions(): void {
  plierConditions(q<HTMLElement>('#conditions').dataset.replie !== 'true');
}

function brancher(): void {
  const formulaire = q<HTMLFormElement>('#conditions');
  let minuteur: number | undefined;

  const etroit = window.matchMedia('(max-width: 1000px)');
  plierConditions(etroit.matches);
  etroit.addEventListener('change', (ev) => plierConditions(ev.matches));

  formulaire.addEventListener('input', (ev) => {
    const cible = ev.target;
    if (cible instanceof HTMLInputElement && cible.type === 'range') {
      const sortie = cible.id === 'seuil-revoir' ? '[data-sortie-revoir]' : '[data-sortie-faible]';
      q(sortie).textContent = `${cible.value} %`;
    }
    window.clearTimeout(minuteur);
    minuteur = window.setTimeout(calculer, 120);
  });

  formulaire.addEventListener('click', (ev) => {
    const cible = ev.target;
    if (!(cible instanceof HTMLElement)) return;

    const pastille = cible.closest<HTMLElement>('[data-risque]');
    if (pastille?.dataset.risque !== undefined) {
      const cle = pastille.dataset.risque;
      if (risques.has(cle)) risques.delete(cle);
      else risques.add(cle);
      calculer();
      return;
    }

    if (cible.closest('[data-plier]')) {
      basculerConditions();
      return;
    }

    if (cible.closest('[data-reinit]')) {
      formulaire.reset();
      risques.clear();
      deplies.clear();
      for (const c of formulaire.querySelectorAll<HTMLInputElement>('input[type=checkbox][data-dept], input[type=checkbox][data-site]')) {
        c.checked = true;
      }
      q('[data-sortie-revoir]').textContent = '85 %';
      q('[data-sortie-faible]').textContent = '60 %';
      calculer();
    }
  });

  for (const onglet of document.querySelectorAll<HTMLElement>('[data-onglet]')) {
    onglet.addEventListener('click', () => {
      const nom = onglet.dataset.onglet;
      for (const o of document.querySelectorAll<HTMLElement>('[data-onglet]')) {
        o.setAttribute('aria-selected', String(o === onglet));
      }
      for (const p of document.querySelectorAll<HTMLElement>('[data-panneau]')) {
        p.hidden = p.dataset.panneau !== nom;
      }
    });
  }

  q('[data-filtres-bande]').addEventListener('click', (ev) => {
    const cible = ev.target;
    if (!(cible instanceof HTMLElement)) return;

    if (cible.closest('[data-export]')) {
      exporter();
      return;
    }
    const bouton = cible.closest<HTMLElement>('[data-bande]');
    if (!bouton?.dataset.bande) return;

    bande = bouton.dataset.bande;
    for (const b of document.querySelectorAll<HTMLElement>('[data-bande]')) {
      b.setAttribute('aria-pressed', String(b === bouton));
    }
    if (etat) rendreRecos(etat);
  });

  q('[data-table-recos]').addEventListener('click', (ev) => {
    const cible = ev.target;
    if (!(cible instanceof HTMLElement)) return;
    const bouton = cible.closest<HTMLElement>('[data-detail]');
    if (!bouton?.dataset.detail) return;

    const id = bouton.dataset.detail;
    if (deplies.has(id)) deplies.delete(id);
    else deplies.add(id);
    if (etat) rendreRecos(etat);
  });

  q('[data-theme-bascule]').addEventListener('click', () => {
    const racine = document.documentElement;
    const actuel = racine.dataset.theme;
    const sombre = actuel
      ? actuel === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    racine.dataset.theme = sombre ? 'light' : 'dark';
  });
}

/* ---------------------------------------------------------------- amorce -- */

async function amorcer(): Promise<void> {
  // Le site est publié sous un chemin (/rolemining) : on recolle proprement,
  // que BASE_URL finisse par une barre oblique ou non.
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  const reponse = await fetch(`${base}/donnees/jeu.json`);
  if (!reponse.ok) throw new Error(`jeu.json : ${reponse.status}`);
  const jeu = (await reponse.json()) as Jeu;

  etat = {
    jeu,
    conditions: CONDITIONS_PAR_DEFAUT,
    cohortes: [],
    recos: [],
    facto: [],
    ecarts: [],
  };

  rendreFiltresPopulation(jeu);
  brancher();
  calculer();
}

amorcer().catch((erreur: unknown) => {
  const message = erreur instanceof Error ? erreur.message : String(erreur);
  q('[data-chiffres]').innerHTML =
    `<div class="chiffre"><b>—</b><span>Chargement impossible : ${e(message)}</span></div>`;
});
