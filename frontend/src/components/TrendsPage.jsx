import { useState, useEffect, useMemo } from 'react'
import { fetchTrends, fetchWordCloud, fetchReviewsByKeyword } from '../api'
import WordCloud from './WordCloud'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, CartesianGrid, Cell, LabelList
} from 'recharts'
import { Loader2, Download, List } from 'lucide-react'
import ReviewsTable from './ReviewsTable'

// ── Palette ─────────────────────────────────────────────────────────────────
const PALETTE = [
  '#ff4e1a','#ff8c42','#ffd166','#06d6a0','#118ab2',
  '#a855f7','#ec4899','#14b8a6','#f97316','#84cc16',
  '#60a5fa','#f43f5e','#34d399','#fb923c','#c084fc',
]
const SENTIMENT_COLORS = { Positive: '#22c55e', Neutral: '#eab308', Negative: '#ef4444' }

const tooltipStyle = {
  background: '#18181f', border: '1px solid #222230',
  borderRadius: 8, color: '#f0ede8', fontSize: 12,
}

// ── Small helpers ────────────────────────────────────────────────────────────
function Section({ title, subtitle, children, controls }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '20px 24px',
      display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ margin: 0, fontFamily: 'Bebas Neue', fontSize: 20, letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
            {title}
          </h3>
          {subtitle && <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{subtitle}</p>}
        </div>
        {controls}
      </div>
      {children}
    </div>
  )
}

function ToggleBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 12px', borderRadius: 6, border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
      background: active ? 'var(--accent)20' : 'transparent',
      color: active ? 'var(--accent)' : 'var(--text-muted)',
      fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
    }}>
      {children}
    </button>
  )
}

function DatePreset({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '4px 10px', borderRadius: 5,
      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
      background: active ? 'var(--accent)20' : 'transparent',
      color: active ? 'var(--accent)' : 'var(--text-muted)',
      fontSize: 11, cursor: 'pointer', transition: 'all 0.15s',
    }}>
      {label}
    </button>
  )
}

function inputStyle() {
  return {
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: 6, color: 'var(--text)', padding: '5px 10px',
    fontSize: 12, outline: 'none', cursor: 'pointer',
    colorScheme: 'dark',
  }
}

// ── Custom legend ─────────────────────────────────────────────────────────────
function CustomLegend({ items, hidden, onToggle }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', padding: '0 4px' }}>
      {items.map(({ key, color }) => (
        <button key={key} onClick={() => onToggle(key)} style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          opacity: hidden.has(key) ? 0.3 : 1, transition: 'opacity 0.15s',
        }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: 'var(--text)', whiteSpace: 'nowrap' }}>{key}</span>
        </button>
      ))}
    </div>
  )
}

// ── Heatmap ──────────────────────────────────────────────────────────────────
function Heatmap({ data, products, subtags }) {
  if (!data.length) return <Empty />

  const [hoveredCell, setHoveredCell] = useState(null)

  const lookup = {}
  data.forEach(d => { lookup[`${d.product}__${d.subtag}`] = d.count })
  const max = Math.max(...data.map(d => d.count), 1)

  const CELL = 36  // cell size px

  return (
    <div style={{ overflowX: 'auto', overflowY: 'visible', paddingTop: 8 }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 4, fontSize: 11, tableLayout: 'fixed' }}>
        <thead>
          <tr>
            {/* sticky product label column header */}
            <th style={{
              width: 160, minWidth: 160,
              padding: '0 12px 8px 0',
              textAlign: 'left', color: 'var(--text-muted)',
              fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap',
              verticalAlign: 'bottom',
            }}>
              Product
            </th>
            {subtags.map(st => (
              <th key={st} style={{
                width: CELL, minWidth: CELL,
                height: 130,
                padding: 0,
                verticalAlign: 'bottom',
                position: 'relative',
              }}>
                {/* Angled label container */}
                <div style={{
                  position: 'absolute',
                  bottom: 6,
                  left: '50%',
                  transformOrigin: 'bottom left',
                  transform: 'rotate(-45deg) translateX(-50%)',
                  whiteSpace: 'nowrap',
                  fontSize: 11,
                  fontWeight: 500,
                  color: 'var(--text-muted)',
                  lineHeight: 1,
                  maxWidth: 160,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {st}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {products.map(p => (
            <tr key={p}>
              <td style={{
                padding: '0 12px 0 0',
                color: 'var(--text)', whiteSpace: 'nowrap',
                fontWeight: 600, fontSize: 12,
                verticalAlign: 'middle',
              }}>
                {p}
              </td>
              {subtags.map(st => {
                const val = lookup[`${p}__${st}`] || 0
                const intensity = val / max
                const cellKey = `${p}__${st}`
                const isHovered = hoveredCell === cellKey
                const bg = val === 0
                  ? 'var(--surface2)'
                  : `rgba(255, 78, 26, ${0.08 + intensity * 0.9})`
                return (
                  <td
                    key={st}
                    onMouseEnter={() => setHoveredCell(cellKey)}
                    onMouseLeave={() => setHoveredCell(null)}
                    style={{
                      width: CELL, height: CELL,
                      borderRadius: 5,
                      background: isHovered && val > 0 ? `rgba(255,140,66,${0.15 + intensity * 0.85})` : bg,
                      textAlign: 'center', verticalAlign: 'middle',
                      color: intensity > 0.45 ? '#fff' : intensity > 0 ? 'rgba(255,255,255,0.7)' : 'transparent',
                      fontSize: 11, fontWeight: 700, cursor: val > 0 ? 'default' : 'default',
                      transition: 'all 0.15s',
                      outline: isHovered && val > 0 ? '1.5px solid rgba(255,140,66,0.7)' : 'none',
                      position: 'relative',
                    }}
                  >
                    {val > 0 ? val : ''}
                    {/* Tooltip */}
                    {isHovered && val > 0 && (
                      <div style={{
                        position: 'absolute',
                        bottom: 'calc(100% + 6px)',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: '#1a1a24',
                        border: '1px solid var(--border)',
                        borderRadius: 7,
                        padding: '7px 11px',
                        whiteSpace: 'nowrap',
                        zIndex: 50,
                        pointerEvents: 'none',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                      }}>
                        <div style={{ fontWeight: 700, fontSize: 12, color: '#ff8c42', marginBottom: 2 }}>{val} review{val > 1 ? 's' : ''}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 200, whiteSpace: 'normal', lineHeight: 1.4 }}>
                          <span style={{ color: 'var(--text)', fontWeight: 500 }}>{p}</span>
                          <br />{st}
                        </div>
                      </div>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Empty() {
  return (
    <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
      No data for selected filters
    </div>
  )
}

// ── CSV export ────────────────────────────────────────────────────────────────
export function downloadCSV(reviews) {
  const cols = ['review_id','asin','product_name','rating','sentiment','primary_categories','sub_tags','review','review_url','scrape_date']
  const escape = v => {
    if (v === null || v === undefined) return ''
    const s = Array.isArray(v) ? v.join('; ') : String(v)
    return `"${s.replace(/"/g, '""')}"`
  }
  const rows = [cols.join(','), ...reviews.map(r => cols.map(c => escape(r[c])).join(','))]
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `voc_reviews_${new Date().toISOString().slice(0,10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Preset date helpers ───────────────────────────────────────────────────────
function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}
const today = () => new Date().toISOString().slice(0, 10)

const PRESETS = [
  { label: '7d',  from: () => daysAgo(7),   to: today },
  { label: '30d', from: () => daysAgo(30),  to: today },
  { label: '90d', from: () => daysAgo(90),  to: today },
  { label: 'All', from: () => '',            to: () => '' },
]

// ── Main component ────────────────────────────────────────────────────────────
export default function TrendsPage({ products: allProducts, reviews }) {
  const [selectedProducts, setSelectedProducts] = useState([])
  const [granularity, setGranularity] = useState('week')
  const [stackMode, setStackMode] = useState('category') // 'category' | 'sentiment'
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [activePreset, setActivePreset] = useState('All')
  const [data, setData] = useState(null)
  const [wcData, setWcData] = useState([])
  const [activeWord, setActiveWord] = useState(null)
  const [keywordReviews, setKeywordReviews] = useState([])
  const [keywordLoading, setKeywordLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [hiddenLines, setHiddenLines] = useState(new Set())

  // init: select all products
  useEffect(() => {
    if (allProducts?.length) setSelectedProducts(allProducts)
  }, [allProducts])

  useEffect(() => {
    if (!allProducts?.length) return
    setLoading(true)
    setActiveWord(null)
    const params = { product: selectedProducts, date_from: dateFrom, date_to: dateTo, granularity }
    Promise.all([
      fetchTrends(params),
      fetchWordCloud({ product: selectedProducts, date_from: dateFrom, date_to: dateTo }),
    ]).then(([trendsData, wc]) => {
      setData(trendsData)
      setWcData(Array.isArray(wc) ? wc : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [selectedProducts, dateFrom, dateTo, granularity, allProducts])

  // Fetch reviews for the clicked word directly (bypasses sidebar sentiment/rating filters)
  useEffect(() => {
    if (!activeWord) { setKeywordReviews([]); return }
    setKeywordLoading(true)
    fetchReviewsByKeyword(activeWord, {
      product: selectedProducts,
      date_from: dateFrom,
      date_to: dateTo,
    }).then(data => {
      setKeywordReviews(Array.isArray(data) ? data : [])
      setKeywordLoading(false)
    }).catch(() => setKeywordLoading(false))
  }, [activeWord, selectedProducts, dateFrom, dateTo])

  const toggleProduct = (p) => {
    setSelectedProducts(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    )
  }

  const applyPreset = (preset) => {
    setActivePreset(preset.label)
    setDateFrom(preset.from())
    setDateTo(preset.to())
  }

  const toggleLine = (key) => {
    setHiddenLines(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // Compute reviews filtered by Trends page own filters for CSV export
  const locallyFilteredReviews = useMemo(() => {
    return reviews.filter(r => {
      if (selectedProducts.length && !selectedProducts.includes(r.product_name)) return false
      if (dateFrom && r.scrape_date && r.scrape_date < dateFrom) return false
      if (dateTo && r.scrape_date && r.scrape_date > dateTo) return false
      return true
    })
  }, [reviews, selectedProducts, dateFrom, dateTo])

  // Build legend items for trend chart
  const trendLegendItems = useMemo(() =>
    (data?.all_categories || []).map((c, i) => ({ key: c, color: PALETTE[i % PALETTE.length] })),
    [data]
  )

  // Stacked bar keys
  const stackKeys = stackMode === 'category'
    ? (data?.all_categories || [])
    : ['Positive', 'Neutral', 'Negative']

  const stackData = stackMode === 'category'
    ? (data?.stacked_category || [])
    : (data?.stacked_sentiment || [])

  const getStackColor = (key, i) =>
    stackMode === 'sentiment' ? (SENTIMENT_COLORS[key] || '#666') : PALETTE[i % PALETTE.length]

  const shortProduct = (s) => s?.length > 18 ? s.slice(0, 16) + '…' : s

  // Unique products & subtags from heatmap
  const heatProducts = [...new Set((data?.heatmap || []).map(d => d.product))]
  const heatSubtags = [...new Set((data?.heatmap || []).map(d => d.subtag))].slice(0, 20)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Global Controls ── */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '16px 20px',
        display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start',
      }}>

        {/* Date range */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Date Range
          </span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PRESETS.map(p => (
              <DatePreset key={p.label} label={p.label} active={activePreset === p.label} onClick={() => applyPreset(p)} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setActivePreset('') }} style={inputStyle()} />
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>to</span>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setActivePreset('') }} style={inputStyle()} />
          </div>
        </div>

        {/* Granularity */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Granularity
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <ToggleBtn active={granularity === 'week'} onClick={() => setGranularity('week')}>Weekly</ToggleBtn>
            <ToggleBtn active={granularity === 'month'} onClick={() => setGranularity('month')}>Monthly</ToggleBtn>
          </div>
        </div>

        {/* Product filter */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 200 }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Products
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {allProducts.map(p => (
              <button key={p} onClick={() => toggleProduct(p)} style={{
                padding: '4px 10px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
                border: `1px solid ${selectedProducts.includes(p) ? 'var(--accent)' : 'var(--border)'}`,
                background: selectedProducts.includes(p) ? 'var(--accent)20' : 'transparent',
                color: selectedProducts.includes(p) ? 'var(--accent)' : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}>
                {shortProduct(p)}
              </button>
            ))}
          </div>
        </div>

        {/* CSV Download */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Export
          </span>
          <button
            onClick={() => downloadCSV(locallyFilteredReviews)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '7px 16px', borderRadius: 7,
              border: '1px solid var(--accent)',
              background: 'var(--accent)15',
              color: 'var(--accent)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'Bebas Neue', letterSpacing: '0.08em', fontSize: 14,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--accent)30'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--accent)15'}
          >
            <Download size={14} />
            DOWNLOAD CSV
          </button>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {locallyFilteredReviews.length} rows (current filters)
          </span>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: 12, color: 'var(--text-muted)' }}>
          <Loader2 size={22} className="spin" />
          <span>Loading trends…</span>
        </div>
      ) : (
        <>
          {/* ── Category Trend Over Time ── */}
          <Section
            title="Category Issues Over Time"
            subtitle="Track how each issue category evolves — click legend to show/hide lines"
          >
            <CustomLegend items={trendLegendItems} hidden={hiddenLines} onToggle={toggleLine} />
            {!data?.category_trend?.length ? <Empty /> : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data.category_trend} margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
                  <CartesianGrid stroke="#222230" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="period" tick={{ fill: '#666680', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#666680', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  {(data.all_categories || []).map((cat, i) => (
                    <Line
                      key={cat}
                      type="monotone"
                      dataKey={cat}
                      stroke={PALETTE[i % PALETTE.length]}
                      strokeWidth={hiddenLines.has(cat) ? 0 : 2}
                      dot={false}
                      activeDot={{ r: 4 }}
                      hide={hiddenLines.has(cat)}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </Section>

          {/* ── Stacked Bar: Volume by Product ── */}
          <Section
            title="Review Volume by Product"
            subtitle="Stacked by category or sentiment — see which products get hit hardest"
            controls={
              <div style={{ display: 'flex', gap: 6 }}>
                <ToggleBtn active={stackMode === 'category'} onClick={() => setStackMode('category')}>By Category</ToggleBtn>
                <ToggleBtn active={stackMode === 'sentiment'} onClick={() => setStackMode('sentiment')}>By Sentiment</ToggleBtn>
              </div>
            }
          >
            {!stackData?.length ? <Empty /> : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={stackData}
                  margin={{ left: 10, right: 10, top: 16, bottom: 60 }}
                  barSize={Math.min(64, Math.floor(600 / (stackData.length + 1)))}
                  barCategoryGap="40%"
                >
                  <CartesianGrid stroke="#222230" strokeDasharray="4 4" vertical={false} />
                  <XAxis
                    dataKey="product"
                    tick={{ fill: '#f0ede8', fontSize: 11, fontWeight: 500 }}
                    axisLine={false} tickLine={false}
                    angle={-25} textAnchor="end" interval={0}
                    height={60}
                  />
                  <YAxis tick={{ fill: '#666680', fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: '#ffffff06' }}
                    formatter={(value, name) => [value, name]}
                  />
                  {stackKeys.map((key, i) => (
                    <Bar
                      key={key}
                      dataKey={key}
                      stackId="a"
                      fill={getStackColor(key, i)}
                      radius={i === stackKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                    >
                      <LabelList
                        dataKey={key}
                        position="center"
                        style={{ fill: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: 600 }}
                        formatter={(v) => v > 2 ? v : ''}
                      />
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
            {/* Legend */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', paddingTop: 4 }}>
              {stackKeys.map((key, i) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: getStackColor(key, i), flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--text)' }}>{key}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* ── Keyword Word Cloud ── */}
          <Section
            title="Keyword Cloud"
            subtitle="Size = review volume · Color = sentiment ratio · Click any word to see reviews"
          >
            <WordCloud
              data={wcData}
              activeWord={activeWord}
              onWordClick={setActiveWord}
            />
          </Section>

          {/* ── Word Cloud Reviews Drawer ── */}
          {activeWord && (
            <Section
              title={
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <List size={16} />
                  Reviews tagged &ldquo;{activeWord}&rdquo;
                  {!keywordLoading && (
                    <span style={{
                      fontSize: 13, fontFamily: 'DM Sans', fontWeight: 600,
                      background: 'var(--accent)20', color: 'var(--accent)',
                      border: '1px solid var(--accent)40',
                      borderRadius: 12, padding: '1px 10px',
                      letterSpacing: 0,
                    }}>
                      {keywordReviews.length}
                    </span>
                  )}
                </span>
              }
              controls={
                <button
                  onClick={() => setActiveWord(null)}
                  style={{
                    background: 'none', border: '1px solid var(--border)',
                    borderRadius: 6, color: 'var(--text-muted)',
                    fontSize: 12, padding: '5px 12px', cursor: 'pointer',
                  }}
                >
                  Close ✕
                </button>
              }
            >
              {keywordLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '24px 0', color: 'var(--text-muted)' }}>
                  <Loader2 size={16} className="spin" />
                  <span style={{ fontSize: 13 }}>Loading reviews...</span>
                </div>
              ) : keywordReviews.length === 0 ? (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  No reviews found for this keyword.
                </div>
              ) : (
                <ReviewsTable data={keywordReviews} />
              )}
            </Section>
          )}

          {/* ── Sub-tag Heatmap ── */}
          <Section
            title="Sub-tag Heatmap"
            subtitle="Intensity of specific issues per product — hover cells for exact count"
          >
            {/* Heatmap scale legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Low</span>
              <div style={{
                width: 120, height: 10, borderRadius: 4,
                background: 'linear-gradient(to right, rgba(255,78,26,0.1), rgba(255,78,26,0.95))',
                border: '1px solid var(--border)',
              }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>High</span>
            </div>
            <Heatmap data={data?.heatmap || []} products={heatProducts} subtags={heatSubtags} />
          </Section>
        </>
      )}
    </div>
  )
}