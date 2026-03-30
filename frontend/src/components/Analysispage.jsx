import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ComposedChart, Bar, ReferenceLine,
} from 'recharts'
import { fetchAnalysis, fetchCxoTrends } from '../api'
import { Card, InfoTip } from './shared'
import RatingTrendChart from './RatingTrendChart'
import ReviewsDrawer from './ReviewsDrawer'

function fmtDay(d) {
  try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) } catch { return d }
}

function getDefaultWidgetProduct({ parentProducts, parentCategory, scopedProducts, widgetValue }) {
  if (widgetValue !== undefined) return widgetValue
  if (parentProducts.length === 1) return parentProducts[0]
  if (parentProducts.length > 1 || parentCategory) return null
  return scopedProducts[0] || null
}

function KpiTile({ label, value, sub, color, tip }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6, borderLeft: `3px solid ${color}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</span>
        <InfoTip text={tip} />
      </div>
      <div style={{ fontFamily: 'Bebas Neue', fontSize: 36, lineHeight: 1, color }}>{value ?? '—'}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</div>
    </div>
  )
}

function Toggle({ value, onChange, options }) {
  return (
    <div style={{ display: 'flex', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: 2, gap: 2 }}>
      {options.map(option => (
        <button
          key={option.v}
          onClick={() => onChange(option.v)}
          style={{
            padding: '3px 10px',
            borderRadius: 5,
            border: 'none',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 600,
            fontFamily: 'DM Sans',
            background: value === option.v ? 'var(--accent)' : 'transparent',
            color: value === option.v ? '#fff' : 'var(--text-muted)',
            transition: 'all 0.15s',
          }}
        >
          {option.l}
        </button>
      ))}
    </div>
  )
}

function EmptyState({ text = 'No data for selected filters' }) {
  return <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>{text}</div>
}

function VolumeTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload || {}
  const total = (point.Positive || 0) + (point.Negative || 0) + (point.Neutral || 0)
  return (
    <div style={{ background: '#16161f', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', fontSize: 12, minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
      <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--text-muted)', fontSize: 11, letterSpacing: '0.06em' }}>{fmtDay(label)}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ color: 'var(--text-muted)' }}>Reviews that day</span>
          <span style={{ fontWeight: 700 }}>{total}</span>
        </div>
        {[
          ['Negative', point.Negative, '#ef4444'],
          ['Positive', point.Positive, '#22c55e'],
          ['Neutral', point.Neutral, '#eab308'],
        ].map(([labelText, value, color]) => (
          <div key={labelText} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ color }}>{labelText}</span>
            <span style={{ fontWeight: 700 }}>{value || 0}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RateTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const rolling = payload.find(point => point.dataKey === 'rolling_neg')?.value
  const daily = payload.find(point => point.dataKey === 'neg_rate')?.value
  const point = payload[0]?.payload || {}
  const total = (point.Positive || 0) + (point.Negative || 0) + (point.Neutral || 0)
  return (
    <div style={{ background: '#16161f', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', fontSize: 12, minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
      <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--text-muted)', fontSize: 11, letterSpacing: '0.06em' }}>{fmtDay(label)}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ color: 'var(--text-muted)' }}>7d rolling neg rate</span>
          <span style={{ fontWeight: 700, color: '#ff4e1a' }}>{rolling}%</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ color: 'var(--text-muted)' }}>Daily neg rate</span>
          <span style={{ fontWeight: 700, color: '#ef4444' }}>{daily}%</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ color: 'var(--text-muted)' }}>Reviews that day</span>
          <span style={{ fontWeight: 700 }}>{total}</span>
        </div>
      </div>
    </div>
  )
}

function EmergingIssues({ momentum, onSelect }) {
  const items = [...(momentum || [])]
    .filter(item => (item.second || 0) > 0 && ((item.first === 0 && item.second > 0) || (item.change || 0) > 0))
    .sort((left, right) => {
      const leftIsNew = left.first === 0 ? 1 : 0
      const rightIsNew = right.first === 0 ? 1 : 0
      if (leftIsNew !== rightIsNew) return rightIsNew - leftIsNew
      return (right.change || 0) - (left.change || 0)
    })
    .slice(0, 5)

  if (!items.length) return <EmptyState />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(item => {
        const isNew = item.first === 0 && item.second > 0
        const signalColor = isNew ? '#f97316' : '#ef4444'
        const pctLabel = isNew ? 'New' : (item.pct_change > 0 ? `+${item.pct_change}%` : `${item.pct_change}%`)
        return (
          <button
            key={item.category}
            onClick={() => onSelect?.(item.category)}
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${signalColor}24`,
              borderRadius: 10,
              padding: '10px 12px',
              display: 'grid',
              gridTemplateColumns: '1fr auto auto',
              gap: 10,
              alignItems: 'center',
              cursor: 'pointer',
              color: 'inherit',
              textAlign: 'left',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{item.category}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {isNew ? 'New issue in the recent half of the period' : `Up from ${item.first} to ${item.second} mentions`}
              </div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: signalColor }}>
              {isNew ? 'NEW' : `${item.change > 0 ? '+' : ''}${item.change}`}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {pctLabel}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function CategoryReviewMix({ rows, onSelect }) {
  if (!rows.length) return <EmptyState />
  const max = Math.max(...rows.map(row => row.total || 0), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map(row => {
        const total = row.total || 0
        const scale = total / max
        const negWidth = total ? (row.Negative / total) * 100 : 0
        const neuWidth = total ? (row.Neutral / total) * 100 : 0
        const posWidth = total ? (row.Positive / total) * 100 : 0

        return (
          <div key={row.category} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 54px', gap: 12, alignItems: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{row.category}</div>
            <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
              <div style={{ width: `${Math.max(scale * 100, 8)}%`, minWidth: 120, maxWidth: '100%' }}>
                <div style={{ display: 'flex', height: 16, borderRadius: 999, overflow: 'hidden', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }}>
                  <button onClick={() => row.Negative > 0 && onSelect?.(row.category, 'Negative')} disabled={row.Negative === 0} style={{ width: `${negWidth}%`, minWidth: row.Negative ? 10 : 0, background: '#ef4444', border: 'none', cursor: row.Negative ? 'pointer' : 'default', opacity: row.Negative ? 1 : 0 }} title={`${row.category} • Negative • ${row.Negative} reviews`} />
                  <button onClick={() => row.Neutral > 0 && onSelect?.(row.category, 'Neutral')} disabled={row.Neutral === 0} style={{ width: `${neuWidth}%`, minWidth: row.Neutral ? 10 : 0, background: '#eab308', border: 'none', cursor: row.Neutral ? 'pointer' : 'default', opacity: row.Neutral ? 1 : 0 }} title={`${row.category} • Neutral • ${row.Neutral} reviews`} />
                  <button onClick={() => row.Positive > 0 && onSelect?.(row.category, 'Positive')} disabled={row.Positive === 0} style={{ width: `${posWidth}%`, minWidth: row.Positive ? 10 : 0, background: '#22c55e', border: 'none', cursor: row.Positive ? 'pointer' : 'default', opacity: row.Positive ? 1 : 0 }} title={`${row.category} • Positive • ${row.Positive} reviews`} />
                </div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>{total}</div>
          </div>
        )
      })}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-muted)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: '#ef4444' }} /> Negative</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: '#eab308' }} /> Neutral</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: '#22c55e' }} /> Positive</span>
      </div>
    </div>
  )
}

export default function AnalysisPage({ filters, allProducts, tree }) {
  const [data, setData] = useState(null)
  const [cxoData, setCxoData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [hasData, setHasData] = useState(false)
  const [trendMode, setTrendMode] = useState('sentiment')
  const [emergingCat, setEmergingCat] = useState(null)
  const [issueFilter, setIssueFilter] = useState(undefined)
  const [localIssueData, setLocalIssueData] = useState(null)
  const [signalProd, setSignalProd] = useState(undefined)
  const [localTrendData, setLocalTrendData] = useState(null)
  const [categoryDrawer, setCategoryDrawer] = useState(null)

  const scopedProducts = useMemo(() => {
    if (filters.product?.length) return filters.product
    if (filters.product_category) return tree?.[filters.product_category] || []
    return allProducts || []
  }, [filters.product, filters.product_category, tree, allProducts])

  const effectiveIssueFilter = getDefaultWidgetProduct({
    parentProducts: filters.product || [],
    parentCategory: filters.product_category,
    scopedProducts,
    widgetValue: issueFilter,
  })
  const effectiveSignalProd = getDefaultWidgetProduct({
    parentProducts: filters.product || [],
    parentCategory: filters.product_category,
    scopedProducts,
    widgetValue: signalProd,
  })

  useEffect(() => {
    if (issueFilter && !scopedProducts.includes(issueFilter)) setIssueFilter(undefined)
    if (signalProd && !scopedProducts.includes(signalProd)) setSignalProd(undefined)
  }, [JSON.stringify(scopedProducts), issueFilter, signalProd])

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
      fetchAnalysis(apiParams),
      fetchCxoTrends(apiParams).catch(() => null),
    ])
      .then(([analysis, cxo]) => {
        setData(analysis)
        setCxoData(cxo)
        setHasData(true)
      })
      .finally(() => setLoading(false))
  }, [JSON.stringify(apiParams), allProducts?.length])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!effectiveIssueFilter) { setLocalIssueData(null); return }
    const params = new URLSearchParams({ product: effectiveIssueFilter })
    if (apiParams.date_from) params.set('date_from', apiParams.date_from)
    if (apiParams.date_to) params.set('date_to', apiParams.date_to)
    fetchAnalysis({ product: [effectiveIssueFilter], date_from: apiParams.date_from, date_to: apiParams.date_to })
      .then(setLocalIssueData)
      .catch(() => setLocalIssueData(null))
  }, [effectiveIssueFilter, apiParams.date_from, apiParams.date_to])

  useEffect(() => {
    if (!effectiveSignalProd) { setLocalTrendData(null); return }
    fetchAnalysis({ product: [effectiveSignalProd], date_from: apiParams.date_from, date_to: apiParams.date_to })
      .then(payload => setLocalTrendData(payload?.daily_trend ?? null))
      .catch(() => setLocalTrendData(null))
  }, [effectiveSignalProd, apiParams.date_from, apiParams.date_to])

  if (loading && !hasData) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-muted)', gap: 10 }}>
        <span style={{ fontSize: 20 }}>⟳</span> Loading overview…
      </div>
    )
  }

  const kpi = data?.kpi || {}
  const trend = data?.daily_trend || []
  const negPct = kpi.total ? +((kpi.negative / kpi.total) * 100).toFixed(1) : 0
  const posPct = kpi.total ? +((kpi.positive / kpi.total) * 100).toFixed(1) : 0
  const momentum = cxoData?.category_momentum || []
  const activeTrend = localTrendData ?? trend
  const displayedCategoryBreakdown = (localIssueData?.category_breakdown ?? data?.category_breakdown ?? []).slice(0, 8)

  const trendWithRolling = activeTrend.map((point, index, rows) => {
    const window = rows.slice(Math.max(0, index - 6), index + 1)
    const total = window.reduce((sum, row) => sum + (row.Positive + row.Negative + row.Neutral), 0)
    const negative = window.reduce((sum, row) => sum + row.Negative, 0)
    return {
      ...point,
      rolling_neg: total ? +(negative / total * 100).toFixed(1) : 0,
      neg_rate: point.Negative ? +(point.Negative / (point.Positive + point.Negative + point.Neutral) * 100).toFixed(1) : 0,
    }
  })

  const rateVals = trendWithRolling.map(point => point.rolling_neg).filter(value => value > 0)
  const rateMin = rateVals.length ? Math.max(0, Math.floor(Math.min(...rateVals) / 5) * 5 - 5) : 0
  const rateMax = rateVals.length ? Math.min(100, Math.ceil(Math.max(...rateVals) / 5) * 5 + 10) : 100
  const sentimentColors = { Positive: '#22c55e', Negative: '#ef4444', Neutral: '#eab308' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        <KpiTile
          label="Feedback Volume"
          value={kpi.total?.toLocaleString()}
          color="#60a5fa"
          sub={`${allProducts?.length || 0} product${allProducts?.length !== 1 ? 's' : ''} · selected period`}
          tip="Total scraped reviews in the selected date range."
        />
        <KpiTile
          label="1–2 Stars"
          value={`${negPct}%`}
          color={negPct > 50 ? '#ef4444' : negPct > 30 ? '#f97316' : '#22c55e'}
          sub={<span><strong style={{ color: '#ef4444' }}>{kpi.negative?.toLocaleString()}</strong> reviews</span>}
          tip="Share of reviews rated 1 or 2 stars."
        />
        <KpiTile
          label="4–5 Stars"
          value={`${posPct}%`}
          color="#22c55e"
          sub={<span><strong style={{ color: '#22c55e' }}>{kpi.positive?.toLocaleString()}</strong> reviews</span>}
          tip="Share of reviews rated 4 or 5 stars."
        />
        <KpiTile
          label="3 Stars"
          value={`${kpi.total ? ((kpi.neutral / kpi.total) * 100).toFixed(1) : 0}%`}
          color="#eab308"
          sub={<span><strong style={{ color: '#eab308' }}>{kpi.neutral?.toLocaleString()}</strong> reviews</span>}
          tip="Share of reviews rated 3 stars."
        />
      </div>

      <Card
        title="Amazon Rating Signal"
        tip="Amazon product-page rating snapshots over time, alongside scraped daily review averages."
      >
        <RatingTrendChart filters={filters} tree={tree} />
      </Card>

      <Card
        title="Category Review Mix"
        sub="Horizontal length shows total reviews. Each bar is split into negative, neutral, and positive review volume."
        tip="Click any colored section to open the matching review drill-down for that category and sentiment."
        controls={
          <select value={effectiveIssueFilter || ''} onChange={event => { setIssueFilter(event.target.value || null); setCategoryDrawer(null) }} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', color: effectiveIssueFilter ? 'var(--accent)' : 'var(--text-muted)', fontSize: 11, fontFamily: 'DM Sans', cursor: 'pointer', outline: 'none' }}>
            <option value="">All Products</option>
            {scopedProducts.map(product => <option key={product} value={product}>{product}</option>)}
          </select>
        }
      >
        <CategoryReviewMix
          rows={displayedCategoryBreakdown}
          onSelect={(category, sentiment) => setCategoryDrawer(current =>
            current?.category === category && current?.sentiment === sentiment ? null : { category, sentiment },
          )}
        />
        <ReviewsDrawer
          category={categoryDrawer?.category}
          label={categoryDrawer?.category}
          sentiment={categoryDrawer?.sentiment}
          filters={filters}
          onClose={() => setCategoryDrawer(null)}
        />
      </Card>

      <Card
        title="Customer Signal Over Time"
        tip="Neg Rate shows the 7-day rolling problem rate. Sentiment shows daily positive / negative / neutral breakdown."
        controls={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select value={effectiveSignalProd || ''} onChange={event => setSignalProd(event.target.value || null)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', color: effectiveSignalProd ? 'var(--accent)' : 'var(--text-muted)', fontSize: 11, fontFamily: 'DM Sans', cursor: 'pointer', outline: 'none' }}>
              <option value="">All Products</option>
              {scopedProducts.map(product => <option key={product} value={product}>{product}</option>)}
            </select>
            <Toggle value={trendMode} onChange={setTrendMode} options={[{ v: 'rate', l: 'Neg Rate %' }, { v: 'sentiment', l: 'Sentiment' }]} />
          </div>
        }
      >
        {activeTrend.length === 0 ? (
          <EmptyState text="No trend data — review dates may not be parsed correctly yet." />
        ) : trendMode === 'rate' ? (
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={trendWithRolling} margin={{ top: 8, right: 40, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id="negGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={fmtDay} />
              <YAxis domain={[rateMin, rateMax]} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={value => `${value}%`} width={36} />
              <Tooltip content={<RateTip />} />
              {rateMax >= 30 && <ReferenceLine y={30} stroke="#eab308" strokeDasharray="4 2" strokeOpacity={0.5} label={{ value: '30%', fill: '#eab308', fontSize: 10, position: 'insideRight' }} />}
              {rateMax >= 50 && <ReferenceLine y={50} stroke="#ef4444" strokeDasharray="4 2" strokeOpacity={0.5} label={{ value: '50%', fill: '#ef4444', fontSize: 10, position: 'insideRight' }} />}
              <Bar dataKey="neg_rate" fill="#ef4444" opacity={0.12} name="Daily Neg %" radius={[2, 2, 0, 0]} barSize={6} />
              <Area type="monotone" dataKey="rolling_neg" stroke="#ff4e1a" strokeWidth={2.5} fill="url(#negGrad)" dot={false} activeDot={{ r: 5, fill: '#ff4e1a', stroke: '#fff', strokeWidth: 2 }} name="7d Rolling" />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={activeTrend} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
              <defs>
                {Object.entries(sentimentColors).map(([sentiment, color]) => (
                  <linearGradient key={sentiment} id={`ov-${sentiment}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={fmtDay} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} width={36} />
              <Tooltip content={<VolumeTip />} />
              {['Negative', 'Positive', 'Neutral'].map(sentiment => (
                <Area
                  key={sentiment}
                  type="monotone"
                  dataKey={sentiment}
                  stroke={sentimentColors[sentiment]}
                  strokeWidth={2}
                  fill={`url(#ov-${sentiment})`}
                  dot={false}
                  activeDot={{ r: 4, stroke: '#fff', strokeWidth: 1.5 }}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card
        title="Emerging Issues"
        tip="Issues that were absent or small in the first half of the selected period and are now growing."
      >
        <EmergingIssues momentum={momentum} onSelect={category => setEmergingCat(emergingCat === category ? null : category)} />
        <ReviewsDrawer category={emergingCat} label={emergingCat} filters={filters} onClose={() => setEmergingCat(null)} />
      </Card>
    </div>
  )
}
