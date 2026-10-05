# Scénarios Make du CRM

Dossier **CRM SL Agence** dans Make.

## Version GitHub (Firebase) : la passerelle

**CRM - Passerelle du site** (7753729), webhook `https://hook.eu1.make.com/2p75wts26dmnulzkmaxp1vjedkpv7491`
(variable de dépôt `MAKE_GATEWAY`). Plan : [`passerelle.blueprint.json`](passerelle.blueprint.json).

1. Le CRM envoie `action`, le jeton Google de l'associé connecté (`token`) et les champs utiles, en formulaire.
2. Make vérifie le jeton auprès de Google (`accounts:lookup`) : seuls les comptes des associés passent, sinon
   réponse 403. L'adresse du webhook peut donc être publique.
3. Selon `action` : `qonto` (organisation et 100 dernières factures clients, connexion en lecture seule),
   `demandes` (tableau Google Sheets du formulaire du site), `email` (envoi depuis agence.sl.68@gmail.com).
4. Le CRM range la réponse dans Firestore (mêmes règles que la version claude.ai : dédoublonnage, rattachement
   des factures aux clients).

5. Prospection (onglet Prospection du CRM) :
   - `site` : lit la page d'accueil du site d'un prospect (`site`) et renvoie `texte`, ses 4 000 premiers caractères
     sans balises. En cas d'échec, `texte` est vide et le mail est rédigé sans le site.
   - `rediger` : envoie `prompt` à l'API Claude (modèle `claude-haiku-4-5`) et renvoie `texte`, la réponse brute.
     **La clé API Anthropic se colle dans le module HTTP « api.anthropic.com » (en-tête `x-api-key`), jamais dans
     le dépôt** : le plan contient `COLLER_ICI_LA_CLE_API_ANTHROPIC` à la place.

Le CRM appelle la passerelle à l'ouverture du tableau de bord (demandes toutes les 10 min, Qonto toutes les
15 min par navigateur), avec les boutons « Synchroniser Qonto » et « Demandes du site », et à chaque e-mail.

## Version claude.ai : scénarios à la demande

Chaque scénario est « à la demande » : la page du CRM l'exécute et lit sa sortie.

| Scénario | Rôle | Sorties |
| --- | --- | --- |
| **CRM - Meteo** (7743450) | Prévisions Open-Meteo (latitude, longitude en entrée) | `meteo` (JSON) |
| **CRM - Qonto comptes et factures** (7743454) | Solde des comptes et factures clients, connexion Qonto en lecture seule | `comptes`, `factures` (JSON) |
| **CRM - Envoyer un email** (7743455) | Envoi depuis agence.sl.68@gmail.com (destinataire, objet, message en entrée) | `message_id` |
| **CRM - Demandes du site** (7743456) | Lignes du tableau Google Sheets alimenté par le formulaire du site | `lignes` (JSON) |

À venir, dès que les connexions sont autorisées : création des clients et factures dans Qonto (connexion « Qonto
facturation »), opérations bancaires, statistiques et publication Instagram.

## Prospection par e-mail : mise en route

1. console.anthropic.com → créer une clé API et ajouter quelques euros de crédit (compter environ un centime par
   premier mail rédigé ; les relances ne passent pas par Claude).
2. Dans Make, scénario **CRM - Passerelle du site** : ajouter les deux routes `site` et `rediger` du plan
   `passerelle.blueprint.json` (ou réimporter le plan), coller la clé dans l'en-tête `x-api-key`, enregistrer.
3. Les e-mails partent de la même connexion Gmail que les autres envois du CRM. Pour envoyer depuis une adresse
   dédiée à la prospection, il suffira de changer la connexion du module Gmail.
