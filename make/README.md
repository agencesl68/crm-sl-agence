# Scénarios Make du CRM

Dossier **CRM SL Agence** dans Make. Chaque scénario est « à la demande » : la page du CRM l'exécute et lit sa sortie.

| Scénario | Rôle | Sorties |
| --- | --- | --- |
| **CRM - Meteo** (7743450) | Prévisions Open-Meteo (latitude, longitude en entrée) | `meteo` (JSON) |
| **CRM - Qonto comptes et factures** (7743454) | Solde des comptes et factures clients, connexion Qonto en lecture seule | `comptes`, `factures` (JSON) |
| **CRM - Envoyer un email** (7743455) | Envoi depuis agence.sl.68@gmail.com (destinataire, objet, message en entrée) | `message_id` |
| **CRM - Demandes du site** (7743456) | Lignes du tableau Google Sheets alimenté par le formulaire du site | `lignes` (JSON) |

À venir, dès que les connexions sont autorisées : création des clients et factures dans Qonto (connexion « Qonto
facturation »), opérations bancaires, statistiques et publication Instagram.
