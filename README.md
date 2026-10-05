# SL Agence — CRM

Outil interne de SL Agence (Sacha et Loïc) : pipeline de leads, clients, devis, factures Qonto, abonnements,
finances, Instagram, tâches et agenda.

## Où il tourne

- **GitHub Pages** : https://agencesl68.github.io/crm-sl-agence/ — chaque envoi sur `main` reconstruit et met en ligne
  le site (`.github/workflows/deploy.yml`). Données dans **Firebase** (Firestore, offre gratuite), connexion avec les
  comptes Google des associés ; les règles d'accès sont dans `firestore.rules`. Sans configuration Firebase, le site
  s'ouvre en mode démonstration.
- **claude.ai** : la même application publiée comme artifact (`npm run build:crm`) et une démo (`npm run build:apercu`).
- **En local** : `npm install` puis `npm run dev` (démo, ou Firebase si `.env` est rempli).

### Mettre Firebase en route

1. console.firebase.google.com → Ajouter un projet (Google Analytics inutile).
2. Authentication → Commencer → Google → Activer. Puis Paramètres → Domaines autorisés → ajouter `agencesl68.github.io`.
3. Firestore Database → Créer une base (mode production, région `eur3`). Onglet Règles → coller `firestore.rules`.
4. Paramètres du projet → Vos applications → Web → enregistrer l'application, puis recopier la configuration dans les
   variables du dépôt GitHub (`FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`,
   `FIREBASE_MESSAGING_SENDER_ID`) et relancer « Mise en ligne ».

## Branchements (Make)

La page appelle des scénarios Make « à la demande » du dossier **CRM SL Agence**, via le connecteur Make de claude.ai
(chaque associé doit l'avoir ajouté dans claude.ai → Réglages → Connecteurs). Voir `make/README.md`.

## Règles intégrées

- Les **factures sont émises par Qonto**, à son format ; le CRM prépare les données et suit le paiement.
- Un devis reçoit son numéro (`SLA-2026-003`, la numérotation reprend après 001 et 002) à la validation.
- Devis validé → lead en « Devis envoyé » ; devis accepté → lead en « Gagné ».
- Un lead « Contacté » ou « Devis envoyé » sans activité depuis 3, 7 puis 14 jours est signalé « À relancer ».

## Prospection par e-mail

Onglet **Prospection** : import d'un fichier CSV par cible (gestion de patrimoine, formation, courtage, immobilier,
cabinet comptable, autre), puis chaque matin : « Préparer les mails du jour », relecture, envoi.

- Séquence fixe de 3 messages : premier mail (J0), relance avec un exemple concret (J+4), dernier message (J+9).
  Les modèles sont dans `src/lib/prospection.ts`.
- Prospect importé : seuls l'objet et la phrase d'accroche du premier mail sont rédigés par Claude, à partir du site
  et des informations du fichier ; consigne stricte de ne rien inventer. Sans Claude, une accroche de secours est utilisée.
- Plafond de 20 envois par jour, tous associés confondus (`DAILY_LIMIT`). Les relances passent en premier.
- Une adresse déjà connue (prospect ou contact client) n'est jamais importée deux fois. « Ne plus contacter » est
  définitif ; chaque message propose de répondre « stop ».
- « A répondu » crée l'entreprise, le contact et un lead « Contacté » (source Prospection) dans le pipeline.

### Recherche automatique (version GitHub)

Bouton **« Trouver les prospects du jour »** : le CRM trouve seul de nouveaux prospects et prépare leur premier mail ;
il ne reste qu'à relire et envoyer. Pour chaque entreprise :

1. **Base officielle des entreprises** (API Recherche d'entreprises, gratuite, appelée directement par le navigateur) :
   entreprises actives, 1 à 49 salariés (plus les indépendants pour la gestion de patrimoine et le courtage),
   département et page tirés au hasard. Filtres par cible dans `CIBLES` (`src/lib/prospection.ts`, champ `recherche`).
2. **Site officiel** : Claude (`claude-haiku-4-5`) avec la recherche web, 2 recherches au plus, annuaires exclus ;
   le site n'est retenu que si la confiance est d'au moins 7/10 et qu'il figure dans les résultats.
3. **Lecture du site** par la passerelle Make : accueil, puis jusqu'à 3 pages (contact, mentions légales, à propos,
   services, recrutement).
4. **E-mail** cherché dans le code du CRM (`extractEmails`, `src/lib/recherche.ts`) : adresse d'un dirigeant, autre
   adresse nominative, contact@/accueil@/info@, puis messagerie grand public présentée comme celle de l'entreprise.
   Jamais d'adresse devinée ; adresses d'agences web, d'hébergeurs et techniques exclues.
5. **Analyse et rédaction** par Claude : note de pertinence, raison, signaux, objet et corps du mail (80 à 120 mots).
   Le CRM ajoute « Bonjour {prénom}, » (seulement si l'adresse est celle d'un dirigeant), la signature et la ligne « stop ».

Entreprise sans site, sans email ou notée sous le minimum : rangée dans l'onglet **Écartés** (table `prospect_rejects`),
jamais revérifiée ni repayée ; « Remettre en file » la revérifie sans note minimale, avec un site ou un e-mail donné à la main.

- La place du jour vaut `DAILY_LIMIT` moins les envois du jour, les brouillons en attente et la file (relances d'abord).
- Réglages partagés dans le panneau « Recherche automatique » : cibles (gestion de patrimoine et formation par défaut),
  zone (France entière ou départements), note minimale (6), plafond d'entreprises vérifiées par jour (60).
- Une panne (réseau, Make, Claude) fait passer à l'entreprise suivante ; 5 erreurs d'affilée arrêtent la recherche.
- Sur chaque brouillon, « Pourquoi ce prospect » montre la note, la raison, les signaux et le lien du site ;
  « Nouvelle accroche » relance l'analyse.
- Mode démo : 3 prospects fictifs, sans aucun appel réseau. Version claude.ai : non proposée (il faut la passerelle).
- Tests des fonctions pures (e-mails, pages, nettoyage du HTML, réponses de Claude) : `npm test`.
