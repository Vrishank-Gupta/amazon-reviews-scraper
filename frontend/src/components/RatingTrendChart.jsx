import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { apiUrl } from '../api'

const PALETTE = ['#ff4e1a', '#ff8c42', '#ffd166', '#06d6a0', '#60a5fa', '#a855f7', '#ec4899', '#14b8a6', '#f43f5e', '#34d399', '#fb923c', '#c084fc']
const PRODUCT_DISPLAY_LIMIT = 5

function fmtDay(day) {
  if (!day) return ''
  try {
    return new Date(day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  } catch {
    return day
  }
}

function buildSpine(days) {
  if (!days.length) return []
  const addDays = (dateStr, offset) => {
    const next = new Date(dateStr)
    next.setDate(next.getDate() + offset)
    return next.toISOString().slice(0, 10)
  }

  const spine = []
  let cursor = days[0].day
  const last = days[days.length - 1].day
  while (cursor <= last) {
    spine.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return spine
}

function fillPerProduct(spine, products, byDay, field) {
  const filled = spine.map(day => ({
    day,
    ...Object.fromEntries(products.map(product => [product, null])),
  }))

  products.forEach(product => {
    let lastSeen = null
    filled.forEach(row => {
      const value = byDay[row.day]?.[product]?.[field] ?? null
      if (value != null) lastSeen = value
      row[product] = lastSeen
    })

    lastSeen = null
    for (let index = filled.length - 1; index >= 0; index -= 1) {
      if (filled[index][product] != null) lastSeen = filled[index][product]
      else if (lastSeen != null) filled[index][product] = lastSeen
    }
  })

  return filled
}

function SeriesLegend({ products, colorMap }) {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 4 }}>
      {products.map(product => (
        <span key={product} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
          <span style={{ width: 20, height: 2.5, borderRadius: 2, background: colorMap[product], display: 'inline-block' }} />
          {product}
        </span>
      ))}
    </div>
  )
}

function rankProductsForFocus(products, days, explicitProducts = [], limit = PRODUCT_DISPLAY_LIMIT) {
  if (explicitProducts?.length) return explicitProducts
  const latestDay = [...(days || [])].reverse().find(day =>
    products.some(product => day.products?.[product]?.total_ratings != null || day.products?.[product]?.overall != null),
  )
  const ranked = [...products]
    .sort((a, b) => {
      const aScale = latestDay?.products?.[a]?.total_ratings ?? 0
      const bScale = latestDay?.products?.[b]?.total_ratings ?? 0
      if (bScale !== aScale) return bScale - aScale
      const aOverall = latestDay?.products?.[a]?.overall ?? 0
      const bOverall = latestDay?.products?.[b]?.overall ?? 0
      return bOverall - aOverall
    })
  return ranked.slice(0, limit)
}

export default function RatingTrendChart({ filters }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filterProd, setFilterProd] = useState(null)

  const productCategory = filters?.product_category || null
  const activeProducts = filters?.product?.length ? filters.product : []
  const dateFrom = filters?.date_from || ''
  const dateTo = filters?.date_to || ''

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (productCategory) params.set('category', productCategory)
    else if (activeProducts.length) params.set('product', activeProducts.join('|||'))
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)

    fetch(apiUrl(`/api/trends/rating?${params}`))
      .then(response => response.json())
      .then(payload => {
        setData(payload)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [productCategory, JSON.stringify(activeProducts), dateFrom, dateTo])

  const products = data?.products || []
  const days = data?.days || []
  const displayedProducts = useMemo(
    () => rankProductsForFocus(products, days, activeProducts),
    [products, days, activeProducts],
  )

  // Reset to "All Products" when the product list changes
  useEffect(() => {
    setFilterProd(null)
  }, [JSON.stringify(products)])

  const displayedForChart = (filterProd && products.includes(filterProd)) ? [filterProd] : displayedProducts

  if (loading) {
    return <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading...</div>
  }

  if (!data?.days?.length) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>
        No rating snapshot data yet - will appear after the next scrape run.
      </div>
    )
  }

  const colorMap = Object.fromEntries(products.map((product, index) => [product, PALETTE[index % PALETTE.length]]))
  const byDay = Object.fromEntries(days.map(day => [day.day, day.products]))
  const spine = buildSpine(days)

  const overallRows = fillPerProduct(spine, displayedForChart, byDay, 'overall')
  const totalRatingsRows = fillPerProduct(spine, displayedForChart, byDay, 'total_ratings')

  // Merge overall + total_ratings into a single dataset for ComposedChart
  const combinedRows = spine.map((day, i) => ({
    ...overallRows[i],
    ...Object.fromEntries(displayedForChart.map(p => [`${p}_vol`, totalRatingsRows[i][p]])),
  }))

  const dailyAvgRows = spine.map(day => ({
    day,
    ...Object.fromEntries(displayedForChart.map(product => [product, byDay[day]?.[product]?.daily_avg ?? null])),
  }))

  const hasOverall = days.some(day => displayedForChart.some(product => day.products[product]?.overall != null))
  const hasDailyAvg = days.some(day => displayedForChart.some(product => day.products[product]?.daily_avg != null))
  const limitedProducts = !activeProducts.length && !filterProd && products.length > displayedProducts.length

  const xAxisProps = {
    dataKey: 'day',
    tick: { fontSize: 10, fill: 'var(--text-muted)' },
    tickLine: false,
    axisLine: false,
    tickFormatter: fmtDay,
    minTickGap: 30,
  }

  const gridProps = { strokeDasharray: '3 3', stroke: 'var(--border)', vertical: false }

  const metricTooltip = valueFormatter => ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    const ratingPoints = payload.filter(pt => !pt.dataKey.endsWith('_vol') && pt.value != null)
    const volPoints = payload.filter(pt => pt.dataKey.endsWith('_vol') && pt.value != null)
    return (
      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 11, minWidth: 160 }}>
        <div style={{ fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>{fmtDay(label)}</div>
        {ratingPoints.map(point => (
          <div key={point.dataKey} style={{ color: point.color, display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 3 }}>
            <span style={{ color: 'var(--text-muted)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{point.dataKey}</span>
            <span style={{ fontWeight: 700, flexShrink: 0 }}>{valueFormatter(point.value)}</span>
          </div>
        ))}
        {volPoints.map(point => (
          <div key={point.dataKey} style={{ color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 3 }}>
            <span style={{ opacity: 0.7 }}>Reviews on Amazon</span>
            <span style={{ fontWeight: 700, flexShrink: 0 }}>{Number(point.value).toLocaleString()}</span>
          </div>
        ))}
      </div>
    )
  }

  const selectStyle = {
    padding: '4px 8px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--surface2)',
    color: 'var(--accent)',
    fontSize: 11,
    fontFamily: 'DM Sans',
    cursor: 'pointer',
    outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {hasOverall && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Amazon Overall Rating
              <span style={{ fontWeight: 400, marginLeft: 8, textTransform: 'none', letterSpacing: 0 }}>
                — public product-page rating + total review volume
              </span>
            </div>
            <select value={filterProd || ''} onChange={e => setFilterProd(e.target.value || null)} style={{ ...selectStyle, color: filterProd ? 'var(--accent)' : 'var(--text-muted)' }}>
              <option value="">All Products</option>
              {products.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          {limitedProducts && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
              Showing top {displayedProducts.length} products by Amazon rating scale. Use the dropdown to focus on a specific product.
            </div>
          )}
          <ResponsiveContainer width="100%" height={190}>
            <ComposedChart data={combinedRows} margin={{ top: 4, right: 48, left: -10, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis {...xAxisProps} />
              <YAxis
                yAxisId="rating"
                domain={([min, max]) => [Math.max(1, Math.floor((min - 0.2) * 2) / 2), Math.min(5, Math.ceil((max + 0.2) * 2) / 2)]}
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={value => value.toFixed(1)}
              />
              <YAxis
                yAxisId="vol"
                orientation="right"
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
              />
              <Tooltip content={metricTooltip(value => `${value.toFixed(2)} ★`)} />
              <ReferenceLine yAxisId="rating" y={4} stroke="var(--border)" strokeDasharray="4 2" />
              {displayedForChart.map(product => (
                <Bar
                  key={`${product}_vol`}
                  yAxisId="vol"
                  dataKey={`${product}_vol`}
                  fill={colorMap[product]}
                  opacity={0.18}
                  radius={[2, 2, 0, 0]}
                  maxBarSize={12}
                />
              ))}
              {displayedForChart.map(product => (
                <Line
                  key={product}
                  yAxisId="rating"
                  type="basis"
                  dataKey={product}
                  stroke={colorMap[product]}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, stroke: '#fff', strokeWidth: 1.5 }}
                  connectNulls
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
          <SeriesLegend products={displayedForChart} colorMap={colorMap} />
        </div>
      )}

      {hasDailyAvg && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
            Daily Avg Rating from Scraped Reviews
            <span style={{ fontWeight: 400, marginLeft: 8, textTransform: 'none', letterSpacing: 0 }}>
              - how recent buyers actually rated on that day
            </span>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={dailyAvgRows} margin={{ top: 4, right: 16, left: -10, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis {...xAxisProps} />
              <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} tickFormatter={value => value.toFixed(0)} />
              <Tooltip content={metricTooltip(value => `${value.toFixed(2)} ★`)} />
              <ReferenceLine y={4} stroke="var(--border)" strokeDasharray="4 2" />
              {displayedForChart.map(product => (
                <Line
                  key={product}
                  type="basis"
                  dataKey={product}
                  stroke={colorMap[product]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5, stroke: '#fff', strokeWidth: 1.5 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <SeriesLegend products={displayedForChart} colorMap={colorMap} />
        </div>
      )}
    </div>
  )
}
