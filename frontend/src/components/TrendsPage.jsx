import { useState, useEffect, useMemo, useRef } from 'react'
import ProductPerformanceScorecard from './ProductPerformanceScorecard'
import ReviewsDrawer from './ReviewsDrawer'
import { apiUrl } from '../api'
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ReferenceLine
} from 'recharts'

// ── CSV export (imported by App.jsx) ─────────────────────────────────────────
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
  const a = document.createElement('a'); a.href = url
  a.download = `voc_reviews_${new Date().toISOString().slice(0,10)}.csv`
  a.click(); URL.revokeObjectURL(url)
}

// ── Constants ─────────────────────────────────────────────────────────────────
const PAL = ['#ff4e1a','#ff8c42','#ffd166','#06d6a0','#60a5fa','#a855f7','#ec4899','#14b8a6','#f43f5e','#34d399','#fb923c','#c084fc']
const PRODUCT_DISPLAY_LIMIT = 5

function fmtDay(d) {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString('en-IN', { day:'numeric', month:'short' }) }
  catch { return d }
}

function rankProductsForFocus(allProducts, productSummary, explicitProducts = [], limit = PRODUCT_DISPLAY_LIMIT) {
  if (explicitProducts?.length) return explicitProducts
  const scored = (productSummary || [])
    .map(row => ({
      name: row.product,
      score: ((row.review_count ?? row.total ?? 0) * 10) + (row.neg_pct ?? 0),
    }))
    .sort((a, b) => b.score - a.score)
    .map(row => row.name)
  const ranked = scored.filter(Boolean)
  const fallback = allProducts.filter(product => !ranked.includes(product))
  return [...ranked, ...fallback].slice(0, limit)
}

// ── Info tooltip ──────────────────────────────────────────────────────────────
function InfoTip({ text }) {
  const [show, setShow] = useState(false)
  const ref = useRef(null)

  return (
    <span ref={ref} style={{ position:'relative', display:'inline-flex', alignItems:'center' }}>
      <span
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{
          display:'inline-flex', alignItems:'center', justifyContent:'center',
          width:16, height:16, borderRadius:'50%',
          background:'var(--surface2)', border:'1px solid var(--border)',
          color:'var(--text-muted)', fontSize:10, fontWeight:700,
          cursor:'help', lineHeight:1, flexShrink:0,
          fontFamily:'DM Sans',
        }}
      >?</span>
      {show && (
        <div style={{
          position:'absolute', bottom:'calc(100% + 8px)', left:'50%', transform:'translateX(-50%)',
          background:'#1a1a28', border:'1px solid var(--border)', borderRadius:8,
          padding:'10px 12px', fontSize:11, color:'var(--text)', lineHeight:1.6,
          width:240, zIndex:100, boxShadow:'0 8px 24px rgba(0,0,0,0.5)',
          pointerEvents:'none', whiteSpace:'normal',
        }}>
          {text}
          <div style={{ position:'absolute', bottom:-5, left:'50%', transform:'translateX(-50%)', width:8, height:8, background:'#1a1a28', borderRight:'1px solid var(--border)', borderBottom:'1px solid var(--border)', rotate:'45deg' }} />
        </div>
      )}
    </span>
  )
}

// ── Chart tooltip ─────────────────────────────────────────────────────────────
function CT({ active, payload, label, fmt }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px', fontSize:12 }}>
      <div style={{ fontWeight:700, marginBottom:5, color:'var(--text-muted)', fontSize:11 }}>{fmtDay(label)}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color:p.color||p.fill||'var(--text)', display:'flex', gap:8, justifyContent:'space-between', minWidth:110 }}>
          <span style={{ color:'var(--text-muted)' }}>{p.name||p.dataKey}</span>
          <span style={{ fontWeight:700 }}>{fmt ? fmt(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── Card ─────────────────────────────────────────────────────────────────────
function Card({ title, sub, tip, children, controls, accent }) {
  return (
    <div style={{ background:'var(--surface)', border:`1px solid ${accent||'var(--border)'}`, borderRadius:12, padding:'18px 20px', display:'flex', flexDirection:'column', gap:14 }}>
      {(title||controls) && (
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10, flexWrap:'wrap' }}>
          <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
            <div style={{ display:'flex', alignItems:'center', gap:7 }}>
              <span style={{ fontFamily:'Bebas Neue', fontSize:17, letterSpacing:'0.06em', color:'var(--text-muted)' }}>{title}</span>
              {tip && <InfoTip text={tip} />}
            </div>
            {sub && <div style={{ fontSize:11, color:'var(--text-muted)' }}>{sub}</div>}
          </div>
          {controls}
        </div>
      )}
      {children}
    </div>
  )
}

// ── KPI tile ──────────────────────────────────────────────────────────────────
function KPI({ label, value, sub, color, delta, deltaInvert, tip }) {
  const deltaColor = delta == null ? null : (delta > 0) === !deltaInvert ? '#ef4444' : '#22c55e'
  return (
    <div style={{ background:'var(--surface)', border:`1px solid ${color}28`, borderRadius:12, padding:'14px 16px', display:'flex', flexDirection:'column', gap:5, borderLeft:`3px solid ${color}` }}>
      <div style={{ display:'flex', alignItems:'center', gap:5 }}>
        <span style={{ fontSize:10, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-muted)' }}>{label}</span>
        {tip && <InfoTip text={tip} />}
      </div>
      <div style={{ fontFamily:'Bebas Neue', fontSize:30, lineHeight:1, color }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize:11, color:'var(--text-muted)', lineHeight:1.4 }}>{sub}</div>}
      {delta != null && (
        <div style={{ fontSize:11, fontWeight:700, color:deltaColor, marginTop:1 }}>
          {delta > 0 ? `↑ +${delta}%` : delta < 0 ? `↓ ${delta}%` : '→ flat'} vs prior 7d
        </div>
      )}
    </div>
  )
}

// ── Momentum widget (full replacement) ───────────────────────────────────────
// ── Issue Watchlist — replaces useless momentum widget ───────────────────────
// Ranks issues by current-period volume, signals direction vs prior half
function IssueWatchlist({ momentum, onRowClick }) {
  if (!momentum?.length) return (
    <div style={{ padding:'24px 0', textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>
      No issue data for selected period.
    </div>
  )

  // Sort by total volume (first + second), highest first
  const ranked = [...momentum]
    .filter(m => (m.first + m.second) > 0)
    .sort((a, b) => (b.first + b.second) - (a.first + a.second))
    .slice(0, 8)

  if (!ranked.length) return (
    <div style={{ padding:'24px 0', textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>
      No data for selected period.
    </div>
  )

  const maxTotal = ranked[0].first + ranked[0].second

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      {/* Column headers */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 48px 52px 60px', gap:8, padding:'0 2px 4px', borderBottom:'1px solid var(--border)' }}>
        <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-muted)' }}>Issue</div>
        <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-muted)', textAlign:'right' }}>Total</div>
        <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-muted)', textAlign:'center' }}>Trend</div>
        <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-muted)', textAlign:'right' }}>Signal</div>
      </div>

      {ranked.map((m, i) => {
        const total = m.first + m.second
        const isNew = m.first === 0 && m.second > 0
        const resolved = m.second === 0 && m.first > 0
        const rising = !isNew && !resolved && m.change > 0
        const falling = !isNew && !resolved && m.change < 0
        // Signal
        const signal = isNew    ? { label: 'NEW',       color: '#f97316', bg: 'rgba(249,115,22,0.12)' }
                     : resolved ? { label: 'RESOLVED',  color: '#22c55e', bg: 'rgba(34,197,94,0.12)'  }
                     : rising   ? { label: 'RISING ↑',  color: '#ef4444', bg: 'rgba(239,68,68,0.12)'  }
                     : falling  ? { label: 'FALLING ↓', color: '#22c55e', bg: 'rgba(34,197,94,0.12)'  }
                     :            { label: 'STABLE →',  color: '#94a3b8', bg: 'rgba(148,163,184,0.08)' }

        // Sparkline-style inline bar
        const barW = Math.round((total / maxTotal) * 100)
        const barColor = rising || isNew ? '#ef4444' : falling || resolved ? '#22c55e' : '#60a5fa'

        // Priority badge — top 3 get escalating urgency
        const priority = i === 0 ? { label: '#1', color: '#ef4444' }
                        : i === 1 ? { label: '#2', color: '#f97316' }
                        : i === 2 ? { label: '#3', color: '#fbbf24' }
                        : null

        return (
          <div key={m.category}
            onClick={() => onRowClick && onRowClick(m.category)}
            style={{
              display:'grid', gridTemplateColumns:'1fr 48px 52px 60px', gap:8, alignItems:'center',
              padding:'8px 10px', borderRadius:8,
              background: i < 3 ? `${signal.color}06` : 'var(--surface2)',
              border: `1px solid ${i < 3 ? signal.color + '20' : 'transparent'}`,
              cursor: onRowClick ? 'pointer' : 'default',
              transition:'filter 0.12s',
            }}
            onMouseEnter={e => onRowClick && (e.currentTarget.style.filter='brightness(1.3)')}
            onMouseLeave={e => (e.currentTarget.style.filter='brightness(1)')}
          >
            {/* Name + bar */}
            <div style={{ display:'flex', flexDirection:'column', gap:4, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                {priority && (
                  <span style={{ fontSize:9, fontWeight:700, color:priority.color, flexShrink:0 }}>{priority.label}</span>
                )}
                <span style={{ fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {m.category}
                </span>
              </div>
              <div style={{ height:4, background:'var(--border)', borderRadius:2, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${barW}%`, background:barColor, borderRadius:2, opacity:0.7 }} />
              </div>
            </div>

            {/* Total count */}
            <div style={{ fontSize:13, fontWeight:700, textAlign:'right', color:'var(--text)' }}>{total}</div>

            {/* Recent vs past */}
            <div style={{ display:'flex', flexDirection:'column', gap:1, alignItems:'flex-end' }}>
              <div style={{ fontSize:10, color:'var(--text-muted)' }}>
                <span style={{ color:'rgba(255,255,255,0.3)' }}>{m.first}</span>
                <span style={{ color:'var(--border)', margin:'0 3px' }}>→</span>
                <span style={{ color:barColor, fontWeight:700 }}>{m.second}</span>
              </div>
              <div style={{ fontSize:9, color:'var(--text-muted)' }}>early → recent</div>
            </div>

            {/* Signal badge */}
            <div style={{ textAlign:'right' }}>
              <span style={{ fontSize:9, fontWeight:700, letterSpacing:'0.06em', color:signal.color, background:signal.bg, border:`1px solid ${signal.color}30`, borderRadius:4, padding:'2px 6px', whiteSpace:'nowrap' }}>
                {signal.label}
              </span>
            </div>
          </div>
        )
      })}

      <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:4, fontStyle:'italic', textAlign:'right' }}>
        Ranked by total volume · early = first half · recent = second half of period
      </div>
    </div>
  )
}

function Stars({ rating }) {
  const n = Math.round(parseFloat(rating)||0)
  const color = n>=4?'#22c55e':n>=3?'#eab308':'#ef4444'
  return <span style={{ color, fontSize:13 }}>{'★'.repeat(n)}{'☆'.repeat(Math.max(0,5-n))} <span style={{ fontSize:11, color:'var(--text-muted)' }}>{parseFloat(rating||0).toFixed(1)}</span></span>
}

function Toggle({ value, options, onChange }) {
  return (
    <div style={{ display:'flex', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:7, padding:2, gap:2 }}>
      {options.map(o => (
        <button key={o.v} onClick={() => onChange(o.v)} style={{
          padding:'3px 10px', borderRadius:5, border:'none', cursor:'pointer', fontSize:11, fontWeight:600, fontFamily:'DM Sans',
          background: value===o.v ? 'var(--accent)' : 'transparent',
          color: value===o.v ? '#fff' : 'var(--text-muted)', transition:'all 0.15s',
        }}>{o.l}</button>
      ))}
    </div>
  )
}

function Empty() {
  return <div style={{ padding:'32px 0', textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>No data for selected filters</div>
}

function EmergingIssues({ momentum, onSelect }) {
  const items = [...(momentum || [])]
    .filter(m => (m.second || 0) > 0 && ((m.first === 0 && m.second > 0) || (m.change || 0) > 0))
    .sort((a, b) => {
      const aNew = a.first === 0 ? 1 : 0
      const bNew = b.first === 0 ? 1 : 0
      if (aNew !== bNew) return bNew - aNew
      return (b.change || 0) - (a.change || 0)
    })
    .slice(0, 5)

  if (!items.length) return <Empty />

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      {items.map(item => {
        const isNew = item.first === 0 && item.second > 0
        const signalColor = isNew ? '#f97316' : '#ef4444'
        return (
          <button key={item.category} onClick={() => onSelect?.(item.category)} style={{ background:'rgba(255,255,255,0.03)', border:`1px solid ${signalColor}24`, borderRadius:10, padding:'10px 12px', display:'grid', gridTemplateColumns:'1fr auto auto', gap:10, alignItems:'center', cursor:'pointer', color:'inherit', textAlign:'left' }}>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>{item.category}</div>
              <div style={{ fontSize:11, color:'var(--text-muted)' }}>
                {isNew ? 'New issue in the recent half of the period' : `Up from ${item.first} to ${item.second} mentions`}
              </div>
            </div>
            <div style={{ fontSize:11, fontWeight:700, color:signalColor }}>
              {isNew ? 'NEW' : `${item.change > 0 ? '+' : ''}${item.change}`}
            </div>
            <div style={{ fontSize:11, color:'var(--text-muted)' }}>
              {item.pct_change > 0 ? `+${item.pct_change}%` : `${item.pct_change}%`}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function ConsistencyWatch({ ratingDist, productSummary }) {
  const summaryLookup = Object.fromEntries((productSummary || []).map(row => [row.product, row]))
  const items = (ratingDist || [])
    .map(row => {
      const total = [1,2,3,4,5].reduce((sum, star) => sum + (row[String(star)] || 0), 0)
      const one = row['1'] || 0
      const five = row['5'] || 0
      const onePct = total ? +(one / total * 100).toFixed(1) : 0
      const fivePct = total ? +(five / total * 100).toFixed(1) : 0
      const polarity = Math.min(onePct, fivePct)
      return {
        product: row.product,
        total,
        onePct,
        fivePct,
        polarity,
        summary: summaryLookup[row.product],
      }
    })
    .filter(item => item.total > 0)
    .sort((a, b) => b.polarity - a.polarity)

  if (!items.length) return <Empty />

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      {items.map(item => {
        const verdict = item.polarity >= 18 ? 'Highly Polarized' : item.polarity >= 10 ? 'Mixed Experience' : 'More Consistent'
        const color = item.polarity >= 18 ? '#f97316' : item.polarity >= 10 ? '#eab308' : '#22c55e'
        return (
          <div key={item.product} style={{ background:'rgba(255,255,255,0.03)', border:`1px solid ${color}24`, borderRadius:10, padding:'10px 12px', display:'flex', flexDirection:'column', gap:6 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>{item.product}</div>
              <div style={{ fontSize:10, fontWeight:700, color, textTransform:'uppercase', letterSpacing:'0.08em' }}>{verdict}</div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
              <div>
                <div style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>1★ Share</div>
                <div style={{ fontSize:13, fontWeight:700, color:'#ef4444' }}>{item.onePct}%</div>
              </div>
              <div>
                <div style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>5★ Share</div>
                <div style={{ fontSize:13, fontWeight:700, color:'#22c55e' }}>{item.fivePct}%</div>
              </div>
              <div>
                <div style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Problem Rate</div>
                <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{item.summary?.neg_pct ?? 0}%</div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
export default function TrendsPage({ products: allProducts, filters }) {
  const [data, setData]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [hasData, setHasData] = useState(false)
  const [catMode,  setCatMode]    = useState('total')
  const [emergingCat, setEmergingCat] = useState(null)
  const [drawerCat, setDrawerCat]  = useState(null)
  const [issueProd, setIssueProd] = useState(null)
  const [hiddenCats,  setHiddenCats]  = useState(new Set())
  const [selectedProd, setSelectedProd] = useState(null)

  // Derive selected products from filter state
  const selectedProducts = useMemo(() =>
    filters?.product?.length ? filters.product : [],
  [filters?.product])

  const productCategory = filters?.product_category || null
  const dateFrom = filters?.date_from || ''
  const dateTo   = filters?.date_to   || ''

  useEffect(() => {
    if (!allProducts?.length) return
    setLoading(true)
    const p = new URLSearchParams()
    if (productCategory) p.set('category', productCategory)
    else if (selectedProducts.length) p.set('product', selectedProducts.join('|||'))
    if (dateFrom) p.set('date_from', dateFrom)
    if (dateTo)   p.set('date_to',   dateTo)
    fetch(apiUrl(`/api/trends/cxo?${p}`))
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); setHasData(true) })
      .catch(() => setLoading(false))
  }, [productCategory, JSON.stringify(selectedProducts), dateFrom, dateTo, allProducts?.length])

  const toggleCat = c => setHiddenCats(s => { const n=new Set(s); n.has(c)?n.delete(c):n.add(c); return n })

  // Auto-hide low-volume categories when data loads — keep top 5 visible
  useEffect(() => {
    if (!momentum.length || !allCats.length) return
    const top5 = new Set([...momentum].sort((a,b) => (b.first+b.second)-(a.first+a.second)).slice(0,5).map(m => m.category))
    setHiddenCats(new Set(allCats.filter(c => !top5.has(c))))
  }, [data])

  const kpi            = data?.kpi || {}
  const dailyTrend     = data?.daily_trend || []
  const productDaily   = data?.product_daily || []
  const dailyCats      = data?.daily_categories || []
  const allCats        = data?.all_categories || []
  const allProds       = data?.all_products || []
  const ratingDist     = data?.rating_distribution || []
  const momentum       = data?.category_momentum || []
  const productSummary = data?.product_summary || []
  const weeklyDigest   = data?.weekly_digest || []
  const [localMomentum, setLocalMomentum] = useState(null)
  const [localDailyCats, setLocalDailyCats] = useState(null)
  const [ratingDistProd, setRatingDistProd] = useState(null)
  useEffect(() => {
    if (!issueProd) { setLocalMomentum(null); setLocalDailyCats(null); return }
    const p = new URLSearchParams({ product: issueProd })
    if (dateFrom) p.set('date_from', dateFrom)
    if (dateTo)   p.set('date_to', dateTo)
    fetch(apiUrl(`/api/trends/cxo?${p}`))
      .then(r => r.json())
      .then(d => {
        setLocalMomentum(d?.category_momentum || [])
        setLocalDailyCats(d?.daily_categories || null)
      })
      .catch(() => { setLocalMomentum(null); setLocalDailyCats(null) })
  }, [issueProd, dateFrom, dateTo])
  const issueMomentum = localMomentum ?? momentum
  const activeDailyCats = localDailyCats ?? dailyCats

  // Reset widget-level filters when the available product list changes
  useEffect(() => {
    if (issueProd && !allProds.includes(issueProd)) setIssueProd(null)
    if (selectedProd && !allProds.includes(selectedProd)) setSelectedProd(null)
    if (ratingDistProd && !allProds.includes(ratingDistProd)) setRatingDistProd(null)
  }, [JSON.stringify(allProds)])

  const focusedProds = useMemo(
    () => rankProductsForFocus(allProds, productSummary, selectedProducts),
    [allProds, productSummary, selectedProducts],
  )
  const displayedProds = selectedProducts.length ? allProds : focusedProds
  const displayedRatingDist = selectedProducts.length
    ? ratingDist
    : ratingDist.filter(row => displayedProds.includes(row.product))


  const healthData = dailyTrend.map(d => ({
    day: d.day,
    health: Math.max(0, +(100 - d.rolling_neg).toFixed(1)),
  }))

  const thisWeek  = weeklyDigest[weeklyDigest.length-1]
  const priorWeek = weeklyDigest[weeklyDigest.length-2]

  // Active filter summary for display
  const filterSummary = [
    productCategory && `Category: ${productCategory}`,
    selectedProducts.length > 0 && `Products: ${selectedProducts.slice(0, 2).join(', ')}${selectedProducts.length > 2 ? ` +${selectedProducts.length - 2} more` : ''}`,
    dateFrom && dateTo && `${fmtDay(dateFrom)} → ${fmtDay(dateTo)}`,
    dateFrom && !dateTo && `From ${fmtDay(dateFrom)}`,
    !dateFrom && dateTo && `Until ${fmtDay(dateTo)}`,
  ].filter(Boolean).join(' · ')

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

      {/* Active filter pill */}
      {filterSummary && (
        <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', background:'rgba(255,78,26,0.06)', border:'1px solid rgba(255,78,26,0.2)', borderRadius:8, fontSize:11, color:'var(--accent)', width:'fit-content' }}>
          <span style={{ opacity:0.6 }}>Filters active:</span> {filterSummary}
        </div>
      )}

      {(loading && !hasData) ? (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:260, color:'var(--text-muted)', gap:10, fontSize:14 }}>
          <span style={{ fontSize:22 }}>⟳</span> Loading trends…
        </div>
      ) : !data ? <Empty /> : (
      <>

      {/* ── SECTION 1: EXECUTIVE SNAPSHOT ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        <KPI label="Feedback Volume" value={kpi.total?.toLocaleString()} color="#60a5fa"
          sub={`in selected period`}
          tip="Total number of reviews scraped from Amazon for the selected products and date range." />
        <KPI label="1–2 Stars" value={`${kpi.neg_pct}%`}
          color={kpi.neg_pct>50?'#ef4444':kpi.neg_pct>30?'#f97316':'#22c55e'}
          sub="share of reviews classified negative"
          tip="Percentage of reviews tagged as Negative by the AI tagger." />
        <KPI label="4–5 Stars" value={`${kpi.pos_pct}%`} color="#22c55e"
          sub="share of reviews classified positive"
          tip="Percentage of reviews tagged as Positive." />
        <KPI label="Products In View" value={allProds.length} color="#a855f7"
          sub={allProds.slice(0,2).join(', ')+(allProds.length>2?'…':'')}
          tip="Number of distinct products in the selected filter." />
      </div>

      {/* WoW digest */}
      {thisWeek && priorWeek && (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 20px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:10 }}>
            <span style={{ fontSize:10, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-muted)' }}>📋 Week-on-Week Digest</span>
            <InfoTip text="Compares the current calendar week vs the prior calendar week. Only available when the selected date range covers at least 14 days." />
          </div>
          <div style={{ display:'flex', gap:28, flexWrap:'wrap' }}>
            {[
              { label:'Reviews',  thisVal:thisWeek.total,    prevVal:priorWeek.total,    fmt:v=>v?.toLocaleString(), invert:false },
              { label:'Negative', thisVal:thisWeek.Negative, prevVal:priorWeek.Negative, fmt:v=>v,                  invert:true  },
              { label:'Positive', thisVal:thisWeek.Positive, prevVal:priorWeek.Positive, fmt:v=>v,                  invert:false },
            ].map(({ label, thisVal, prevVal, fmt, invert }) => {
              const delta = prevVal > 0 ? Math.round((thisVal-prevVal)/prevVal*100) : null
              // invert=true means up is bad (e.g. Negative reviews going up = red)
              // Reviews: always neutral blue regardless of direction
              const isNeutral = label === 'Reviews'
              const color = isNeutral
                ? '#60a5fa'
                : delta == null ? 'var(--text-muted)'
                : invert
                  ? (delta > 0 ? '#ef4444' : '#22c55e')   // Negative: up=red, down=green
                  : (delta > 0 ? '#22c55e' : '#ef4444')   // Positive: up=green, down=red
              return (
                <div key={label} style={{ display:'flex', flexDirection:'column', gap:2 }}>
                  <div style={{ fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>{label}</div>
                  <div style={{ fontSize:20, fontFamily:'Bebas Neue', color:'var(--text)' }}>{fmt(thisVal)}</div>
                  {delta!=null && <div style={{ fontSize:11, fontWeight:700, color }}>{delta>0?`↑ +${delta}%`:`↓ ${delta}%`} WoW</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <Card
          title="Emerging Issues"
          tip="Issues absent or small in the first half of the period that are now growing."
          controls={
            <select value={issueProd || ''} onChange={e => setIssueProd(e.target.value || null)} style={{ padding:'4px 8px', borderRadius:6, border:'1px solid var(--border)', background:'var(--surface2)', color: issueProd ? 'var(--accent)' : 'var(--text-muted)', fontSize:11, fontFamily:'DM Sans', cursor:'pointer', outline:'none' }}>
              <option value="">All Products</option>
              {allProds.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          }
        >
          <EmergingIssues momentum={issueMomentum} onSelect={cat => setEmergingCat(emergingCat === cat ? null : cat)} />
          <ReviewsDrawer category={emergingCat} label={emergingCat} filters={filters} onClose={() => setEmergingCat(null)} />
        </Card>

        <Card
          title="Consistency Watch"
          tip="This highlights products where 1-star and 5-star review shares are both meaningfully present. That usually signals inconsistent customer experience, which average rating alone can hide."
          sub="High 1★ and high 5★ together = inconsistent experience worth investigating"
        >
          <ConsistencyWatch ratingDist={displayedRatingDist} productSummary={productSummary} />
        </Card>
      </div>

      {/* ── SECTION 2: BRAND HEALTH SCORE ── */}
      <Card
        title="Brand Health Score"
        tip="Composite score from 0–100. Formula: 100 minus the 7-day rolling negative rate. Below 60 is critical and requires immediate action. 60–75 is a watch zone. Above 75 is healthy. The rolling average smooths out day-to-day noise so you see the real trend."
        sub="7-day rolling score · 75+ healthy · 60–75 watch · below 60 critical"
      >
        {!healthData.length ? <Empty /> : (
          <>
            {(() => {
              const latest = healthData[healthData.length-1]?.health || 0
              const color = latest>=75?'#22c55e':latest>=60?'#eab308':'#ef4444'
              const label = latest>=75?'HEALTHY':latest>=60?'WATCH':'CRITICAL'
              return (
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:4 }}>
                  <div style={{ fontFamily:'Bebas Neue', fontSize:52, lineHeight:1, color }}>{latest}</div>
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.15em', color, padding:'2px 8px', borderRadius:4, border:`1px solid ${color}50`, background:`${color}15`, display:'inline-block' }}>{label}</div>
                    <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>Based on {healthData.length}-day window</div>
                  </div>
                </div>
              )
            })()}
            <ResponsiveContainer width="100%" height={130}>
              <AreaChart data={healthData} margin={{ top:4, right:4, bottom:0, left:-20 }}>
                <defs>
                  <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" tick={{ fill:'var(--text-muted)', fontSize:10 }} tickLine={false} axisLine={false} tickFormatter={fmtDay} />
                <YAxis domain={[0,100]} tick={{ fill:'var(--text-muted)', fontSize:10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<CT fmt={v=>`${v} / 100`} />} />
                <ReferenceLine y={75} stroke="#22c55e" strokeDasharray="4 2" strokeOpacity={0.4} label={{ value:'75', fill:'#22c55e', fontSize:9, position:'right' }} />
                <ReferenceLine y={60} stroke="#eab308" strokeDasharray="4 2" strokeOpacity={0.4} label={{ value:'60', fill:'#eab308', fontSize:9, position:'right' }} />
                <Area type="monotone" dataKey="health" stroke="#22c55e" strokeWidth={2.5} fill="url(#hg)" dot={false} name="Health Score" />
              </AreaChart>
            </ResponsiveContainer>
          </>
        )}
      </Card>

      {/* ── SECTION 4: PRODUCT SCORECARD ── */}
      <ProductPerformanceScorecard Card={Card} productSummary={productSummary} />
      {false && <Card
        title="Product Performance Scorecard"
        tip="This is the core filtered comparison view for leadership and analysts. Review Rating is the average of scraped review stars within the selected period only, so it reflects the exact filter window being analyzed here. Health Score = 100 minus negative rate %. Sorted best to worst. The Verdict column gives an instant action signal: ✅ Good means no action needed, ⚠️ Watch means monitor closely, 🔴 Act Now means escalate immediately."
        sub="Review Rating = avg stars from reviews in the selected period"
      >
        {!productSummary.length ? <Empty /> : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  {['Product','Reviews','Review Rating','Neg %','Pos %','Health','Verdict'].map(h => (
                    <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--text-muted)', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {productSummary.sort((a,b)=>a.neg_pct-b.neg_pct).map((row,i) => {
                  const health = Math.max(0,100-row.neg_pct)
                  const hColor = health>=75?'#22c55e':health>=60?'#eab308':'#ef4444'
                  const verdict = health>=75?'✅ Good':health>=60?'⚠️ Watch':'🔴 Act Now'
                  return (
                    <tr key={row.product} style={{ background:i%2===0?'var(--surface)':'var(--surface2)' }}>
                      <td style={{ padding:'10px 12px', fontSize:13, fontWeight:600 }}>{row.product}</td>
                      <td style={{ padding:'10px 12px', fontSize:13 }}>{row.total?.toLocaleString()}</td>
                      <td style={{ padding:'10px 12px' }}><Stars rating={row.avg_rating} /></td>
                      <td style={{ padding:'10px 12px' }}>
                        <span style={{ color:row.neg_pct>50?'#ef4444':row.neg_pct>30?'#eab308':'#22c55e', fontWeight:700 }}>{row.neg_pct}%</span>
                        <div style={{ height:3, width:60, background:'var(--border)', borderRadius:2, marginTop:3 }}>
                          <div style={{ height:'100%', width:`${row.neg_pct}%`, background:row.neg_pct>50?'#ef4444':row.neg_pct>30?'#eab308':'#22c55e', borderRadius:2 }} />
                        </div>
                      </td>
                      <td style={{ padding:'10px 12px', color:'#22c55e', fontWeight:700 }}>{Math.round((row.positive||0)/Math.max(row.total,1)*100)}%</td>
                      <td style={{ padding:'10px 12px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <div style={{ fontFamily:'Bebas Neue', fontSize:22, color:hColor }}>{Math.round(health)}</div>
                          <div style={{ width:40, height:4, background:'var(--border)', borderRadius:2 }}>
                            <div style={{ height:'100%', width:`${health}%`, background:hColor, borderRadius:2 }} />
                          </div>
                        </div>
                      </td>
                      <td style={{ padding:'10px 12px', fontSize:12, fontWeight:700 }}>{verdict}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>}

      {/* ── SECTION 5: PRODUCT HEAD-TO-HEAD ── */}
      <Card
        title="Problem Rate by Product Over Time"
        tip="Daily negative rate % per product. Red dashed line at 50% is critical threshold."
        controls={
          <select value={selectedProd || ''} onChange={e => setSelectedProd(e.target.value || null)} style={{ padding:'4px 8px', borderRadius:6, border:'1px solid var(--border)', background:'var(--surface2)', color: selectedProd ? 'var(--accent)' : 'var(--text-muted)', fontSize:11, fontFamily:'DM Sans', cursor:'pointer', outline:'none' }}>
            <option value="">All Products</option>
            {allProds.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        }
      >
        {!productDaily.length ? <Empty /> : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={productDaily} margin={{ top:4, right:4, bottom:0, left:-20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="day" tick={{ fill:'var(--text-muted)', fontSize:10 }} tickLine={false} axisLine={false} tickFormatter={fmtDay} />
              <YAxis domain={[0,100]} tick={{ fill:'var(--text-muted)', fontSize:10 }} tickLine={false} axisLine={false} tickFormatter={v=>`${v}%`} />
              <Tooltip content={<CT fmt={v=>v!=null?`${v}%`:'no data'} />} />
              <ReferenceLine y={50} stroke="#ef4444" strokeDasharray="4 2" strokeOpacity={0.3} />
              {allProds.filter(p => !selectedProd || p === selectedProd).map(p => (
                <Line key={p} type="basis" dataKey={p} stroke={PAL[allProds.indexOf(p)%PAL.length]}
                  strokeWidth={2} dot={false} activeDot={{ r:4 }} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* ── SECTION 6: ISSUE CATEGORY TRENDS + MOMENTUM ── */}
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:16 }}>

        <Card
          title="Issue Pressure Over Time"
          tip="Daily count of negative reviews per issue category. Use Daily view to spot when a specific issue spiked. Use Totals view to rank categories by total volume across the period. Click category pills above the chart to isolate a specific issue."
          sub="Shows which problems are persistent versus episodic"
          controls={
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <select value={issueProd || ''} onChange={e => setIssueProd(e.target.value || null)} style={{ padding:'4px 8px', borderRadius:6, border:'1px solid var(--border)', background:'var(--surface2)', color: issueProd ? 'var(--accent)' : 'var(--text-muted)', fontSize:11, fontFamily:'DM Sans', cursor:'pointer', outline:'none' }}>
                <option value="">All Products</option>
                {allProds.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <Toggle value={catMode} onChange={setCatMode} options={[{v:'trend',l:'Daily'},{v:'total',l:'Totals'}]} />
            </div>
          }
        >
          <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 8px', marginBottom:4, alignItems:'center' }}>
            {allCats.map((c,i) => (
              <button key={c} onClick={() => toggleCat(c)} style={{
                display:'flex', alignItems:'center', gap:4, padding:'2px 7px', borderRadius:4,
                cursor:'pointer', fontFamily:'DM Sans', fontSize:11,
                border:`1px solid ${hiddenCats.has(c)?'var(--border)':PAL[i%PAL.length]+'60'}`,
                background: hiddenCats.has(c)?'transparent':`${PAL[i%PAL.length]}15`,
                color: hiddenCats.has(c)?'var(--text-muted)':PAL[i%PAL.length],
                opacity: hiddenCats.has(c)?0.4:1,
              }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:PAL[i%PAL.length] }} />{c}
              </button>
            ))}
            {hiddenCats.size > 0 && (
              <button onClick={() => setHiddenCats(new Set())} style={{ padding:'2px 8px', borderRadius:4, border:'1px solid var(--border)', background:'transparent', color:'var(--text-muted)', fontSize:10, fontWeight:600, cursor:'pointer', fontFamily:'DM Sans' }}>
                +{hiddenCats.size} more
              </button>
            )}
          </div>
          {catMode==='trend' ? (
            !activeDailyCats.length ? <Empty /> : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={activeDailyCats} margin={{ top:4, right:4, bottom:0, left:-20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="day" tick={{ fill:'var(--text-muted)', fontSize:10 }} tickLine={false} axisLine={false} tickFormatter={fmtDay} />
                  <YAxis tick={{ fill:'var(--text-muted)', fontSize:10 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CT />} />
                  {allCats.map((c,i) => !hiddenCats.has(c) && (
                    <Line key={c} type="basis" dataKey={c} stroke={PAL[i%PAL.length]} strokeWidth={1.5} dot={false} activeDot={{ r:3 }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )
          ) : (
            <>
              <div style={{ display:'flex', flexDirection:'column', gap:0, marginTop:4 }}>
                {(issueProd ? (localMomentum||[]) : (data?.category_momentum||[])).slice(0,10).map((row,i) => {
                  const rowTotal = (row.first||0) + (row.second||0)
                  const allRows = issueProd ? (localMomentum||[]) : (data?.category_momentum||[])
                  const max = Math.max(...allRows.map(r=>(r.first||0)+(r.second||0)),1)
                  return (
                    <div key={row.category}
                      onClick={() => setDrawerCat(drawerCat === row.category ? null : row.category)}
                      style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 6px', borderBottom:'1px solid var(--border)',
                        cursor:'pointer', borderRadius:4, margin:'0 -6px', transition:'background 0.12s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background='rgba(255,78,26,0.07)'}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}
                    >
                      <div style={{ fontSize:11, color:'var(--text-muted)', width:14, textAlign:'right' }}>{i+1}</div>
                      <div style={{ fontSize:12, fontWeight:600, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row.category}</div>
                      <div style={{ width:80, height:5, background:'var(--border)', borderRadius:2 }}>
                        <div style={{ height:'100%', width:`${(rowTotal/max)*100}%`, background:PAL[i%PAL.length], borderRadius:2 }} />
                      </div>
                      <div style={{ fontSize:12, fontWeight:700, color:PAL[i%PAL.length], width:28, textAlign:'right' }}>{rowTotal}</div>
                    </div>
                  )
                })}
              </div>
              <ReviewsDrawer category={drawerCat} label={drawerCat} filters={filters} onClose={() => setDrawerCat(null)} />
            </>
          )}
        </Card>

        <Card
          title="Issues That Need Attention"
          tip="Top negative issues ranked by total volume. RISING = escalate now, NEW = fresh problem, FALLING = fix working, STABLE = chronic."
          controls={
            <select value={issueProd || ''} onChange={e => setIssueProd(e.target.value || null)} style={{ padding:'4px 8px', borderRadius:6, border:'1px solid var(--border)', background:'var(--surface2)', color: issueProd ? 'var(--accent)' : 'var(--text-muted)', fontSize:11, fontFamily:'DM Sans', cursor:'pointer', outline:'none' }}>
              <option value="">All Products</option>
              {allProds.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          }
        >
          <IssueWatchlist momentum={issueMomentum} onRowClick={cat => setDrawerCat(drawerCat === cat ? null : cat)} />
          <ReviewsDrawer category={drawerCat} label={drawerCat} filters={filters} onClose={() => setDrawerCat(null)} />
        </Card>
      </div>

      {/* ── SECTION 8: RATING DISTRIBUTION ── */}
      <Card
        title="Rating Distribution by Product"
        tip="Horizontal bar breakdown of 1★ through 5★ reviews per product. A healthy product is top-heavy — most reviews at 4★ and 5★. A bimodal distribution (both 1★ and 5★ are high) means polarised opinions, often a sign of a quality consistency issue."
        sub='Healthy = top-heavy (4★ + 5★). Bimodal = quality consistency issue.'
        controls={
          <select value={ratingDistProd || ''} onChange={e => setRatingDistProd(e.target.value || null)} style={{ padding:'4px 8px', borderRadius:6, border:'1px solid var(--border)', background:'var(--surface2)', color: ratingDistProd ? 'var(--accent)' : 'var(--text-muted)', fontSize:11, fontFamily:'DM Sans', cursor:'pointer', outline:'none' }}>
            <option value="">All Products</option>
            {allProds.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        }
      >
        {!displayedRatingDist.length ? <Empty /> : (
          <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
            {displayedRatingDist.filter(row => !ratingDistProd || row.product === ratingDistProd).map(row => {
              const total = [1,2,3,4,5].reduce((s,n)=>s+(row[n]||0),0)
              return (
                <div key={row.product} style={{ display:'flex', flexDirection:'column', gap:5 }}>
                  <div style={{ fontSize:12, fontWeight:700 }}>{row.product}</div>
                  {[5,4,3,2,1].map(star => {
                    const cnt = row[star]||0
                    const pct = total>0?(cnt/total*100).toFixed(1):0
                    const color = star>=4?'#22c55e':star===3?'#eab308':'#ef4444'
                    return (
                      <div key={star} style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ width:20, fontSize:11, color:'var(--text-muted)', textAlign:'right' }}>{star}★</div>
                        <div style={{ flex:1, height:8, background:'var(--border)', borderRadius:4, overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:4, transition:'width 0.4s' }} />
                        </div>
                        <div style={{ width:36, fontSize:11, color, fontWeight:700, textAlign:'right' }}>{pct}%</div>
                        <div style={{ width:24, fontSize:10, color:'var(--text-muted)', textAlign:'right' }}>{cnt}</div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* ── SECTION 9: RATING TRENDS ── */}
      {false && <Card
        title="Rating Trends"
        tip="Three views of rating health over time. Top: Amazon's overall displayed product-page rating per product, sourced from rating snapshots and forward-filled between scrape dates. This is different from the Review Rating shown in the scorecard above, which uses only scraped reviews inside the selected period. Middle: daily average of scraped reviews. Bottom: total number of ratings on Amazon."
        sub="Top chart = Amazon product-page rating · scorecard above = review-period rating"
      >
        <RatingTrendChart filters={filters} allProducts={allProducts} tree={tree} />
      </Card>}

      </>
      )}
    </div>
  )
}
