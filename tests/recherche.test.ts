// Tests des fonctions pures de la recherche automatique : `npm test` (Node 22, sans dépendance).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  claudeText, extractEmails, htmlToText, parseAnalyse, parseClaudeJson, parseDepartements, parseEntreprise,
  parseSiteAnswer, pickInternalPages, siteText, type Dirigeant,
} from '../src/lib/recherche.ts'

const roux: Dirigeant[] = [{ prenom: 'Julien', nom: 'Roux', qualite: 'Gérant' }]
const martin: Dirigeant[] = [{ prenom: 'Claire', nom: 'Martin', qualite: 'Présidente de SAS' }]

// ───────────── E-mails ─────────────

test('mailto simple', () => {
  const html = '<footer><a href="mailto:contact@cabinet-martin.fr?subject=Bonjour">Écrivez-nous</a></footer>'
  assert.deepEqual(extractEmails(html, 'cabinet-martin.fr', martin), ['contact@cabinet-martin.fr'])
})

test('adresse écrite « [at] » et « (arobase) … (point) »', () => {
  assert.deepEqual(extractEmails('<p>Contact : claire.martin [at] martin-patrimoine.fr</p>', 'www.martin-patrimoine.fr', martin), ['claire.martin@martin-patrimoine.fr'])
  assert.deepEqual(extractEmails('<p>accueil (arobase) roux-formation (point) fr</p>', 'roux-formation.fr', roux), ['accueil@roux-formation.fr'])
  assert.deepEqual(extractEmails('<p>contact&#64;roux-formation.fr</p>', 'roux-formation.fr', roux), ['contact@roux-formation.fr'])
})

test('adresses de l’agence web et de l’hébergeur exclues', () => {
  const html = `
    <h1>Mentions légales</h1>
    <p>Éditeur : Bernard Courtage, contact@bernard-courtage.fr</p>
    <p>Site réalisé par Pixel Studio – hello@pixel-studio.fr</p>
    <p>Hébergeur : OVH, 2 rue Kellermann, Roubaix, support@ovh.com</p>
    <p>Création du site : Jean Web, jeanweb68@gmail.com</p>`
  assert.deepEqual(extractEmails(html, 'bernard-courtage.fr', []), ['contact@bernard-courtage.fr'])
})

test('deux adresses : la nominative du dirigeant passe devant contact@', () => {
  const html = '<p>Écrivez à <a href="mailto:contact@roux-formation.fr">contact@roux-formation.fr</a> ou directement à j.roux@roux-formation.fr</p>'
  assert.deepEqual(extractEmails(html, 'roux-formation.fr', roux), ['j.roux@roux-formation.fr', 'contact@roux-formation.fr'])
})

test('ordre complet : dirigeant, nominative, générique, messagerie grand public, recrutement', () => {
  const html = `<p>recrutement@cab-durand.fr</p><p>Accueil : cabinet.durand@orange.fr</p><p>info@cab-durand.fr</p>
    <p>sophie.klein@cab-durand.fr</p><p>m.durand@cab-durand.fr</p>`
  const d: Dirigeant[] = [{ prenom: 'Marc', nom: 'Durand', qualite: 'Gérant' }]
  assert.deepEqual(extractEmails(html, 'cab-durand.fr', d), [
    'm.durand@cab-durand.fr', 'sophie.klein@cab-durand.fr', 'info@cab-durand.fr', 'cabinet.durand@orange.fr', 'recrutement@cab-durand.fr',
  ])
})

test('page sans e-mail, adresses techniques et images ignorées', () => {
  assert.deepEqual(extractEmails('<p>Appelez-nous au 03 89 00 00 00. Prise de rendez-vous par téléphone.</p>', 'exemple-cabinet.fr', []), [])
  const html = '<img src="/img/logo@2x.png"><p>noreply@cabinet-x.fr</p><p>email@domaine.fr</p><script>var dsn="https://abc@o1.ingest.sentry.io"</script>'
  assert.deepEqual(extractEmails(html, 'cabinet-x.fr', []), [])
})

test('adresse d’un tiers sans rapport avec le site exclue, marque proche acceptée', () => {
  const html = '<p>partenaire@banque-populaire.fr</p><p>contact@martinpatrimoine.com</p>'
  assert.deepEqual(extractEmails(html, 'martin-patrimoine.fr', martin), ['contact@martinpatrimoine.com'])
})

// ───────────── Pages et texte ─────────────

test('choix des pages internes : contact, mentions légales, qui sommes-nous', () => {
  const html = `<nav>
    <a href="/">Accueil</a><a href="#top">Haut</a>
    <a href="https://www.facebook.com/cabinet">Facebook</a>
    <a href="/docs/plaquette.pdf">Plaquette</a>
    <a href="/qui-sommes-nous/">Le cabinet</a>
    <a href="https://www.cabinet-x.fr/contact">Nous écrire</a>
    <a href="mentions-legales.html">Mentions légales</a>
    <a href="/nos-expertises">Expertises</a></nav>`
  assert.deepEqual(pickInternalPages(html, 'https://cabinet-x.fr/'), [
    'https://www.cabinet-x.fr/contact', 'https://cabinet-x.fr/mentions-legales.html', 'https://cabinet-x.fr/qui-sommes-nous/',
  ])
})

test('nettoyage du HTML : sans scripts, styles ni menu, entités décodées', () => {
  const html = '<html><head><title>X</title><style>p{}</style></head><body><nav><a href="/">Accueil</a></nav><script>alert(1)</script><h1>Cabinet&nbsp;Martin</h1><p>Gestion de patrimoine &amp; retraite des libéraux.</p></body></html>'
  assert.equal(htmlToText(html), 'Cabinet Martin\nGestion de patrimoine & retraite des libéraux.')
})

test('texte du site : lignes répétées retirées, limite respectée', () => {
  const pages = [
    { url: 'https://a.fr/', html: '<footer><p>Cabinet A, 3 rue Haute, Colmar</p></footer><p>Nous accompagnons les professions libérales.</p>' },
    { url: 'https://a.fr/contact', html: '<footer><p>Cabinet A, 3 rue Haute, Colmar</p></footer><p>Rendez-vous uniquement par téléphone.</p>' },
  ]
  const text = siteText(pages, 8000)
  assert.equal(text.split('Cabinet A, 3 rue Haute').length, 2)
  assert.match(text, /uniquement par téléphone/)
  assert.ok(siteText(pages, 120).length <= 120)
})

// ───────────── Réponses de Claude ─────────────

test('JSON entouré de texte et de balises', () => {
  const text = 'Voici mon analyse.\n```json\n{"pertinence": 8, "raison": "Petit cabinet — beaucoup de dossiers.", "signaux": ["Prise de rendez-vous par téléphone"], "destinataire": "Claire", "objet": "Vos dossiers retraite.", "corps": "Bonjour Claire,\\n\\nVous accompagnez les professions libérales sur leur retraite. Comment suivez-vous les pièces à collecter ?"}\n```\nBonne journée !'
  const a = parseAnalyse(text)
  assert.ok(a)
  assert.equal(a.pertinence, 8)
  assert.equal(a.raison, 'Petit cabinet, beaucoup de dossiers.')
  assert.equal(a.objet, 'Vos dossiers retraite')
  assert.equal(a.corps.startsWith('Vous accompagnez'), true)
  assert.equal(parseClaudeJson('pas de JSON ici {incomplet'), null)
  assert.deepEqual(parseClaudeJson('{"a": "accolade } dans le texte"} puis {"b": 2}'), { b: 2 })
})

test('site officiel : confiance, annuaires et adresse vue dans les résultats', () => {
  const results = { type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://www.ace-patrimoine.fr/contact' }, { type: 'web_search_result', url: 'https://www.pappers.fr/entreprise/ace' }] }
  const answer = (json: string) => ({ content: [{ type: 'text', text: 'Je cherche.' }, { type: 'server_tool_use' }, results, { type: 'text', text: json }] })
  assert.equal(claudeText(answer('{"site": null}')), '{"site": null}')
  assert.equal(parseSiteAnswer(answer('Trouvé : {"site": "https://www.ace-patrimoine.fr/?utm=x", "confiance": 9}')), 'https://www.ace-patrimoine.fr/')
  assert.equal(parseSiteAnswer(answer('{"site": "https://www.ace-patrimoine.fr", "confiance": 5}')), null)
  assert.equal(parseSiteAnswer(answer('{"site": "https://www.pappers.fr/entreprise/ace", "confiance": 9}')), null)
  assert.equal(parseSiteAnswer(answer('{"site": "https://ace-invente.fr", "confiance": 10}')), null)
})

// ───────────── Base officielle ─────────────

test('lecture d’une entreprise de la base officielle', () => {
  const e = parseEntreprise({
    siren: '890139959', nom_complet: "ORIGIN'L PATRIMOINE (ORIGIN'L IMMOBILIER ET PATRIMOINE)", nom_raison_sociale: "ORIGIN'L PATRIMOINE",
    activite_principale: '66.19B', tranche_effectif_salarie: 'NN', date_creation: '2020-09-30',
    siege: { libelle_commune: 'ASPACH-MICHELBACH', code_postal: '68700', departement: '68', nom_commercial: null },
    dirigeants: [
      { nom: "D'ALESSANDRO", prenoms: 'FANNY MARIE', qualite: 'Gérant', type_dirigeant: 'personne physique' },
      { denomination: 'EFAC', qualite: 'Commissaire aux comptes', type_dirigeant: 'personne morale' },
    ],
  })
  assert.deepEqual(e, {
    siren: '890139959', nom: "Origin'l Patrimoine", ville: 'Aspach-Michelbach', code_postal: '68700', departement: '68',
    naf: '66.19B', effectif: 'sans salarié', creation: '2020-09-30', dirigeants: [{ prenom: 'Fanny', nom: "D'Alessandro", qualite: 'Gérant' }],
  })
  assert.deepEqual(parseDepartements('68, 67 ;2a 9 999'), ['68', '67', '2A', '09'])
})
