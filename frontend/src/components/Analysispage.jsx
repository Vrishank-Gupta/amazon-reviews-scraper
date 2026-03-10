import { useState, useEffect, useCallback } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts'
import { fetchAnalysis, fetchReviewsByKeyword } from '../api'

const SENT_COLORS = { Positive: '#22c55e', Negative: '#ef4444', Neutral: '#eab308' }
const PIE_NEG_COLORS = ['#ef4444', '#f97316', '#fbbf24', '#a855f7', '#e879f9', '#f43f5e', '#94a3b8', '#64748b']
const PIE_POS_COLORS = ['#22c55e', '#14b8a6', '#60a5fa', '#a78bfa', '#34d399', '#38bdf8', '#94a3b8', '#64748b']

function kpiPercent(val, total) {
  if (!total) return '0%'
  return ((val / total) * 100).toFixed(1) + '%'
}

function StarLabel({ rating }) {
  const n = Math.round(parseFloat(rating)) || 0
  return (
    <span style={{ color: n >= 4 ? '#22c55e' : n === 3 ? '#eab308' : '#ef4444', fontSize: 12 }}>
      {'★'.repeat(n)}{'☆'.repeat(Math.max(0, 5 - n))}
      <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>{n} star{n !== 1 ? 's' : ''}</span>
    </span>
  )
}

function SentBadge({ s }) {
  const map = { Negative: ['#ef4444', 'rgba(239,68,68,0.12)', '▼'], Positive: ['#22c55e', 'rgba(34,197,94,0.12)', '▲'], Neutral: ['#eab308', 'rgba(234,179,8,0.12)', '●'] }
  const [color, bg, icon] = map[s] || ['#94a3b8', 'transparent', '●']
  return (
    <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, color, background: bg, border: `1px solid ${color}40` }}>
      {icon} {s}
    </span>
  )
}

function KpiTile({ label, value, sub, color }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontFamily: 'Bebas Neue', fontSize: 34, lineHeight: 1, letterSpacing: '0.04em', color: color || 'var(--text)' }}>
        {value?.toLocaleString() ?? '—'}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</div>
    </div>
  )
}

function PieTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const { name, value } = payload[0]
  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ fontWeight: 700 }}>{name}</div>
      <div style={{ color: 'var(--text-muted)' }}>{value} reviews</div>
    </div>
  )
}

// ── Reviews Drawer — opened by word click ─────────────────────────────────────
function ReviewsDrawer({ keyword, category, sentiment, filters, onClose }) {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!keyword) return
    setLoading(true)
    fetchReviewsByKeyword(keyword, filters)
      .then(data => {
        const filtered = sentiment === 'neg'
          ? data.filter(r => r.sentiment === 'Negative')
          : sentiment === 'pos'
          ? data.filter(r => r.sentiment === 'Positive' || r.sentiment === 'Neutral')
          : data
        setReviews(filtered)
      })
      .finally(() => setLoading(false))
  }, [keyword, sentiment, JSON.stringify(filters)])

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'Bebas Neue', fontSize: 16, letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
            Reviews — <span style={{ color: 'var(--accent)' }}>{keyword}</span>
            {category && <span style={{ fontSize: 12, fontWeight: 400, marginLeft: 6 }}>in {category}</span>}
          </span>
          {!loading && (
            <span style={{ background: 'rgba(255,78,26,0.15)', color: 'var(--accent)', border: '1px solid rgba(255,78,26,0.3)', borderRadius: 10, padding: '1px 9px', fontSize: 12, fontWeight: 600 }}>
              {reviews.length}
            </span>
          )}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-muted)', fontSize: 12, padding: '4px 10px', cursor: 'pointer', fontFamily: 'DM Sans' }}>
          Close ✕
        </button>
      </div>
      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
      ) : reviews.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No reviews found.</div>
      ) : (
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {reviews.map((r, i) => (
            <div key={r.review_id || i} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <SentBadge s={r.sentiment} />
                <StarLabel rating={r.rating} />
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  {r.review_date?.replace('Reviewed in India on ', '') || ''}
                </span>
              </div>
              {r.title && <div style={{ fontSize: 12, fontWeight: 600 }}>{r.title}</div>}
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                {r.review}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Word Cloud — clicking a word opens reviews ────────────────────────────────
function WordCloud({ words, filteredCategory, pieSentiment, filters, onClose }) {
  const [activeWord, setActiveWord] = useState(null)

  useEffect(() => { setActiveWord(null) }, [filteredCategory])

  if (!words?.length) return (
    <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
      {filteredCategory ? 'No sub-tags found for this category.' : 'Click a pie slice to filter the word cloud by category.'}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Hint text */}
      {filteredCategory && !activeWord && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic' }}>
          Click any word to see its reviews
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px', alignItems: 'center', justifyContent: 'center', padding: '20px 16px', background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)', minHeight: 100 }}>
        {words.map(w => {
          const size = Math.round(11 + (w.count / Math.max(...words.map(x => x.count))) * 28)
          const negRatio = w.neg_ratio || 0
          const color = negRatio > 0.6 ? '#ef4444' : negRatio > 0.4 ? '#f97316' : negRatio > 0.2 ? '#eab308' : '#22c55e'
          const isActive = activeWord === w.word
          const isDimmed = activeWord && !isActive
          return (
            <button
              key={w.word}
              onClick={() => setActiveWord(isActive ? null : w.word)}
              style={{
                background: isActive ? 'rgba(255,78,26,0.12)' : 'none',
                border: isActive ? '1px solid rgba(255,78,26,0.4)' : '1px solid transparent',
                borderRadius: 4, padding: '2px 6px', cursor: 'pointer',
                fontFamily: 'DM Sans', fontSize: size, color,
                fontWeight: size > 24 ? 700 : size > 18 ? 600 : 500,
                opacity: isDimmed ? 0.2 : 1, transition: 'all 0.15s',
              }}
            >
              {w.word}
            </button>
          )
        })}
      </div>

      {/* Reviews drawer — shown below word cloud when a word is clicked */}
      {activeWord && (
        <ReviewsDrawer
          keyword={activeWord}
          category={filteredCategory}
          sentiment={pieSentiment}
          filters={filters}
          onClose={() => setActiveWord(null)}
        />
      )}
    </div>
  )
}

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-muted)' }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: SENT_COLORS[p.dataKey], display: 'flex', gap: 8 }}>
          <span>{p.dataKey}:</span><span style={{ fontWeight: 700 }}>{p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── WcLoader fetches words, passes onWordClick up ─────────────────────────────
function WcLoader({ category, pieSentiment, filters }) {
  const [words, setWords] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    const p = new URLSearchParams()
    if (filters.product?.length) p.set('product', filters.product.join('|||'))
    if (filters.date_from) p.set('date_from', filters.date_from)
    if (filters.date_to) p.set('date_to', filters.date_to)
    if (category) p.set('category', category)
    fetch(`/api/wordcloud?${p}`)
      .then(r => r.json())
      .then(setWords)
      .catch(() => setWords([]))
      .finally(() => setLoading(false))
  }, [category, JSON.stringify(filters)])

  if (loading) return <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Loading…</div>
  return <WordCloud words={words} filteredCategory={category} pieSentiment={pieSentiment} filters={filters} />
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AnalysisPage({ filters, allProducts }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sentVisible, setSentVisible] = useState({ Negative: true, Positive: true, Neutral: true })
  const [wcCategory, setWcCategory] = useState(null)   // category selected via pie
  const [pieSentiment, setPieSentiment] = useState(null) // 'neg' or 'pos'

  const apiParams = {
    product: filters.product?.length ? filters.product : allProducts,
    date_from: filters.date_from,
    date_to: filters.date_to,
  }

  const load = useCallback(() => {
    if (!allProducts?.length) return
    setLoading(true)
    fetchAnalysis(apiParams)
      .then(d => { setData(d); setWcCategory(null); setPieSentiment(null) })
      .finally(() => setLoading(false))
  }, [JSON.stringify(apiParams), allProducts?.length])

  useEffect(() => { load() }, [load])

  // Pie click: set category → word cloud filters. No drawer yet.
  const handlePieClick = (entry, sentiment) => {
    const cat = entry?.name || entry?.category
    if (!cat) return
    if (wcCategory === cat && pieSentiment === sentiment) {
      // Toggle off
      setWcCategory(null)
      setPieSentiment(null)
    } else {
      setWcCategory(cat)
      setPieSentiment(sentiment)
    }
  }

  const clearPieFilter = () => {
    setWcCategory(null)
    setPieSentiment(null)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-muted)', gap: 10 }}>
      <span style={{ fontSize: 20 }}>⟳</span> Loading analysis…
    </div>
  )

  const kpi = data?.kpi || {}
  const trend = data?.daily_trend || []
  const negPie = data?.neg_pie || []
  const posPie = data?.pos_pie || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <KpiTile label="Total Reviews" value={kpi.total} sub={`across ${allProducts?.length || 0} product${allProducts?.length !== 1 ? 's' : ''}`} />
        <KpiTile label="Negative" value={kpi.negative} sub={kpiPercent(kpi.negative, kpi.total) + ' of total'} color="#ef4444" />
        <KpiTile label="Positive" value={kpi.positive} sub={kpiPercent(kpi.positive, kpi.total) + ' of total'} color="#22c55e" />
        <KpiTile label="Neutral" value={kpi.neutral} sub={kpiPercent(kpi.neutral, kpi.total) + ' of total'} color="#eab308" />
      </div>

      {/* Daily sentiment trend */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: 18, letterSpacing: '0.06em', color: 'var(--text-muted)' }}>Daily Sentiment Trend</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Volume of reviews per day by review date</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Show:</span>
          {['Negative', 'Positive', 'Neutral'].map(s => {
            const c = SENT_COLORS[s]; const on = sentVisible[s]
            return (
              <button key={s} onClick={() => setSentVisible(v => ({ ...v, [s]: !v[s] }))}
                style={{ padding: '3px 12px', borderRadius: 20, border: `1px solid ${c}`, color: on ? c : 'var(--text-muted)', background: on ? `${c}18` : 'transparent', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans', transition: 'all 0.15s' }}>
                ● {s}
              </button>
            )
          })}
        </div>
        {trend.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No trend data — review dates may not be parsed yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                {Object.entries(SENT_COLORS).map(([s, c]) => (
                  <linearGradient key={s} id={`grad-${s}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={c} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={c} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="day" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false}
                tickFormatter={d => { try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) } catch { return d } }} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip content={<TrendTooltip />} />
              {['Negative', 'Positive', 'Neutral'].map(s => sentVisible[s] && (
                <Area key={s} type="monotone" dataKey={s} stroke={SENT_COLORS[s]} strokeWidth={2}
                  fill={`url(#grad-${s})`} dot={false} activeDot={{ r: 4 }} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Dual pie charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {[
          { title: '⬤ Negative Reviews', sub: 'by category — click a slice to explore sub-tags', data: negPie, colors: PIE_NEG_COLORS, sentiment: 'neg' },
          { title: '⬤ Positive + Neutral', sub: 'by category — click a slice to explore sub-tags', data: posPie, colors: PIE_POS_COLORS, sentiment: 'pos' },
        ].map(({ title, sub, data: pieData, colors, sentiment }) => (
          <div key={sentiment} style={{ background: 'var(--surface)', border: `1px solid ${wcCategory && pieSentiment === sentiment ? 'rgba(255,78,26,0.4)' : 'var(--border)'}`, borderRadius: 12, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12, transition: 'border-color 0.15s' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: sentiment === 'neg' ? '#ef4444' : '#22c55e' }}>{title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>
            </div>
            {pieData.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '20px 0' }}>No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} dataKey="count" nameKey="category"
                    cx="40%" cy="50%" outerRadius={70} innerRadius={36}
                    cursor="pointer" onClick={(entry) => handlePieClick(entry, sentiment)} stroke="none">
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={colors[i % colors.length]}
                        opacity={wcCategory === entry.category && pieSentiment === sentiment ? 1 : wcCategory ? 0.4 : 1} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                  <Legend layout="vertical" align="right" verticalAlign="middle"
                    formatter={(value) => <span style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>{value}</span>}
                    onClick={(e) => handlePieClick({ name: e.value }, sentiment)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        ))}
      </div>

      {/* Word cloud + reviews drawer (word click → drawer below cloud) */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: 18, letterSpacing: '0.06em', color: 'var(--text-muted)' }}>Keyword Cloud</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {wcCategory
                ? `Sub-tags of "${wcCategory}" · click a word to see reviews`
                : 'Click a pie slice above to filter by category'}
              {' '} · size = volume · color = sentiment
            </div>
          </div>
          {wcCategory && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, background: 'rgba(255,78,26,0.1)', border: '1px solid rgba(255,78,26,0.3)', fontSize: 11, color: 'var(--accent)' }}>
              {wcCategory}
              <button onClick={clearPieFilter} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>✕</button>
            </div>
          )}
        </div>
        <WcLoader category={wcCategory} pieSentiment={pieSentiment} filters={apiParams} />
      </div>

    </div>
  )
}