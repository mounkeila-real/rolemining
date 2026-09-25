# Minage de rôles — démonstrateur

Outil d'aide à la décision pour la revue d'habilitations : on découpe la
population en équipes, on regarde quels accès sont réellement communs à chacune,
et on en tire des recommandations de provisionnement — avec les réserves qui
vont avec.

**Tout le calcul se fait dans le navigateur.** Aucune donnée n'est transmise à
un serveur. Ce n'est pas une facilité technique : pour un outil qui manipule des
annuaires d'entreprise, c'est la seule réponse tenable à la question « où vont
mes données ».

## La règle de décision

Pour une équipe donnée et un accès donné, on calcule la part de l'équipe qui le
détient :

| Couverture | Lecture |
|---|---|
| 100 % | recommandation forte — l'accès appartient au rôle |
| 85 à 99 % | à revoir — il manque à quelques personnes, c'est peut-être un oubli |
| 60 à 84 % | faible — l'accès n'est pas caractéristique de l'équipe |
| moins de 60 % | écarté — de la dérive individuelle, pas un rôle |

Les paliers sont réglables. Ce qui ne l'est pas, c'est la logique : **le
pourcentage ne décide pas seul.**

- Une équipe de **moins de 5 personnes n'est pas minable** — trois personnes qui
  partagent un accès ne prouvent rien. Exception : si l'accès est détenu par
  **100 %** de l'équipe, il est retenu quand même.
- Les **prestataires sont hors minage par défaut**. Ils ne comptent ni au
  numérateur ni au dénominateur. On peut les réintégrer, cohorte par cohorte.
- Un accès peut être **interdit aux prestataires** : le marqueur est porté par
  l'accès et bloque l'affectation quel que soit le pourcentage.
- Un **accès sensible** ne devient jamais un automatisme : il produit une
  recommandation, mais qui attend une validation humaine.
- Une équipe marquée **à risque** reste minée et reste visible, mais aucune de
  ses recommandations n'est automatisable.

## La factorisation, et ce qui la bloque

Un accès commun à plusieurs équipes n'a pas à être répété équipe par équipe : il
se pose une fois, au nœud le plus haut de la hiérarchie qui le couvre
entièrement. L'outil cherche ce nœud pour chaque accès.

**Une équipe sous le seuil bloque la remontée.** Si toutes les grandes équipes
d'une direction détiennent un accès mais qu'une équipe de trois personnes ne l'a
pas, factoriser à la direction ferait hériter ces trois personnes d'un droit que
personne n'a validé pour elles. L'outil refuse, nomme l'équipe bloquante, et
laisse un humain trancher.

Seuls les nœuds qui couvrent **au moins deux équipes** sont proposés : un nœud
qui n'en couvre qu'une ne factorise rien, il redit ce que l'onglet des
recommandations dit déjà.

## Le minage conditionnel

Le même jeu de données, miné sous deux jeux de conditions, donne deux réponses —
et les deux sont justes. C'est tout l'objet de l'outil : la définition de
l'équipe est une décision, pas une donnée.

Six découpages sont proposés : département, département + site, responsable
hiérarchique, fonction, fonction + site, site. Sur le jeu fourni, passer du
département à la fonction fait passer de 16 à 49 équipes et de 113 à 165
recommandations automatisables — parce que certains accès suivent le métier et
non le rattachement.

## L'assistant de règles transverses

Le minage part du découpage de l'entreprise et cherche ce qui est commun.
L'assistant prend le problème par l'autre bout : on **désigne** une population
par ses attributs — tous les consultants CRM, ou tous les commerciaux de Metz —
et on regarde ce qu'elle détient pour en faire un automatisme.

Trois étapes. **Qui** : on combine service, fonction et site ; laisser un
attribut vide, c'est ne pas le contraindre. **Quoi** : l'outil propose les accès
universels et sans réserve, et on coche ou décoche. **Ce que ça engage** : le
nombre de provisionnements, les personnes concernées nommément, et l'export.

Sur le jeu fourni, les 49 commerciaux sont répartis sur deux services et trois
sites. L'assistant propose six accès qu'ils détiennent tous — et si l'on ajoute
la formation, détenue par 46 sur 49, il annonce trois provisionnements et nomme
les trois personnes.

Les conditions posées à gauche s'appliquent ici aussi : mêmes seuils, même
traitement des prestataires, même exigence de validation sur les accès
sensibles. **Une règle transverse n'est pas une porte dérobée** — un accès
sensible n'est jamais proposé de lui-même, et un accès interdit aux prestataires
les retire du provisionnement au lieu de les inclure.

Rien n'est appliqué. L'outil produit la décision et son périmètre, en CSV pour
l'équipe qui provisionne et en JSON pour l'outillage.

## Charger sa propre extraction

L'outil accepte les exports du client, dans l'onglet **Données**. Deux fichiers
suffisent :

| Fichier | Contenu |
|---|---|
| Annuaire | un identifiant, et si possible un service, une fonction, un site, un responsable |
| Habilitations | deux colonnes : qui, et quel accès |
| Catalogue *(facultatif)* | libellés, sensibilité, interdiction aux prestataires |

Les noms de colonnes sont **détectés** — `SamAccountName` comme `Matricule`,
`Department` comme `Service`, `Office` comme `Ville` — puis **affichés pour
correction**. Deviner est un confort, pas une certitude : se tromper en silence
sur la colonne « responsable » fausserait toute la hiérarchie.

La colonne responsable est résolue par nom distinctif, par identifiant ou par nom
affiché, dans cet ordre. Ce qui ne se résout pas est signalé, jamais inventé :
lignes sans identifiant, identifiants en double, responsables introuvables,
attributions visant un agent absent de l'annuaire, accès hors catalogue.

Le séparateur est deviné (point-virgule, virgule, tabulation, barre verticale),
la marque d'ordre des octets retirée, les guillemets doublés et les fins de ligne
Windows gérés.

**Ces fichiers ne quittent pas le poste.** Ils sont lus par le navigateur et
restent en mémoire le temps de la session. Il n'y a pas de serveur à qui les
envoyer : c'est une propriété de l'architecture, pas une promesse.

## Le jeu de données

272 agents, 17 départements, 49 intitulés, 3 sites, hiérarchie à 7 niveaux,
79 accès au catalogue, environ 4 200 attributions.

L'organisation vient du jeu de référence **Contoso de Microsoft**, francisé ; la
couche d'habilitations est générée par-dessus. La forme de l'organisation n'a
donc pas été taillée pour flatter l'algorithme — seuls les droits sont
synthétiques. Le détail est dans [`donnees/README-fr.md`](donnees/README-fr.md).

La dérive est volontaire et documentée : des accès résiduels sous le seuil qui ne
doivent pas être recommandés, des couvertures à 86 ou 93 % qui doivent ressortir
« à revoir », des outils à l'abandon, et six écarts francs — dont des
prestataires détenant un accès qui leur est interdit.

## Mise en route

```bash
npm install
npm run dev
```

| Commande | |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run build` | site statique dans `dist/` |
| `npm test` | 71 tests |
| `npm run typecheck` | TypeScript strict |
| `npm run donnees` | régénère le jeu (Python 3, sans dépendance) |

## Organisation du code

| | |
|---|---|
| `src/moteur/` | le calcul, en TypeScript pur, sans dépendance et testé |
| `src/moteur/cohortes.ts` | périmètre et découpage en équipes |
| `src/moteur/minage.ts` | couverture, verdicts, réserves, écarts |
| `src/moteur/factorisation.ts` | arbre hiérarchique et remontée |
| `src/moteur/csv.ts` | analyse CSV : séparateur deviné, guillemets, BOM |
| `src/moteur/importation.ts` | détection des colonnes et reconstruction d'un jeu |
| `src/moteur/regles.ts` | règles transverses : population désignée, impact, export |
| `src/scripts/app.ts` | l'interface, sans framework |
| `donnees/` | francisation de Contoso et génération des habilitations (Python) |
| `tests/` | 23 tests sur une organisation jouet lisible, 10 sur le jeu réel, 22 sur l'import, 16 sur les règles |

Le moteur ne dépend ni d'Astro ni du DOM : il est réutilisable tel quel dans un
traitement serveur ou un script.

---

Créé par **Codeur DRABO**.
