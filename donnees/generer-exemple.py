# -*- coding: utf-8 -*-
"""
Fabrique ce que l'on met entre les mains d'un client, et qui sont deux choses
différentes.

**Les modèles** : trois fichiers minuscules et parfaitement propres, à remplir.
Trois agents, six habilitations, trois accès. Leur seul rôle est de montrer les
colonnes attendues et ce qu'on met dedans.

**Le jeu d'essai** : un export de cabinet comptable fictif, avec des défauts
volontaires. Il ne sert pas à être rempli mais à éprouver l'import.

Il ne ressemble volontairement pas au jeu de démonstration : en-têtes en
français, séparateur point-virgule, accents partout, et surtout des défauts que
l'on rencontre dans un vrai export. Chacun doit produire un message, pas un
plantage ni un silence :

  - une ligne sans matricule ;
  - un matricule en double ;
  - un responsable qui ne figure pas dans le fichier ;
  - une habilitation attribuée à quelqu'un d'absent de l'annuaire ;
  - un libellé de service qui contient le séparateur, donc entre guillemets ;
  - un prestataire qui détient un accès d'administration qui lui est interdit ;
  - une marque d'ordre des octets en tête du fichier d'annuaire.
"""
import csv
import io
import os

NANCY, STRAS = 'Nancy', 'Strasbourg'
AUDIT = 'Audit; commissariat aux comptes'  # contient le séparateur, exprès

# matricule, nom, service, fonction, site, responsable (matricule OU nom affiché)
AGENTS = [
    ('M001', 'Martine Weiss',    'Direction', 'Directrice associée',      NANCY,  ''),
    ('M002', 'Serge Klein',      'Direction', 'Directeur associé',        NANCY,  'M001'),

    ('M010', 'Hélène Muller',    'Expertise comptable', 'Chef de mission',            NANCY,  'Serge Klein'),
    ('M011', 'Julien Schmitt',   'Expertise comptable', 'Collaborateur comptable',    NANCY,  'M010'),
    ('M012', 'Camille Roth',     'Expertise comptable', 'Collaborateur comptable',    NANCY,  'M010'),
    ('M013', 'Nicolas Barth',    'Expertise comptable', 'Collaborateur comptable',    STRAS,  'M010'),
    ('M014', 'Sophie Kieffer',   'Expertise comptable', 'Collaborateur comptable',    STRAS,  'M010'),
    ('M015', 'Thomas Meyer',     'Expertise comptable', 'Collaborateur comptable',    NANCY,  'M010'),
    ('M016', 'Aurélie Zimmer',   'Expertise comptable', 'Collaborateur comptable',    STRAS,  'M010'),
    ('M017', 'Mathieu Lang',     'Expertise comptable', 'Collaborateur comptable',    NANCY,  'M010'),

    ('M020', 'Élodie Wagner',    'Paie social', 'Responsable pôle social',  NANCY,  'M002'),
    ('M021', 'Sébastien Fischer','Paie social', 'Gestionnaire de paie',     NANCY,  'M020'),
    ('M022', 'Laetitia Braun',   'Paie social', 'Gestionnaire de paie',     NANCY,  'M020'),
    ('M023', 'Guillaume Diss',   'Paie social', 'Gestionnaire de paie',     STRAS,  'M020'),
    ('M024', 'Marion Keller',    'Paie social', 'Gestionnaire de paie',     STRAS,  'M020'),

    ('M030', 'Vincent Haas',     AUDIT, 'Chef de mission', STRAS, 'M002'),
    ('M031', 'Céline Stoll',     AUDIT, 'Auditeur',        STRAS, 'M030'),
    ('M032', 'Romain Hoffmann',  AUDIT, 'Auditeur',        STRAS, 'M030'),
    # Responsable introuvable : doit être signalé, jamais deviné.
    ('M033', 'Émilie Petit',     AUDIT, 'Auditeur',        NANCY, 'MOREAU Luc'),

    ('M040', 'Antoine Gross',    'Informatique', 'Responsable informatique', NANCY, 'M001'),
    ('M041', 'Charlotte Simon',  'Informatique', 'Technicien',               NANCY, 'M040'),
    ('M042', 'Maxime Thiébaut',  'Informatique', 'Technicien',               STRAS, 'M040'),

    ('P001', 'Justine Colas',    'Prestataires', 'Collaborateur comptable', NANCY, 'M010'),
    ('P002', 'Benoît Mercier',   'Prestataires', 'Collaborateur comptable', STRAS, 'M010'),
    ('P003', 'Pauline Adam',     'Prestataires', 'Technicien',              NANCY, 'M040'),

    # Deux défauts volontaires, en fin de fichier.
    ('',     'Stagiaire non enregistré', 'Expertise comptable', 'Stagiaire', NANCY, 'M010'),
    ('M012', 'Camille Roth',     'Expertise comptable', 'Collaborateur comptable', NANCY, 'M010'),
]

CATALOGUE = [
    ('MSG',           'Messagerie',                        'Messagerie',       'Socle',    0, 0),
    ('INTRANET',      'Intranet du cabinet',               'Intranet',         'Socle',    0, 0),
    ('GED',           'Gestion documentaire',              'GED',              'Socle',    0, 0),
    ('BADGE-NCY',     'Badge — Nancy',                     "Contrôle d'accès", 'Site',     0, 0),
    ('BADGE-STR',     'Badge — Strasbourg',                "Contrôle d'accès", 'Site',     0, 0),
    ('IMP-NCY',       'Impression — Nancy',                'Impression',       'Site',     0, 0),
    ('IMP-STR',       'Impression — Strasbourg',           'Impression',       'Site',     0, 0),
    ('ECM-PROD',      'Production comptable',              'Cabinet',          'Métier',   0, 0),
    ('ECM-REVISION',  'Révision des dossiers',             'Cabinet',          'Métier',   0, 0),
    ('LIASSE',        'Liasse fiscale',                    'Cabinet',          'Métier',   0, 0),
    ('SILAE',         'Logiciel de paie',                  'Paie',             'Métier',   0, 1),
    ('DSN',           'Déclaration sociale nominative',    'Paie',             'Métier',   0, 1),
    ('CONTRAT',       'Contrats de travail',               'Paie',             'Sensible', 1, 1),
    ('AUDIT-DOSSIER', "Dossier d'audit",                   'Audit',            'Métier',   0, 0),
    ('CAC-SIGNATURE', 'Signature du commissaire aux comptes', 'Audit',         'Sensible', 1, 1),
    ('AD-ADMIN',      "Administration de l'annuaire",      'Annuaire',         'Sensible', 1, 1),
    ('SUPERVISION',   'Supervision du système',            'Annuaire',         'Métier',   0, 0),
    ('CONGES',        'Congés — self-service',             'SIRH',             'Fonction', 0, 1),
    ('NDF',           'Notes de frais',                    'Frais',            'Fonction', 0, 0),
]

ENCADRANTS = {'M001', 'M002', 'M010', 'M020', 'M030', 'M040'}
COMPTA = ['M010', 'M011', 'M012', 'M013', 'M014', 'M015', 'M016', 'M017']
PAIE = ['M020', 'M021', 'M022', 'M023', 'M024']
AUDITEURS = ['M030', 'M031', 'M032', 'M033']
INFO = ['M040', 'M041', 'M042']
PRESTA = ['P001', 'P002', 'P003']

# Un seul enregistrement par matricule, l'ordre du fichier faisant foi.
uniques, vus = [], set()
for a in AGENTS:
    if a[0] and a[0] not in vus:
        vus.add(a[0])
        uniques.append(a)

site_de = {a[0]: a[4] for a in uniques}
interne = [a[0] for a in uniques if a[2] != 'Prestataires']

droits = {m: set() for m in site_de}
for m in droits:
    droits[m].update(['MSG', 'INTRANET'])
    droits[m].add('BADGE-NCY' if site_de[m] == NANCY else 'BADGE-STR')
    droits[m].add('IMP-NCY' if site_de[m] == NANCY else 'IMP-STR')

# GED manque à deux personnes : un cas « à revoir » sur le socle.
for m in droits:
    if m not in ('M016', 'M023'):
        droits[m].add('GED')

for m in COMPTA + ['P001', 'P002']:
    droits[m].add('ECM-PROD')
for m in COMPTA[:7]:            # 7 sur 8 : à revoir
    droits[m].add('ECM-REVISION')
for m in COMPTA[:5]:            # 5 sur 8 : faible
    droits[m].add('LIASSE')

for m in PAIE:
    droits[m].update(['SILAE', 'DSN'])
for m in PAIE[:3]:
    droits[m].add('CONTRAT')

for m in AUDITEURS:
    droits[m].add('AUDIT-DOSSIER')
droits['M030'].add('CAC-SIGNATURE')

for m in INFO:
    droits[m].update(['AD-ADMIN', 'SUPERVISION'])

for m in interne:
    droits[m].add('CONGES')
for m in ENCADRANTS:
    droits[m].add('NDF')

# L'écart à faire remonter : un prestataire administrateur de l'annuaire.
droits['P003'].add('AD-ADMIN')

ici = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'exemples')
os.makedirs(ici, exist_ok=True)


def ecrire(nom, entetes, lignes, bom=False):
    chemin = os.path.join(ici, nom)
    with io.open(chemin, 'w', encoding='utf-8-sig' if bom else 'utf-8', newline='') as f:
        w = csv.writer(f, delimiter=';', quoting=csv.QUOTE_MINIMAL)
        w.writerow(entetes)
        w.writerows(lignes)
    return chemin


ecrire('jeu-essai-annuaire.csv',
       ['Matricule', 'Nom complet', 'Service', 'Fonction', 'Site', 'Responsable'],
       AGENTS, bom=True)

attributions = [(m, c) for m in sorted(droits) for c in sorted(droits[m])]
attributions.append(('M099', 'MSG'))  # agent absent de l'annuaire, exprès
ecrire('jeu-essai-habilitations.csv', ['Utilisateur', 'Groupe'], attributions)

ecrire('jeu-essai-catalogue.csv',
       ['Code', 'Libelle', 'Application', 'Categorie', 'Sensible', 'InterditPrestataire'],
       CATALOGUE)

# --- les modèles : propres, minuscules, faits pour être remplis ---
MODELE_ANNUAIRE = [
    ('jdupont',  'Jeanne Dupont', 'Direction financière', 'Directrice financière', 'Paris', ''),
    ('mlefevre', 'Marc Lefèvre',  'Comptabilité',         'Comptable',             'Paris', 'jdupont'),
    ('alaurent', 'Amina Laurent', 'Comptabilité',         'Comptable',             'Lyon',  'jdupont'),
]
MODELE_HABILITATIONS = [
    ('jdupont',  'MESSAGERIE'), ('jdupont',  'ERP-VALIDATION'),
    ('mlefevre', 'MESSAGERIE'), ('mlefevre', 'ERP-SAISIE'),
    ('alaurent', 'MESSAGERIE'), ('alaurent', 'ERP-SAISIE'),
]
MODELE_CATALOGUE = [
    ('MESSAGERIE',     'Messagerie',       'Messagerie', 'Socle',    0, 0),
    ('ERP-SAISIE',     'ERP — saisie',     'ERP',        'Métier',   0, 0),
    ('ERP-VALIDATION', 'ERP — validation', 'ERP',        'Sensible', 1, 1),
]

ecrire('modele-annuaire.csv',
       ['Identifiant', 'Nom complet', 'Service', 'Fonction', 'Site', 'Responsable'],
       MODELE_ANNUAIRE)
ecrire('modele-habilitations.csv', ['Identifiant', 'Acces'], MODELE_HABILITATIONS)
ecrire('modele-catalogue.csv',
       ['Code', 'Libelle', 'Application', 'Categorie', 'Sensible', 'InterditPrestataire'],
       MODELE_CATALOGUE)

print('modeles          : 3 agents, %d habilitations, %d acces'
      % (len(MODELE_HABILITATIONS), len(MODELE_CATALOGUE)))
print('jeu d essai      : %d lignes (%d matricules uniques), %d habilitations, %d acces'
      % (len(AGENTS), len(uniques), len(attributions), len(CATALOGUE)))
