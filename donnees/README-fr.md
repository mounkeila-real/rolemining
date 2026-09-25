# Jeu de données organisationnel — transposition française

## Origine

`ADUsers.csv` provient du dépôt public **aserto-demo/contoso-ad-sample** : un export
Active Directory de Contoso, la société fictive de référence de Microsoft.
272 utilisateurs, 16 attributs.

Licence du dépôt d'origine : **Microsoft Limited Public License 1.1** — à relire
avant toute rediffusion publique du fichier source.

## Ce que le jeu contient — et ce qu'il ne contient pas

| | |
|---|---|
| Utilisateurs | 272 |
| Départements | 17 |
| Intitulés de poste | 49 |
| Manager renseigné | 271 / 272 (une seule racine) |
| Profondeur hiérarchique | 7 niveaux, moyenne 4,3 |
| Départements de moins de 5 personnes | 4 |
| **Groupes / habilitations** | **aucun** |

Le point important : **il n'y a aucune donnée d'habilitation.** C'est un annuaire
d'identités, pas de droits. La matrice utilisateur × permission — la matière
première du minage de rôles — doit être produite séparément, par-dessus cette
organisation.

C'est précisément le bon partage : la forme de l'organisation n'est pas réglée
par nous (tailles de départements, dispersion des intitulés, chaîne
managériale), seuls les droits sont générés.

## Fichiers

| Fichier | Rôle |
|---|---|
| `ADUsers.csv` | source Contoso, non modifiée |
| `franciser.py` | produit la version française |
| `ADUsers-fr.csv` | 272 utilisateurs, libellés et identités français |
| `correspondance-fr.json` | tables de correspondance complètes (audit) |
| `verifier.py` | 18 contrôles structurels, tous verts |

```bash
python franciser.py && python verifier.py
```

La graine du tirage est fixe (`20260925`) : deux exécutions produisent le même
fichier, octet pour octet.

## Conservé à l'identique

- le nombre d'utilisateurs et **l'ordre des lignes** ;
- **`ObjectGUID` et `SID` inchangés** — on peut joindre le fichier français au
  fichier Contoso et vérifier qu'aucune ligne n'a été ajoutée, supprimée ni
  déplacée ;
- la taille exacte de chaque département, dont les quatre sous le seuil de 5 :
  Création (1), Direction Informatique (1), Ingénierie (1), Ressources
  Humaines (3) ;
- la répartition exacte des 49 intitulés ;
- la chaîne hiérarchique complète : 7 niveaux, moyenne 4,3, une seule racine ;
- les 34 couples de rattachement (département du chef → département de l'agent).

## Traduit ou remplacé

- **Départements et intitulés** : table explicite dans `correspondance-fr.json`.
  « Marketing » s'écrit pareil dans les deux langues et reste tel quel.
  `1099 Contractor` — catégorie fiscale américaine — devient
  « Prestataires Externes ».
- **Identités** : noms, prénoms, `SamAccountName`, `mail`, `UserPrincipalName`.
  Les identifiants et adresses sont repliés en ASCII (`Élodie Noël` →
  `elodien@contoso.fr`), comme le fait un annuaire réel.
- **`UserPrincipalName`** : vide pour les 272 utilisateurs de la source, il est
  ici renseigné en `prenom.nom@contoso.fr`.
- **Téléphones** : plages **réservées à la fiction par l'ARCEP** — aucun abonné
  réel n'est joignable. Le préfixe suit le site et tombe dans la bonne zone :
  `01 99 00` pour Paris, `03 53 01` pour Metz (zone Est), `04 65 71` pour Lyon
  (zone Sud-Est). Les 23 agents sans téléphone dans la source n'en ont pas
  davantage ici. 249 postes, tous distincts.
- **`DistinguishedName`** : la source ne contient que `CN=Dan Jump`, sans chemin.
  On reconstruit une arborescence `CN=…,OU=<département>,OU=Utilisateurs,DC=contoso,DC=fr`.
  **Elle n'apporte aucune information nouvelle** : l'unité d'organisation est le
  département, rien d'autre.

Le nom **Contoso** est conservé, domaine `contoso.fr`. La filiation avec le jeu
de référence Microsoft reste visible, ce qui vaut mieux qu'un nom de société
inventé : un interlocuteur du métier reconnaît immédiatement un jeu de
démonstration et ne peut pas le confondre avec des données réelles.

## Deux choix à connaître

**Les intitulés restent au masculin générique.** « Pauline Renaud,
Président-directeur général » détonne à la lecture, mais c'est volontaire : le
minage de rôles regroupe par intitulé. Féminiser ferait passer les 49 intitulés
à près de 90 et **scinderait chaque cohorte en deux selon le genre** — exactement
le défaut de qualité de données que l'outil est censé détecter, introduit à la
main. Si la lisibilité l'exige pour une démonstration, il faudra une colonne
d'affichage distincte de la colonne utilisée pour le regroupement.

**Les incohérences de la source sont préservées.** Contoso contient des
appariements étranges — département « Création » occupé par un « Ingénieur »,
« Direction Informatique » par un « Président de la division services ». Je ne
les ai pas corrigés : ce sont précisément les cas isolés que le minage doit faire
remonter comme non factorisables.

## L'attribut de site — ajouté, pas hérité

La colonne **`Office`** (attribut AD `physicalDeliveryOfficeName`) est la
**seule information ajoutée** au jeu de données. Les indicatifs téléphoniques de
la source ne pouvaient pas en tenir lieu : 29 valeurs distinctes dont 170 sur un
seul indicatif.

**Paris 144 · Lyon 68 · Metz 60**

Trois règles, dans cet ordre :

1. **Mono-site.** Fonctions de siège à Paris (Direction Générale, Comité de
   Direction, Comptabilité, RH, DSI, Marketing, Création, Stratégie CRM),
   Ingénierie et Production à Metz, Conseil Gestion de Contenu à Lyon. Ces
   départements donnent des cohortes propres, à 100 % sur un site.
2. **Multi-site** pour les cinq départements opérationnels (Direction
   Commerciale, Conseil en Stratégie, Gestion de Projet, Exploitation, Pilotage
   des Affaires) : Paris 45 %, Lyon 30 %, Metz 25 %. Le tirage dérive de
   l'`ObjectGUID`, donc il est stable et **indépendant de l'ordre du fichier**.
3. **Prestataires Externes** : site du responsable.

Le `DistinguishedName` **n'a pas été touché** : l'arborescence reste par
département. Mettre le site dans le chemin d'unité d'organisation obligerait à
choisir entre `OU=site,OU=département` et l'inverse, et c'est précisément une
question que le démonstrateur doit pouvoir poser au client, pas trancher à sa
place.

### Ce que cette colonne rend démontrable

- **14 intitulés sur 49 existent sur plusieurs sites** — dont « Commercial »
  (Paris 25, Lyon 15, Metz 9) et « Consultant en stratégie » (Paris 16, Lyon 17,
  Metz 11). Voilà la matière des automatismes « fonction + site ».
- **28 cohortes département + site**, dont **5 sous le seuil de 5** : Ingénierie
  Metz (1), Pilotage des Affaires Metz (1), Création Paris (1), Direction
  Informatique Paris (1), Ressources Humaines Paris (3). Croiser avec le site
  fait passer les cas non minables de 4 à 5 : c'est exactement le risque que le
  découpage par attribut fait courir, et la démonstration doit le montrer.
- **Les 29 prestataires n'ont que 2 responsables** (21 sous un chef parisien,
  8 sous un chef lyonnais). La règle d'héritage les concentre donc sur deux
  sites, aucun à Metz. Ce n'est pas un défaut de la règle, c'est la forme réelle
  de l'organisation Contoso — et un bon exemple de dépendance à un seul nœud.

## Ce qui manque encore pour le démonstrateur

1. **La couche d'habilitations** — matrice utilisateur × permission, à générer.
   C'est la seule partie que l'outil analyse.
2. **Le traitement des prestataires**, à trois niveaux :
   - **exclus du minage par défaut** — ils ne comptent ni au numérateur ni au
     dénominateur du pourcentage de possession commune ;
   - **inclusion optionnelle**, décidée cohorte par cohorte ;
   - **rôles interdits aux prestataires** : un marqueur porté par le rôle, qui
     bloque l'affectation quel que soit le résultat du minage.

   Effet mesuré de l'exclusion : **243 agents minables sur 272**, et **26 cohortes
   département + site au lieu de 28**. Les cinq cas sous le seuil de 5 restent
   exactement les mêmes — les deux cohortes de prestataires étaient à 21 et 8, donc
   au-dessus du seuil. **Si l'équipe est définie par le département, l'exclusion
   ne fragilise aucune cohorte.**

   Mais **si l'équipe est définie par la chaîne managériale, le résultat change du
   tout au tout** : l'équipe de Maxime Mercier (Gestion de Projet, Paris) perd ses
   21 subordonnés et disparaît, celle de Laurent Mallet (Conseil en Stratégie,
   Lyon) en perd 8. Le choix de la définition d'équipe n'est donc pas un détail de
   présentation : il décide de ce qui reste minable.

   Le marquage suit un **attribut**, pas un nœud de l'arbre : les prestataires
   sont répartis sur deux départements d'accueil et deux sites.
