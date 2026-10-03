#!/usr/bin/env bash
# Met en route Firebase pour le CRM : base Firestore, règles d'accès, application web,
# puis transmet la configuration au déploiement GitHub Pages.
# Usage : scripts/firebase-setup.sh <identifiant-du-projet-firebase>
set -euo pipefail
PROJECT="$1"
FB="npx -y firebase-tools@latest --project $PROJECT --non-interactive"

$FB firestore:databases:create "(default)" --location eur3 2>/dev/null || echo "Base Firestore déjà présente."
$FB deploy --only firestore:rules

APP_ID=$($FB apps:list WEB --json | node -e 'const r=JSON.parse(require("fs").readFileSync(0));const a=(r.result||[]).find(x=>x.displayName==="CRM");console.log(a?a.appId:"")')
if [ -z "$APP_ID" ]; then
  APP_ID=$($FB apps:create WEB CRM --json | node -e 'const r=JSON.parse(require("fs").readFileSync(0));console.log(r.result.appId)')
fi
CONFIG=$($FB apps:sdkconfig WEB "$APP_ID" --json | node -e 'const r=JSON.parse(require("fs").readFileSync(0));console.log(JSON.stringify(r.result.sdkConfig))')

for KEY in apiKey:FIREBASE_API_KEY authDomain:FIREBASE_AUTH_DOMAIN projectId:FIREBASE_PROJECT_ID appId:FIREBASE_APP_ID messagingSenderId:FIREBASE_MESSAGING_SENDER_ID; do
  VALUE=$(node -e "console.log(JSON.parse(process.argv[1])['${KEY%%:*}'])" "$CONFIG")
  gh variable set "${KEY##*:}" --body "$VALUE" -R agencesl68/crm-sl-agence
done
gh workflow run deploy.yml -R agencesl68/crm-sl-agence
echo "Configuration transmise ; mise en ligne relancée."
