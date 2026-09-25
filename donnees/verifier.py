# -*- coding: utf-8 -*-
"""Contrôle que ADUsers-fr.csv est bien la même organisation que ADUsers.csv."""
import collections
import csv
import json
import sys

src = list(csv.DictReader(open("ADUsers.csv", encoding="utf-8-sig")))
fr = list(csv.DictReader(open("ADUsers-fr.csv", encoding="utf-8-sig")))
corr = json.load(open("correspondance-fr.json", encoding="utf-8"))

echecs = []


def verifie(libelle, condition, detail=""):
    etat = "OK  " if condition else "ÉCHEC"
    print("%s %s%s" % (etat, libelle, (" — " + detail) if detail else ""))
    if not condition:
        echecs.append(libelle)


# 1. Même population, ligne par ligne, prouvée par les identifiants techniques.
verifie("même nombre de lignes", len(src) == len(fr), "%d" % len(fr))
verifie("ObjectGUID inchangés et dans le même ordre",
        [l["ObjectGUID"] for l in src] == [l["ObjectGUID"] for l in fr])
verifie("SID inchangés", [l["SID"] for l in src] == [l["SID"] for l in fr])

# 2. Tailles de département conservées.
t_src = collections.Counter(l["Department"] for l in src)
t_fr = collections.Counter(l["Department"] for l in fr)
attendu = collections.Counter({corr["departements"][k]: v for k, v in t_src.items()})
verifie("taille de chaque département conservée", t_fr == attendu,
        "%d départements" % len(t_fr))
petits = sorted([(v, k) for k, v in t_fr.items() if v < 5])
verifie("départements sous le seuil de 5 préservés", len(petits) == 4,
        ", ".join("%s (%d)" % (k, v) for v, k in petits))

# 3. Répartition des intitulés conservée.
i_src = collections.Counter(l["Title"] for l in src)
i_fr = collections.Counter(l["Title"] for l in fr)
verifie("répartition des intitulés conservée",
        i_fr == collections.Counter({corr["titres"][k]: v for k, v in i_src.items()}),
        "%d intitulés" % len(i_fr))

# 4. Hiérarchie : chaque manager existe, une seule racine, mêmes profondeurs.
dn_fr = {l["DistinguishedName"] for l in fr}
verifie("tous les managers pointent vers un DN existant",
        all(l["Manager"] in dn_fr for l in fr if l["Manager"]))
racines = [l["Name"] for l in fr if not l["Manager"]]
verifie("une seule racine", len(racines) == 1, racines[0] if racines else "aucune")


def profondeurs(lignes, cle_parent):
    parent = {l[cle_parent[0]]: l[cle_parent[1]] for l in lignes}
    out = []
    for depart in parent:
        n, courant, vus = 0, depart, set()
        while parent.get(courant) and courant not in vus:
            vus.add(courant)
            courant = parent[courant]
            n += 1
        out.append(n)
    return sorted(out)


p_src = profondeurs(
    [{"c": l["Name"], "p": l["Manager"].split("CN=")[1].split(",")[0] if l["Manager"] else ""}
     for l in src], ("c", "p"))
p_fr = profondeurs(
    [{"c": l["DistinguishedName"], "p": l["Manager"]} for l in fr], ("c", "p"))
verifie("profil de profondeur hiérarchique identique", p_src == p_fr,
        "max %d, moyenne %.1f" % (max(p_fr), sum(p_fr) / len(p_fr)))

# Le couple (département du chef, département de l'agent) doit être préservé :
# c'est ce qui fait qu'une direction reste une direction.
dept_src = {l["Name"]: l["Department"] for l in src}
dept_fr = {l["DistinguishedName"]: l["Department"] for l in fr}
paires_src = collections.Counter(
    (dept_src[l["Name"]], dept_src[l["Manager"].split("CN=")[1].split(",")[0]])
    for l in src if l["Manager"])
paires_fr = collections.Counter(
    (dept_fr[l["DistinguishedName"]], dept_fr[l["Manager"]])
    for l in fr if l["Manager"])
verifie("liens de rattachement entre départements conservés",
        paires_fr == collections.Counter(
            {(corr["departements"][a], corr["departements"][b]): v
             for (a, b), v in paires_src.items()}),
        "%d couples distincts" % len(paires_fr))

# 5. Unicité et forme des attributs générés.
for champ in ("Name", "SamAccountName", "mail", "UserPrincipalName", "DistinguishedName"):
    vals = [l[champ] for l in fr]
    verifie("%s unique" % champ, len(set(vals)) == len(vals))
verifie("identifiants et adresses en ASCII",
        all(l["SamAccountName"].isascii() and l["mail"].isascii()
            and l["UserPrincipalName"].isascii() for l in fr))
# 6. Sites.
sites = corr["sites"]
verifie("site renseigné pour tout le monde", all(l["Office"] for l in fr))
verifie("aucun site inattendu", set(l["Office"] for l in fr) <= set(sites),
        ", ".join("%s %d" % (k, v) for k, v in
                  collections.Counter(l["Office"] for l in fr).most_common()))
verifie("départements mono-site respectés",
        all(l["Office"] == corr["sites_mono_departement"][l["Department"]]
            for l in fr if l["Department"] in corr["sites_mono_departement"]))
site_par_dn = {l["DistinguishedName"]: l["Office"] for l in fr}
verifie("prestataires externes sur le site de leur responsable",
        all(l["Office"] == site_par_dn[l["Manager"]]
            for l in fr if l["Department"] == "Prestataires Externes"))
verifie("préfixe téléphonique cohérent avec le site",
        all(l["OfficePhone"].startswith(sites[l["Office"]])
            for l in fr if l["OfficePhone"]),
        "01 Île-de-France, 03 Est, 04 Sud-Est")
tels = [l["OfficePhone"] for l in fr if l["OfficePhone"]]
verifie("numéros de téléphone uniques", len(set(tels)) == len(tels),
        "%d postes, %d agents sans téléphone" % (len(tels), len(fr) - len(tels)))
verifie("téléphones dans les plages réservées à la fiction",
        all(l["OfficePhone"][:8] in set(sites.values()) for l in fr if l["OfficePhone"]))
# « Marketing » s'écrit pareil dans les deux langues : on ne compte comme
# résiduel qu'un libellé anglais dont la traduction diffère.
anglais = {k for k, v in corr["departements"].items() if k != v}
anglais |= {k for k, v in corr["titres"].items() if k != v}
residus = (set(l["Department"] for l in fr) | set(l["Title"] for l in fr)) & anglais
verifie("aucun libellé anglais résiduel", not residus, ", ".join(sorted(residus)))

print()
if echecs:
    print("%d contrôle(s) en échec : %s" % (len(echecs), ", ".join(echecs)))
    sys.exit(1)
print("Tous les contrôles passent : même organisation, libellés et identités français.")
