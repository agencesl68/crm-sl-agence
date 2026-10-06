"""Assemble les plans (blueprints) des scénarios Make du CRM à partir du code du robot (make/robot/*.js).

    python3 make/build.py   →  make/build/<scénario>.json, à envoyer à Make (création ou mise à jour)

La clé de chiffrement de la session du robot (make/robot/.cle) et le secret du webhook du formulaire
(make/robot/.secret) ne sont jamais versionnés : ils ne vivent que dans les scénarios Make.
"""
import json
import pathlib

ICI = pathlib.Path(__file__).parent
ROBOT = ICI / 'robot'
SORTIE = ICI / 'build'
SORTIE.mkdir(exist_ok=True)
CLE = (ROBOT / '.cle').read_text().strip()
SECRET = (ROBOT / '.secret').read_text().strip()
LIB = (ROBOT / 'lib.js').read_text().replace('__CLE__', CLE)

# Connexions Make existantes
GMAIL = 8240966        # agence.sl.68@gmail.com
SHEETS = 7002860       # sachamuller79@gmail.com
QONTO_LECTURE = 11524695
CLAUDE = 6844605
TELEGRAM = 6854129
TELEGRAM_CHAT = '1809097361'
API_KEY = 'AIzaSyBxNglyyDMlQutjYa52ESkcylA9NqhBBm4'
REGEX = r'^(sachamuller79@gmail\.com|loic\.bistch8@gmail\.com|agence\.sl\.68@gmail\.com)$'
FEUILLE = 'spreadsheets/1ezfWA_cG5FTScFTlTUhY5xu0PCnSRjv1vc65xgtujIk/values/A2:J1000'
HOOK_PASSERELLE = 3834744
HOOK_DEMANDE = 3834858
URL_DEMANDE = 'https://hook.eu1.make.com/n5f8l7rfbvkb6dbmj6wkccc5vpf6khsk'

META = {'instant': True, 'version': 1, 'scenario': {'dlq': False, 'dataloss': False, 'maxErrors': 3, 'autoCommit': True, 'roundtrips': 1, 'sequential': False, 'confidential': False}}
CORS = [{'key': 'Access-Control-Allow-Origin', 'value': '*'}, {'key': 'Content-Type', 'value': 'application/json; charset=utf-8'}]
_pos = [0]


def m(id, module, version, mapper=None, parameters=None, **extra):
    _pos[0] += 1
    return {'id': id, 'module': module, 'version': version, 'parameters': parameters or {}, 'mapper': mapper if mapper is not None else {},
            'metadata': {'designer': {'x': 300 * _pos[0], 'y': 0}}, **extra}


def code(id, script, inputs, **extra):
    src = LIB + '\n\n' + (ROBOT / script).read_text()
    return m(id, 'code:ExecuteCode', 1, {'language': 'javascript', 'inputFormat': 'editor', 'codeEditorJavascript': src,
                                         'input': [{'name': k, 'value': v} for k, v in inputs.items()]}, **extra)


def repondre(id, body, status=200):
    return m(id, 'gateway:WebhookRespond', 1, {'status': status, 'body': body, 'headers': CORS})


def ignorer(id):
    return {'id': id, 'module': 'builtin:Ignore', 'version': 1, 'parameters': {}, 'mapper': None, 'metadata': {'designer': {'x': 0, 'y': 0}}}


def echec_passerelle(id, message):
    return [repondre(id, json.dumps({'erreur': message}, ensure_ascii=False), 502), ignorer(id + 1)]


def telegram(id, texte, **extra):
    return m(id, 'telegram:SendReplyMessage', 1, {'text': texte, 'chatId': TELEGRAM_CHAT, 'parseMode': 'HTML', 'replyMarkup': '', 'messageThreadId': '',
                                                  'replyToMessageId': '', 'replyMarkupAssembleType': 'reply_markup_enter'}, {'__IMTCONN__': TELEGRAM}, **extra)


def alerte(id, quoi):
    """Gestion d'erreur : prévient sur Telegram, puis continue sans bloquer le scénario."""
    return [telegram(id, f'⚠️ <b>Robot du CRM</b> : {quoi}\n<i>{{{{error.message}}}}</i>'), ignorer(id + 1)]


def filtre(nom, *groupes):
    return {'name': nom, 'conditions': [list(g) for g in groupes]}


def cond(a, o, b=None):
    c = {'a': a, 'o': o}
    if b is not None:
        c['b'] = b
    return c


def associe(action):
    return filtre(f'Associé connecté — {action}', [
        cond('{{2.statusCode}}', 'number:equal', '200'),
        cond('{{2.data.users[1].email}}', 'text:pattern:ci', REGEX),
        cond('{{2.data.users[1].emailVerified}}', 'boolean:equal', 'true'),
        cond('{{1.action}}', 'text:equal', action)])


NOMS = {'passerelle': 'CRM - Passerelle du site', 'robot-demande': 'CRM - Robot : nouvelle demande du site',
        'robot-emails': 'CRM - Robot : e-mails des clients', 'robot-matin': 'CRM - Robot du matin (relances, Qonto, point du jour)'}


def ecrire(nom, flow, scheduling=None):
    for mod in flow:
        if mod['module'] == 'builtin:BasicRouter':
            mod['mapper'] = None
    bp = {'name': NOMS[nom], 'flow': flow, 'metadata': {**META, 'instant': scheduling is None}}
    (SORTIE / f'{nom}.json').write_text(json.dumps({'blueprint': bp, 'scheduling': scheduling or {'type': 'immediately'}}, ensure_ascii=False))


MAILS = {'id': '{{%d.id}}', 'thread': '{{%d.threadId}}', 'date': '{{%d.internalDate}}', 'from': '{{%d.headers.From}}', 'to': '{{%d.headers.To}}',
         'cc': '{{%d.headers.Cc}}', 'subject': '{{%d.subject}}', 'snippet': '{{%d.snippet}}', 'labels': '{{%d.labelIds}}'}


def agreger(id, source, corps_max):
    return m(id, 'builtin:BasicAggregator', 1, {**{k: v % source for k, v in MAILS.items()}, 'body': f'{{{{substring({source}.fullTextBody; 0; {corps_max})}}}}'}, {'feeder': source})


# ───────────── Passerelle du site (le CRM appelle Make, après vérification du jeton Google) ─────────────
_pos[0] = 0
corps_html = '{{replace(replace(replace(1.body; "&"; "&amp;"); "<"; "&lt;"); newline; "<br>")}}'
passerelle = [
    m(1, 'gateway:CustomWebHook', 1, parameters={'hook': HOOK_PASSERELLE, 'maxResults': 1}),
    m(2, 'http:MakeRequest', 4, {
        'url': 'https://identitytoolkit.googleapis.com/v1/accounts:lookup', 'method': 'post', 'queryParameters': [{'name': 'key', 'value': API_KEY}],
        'contentType': 'json', 'inputMethod': 'jsonString', 'jsonStringBodyContent': '{"idToken":"{{1.token}}"}', 'parseResponse': True,
        'stopOnHttpError': False, 'timeout': 20, 'allowRedirects': True, 'shareCookies': False, 'requestCompressedContent': True},
      {'authenticationType': 'noAuth'}, onerror=echec_passerelle(90, 'Vérification de la connexion impossible, réessayez.')),
    m(3, 'builtin:BasicRouter', 1, None, routes=[
        {'flow': [dict(repondre(40, '{"erreur": "acces"}', 403), filter=filtre('Accès refusé',
            [cond('{{2.statusCode}}', 'number:notequal', '200')],
            [cond('{{2.data.users[1].email}}', 'text:notpattern:ci', REGEX)],
            [cond('{{2.data.users[1].emailVerified}}', 'boolean:notequal', 'true')]))]},
        {'flow': [
            m(10, 'qonto:readOrganization', 2, {}, {'__IMTCONN__': QONTO_LECTURE}, filter=associe('qonto'), onerror=echec_passerelle(80, 'Qonto ne répond pas pour le moment.')),
            m(11, 'json:TransformToJSON', 1, {'object': '{{10.organization}}'}),
            m(12, 'qonto:makeApiCall', 2, {'url': 'v2/client_invoices', 'method': 'GET', 'qs': [{'key': 'per_page', 'value': '100'}, {'key': 'sort_by', 'value': 'created_at:desc'}]},
              {'__IMTCONN__': QONTO_LECTURE}, onerror=echec_passerelle(82, 'Qonto ne répond pas pour le moment.')),
            m(13, 'json:TransformToJSON', 1, {'object': '{{12.body}}'}),
            repondre(14, '{"organisation":{{11.json}},"factures":{{13.json}}}')]},
        {'flow': [
            m(20, 'google-sheets:makeAPICall', 2, {'qs': [], 'url': FEUILLE, 'method': 'GET', 'headers': []}, {'__IMTCONN__': SHEETS},
              filter=associe('demandes'), onerror=echec_passerelle(84, 'Le tableau des demandes est inaccessible.')),
            m(21, 'json:TransformToJSON', 1, {'object': '{{20.body}}'}),
            repondre(22, '{{21.json}}')]},
        {'flow': [
            m(30, 'google-email:sendAnEmail', 4, {'to': ['{{1.to}}'], 'subject': '{{1.subject}}', 'bodyType': 'rawHtml', 'content': corps_html},
              {'__IMTCONN__': GMAIL}, filter=associe('email'), onerror=echec_passerelle(86, 'Gmail a refusé l’envoi.')),
            repondre(31, '{"message_id":"{{30.id}}","thread_id":"{{30.threadId}}"}')]},
        {'flow': [
            m(50, 'google-email:replyToAnEmail', 4, {'threadId': '{{1.thread}}', 'replyMode': 'custom', 'to': ['{{1.to}}'], 'bodyType': 'rawHtml', 'content': corps_html},
              {'__IMTCONN__': GMAIL}, filter=associe('repondre'), onerror=echec_passerelle(88, 'Gmail a refusé l’envoi de la réponse.')),
            repondre(51, '{"message_id":"{{50.id}}","thread_id":"{{50.threadId}}"}')]},
        {'flow': [
            m(60, 'google-email:executeEmailSearchQuery', 4, {'filterType': 'gmailSearch', 'q': '{{ifempty(1.q; "in:inbox")}}', 'limit': 40, 'format': 'full', 'includeHtmlBody': False},
              {'__IMTCONN__': GMAIL}, filter=associe('boite'), onerror=echec_passerelle(92, 'Gmail ne répond pas pour le moment.')),
            agreger(61, 60, 20000),
            m(62, 'json:TransformToJSON', 1, {'object': '{{61.array}}'}),
            repondre(63, '{"messages":{{62.json}}}')]},
        {'flow': [
            m(70, 'google-email:markAnEmailAsRead', 4, {'messageId': '{{1.id}}'}, {'__IMTCONN__': GMAIL}, filter=associe('lu'), onerror=echec_passerelle(94, 'Gmail ne répond pas.')),
            repondre(71, '{"ok":true}')]},
        {'flow': [
            code(75, 'acces.js', {'refresh': '{{1.refresh}}', 'token': '{{1.token}}', 'email': '{{2.data.users[1].email}}'},
                 filter=associe('robot'), onerror=echec_passerelle(96, 'Activation du robot impossible.')),
            repondre(76, '{"ok":true}')]},
    ]),
]
ecrire('passerelle', passerelle)

# ───────────── Robot : nouvelle demande du site (appelé par « Formulaire Contact SL Agence ») ─────────────
_pos[0] = 0
champs_formulaire = ['date', 'prenom', 'nom', 'entreprise', 'email', 'telephone', 'theme', 'message', 'source', 'objet', 'corps']
demande = [
    m(1, 'gateway:CustomWebHook', 1, parameters={'hook': HOOK_DEMANDE, 'maxResults': 1}),
    code(2, 'demande.js', {k: f'{{{{1.{k}}}}}' for k in champs_formulaire},
         filter=filtre('Appel du formulaire', [cond('{{1.cle}}', 'text:equal', SECRET)]),
         onerror=[m(91, 'google-email:createADraft', 4, {'to': ['{{1.email}}'], 'subject': '{{1.objet}}', 'bodyType': 'rawHtml',
                                                        'content': '{{replace(replace(replace(1.corps; "&"; "&amp;"); "<"; "&lt;"); newline; "<br>")}}'}, {'__IMTCONN__': GMAIL}),
                  telegram(92, '⚠️ <b>Nouvelle demande de {{1.prenom}} {{1.nom}} ({{1.entreprise}})</b>\nLe CRM n’a pas pu l’enregistrer : <i>{{error.message}}</i>\n'
                               'Elle est dans le tableau et un brouillon de réponse est prêt dans Gmail.\n✉️ {{1.email}} · 📞 {{1.telephone}}'),
                  ignorer(93)]),
    telegram(3, '{{2.result.telegram}}', filter=filtre('Notification', [cond('{{2.result.telegram}}', 'text:notequal', '')])),
    m(4, 'builtin:BasicRouter', 1, None, routes=[
        {'flow': [m(10, 'google-email:sendAnEmail', 4, {'to': ['{{2.result.to}}'], 'subject': '{{2.result.subject}}', 'bodyType': 'rawHtml', 'content': '{{2.result.body}}'},
                    {'__IMTCONN__': GMAIL}, filter=filtre('Réponse automatique', [cond('{{2.result.action}}', 'text:equal', 'envoi')]),
                    onerror=alerte(80, 'la réponse automatique à {{2.result.to}} n’est pas partie.'))]},
        {'flow': [m(20, 'google-email:createADraft', 4, {'to': ['{{2.result.to}}'], 'subject': '{{2.result.subject}}', 'bodyType': 'rawHtml', 'content': '{{2.result.body}}'},
                    {'__IMTCONN__': GMAIL}, filter=filtre('Brouillon', [cond('{{2.result.action}}', 'text:equal', 'brouillon')]),
                    onerror=alerte(82, 'le brouillon de réponse à {{2.result.to}} n’a pas pu être créé.'))]},
    ]),
]
ecrire('robot-demande', demande)

# ───────────── Robot : e-mails (toutes les 30 min, 7 h – 21 h, lundi → samedi) ─────────────
_pos[0] = 0
emails = [
    m(1, 'google-email:executeEmailSearchQuery', 4, {'filterType': 'gmailSearch', 'limit': 50, 'format': 'full', 'includeHtmlBody': False,
                                                     'q': 'newer_than:1h -in:drafts -in:chats -category:promotions -category:social -category:forums'},
      {'__IMTCONN__': GMAIL}),
    agreger(2, 1, 4000),
    code(3, 'emails.js', {'mails': '{{2.array}}'}, filter=filtre('E-mails trouvés', [cond('{{length(2.array)}}', 'number:greater', '0')]), onerror=alerte(90, 'la lecture des e-mails a échoué.')),
    telegram(4, '{{3.result.telegram}}', filter=filtre('Réponses reçues', [cond('{{3.result.telegram}}', 'text:notequal', '')])),
]
ecrire('robot-emails', emails, {'type': 'indefinitely', 'interval': 1800, 'restrict': [{'days': [1, 2, 3, 4, 5, 6], 'time': ['07:00', '21:00']}]})

# ───────────── Robot du matin (lundi → vendredi, 7 h 30) ─────────────
_pos[0] = 0
matin = [
    m(1, 'qonto:readOrganization', 2, {}, {'__IMTCONN__': QONTO_LECTURE}),
    m(2, 'json:TransformToJSON', 1, {'object': '{{1.organization}}'}),
    m(3, 'qonto:makeApiCall', 2, {'url': 'v2/client_invoices', 'method': 'GET', 'qs': [{'key': 'per_page', 'value': '100'}, {'key': 'sort_by', 'value': 'created_at:desc'}]},
      {'__IMTCONN__': QONTO_LECTURE}),
    m(4, 'json:TransformToJSON', 1, {'object': '{{3.body}}'}),
    code(5, 'matin1.js', {'organisation': '{{2.json}}', 'factures': '{{4.json}}'}, onerror=alerte(87, 'le robot du matin n’a pas pu lire le CRM.')),
    m(6, 'anthropic-claude:makeAnApiCall', 1, {'url': '/v1/messages', 'method': 'POST', 'body': '{{5.result.ia}}',
                                              'headers': [{'key': 'Content-Type', 'value': 'application/json'}, {'key': 'anthropic-version', 'value': '2023-06-01'}]},
      {'__IMTCONN__': CLAUDE}, onerror=alerte(86, 'Claude n’a pas répondu : pas de relance ni de point du jour ce matin.')),
    code(7, 'matin2.js', {'plan': '{{5.result.plan}}', 'claude': '{{6.body.content[].text}}'}, onerror=alerte(88, 'l’étape « relances » du robot du matin a échoué.')),
    telegram(8, '{{7.result.telegram}}', filter=filtre('Point du jour', [cond('{{7.result.telegram}}', 'text:notequal', '')]), onerror=[ignorer(85)]),
    m(9, 'builtin:BasicFeeder', 1, {'array': '{{7.result.envois}}'}),
    m(10, 'builtin:BasicRouter', 1, None, routes=[
        {'flow': [m(20, 'google-email:sendAnEmail', 4, {'to': ['{{9.to}}'], 'subject': '{{9.subject}}', 'bodyType': 'rawHtml', 'content': '{{9.body}}'},
                    {'__IMTCONN__': GMAIL}, filter=filtre('Nouvel e-mail', [cond('{{9.mode}}', 'text:equal', 'envoi')]), onerror=alerte(80, 'l’e-mail à {{9.to}} n’est pas parti.'))]},
        {'flow': [m(30, 'google-email:replyToAnEmail', 4, {'threadId': '{{9.thread}}', 'replyMode': 'custom', 'to': ['{{9.to}}'], 'bodyType': 'rawHtml', 'content': '{{9.body}}'},
                    {'__IMTCONN__': GMAIL}, filter=filtre('Réponse dans la conversation', [cond('{{9.mode}}', 'text:equal', 'reponse')]),
                    onerror=alerte(82, 'la relance à {{9.to}} n’est pas partie.'))]},
        {'flow': [m(40, 'google-email:createADraft', 4, {'to': ['{{9.to}}'], 'subject': '{{9.subject}}', 'bodyType': 'rawHtml', 'content': '{{9.body}}'},
                    {'__IMTCONN__': GMAIL}, filter=filtre('Brouillon', [cond('{{9.mode}}', 'text:equal', 'brouillon')]), onerror=alerte(84, 'le brouillon pour {{9.to}} n’a pas pu être créé.'))]},
    ]),
]
ecrire('robot-matin', matin, {'type': 'weekly', 'days': [1, 2, 3, 4, 5], 'time': '07:30'})

# ───────────── Formulaire Contact SL Agence (scénario existant) : remet la suite au robot ─────────────
form = json.loads((ICI / 'formulaire.original.json').read_text())
flow = form['flow'][:4]
brouillon, alerte_tg = form['flow'][4], form['flow'][5]
alerte_tg = {**alerte_tg, 'id': 91, 'mapper': {**alerte_tg['mapper'], 'text': alerte_tg['mapper']['text'].replace(
    '✅ Ajouté au tableau + brouillon de réponse prêt dans Gmail.', '⚠️ Le CRM n’a pas répondu : demande ajoutée au tableau + brouillon de réponse prêt dans Gmail.')}}
flow.append({'id': 7, 'module': 'http:MakeRequest', 'version': 4, 'parameters': {'authenticationType': 'noAuth'},
             'metadata': {'designer': {'x': 1200, 'y': 0}},
             'mapper': {'url': URL_DEMANDE, 'method': 'post', 'contentType': 'urlEncoded', 'parseResponse': False, 'stopOnHttpError': True, 'timeout': 30,
                        'allowRedirects': True, 'shareCookies': False, 'requestCompressedContent': True,
                        'urlEncodedBodyContent': [{'name': 'cle', 'value': SECRET}] + [{'name': k, 'value': f'{{{{1.{k}}}}}'} for k in champs_formulaire[:9]]
                        + [{'name': 'objet', 'value': '{{4.objet}}'}, {'name': 'corps', 'value': '{{4.corps}}'}]},
             'onerror': [{**brouillon, 'id': 90}, alerte_tg, ignorer(92)]})
form['flow'] = flow
(SORTIE / 'formulaire.json').write_text(json.dumps({'blueprint': form, 'scheduling': {'type': 'immediately'}}, ensure_ascii=False))

print('\n'.join(sorted(p.name for p in SORTIE.glob('*.json'))))
