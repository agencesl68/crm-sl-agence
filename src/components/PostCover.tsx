import { Clapperboard, Images } from 'lucide-react'
import type { InstagramPost } from '../lib/types'

// Fonds de repli aux couleurs de l'agence, quand l'image de la publication n'est pas disponible
const BACKGROUNDS = [
  'from-vert to-[#1d281b]', 'from-[#a9c49f] to-[#3c4f3b]', 'from-[#2c3b2b] to-[#070907]',
  'from-[#f0a58a] to-[#9c452b]', 'from-[#dfe8d8] to-[#a9c49f]', 'from-[#3c4f3b] to-[#a9c49f]',
]
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

/** Vignette d'une publication : l'image réelle si Instagram la fournit, sinon une couverture générée. */
export function PostCover({ post, className = '', small }: { post: Pick<InstagramPost, 'id' | 'media_type' | 'caption' | 'thumbnail_url' | 'media_url'>; className?: string; small?: boolean }) {
  const src = post.thumbnail_url ?? (post.media_type === 'IMAGE' || post.media_type === 'CAROUSEL_ALBUM' ? post.media_url : null)
  const bg = BACKGROUNDS[hash(post.id) % BACKGROUNDS.length]
  const light = bg.includes('#dfe8d8') || bg.startsWith('from-[#a9c49f]')
  const Icon = post.media_type === 'REELS' || post.media_type === 'VIDEO' ? Clapperboard : post.media_type === 'CAROUSEL_ALBUM' ? Images : null
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br ${bg} ${className}`}>
      {src ? <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" /> : !small && (
        <p className={`absolute inset-x-0 bottom-0 line-clamp-4 p-3 text-[13px] font-medium leading-snug ${light ? 'text-noir' : 'text-white'}`}>{post.caption}</p>
      )}
      {Icon && <Icon size={small ? 12 : 16} className={`absolute right-2 top-2 drop-shadow ${light && !src ? 'text-noir' : 'text-white'}`} aria-hidden />}
    </div>
  )
}
