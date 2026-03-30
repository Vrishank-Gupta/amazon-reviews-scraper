import { useState, useEffect, useCallback, useMemo } from 'react'
import { fetchSummary, fetchCxoTrends, fetchAnalysis, fetchWordCloud } from '../api'
import { InfoTip, StarLabel, Delta, Card } from './shared'
import WordCloud from './Wordcloud'
import ReviewsDrawer from './ReviewsDrawer'

function HealthPill({ negPct }) {
  const health = Math.max(0, Math.round(100 - (negPct || 0)))
  const color = health >= 75 ? '#22c55e' : health >= 60 ? '#eab308' : '#ef4444'
  const label = health >= 75 ? 'Good' : health >= 60 ? 'Watch' : 'Act Now'
  return (
    <span
      title={`Health score ${health} = 100 - negative %. Good is 75+, Watch is 60-74, Act Now is below 60.`}
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color,
        background: `${color}15`,
        border: `1px solid ${color}35`,
        borderRadius: 999,
        padding: '3px 8px',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}

function RatingDistribution({ row }) {
  const total = [1, 2, 3, 4, 5].reduce((sum, star) => sum + (row?.[String(star)] || 0), 0)
  if (!row || total === 0) return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No rating distribution available yet.</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {[5, 4, 3, 2, 1].map(star => {
        const count = row[String(star)] || 0
        const percent = total > 0 ? (count / total * 100).toFixed(1) : 0
        const color = star >= 4 ? '#22c55e' : star === 3 ? '#eab308' : '#ef4444'
        return (
          <div key={star} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 48, fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>{star} star</div>
            <div style={{ flex: 1, height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${percent}%`, background: color, borderRadius: 4 }} />
            </div>
            <div style={{ width: 42, fontSize: 11, color, fontWeight: 700, textAlign: 'right' }}>{percent}%</div>
            <div style={{ width: 26, fontSize: 10, color: 'var(--text-muted)', textAlign: 'right' }}>{count}</div>
          </div>
        )
      })}
    </div>
  )
}

function KeywordToneTabs({ value, onChange }) {
  const options = [
    ['mixed', 'Mixed'],
    ['negative', 'Negative'],
    ['neutral', 'Neutral'],
    ['positive', 'Positive'],
  ]

  return (
    <div style={{ display: 'flex', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: 2, gap: 2, flexWrap: 'wrap' }}>
      {options.map(([tone, label]) => (
        <button
          key={tone}
          onClick={() => onChange(tone)}
          style={{
            padding: '3px 10px',
            borderRadius: 5,
            border: 'none',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 600,
            fontFamily: 'DM Sans',
            background: value === tone ? 'var(--accent)' : 'transparent',
            color: value === tone ? '#fff' : 'var(--text-muted)',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function buildWordRows(words, tone) {
  const countKey = tone === 'mixed' ? 'count' : tone
  return (words || [])
    .map(word => ({ ...word, count: tone === 'mixed' ? word.count : (word[countKey] || 0) }))
    .filter(word => word.count > 0)
    .sort((left, right) => right.count - left.count)
}

function ProductDrillDown({ row, filters, ratingDistribution }) {
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(true)
  const [wcData, setWcData] = useState([])
  const [wcLoading, setWcLoading] = useState(true)
  const [wcTone, setWcTone] = useState('mixed')
  const [activeWord, setActiveWord] = useState(null)
  const hasScopedDateFilter = Boolean(filters.date_from || filters.date_to)

  useEffect(() => {
    setLoading(true)
    fetchAnalysis({ product: [row.product_name], date_from: filters.date_from, date_to: filters.date_to })
      .then(setAnalysis)
      .catch(() => setAnalysis(null))
      .finally(() => setLoading(false))
  }, [row.product_name, filters.date_from, filters.date_to])

  useEffect(() => {
    setWcLoading(true)
    setActiveWord(null)
    fetchWordCloud({ product: [row.product_name], date_from: filters.date_from, date_to: filters.date_to })
      .then(payload => setWcData(payload || []))
      .catch(() => setWcData([]))
      .finally(() => setWcLoading(false))
  }, [row.product_name, filters.date_from, filters.date_to])

  const issueRows = analysis?.neg_pie || []
  const positiveRows = analysis?.pos_pie || []
  const wordRows = buildWordRows(wcData, wcTone)
  const drawerSentiment = wcTone === 'mixed' ? null : `${wcTone.charAt(0).toUpperCase()}${wcTone.slice(1)}`

  return (
    <div style={{ padding: '16px 18px', background: 'var(--surface2)', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#ef4444', marginBottom: 8 }}>Issue Volume</div>
          {loading ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading...</div> : issueRows.length ? issueRows.map(item => (
            <div key={item.category} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 12, padding: '5px 0' }}>
              <span style={{ color: 'var(--text)' }}>{item.category}</span>
              <span style={{ color: '#ef4444', fontWeight: 700 }}>{item.count}</span>
            </div>
          )) : <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No issue breakdown yet.</div>}
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#22c55e', marginBottom: 8 }}>Positive Volume</div>
          {loading ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading...</div> : positiveRows.length ? positiveRows.map(item => (
            <div key={item.category} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 12, padding: '5px 0' }}>
              <span style={{ color: 'var(--text)' }}>{item.category}</span>
              <span style={{ color: '#22c55e', fontWeight: 700 }}>{item.count}</span>
            </div>
          )) : <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No positive breakdown yet.</div>}
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Rating Distribution</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Moved here from the overview layer so the split is visible in product drill-down.</div>
          </div>
          <RatingDistribution row={ratingDistribution} />
        </div>
      </div>

      {(row.ai_issues?.length || row.ai_positives?.length) ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#ef4444' }}>Top Issues</div>
            {(row.ai_issues || []).length ? row.ai_issues.map((issue, index) => (
              <div key={`${issue}-${index}`} style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.55, padding: '6px 8px', background: 'rgba(239,68,68,0.06)', borderRadius: 6, borderLeft: '2px solid rgba(239,68,68,0.3)' }}>
                {issue}
              </div>
            )) : <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No AI issue summary yet.</div>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#22c55e' }}>What Customers Like</div>
            {(row.ai_positives || []).length ? row.ai_positives.map((item, index) => (
              <div key={`${item}-${index}`} style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.55, padding: '6px 8px', background: 'rgba(34,197,94,0.06)', borderRadius: 6, borderLeft: '2px solid rgba(34,197,94,0.3)' }}>
                {item}
              </div>
            )) : <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No AI positive summary yet.</div>}
          </div>
        </div>
      ) : null}

      {hasScopedDateFilter && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          AI summary text is stored at product level today, so it may not fully reflect the selected date range yet.
        </div>
      )}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Keyword Cloud</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>Click a keyword to open the matching reviews for this product.</div>
          </div>
          <KeywordToneTabs value={wcTone} onChange={setWcTone} />
        </div>

        {wcLoading ? (
          <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Loading keyword cloud...</div>
        ) : !wordRows.length ? (
          <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No keyword data for this product in the selected filters.</div>
        ) : (
          <WordCloud data={wordRows} activeWord={activeWord} onWordClick={setActiveWord} />
        )}

        <ReviewsDrawer
          category={activeWord}
          label={activeWord}
          productName={row.product_name}
          sentiment={drawerSentiment}
          filters={filters}
          onClose={() => setActiveWord(null)}
        />
      </div>
    </div>
  )
}

function TH({ children, tip, onClick, sortDir }) {
  return (
    <th onClick={onClick} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', background: 'var(--surface2)', cursor: onClick ? 'pointer' : 'default', userSelect: 'none' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        {children}
        {onClick && <span style={{ opacity: 0.5, fontSize: 9 }}>{sortDir != null ? (sortDir > 0 ? '^' : 'v') : '<>'}</span>}
        {tip && <InfoTip text={tip} />}
      </span>
    </th>
  )
}

export default function SummaryPage({ filters, allProducts }) {
  const [rows, setRows] = useState([])
  const [ratingDistribution, setRatingDistribution] = useState([])
  const [loading, setLoading] = useState(true)
  const [hasData, setHasData] = useState(false)
  const [drillRow, setDrillRow] = useState(null)
  const [sortKey, setSortKey] = useState('neg_pct')
  const [sortDir, setSortDir] = useState(-1)

  const apiParams = {
    product_category: filters.product_category || null,
    product: filters.product?.length ? filters.product : [],
    date_from: filters.date_from,
    date_to: filters.date_to,
  }

  const load = useCallback(() => {
    if (!allProducts?.length) return
    setLoading(true)
    Promise.all([
      fetchSummary(apiParams),
      fetchCxoTrends(apiParams).catch(() => null),
    ])
      .then(([summaryRows, cxo]) => {
        setRows(summaryRows)
        setRatingDistribution(cxo?.rating_distribution || [])
        setHasData(true)
      })
      .finally(() => setLoading(false))
  }, [JSON.stringify(apiParams), allProducts?.length])

  useEffect(() => { load() }, [load])

  const handleSort = key => {
    if (sortKey === key) setSortDir(dir => -dir)
    else {
      setSortKey(key)
      setSortDir(key === 'product_name' || key === 'category' ? 1 : -1)
    }
  }

  const sorted = [...rows].sort((left, right) => {
    const leftValue = left[sortKey] ?? (sortKey === 'category' ? left.category : 0)
    const rightValue = right[sortKey] ?? (sortKey === 'category' ? right.category : 0)
    return typeof leftValue === 'string'
      ? leftValue.localeCompare(rightValue) * sortDir
      : (leftValue - rightValue) * sortDir
  })

  const groupedRows = useMemo(() => {
    const groups = {}
    sorted.forEach(row => {
      const category = row.category || 'Other'
      if (!groups[category]) groups[category] = []
      groups[category].push(row)
    })
    return Object.entries(groups).map(([category, items]) => ({ category, items }))
  }, [sorted])

  const ratingLookup = useMemo(
    () => Object.fromEntries(ratingDistribution.map(row => [row.product, row])),
    [ratingDistribution],
  )

  if (loading && !hasData) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-muted)', gap: 10 }}>
        <span style={{ fontSize: 20 }}>...</span> Loading products...
      </div>
    )
  }

  if (!rows.length) {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No data for selected filters.</div>
  }

  return (
    <Card
      title="Product Comparison Table"
      sub="Grouped by category for easier scanning, with drill-down kept at row level."
      tip="This stays at the bottom of Overview. The KPI cards and Amazon Rating Signal now sit together in the top row."
    >
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontFamily: 'Bebas Neue', fontSize: 17, letterSpacing: '0.06em', color: 'var(--text-muted)' }}>Product Comparison Table</span>
              <InfoTip text="This is the original comparison table, kept in place and grouped by category. Click a product row to open its drill-down." />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Sorted by the selected column and split by category sections.
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span><span style={{ color: '#ef4444', fontWeight: 700 }}>up red</span> = worse</span>
            <span><span style={{ color: '#22c55e', fontWeight: 700 }}>down green</span> = improved</span>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <TH onClick={() => handleSort('product_name')} sortDir={sortKey === 'product_name' ? sortDir : null} tip="Product name with health status pill">Product</TH>
                <TH onClick={() => handleSort('avg_rating')} sortDir={sortKey === 'avg_rating' ? sortDir : null} tip="Average star rating (1-5) in current period">Avg Rating</TH>
                <TH tip="Rating change vs prior period">Delta Rating</TH>
                <TH onClick={() => handleSort('review_count')} sortDir={sortKey === 'review_count' ? sortDir : null} tip="Total reviews in current period">Reviews</TH>
                <TH tip="Review count change vs prior period">Delta Reviews</TH>
                <TH onClick={() => handleSort('neg_pct')} sortDir={sortKey === 'neg_pct' ? sortDir : null} tip="% of reviews tagged Negative">Neg %</TH>
                <TH tip="Negative-rate change vs prior period">Delta Neg %</TH>
                <TH />
              </tr>
            </thead>
            <tbody>
              {groupedRows.map(group => (
                group.items.map((row, index) => {
                  const isFirst = index === 0
                  const isDrill = drillRow?.asin === row.asin
                  const rowBg = index % 2 === 0 ? 'var(--surface)' : 'var(--surface2)'
                  return (
                    <FragmentRow
                      key={`${group.category}-${row.asin}`}
                      showCategory={isFirst}
                      category={group.category}
                      row={row}
                      rowBg={rowBg}
                      isDrill={isDrill}
                      onToggle={() => setDrillRow(isDrill ? null : row)}
                      ratingDistribution={ratingLookup[row.product_name]}
                      filters={apiParams}
                    />
                  )
                })
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  )
}

function FragmentRow({ showCategory, category, row, rowBg, isDrill, onToggle, ratingDistribution, filters }) {
  return (
    <>
      {showCategory && (
        <tr>
          <td colSpan={8} style={{ padding: '10px 14px', background: 'rgba(255,78,26,0.07)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)' }}>
            {category}
          </td>
        </tr>
      )}
      <tr
        onClick={onToggle}
        style={{ cursor: 'pointer', background: isDrill ? 'rgba(255,78,26,0.05)' : rowBg, transition: 'background 0.1s', borderLeft: isDrill ? '3px solid var(--accent)' : '3px solid transparent' }}
        onMouseEnter={event => { event.currentTarget.style.background = 'rgba(255,78,26,0.04)' }}
        onMouseLeave={event => { event.currentTarget.style.background = isDrill ? 'rgba(255,78,26,0.05)' : rowBg }}
      >
        <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, borderBottom: isDrill ? 'none' : '1px solid var(--border)', maxWidth: 230 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.product_name}</span>
            <HealthPill negPct={row.neg_pct} />
          </div>
        </td>
        <td style={{ padding: '12px 14px', borderBottom: isDrill ? 'none' : '1px solid var(--border)' }}>
          <StarLabel rating={row.avg_rating} />
        </td>
        <td style={{ padding: '12px 14px', borderBottom: isDrill ? 'none' : '1px solid var(--border)' }}><Delta val={row.delta_rating} /></td>
        <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, borderBottom: isDrill ? 'none' : '1px solid var(--border)' }}>{row.review_count?.toLocaleString()}</td>
        <td style={{ padding: '12px 14px', borderBottom: isDrill ? 'none' : '1px solid var(--border)' }}><Delta val={row.delta_reviews} /></td>
        <td style={{ padding: '12px 14px', borderBottom: isDrill ? 'none' : '1px solid var(--border)' }}>
          <span style={{ color: row.neg_pct > 50 ? '#ef4444' : row.neg_pct > 30 ? '#eab308' : '#22c55e', fontWeight: 700 }}>{row.neg_pct}%</span>
        </td>
        <td style={{ padding: '12px 14px', borderBottom: isDrill ? 'none' : '1px solid var(--border)' }}><Delta val={row.delta_neg_pct} invertColor /></td>
        <td style={{ padding: '12px 14px', color: 'var(--accent)', fontSize: 12, borderBottom: isDrill ? 'none' : '1px solid var(--border)', fontWeight: 700 }}>
          {isDrill ? 'collapse ^' : 'drill down v'}
        </td>
      </tr>
      {isDrill && (
        <tr>
          <td colSpan={8} style={{ padding: 0, borderBottom: '1px solid var(--border)' }}>
            <ProductDrillDown row={row} filters={filters} ratingDistribution={ratingDistribution} />
          </td>
        </tr>
      )}
    </>
  )
}
