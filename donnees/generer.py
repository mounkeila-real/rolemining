# -*- coding: utf-8 -*-
"""
Génère la couche d'habilitations par-dessus l'organisation francisée.

Entrée  : ADUsers-fr.csv (272 agents, organisation Contoso)
Sorties : habilitations.csv  — export type « appartenance aux groupes »
          catalogue.csv      — le référentiel des accès
          ../public/donnees/jeu.json — le jeu complet consommé par l'outil web

Tout est déterministe : la sélection des porteurs d'un accès dérive d'une
empreinte de (identifiant, accès). Deux exécutions produisent le même fichier,
et l'ordre du CSV d'entrée n'a aucune influence.
"""
import collections
import csv
import hashlib
import json
import os

from catalogue import ACCES_PRESTATAIRE, CATALOGUE, REGLES

RACINE_WEB = os.path.join("..", "public", "donnees")

# ------------------------------------------------------------------ entrée --
lignes = list(csv.DictReader(open("ADUsers-fr.csv", encoding="utf-8-sig")))
sam_de_dn = {l["DistinguishedName"]: l["SamAccountName"] for l in lignes}

agents = {}
for l in lignes:
    agents[l["SamAccountName"]] = {
        "sam":          l["SamAccountName"],
        "nom":          l["Name"],
        "departement":  l["Department"],
        "titre":        l["Title"],
        "site":         l["Office"],
        "responsable":  sam_de_dn.get(l["Manager"]) if l["Manager"] else None,
        "prestataire":  l["Department"] == "Prestataires Externes",
    }

# Département d'accueil d'un prestataire : celui de son responsable.
for a in agents.values():
    a["accueil"] = None
    if a["prestataire"] and a["responsable"]:
        a["accueil"] = agents[a["responsable"]]["departement"]

catalogue = {
    code: {
        "code": code, "nom": nom, "application": app, "categorie": cat,
        "sensible": bool(sensible), "interditPrestataire": bool(interdit),
    }
    for code, nom, app, cat, sensible, interdit in CATALOGUE
}

detenus = collections.defaultdict(set)   # sam -> {codes}
trace = []                               # journal des décisions, pour le README


def empreinte(*parties):
    return int(hashlib.md5("|".join(parties).encode("utf-8")).hexdigest(), 16)


def attribuer(code, taux, eligibles, motif):
    """Donne l'accès à exactement round(taux * n) éligibles, toujours les mêmes."""
    if not eligibles:
        return 0
    ordonnes = sorted(eligibles, key=lambda s: empreinte(s, code))
    k = round(taux * len(ordonnes))
    for sam in ordonnes[:k]:
        detenus[sam].add(code)
    trace.append((code, motif, len(ordonnes), k))
    return k


# ------------------------------------------------- 1. règles du catalogue --
internes = [a for a in agents.values() if not a["prestataire"]]
for code, taux, condition in REGLES:
    eligibles = [a["sam"] for a in internes if condition(a)]
    attribuer(code, taux, eligibles, "règle")

# --------------------------------------- 2. prestataires : accès restreint --
# Un prestataire reprend les accès NON sensibles du département de son
# responsable, et seulement ceux qui y sont universels (règle à 100 %).
socle_par_dept = collections.defaultdict(list)
for code, taux, condition in REGLES:
    if taux < 1.0 or catalogue[code]["sensible"] or catalogue[code]["interditPrestataire"]:
        continue
    if catalogue[code]["categorie"] in ("Socle", "Site"):
        continue
    for dept in set(a["departement"] for a in internes):
        temoin = {"departement": dept, "titre": "Commercial", "site": "Paris",
                  "prestataire": False}
        if condition(temoin):
            socle_par_dept[dept].append(code)

prestataires = [a for a in agents.values() if a["prestataire"]]
for dept, codes in socle_par_dept.items():
    concernes = [a["sam"] for a in prestataires if a["accueil"] == dept]
    for code in codes:
        attribuer(code, 0.95, concernes, "prestataire — accueil %s" % dept)

# Les accès du socle et du site s'appliquent aussi aux prestataires.
for code, taux, condition in REGLES:
    if catalogue[code]["categorie"] not in ("Socle", "Site"):
        continue
    eligibles = [a["sam"] for a in prestataires if condition(a)]
    attribuer(code, taux, eligibles, "prestataire — socle et site")

# Et le suivi des temps, qu'ils saisissent comme les internes.
attribuer("FCT-TEMPS", 1.00, [a["sam"] for a in prestataires], "prestataire — temps")

for code in ACCES_PRESTATAIRE:
    concernes = [a["sam"] for a in prestataires
                 if a["accueil"] == "Conseil en Stratégie"]
    attribuer(code, 1.00, concernes, "prestataire — mission de conseil")

# ------------------------------------------------------- 3. dérive subie --
# Environ un agent sur douze conserve un accès qui ne correspond plus à son
# poste : reprise d'un ancien service, remplacement jamais retiré. Ces accès
# doivent rester SOUS le seuil et ne jamais être recommandés.
metiers = [c for c, d in catalogue.items()
           if d["categorie"] == "Métier" and not d["sensible"]]
derive = 0
for sam, a in sorted(agents.items()):
    if empreinte(sam, "derive") % 12:
        continue
    for n in range(1 + empreinte(sam, "derive-n") % 2):
        code = metiers[empreinte(sam, "derive-%d" % n) % len(metiers)]
        if code not in detenus[sam]:
            detenus[sam].add(code)
            derive += 1
trace.append(("—", "dérive subie", len(agents), derive))

# ------------------------------------------------ 4. accès à l'abandon --
# Quatre outils que plus personne n'administre, encore détenus par une poignée.
obsoletes = {"OBS-GED2003": 6, "OBS-FTP": 3, "OBS-CRM1": 9, "OBS-INTRANET1": 2}
for code, combien in obsoletes.items():
    tous = sorted(agents)
    porteurs = sorted(tous, key=lambda s: empreinte(s, "obs-" + code))[:combien]
    for sam in porteurs:
        detenus[sam].add(code)
    trace.append((code, "outil à l'abandon", len(tous), combien))

# --------------------------------------------------- 5. écarts à détecter --
# Volontaires et documentés : ce sont les cas que l'outil doit remonter.
#  - des prestataires détenant un accès qui leur est interdit ;
#  - des internes hors DSI détenant des accès d'administration.
ecarts = []


def forcer(sam, code, raison):
    detenus[sam].add(code)
    ecarts.append({"agent": sam, "acces": code, "raison": raison})


presta_tries = sorted(a["sam"] for a in prestataires)
for sam, code in zip(presta_tries[:3], ["COFFRE-SECRETS", "TRESORERIE", "PAIE"]):
    forcer(sam, code, "accès interdit aux prestataires, jamais retiré")

hors_dsi = sorted(a["sam"] for a in internes
                  if a["departement"] not in ("Direction Informatique",
                                              "Ingénierie et Production"))
for sam, code in zip(hors_dsi[:2], ["AD-ADMIN", "POSTE-CONSOLE"]):
    forcer(sam, code, "administration détenue hors de la DSI")

commerciaux = sorted(a["sam"] for a in internes
                     if a["departement"] == "Direction Commerciale")
forcer(commerciaux[0], "CRM-EXPORT", "export de la base clients hors du périmètre")

# ------------------------------------------------------------- 6. sorties --
attributions = {sam: sorted(codes) for sam, codes in sorted(detenus.items()) if codes}
total = sum(len(c) for c in attributions.values())

with open("habilitations.csv", "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f, quoting=csv.QUOTE_ALL)
    w.writerow(["SamAccountName", "Acces"])
    for sam, codes in attributions.items():
        for code in codes:
            w.writerow([sam, code])

with open("catalogue.csv", "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f, quoting=csv.QUOTE_ALL)
    w.writerow(["Code", "Libelle", "Application", "Categorie", "Sensible",
                "InterditPrestataire"])
    for d in catalogue.values():
        w.writerow([d["code"], d["nom"], d["application"], d["categorie"],
                    int(d["sensible"]), int(d["interditPrestataire"])])

os.makedirs(RACINE_WEB, exist_ok=True)
with open(os.path.join(RACINE_WEB, "jeu.json"), "w", encoding="utf-8") as f:
    json.dump(
        {
            "source": "Organisation Contoso francisée + couche d'habilitations générée",
            "agents": [agents[s] for s in sorted(agents)],
            "catalogue": [catalogue[c] for c in sorted(catalogue)],
            "attributions": attributions,
            "ecartsConnus": ecarts,
        },
        f, ensure_ascii=False, separators=(",", ":"),
    )

print("%d agents, %d accès au catalogue, %d attributions (%.1f par agent)"
      % (len(agents), len(catalogue), total, total / len(agents)))
print("%d écarts volontaires, %d accès de dérive" % (len(ecarts), derive))
print("jeu.json : %.0f Ko"
      % (os.path.getsize(os.path.join(RACINE_WEB, "jeu.json")) / 1024))
