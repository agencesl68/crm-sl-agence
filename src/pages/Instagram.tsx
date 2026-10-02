import { ask } from '../components/Confirm'
import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Bookmark, CalendarClock, Check, Clapperboard, ExternalLink, Eye, Heart, ImagePlus, Images, MessageCircle,
  MousePointerClick, Pencil, Plus, Send, Share2, Sparkles, Trash2, UserPlus, Users, X, type LucideIcon,
} from 'lucide-react'
import { LineChart, SparkLine } from '../components/charts'
import { PostCover } from '../components/PostCover'
import {
  Avatar, Badge, Button, Card, Drawer, Empty, Field, IconButton, Input, Modal, PageHeader, Select, Tabs, Textarea, useAction,
} from '../components/ui'
import { uploadMedia } from '../lib/actions'
import { CountUp } from '../lib/effects'
import { LOGO } from '../lib/env'
import { ago, fmtDate } from '../lib/format'
import { useLookups } from '../lib/selectors'
import { useStore } from '../lib/store'
import type { InstagramMessage, InstagramPost, InstagramScheduled } from '../lib/types'

type Tab = 'apercu' | 'publications' | 'planning' | 'commentaires'
const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 })
const int = (n: number) => Math.round(n).toLocaleString('fr-FR')
const pct = (n: number) => `${(n * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`
const dateTimeFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
const shortDay = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' })

const FORMAT: Record<InstagramPost['media_type'], { label: string; icon: LucideIcon }> = {
  REELS: { label: 'Reel', icon: Clapperboard }, VIDEO: { label: 'Vidéo', icon: Clapperboard },
  CAROUSEL_ALBUM: { label: 'Carrousel', icon: Images }, IMAGE: { label: 'Photo', icon: ImagePlus },
}
const interactions = (p: InstagramPost) => p.likes + p.comments + p.saves + p.shares
const engagement = (p: InstagramPost) => (p.reach ? interactions(p) / p.reach : 0)

// Créneaux de publication : jour de la semaine × moment de la journée
const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const SLOTS = [{ label: 'Matin', from: 6, to: 11, hour: 9 }, { label: 'Midi', from: 11, to: 14, hour: 12 }, { label: 'Après-midi', from: 14, to: 17, hour: 15 }, { label: 'Soir', from: 17, to: 24, hour: 18 }]
const slotOf = (d: Date) => SLOTS.findIndex((s) => d.getHours() >= s.from && d.getHours() < s.to)

/** Vues moyennes par créneau, et le meilleur créneau observé. */
function useSlots(posts: InstagramPost[]) {
  return useMemo(() => {
    const grid = DAYS.map(() => SLOTS.map(() => ({ total: 0, count: 0 })))
    posts.forEach((p) => {
      const d = new Date(p.posted_at), s = slotOf(d)
      if (s >= 0) { const cell = grid[(d.getDay() + 6) % 7][s]; cell.total += p.views; cell.count += 1 }
    })
    let best = { day: 1, slot: 3, avg: 0 }
    grid.forEach((row, day) => row.forEach((c, slot) => { const avg = c.count ? c.total / c.count : 0; if (avg > best.avg) best = { day, slot, avg } }))
    const peak = Math.max(1, ...grid.flat().map((c) => (c.count ? c.total / c.count : 0)))
    return { grid, best, peak }
  }, [posts])
}

/** Prochaine date correspondant au meilleur créneau, au format attendu par un champ date-heure. */
function nextSlot(best: { day: number; slot: number }): string {
  const d = new Date()
  d.setHours(SLOTS[best.slot].hour, 0, 0, 0)
  while ((d.getDay() + 6) % 7 !== best.day || d.getTime() < Date.now() + 3_600_000) d.setDate(d.getDate() + 1)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function Instagram() {
  const { data } = useStore()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('onglet') as Tab | null) ?? 'apercu'
  const postId = params.get('post')
  const [composer, setComposer] = useState<InstagramScheduled | 'new' | null>(params.get('nouveau') ? 'new' : null)
  const setTab = (t: Tab) => setParams({ onglet: t }, { replace: true })
  const openPost = (id: string | null) => setParams(id ? { onglet: tab, post: id } : { onglet: tab }, { replace: true })
  const todo = data.instagram_messages.filter((m) => !m.handled).length
  const last = [...data.instagram_stats].sort((a, b) => a.day.localeCompare(b.day)).at(-1)
  const post = data.instagram_posts.find((p) => p.id === postId)

  return (
    <>
      <PageHeader title="Instagram" subtitle={<>@sl.agence · {last?.followers?.toLocaleString('fr-FR') ?? '—'} abonnés · {data.instagram_posts.length} publications suivies</>}>
        <Button variant="primary" icon={Plus} onClick={() => setComposer('new')}>Nouvelle publication</Button>
      </PageHeader>

      <div className="mb-4 overflow-x-auto">
        <Tabs value={tab} onChange={setTab} tabs={[
          { id: 'apercu', label: 'Vue d’ensemble' }, { id: 'publications', label: 'Publications', count: data.instagram_posts.length },
          { id: 'planning', label: 'Planning', count: data.instagram_schedule.filter((s) => s.status !== 'publie').length },
          { id: 'commentaires', label: 'Commentaires', count: todo },
        ]} />
      </div>

      {data.instagram_posts.length === 0 && data.instagram_stats.length === 0 && tab !== 'planning' ? (
        <Card><Empty icon={Users} title="Instagram n'est pas encore relié">Dès que la connexion Instagram est autorisée dans Make, les statistiques, publications et commentaires du compte apparaissent ici.</Empty></Card>
      ) : (
        <div key={tab} className="page">
          {tab === 'apercu' && <Overview onOpen={openPost} onPlan={() => setComposer('new')} />}
          {tab === 'publications' && <Posts onOpen={openPost} />}
          {tab === 'planning' && <Planning onEdit={setComposer} />}
          {tab === 'commentaires' && <Comments onOpen={openPost} />}
        </div>
      )}

      {composer && <Composer item={composer === 'new' ? undefined : composer} onClose={() => { setComposer(null); if (params.get('nouveau')) setParams({ onglet: 'planning' }, { replace: true }) }} />}
      {post && <PostDrawer post={post} onClose={() => openPost(null)} />}
    </>
  )
}

// ───────────────────────────── Vue d'ensemble ─────────────────────────────

function Stat({ icon: Icon, label, value, format, hint, children }: { icon: LucideIcon; label: string; value: number; format: (n: number) => string; hint?: string; children?: ReactNode }) {
  return (
    <div className="surface spot lift flex min-w-0 flex-col rounded-2xl bg-white p-4 shadow-sm">
      <p className="flex items-center gap-1.5 text-[13px] font-medium text-slate-500"><Icon size={14} aria-hidden />{label}</p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="whitespace-nowrap text-2xl font-semibold tracking-tight tabular-nums text-slate-900"><CountUp value={value} format={format} /></p>
        {children}
      </div>
      {hint && <p className="mt-1 truncate text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

function Overview({ onOpen, onPlan }: { onOpen: (id: string) => void; onPlan: () => void }) {
  const { data } = useStore()
  const stats = [...data.instagram_stats].sort((a, b) => a.day.localeCompare(b.day)).slice(-30)
  const posts = data.instagram_posts
  const recent = posts.filter((p) => Date.now() - new Date(p.posted_at).getTime() < 30 * 86_400_000)
  const sum = (k: 'views' | 'reach' | 'profile_views' | 'website_clicks') => stats.reduce((a, s) => a + (s[k] ?? 0), 0)
  const followers = stats.map((s) => s.followers ?? 0)
  const reachRecent = recent.reduce((a, p) => a + p.reach, 0)
  const rate = reachRecent ? recent.reduce((a, p) => a + interactions(p), 0) / reachRecent : 0
  const { grid, best, peak } = useSlots(posts)
  const top = [...posts].sort((a, b) => b.views - a.views).slice(0, 3)

  const formats = (['REELS', 'CAROUSEL_ALBUM', 'IMAGE'] as const).map((t) => {
    const list = posts.filter((p) => p.media_type === t || (t === 'REELS' && p.media_type === 'VIDEO'))
    return { type: t, count: list.length, views: list.length ? list.reduce((a, p) => a + p.views, 0) / list.length : 0, rate: list.length ? list.reduce((a, p) => a + engagement(p), 0) / list.length : 0 }
  })
  const formatPeak = Math.max(1, ...formats.map((f) => f.views))

  return (
    <>
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        <Stat icon={Users} label="Abonnés" value={followers.at(-1) ?? 0} format={int} hint={followers.length > 1 ? `+${followers.at(-1)! - followers[0]} en 30 jours` : undefined}>
          <SparkLine values={followers} label="Évolution des abonnés sur 30 jours" />
        </Stat>
        <Stat icon={Eye} label="Vues (30 j)" value={sum('views')} format={(n) => compact.format(Math.round(n))} hint="Toutes publications et stories" />
        <Stat icon={Sparkles} label="Comptes touchés (30 j)" value={sum('reach')} format={(n) => compact.format(Math.round(n))} />
        <Stat icon={Heart} label="Taux d’engagement" value={rate} format={pct} hint="Interactions ÷ comptes touchés, 30 j" />
        <Stat icon={Users} label="Visites du profil" value={sum('profile_views')} format={int} hint="30 derniers jours" />
        <Stat icon={MousePointerClick} label="Clics vers le site" value={sum('website_clicks')} format={int} hint="slagence.fr, 30 derniers jours" />
      </div>

      <div className="stagger mt-3 grid gap-3 lg:grid-cols-3">
        <Card title="Vues par jour — 30 jours" className="lg:col-span-2">
          <LineChart points={stats.map((s) => ({ label: shortDay.format(new Date(s.day)), value: s.views ?? 0 }))} format={(n) => compact.format(Math.round(n))} title="Vues quotidiennes sur 30 jours" labelEvery={5} />
        </Card>
        <Card title="Meilleurs créneaux" action={<Button small icon={CalendarClock} onClick={onPlan}>Programmer</Button>}>
          <p className="mb-3 text-sm text-slate-600">Vos publications du <span className="font-semibold text-slate-900">{DAYS[best.day].toLowerCase()}. {SLOTS[best.slot].label.toLowerCase()}</span> font le plus de vues ({compact.format(Math.round(best.avg))} en moyenne).</p>
          <div className="grid grid-cols-[auto_repeat(7,1fr)] gap-1 text-[11px]" role="table" aria-label="Vues moyennes par jour et moment de la journée">
            <span />
            {DAYS.map((d) => <span key={d} className="text-center text-slate-500">{d}</span>)}
            {SLOTS.map((s, si) => (
              <div key={s.label} className="contents" role="row">
                <span className="pr-1 text-right text-slate-500">{s.label}</span>
                {DAYS.map((_, di) => {
                  const c = grid[di][si], avg = c.count ? c.total / c.count : 0
                  const isBest = di === best.day && si === best.slot
                  return (
                    <span key={di} role="cell" title={c.count ? `${DAYS[di]} ${s.label.toLowerCase()} : ${compact.format(Math.round(avg))} vues en moyenne (${c.count} publication${c.count > 1 ? 's' : ''})` : 'Aucune publication'}
                      className={`aspect-square rounded-md ${isBest ? 'ring-2 ring-vert ring-offset-1' : ''} ${c.count ? 'bg-vert' : 'bg-slate-100'}`}
                      style={c.count ? { opacity: 0.25 + 0.75 * (avg / peak) } : undefined} />
                  )
                })}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Plus la case est foncée, plus les publications de ce créneau ont été vues.</p>
        </Card>
      </div>

      <div className="stagger mt-3 grid gap-3 lg:grid-cols-3">
        <Card title="Meilleures publications" className="lg:col-span-2">
          <div className="grid grid-cols-3 gap-3">
            {top.map((p, i) => (
              <button key={p.id} type="button" onClick={() => onOpen(p.id)} className="group text-left">
                <div className="relative">
                  <PostCover post={p} className="aspect-[4/5] rounded-2xl transition-transform duration-300 group-hover:scale-[1.02]" />
                  <span className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-bold text-noir shadow">{i + 1}</span>
                </div>
                <p className="mt-2 flex items-center gap-3 text-xs tabular-nums text-slate-600"><span className="flex items-center gap-1 font-semibold text-slate-900"><Eye size={12} aria-hidden />{compact.format(p.views)}</span><span className="flex items-center gap-1"><Heart size={12} aria-hidden />{p.likes}</span><span>{pct(engagement(p))}</span></p>
              </button>
            ))}
          </div>
        </Card>
        <Card title="Performance par format">
          <ul className="space-y-4">
            {formats.map((f) => {
              const { label, icon: Icon } = FORMAT[f.type]
              return (
                <li key={f.type}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="flex items-center gap-1.5 font-medium text-slate-800"><Icon size={14} aria-hidden />{label}s <span className="font-normal text-slate-500">({f.count})</span></span>
                    <span className="tabular-nums text-slate-500"><span className="font-semibold text-slate-900">{compact.format(Math.round(f.views))}</span> vues · {pct(f.rate)}</span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-slate-100"><div className="grow-x h-full rounded-full bg-vert" style={{ width: `${(f.views / formatPeak) * 100}%` }} /></div>
                </li>
              )
            })}
          </ul>
          <p className="mt-4 text-xs text-slate-500">Vues moyennes par publication et taux d’engagement moyen.</p>
        </Card>
      </div>
    </>
  )
}

// ───────────────────────────── Publications ─────────────────────────────

function Posts({ onOpen }: { onOpen: (id: string) => void }) {
  const { data } = useStore()
  const [sort, setSort] = useState<'recent' | 'views' | 'engagement'>('recent')
  const [type, setType] = useState<'all' | 'REELS' | 'CAROUSEL_ALBUM' | 'IMAGE'>('all')
  const posts = data.instagram_posts
    .filter((p) => type === 'all' || p.media_type === type || (type === 'REELS' && p.media_type === 'VIDEO'))
    .sort((a, b) => sort === 'views' ? b.views - a.views : sort === 'engagement' ? engagement(b) - engagement(a) : b.posted_at.localeCompare(a.posted_at))
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <Select aria-label="Trier les publications" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="!h-9 !w-48 !rounded-full">
          <option value="recent">Plus récentes</option><option value="views">Plus vues</option><option value="engagement">Meilleur engagement</option>
        </Select>
        <Select aria-label="Filtrer par format" value={type} onChange={(e) => setType(e.target.value as typeof type)} className="!h-9 !w-40 !rounded-full">
          <option value="all">Tous les formats</option><option value="REELS">Reels</option><option value="CAROUSEL_ALBUM">Carrousels</option><option value="IMAGE">Photos</option>
        </Select>
      </div>
      <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {posts.map((p) => (
          <button key={p.id} type="button" onClick={() => onOpen(p.id)} className="surface spot lift group overflow-hidden rounded-2xl bg-white text-left shadow-sm">
            <div className="relative">
              <PostCover post={p} className="aspect-[4/5]" />
              <div className="absolute inset-0 flex items-center justify-center gap-4 bg-noir/60 text-sm font-semibold text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <span className="flex items-center gap-1"><Heart size={16} aria-hidden />{p.likes}</span>
                <span className="flex items-center gap-1"><MessageCircle size={16} aria-hidden />{p.comments}</span>
                <span className="flex items-center gap-1"><Bookmark size={16} aria-hidden />{p.saves}</span>
              </div>
            </div>
            <div className="p-3">
              <p className="flex items-center justify-between text-xs text-slate-500"><span>{FORMAT[p.media_type].label} · {fmtDate(p.posted_at)}</span></p>
              <p className="mt-1 flex items-center gap-3 text-[13px] tabular-nums"><span className="flex items-center gap-1 font-semibold text-slate-900"><Eye size={13} aria-hidden />{compact.format(p.views)}</span><span className="text-slate-500">{pct(engagement(p))} d’engagement</span></p>
            </div>
          </button>
        ))}
      </div>
    </>
  )
}

function PostDrawer({ post, onClose }: { post: InstagramPost; onClose: () => void }) {
  const { data } = useStore()
  const comments = data.instagram_messages.filter((m) => m.post_id === post.id)
  const metrics: [LucideIcon, string, number][] = [
    [Eye, 'Vues', post.views], [Users, 'Comptes touchés', post.reach], [Heart, 'J’aime', post.likes],
    [MessageCircle, 'Commentaires', post.comments], [Bookmark, 'Enregistrements', post.saves], [Share2, 'Partages', post.shares],
  ]
  return (
    <Drawer onClose={onClose} title={<><p className="text-base font-semibold text-slate-900">{FORMAT[post.media_type].label} du {fmtDate(post.posted_at)}</p><p className="text-sm text-slate-500">Mis à jour {ago(post.updated_at)}</p></>}>
      <div className="space-y-5 p-5">
        <PostCover post={post} className="aspect-square rounded-2xl" />
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{post.caption}</p>
        <div className="grid grid-cols-3 gap-2">
          {metrics.map(([Icon, label, v]) => (
            <div key={label} className="rounded-2xl bg-slate-50 p-3">
              <p className="flex items-center gap-1 text-xs text-slate-500"><Icon size={12} aria-hidden />{label}</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900"><CountUp value={v} format={int} /></p>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-vert px-4 py-3 text-white">
          <span className="text-sm">Taux d’engagement</span><span className="text-xl font-semibold tabular-nums">{pct(engagement(post))}</span>
        </div>
        {post.permalink && <a href={post.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-link hover:underline">Voir sur Instagram<ExternalLink size={14} aria-hidden /></a>}
        <div>
          <h3 className="eyebrow mb-2 text-slate-500">Commentaires ({comments.length})</h3>
          {comments.length === 0 ? <p className="text-sm text-slate-500">Aucun commentaire suivi sur cette publication.</p> : <ul className="space-y-3">{comments.map((m) => <CommentItem key={m.id} message={m} />)}</ul>}
        </div>
      </div>
    </Drawer>
  )
}

// ───────────────────────────── Planning ─────────────────────────────

const STATUS: Record<InstagramScheduled['status'], { label: string; tone: 'slate' | 'sky' | 'emerald' | 'rose' }> = {
  brouillon: { label: 'Brouillon', tone: 'slate' }, programme: { label: 'Programmée', tone: 'sky' },
  publie: { label: 'Publiée', tone: 'emerald' }, erreur: { label: 'Erreur', tone: 'rose' },
}
const TYPE_LABEL: Record<InstagramScheduled['media_type'], string> = { photo: 'Photo', carrousel: 'Carrousel', reel: 'Reel' }
const asPost = (s: InstagramScheduled) => ({ id: s.id, media_type: (s.media_type === 'reel' ? 'REELS' : s.media_type === 'carrousel' ? 'CAROUSEL_ALBUM' : 'IMAGE') as InstagramPost['media_type'], caption: s.caption, thumbnail_url: s.media_type === 'reel' ? null : s.media_urls[0] ?? null, media_url: null })

function Planning({ onEdit }: { onEdit: (s: InstagramScheduled | 'new') => void }) {
  const { data, remove } = useStore()
  const { profile } = useLookups()
  const run = useAction()
  const { best } = useSlots(data.instagram_posts)
  const planned = data.instagram_schedule.filter((s) => s.status === 'programme' || s.status === 'erreur').sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))
  const drafts = data.instagram_schedule.filter((s) => s.status === 'brouillon')

  // Les 14 prochains jours, avec les publications prévues
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i); return d })
  const sameDay = (iso: string | null, d: Date) => !!iso && new Date(iso).toDateString() === d.toDateString()

  const Row = ({ s }: { s: InstagramScheduled }) => (
    <li className="surface spot lift flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
      <PostCover post={asPost(s)} className="h-16 w-16 shrink-0 rounded-xl" small />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500"><Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge>{TYPE_LABEL[s.media_type]}{s.scheduled_at && <span className="font-medium text-slate-900 first-letter:uppercase">{dateTimeFmt.format(new Date(s.scheduled_at))}</span>}</p>
        <p className="mt-1 line-clamp-2 text-sm text-slate-800">{s.caption || <span className="text-slate-400">Sans légende</span>}</p>
        {s.error && <p className="mt-1 text-xs font-medium text-rose-700">{s.error}</p>}
      </div>
      <Avatar profile={s.created_by ? profile.get(s.created_by) : null} size={24} />
      <IconButton icon={Pencil} label="Modifier la publication" onClick={() => onEdit(s)} />
      <IconButton icon={Trash2} label="Supprimer la publication" onClick={() => void ask('Supprimer cette publication prévue ?').then((ok): unknown => ok && run(() => remove('instagram_schedule', s.id), 'Publication supprimée'))} />
    </li>
  )

  return (
    <>
      <div className="surface mb-4 overflow-x-auto rounded-2xl bg-white p-3 shadow-sm">
        <ol className="flex min-w-max gap-1.5">
          {days.map((d) => {
            const n = planned.filter((s) => sameDay(s.scheduled_at, d)).length
            const isBest = (d.getDay() + 6) % 7 === best.day
            return (
              <li key={d.toISOString()} className={`flex w-14 flex-col items-center rounded-xl px-1 py-2 text-center ${n ? 'bg-vert text-white' : isBest ? 'bg-emerald-50 text-emerald-800' : 'text-slate-600'}`}>
                <span className="text-[11px] capitalize opacity-80">{d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')}</span>
                <span className="text-base font-semibold tabular-nums">{d.getDate()}</span>
                <span className="text-[10px]">{n ? `${n} post` : isBest ? 'idéal' : ' '}</span>
              </li>
            )
          })}
        </ol>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between"><h2 className="eyebrow text-sauge">Programmées ({planned.length})</h2></div>
          {planned.length === 0 ? <Card><Empty icon={CalendarClock} title="Rien de programmé">Préparez une publication : Make la publiera à l'heure choisie.</Empty></Card> : <ul className="stagger space-y-2">{planned.map((s) => <Row key={s.id} s={s} />)}</ul>}
          <h2 className="eyebrow mb-2 mt-6 text-sauge">Brouillons ({drafts.length})</h2>
          {drafts.length === 0 ? <p className="text-sm text-fg-muted">Aucun brouillon.</p> : <ul className="stagger space-y-2">{drafts.map((s) => <Row key={s.id} s={s} />)}</ul>}
        </section>
        <aside className="space-y-3">
          <Card title="Conseil de publication">
            <p className="text-sm text-slate-600">D'après vos chiffres, le meilleur moment est le <span className="font-semibold text-slate-900">{['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'][best.day]} {SLOTS[best.slot].label.toLowerCase()}</span>, et les Reels touchent le plus de monde.</p>
            <Button variant="primary" icon={Plus} className="mt-3 w-full" onClick={() => onEdit('new')}>Préparer une publication</Button>
          </Card>
          <Card title="Comment ça marche">
            <ol className="list-decimal space-y-1.5 pl-4 text-sm text-slate-600">
              <li>Vous préparez l'image, la légende et l'heure ici.</li>
              <li>Make vérifie toutes les 15 minutes les publications arrivées à échéance.</li>
              <li>La publication part sur Instagram et ses statistiques remontent dans l'onglet Publications.</li>
            </ol>
          </Card>
        </aside>
      </div>
    </>
  )
}

const HASHTAGS = ['#automatisation', '#TPE', '#PME', '#Alsace', '#IA', '#productivité', '#entrepreneur', '#nocode', '#digitalisation', '#GrandEst']

function Composer({ item, onClose }: { item?: InstagramScheduled; onClose: () => void }) {
  const { data, insert, update, me } = useStore()
  const run = useAction()
  const { best } = useSlots(data.instagram_posts)
  const [type, setType] = useState<InstagramScheduled['media_type']>(item?.media_type ?? 'photo')
  const [caption, setCaption] = useState(item?.caption ?? '')
  const [media, setMedia] = useState<string[]>(item?.media_urls ?? [])
  const [when, setWhen] = useState(item?.scheduled_at ? item.scheduled_at.slice(0, 16) : '')
  const [busy, setBusy] = useState(false)
  const tags = (caption.match(/#[\p{L}\d_]+/gu) ?? []).length

  async function addFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    setBusy(true)
    const urls = await run(() => Promise.all(files.map(uploadMedia)))
    setBusy(false)
    if (urls) setMedia((m) => (type === 'carrousel' ? [...m, ...urls].slice(0, 10) : urls.slice(0, 1)))
  }

  async function save(status: 'brouillon' | 'programme') {
    if (status === 'programme' && !when) return void run(async () => { throw new Error('Choisissez la date et l’heure de publication.') })
    if (status === 'programme' && media.length === 0) return void run(async () => { throw new Error('Ajoutez au moins une image ou une vidéo.') })
    setBusy(true)
    const row = { media_type: type, caption, media_urls: media, scheduled_at: when ? new Date(when).toISOString() : null, status, error: null }
    const ok = await run(() => (item ? update('instagram_schedule', item.id, row) : insert('instagram_schedule', { ...row, created_by: me?.id ?? null })), status === 'programme' ? 'Publication programmée' : 'Brouillon enregistré')
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <Modal title={item ? 'Modifier la publication' : 'Nouvelle publication'} onClose={onClose} wide="xl">
      <div className="grid gap-8 md:grid-cols-[1fr_18rem]">
        <div className="space-y-4">
          <div role="group" aria-label="Format" className="inline-flex rounded-full bg-slate-100 p-1">
            {(['photo', 'carrousel', 'reel'] as const).map((t) => (
              <button key={t} type="button" aria-pressed={type === t} onClick={() => { setType(t); if (t !== 'carrousel') setMedia((m) => m.slice(0, 1)) }} className={`h-8 rounded-full px-4 text-[13px] font-medium transition-colors ${type === t ? 'bg-vert text-white' : 'text-slate-600 hover:text-slate-900'}`}>{TYPE_LABEL[t]}</button>
            ))}
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-slate-700">{type === 'reel' ? 'Vidéo' : type === 'carrousel' ? 'Images (jusqu’à 10)' : 'Image'}</p>
            <div className="flex flex-wrap gap-2">
              {media.map((src, i) => (
                <div key={src.slice(-40) + i} className="relative h-20 w-20 overflow-hidden rounded-xl bg-slate-100">
                  {type === 'reel' ? <Clapperboard className="m-auto mt-7 text-slate-400" size={22} aria-hidden /> : <img src={src} alt={`Média ${i + 1}`} className="h-full w-full object-cover" />}
                  <button type="button" aria-label={`Retirer le média ${i + 1}`} onClick={() => setMedia((m) => m.filter((_, j) => j !== i))} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-noir/70 text-white"><X size={12} aria-hidden /></button>
                </div>
              ))}
              {(type === 'carrousel' ? media.length < 10 : media.length === 0) && (
                <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-xs text-slate-500 transition-colors hover:border-vert hover:text-vert">
                  <ImagePlus size={18} aria-hidden />{busy ? 'Envoi…' : 'Ajouter'}
                  <input type="file" className="sr-only" accept={type === 'reel' ? 'video/mp4,video/quicktime' : 'image/jpeg,image/png'} multiple={type === 'carrousel'} onChange={addFiles} />
                </label>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">{type === 'reel' ? 'MP4 ou MOV, vertical 9:16, 90 secondes maximum.' : 'JPEG ou PNG, format 4:5 conseillé (1080 × 1350).'}</p>
          </div>

          <Field label="Légende" hint={`${caption.length} / 2 200 caractères · ${tags} / 30 hashtags`}>
            {(id) => <Textarea id={id} rows={6} maxLength={2200} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Accroche, valeur apportée, appel à l’action…" />}
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {HASHTAGS.map((h) => (
              <button key={h} type="button" disabled={caption.includes(h)} onClick={() => setCaption((c) => `${c}${c && !c.endsWith(' ') && !c.endsWith('\n') ? ' ' : ''}${h}`)} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-pale disabled:opacity-40">{h}</button>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <Field label="Date et heure de publication" className="min-w-52 flex-1">
              {(id) => <Input id={id} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />}
            </Field>
            <Button icon={Sparkles} onClick={() => setWhen(nextSlot(best))}>Meilleur créneau</Button>
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
            <Button onClick={onClose}>Annuler</Button>
            <Button onClick={() => save('brouillon')} disabled={busy}>Enregistrer le brouillon</Button>
            <Button variant="primary" icon={CalendarClock} onClick={() => save('programme')} disabled={busy}>Programmer</Button>
          </div>
        </div>

        {/* Aperçu façon téléphone */}
        <div className="hidden md:block">
          <p className="eyebrow mb-2 text-slate-500">Aperçu</p>
          <div className="overflow-hidden rounded-[2rem] border-[6px] border-noir bg-white shadow-xl">
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-vert"><img src={LOGO} alt="" className="h-4 w-auto" /></span>
              <span className="text-xs font-semibold text-slate-900">sl.agence</span>
            </div>
            {media[0] && type !== 'reel'
              ? <img src={media[0]} alt="" className="aspect-[4/5] w-full object-cover" />
              : <PostCover post={{ id: item?.id ?? 'apercu', media_type: type === 'reel' ? 'REELS' : type === 'carrousel' ? 'CAROUSEL_ALBUM' : 'IMAGE', caption: caption || 'Votre légende apparaîtra ici', thumbnail_url: null, media_url: null }} className="aspect-[4/5]" />}
            <div className="flex items-center gap-3 px-3 py-2 text-slate-900"><Heart size={18} aria-hidden /><MessageCircle size={18} aria-hidden /><Send size={18} aria-hidden /><Bookmark size={18} className="ml-auto" aria-hidden /></div>
            <p className="line-clamp-3 px-3 pb-3 text-xs leading-relaxed text-slate-800"><span className="font-semibold">sl.agence</span> {caption || <span className="text-slate-400">Votre légende…</span>}</p>
          </div>
          {when && <p className="mt-2 text-center text-xs text-slate-500 first-letter:uppercase">{dateTimeFmt.format(new Date(when))}</p>}
        </div>
      </div>
    </Modal>
  )
}

// ───────────────────────────── Commentaires ─────────────────────────────

function CommentItem({ message: m, showPost, onOpen }: { message: InstagramMessage; showPost?: boolean; onOpen?: (id: string) => void }) {
  const { data, update, insert, me } = useStore()
  const { profile } = useLookups()
  const run = useAction()
  const [reply, setReply] = useState('')
  const post = m.post_id ? data.instagram_posts.find((p) => p.id === m.post_id) : undefined
  const author = m.replied_by ? profile.get(m.replied_by) : undefined

  const toLead = () => run(async () => {
    const deal = await insert('deals', { title: `@${m.username ?? 'instagram'} — Instagram`, source: 'instagram', message: m.text, company_id: null, contact_id: null, owner_id: me?.id ?? null })
    await update('instagram_messages', m.id, { deal_id: deal.id, handled: true })
  }, 'Lead créé dans le pipeline')

  return (
    <li className="surface spot rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-corail to-vert text-sm font-semibold uppercase text-white">{(m.username ?? '?')[0]}</span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold text-slate-900">@{m.username}</span><Badge tone="violet">{m.kind === 'mention' ? 'Mention' : 'Commentaire'}</Badge><span className="text-xs text-slate-500">{ago(m.received_at)}</span></p>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">{m.text}</p>
          {showPost && post && (
            <button type="button" onClick={() => onOpen?.(post.id)} className="mt-2 flex max-w-full items-center gap-2 rounded-xl bg-slate-50 p-1.5 pr-3 text-left text-xs text-slate-600 hover:bg-slate-100">
              <PostCover post={post} className="h-8 w-8 shrink-0 rounded-lg" small /><span className="truncate">{post.caption}</span>
            </button>
          )}
          {m.reply ? (
            <div className="mt-3 rounded-2xl rounded-tl-sm bg-emerald-50 px-3 py-2 text-sm text-slate-800">
              <p className="mb-0.5 flex items-center gap-1.5 text-xs text-emerald-800"><Check size={12} aria-hidden />{m.reply_status === 'pending' ? 'Réponse en cours de publication' : m.reply_status === 'error' ? 'Échec de la publication' : 'Réponse publiée'}{author && ` par ${author.full_name}`}</p>
              {m.reply}
            </div>
          ) : m.kind === 'commentaire' && (
            <div className="mt-3 flex gap-2">
              <Input aria-label={`Répondre à @${m.username}`} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={`Répondre à @${m.username}…`} className="!h-9 !rounded-full" />
              <Button small variant="primary" icon={Send} disabled={!reply.trim()} onClick={() => run(() => update('instagram_messages', m.id, { reply: reply.trim(), reply_status: 'pending', replied_by: me?.id ?? null, handled: true }), 'Réponse envoyée')}>Répondre</Button>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {m.deal_id ? <Link to={`/pipeline?lead=${m.deal_id}`} className="text-xs font-medium text-link hover:underline">Voir le lead</Link> : <Button small icon={UserPlus} onClick={toLead}>Créer un lead</Button>}
            {!m.handled && <Button small icon={Check} onClick={() => run(() => update('instagram_messages', m.id, { handled: true }))}>Marquer traité</Button>}
          </div>
        </div>
      </div>
    </li>
  )
}

function Comments({ onOpen }: { onOpen: (id: string) => void }) {
  const { data } = useStore()
  const [filter, setFilter] = useState<'todo' | 'all'>('todo')
  const list = data.instagram_messages.filter((m) => filter === 'all' || !m.handled)
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <section className="lg:col-span-2">
        <div className="mb-3"><Tabs value={filter} onChange={setFilter} tabs={[{ id: 'todo', label: 'À traiter', count: data.instagram_messages.filter((m) => !m.handled).length }, { id: 'all', label: 'Tout', count: data.instagram_messages.length }]} /></div>
        {list.length === 0 ? <Card><Empty icon={Check} title="Tout est traité">Les nouveaux commentaires et mentions arrivent ici automatiquement.</Empty></Card> : <ul className="stagger space-y-2">{list.map((m) => <CommentItem key={m.id} message={m} showPost onOpen={onOpen} />)}</ul>}
      </section>
      <aside>
        <Card title="Bon à savoir">
          <ul className="space-y-2 text-sm text-slate-600">
            <li>Vos réponses sont publiées sous le commentaire par Make, au nom de @sl.agence.</li>
            <li>« Créer un lead » ajoute la personne au pipeline avec son message.</li>
            <li>Les messages privés ne sont pas accessibles par l'API d'Instagram via Make : ils restent dans l'application Instagram.</li>
          </ul>
        </Card>
      </aside>
    </div>
  )
}
