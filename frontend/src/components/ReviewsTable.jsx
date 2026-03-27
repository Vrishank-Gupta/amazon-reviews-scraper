import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Search,
} from 'lucide-react'

const PAGE_SIZE = 15

const sentimentColors = {
  Positive: { bg: '#22c55e20', text: '#22c55e', border: '#22c55e40' },
  Neutral: { bg: '#eab30820', text: '#eab308', border: '#eab30840' },
  Negative: { bg: '#ef444420', text: '#ef4444', border: '#ef444440' },
}

function Tag({ label }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 4,
      background: '#ff4e1a18',
      border: '1px solid #ff4e1a30',
      color: '#ff8c42',
      fontSize: 11,
      fontWeight: 500,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

function SentimentBadge({ sentiment }) {
  const c = sentimentColors[sentiment] || sentimentColors.Neutral
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: 20,
      background: c.bg,
      border: `1px solid ${c.border}`,
      color: c.text,
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.04em',
    }}>
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

function ReviewRow({ row, expanded, setExpanded }) {
  const isExpanded = expanded === row.review_id

  return (
    <tr
      style={{ background: 'transparent', transition: 'background 0.15s' }}
      onMouseEnter={event => { event.currentTarget.style.background = '#ff4e1a0a' }}
      onMouseLeave={event => { event.currentTarget.style.background = 'transparent' }}
    >
      <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <Stars rating={row.rating} />
      </td>
      <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <SentimentBadge sentiment={row.sentiment} />
      </td>
      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
        {row.scrape_date ? new Date(row.scrape_date).toLocaleDateString('en-IN') : '—'}
      </td>
      <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', maxWidth: 260 }}>
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
          }}
        >
          <span
            style={{
              overflow: isExpanded ? 'visible' : 'hidden',
              textOverflow: isExpanded ? 'unset' : 'ellipsis',
              whiteSpace: isExpanded ? 'normal' : 'nowrap',
              display: 'block',
              lineHeight: 1.5,
              flex: 1,
            }}
          >
            {row.review}
          </span>
          {isExpanded
            ? <ChevronUp size={14} style={{ flexShrink: 0, marginTop: 2, color: 'var(--accent)' }} />
            : <ChevronDown size={14} style={{ flexShrink: 0, marginTop: 2, color: 'var(--text-muted)' }} />}
        </button>
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
  )
}

function ProductAccordion({ product, rows, expanded, setExpanded }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setOpen(false)
  }, [product])

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
    <div style={{ borderTop: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen(current => !current)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 16px',
          border: 'none',
          background: 'transparent',
          color: 'var(--text)',
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
            {product}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {rows.length} review{rows.length === 1 ? '' : 's'}
          </span>
        </div>
        {open ? <ChevronUp size={15} color="var(--text-muted)" /> : <ChevronDown size={15} color="var(--text-muted)" />}
      </button>

      {open && (
        <div style={{ overflowX: 'auto', borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.015)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Rating</th>
                <th style={thStyle}>Sentiment</th>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Categories / Tags</th>
                <th style={thStyle}>Review</th>
                <th style={thStyle}>Link</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <ReviewRow key={row.review_id} row={row} expanded={expanded} setExpanded={setExpanded} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function CategoryAccordion({ category, rows, expanded, setExpanded, open, onToggle }) {
  const productGroups = useMemo(() => {
    const map = {}
    rows.forEach(row => {
      const product = row.product_name || row.asin || 'Unknown Product'
      if (!map[product]) map[product] = []
      map[product].push(row)
    })
    return Object.entries(map)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([product, productRows]) => ({ product, rows: productRows }))
  }, [rows])

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'rgba(255,255,255,0.02)' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '14px 16px',
          border: 'none',
          borderBottom: open ? '1px solid var(--border)' : 'none',
          background: 'rgba(255,255,255,0.03)',
          color: 'var(--text)',
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)' }}>
            {category}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {rows.length} review{rows.length === 1 ? '' : 's'}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            · {productGroups.length} product{productGroups.length === 1 ? '' : 's'}
          </span>
        </div>
        {open ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
      </button>

      {open && (
        <div>
          {productGroups.map(group => (
            <ProductAccordion
              key={`${category}-${group.product}`}
              product={group.product}
              rows={group.rows}
              expanded={expanded}
              setExpanded={setExpanded}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function ReviewsTable({ data }) {
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState(null)
  const [sortKey, setSortKey] = useState('category')
  const [sortDir, setSortDir] = useState('asc')
  const [query, setQuery] = useState('')
  const [openCategories, setOpenCategories] = useState({})

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
      let av = a[sortKey]
      let bv = b[sortKey]
      if (sortKey === 'category') {
        av = a.category || 'Other'
        bv = b.category || 'Other'
      }
      if (typeof av === 'string') av = av.toLowerCase()
      if (typeof bv === 'string') bv = bv.toLowerCase()
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      if (sortKey === 'category') {
        const dateA = a.scrape_date || ''
        const dateB = b.scrape_date || ''
        return dateA < dateB ? 1 : -1
      }
      return 0
    })
  }, [filtered, sortDir, sortKey])

  const grouped = useMemo(() => {
    const map = {}
    sorted.forEach(row => {
      const category = row.category || 'Other'
      if (!map[category]) map[category] = []
      map[category].push(row)
    })
    return Object.entries(map).map(([category, rows]) => ({ category, rows }))
  }, [sorted])

  const totalPages = Math.ceil(grouped.length / PAGE_SIZE)
  const pageGroups = grouped.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  useEffect(() => {
    if (page > 0 && page >= totalPages) setPage(Math.max(0, totalPages - 1))
  }, [page, totalPages])

  useEffect(() => {
    setOpenCategories(prev => {
      const next = {}
      pageGroups.forEach((group, index) => {
        next[group.category] = prev[group.category] ?? index === 0
      })
      return next
    })
  }, [pageGroups])

  const evidenceStats = useMemo(() => {
    const total = filtered.length
    const negative = filtered.filter(row => row.sentiment === 'Negative').length
    const positive = filtered.filter(row => row.sentiment === 'Positive').length
    const neutral = filtered.filter(row => row.sentiment === 'Neutral').length
    const avgStars = filtered.length
      ? (filtered.reduce((sum, row) => sum + (parseFloat(row.rating) || 0), 0) / filtered.length).toFixed(1)
      : '0.0'
    return { total, negative, positive, neutral, avgStars }
  }, [filtered])

  const topCategory = useMemo(() => {
    const counts = {}
    filtered.forEach(row => {
      const category = row.category || 'Other'
      counts[category] = (counts[category] || 0) + 1
    })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  }, [filtered])

  const toggleSort = key => {
    if (sortKey === key) setSortDir(dir => (dir === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'category' ? 'asc' : 'desc')
    }
    setPage(0)
  }

  const SortIcon = ({ k }) => {
    if (sortKey !== k) return <span style={{ opacity: 0.2 }}>↕</span>
    return <span style={{ color: 'var(--accent)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
          {[
            { label: 'Evidence Set', value: evidenceStats.total, color: 'var(--accent)' },
            { label: 'Negative', value: evidenceStats.negative, color: '#ef4444' },
            { label: 'Positive', value: evidenceStats.positive, color: '#22c55e' },
            { label: 'Neutral', value: evidenceStats.neutral, color: '#eab308' },
            { label: 'Avg Stars', value: evidenceStats.avgStars, color: '#60a5fa' },
          ].map(item => (
            <div key={item.label} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${item.color}22`, borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{item.label}</div>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: 24, lineHeight: 1, color: item.color }}>{item.value}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Evidence Narrative</div>
            <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.65 }}>
              {evidenceStats.total
                ? <>This filtered set contains <strong>{evidenceStats.total}</strong> reviews with <strong style={{ color: '#ef4444' }}>{evidenceStats.negative}</strong> negative and <strong style={{ color: '#22c55e' }}>{evidenceStats.positive}</strong> positive signals. {topCategory ? <>The largest product category in view is <strong>{topCategory[0]}</strong>.</> : null}</>
                : 'No reviews match the current filters yet.'}
            </div>
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
            <input
              value={query}
              onChange={event => {
                setQuery(event.target.value)
                setPage(0)
              }}
              placeholder="Search review text, titles, categories, or tags"
              style={{ width: '100%', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '8px 10px 8px 32px', fontSize: 12, outline: 'none', fontFamily: 'DM Sans' }}
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Reviews are grouped by category first, then by product, so you can drill down without losing the portfolio structure.
        </div>
        <button
          onClick={() => toggleSort('category')}
          style={{
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'rgba(255,255,255,0.02)',
            color: 'var(--text-muted)',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          Category {<SortIcon k="category" />}
        </button>
      </div>

      {pageGroups.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pageGroups.map(group => (
            <CategoryAccordion
              key={group.category}
              category={group.category}
              rows={group.rows}
              expanded={expanded}
              setExpanded={setExpanded}
              open={!!openCategories[group.category]}
              onToggle={() => setOpenCategories(prev => ({ ...prev, [group.category]: !prev[group.category] }))}
            />
          ))}
        </div>
      ) : (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14, border: '1px solid var(--border)', borderRadius: 12 }}>
          {normalizedQuery
            ? `No reviews found for "${query}" — try different keywords or broaden your filters.`
            : 'No reviews match the current filters.'}
        </div>
      )}

      {grouped.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 4px' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {totalPages > 1
              ? `Showing categories ${page * PAGE_SIZE + 1}-${Math.min((page + 1) * PAGE_SIZE, grouped.length)} of ${grouped.length}`
              : `${grouped.length} categor${grouped.length === 1 ? 'y' : 'ies'}`}
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
