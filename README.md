# Minage de rôles — démonstrateur

Un outil d'aide à la décision pour la revue des habilitations : la population est découpée en équipes, on identifie les accès réellement communs à chacune, et l'outil en tire des recommandations de provisionnement — assorties des réserves qui s'imposent.

**Tout le calcul s'effectue dans le navigateur.** Aucune donnée n'est transmise à un serveur. Ce n'est pas un simple confort technique : pour un outil qui manipule des annuaires d'entreprise, c'est la seule réponse tenable à la question « où vont mes données ? ».

## La règle de décision

Pour chaque binôme équipe / accès, l'outil calcule la part de l'équipe qui détient l'accès :

| Couverture | Lecture |
|---|---|
| 100 % | Recommandation forte — l'accès appartient au rôle |
| 85 à 99 % | À revoir — il manque à quelques personnes ; c'est peut-être un oubli |
| 60 à 84 % | Faible — l'accès n'est pas caractéristique de l'équipe |
| Moins de 60 % | Écarté — de la dérive individuelle, pas un rôle |

Les paliers sont réglables. La logique, elle, ne l'est pas : **le pourcentage ne décide jamais seul.**

- Une équipe de **moins de 5 personnes n'est pas minée** : trois personnes qui partagent un accès ne prouvent rien. Exception : si l'accès est détenu par **100 %** de l'équipe, il est retenu malgré tout.
- Les **prestataires sont exclus du minage par défaut** : ils ne comptent ni au numérateur ni au dénominateur. Ils peuvent être réintégrés, cohorte par cohorte.
- Un accès peut être **interdit aux prestataires** : ce marqueur est porté par l'accès lui-même et bloque l'affectation, quel que soit le pourcentage.
- Un **accès sensible** ne devient jamais un automatisme : il produit une recommandation, mais celle-ci attend une validation humaine.
- Une équipe marquée **à risque** continue d'être minée et reste visible, mais aucune de ses recommandations n'est automatisable.

## La factorisation, et ce qui la bloque

Un accès commun à plusieurs équipes n'a pas à être répété équipe par équipe : il se pose une seule fois, au nœud le plus haut de la hiérarchie qui le couvre entièrement. L'outil recherche ce nœud pour chaque accès.

**Une seule équipe sous le seuil bloque la remontée.** Si toutes les grandes équipes d'une direction détiennent un accès, mais qu'une équipe de trois personnes ne l'a pas, factoriser à la direction reviendrait à faire hériter ces trois personnes d'un droit que personne n'a validé pour elles. L'outil refuse, nomme l'équipe bloquante et laisse un humain trancher.

Seuls les nœuds couvrant **au moins deux équipes** sont proposés : un nœud qui n'en couvre qu'une ne factorise rien — il répète ce que l'onglet des recommandations dit déjà.

## Le minage conditionnel

Un même jeu de données, miné sous deux jeux de conditions, donne deux réponses — et les deux sont justes. C'est tout l'objet de l'outil : la définition de l'équipe est une décision, pas une donnée.

Six découpages sont proposés : département, département + site, responsable hiérarchique, fonction, fonction + site, site. Sur le jeu de données fourni, passer du département à la fonction fait passer de 16 à 49 équipes et de 113 à 165 recommandations automatisables — parce que certains accès suivent le métier, non le rattachement.

## Voir les données brutes

L'onglet **Données** présente la population et le catalogue tels qu'ils ont été entrés dans l'outil : chaque agent avec son service, sa fonction, son site, son responsable, et la liste exacte de ses accès en dépliant le compteur. La recherche porte aussi sur les codes d'accès — taper un code donne la liste de ses détenteurs. Les deux tables s'exportent en CSV.

Un calcul d'habilitations que l'on ne peut pas recouper ne vaut rien : il doit être possible de descendre de « 93 % des commerciaux détiennent cet accès » jusqu'à la ligne d'annuaire d'une personne précise.

## L'assistant de règles transverses

Le minage part du découpage de l'entreprise et cherche ce qui est commun. L'assistant prend le problème par l'autre bout : on **désigne** une population par ses attributs — tous les consultants CRM, ou tous les commerciaux de Metz — puis on regarde ce qu'elle détient, pour en faire un automatisme.

Trois étapes :

1. **Qui** — on combine service, fonction et site ; laisser un attribut vide revient à ne pas le contraindre.
2. **Quoi** — l'outil propose les accès universels et sans réserve ; on coche ou décoche.
3. **Ce que ça engage** — le nombre de provisionnements, les personnes concernées nommément, et l'export.

Sur le jeu fourni, les 49 commerciaux sont répartis sur deux services et trois sites. L'assistant propose six accès qu'ils détiennent tous ; si l'on ajoute la formation, détenue par 46 sur 49, il annonce trois provisionnements et nomme les trois personnes.

Les conditions posées en amont s'appliquent ici aussi : mêmes seuils, même traitement des prestataires, même exigence de validation sur les accès sensibles. **Une règle transverse n'est pas une porte dérobée** — un accès sensible n'est jamais proposé de lui-même, et un accès interdit aux prestataires les retire du provisionnement au lieu de les inclure.

Rien n'est appliqué. L'outil produit la décision et son périmètre : en CSV pour l'équipe qui provisionne, en JSON pour l'outillage.

## Charger sa propre extraction

L'outil accepte les exports du client, dans l'onglet **Données**. Deux fichiers suffisent :

| Fichier | Contenu |
|---|---|
| Annuaire | Un identifiant et, si possible, un service, une fonction, un site, un responsable |
| Habilitations | Deux colonnes : qui, et quel accès |
| Catalogue *(facultatif)* | Libellés, sensibilité, interdiction aux prestataires |

Les noms de colonnes sont **détectés** — `SamAccountName` aussi bien que `Matricule`, `Department` aussi bien que `Service`, `Office` aussi bien que `Ville` — puis **affichés pour correction**. La détection est un confort, pas une certitude : se tromper en silence sur la colonne « responsable » fausserait toute la hiérarchie.

La colonne responsable est résolue par nom distinctif, par identifiant, puis par nom affiché, dans cet ordre. Ce qui ne se résout pas est signalé, jamais inventé : lignes sans identifiant, identifiants en double, responsables introuvables, attributions visant un agent absent de l'annuaire, accès hors catalogue.

Le séparateur est deviné (point-virgule, virgule, tabulation, barre verticale), la marque d'ordre des octets est retirée, les guillemets doublés et les fins de ligne Windows sont gérés.

L'onglet Données propose deux séries de fichiers en téléchargement — il ne faut pas les confondre.

**Les modèles** sont propres et minuscules : trois agents, six habilitations, trois accès. Ils ne servent qu'à montrer les colonnes attendues et leur contenu. C'est ce qu'on envoie à un client avant un rendez-vous.

**Le jeu d'essai** est un export de cabinet comptable fictif — 27 lignes, en-têtes en français, accents, point-virgule — comportant sept défauts volontaires : une ligne sans matricule, un matricule en double, un responsable absent du fichier, une habilitation attribuée à un inconnu, un libellé de service contenant le séparateur, un prestataire administrateur de l'annuaire, et une marque d'ordre des octets. Chacun doit produire un message. Il sert à éprouver l'import, pas à être rempli.

Les deux sont produits par `donnees/generer-exemple.py` et publiés dans `public/exemples/`.

**Ces fichiers ne quittent jamais le poste.** Ils sont lus par le navigateur et restent en mémoire le temps de la session. Il n'existe aucun serveur à qui les envoyer : c'est une propriété de l'architecture, pas une promesse.

## Le jeu de données

272 agents, 17 départements, 49 intitulés, 3 sites, une hiérarchie à 7 niveaux, 79 accès au catalogue, environ 4 200 attributions.

L'organisation provient du jeu de référence **Contoso de Microsoft**, francisé ; la couche d'habilitations est générée par-dessus. La forme de l'organisation n'a donc pas été taillée pour flatter l'algorithme — seuls les droits sont synthétiques. Le détail se trouve dans [`donnees/README-fr.md`](donnees/README-fr.md).

La dérive est volontaire et documentée : des accès résiduels sous le seuil qui ne doivent pas être recommandés, des couvertures à 86 ou 93 % qui doivent ressortir « à revoir », des outils à l'abandon, et six écarts francs — dont des prestataires détenant un accès qui leur est interdit.

## Mise en route

```bash
npm install
npm run dev
```

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Site statique dans `dist/` |
| `npm test` | 79 tests |
| `npm run typecheck` | TypeScript strict |
| `npm run donnees` | Régénère le jeu (Python 3, sans dépendance) |

## Organisation du code

| Chemin | Rôle |
|---|---|
| `src/moteur/` | Le calcul, en TypeScript pur, sans dépendance, testé |
| `src/moteur/cohortes.ts` | Périmètre et découpage en équipes |
| `src/moteur/minage.ts` | Couverture, verdicts, réserves, écarts |
| `src/moteur/factorisation.ts` | Arbre hiérarchique et remontée |
| `src/moteur/csv.ts` | Analyse CSV : séparateur deviné, guillemets, BOM |
| `src/moteur/importation.ts` | Détection des colonnes et reconstruction d'un jeu |
| `src/moteur/regles.ts` | Règles transverses : population désignée, impact, export |
| `src/scripts/app.ts` | L'interface, sans framework |
| `donnees/` | Francisation de Contoso et génération des habilitations (Python) |
| `public/exemples/` | Modèles à remplir et jeu d'essai à défauts volontaires |
| `tests/` | 23 tests sur une organisation jouet lisible, 10 sur le jeu réel, 22 sur l'import, 16 sur les règles |

Le moteur ne dépend ni d'Astro ni du DOM : il est réutilisable tel quel dans un traitement serveur ou un script.

---

Créé par **Codeur DRABO**.
