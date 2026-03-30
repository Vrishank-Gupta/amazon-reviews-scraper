import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Search,
} from 'lucide-react'

const PAGE_SIZE = 20

const sentimentColors = {
  Positive: { bg: '#22c55e20', text: '#22c55e', border: '#22c55e40' },
  Neutral: { bg: '#eab30820', text: '#eab308', border: '#eab30840' },
  Negative: { bg: '#ef444420', text: '#ef4444', border: '#ef444440' },
}

function Tag({ label }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        background: '#ff4e1a18',
        border: '1px solid #ff4e1a30',
        color: '#ff8c42',
        fontSize: 11,
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}

function SentimentBadge({ sentiment }) {
  const c = sentimentColors[sentiment] || sentimentColors.Neutral
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 20,
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.text,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.04em',
      }}
    >
      {sentiment}
    </span>
  )
}

function Stars({ rating }) {
  const n = Math.round(parseFloat(rating) || 0)
  const color = n >= 4 ? '#22c55e' : n === 3 ? '#eab308' : '#ef4444'
  return (
    <span style={{ color, fontSize: 13, letterSpacing: '0.04em' }}>
      {'★'.repeat(n)}{'☆'.repeat(Math.max(0, 5 - n))}
    </span>
  )
}

function SortButton({ label, active, dir, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 10px',
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: active ? 'rgba(255,78,26,0.08)' : 'rgba(255,255,255,0.02)',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        fontSize: 11,
        cursor: 'pointer',
      }}
    >
      {label} {active ? (dir === 'asc' ? '↑' : '↓') : '↕'}
    </button>
  )
}

function ReviewText({ row, expanded, setExpanded }) {
  const isExpanded = expanded === row.review_id
  const canExpand = (row.review || '').length > 140 || (row.review || '').includes('\n')

  if (!canExpand) {
    return <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.55 }}>{row.review}</div>
  }

  return (
    <button
      onClick={() => setExpanded(isExpanded ? null : row.review_id)}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--text)',
        fontSize: 12,
        textAlign: 'left',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 6,
        padding: 0,
        width: '100%',
        fontFamily: 'DM Sans',
      }}
    >
      <span
        style={{
          overflow: isExpanded ? 'visible' : 'hidden',
          textOverflow: isExpanded ? 'unset' : 'ellipsis',
          whiteSpace: isExpanded ? 'normal' : 'nowrap',
          display: 'block',
          lineHeight: 1.55,
          flex: 1,
        }}
      >
        {row.review}
      </span>
      {isExpanded
        ? <ChevronUp size={14} style={{ flexShrink: 0, marginTop: 2, color: 'var(--accent)' }} />
        : <ChevronDown size={14} style={{ flexShrink: 0, marginTop: 2, color: 'var(--text-muted)' }} />}
    </button>
  )
}

export default function ReviewsTable({ data }) {
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState(null)
  const [sortKey, setSortKey] = useState('scrape_date')
  const [sortDir, setSortDir] = useState('desc')
  const [query, setQuery] = useState('')

  const normalizedQuery = query.trim().toLowerCase()

  const filtered = useMemo(() => {
    if (!normalizedQuery) return data
    return data.filter(row => {
      const haystack = [
        row.product_name,
        row.category,
        row.review,
        row.title,
        row.sentiment,
        ...(row.primary_categories || []),
        ...(row.sub_tags || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [data, normalizedQuery])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av
      let bv

      if (sortKey === 'rating') {
        av = parseFloat(a.rating) || 0
        bv = parseFloat(b.rating) || 0
      } else if (sortKey === 'scrape_date') {
        av = a.scrape_date || ''
        bv = b.scrape_date || ''
      } else {
        av = (a[sortKey] || '').toString().toLowerCase()
        bv = (b[sortKey] || '').toString().toLowerCase()
      }

      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [filtered, sortDir, sortKey])

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  useEffect(() => {
    if (page > 0 && page >= totalPages) setPage(Math.max(0, totalPages - 1))
  }, [page, totalPages])

  const stats = useMemo(() => {
    const total = filtered.length
    const negative = filtered.filter(row => row.sentiment === 'Negative').length
    const positive = filtered.filter(row => row.sentiment === 'Positive').length
    const neutral = filtered.filter(row => row.sentiment === 'Neutral').length
    const avgStars = filtered.length
      ? (filtered.reduce((sum, row) => sum + (parseFloat(row.rating) || 0), 0) / filtered.length).toFixed(1)
      : '0.0'
    return { total, negative, positive, neutral, avgStars }
  }, [filtered])

  const setSort = key => {
    if (sortKey === key) setSortDir(current => (current === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'product_name' || key === 'category' ? 'asc' : 'desc')
    }
    setPage(0)
  }

  const thStyle = {
    padding: '10px 16px',
    textAlign: 'left',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    borderBottom: '1px solid var(--border)',
    background: 'rgba(255,255,255,0.015)',
    whiteSpace: 'nowrap',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10 }}>
        {[
          { label: 'Total Reviews', value: stats.total, color: 'var(--accent)' },
          { label: 'Negative', value: stats.negative, color: '#ef4444' },
          { label: 'Positive', value: stats.positive, color: '#22c55e' },
          { label: 'Neutral', value: stats.neutral, color: '#eab308' },
          { label: 'Avg Rating', value: stats.avgStars, color: '#60a5fa' },
        ].map(item => (
          <div
            key={item.label}
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${item.color}22`,
              borderRadius: 10,
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              {item.label}
            </div>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: 24, lineHeight: 1, color: item.color }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', minWidth: 280, flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
          <input
            value={query}
            onChange={event => {
              setQuery(event.target.value)
              setPage(0)
            }}
            placeholder="Search product, category, review text, or tags"
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--text)',
              padding: '8px 10px 8px 32px',
              fontSize: 12,
              outline: 'none',
              fontFamily: 'DM Sans',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <SortButton label="Date" active={sortKey === 'scrape_date'} dir={sortDir} onClick={() => setSort('scrape_date')} />
          <SortButton label="Category" active={sortKey === 'category'} dir={sortDir} onClick={() => setSort('category')} />
          <SortButton label="Product" active={sortKey === 'product_name'} dir={sortDir} onClick={() => setSort('product_name')} />
          <SortButton label="Rating" active={sortKey === 'rating'} dir={sortDir} onClick={() => setSort('rating')} />
        </div>
      </div>

      {pageRows.length ? (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12, background: 'rgba(255,255,255,0.02)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Category</th>
                <th style={thStyle}>Product</th>
                <th style={thStyle}>Rating</th>
                <th style={thStyle}>Sentiment</th>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Tags</th>
                <th style={{ ...thStyle, minWidth: 340 }}>Review</th>
                <th style={thStyle}>Link</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, index) => (
                <tr
                  key={row.review_id || `${row.product_name}-${index}`}
                  style={{ background: 'transparent', transition: 'background 0.15s' }}
                  onMouseEnter={event => { event.currentTarget.style.background = '#ff4e1a0a' }}
                  onMouseLeave={event => { event.currentTarget.style.background = 'transparent' }}
                >
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                    {row.category || 'Other'}
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600 }}>
                    {row.product_name || row.asin || 'Unknown Product'}
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                    <Stars rating={row.rating} />
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                    <SentimentBadge sentiment={row.sentiment} />
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                    {row.scrape_date ? new Date(row.scrape_date).toLocaleDateString('en-IN') : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', maxWidth: 240 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {(row.primary_categories || []).map(category => <Tag key={category} label={category} />)}
                      {(row.sub_tags || []).map(tag => (
                        <span key={tag} style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 0' }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', maxWidth: 420 }}>
                    <ReviewText row={row} expanded={expanded} setExpanded={setExpanded} />
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                    {row.review_url ? (
                      <a
                        href={row.review_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: 'var(--accent)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '5px 8px',
                          border: '1px solid rgba(255,78,26,0.28)',
                          background: 'rgba(255,78,26,0.08)',
                          borderRadius: 6,
                          textDecoration: 'none',
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        <ExternalLink size={13} /> Amazon
                      </a>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14, border: '1px solid var(--border)', borderRadius: 12 }}>
          {normalizedQuery
            ? `No reviews found for "${query}" — try different keywords or broaden your filters.`
            : 'No reviews match the current filters.'}
        </div>
      )}

      {sorted.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 4px' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {totalPages > 1
              ? `Showing reviews ${page * PAGE_SIZE + 1}-${Math.min((page + 1) * PAGE_SIZE, sorted.length)} of ${sorted.length}`
              : `${sorted.length} review${sorted.length === 1 ? '' : 's'}`}
          </span>
          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setPage(current => Math.max(0, current - 1))}
                disabled={page === 0}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--surface2)',
                  color: page === 0 ? 'var(--text-muted)' : 'var(--text)',
                  cursor: page === 0 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 12,
                }}
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <button
                onClick={() => setPage(current => Math.min(totalPages - 1, current + 1))}
                disabled={page >= totalPages - 1}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--surface2)',
                  color: page >= totalPages - 1 ? 'var(--text-muted)' : 'var(--text)',
                  cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 12,
                }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
