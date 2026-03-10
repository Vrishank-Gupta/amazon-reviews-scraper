import { useState } from 'react'
import { ExternalLink, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 15

const sentimentColors = {
  Positive: { bg: '#22c55e20', text: '#22c55e', border: '#22c55e40' },
  Neutral:  { bg: '#eab30820', text: '#eab308', border: '#eab30840' },
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
  return (
    <span style={{ color: rating >= 4 ? '#22c55e' : rating === 3 ? '#eab308' : '#ef4444', fontSize: 13 }}>
      {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
    </span>
  )
}

export default function ReviewsTable({ data }) {
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState(null)
  const [sortKey, setSortKey] = useState('scrape_date')
  const [sortDir, setSortDir] = useState('desc')

  const sorted = [...data].sort((a, b) => {
    let av = a[sortKey], bv = b[sortKey]
    if (typeof av === 'string') av = av.toLowerCase()
    if (typeof bv === 'string') bv = bv.toLowerCase()
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const pageData = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const SortIcon = ({ k }) => {
    if (sortKey !== k) return <span style={{ opacity: 0.2 }}>↕</span>
    return <span style={{ color: 'var(--accent)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const thStyle = (key) => ({
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    borderBottom: '1px solid var(--border)',
    background: 'var(--surface2)',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {[
                ['product_name', 'Product'],
                ['rating', 'Rating'],
                ['sentiment', 'Sentiment'],
                ['scrape_date', 'Date'],
              ].map(([key, label]) => (
                <th key={key} style={thStyle(key)} onClick={() => toggleSort(key)}>
                  {label} <SortIcon k={key} />
                </th>
              ))}
              <th style={thStyle('')}>Categories / Tags</th>
              <th style={{ ...thStyle(''), cursor: 'default' }}>Review</th>
              <th style={{ ...thStyle(''), cursor: 'default' }}>Link</th>
            </tr>
          </thead>
          <tbody>
            {pageData.map((row, i) => {
              const isExp = expanded === row.review_id
              return (
                <>
                  <tr
                    key={row.review_id}
                    style={{
                      background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#ff4e1a0a'}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)'}
                  >
                    <td style={{ padding: '12px 16px', fontSize: 13, maxWidth: 160, borderBottom: '1px solid var(--border)' }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.product_name || row.asin}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                      <Stars rating={row.rating} />
                    </td>
                    <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                      <SentimentBadge sentiment={row.sentiment} />
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                      {row.scrape_date ? new Date(row.scrape_date).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', maxWidth: 240 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {(row.primary_categories || []).map(c => <Tag key={c} label={c} />)}
                        {(row.sub_tags || []).map(t => (
                          <span key={t} style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 0' }}>
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', maxWidth: 300 }}>
                      <button
                        onClick={() => setExpanded(isExp ? null : row.review_id)}
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
                        <span style={{
                          overflow: isExp ? 'visible' : 'hidden',
                          textOverflow: isExp ? 'unset' : 'ellipsis',
                          whiteSpace: isExp ? 'normal' : 'nowrap',
                          display: 'block',
                          lineHeight: 1.5,
                          flex: 1,
                        }}>
                          {row.review}
                        </span>
                        {isExp
                          ? <ChevronUp size={14} style={{ flexShrink: 0, marginTop: 2, color: 'var(--accent)' }} />
                          : <ChevronDown size={14} style={{ flexShrink: 0, marginTop: 2, color: 'var(--text-muted)' }} />
                        }
                      </button>
                    </td>
                    <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                      {row.review_url && (
                        <a
                          href={row.review_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center' }}
                        >
                          <ExternalLink size={15} />
                        </a>
                      )}
                    </td>
                  </tr>
                </>
              )
            })}
            {pageData.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                  No reviews match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 4px',
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--surface2)',
                color: page === 0 ? 'var(--text-muted)' : 'var(--text)',
                cursor: page === 0 ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 12,
              }}
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--surface2)',
                color: page >= totalPages - 1 ? 'var(--text-muted)' : 'var(--text)',
                cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 12,
              }}
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
