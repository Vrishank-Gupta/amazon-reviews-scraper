/**
 * ReviewsDrawer — inline reviews panel that opens below any clickable row
 *
 * Usage:
 *   const [drawer, setDrawer] = useState(null)  // { category, label }
 *   <ReviewsDrawer category={drawer?.category} label={drawer?.label} filters={filters} onClose={() => setDrawer(null)} />
 *
 * Pass category = primary_category string. Fetches via /api/reviews/by-keyword.
 * Renders nothing when category is null.
 */
import { useState, useEffect } from 'react'
import { X } from 'lucide-react'

function StarLabel({ rating }) {
  const n = Math.round(parseFloat(rating) || 0)
  const color = n >= 4 ? '#22c55e' : n >= 3 ? '#eab308' : '#ef4444'
  return <span style={{ color, fontSize:12 }}>{'★'.repeat(n)}{'☆'.repeat(Math.max(0,5-n))} <span style={{ color:'var(--text-muted)', fontSize:11 }}>{parseFloat(rating||0).toFixed(1)}</span></span>
}

function SentBadge({ s }) {
  const cfg = s === 'Positive' ? { bg:'rgba(34,197,94,0.12)', color:'#22c55e', border:'rgba(34,197,94,0.3)' }
            : s === 'Negative' ? { bg:'rgba(239,68,68,0.12)',  color:'#ef4444', border:'rgba(239,68,68,0.3)' }
            :                    { bg:'rgba(234,179,8,0.12)',   color:'#eab308', border:'rgba(234,179,8,0.3)' }
  return (
    <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:4,
      background:cfg.bg, color:cfg.color, border:`1px solid ${cfg.border}`, letterSpacing:'0.06em' }}>
      {s}
    </span>
  )
}

function ReviewCard({ r }) {
  const [open, setOpen] = useState(false)
  const date = r.review_date?.replace('Reviewed in India on ', '') || ''
  return (
    <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:6 }}>
        <SentBadge s={r.sentiment} />
        <StarLabel rating={r.rating} />
        {r.product_name && (
          <span style={{ fontSize:10, color:'var(--text-muted)', background:'var(--surface2)', padding:'1px 7px', borderRadius:4, border:'1px solid var(--border)' }}>
            {r.product_name.split(' ').slice(0,4).join(' ')}
          </span>
        )}
        <span style={{ fontSize:10, color:'var(--text-muted)', marginLeft:'auto' }}>{date}</span>
      </div>
      {r.title && <div style={{ fontSize:12, fontWeight:600, marginBottom:4, color:'var(--text)' }}>{r.title}</div>}
      <div style={{
        fontSize:12, color:'var(--text)', lineHeight:1.6,
        overflow:'hidden',
        display: open ? 'block' : '-webkit-box',
        WebkitLineClamp: open ? 'unset' : 3,
        WebkitBoxOrient: 'vertical',
      }}>
        {r.review}
      </div>
      {r.review?.length > 220 && (
        <button onClick={() => setOpen(o => !o)} style={{
          background:'none', border:'none', cursor:'pointer', color:'var(--accent)',
          fontSize:11, padding:'4px 0 0', fontFamily:'DM Sans',
        }}>
          {open ? 'Show less ▲' : 'Read more ▼'}
        </button>
      )}
    </div>
  )
}

export default function ReviewsDrawer({ category, label, filters, onClose }) {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!category) { setReviews([]); return }
    setLoading(true)
    const p = new URLSearchParams({ keyword: category })
    if (filters?.product?.length) p.set('product', filters.product.join('|||'))
    if (filters?.date_from) p.set('date_from', filters.date_from)
    if (filters?.date_to)   p.set('date_to',   filters.date_to)
    fetch(`/api/reviews/by-keyword?${p}`)
      .then(r => r.json())
      .then(setReviews)
      .catch(() => setReviews([]))
      .finally(() => setLoading(false))
  }, [category, filters?.product?.join(','), filters?.date_from, filters?.date_to])

  if (!category) return null

  const neg = reviews.filter(r => r.sentiment === 'Negative')
  const pos = reviews.filter(r => r.sentiment === 'Positive')
  const neu = reviews.filter(r => r.sentiment === 'Neutral')

  return (
    <div style={{
      background:'var(--surface)', border:'1px solid var(--border)',
      borderRadius:10, overflow:'hidden', marginTop:4,
    }}>
      {/* Header */}
      <div style={{
        padding:'10px 16px', background:'var(--surface2)',
        borderBottom:'1px solid var(--border)',
        display:'flex', alignItems:'center', justifyContent:'space-between',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontFamily:'Bebas Neue', fontSize:14, letterSpacing:'0.06em', color:'var(--text-muted)' }}>
            Reviews — <span style={{ color:'var(--accent)' }}>{label || category}</span>
          </span>
          {!loading && (
            <span style={{
              background:'rgba(255,78,26,0.15)', color:'var(--accent)',
              border:'1px solid rgba(255,78,26,0.3)', borderRadius:10,
              padding:'1px 8px', fontSize:11, fontWeight:600,
            }}>{reviews.length}</span>
          )}
          {!loading && reviews.length > 0 && (
            <div style={{ display:'flex', gap:6 }}>
              {neg.length > 0 && <span style={{ fontSize:10, color:'#ef4444', fontWeight:600 }}>{neg.length} neg</span>}
              {pos.length > 0 && <span style={{ fontSize:10, color:'#22c55e', fontWeight:600 }}>{pos.length} pos</span>}
              {neu.length > 0 && <span style={{ fontSize:10, color:'#eab308', fontWeight:600 }}>{neu.length} neu</span>}
            </div>
          )}
        </div>
        <button onClick={onClose} style={{
          background:'none', border:'1px solid var(--border)', borderRadius:6,
          color:'var(--text-muted)', fontSize:11, padding:'3px 9px',
          cursor:'pointer', fontFamily:'DM Sans', display:'flex', alignItems:'center', gap:4,
        }}>
          <X size={11} /> Close
        </button>
      </div>

      {/* Body */}
      {loading ? (
        <div style={{ padding:24, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>
          Loading reviews…
        </div>
      ) : reviews.length === 0 ? (
        <div style={{ padding:24, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>
          No reviews found for this category in the selected filters.
        </div>
      ) : (
        <div style={{ maxHeight:360, overflowY:'auto' }}>
          {reviews.map((r, i) => <ReviewCard key={r.review_id || i} r={r} />)}
        </div>
      )}
    </div>
  )
}