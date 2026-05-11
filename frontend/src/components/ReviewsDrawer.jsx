import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, ExternalLink } from 'lucide-react'
import { apiUrl, authHeaders } from '../api'

if (typeof document !== 'undefined' && !document.getElementById('reviews-drawer-styles')) {
  const s = document.createElement('style')
  s.id = 'reviews-drawer-styles'
  s.textContent = `
    @keyframes slideInRight {
      from { transform: translateX(100%); }
      to   { transform: translateX(0); }
    }
  `
  document.head.appendChild(s)
}

function StarLabel({ rating }) {
  const rounded = Math.round(parseFloat(rating) || 0)
  const color = rounded >= 4 ? '#22c55e' : rounded >= 3 ? '#eab308' : '#ef4444'
  return (
    <span style={{ color, fontSize: 12 }}>
      {'★'.repeat(rounded)}
      {'☆'.repeat(Math.max(0, 5 - rounded))}
      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}> {(parseFloat(rating) || 0).toFixed(1)}</span>
    </span>
  )
}

function SentBadge({ s }) {
  const cfg = s === 'Positive'
    ? { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', border: 'rgba(34,197,94,0.3)' }
    : s === 'Negative'
      ? { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', border: 'rgba(239,68,68,0.3)' }
      : { bg: 'rgba(234,179,8,0.12)', color: '#eab308', border: 'rgba(234,179,8,0.3)' }
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, letterSpacing: '0.06em' }}>
      {s}
    </span>
  )
}

function ReviewCard({ r }) {
  const [open, setOpen] = useState(false)
  const date = r.review_date?.replace('Reviewed in India on ', '') || ''

  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <SentBadge s={r.sentiment} />
        <StarLabel rating={r.rating} />
        {r.product_name && (
          <span
            title={r.product_name}
            style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--surface2)', padding: '1px 7px', borderRadius: 4, border: '1px solid var(--border)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}
          >
            {r.product_name}
          </span>
        )}
        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>{date}</span>
        {r.review_url && (
          <a
            href={r.review_url}
            target="_blank"
            rel="noopener noreferrer"
            title="View on Amazon"
            style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', flexShrink: 0 }}
          >
            <ExternalLink size={12} />
          </a>
        )}
      </div>
      {r.title && <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text)' }}>{r.title}</div>}
      <div
        style={{
          fontSize: 12,
          color: 'var(--text)',
          lineHeight: 1.6,
          overflow: 'hidden',
          display: open ? 'block' : '-webkit-box',
          WebkitLineClamp: open ? 'unset' : 5,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {r.review}
      </div>
      {r.review?.length > 300 && (
        <button
          onClick={() => setOpen(v => !v)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 11, padding: '4px 0 0', fontFamily: 'DM Sans' }}
        >
          {open ? 'Show less ^' : 'Read more v'}
        </button>
      )}
    </div>
  )
}

export default function ReviewsDrawer({
  category,
  label,
  filters,
  onClose,
  productName = null,
  sentiment = null,
  taxonomyCategory = null,
}) {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!category) { setReviews([]); return }

    setLoading(true)
    const params = new URLSearchParams({ keyword: category })
    if (productName) params.set('product', productName)
    else if (filters?.product?.length) params.set('product', filters.product.join('|||'))
    if (filters?.date_from) params.set('date_from', filters.date_from)
    if (filters?.date_to) params.set('date_to', filters.date_to)
    if (sentiment) params.set('sentiment', sentiment)
    if (taxonomyCategory) params.set('category', taxonomyCategory)

    fetch(apiUrl(`/api/reviews/by-keyword?${params}`), { headers: authHeaders() })
      .then(r => r.json())
      .then(setReviews)
      .catch(() => setReviews([]))
      .finally(() => setLoading(false))
  }, [category, productName, sentiment, taxonomyCategory, filters?.product?.join(','), filters?.date_from, filters?.date_to])

  // Close on Escape
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  if (!category) return null

  const negCount = reviews.filter(r => r.sentiment === 'Negative').length
  const posCount = reviews.filter(r => r.sentiment === 'Positive').length
  const neuCount = reviews.filter(r => r.sentiment === 'Neutral').length

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.45)',
          zIndex: 1000,
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Side panel */}
      <div
        style={{
          position: 'fixed', right: 0, top: 0,
          width: 480,
          maxWidth: '95vw',
          height: '100vh',
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          zIndex: 1001,
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight 0.22s ease',
          boxShadow: '-6px 0 32px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--surface2)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
            <span style={{ fontFamily: 'Bebas Neue', fontSize: 15, letterSpacing: '0.06em', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              Reviews —{' '}
              <span style={{ color: 'var(--accent)' }}>{label || category}</span>
            </span>
            {productName && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--surface)', padding: '1px 7px', borderRadius: 4, border: '1px solid var(--border)' }}>
                {productName}
              </span>
            )}
            {sentiment && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--surface)', padding: '1px 7px', borderRadius: 4, border: '1px solid var(--border)' }}>
                {sentiment}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {!loading && reviews.length > 0 && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ background: 'rgba(255,78,26,0.15)', color: 'var(--accent)', border: '1px solid rgba(255,78,26,0.3)', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}>
                  {reviews.length}
                </span>
                {negCount > 0 && <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 600 }}>{negCount} neg</span>}
                {posCount > 0 && <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 600 }}>{posCount} pos</span>}
                {neuCount > 0 && <span style={{ fontSize: 10, color: '#eab308', fontWeight: 600 }}>{neuCount} neu</span>}
              </div>
            )}
            <button
              onClick={onClose}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-muted)', fontSize: 11, padding: '4px 10px', cursor: 'pointer', fontFamily: 'DM Sans', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <X size={11} /> Close
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Loading reviews…
            </div>
          ) : reviews.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No reviews found for this category in the selected filters.
            </div>
          ) : (
            reviews.map((review, i) => <ReviewCard key={review.review_id || i} r={review} />)
          )}
        </div>
      </div>
    </>,
    document.body
  )
}
