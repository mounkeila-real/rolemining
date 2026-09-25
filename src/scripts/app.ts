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
import { parser, type Tableau } from '../moteur/csv';
import {
  construire as construireDepuisCsv,
  detecterAnnuaire,
  detecterHabilitations,
  devinerPrestataires,
  type Correspondance,
  type CorrespondanceHabilitations,
  type Diagnostic,
} from '../moteur/importation';
import {
  analyser,
  decrire,
  figer,
  type Analyse,
  type Attribut,
  type Critere,
} from '../moteur/regles';

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

/* --------------------------------------------------- assistant de règles -- */

/**
 * L'assistant prend le problème par l'autre bout : au lieu de subir le découpage
 * de l'entreprise, on désigne une population par ses attributs — tous les
 * consultants CRM, ou tous les commerciaux de Metz — et on regarde ce qu'elle
 * détient pour en faire une règle.
 *
 * Les conditions posées à gauche s'appliquent ici aussi : mêmes seuils, même
 * traitement des prestataires, même exigence de validation sur les accès
 * sensibles. Une règle transverse n'est pas une porte dérobée.
 */

const ATTRIBUTS: [Attribut, string][] = [
  ['departement', 'Service'],
  ['titre', 'Fonction'],
  ['site', 'Site'],
];

const criteresAssistant: Critere[] = ATTRIBUTS.map(([attribut]) => ({
  attribut,
  valeurs: [],
}));
/** `undefined` = on suit la proposition de l'outil ; un ensemble = l'utilisateur a tranché. */
let retenusAssistant: Set<string> | undefined;
let analyseCourante: Analyse | null = null;

function rendrePickers(jeu: Jeu): void {
  q('[data-pickers]').innerHTML = ATTRIBUTS.map(([attribut, libelle]) => {
    const compte = new Map<string, number>();
    for (const a of jeu.agents) {
      compte.set(a[attribut], (compte.get(a[attribut]) ?? 0) + 1);
    }
    const valeursTriees = [...compte.keys()].sort((a, b) => a.localeCompare(b, 'fr'));

    return `
      <div class="picker">
        <p class="mappage__t">${e(libelle)}</p>
        <input type="search" class="picker__filtre" data-filtre="${attribut}"
               placeholder="Filtrer — ${valeursTriees.length} valeurs" />
        <div class="picker__liste" data-valeurs="${attribut}">
          ${valeursTriees
            .map(
              (v) => `<label class="case" data-item>
                <input type="checkbox" data-val="${attribut}" value="${e(v)}" />
                <span>${e(v)}</span><em>${nombre(compte.get(v) ?? 0)}</em>
              </label>`,
            )
            .join('')}
        </div>
      </div>`;
  }).join('');
}

function rendreAssistant(et: Etat): void {
  const analyse = analyser(et.jeu, criteresAssistant, et.conditions, retenusAssistant);
  analyseCourante = analyse;

  const services = new Set(analyse.membres.map((m) => m.departement)).size;
  const sites = new Set(analyse.membres.map((m) => m.site)).size;
  const sousLeSeuil = analyse.membres.length < et.conditions.tailleMinimale;

  q('[data-population]').innerHTML = `
    <span><b>${nombre(analyse.membres.length)}</b> personnes visées</span>
    <span><b>${nombre(services)}</b> service${services > 1 ? 's' : ''}</span>
    <span><b>${nombre(sites)}</b> site${sites > 1 ? 's' : ''}</span>
    ${analyse.ecartes.length > 0 ? `<span><b>${nombre(analyse.ecartes.length)}</b> prestataire${analyse.ecartes.length > 1 ? 's' : ''} écarté${analyse.ecartes.length > 1 ? 's' : ''}</span>` : ''}
    <span>${e(decrire(criteresAssistant))}</span>
    ${sousLeSeuil && analyse.membres.length > 0 ? `<span class="population__alerte">population sous le seuil de ${et.conditions.tailleMinimale} : aucune proposition automatique</span>` : ''}`;

  const retenues = analyse.lignes.filter((l) => l.retenu);
  q('[data-sous-titre-regle]').textContent =
    analyse.membres.length === 0
      ? 'Aucune personne ne répond à ces critères'
      : `${nombre(retenues.length)} accès retenus sur ${nombre(analyse.lignes.length)} observés`;

  q('[data-table-regle]').innerHTML =
    analyse.lignes.length === 0
      ? '<p class="vide">Désignez une population à l\'étape 1.</p>'
      : `<table>
          <thead><tr>
            <th></th><th>Accès</th><th>Couverture</th><th>À provisionner</th><th>Réserves</th>
          </tr></thead>
          <tbody>
            ${analyse.lignes
              .map(
                (l) => `<tr>
                  <td><input type="checkbox" data-acces-regle="${e(l.code)}" ${l.retenu ? 'checked' : ''} /></td>
                  <td>${e(l.libelle)}<br /><code>${e(l.code)}</code>
                      <span class="reserve" style="font-size:.74rem">${e(l.application)}</span></td>
                  <td>
                    <span class="jauge">
                      <span class="jauge__piste"><span class="jauge__part" style="width:${(l.taux * 100).toFixed(1)}%;background:${l.taux === 1 ? 'var(--forte)' : l.taux >= 0.85 ? 'var(--revoir)' : 'var(--ecartee)'}"></span></span>
                      <b>${pourcent(l.taux)}</b>
                    </span>
                    <span class="reserve" style="font-size:.75rem">${nombre(l.detenteurs)} / ${nombre(l.effectif)}</span>
                  </td>
                  <td class="num">${l.aProvisionner.length === 0 ? '—' : nombre(l.aProvisionner.length)}</td>
                  <td>${
                    l.reserves.length > 0
                      ? `<div class="reserves">${l.reserves.map((r) => `<span class="reserve">${e(r)}</span>`).join('')}</div>`
                      : '<span class="reserve">rien à signaler</span>'
                  }</td>
                </tr>`,
              )
              .join('')}
          </tbody>
        </table>`;

  const actions = retenues.reduce((n, l) => n + l.aProvisionner.length, 0);
  const agents = new Set(retenues.flatMap((l) => l.aProvisionner)).size;
  const sousReserve = retenues.filter((l) => l.reserves.length > 0).length;

  q('[data-impact]').innerHTML = [
    [nombre(analyse.membres.length), 'personnes visées'],
    [nombre(retenues.length), 'accès dans la règle'],
    [nombre(actions), 'provisionnements'],
    [nombre(agents), 'personnes à modifier'],
    [nombre(sousReserve), 'accès retenus malgré une réserve'],
  ]
    .map(([v, l]) => `<div class="chiffre"><b>${e(v)}</b><span>${e(l)}</span></div>`)
    .join('');

  const nomDe = new Map(et.jeu.agents.map((a) => [a.sam, a.nom]));
  const apercu = retenues
    .filter((l) => l.aProvisionner.length > 0)
    .slice(0, 6)
    .map(
      (l) =>
        `<p class="reserve">${e(l.libelle)} → ${l.aProvisionner
          .slice(0, 5)
          .map((s) => e(nomDe.get(s) ?? s))
          .join(' · ')}${l.aProvisionner.length > 5 ? ` … et ${nombre(l.aProvisionner.length - 5)} autres` : ''}</p>`,
    )
    .join('');

  q('[data-apercu-regle]').innerHTML = apercu
    ? `<div class="liste-agents">${apercu}</div>`
    : actions === 0 && retenues.length > 0
      ? '<p class="reserve">Aucun provisionnement : la règle ne fait que constater ce qui est déjà en place.</p>'
      : '';
}

function nomRegleCourant(): string {
  const saisi = q<HTMLInputElement>('[data-nom-regle]').value.trim();
  return saisi || decrire(criteresAssistant);
}

function exporterRegle(format: 'csv' | 'json'): void {
  if (!etat || !analyseCourante) return;
  const regle = figer(nomRegleCourant(), criteresAssistant, analyseCourante);
  const fichier = slugifier(regle.nom);

  if (format === 'json') {
    telecharger(
      `regle-${fichier}.json`,
      JSON.stringify({ ...regle, population: decrire(criteresAssistant) }, null, 2),
      'application/json',
    );
    return;
  }

  const nomDe = new Map(etat.jeu.agents.map((a) => [a.sam, a.nom]));
  const libelleDe = new Map(etat.jeu.catalogue.map((a) => [a.code, a.nom]));
  telecharger(
    `regle-${fichier}.csv`,
    versCsv([
      ['Regle', 'Population', 'Identifiant', 'Nom', 'Acces', 'Libelle'],
      ...regle.provisionnements.map((p) => [
        regle.nom,
        decrire(criteresAssistant),
        p.agent,
        nomDe.get(p.agent) ?? p.agent,
        p.acces,
        libelleDe.get(p.acces) ?? p.acces,
      ]),
    ]),
    'text/csv',
  );
}

function brancherAssistant(): void {
  const panneau = q<HTMLElement>('[data-panneau="assistant"]');

  panneau.addEventListener('input', (ev) => {
    const cible = ev.target;
    if (!(cible instanceof HTMLInputElement)) return;

    // Le filtre ne touche pas au calcul : il masque des lignes, c'est tout.
    if (cible.dataset.filtre) {
      const terme = cible.value.trim().toLowerCase();
      const liste = panneau.querySelector(`[data-valeurs="${cible.dataset.filtre}"]`);
      for (const item of liste?.querySelectorAll<HTMLElement>('[data-item]') ?? []) {
        item.hidden = terme !== '' && !(item.textContent ?? '').toLowerCase().includes(terme);
      }
    }
  });

  panneau.addEventListener('change', (ev) => {
    const cible = ev.target;
    if (!(cible instanceof HTMLInputElement) || !etat) return;

    if (cible.dataset.val) {
      const critere = criteresAssistant.find((c) => c.attribut === cible.dataset.val);
      if (!critere) return;
      critere.valeurs = cible.checked
        ? [...critere.valeurs, cible.value]
        : critere.valeurs.filter((v) => v !== cible.value);
      // La population change : la sélection d'accès précédente n'a plus de sens.
      retenusAssistant = undefined;
      rendreAssistant(etat);
      return;
    }

    if (cible.dataset.accesRegle) {
      if (!retenusAssistant) {
        retenusAssistant = new Set(
          (analyseCourante?.lignes ?? []).filter((l) => l.retenu).map((l) => l.code),
        );
      }
      if (cible.checked) retenusAssistant.add(cible.dataset.accesRegle);
      else retenusAssistant.delete(cible.dataset.accesRegle);
      rendreAssistant(etat);
    }
  });

  panneau.addEventListener('click', (ev) => {
    const cible = ev.target;
    if (!(cible instanceof HTMLElement) || !etat) return;

    if (cible.closest('[data-regle-auto]')) {
      retenusAssistant = undefined;
      rendreAssistant(etat);
    } else if (cible.closest('[data-regle-vide]')) {
      retenusAssistant = new Set();
      rendreAssistant(etat);
    } else if (cible.closest('[data-export-regle-json]')) {
      exporterRegle('json');
    } else if (cible.closest('[data-export-regle]')) {
      exporterRegle('csv');
    }
  });
}

/* ------------------------------------------------------- import de données -- */

/**
 * Chargement d'une extraction du client. Les fichiers sont lus par le navigateur
 * et ne partent nulle part — il n'y a pas de serveur à qui les envoyer.
 *
 * La détection des colonnes est proposée, jamais imposée : se tromper en silence
 * sur la colonne « responsable » fausserait toute la hiérarchie, donc la
 * correspondance reste affichée et modifiable avant le chargement.
 */

const CHAMPS_ANNUAIRE: [keyof Correspondance, string, boolean][] = [
  ['identifiant', 'Identifiant', true],
  ['nom', 'Nom affiché', false],
  ['departement', 'Service ou département', false],
  ['titre', 'Fonction', false],
  ['site', 'Site', false],
  ['responsable', 'Responsable', false],
  ['dn', 'Nom distinctif (DN)', false],
];

const fichiers: { annuaire?: Tableau; habilitations?: Tableau; catalogue?: Tableau } = {};
let mapAnnuaire: Correspondance | null = null;
let mapHabilitations: CorrespondanceHabilitations | null = null;
const prestatairesImport = new Set<string>();
let jeuDemo: Jeu | null = null;
let origineJeu = 'Jeu de démonstration — organisation Contoso francisée, habilitations générées';

function optionsColonnes(entetes: string[], choisi: string, obligatoire: boolean): string {
  const vide = obligatoire ? '' : `<option value=""${choisi ? '' : ' selected'}>— absente —</option>`;
  return (
    vide +
    entetes
      .map((h) => `<option value="${e(h)}"${h === choisi ? ' selected' : ''}>${e(h)}</option>`)
      .join('')
  );
}

function rendreMappage(): void {
  const cible = q('[data-mappage]');
  if (!fichiers.annuaire || !mapAnnuaire) {
    cible.innerHTML = '';
    return;
  }

  const annuaire = fichiers.annuaire;
  const m = mapAnnuaire;
  const blocHab =
    fichiers.habilitations && mapHabilitations
      ? `<div>
           <p class="mappage__t">Colonnes des habilitations</p>
           <div class="mappage__grille">
             <label>Agent
               <select data-maph="agent"${mapHabilitations.agent ? '' : ' data-manquant'}>
                 ${optionsColonnes(fichiers.habilitations.entetes, mapHabilitations.agent, true)}
               </select>
             </label>
             <label>Accès
               <select data-maph="acces"${mapHabilitations.acces ? '' : ' data-manquant'}>
                 ${optionsColonnes(fichiers.habilitations.entetes, mapHabilitations.acces, true)}
               </select>
             </label>
           </div>
         </div>`
      : '';

  cible.innerHTML = `
    <div class="mappage">
      <div>
        <p class="mappage__t">Colonnes de l'annuaire — corrigez si la détection s'est trompée</p>
        <div class="mappage__grille">
          ${CHAMPS_ANNUAIRE.map(
            ([champ, libelle, obligatoire]) => `
            <label>${e(libelle)}${obligatoire ? ' *' : ''}
              <select data-map="${champ}"${obligatoire && !m[champ] ? ' data-manquant' : ''}>
                ${optionsColonnes(annuaire.entetes, m[champ], obligatoire)}
              </select>
            </label>`,
          ).join('')}
        </div>
      </div>
      ${blocHab}
    </div>`;
}

function rendrePrestatairesImport(): void {
  const cible = q('[data-prestataires-import]');
  if (!fichiers.annuaire || !mapAnnuaire?.departement) {
    cible.innerHTML = '';
    return;
  }

  const colonne = mapAnnuaire.departement;
  const departements = [
    ...new Set(fichiers.annuaire.lignes.map((l) => (l[colonne] ?? '').trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, 'fr'));

  cible.innerHTML = `
    <div class="mappage">
      <p class="mappage__t">Quels services sont de la prestation ?</p>
      <div class="pastilles">
        ${departements
          .map(
            (d) =>
              `<button type="button" class="pastille" data-presta-import="${e(d)}" aria-pressed="${prestatairesImport.has(d)}">${e(d)}</button>`,
          )
          .join('')}
      </div>
      <p class="aide" style="margin:0">
        Leurs membres seront écartés du minage par défaut, comme dans le jeu de
        démonstration.
      </p>
    </div>`;
}

function majBoutonCharger(): void {
  const pret = Boolean(
    fichiers.annuaire &&
      fichiers.habilitations &&
      mapAnnuaire?.identifiant &&
      mapHabilitations?.agent &&
      mapHabilitations?.acces,
  );
  q<HTMLButtonElement>('[data-charger]').disabled = !pret;
}

function rendreDiagnostics(liste: Diagnostic[]): void {
  q('[data-diagnostics]').innerHTML =
    liste.length === 0
      ? ''
      : `<div class="diagnostics">${liste
          .map((d) => `<p class="diagnostic diagnostic--${d.niveau}">${e(d.message)}</p>`)
          .join('')}</div>`;
}

function rendreDonnees(et: Etat): void {
  q('[data-origine-jeu]').textContent = origineJeu;
  q<HTMLElement>('[data-jeu-demo]').hidden = jeuDemo === null || et.jeu === jeuDemo;

  const attributions = Object.values(et.jeu.attributions).reduce((n, c) => n + c.length, 0);
  q('[data-chiffres-jeu]').innerHTML = [
    [nombre(et.jeu.agents.length), 'agents'],
    [nombre(et.jeu.agents.filter((a) => a.prestataire).length), 'prestataires'],
    [nombre(new Set(et.jeu.agents.map((a) => a.departement)).size), 'services'],
    [nombre(new Set(et.jeu.agents.map((a) => a.site)).size), 'sites'],
    [nombre(et.jeu.catalogue.length), 'accès au catalogue'],
    [nombre(attributions), 'attributions'],
  ]
    .map(([v, l]) => `<div class="chiffre"><b>${e(v)}</b><span>${e(l)}</span></div>`)
    .join('');

  const porteurs = new Map<string, number>();
  for (const codes of Object.values(et.jeu.attributions)) {
    for (const code of codes) porteurs.set(code, (porteurs.get(code) ?? 0) + 1);
  }

  rendrePopulation(et);

  q('[data-compte-catalogue]').textContent = `${nombre(et.jeu.catalogue.length)} accès`;
  q('[data-table-catalogue]').innerHTML = `
    <table>
      <thead><tr>
        <th>Code</th><th>Libellé</th><th>Application</th><th>Catégorie</th>
        <th class="num">Détenteurs</th><th>Marqueurs</th>
      </tr></thead>
      <tbody>
        ${et.jeu.catalogue
          .map(
            (a) => `<tr>
              <td><code>${e(a.code)}</code></td>
              <td>${e(a.nom)}</td>
              <td>${e(a.application)}</td>
              <td>${e(a.categorie)}</td>
              <td class="num">${nombre(porteurs.get(a.code) ?? 0)}</td>
              <td>
                ${a.sensible ? '<span class="etiquette etiquette--a-revoir">sensible</span> ' : ''}
                ${a.interditPrestataire ? '<span class="etiquette etiquette--alerte">interdit aux prestataires</span>' : ''}
              </td>
            </tr>`,
          )
          .join('')}
      </tbody>
    </table>`;
}

/**
 * Les données brutes, telles qu'elles sont entrées dans l'outil.
 *
 * Un calcul d'habilitations que l'on ne peut pas recouper ne vaut rien : on doit
 * pouvoir descendre de « 93 % des commerciaux détiennent cet accès » jusqu'à la
 * ligne d'annuaire d'une personne et la liste exacte de ses droits.
 */
const PLAFOND_POPULATION = 200;
let filtrePopulation = '';
let agentDeplie: string | null = null;

function rendrePopulation(et: Etat): void {
  const terme = filtrePopulation.trim().toLowerCase();
  const nomDe = new Map(et.jeu.agents.map((a) => [a.sam, a.nom]));

  const correspond = (sam: string) => {
    if (terme === '') return true;
    const a = et.jeu.agents.find((x) => x.sam === sam);
    if (!a) return false;
    const champs = [
      a.sam, a.nom, a.departement, a.titre, a.site,
      a.prestataire ? 'prestataire' : '',
      ...(et.jeu.attributions[a.sam] ?? []),
    ];
    return champs.some((c) => c.toLowerCase().includes(terme));
  };

  const trouves = et.jeu.agents.filter((a) => correspond(a.sam));
  const affiches = trouves.slice(0, PLAFOND_POPULATION);

  q('[data-compte-population]').textContent =
    trouves.length === et.jeu.agents.length
      ? `${nombre(et.jeu.agents.length)} agents`
      : `${nombre(trouves.length)} agents sur ${nombre(et.jeu.agents.length)}`;

  q('[data-table-population]').innerHTML =
    trouves.length === 0
      ? '<p class="vide">Aucun agent ne correspond à cette recherche.</p>'
      : `<table>
          <thead><tr>
            <th>Agent</th><th>Service</th><th>Fonction</th><th>Site</th>
            <th>Responsable</th><th class="num">Accès</th>
          </tr></thead>
          <tbody>
            ${affiches
              .map((a) => {
                const codes = et.jeu.attributions[a.sam] ?? [];
                const ouvert = agentDeplie === a.sam;
                return `<tr>
                  <td>${e(a.nom)}<br /><code>${e(a.sam)}</code>
                      ${a.prestataire ? '<span class="etiquette etiquette--alerte">prestataire</span>' : ''}</td>
                  <td>${e(a.departement)}${a.accueil ? `<br /><span class="reserve" style="font-size:.74rem">accueil : ${e(a.accueil)}</span>` : ''}</td>
                  <td>${e(a.titre)}</td>
                  <td>${e(a.site)}</td>
                  <td>${a.responsable ? e(nomDe.get(a.responsable) ?? a.responsable) : '<span class="reserve">racine</span>'}</td>
                  <td class="num">
                    <button type="button" class="detail" data-agent="${e(a.sam)}">
                      ${nombre(codes.length)}${ouvert ? ' ▾' : ' ▸'}
                    </button>
                    ${ouvert ? `<p class="liste-agents" style="text-align:left">${codes.map((c) => `<code>${e(c)}</code>`).join(' · ')}</p>` : ''}
                  </td>
                </tr>`;
              })
              .join('')}
          </tbody>
        </table>
        ${
          trouves.length > affiches.length
            ? `<p class="vide">Affichage limité aux ${nombre(PLAFOND_POPULATION)} premiers — affinez la recherche ou exportez.</p>`
            : ''
        }`;
}

function exporterPopulation(et: Etat): void {
  const nomDe = new Map(et.jeu.agents.map((a) => [a.sam, a.nom]));
  telecharger(
    'population.csv',
    versCsv([
      ['Identifiant', 'Nom', 'Service', 'Fonction', 'Site', 'Responsable', 'Prestataire', 'Acces'],
      ...et.jeu.agents.map((a) => [
        a.sam,
        a.nom,
        a.departement,
        a.titre,
        a.site,
        a.responsable ? (nomDe.get(a.responsable) ?? a.responsable) : '',
        a.prestataire ? 'oui' : 'non',
        (et.jeu.attributions[a.sam] ?? []).join(' '),
      ]),
    ]),
    'text/csv',
  );
}

function exporterCatalogue(et: Etat): void {
  const porteurs = new Map<string, number>();
  for (const codes of Object.values(et.jeu.attributions)) {
    for (const code of codes) porteurs.set(code, (porteurs.get(code) ?? 0) + 1);
  }
  telecharger(
    'catalogue.csv',
    versCsv([
      ['Code', 'Libelle', 'Application', 'Categorie', 'Sensible', 'InterditPrestataire', 'Detenteurs'],
      ...et.jeu.catalogue.map((a) => [
        a.code,
        a.nom,
        a.application,
        a.categorie,
        a.sensible ? '1' : '0',
        a.interditPrestataire ? '1' : '0',
        String(porteurs.get(a.code) ?? 0),
      ]),
    ]),
    'text/csv',
  );
}

function appliquerJeu(jeu: Jeu, origine: string): void {
  if (!etat) return;
  origineJeu = origine;
  etat = { ...etat, jeu };
  // Les services, les sites et les équipes changent : tout ce qui s'y réfère
  // doit repartir de zéro plutôt que de garder des clés qui n'existent plus.
  risques.clear();
  deplies.clear();
  for (const critere of criteresAssistant) critere.valeurs = [];
  retenusAssistant = undefined;
  filtrePopulation = '';
  agentDeplie = null;
  rendreFiltresPopulation(jeu);
  rendrePickers(jeu);
  calculer();
  rendreDonnees(etat);
}

async function fichierChoisi(input: HTMLInputElement): Promise<void> {
  const role = input.dataset.fichier as 'annuaire' | 'habilitations' | 'catalogue';
  const fichier = input.files?.[0];
  const etatTexte = q(`[data-etat="${role}"]`);
  if (!fichier) return;

  try {
    const tableau = parser(await fichier.text());
    if (tableau.lignes.length === 0) throw new Error('aucune ligne exploitable');
    fichiers[role] = tableau;

    etatTexte.setAttribute('data-ok', '');
    etatTexte.textContent = `${fichier.name} — ${nombre(tableau.lignes.length)} lignes, ${nombre(tableau.entetes.length)} colonnes`;

    if (role === 'annuaire') {
      mapAnnuaire = detecterAnnuaire(tableau.entetes);
      prestatairesImport.clear();
      if (mapAnnuaire.departement) {
        const colonne = mapAnnuaire.departement;
        for (const d of devinerPrestataires(
          tableau.lignes.map((l) => (l[colonne] ?? '').trim()),
        )) {
          prestatairesImport.add(d);
        }
      }
    }
    if (role === 'habilitations') mapHabilitations = detecterHabilitations(tableau.entetes);
  } catch (erreur: unknown) {
    delete fichiers[role];
    etatTexte.removeAttribute('data-ok');
    etatTexte.textContent = `Fichier illisible : ${erreur instanceof Error ? erreur.message : String(erreur)}`;
  }

  rendreMappage();
  rendrePrestatairesImport();
  majBoutonCharger();
}

function chargerImport(): void {
  if (!fichiers.annuaire || !fichiers.habilitations || !mapAnnuaire || !mapHabilitations) return;

  const { jeu, diagnostics } = construireDepuisCsv({
    annuaire: fichiers.annuaire,
    habilitations: fichiers.habilitations,
    catalogue: fichiers.catalogue,
    correspondance: mapAnnuaire,
    correspondanceHabilitations: mapHabilitations,
    departementsPrestataires: [...prestatairesImport],
  });

  rendreDiagnostics(diagnostics);
  if (diagnostics.some((d) => d.niveau === 'erreur')) return;

  appliquerJeu(jeu, `Extraction chargée depuis votre poste — ${nombre(jeu.agents.length)} agents`);
}

function brancherImport(): void {
  const panneau = q<HTMLElement>('[data-panneau="donnees"]');

  panneau.addEventListener('input', (ev) => {
    const cible = ev.target;
    if (!(cible instanceof HTMLInputElement) || cible.dataset.filtrePopulation === undefined) {
      return;
    }
    filtrePopulation = cible.value;
    agentDeplie = null;
    if (etat) rendrePopulation(etat);
  });

  panneau.addEventListener('change', (ev) => {
    const cible = ev.target;
    if (!(cible instanceof HTMLElement)) return;

    if (cible instanceof HTMLInputElement && cible.dataset.fichier) {
      void fichierChoisi(cible);
      return;
    }
    if (cible instanceof HTMLSelectElement && cible.dataset.map && mapAnnuaire) {
      mapAnnuaire[cible.dataset.map as keyof Correspondance] = cible.value;
      rendreMappage();
      rendrePrestatairesImport();
      majBoutonCharger();
      return;
    }
    if (cible instanceof HTMLSelectElement && cible.dataset.maph && mapHabilitations) {
      mapHabilitations[cible.dataset.maph as keyof CorrespondanceHabilitations] = cible.value;
      majBoutonCharger();
    }
  });

  panneau.addEventListener('click', (ev) => {
    const cible = ev.target;
    if (!(cible instanceof HTMLElement)) return;

    const pastille = cible.closest<HTMLElement>('[data-presta-import]');
    if (pastille?.dataset.prestaImport !== undefined) {
      const d = pastille.dataset.prestaImport;
      if (prestatairesImport.has(d)) prestatairesImport.delete(d);
      else prestatairesImport.add(d);
      pastille.setAttribute('aria-pressed', String(prestatairesImport.has(d)));
      return;
    }

    const agent = cible.closest<HTMLElement>('[data-agent]');
    if (agent?.dataset.agent !== undefined && etat) {
      agentDeplie = agentDeplie === agent.dataset.agent ? null : agent.dataset.agent;
      rendrePopulation(etat);
      return;
    }

    if (cible.closest('[data-export-population]') && etat) {
      exporterPopulation(etat);
      return;
    }

    if (cible.closest('[data-export-catalogue]') && etat) {
      exporterCatalogue(etat);
      return;
    }

    if (cible.closest('[data-charger]')) {
      chargerImport();
      return;
    }

    if (cible.closest('[data-jeu-demo]') && jeuDemo) {
      rendreDiagnostics([]);
      appliquerJeu(
        jeuDemo,
        'Jeu de démonstration — organisation Contoso francisée, habilitations générées',
      );
    }
  });
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
  rendreAssistant(etat);
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

/** Point-virgule et marque d'ordre des octets : Excel en français ouvre sans broncher. */
function versCsv(lignes: string[][]): string {
  return lignes
    .map((l) => l.map((c) => `"${c.replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');
}

function slugifier(texte: string): string {
  return (
    texte
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'regle'
  );
}

function telecharger(nom: string, contenu: string, type: string): void {
  const url = URL.createObjectURL(
    new Blob([type === 'text/csv' ? '\uFEFF' + contenu : contenu], { type }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  a.click();
  URL.revokeObjectURL(url);
}

function exporter(): void {
  if (!etat) return;
  telecharger(
    `minage-${bande}.csv`,
    versCsv([
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
    ]),
    'text/csv',
  );
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

  jeuDemo = jeu;
  rendreFiltresPopulation(jeu);
  rendrePickers(jeu);
  brancher();
  brancherImport();
  brancherAssistant();
  calculer();
  rendreDonnees(etat);
}

amorcer().catch((erreur: unknown) => {
  const message = erreur instanceof Error ? erreur.message : String(erreur);
  q('[data-chiffres]').innerHTML =
    `<div class="chiffre"><b>—</b><span>Chargement impossible : ${e(message)}</span></div>`;
});
