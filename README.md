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
- Seuls l'objet et la phrase d'accroche du premier mail sont rédigés par Claude, à partir du site et des
  informations du fichier ; consigne stricte de ne rien inventer. Sans Claude, une accroche de secours est utilisée.
- Plafond de 20 envois par jour, tous associés confondus (`DAILY_LIMIT`). Les relances passent en premier.
- Une adresse déjà connue (prospect ou contact client) n'est jamais importée deux fois. « Ne plus contacter » est
  définitif ; chaque message propose de répondre « stop ».
- « A répondu » crée l'entreprise, le contact et un lead « Contacté » (source Prospection) dans le pipeline.
