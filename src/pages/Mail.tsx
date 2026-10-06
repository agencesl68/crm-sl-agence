import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Inbox, Mail as MailIcon, PenLine, RefreshCw, Reply, Search, Send, UserPlus } from 'lucide-react'
import { ComposeEmail } from '../components/shared'
import { Badge, Button, Card, Empty, Input, PageHeader, Tabs, Textarea, useAction } from '../components/ui'
import { gateway, MAKE_READY } from '../lib/make'
import { ago, contactName, fmtDateTime } from '../lib/format'
import { useStore } from '../lib/store'
import type { Contact, Deal } from '../lib/types'

/** Un e-mail tel que Gmail le renvoie par la passerelle Make. */
interface Message {
  id: string; thread: string; date: string; from: string; to: string; cc: string
  subject: string; snippet: string; body: string; labels: string[]
}
type Folder = 'inbox' | 'sent'
const QUERY: Record<Folder, string> = { inbox: 'in:inbox', sent: 'in:sent' }

/** « Marie Martin <marie@exemple.fr> » → nom et adresse. */
function person(header: string): { name: string; email: string } {
  const email = (header.match(/[\w.+'-]+@[\w-]+(\.[\w-]+)+/) ?? [''])[0].toLowerCase()
  const name = header.replace(/<[^>]*>/, '').replace(/"/g, '').trim()
  return { name: name && name !== email ? name : email, email }
}

/** Texte du message sans la citation de l'échange précédent. */
const withoutQuote = (t: string) =>
  t.split(/\r?\n(?:Le .{5,200}a écrit\s?:|On .{5,200}wrote:|-----Original Message-----)/)[0].split(/\r?\n/).filter((l) => !l.startsWith('>')).join('\n').trim()

function useMailbox(folder: Folder, search: string) {
  const [state, setState] = useState<{ loading: boolean; error: string | null; messages: Message[] }>({ loading: true, error: null, messages: [] })
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const out = await gateway('boite', { q: `${QUERY[folder]} ${search}`.trim() })
      const list = Array.isArray(out.messages) ? out.messages as Message[] : []
      setState({ loading: false, error: null, messages: list.map((m) => ({ ...m, labels: Array.isArray(m.labels) ? m.labels : [] })) })
    } catch (e) {
      setState({ loading: false, error: e instanceof Error ? e.message : String(e), messages: [] })
    }
  }, [folder, search])
  useEffect(() => { if (MAKE_READY) void load() }, [load])
  return { ...state, load, setMessages: (fn: (m: Message[]) => Message[]) => setState((s) => ({ ...s, messages: fn(s.messages) })) }
}

export function Mail() {
  const { data, settings } = useStore()
  const [folder, setFolder] = useState<Folder>('inbox')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [compose, setCompose] = useState(false)
  const box = useMailbox(folder, search)
  const open = box.messages.find((m) => m.id === openId) ?? null

  const contactByEmail = useMemo(() => new Map(data.contacts.filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c])), [data.contacts])
  const dealOf = useCallback((c: Contact | undefined) => c && data.deals
    .filter((d) => d.contact_id === c.id || (!!c.company_id && d.company_id === c.company_id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0], [data.deals])

  function select(m: Message) {
    setOpenId(m.id)
    if (m.labels.includes('UNREAD')) {
      box.setMessages((list) => list.map((x) => x.id === m.id ? { ...x, labels: x.labels.filter((l) => l !== 'UNREAD') } : x))
      void gateway('lu', { id: m.id }).catch(() => {})
    }
  }

  if (!MAKE_READY) {
    return (
      <>
        <PageHeader title="Boîte mail" />
        <Card><Empty icon={MailIcon} title="Gmail n’est pas branché dans cette version">La boîte mail de l’agence s’affiche sur la version en ligne du CRM.</Empty></Card>
      </>
    )
  }

  const unread = box.messages.filter((m) => m.labels.includes('UNREAD')).length
  return (
    <>
      <PageHeader title="Boîte mail" subtitle={settings.email ?? 'agence.sl.68@gmail.com'}>
        <Button icon={RefreshCw} onClick={() => void box.load()} disabled={box.loading}>Actualiser</Button>
        <Button variant="primary" icon={PenLine} onClick={() => setCompose(true)}>Écrire</Button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={folder} onChange={(f) => { setFolder(f); setOpenId(null) }} tabs={[{ id: 'inbox', label: 'Reçus', count: folder === 'inbox' ? unread || undefined : undefined }, { id: 'sent', label: 'Envoyés' }]} />
        <form onSubmit={(e) => { e.preventDefault(); setSearch(query.trim()); setOpenId(null) }} className="relative min-w-48 flex-1 sm:max-w-sm">
          <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input aria-label="Rechercher dans les e-mails" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher (nom, objet, adresse…)" className="!pl-9" />
        </form>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <Card flush className={open ? 'hidden lg:block' : ''}>
          {box.loading && box.messages.length === 0 ? (
            <ul aria-label="Chargement des e-mails" className="divide-y divide-slate-100">
              {Array.from({ length: 7 }, (_, i) => <li key={i} className="space-y-2 px-4 py-3.5"><div className="skeleton h-3 w-1/3 rounded" /><div className="skeleton h-3 w-4/5 rounded" /><div className="skeleton h-3 w-2/3 rounded" /></li>)}
            </ul>
          ) : box.error ? (
            <Empty icon={MailIcon} title="Impossible de charger les e-mails">{box.error}</Empty>
          ) : box.messages.length === 0 ? (
            <Empty icon={Inbox} title={search ? 'Aucun e-mail trouvé' : 'Aucun e-mail'} />
          ) : (
            <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
              {box.messages.map((m) => {
                const who = person(folder === 'sent' ? m.to : m.from)
                const contact = contactByEmail.get(who.email)
                const isUnread = m.labels.includes('UNREAD')
                return (
                  <li key={m.id}>
                    <button type="button" onClick={() => select(m)} aria-current={m.id === openId} className={`block w-full px-4 py-3 text-left transition-colors hover:bg-slate-50 ${m.id === openId ? 'bg-slate-50' : ''}`}>
                      <div className="flex items-center gap-2">
                        {isUnread && <span aria-label="Non lu" className="h-2 w-2 shrink-0 rounded-full bg-vert" />}
                        <span className={`min-w-0 flex-1 truncate text-sm ${isUnread ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}`}>{folder === 'sent' ? `À : ${who.name}` : who.name}</span>
                        {contact && <Badge tone="emerald">{dealOf(contact) ? 'Lead' : 'Contact'}</Badge>}
                        <span className="shrink-0 text-xs tabular-nums text-slate-500">{ago(m.date)}</span>
                      </div>
                      <p className={`mt-0.5 truncate text-sm ${isUnread ? 'font-medium text-slate-900' : 'text-slate-700'}`}>{m.subject || '(sans objet)'}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{m.snippet}</p>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {open ? (
          <Reader key={open.id} message={open} sent={folder === 'sent'} contact={contactByEmail.get(person(folder === 'sent' ? open.to : open.from).email)} dealOf={dealOf} onBack={() => setOpenId(null)} />
        ) : (
          <Card className="hidden lg:block"><Empty icon={MailIcon} title="Sélectionnez un e-mail">Les e-mails des clients et des leads sont aussi rangés automatiquement dans leur fiche par le robot.</Empty></Card>
        )}
      </div>

      {compose && <ComposeEmail to="" link={{}} onClose={() => setCompose(false)} />}
    </>
  )
}

function Reader({ message: m, sent, contact, dealOf, onBack }: {
  message: Message; sent: boolean; contact: Contact | undefined; dealOf: (c: Contact | undefined) => Deal | undefined; onBack: () => void
}) {
  const { insert, me, settings } = useStore()
  const run = useAction()
  const navigate = useNavigate()
  const from = person(m.from)
  const other = person(sent ? m.to : m.from)
  const deal = dealOf(contact)
  const [reply, setReply] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [full, setFull] = useState(false)
  const body = full ? m.body : withoutQuote(m.body) || m.snippet

  async function send(e: FormEvent) {
    e.preventDefault()
    if (!reply?.trim()) return
    setBusy(true)
    const ok = await run(async () => {
      await gateway('repondre', { thread: m.thread, to: other.email, body: reply })
      // Historique du lead + trace pour que le robot ne compte pas cet envoi deux fois
      await insert('outbox', {
        to_email: other.email, subject: m.subject.startsWith('Re:') ? m.subject : `Re: ${m.subject}`, body: reply, kind: 'email', status: 'sent',
        sent_at: new Date().toISOString(), deal_id: deal?.id ?? null, contact_id: contact?.id ?? null, created_by: me?.id ?? null, thread_id: m.thread,
      })
      return true
    }, 'Réponse envoyée')
    setBusy(false)
    if (ok) setReply(null)
  }

  async function createLead() {
    const [first, ...rest] = (from.name.includes('@') ? '' : from.name).split(' ')
    await run(async () => {
      const c = await insert('contacts', { first_name: first || '', last_name: rest.join(' '), email: from.email })
      const d = await insert('deals', { title: m.subject || `Demande de ${from.name}`, contact_id: c.id, source: 'email', message: withoutQuote(m.body).slice(0, 2000) || m.snippet })
      await insert('activities', { type: 'email_recu', subject: m.subject, body: withoutQuote(m.body).slice(0, 3000), deal_id: d.id, contact_id: c.id, external_id: `gmail:${m.id}`, occurred_at: new Date(m.date).toISOString() })
      navigate(`/pipeline?lead=${d.id}`)
    }, 'Lead créé à partir de l’e-mail')
  }

  return (
    <Card flush className="min-w-0">
      <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
        <button type="button" onClick={onBack} className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 lg:hidden"><ArrowLeft size={15} aria-hidden />Retour</button>
        <h2 className="text-lg font-medium leading-snug text-slate-900">{m.subject || '(sans objet)'}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-medium text-slate-900">{from.name}</span>
          <span className="text-slate-500">{from.email}</span>
          <span className="ml-auto text-xs tabular-nums text-slate-500">{fmtDateTime(m.date)}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-500">À : {m.to}{m.cc ? ` · Cc : ${m.cc}` : ''}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {!sent && <Button small variant="primary" icon={Reply} onClick={() => setReply(reply ?? `Bonjour,\n\n\n\n${settings.email_signature}`)}>Répondre</Button>}
          {contact ? (
            <Link to={deal ? `/pipeline?lead=${deal.id}` : contact.company_id ? `/clients/${contact.company_id}` : '/clients'} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-btn-border bg-btn px-3 text-sm font-medium text-fg hover:bg-hover">
              {deal ? `Lead : ${deal.title}` : `Fiche de ${contactName(contact)}`}
            </Link>
          ) : !sent && from.email && (
            <Button small icon={UserPlus} onClick={() => void createLead()}>Créer un lead</Button>
          )}
        </div>
      </div>

      <div className="px-4 py-4 sm:px-5">
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">{body}</p>
        {m.body && withoutQuote(m.body) !== m.body.trim() && (
          <button type="button" onClick={() => setFull(!full)} className="mt-3 text-xs font-medium text-slate-500 underline-offset-2 hover:underline">{full ? 'Masquer l’historique' : 'Afficher l’historique de la conversation'}</button>
        )}
      </div>

      {reply !== null && (
        <form onSubmit={send} className="border-t border-slate-200 p-4 sm:px-5">
          <label htmlFor="mail-reply" className="mb-1.5 block text-xs font-medium text-slate-500">Réponse à {other.email}</label>
          <Textarea id="mail-reply" autoFocus rows={8} value={reply} onChange={(e) => setReply(e.target.value)} />
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" onClick={() => setReply(null)}>Annuler</Button>
            <Button type="submit" variant="primary" icon={Send} disabled={busy || !reply.trim()}>{busy ? 'Envoi…' : 'Envoyer'}</Button>
          </div>
        </form>
      )}
    </Card>
  )
}
