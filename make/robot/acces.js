// Passerelle, action « robot » : le CRM confie au robot la session de l'associé connecté (chiffrée).
const { refresh, token, email } = input
if (!refresh || String(refresh).length < 20) throw new Error('Session absente')
const iv = crypto.randomBytes(12)
const c = crypto.createCipheriv('aes-256-gcm', Buffer.from(CLE, 'hex'), iv)
const blob = Buffer.concat([c.update(String(refresh), 'utf8'), c.final()])
await base(token).ecrire([
  { col: 'robot', id: 'acces', data: { blob: blob.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), email: email || null, at: maintenant() } },
  journal('robot-acces', true, `Robot actif avec le compte ${email}`),
])
return { ok: true }
