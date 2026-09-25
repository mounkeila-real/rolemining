# -*- coding: utf-8 -*-
"""
Transposition française du jeu de référence Contoso (aserto-demo/contoso-ad-sample).

CONSERVÉ à l'identique :
  - le nombre d'utilisateurs (272)
  - la taille exacte de chaque département
  - la répartition exacte des intitulés de poste
  - la chaîne hiérarchique complète (7 niveaux, une seule racine)
  - ObjectGUID et SID, pour pouvoir joindre le fichier d'origine et vérifier
    qu'aucune ligne n'a été ajoutée, supprimée ni déplacée.

TRADUIT / REMPLACÉ :
  - libellés de département et d'intitulé (table de correspondance explicite)
  - identités (nom, prénom, identifiant, adresse mail, UPN)
  - téléphones -> plages françaises réservées à la fiction (ARCEP)
  - DistinguishedName -> arborescence d'unités d'organisation déduite du
    département (aucune information nouvelle : OU == Department)
"""
import collections
import csv
import hashlib
import json
import random
import re
import unicodedata

DOMAINE = "contoso.fr"
DC = "DC=contoso,DC=fr"

DEPARTEMENTS = {
    "Sales":                         "Direction Commerciale",
    "Strategy Consulting":           "Conseil en Stratégie",
    "Project Management":            "Gestion de Projet",
    "1099 Contractor":               "Prestataires Externes",
    "Operations":                    "Exploitation",
    "Content Management Consulting": "Conseil Gestion de Contenu",
    "Engineering Operations":        "Ingénierie et Production",
    "Sales Engagement Management":   "Pilotage des Affaires",
    "Marketing":                     "Marketing",
    "CRM Strategy":                  "Stratégie CRM",
    "Senior Management":             "Comité de Direction",
    "Executive":                     "Direction Générale",
    "Accounting":                    "Comptabilité",
    "Human Resources":               "Ressources Humaines",
    "Engineering":                   "Ingénierie",
    "Creative":                      "Création",
    "CVP of IT":                     "Direction Informatique",
}

TITRES = {
    "Salesperson":                   "Commercial",
    "Strategy Consultant":           "Consultant en stratégie",
    "Project Manager":               "Chef de projet",
    "Content Management Consultant": "Consultant gestion de contenu",
    "Engineer":                      "Ingénieur",
    "Manager":                       "Responsable",
    "Senior Project Manager":        "Chef de projet senior",
    "CRM Consultant":                "Consultant CRM",
    "Senior Engineer":               "Ingénieur senior",
    "Marketing Specialist":          "Chargé de marketing",
    "Strategy Consulting Manager":   "Responsable du conseil en stratégie",
    "IT Manager":                    "Responsable informatique",
    "Regional Sales Manager":        "Directeur commercial régional",
    "Sales Manager":                 "Responsable commercial",
    "Accountant":                    "Comptable",
    "Business Process Manager":      "Responsable des processus métier",
    "Procurement Manager":           "Responsable des achats",
    "Managing Director":             "Directeur général délégué",
    "HR Manager":                    "Responsable des ressources humaines",
    "CEO":                           "Président-directeur général",
    "General Manager of Professional Services": "Directeur des services professionnels",
    "Director of Project Management Team":      "Directeur du pôle gestion de projet",
    "CFO of Professional Services":  "Directeur financier des services professionnels",
    "COO":                           "Directeur des opérations",
    "Controller":                    "Contrôleur de gestion",
    "Vice President NA Sales":       "Vice-président ventes France",
    "CVP of Operations":             "Vice-président exécutif exploitation",
    "CVP of Online":                 "Vice-président exécutif activités en ligne",
    "SVP of Online Services":        "Directeur exécutif des services en ligne",
    "CTO of Professional Services":  "Directeur technique des services professionnels",
    "GM of Online Ad Sales and Affiliate Marketing": "Directeur régie publicitaire et affiliation",
    "IT Director":                   "Directeur informatique",
    "Director of Ad Sales":          "Directeur de la régie publicitaire",
    "Sr. Business Development Manager": "Responsable senior du développement commercial",
    "Marketing Manager":             "Responsable marketing",
    "Content Management Consulting Manager": "Responsable du conseil gestion de contenu",
    "CRM Consulting Manager":        "Responsable du conseil CRM",
    "Accounting Manager":            "Responsable comptable",
    "Director of Client Services":   "Directeur de la relation client",
    "Director of Affiliate Marketing and Partnerships": "Directeur affiliation et partenariats",
    "Sr. Media Planner":             "Chargé senior de la planification média",
    "President of Services":         "Président de la division services",
    "President of Management":       "Président de la division conseil",
    "Chief of Technical Strategy":   "Directeur de la stratégie technique",
    "Chief of Partnerships and Strategy": "Directeur des partenariats et de la stratégie",
    "CFO":                           "Directeur financier",
    "Sr. Account Manager":           "Responsable grands comptes",
    "HR Specialist":                 "Chargé des ressources humaines",
    "Public Relations Specialist":   "Chargé des relations publiques",
}

# Trois implantations. Le préfixe est une plage réservée à la fiction par
# l'ARCEP, et il tombe dans la bonne zone géographique : 01 pour l'Île-de-France,
# 03 pour l'Est, 04 pour le Sud-Est. Le site est donc lisible sur le numéro,
# comme dans un annuaire réel.
SITES = {
    "Paris": "01 99 00",
    "Metz":  "03 53 01",
    "Lyon":  "04 65 71",
}

# Départements mono-site : fonctions de siège, site industriel, centre éditorial.
SITE_FIXE = {
    "Direction Générale":         "Paris",
    "Comité de Direction":        "Paris",
    "Comptabilité":               "Paris",
    "Ressources Humaines":        "Paris",
    "Direction Informatique":     "Paris",
    "Marketing":                  "Paris",
    "Création":                   "Paris",
    "Stratégie CRM":              "Paris",
    "Ingénierie et Production":   "Metz",
    "Ingénierie":                 "Metz",
    "Conseil Gestion de Contenu": "Lyon",
}

# Départements répartis sur les trois sites : c'est là que l'automatisme
# « fonction + site » a quelque chose à mordre — même intitulé, sites différents.
REPARTITION = [("Paris", 45), ("Lyon", 30), ("Metz", 25)]

# Les prestataires externes prennent le site de leur responsable.
SITE_HERITE = "Prestataires Externes"

PRENOMS = [
    "Julien", "Camille", "Nicolas", "Sophie", "Thomas", "Aurélie", "Mathieu",
    "Élodie", "Sébastien", "Laetitia", "Guillaume", "Marion", "Vincent", "Céline",
    "Romain", "Émilie", "Antoine", "Charlotte", "Maxime", "Justine", "Benoît",
    "Pauline", "Damien", "Amandine", "Fabien", "Mélanie", "Cédric", "Sandrine",
    "Olivier", "Nathalie", "Arnaud", "Virginie", "Laurent", "Isabelle", "Grégory",
    "Caroline", "Florian", "Manon", "Jérôme", "Audrey", "Xavier", "Hélène",
    "Bastien", "Océane", "Ludovic", "Clémence", "Adrien", "Margaux", "Quentin",
    "Delphine", "Hugo", "Lucie", "Étienne", "Morgane", "Pierre", "Sarah",
    "Alexandre", "Anaïs", "Baptiste", "Estelle",
]
NOMS = [
    "Moreau", "Lefebvre", "Bonnet", "Dupont", "Girard", "Fontaine", "Chevalier",
    "Rousseau", "Perrin", "Mercier", "Blanchard", "Guérin", "Boyer", "Marchand",
    "Duval", "Lemoine", "Renaud", "Charpentier", "Gaillard", "Barbier", "Leroux",
    "Fournier", "Colin", "Vidal", "Caron", "Brunet", "Aubert", "Ménard", "Hubert",
    "Leclerc", "Poirier", "Tessier", "Cordier", "Delaunay", "Vasseur", "Jacquet",
    "Baron", "Langlois", "Bertin", "Maillard", "Bouvier", "Prévost", "Cousin",
    "Régnier", "Dumas", "Hamon", "Pichon", "Daniel", "Turpin", "Ferrand",
    "Loiseau", "Berger", "Grondin", "Hervé", "Masse", "Noël", "Ollivier",
    "Paulin", "Rey", "Sauvage", "Tanguy", "Vaillant", "Weber", "Ziegler",
    "Amiot", "Bassot", "Clerc", "Dorival", "Esnault", "Fabre", "Galland", "Huet",
    "Imbert", "Joubert", "Kieffer", "Lamy", "Mallet", "Nourry", "Ozanne",
    "Pruvost",
]


def sans_accent(chaine):
    """Replie les diacritiques : les identifiants et adresses restent en ASCII."""
    forme = unicodedata.normalize("NFKD", chaine)
    return "".join(c for c in forme if not unicodedata.combining(c))


def slug(chaine):
    return re.sub(r"[^a-z]", "", sans_accent(chaine).lower())


def indicatif(tel):
    trouve = re.match(r"\((\d{3})\)", tel or "")
    return trouve.group(1) if trouve else None


lignes = list(csv.DictReader(open("ADUsers.csv", encoding="utf-8-sig")))
champs = list(lignes[0].keys()) + ["Office"]

# Attribution des identités, déterministe : la graine est fixe, deux exécutions
# produisent le même fichier.
tirage = random.Random(20260925)
identites = {}
noms_pris, sam_pris = set(), set()
for ligne in lignes:
    while True:
        prenom = tirage.choice(PRENOMS)
        nom = tirage.choice(NOMS)
        complet = "%s %s" % (prenom, nom)
        sam = slug(prenom) + slug(nom)[0]
        if complet in noms_pris or sam in sam_pris:
            continue
        noms_pris.add(complet)
        sam_pris.add(sam)
        identites[ligne["Name"]] = (prenom, nom, complet, sam)
        break

dn_de = {
    l["Name"]: "CN=%s,OU=%s,OU=Utilisateurs,%s"
    % (identites[l["Name"]][2], DEPARTEMENTS[l["Department"]], DC)
    for l in lignes
}


def tirage_stable(guid):
    """Site tiré de l'ObjectGUID : stable, et indépendant de l'ordre du fichier."""
    n = int(hashlib.md5(guid.encode("ascii")).hexdigest(), 16) % 100
    seuil = 0
    for ville, poids in REPARTITION:
        seuil += poids
        if n < seuil:
            return ville
    return REPARTITION[-1][0]


# Affectation des sites. Les prestataires sont laissés de côté au premier tour :
# ils prennent le site de leur responsable, qui doit donc être connu d'abord.
nom_mgr = {
    l["Name"]: (l["Manager"].split("CN=", 1)[1].split(",")[0] if l["Manager"] else None)
    for l in lignes
}
site_de = {}
for ligne in lignes:
    dept = DEPARTEMENTS[ligne["Department"]]
    if dept == SITE_HERITE:
        continue
    site_de[ligne["Name"]] = SITE_FIXE.get(dept) or tirage_stable(ligne["ObjectGUID"])

a_resoudre = [l["Name"] for l in lignes if l["Name"] not in site_de]
while a_resoudre:
    reste = []
    for nom in a_resoudre:
        chef = nom_mgr[nom]
        if chef in site_de:
            site_de[nom] = site_de[chef]
        else:
            reste.append(nom)
    if len(reste) == len(a_resoudre):
        raise SystemExit("sites non résolus (responsable manquant) : %s" % reste)
    a_resoudre = reste

sortie = []
telephones_pris = set()
for ligne in lignes:
    prenom, nom, complet, sam = identites[ligne["Name"]]

    site = site_de[ligne["Name"]]
    if indicatif(ligne["OfficePhone"]):
        fin = re.search(r"(\d{4})$", ligne["OfficePhone"]).group(1)
        tel = "%s %s %s" % (SITES[site], fin[:2], fin[2:])
        while tel in telephones_pris:  # deux agents ne partagent pas un poste
            fin = "%04d" % ((int(fin) + 1) % 10000)
            tel = "%s %s %s" % (SITES[site], fin[:2], fin[2:])
        telephones_pris.add(tel)
    else:
        tel = ""  # 23 agents sans téléphone dans la source : on ne leur en invente pas

    manager = ligne["Manager"]
    if manager:
        manager = dn_de[manager.split("CN=", 1)[1].split(",")[0]]

    sortie.append({
        "Department":        DEPARTEMENTS[ligne["Department"]],
        "DistinguishedName": dn_de[ligne["Name"]],
        "Enabled":           ligne["Enabled"],
        "GivenName":         prenom,
        "mail":              "%s@%s" % (sam, DOMAINE),
        "Manager":           manager,
        "Name":              complet,
        "ObjectClass":       ligne["ObjectClass"],
        "ObjectGUID":        ligne["ObjectGUID"],
        "OfficePhone":       tel,
        "SamAccountName":    sam,
        "SID":               ligne["SID"],
        "sn":                nom,
        "Surname":           nom,
        "Title":             TITRES[ligne["Title"]],
        "UserPrincipalName": "%s.%s@%s" % (slug(prenom), slug(nom), DOMAINE),
        "Office":            site,
    })

with open("ADUsers-fr.csv", "w", encoding="utf-8-sig", newline="") as f:
    ecrivain = csv.DictWriter(f, fieldnames=champs, quoting=csv.QUOTE_ALL)
    ecrivain.writeheader()
    ecrivain.writerows(sortie)

with open("correspondance-fr.json", "w", encoding="utf-8") as f:
    json.dump(
        {
            "source": "aserto-demo/contoso-ad-sample — ADUsers.csv (272 utilisateurs)",
            "domaine": DOMAINE,
            "departements": DEPARTEMENTS,
            "titres": TITRES,
            "sites": SITES,
            "sites_mono_departement": SITE_FIXE,
            "repartition_multisite": dict(REPARTITION),
            "identites": {k: v[2] for k, v in identites.items()},
        },
        f,
        ensure_ascii=False,
        indent=2,
    )

print("ADUsers-fr.csv : %d lignes" % len(sortie))
print("correspondance-fr.json : %d départements, %d intitulés, %d identités"
      % (len(DEPARTEMENTS), len(TITRES), len(identites)))
