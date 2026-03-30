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
import { SHOW_AMAZON_RATING_HISTORY } from '../config/dashboard'

const PALETTE = ['#ff4e1a', '#ff8c42', '#ffd166', '#06d6a0', '#60a5fa', '#a855f7', '#ec4899', '#14b8a6']
const PRODUCT_DISPLAY_LIMIT = 5
const STAR_COLORS = {
  star_1: '#ef4444',
  star_2: '#f97316',
  star_3: '#eab308',
  star_4: '#84cc16',
  star_5: '#22c55e',
}

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

function ratingColor(overall) {
  if (overall == null) return 'var(--text)'
  if (overall >= 4) return '#22c55e'
  if (overall >= 3) return '#eab308'
  return '#ef4444'
}

function renderStars(overall) {
  if (overall == null) return '-'
  const stars = Math.round(Number(overall))
  return `${'\u2605'.repeat(stars)}${'\u2606'.repeat(Math.max(0, 5 - stars))}`
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

function getDefaultWidgetProduct({ parentProducts, parentCategory, scopedProducts, widgetValue }) {
  if (widgetValue !== undefined) return widgetValue
  if (parentProducts.length === 1) return parentProducts[0]
  if (parentProducts.length > 1 || parentCategory) return null
  return null
}

function SnapshotTable({ rows }) {
  if (!rows.length) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>
        No Amazon rating snapshot data yet.
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Category', 'Product', 'Amazon Overall Rating', 'Amazon Review Count'].map(label => (
              <th
                key={label}
                style={{
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
                }}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.category}-${row.product}-${index}`} style={{ background: index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
              <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>{row.category}</td>
              <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700 }}>{row.product}</td>
              <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: ratingColor(row.overall) }}>
                {row.overall != null ? `${Number(row.overall).toFixed(1)} ${renderStars(row.overall)}` : '-'}
              </td>
              <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                {row.total_ratings != null ? Number(row.total_ratings).toLocaleString() : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function RatingTrendChart({ filters, tree }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filterProd, setFilterProd] = useState(undefined)
  const [viewMode, setViewMode] = useState('snapshot')

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

  useEffect(() => {
    setFilterProd(undefined)
  }, [JSON.stringify(products), productCategory, JSON.stringify(activeProducts)])

  const effectiveFilterProd = getDefaultWidgetProduct({
    parentProducts: activeProducts,
    parentCategory: productCategory,
    scopedProducts: products,
    widgetValue: filterProd,
  })

  const displayedForChart = effectiveFilterProd && products.includes(effectiveFilterProd)
    ? [effectiveFilterProd]
    : displayedProducts

  const productToCategory = useMemo(() => {
    const lookup = {}
    Object.entries(tree || {}).forEach(([category, categoryProducts]) => {
      ;(categoryProducts || []).forEach(product => {
        lookup[product] = category
      })
    })
    return lookup
  }, [tree])

  if (loading) {
    return <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading...</div>
  }

  if (!days.length) {
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
  const combinedRows = spine.map((day, index) => ({
    ...overallRows[index],
    ...Object.fromEntries(displayedForChart.map(product => [`${product}_vol`, totalRatingsRows[index][product]])),
  }))
  const dailyAvgRows = spine.map(day => ({
    day,
    ...Object.fromEntries(displayedForChart.map(product => [product, byDay[day]?.[product]?.daily_avg ?? null])),
  }))
  const dailyVolumeRows = spine.map(day => ({
    day,
    star_1: displayedForChart.reduce((sum, product) => sum + (byDay[day]?.[product]?.star_1 || 0), 0),
    star_2: displayedForChart.reduce((sum, product) => sum + (byDay[day]?.[product]?.star_2 || 0), 0),
    star_3: displayedForChart.reduce((sum, product) => sum + (byDay[day]?.[product]?.star_3 || 0), 0),
    star_4: displayedForChart.reduce((sum, product) => sum + (byDay[day]?.[product]?.star_4 || 0), 0),
    star_5: displayedForChart.reduce((sum, product) => sum + (byDay[day]?.[product]?.star_5 || 0), 0),
  }))

  const snapshotRows = displayedForChart.map(product => {
    const latestDay = [...days].reverse().find(day =>
      day.products?.[product]?.overall != null || day.products?.[product]?.total_ratings != null,
    )
    return {
      product,
      category: productToCategory[product] || 'Other',
      asin: null,
      overall: latestDay?.products?.[product]?.overall ?? null,
      total_ratings: latestDay?.products?.[product]?.total_ratings ?? null,
    }
  }).sort((left, right) => {
    if (left.category !== right.category) return left.category.localeCompare(right.category)
    return left.product.localeCompare(right.product)
  })

  const xAxisProps = {
    dataKey: 'day',
    tick: { fontSize: 10, fill: 'var(--text-muted)' },
    tickLine: false,
    axisLine: false,
    tickFormatter: fmtDay,
    minTickGap: 30,
  }

  const gridProps = { strokeDasharray: '3 3', stroke: 'var(--border)', vertical: false }
  const limitedProducts = !activeProducts.length && !productCategory && !filterProd && products.length > displayedProducts.length

  const selectStyle = {
    padding: '4px 8px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--surface2)',
    color: effectiveFilterProd ? 'var(--accent)' : 'var(--text-muted)',
    fontSize: 11,
    fontFamily: 'DM Sans',
    cursor: 'pointer',
    outline: 'none',
  }

  const trendTooltip = formatter => ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 11, minWidth: 170 }}>
        <div style={{ fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>{fmtDay(label)}</div>
        {payload.filter(point => point.value != null).map(point => (
          <div key={point.dataKey} style={{ color: point.color || point.fill || 'var(--text)', display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 3 }}>
            <span style={{ color: 'var(--text-muted)' }}>{point.name || point.dataKey}</span>
            <span style={{ fontWeight: 700, flexShrink: 0 }}>{formatter(point.value)}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {SHOW_AMAZON_RATING_HISTORY
            ? 'Track Amazon rating snapshots, daily review averages, and the daily star mix from scraped reviews.'
            : 'Showing the latest Amazon product-page snapshot in a flat table until the full history view is enabled.'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <select value={effectiveFilterProd || ''} onChange={event => setFilterProd(event.target.value || null)} style={selectStyle}>
            <option value="">All Products</option>
            {products.map(product => <option key={product} value={product}>{product}</option>)}
          </select>
          {SHOW_AMAZON_RATING_HISTORY && (
            <Toggle
              value={viewMode}
              onChange={setViewMode}
              options={[
                { v: 'snapshot', l: 'Snapshot' },
                { v: 'overall', l: 'Amazon Rating' },
                { v: 'daily_reviews', l: 'Daily Reviews' },
              ]}
            />
          )}
        </div>
      </div>

      {limitedProducts && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Showing top {displayedProducts.length} products by Amazon review scale. Use the dropdown to focus on a specific product.
        </div>
      )}

      {viewMode === 'snapshot' || !SHOW_AMAZON_RATING_HISTORY ? (
        <SnapshotTable rows={snapshotRows} />
      ) : viewMode === 'overall' ? (
        <>
          <ResponsiveContainer width="100%" height={210}>
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
                tickFormatter={value => (value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value)}
              />
              <Tooltip content={trendTooltip(value => `${Number(value).toFixed(2)} ★`)} />
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
                  name={`${product} review count`}
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
                  name={product}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
          <SeriesLegend products={displayedForChart} colorMap={colorMap} />
        </>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={230}>
            <ComposedChart data={dailyVolumeRows} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis {...xAxisProps} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
              <Tooltip content={trendTooltip(value => Number(value).toLocaleString())} />
              <Bar dataKey="star_1" stackId="stars" fill={STAR_COLORS.star_1} name="1★" />
              <Bar dataKey="star_2" stackId="stars" fill={STAR_COLORS.star_2} name="2★" />
              <Bar dataKey="star_3" stackId="stars" fill={STAR_COLORS.star_3} name="3★" />
              <Bar dataKey="star_4" stackId="stars" fill={STAR_COLORS.star_4} name="4★" />
              <Bar dataKey="star_5" stackId="stars" fill={STAR_COLORS.star_5} name="5★" />
            </ComposedChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              ['1★', STAR_COLORS.star_1],
              ['2★', STAR_COLORS.star_2],
              ['3★', STAR_COLORS.star_3],
              ['4★', STAR_COLORS.star_4],
              ['5★', STAR_COLORS.star_5],
            ].map(([label, color]) => (
              <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block' }} />
                {label}
              </span>
            ))}
          </div>
        </>
      )}

      {SHOW_AMAZON_RATING_HISTORY && viewMode === 'daily_reviews' && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Each bar shows total reviews on that day, stacked from 1-star through 5-star for the selected product scope.
        </div>
      )}

      {SHOW_AMAZON_RATING_HISTORY && viewMode === 'overall' && displayedForChart.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
            Daily Avg Rating from Scraped Reviews
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={dailyAvgRows} margin={{ top: 4, right: 16, left: -10, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis {...xAxisProps} />
              <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} tickFormatter={value => value.toFixed(0)} />
              <Tooltip content={trendTooltip(value => `${Number(value).toFixed(2)} ★`)} />
              <ReferenceLine y={4} stroke="var(--border)" strokeDasharray="4 2" />
              {displayedForChart.map(product => (
                <Line
                  key={`${product}-daily-avg`}
                  type="basis"
                  dataKey={product}
                  stroke={colorMap[product]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5, stroke: '#fff', strokeWidth: 1.5 }}
                  connectNulls
                  name={product}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
