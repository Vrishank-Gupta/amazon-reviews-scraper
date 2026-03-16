import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
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
  const limitedProducts = !activeProducts.length && products.length > displayedProducts.length

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
  const colorMap = Object.fromEntries(displayedProducts.map((product, index) => [product, PALETTE[index % PALETTE.length]]))
  const byDay = Object.fromEntries(days.map(day => [day.day, day.products]))
  const spine = buildSpine(days)

  const overallRows = fillPerProduct(spine, displayedProducts, byDay, 'overall')
  const totalRatingsRows = fillPerProduct(spine, displayedProducts, byDay, 'total_ratings')
  const dailyAvgRows = spine.map(day => ({
    day,
    ...Object.fromEntries(displayedProducts.map(product => [product, byDay[day]?.[product]?.daily_avg ?? null])),
  }))

  const hasOverall = days.some(day => displayedProducts.some(product => day.products[product]?.overall != null))
  const hasDailyAvg = days.some(day => displayedProducts.some(product => day.products[product]?.daily_avg != null))
  const hasTotalRatings = days.some(day => displayedProducts.some(product => day.products[product]?.total_ratings != null))
  const dailyPointCount = dailyAvgRows.filter(row => displayedProducts.some(product => row[product] != null)).length
  const dotStyle = count => (count <= 8 ? { r: 4, fill: 'inherit', stroke: '#fff', strokeWidth: 1.5 } : false)

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
    return (
      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 11, minWidth: 160 }}>
        <div style={{ fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>{fmtDay(label)}</div>
        {payload.filter(point => point.value != null).map(point => (
          <div key={point.dataKey} style={{ color: point.color, display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 3 }}>
            <span style={{ color: 'var(--text-muted)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{point.dataKey}</span>
            <span style={{ fontWeight: 700, flexShrink: 0 }}>{valueFormatter(point.value)}</span>
          </div>
        ))}
      </div>
    )
  }

  const latestTotals = displayedProducts
    .map(product => ({
      product,
      current: totalRatingsRows[totalRatingsRows.length - 1]?.[product] ?? null,
      start: totalRatingsRows[0]?.[product] ?? null,
    }))
    .filter(row => row.current != null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {hasOverall && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
            Amazon Overall Rating
            <span style={{ fontWeight: 400, marginLeft: 8, textTransform: 'none', letterSpacing: 0 }}>
              - public product-page rating shown on Amazon
            </span>
          </div>
          {limitedProducts && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
              Showing top {displayedProducts.length} products by Amazon rating scale. Use product filters to focus on specific ASINs.
            </div>
          )}
          <ResponsiveContainer width="100%" height={170}>
            <LineChart data={overallRows} margin={{ top: 4, right: 16, left: -10, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis {...xAxisProps} />
              <YAxis domain={([min, max]) => [Math.max(1, Math.floor((min - 0.2) * 2) / 2), Math.min(5, Math.ceil((max + 0.2) * 2) / 2)]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} tickFormatter={value => value.toFixed(1)} />
              <Tooltip content={metricTooltip(value => `${value.toFixed(2)} ★`)} />
              <ReferenceLine y={4} stroke="var(--border)" strokeDasharray="4 2" />
              {displayedProducts.map(product => (
                <Line
                  key={product}
                  type="monotone"
                  dataKey={product}
                  stroke={colorMap[product]}
                  strokeWidth={2.5}
                  dot={dotStyle(days.length)}
                  activeDot={{ r: 5, stroke: '#fff', strokeWidth: 1.5 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <SeriesLegend products={displayedProducts} colorMap={colorMap} />
        </div>
      )}

      {hasTotalRatings && latestTotals.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Total Ratings on Amazon
            <span style={{ fontWeight: 400, marginLeft: 8, textTransform: 'none', letterSpacing: 0 }}>
              - market scale and maturity
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, latestTotals.length)}, minmax(0, 1fr))`, gap: 10 }}>
            {latestTotals.map(row => {
              const delta = row.start != null ? row.current - row.start : null
              return (
                <div key={row.product} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: colorMap[row.product] }}>{row.product}</div>
                  <div style={{ fontSize: 20, fontFamily: 'Bebas Neue', color: 'var(--text)' }}>{Number(row.current).toLocaleString()}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {delta == null || delta === 0 ? 'Stable in selected window' : `${delta > 0 ? '+' : ''}${delta.toLocaleString()} vs window start`}
                  </div>
                </div>
              )
            })}
          </div>
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
              {displayedProducts.map(product => (
                <Line
                  key={product}
                  type="monotone"
                  dataKey={product}
                  stroke={colorMap[product]}
                  strokeWidth={2}
                  dot={dotStyle(dailyPointCount)}
                  activeDot={{ r: 5, stroke: '#fff', strokeWidth: 1.5 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <SeriesLegend products={displayedProducts} colorMap={colorMap} />
        </div>
      )}
    </div>
  )
}
