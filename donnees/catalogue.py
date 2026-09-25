# -*- coding: utf-8 -*-
"""
Catalogue des habilitations et règles d'attribution.

Séparé du générateur pour qu'on puisse le relire sans lire le code : c'est la
partie que l'on montre à un client pour qu'il reconnaisse son propre paysage
applicatif.

Chaque règle porte un TAUX de couverture délibéré. C'est le levier qui rend la
démonstration lisible : un accès à 1.00 doit ressortir en recommandation forte,
un accès à 0.93 doit ressortir « à revoir », un accès à 0.70 ne doit pas être
recommandé du tout. Sans ces paliers voulus, l'outil n'aurait rien à montrer.
"""

# ---------------------------------------------------------------- catalogue --
# categorie : Socle | Site | Fonction | Métier | Sensible | Obsolète
# sensible  : demande une validation humaine même à 100 %
# interdit_prestataire : jamais affectable à un prestataire, quel que soit le
#                        pourcentage — c'est un marqueur porté par l'accès.
CATALOGUE = [
    # --- socle ---
    ("SOC-MSG",      "Messagerie — boîte aux lettres",        "Messagerie",   "Socle",    0, 0),
    ("SOC-INTRA",    "Intranet — lecture",                    "Intranet",     "Socle",    0, 0),
    ("SOC-DOC",      "Espace documentaire commun",            "Documentaire", "Socle",    0, 0),
    ("SOC-VPN",      "Accès distant VPN",                     "Réseau",       "Socle",    0, 0),

    # --- site ---
    ("SITE-BADGE-PAR", "Badge — site de Paris",               "Contrôle d'accès", "Site", 0, 0),
    ("SITE-BADGE-MTZ", "Badge — site de Metz",                "Contrôle d'accès", "Site", 0, 0),
    ("SITE-BADGE-LYO", "Badge — site de Lyon",                "Contrôle d'accès", "Site", 0, 0),
    ("SITE-IMP-PAR",   "Impression — site de Paris",          "Impression",   "Site",     0, 0),
    ("SITE-IMP-MTZ",   "Impression — site de Metz",           "Impression",   "Site",     0, 0),
    ("SITE-IMP-LYO",   "Impression — site de Lyon",           "Impression",   "Site",     0, 0),
    ("SITE-WIFI-PAR",  "Wi-Fi interne — Paris",               "Réseau",       "Site",     0, 0),
    ("SITE-WIFI-MTZ",  "Wi-Fi interne — Metz",                "Réseau",       "Site",     0, 0),
    ("SITE-WIFI-LYO",  "Wi-Fi interne — Lyon",                "Réseau",       "Site",     0, 0),

    # --- fonction transverse ---
    ("FCT-CONGES",    "Congés — self-service",                "SIRH",         "Fonction", 0, 1),
    ("FCT-FORM",      "Formation — catalogue et inscription",  "SIRH",         "Fonction", 0, 1),
    ("FCT-NDF",       "Notes de frais — saisie",              "Frais",        "Fonction", 0, 0),
    ("FCT-NDF-VALID", "Notes de frais — validation",          "Frais",        "Fonction", 0, 1),
    ("FCT-TEMPS",     "Suivi des temps — saisie",             "Temps",        "Fonction", 0, 0),
    ("FCT-ENTRETIEN", "Entretiens annuels — encadrant",       "SIRH",         "Fonction", 0, 1),
    ("FCT-ORG",       "Organigramme — vue étendue",           "Intranet",     "Fonction", 0, 0),

    # --- métier : commerce ---
    ("CRM-LEC",       "CRM — lecture",                        "CRM",          "Métier",   0, 0),
    ("CRM-SAISIE",    "CRM — saisie",                         "CRM",          "Métier",   0, 0),
    ("CRM-PILOT",     "CRM — tableaux de bord",               "CRM",          "Métier",   0, 0),
    ("CRM-SEGMENT",   "CRM — segmentation",                   "CRM",          "Métier",   0, 0),
    ("CRM-EXPORT",    "CRM — export de la base clients",      "CRM",          "Sensible", 1, 1),
    ("CRM-ADMIN",     "CRM — administration",                 "CRM",          "Sensible", 1, 1),
    ("DEVIS-CREA",    "Devis — création",                     "Devis",        "Métier",   0, 0),
    ("DEVIS-VALID",   "Devis — validation",                   "Devis",        "Métier",   0, 1),
    ("TARIF-CONSULT", "Grille tarifaire — consultation",      "Devis",        "Métier",   0, 0),
    ("TARIF-REMISE",  "Grille tarifaire — remises",           "Devis",        "Sensible", 1, 1),
    ("MARGE-CONSULT", "Marges — consultation",                "Pilotage",     "Sensible", 1, 1),
    ("PROSPECT-BASE", "Base prospects",                       "CRM",          "Métier",   0, 0),

    # --- métier : conseil et projet ---
    ("MISSION-PORT",  "Portail des missions",                 "Conseil",      "Métier",   0, 0),
    ("DOC-METHODO",   "Référentiel méthodologique",           "Documentaire", "Métier",   0, 0),
    ("LIVRABLE-CLI",  "Espace livrables client",              "Documentaire", "Métier",   0, 0),
    ("PM-OUTIL",      "Gestion de projet — planification",    "Projet",       "Métier",   0, 0),
    ("PM-BUDGET",     "Gestion de projet — budget",           "Projet",       "Métier",   0, 1),
    ("DOC-PROJET",    "Référentiel documentaire projet",      "Documentaire", "Métier",   0, 0),
    ("RISQUE-REG",    "Registre des risques",                 "Projet",       "Métier",   0, 0),

    # --- métier : contenu et marketing ---
    ("CMS-REDAC",     "CMS — rédaction",                      "CMS",          "Métier",   0, 0),
    ("CMS-PUBLI",     "CMS — publication",                    "CMS",          "Métier",   0, 0),
    ("MEDIATHEQUE",   "Médiathèque",                          "CMS",          "Métier",   0, 0),
    ("PAO",           "Chaîne graphique PAO",                 "PAO",          "Métier",   0, 0),
    ("MARQUE-CHARTE", "Charte de marque",                     "Documentaire", "Métier",   0, 0),
    ("CAMPAGNE",      "Campagnes marketing",                  "Marketing",    "Métier",   0, 0),
    ("MEDIA-PLAN",    "Planification média",                  "Marketing",    "Métier",   0, 0),
    ("RESEAUX-SOC",   "Comptes réseaux sociaux",              "Marketing",    "Sensible", 1, 1),

    # --- métier : industrie ---
    ("GMAO",          "GMAO — maintenance",                   "GMAO",         "Métier",   0, 0),
    ("SUPERVISION",   "Supervision atelier",                  "GMAO",         "Métier",   0, 0),
    ("PLM-PLANS",     "PLM — plans et nomenclatures",         "PLM",          "Métier",   0, 0),
    ("PLM-VALID",     "PLM — validation des plans",           "PLM",          "Métier",   0, 1),
    ("BADGE-ATELIER", "Badge — zone atelier",                 "Contrôle d'accès", "Métier", 0, 0),
    ("EPI-DOTATION",  "Dotation des équipements de protection", "GMAO",       "Métier",   0, 0),

    # --- métier : exploitation et achats ---
    ("ERP-LEC",       "ERP — lecture",                        "ERP",          "Métier",   0, 0),
    ("LOGISTIQUE",    "Logistique — expéditions",             "ERP",          "Métier",   0, 0),
    ("STOCK",         "Stocks — mouvements",                  "ERP",          "Métier",   0, 0),
    ("ACHAT-DEM",     "Achats — demande",                     "Achats",       "Métier",   0, 0),
    ("ACHAT-VALID",   "Achats — validation",                  "Achats",       "Sensible", 1, 1),
    ("FOURN-PORTAIL", "Portail fournisseurs",                 "Achats",       "Métier",   0, 0),

    # --- sensible : finance, RH, IT, direction ---
    ("COMPTA-SAISIE", "Comptabilité — saisie",                "ERP",          "Métier",   0, 1),
    ("COMPTA-VALID",  "Comptabilité — validation",            "ERP",          "Sensible", 1, 1),
    ("FACTURE-FOURN", "Factures fournisseurs",                "ERP",          "Métier",   0, 1),
    ("TRESORERIE",    "Trésorerie — virements",               "Trésorerie",   "Sensible", 1, 1),
    ("SIRH-DOSSIER",  "SIRH — dossiers des agents",           "SIRH",         "Sensible", 1, 1),
    ("PAIE",          "Paie — bulletins et variables",        "SIRH",         "Sensible", 1, 1),
    ("RECRUTEMENT",   "Recrutement — candidatures",           "SIRH",         "Métier",   0, 1),
    ("CONTRAT-MOD",   "Modèles de contrat de travail",        "SIRH",         "Métier",   0, 1),
    ("AD-ADMIN",      "Annuaire — administration",            "Annuaire",     "Sensible", 1, 1),
    ("POSTE-CONSOLE", "Console de gestion des postes",        "Poste",        "Sensible", 1, 1),
    ("SUPERVISION-IT", "Supervision du système d'information", "Poste",       "Métier",   0, 0),
    ("COFFRE-SECRETS", "Coffre de secrets techniques",        "Sécurité",     "Sensible", 1, 1),
    ("SAUVEGARDE",    "Sauvegardes — restauration",           "Sécurité",     "Sensible", 1, 1),
    ("BI-CODIR",      "Décisionnel — vue direction",          "Décisionnel",  "Sensible", 1, 1),
    ("JURIDIQUE-CTR", "Contrats — base juridique",            "Juridique",    "Sensible", 1, 1),
    ("DIR-TABLEAU",   "Tableau de bord de direction",         "Décisionnel",  "Sensible", 1, 1),

    # --- obsolète : détenu par une poignée de personnes, plus personne ne sait pourquoi ---
    ("OBS-GED2003",   "GED historique (2003)",                "Legacy",       "Obsolète", 0, 0),
    ("OBS-FTP",       "Serveur FTP de transfert",             "Legacy",       "Obsolète", 1, 1),
    ("OBS-CRM1",      "Ancien CRM — lecture seule",           "Legacy",       "Obsolète", 0, 0),
    ("OBS-INTRANET1", "Ancien intranet",                      "Legacy",       "Obsolète", 0, 0),
]

SIEGE = "Paris"

# Départements dont les prestataires reprennent une partie des accès.
# Un prestataire n'a pas de « métier » propre : il travaille dans le
# département de son responsable.
ACCES_PRESTATAIRE = ["FCT-TEMPS", "DOC-PROJET", "MISSION-PORT", "LIVRABLE-CLI"]


def encadrant(titre):
    debuts = ("Responsable", "Directeur", "Chef de projet", "Président",
              "Vice-président", "Contrôleur")
    return titre.startswith(debuts)


def se_deplace(titre):
    return (encadrant(titre)
            or titre.startswith(("Commercial", "Consultant", "Chargé"))
            or "grands comptes" in titre)


# ------------------------------------------------------------------ règles --
# (accès, taux de couverture, condition)
# La condition reçoit un dict avec : departement, titre, site, prestataire.
REGLES = [
    # --- socle : la factorisation doit remonter ces accès à la racine ---
    ("SOC-MSG",   1.00, lambda a: True),
    ("SOC-INTRA", 1.00, lambda a: True),
    ("SOC-DOC",   1.00, lambda a: True),
    # VPN volontairement à 96 % : cas « à revoir » au niveau le plus haut.
    ("SOC-VPN",   0.96, lambda a: True),

    # --- site : 100 %, c'est la démonstration de l'automatisme par attribut ---
    ("SITE-BADGE-PAR", 1.00, lambda a: a["site"] == "Paris"),
    ("SITE-BADGE-MTZ", 1.00, lambda a: a["site"] == "Metz"),
    ("SITE-BADGE-LYO", 1.00, lambda a: a["site"] == "Lyon"),
    ("SITE-WIFI-PAR",  1.00, lambda a: a["site"] == "Paris"),
    ("SITE-WIFI-MTZ",  1.00, lambda a: a["site"] == "Metz"),
    ("SITE-WIFI-LYO",  1.00, lambda a: a["site"] == "Lyon"),
    # Impression : dérive légère, un cas « à revoir » par site.
    ("SITE-IMP-PAR",   0.94, lambda a: a["site"] == "Paris"),
    ("SITE-IMP-MTZ",   0.97, lambda a: a["site"] == "Metz"),
    ("SITE-IMP-LYO",   0.91, lambda a: a["site"] == "Lyon"),

    # --- fonction : transverse aux départements et aux sites ---
    ("FCT-CONGES",    1.00, lambda a: not a["prestataire"]),
    ("FCT-FORM",      0.93, lambda a: not a["prestataire"]),
    ("FCT-ORG",       0.88, lambda a: not a["prestataire"]),
    ("FCT-NDF",       1.00, lambda a: not a["prestataire"] and se_deplace(a["titre"])),
    ("FCT-NDF-VALID", 1.00, lambda a: not a["prestataire"] and encadrant(a["titre"])),
    ("FCT-ENTRETIEN", 0.95, lambda a: not a["prestataire"] and encadrant(a["titre"])),
    ("FCT-TEMPS",     1.00, lambda a: a["departement"] in (
        "Gestion de Projet", "Conseil en Stratégie", "Conseil Gestion de Contenu")),

    # --- Direction Commerciale ---
    ("CRM-LEC",       1.00, lambda a: a["departement"] == "Direction Commerciale"),
    ("CRM-SAISIE",    1.00, lambda a: a["departement"] == "Direction Commerciale"),
    ("TARIF-CONSULT", 1.00, lambda a: a["departement"] == "Direction Commerciale"),
    ("DEVIS-CREA",    0.97, lambda a: a["departement"] == "Direction Commerciale"),
    ("PROSPECT-BASE", 0.86, lambda a: a["departement"] == "Direction Commerciale"),
    ("TARIF-REMISE",  0.44, lambda a: a["departement"] == "Direction Commerciale"),
    # Accès régional : même intitulé, périmètre différent selon le site.
    ("CRM-SEGMENT",   1.00, lambda a: a["departement"] == "Direction Commerciale"
                                      and a["site"] == "Paris"),

    # --- Pilotage des Affaires ---
    ("CRM-LEC",     1.00, lambda a: a["departement"] == "Pilotage des Affaires"),
    ("CRM-PILOT",   1.00, lambda a: a["departement"] == "Pilotage des Affaires"),
    ("DEVIS-VALID", 0.94, lambda a: a["departement"] == "Pilotage des Affaires"),
    ("MARGE-CONSULT", 0.78, lambda a: a["departement"] == "Pilotage des Affaires"),

    # --- Conseil en Stratégie ---
    ("MISSION-PORT", 1.00, lambda a: a["departement"] == "Conseil en Stratégie"),
    ("DOC-METHODO",  1.00, lambda a: a["departement"] == "Conseil en Stratégie"),
    ("LIVRABLE-CLI", 0.92, lambda a: a["departement"] == "Conseil en Stratégie"),

    # --- Gestion de Projet ---
    ("PM-OUTIL",   1.00, lambda a: a["departement"] == "Gestion de Projet"),
    ("DOC-PROJET", 1.00, lambda a: a["departement"] == "Gestion de Projet"),
    ("RISQUE-REG", 0.90, lambda a: a["departement"] == "Gestion de Projet"),
    ("PM-BUDGET",  1.00, lambda a: a["departement"] == "Gestion de Projet"
                                   and encadrant(a["titre"])),

    # --- Conseil Gestion de Contenu (mono-site Lyon) ---
    ("CMS-REDAC",   1.00, lambda a: a["departement"] == "Conseil Gestion de Contenu"),
    ("MEDIATHEQUE", 1.00, lambda a: a["departement"] == "Conseil Gestion de Contenu"),
    ("CMS-PUBLI",   0.55, lambda a: a["departement"] == "Conseil Gestion de Contenu"),
    ("DOC-PROJET",  0.89, lambda a: a["departement"] == "Conseil Gestion de Contenu"),

    # --- Ingénierie et Production (mono-site Metz) ---
    ("GMAO",          1.00, lambda a: a["departement"] == "Ingénierie et Production"),
    ("BADGE-ATELIER", 1.00, lambda a: a["departement"] == "Ingénierie et Production"),
    ("EPI-DOTATION",  1.00, lambda a: a["departement"] == "Ingénierie et Production"),
    ("PLM-PLANS",     0.95, lambda a: a["departement"] == "Ingénierie et Production"),
    ("SUPERVISION",   0.80, lambda a: a["departement"] == "Ingénierie et Production"),
    ("PLM-VALID",     1.00, lambda a: a["departement"] == "Ingénierie et Production"
                                      and a["titre"].startswith(("Ingénieur senior",
                                                                 "Responsable"))),

    # --- Exploitation ---
    ("ERP-LEC",       1.00, lambda a: a["departement"] == "Exploitation"),
    ("ACHAT-DEM",     0.96, lambda a: a["departement"] == "Exploitation"),
    ("LOGISTIQUE",    0.71, lambda a: a["departement"] == "Exploitation"),
    ("STOCK",         0.67, lambda a: a["departement"] == "Exploitation"),
    ("FOURN-PORTAIL", 0.83, lambda a: a["departement"] == "Exploitation"),
    ("ACHAT-VALID",   1.00, lambda a: a["departement"] == "Exploitation"
                                      and a["titre"] == "Responsable des achats"),

    # --- Stratégie CRM (9 personnes, siège) ---
    ("CRM-LEC",     1.00, lambda a: a["departement"] == "Stratégie CRM"),
    ("CRM-SEGMENT", 1.00, lambda a: a["departement"] == "Stratégie CRM"),
    ("CRM-ADMIN",   0.33, lambda a: a["departement"] == "Stratégie CRM"),
    ("CRM-EXPORT",  0.55, lambda a: a["departement"] == "Stratégie CRM"),

    # --- Marketing ---
    ("CAMPAGNE",      1.00, lambda a: a["departement"] == "Marketing"),
    ("MARQUE-CHARTE", 1.00, lambda a: a["departement"] == "Marketing"),
    ("MEDIA-PLAN",    0.80, lambda a: a["departement"] == "Marketing"),
    ("MEDIATHEQUE",   0.90, lambda a: a["departement"] == "Marketing"),
    ("RESEAUX-SOC",   0.30, lambda a: a["departement"] == "Marketing"),

    # --- Comptabilité ---
    ("ERP-LEC",       1.00, lambda a: a["departement"] == "Comptabilité"),
    ("COMPTA-SAISIE", 1.00, lambda a: a["departement"] == "Comptabilité"),
    ("FACTURE-FOURN", 0.86, lambda a: a["departement"] == "Comptabilité"),
    ("COMPTA-VALID",  0.43, lambda a: a["departement"] == "Comptabilité"),
    ("TRESORERIE",    0.29, lambda a: a["departement"] == "Comptabilité"),

    # --- Ressources Humaines (3 personnes : sous le seuil) ---
    ("SIRH-DOSSIER", 1.00, lambda a: a["departement"] == "Ressources Humaines"),
    ("RECRUTEMENT",  1.00, lambda a: a["departement"] == "Ressources Humaines"),
    ("CONTRAT-MOD",  1.00, lambda a: a["departement"] == "Ressources Humaines"),
    ("PAIE",         0.67, lambda a: a["departement"] == "Ressources Humaines"),

    # --- Direction Informatique (1 personne : sous le seuil) ---
    ("AD-ADMIN",       1.00, lambda a: a["departement"] == "Direction Informatique"),
    ("POSTE-CONSOLE",  1.00, lambda a: a["departement"] == "Direction Informatique"),
    ("SUPERVISION-IT", 1.00, lambda a: a["departement"] == "Direction Informatique"),
    ("COFFRE-SECRETS", 1.00, lambda a: a["departement"] == "Direction Informatique"),
    ("SAUVEGARDE",     1.00, lambda a: a["departement"] == "Direction Informatique"),

    # --- Création et Ingénierie (1 personne chacun) ---
    ("PAO",           1.00, lambda a: a["departement"] == "Création"),
    ("MEDIATHEQUE",   1.00, lambda a: a["departement"] == "Création"),
    ("MARQUE-CHARTE", 1.00, lambda a: a["departement"] == "Création"),
    ("PLM-PLANS",     1.00, lambda a: a["departement"] == "Ingénierie"),
    ("GMAO",          1.00, lambda a: a["departement"] == "Ingénierie"),

    # --- Direction Générale et Comité de Direction ---
    ("DIR-TABLEAU",   1.00, lambda a: a["departement"] in ("Direction Générale",
                                                           "Comité de Direction")),
    ("BI-CODIR",      0.93, lambda a: a["departement"] in ("Direction Générale",
                                                           "Comité de Direction")),
    ("JURIDIQUE-CTR", 0.60, lambda a: a["departement"] in ("Direction Générale",
                                                           "Comité de Direction")),
    ("MARGE-CONSULT", 1.00, lambda a: a["departement"] in ("Direction Générale",
                                                           "Comité de Direction")),
]
