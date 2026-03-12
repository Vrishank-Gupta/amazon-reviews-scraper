/**
 * OVERVIEW TAB  — CXO 30-second pulse
 *
 * Layout:
 *  1. Alert banner (auto-verdict)
 *  2. 4 KPI tiles: Total · Neg Rate · Pos Rate · Avg Rating
 *  3. Product health cards (one per product, visual urgency)
 *  4. Top burning issues (ranked horizontal bars)
 *  5. Sentiment trend (compact, toggle volume/rate)
 */
import { useState, useEffect, useCallback } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ComposedChart, Bar, Line, ReferenceLine
} from 'recharts'
import { fetchAnalysis, fetchSummary } from '../api'
import { InfoTip, Card } from './shared'
import RatingTrendChart from './RatingTrendChart'

function fmtDay(d) {
  try { return new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'short'}) } catch { return d }
}

// ── Alert banner ──────────────────────────────────────────────────────────────
function AlertBanner({ kpi, negPie, products }) {
  if (!kpi?.total) return null
  const negPct = +((kpi.negative / kpi.total) * 100).toFixed(1)
  const topIssue = negPie?.[0]
  const critProds = (products||[]).filter(p => p.neg_pct > 50).length
  const watchProds = (products||[]).filter(p => p.neg_pct > 30 && p.neg_pct <= 50).length
  const level = negPct > 50 || critProds > 0 ? 'critical' : negPct > 30 || watchProds > 0 ? 'watch' : 'healthy'
  const cfg = {
    critical: { color:'#ef4444', bg:'rgba(239,68,68,0.07)', icon:'🔴', label:'ACTION REQUIRED' },
    watch:    { color:'#eab308', bg:'rgba(234,179,8,0.07)',  icon:'⚠️', label:'MONITOR CLOSELY' },
    healthy:  { color:'#22c55e', bg:'rgba(34,197,94,0.07)', icon:'✅', label:'PERFORMING WELL'  },
  }[level]

  return (
    <div style={{ background:cfg.bg, border:`1px solid ${cfg.color}30`, borderRadius:10, padding:'14px 18px', display:'flex', alignItems:'center', gap:14 }}>
      <span style={{ fontSize:22, flexShrink:0 }}>{cfg.icon}</span>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:11, fontWeight:700, color:cfg.color, letterSpacing:'0.1em', marginBottom:4 }}>{cfg.label}</div>
        <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.6 }}>
          Portfolio negative rate is <strong style={{ color:cfg.color }}>{negPct}%</strong>.
          {topIssue && <> Top complaint: <strong>{topIssue.category}</strong> ({topIssue.count} reviews).</>}
          {critProds > 0 && <> <strong style={{ color:'#ef4444' }}>{critProds} product{critProds>1?'s':''}</strong> in crisis (50%+ negative).</>}
          {watchProds > 0 && <> <strong style={{ color:'#eab308' }}>{watchProds} product{watchProds>1?'s':''}</strong> in watch zone.</>}
        </div>
      </div>
    </div>
  )
}

// ── KPI tile ──────────────────────────────────────────────────────────────────
function KpiTile({ label, value, sub, color, tip }) {
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 18px', display:'flex', flexDirection:'column', gap:6, borderLeft:`3px solid ${color}` }}>
      <div style={{ display:'flex', alignItems:'center', gap:5 }}>
        <span style={{ fontSize:10, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-muted)' }}>{label}</span>
        <InfoTip text={tip} />
      </div>
      <div style={{ fontFamily:'Bebas Neue', fontSize:36, lineHeight:1, color }}>{value ?? '—'}</div>
      <div style={{ fontSize:11, color:'var(--text-muted)' }}>{sub}</div>
    </div>
  )
}

function PriorityStrip({ kpi, negPie, posPie, summaryRows }) {
  if (!kpi?.total) return null
  const topRisk = [...(summaryRows || [])].sort((a, b) => b.neg_pct - a.neg_pct)[0]
  const topStrength = [...(summaryRows || [])].sort((a, b) => a.neg_pct - b.neg_pct)[0]
  const topIssue = negPie?.[0]
  const topLove = posPie?.[0]

  const items = [
    {
      label: 'Priority Product',
      title: topRisk?.product_name || 'No product data',
      meta: topRisk ? `${topRisk.neg_pct}% problem rate · ${topRisk.review_count} reviews` : 'Waiting for review data',
      color: '#ef4444',
    },
    {
      label: 'Strongest Product',
      title: topStrength?.product_name || 'No product data',
      meta: topStrength ? `${topStrength.neg_pct}% problem rate · ${topStrength.avg_rating?.toFixed?.(1) || topStrength.avg_rating}★ review rating` : 'Waiting for review data',
      color: '#22c55e',
    },
    {
      label: 'Biggest Customer Pain',
      title: topIssue?.category || 'No issue data',
      meta: topIssue ? `${topIssue.count} negative reviews tagged here` : 'Waiting for issue data',
      color: '#f97316',
    },
    {
      label: 'Equity To Protect',
      title: topLove?.category || 'No positive signal yet',
      meta: topLove ? `${topLove.count} positive reviews mention this` : 'Waiting for positive signal',
      color: '#60a5fa',
    },
  ]

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
      {items.map(item => (
        <div key={item.label} style={{ background:'var(--surface)', border:`1px solid ${item.color}25`, borderRadius:12, padding:'14px 16px', display:'flex', flexDirection:'column', gap:6, borderTop:`2px solid ${item.color}` }}>
          <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-muted)' }}>{item.label}</div>
          <div style={{ fontSize:15, fontWeight:700, color:'var(--text)', lineHeight:1.35 }}>{item.title}</div>
          <div style={{ fontSize:11, color:'var(--text-muted)', lineHeight:1.45 }}>{item.meta}</div>
        </div>
      ))}
    </div>
  )
}

// ── Product health card grid ──────────────────────────────────────────────────
function ProductHealthGrid({ summaryRows }) {
  if (!summaryRows?.length) return null
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px,1fr))', gap:12 }}>
      {[...summaryRows].sort((a,b) => b.neg_pct - a.neg_pct).map(p => {
        const health = Math.max(0, 100 - p.neg_pct)
        const color  = health >= 75 ? '#22c55e' : health >= 60 ? '#eab308' : '#ef4444'
        const label  = health >= 75 ? 'Good' : health >= 60 ? 'Watch' : 'Act Now'
        const bg     = health >= 75 ? 'rgba(34,197,94,0.06)' : health >= 60 ? 'rgba(234,179,8,0.06)' : 'rgba(239,68,68,0.06)'
        const avgRating = parseFloat(p.avg_rating || 0).toFixed(1)
        return (
          <div key={p.product} style={{ background:bg, border:`1px solid ${color}30`, borderRadius:10, padding:'14px 16px', display:'flex', flexDirection:'column', gap:10 }}>
            {/* Name + badge */}
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
              <div style={{ fontSize:12, fontWeight:700, lineHeight:1.4, flex:1 }}>{p.product}</div>
              <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color, background:`${color}18`, border:`1px solid ${color}40`, borderRadius:4, padding:'2px 7px', flexShrink:0 }}>{label}</div>
            </div>
            {/* Big health score */}
            <div style={{ display:'flex', alignItems:'flex-end', gap:12 }}>
              <div>
                <div style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:2 }}>Health</div>
                <div style={{ fontFamily:'Bebas Neue', fontSize:38, lineHeight:1, color }}>{Math.round(health)}</div>
              </div>
              <div style={{ flex:1, paddingBottom:6 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <span style={{ fontSize:10, color:'#ef4444', fontWeight:600 }}>{p.neg_pct}% neg</span>
                  <span style={{ fontSize:10, color:'#22c55e', fontWeight:600 }}>{Math.round(p.positive/Math.max(p.total,1)*100)}% pos</span>
                </div>
                {/* Stacked bar */}
                <div style={{ height:6, background:'var(--border)', borderRadius:3, overflow:'hidden', display:'flex' }}>
                  <div style={{ width:`${Math.round(p.positive/Math.max(p.total,1)*100)}%`, background:'#22c55e', opacity:0.8 }} />
                  <div style={{ width:`${Math.round(p.neutral/Math.max(p.total,1)*100)}%`, background:'#eab308', opacity:0.7 }} />
                  <div style={{ width:`${p.neg_pct}%`, background:'#ef4444', opacity:0.8 }} />
                </div>
              </div>
            </div>
            {/* Stats row */}
            <div style={{ display:'flex', gap:0, borderTop:`1px solid ${color}20`, paddingTop:8 }}>
              {[
                { l:'Reviews', v:p.total?.toLocaleString() },
                { l:'Avg Rating', v:`${avgRating}★` },
                { l:'Neg Count', v:p.negative?.toLocaleString() },
              ].map(({ l, v }) => (
                <div key={l} style={{ flex:1, display:'flex', flexDirection:'column', gap:2 }}>
                  <div style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em' }}>{l}</div>
                  <div style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Inline sub-tag word cloud (shown after clicking an issue row) ─────────────
function InlineWordCloud({ category, filters, allProducts }) {
  const [words, setWords]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [activeWord, setActiveWord] = useState(null)
  const [reviews, setReviews]   = useState([])
  const [revLoading, setRevLoading] = useState(false)

  useEffect(() => {
    setLoading(true); setActiveWord(null); setReviews([])
    const p = new URLSearchParams()
    if (category) p.set('category', category)  // taxonomy category for drill-down
    if (filters.product_category) p.set('product_category', filters.product_category)
    if (filters.product?.length) p.set('product', filters.product.join('|||'))
    if (filters.date_from) p.set('date_from', filters.date_from)
    if (filters.date_to)   p.set('date_to',   filters.date_to)
    fetch(`/api/wordcloud?${p}`)
      .then(r => r.json()).then(setWords).catch(() => setWords([])).finally(() => setLoading(false))
  }, [category, JSON.stringify(filters)])

  useEffect(() => {
    if (!activeWord) { setReviews([]); return }
    setRevLoading(true)
    const p = new URLSearchParams({ keyword: activeWord })
    if (filters.product_category) p.set('product_category', filters.product_category)
    if (filters.product?.length) p.set('product', filters.product.join('|||'))
    if (filters.date_from) p.set('date_from', filters.date_from)
    if (filters.date_to)   p.set('date_to',   filters.date_to)
    fetch(`/api/reviews/by-keyword?${p}`)
      .then(r => r.json()).then(setReviews).catch(() => setReviews([])).finally(() => setRevLoading(false))
  }, [activeWord])

  if (loading) return <div style={{ padding:'12px 0', color:'var(--text-muted)', fontSize:12 }}>Loading sub-tags…</div>
  if (!words.length) return <div style={{ padding:'12px 0', color:'var(--text-muted)', fontSize:12, fontStyle:'italic' }}>No sub-tags found for this category.</div>

  const max = Math.max(...words.map(w => w.count))
  const sentColor = w => w.neg_ratio > 0.6 ? '#ef4444' : w.neg_ratio > 0.35 ? '#f97316' : w.neg_ratio > 0.15 ? '#eab308' : '#22c55e'

  return (
    <div style={{ marginTop:8, padding:'12px 14px', background:'var(--surface2)', borderRadius:8, border:'1px solid var(--border)' }}>
      <div style={{ fontSize:10, color:'var(--text-muted)', fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:4 }}>
        Sub-tags in "{category}"
        <span style={{ marginLeft:8, fontWeight:400, fontStyle:'italic', textTransform:'none', opacity:0.7 }}>
          size = frequency · color = sentiment (red=negative, green=positive) · AI-tagged: 1–2★ ≈ Negative, 3★ ≈ Neutral, 4–5★ ≈ Positive
        </span>
      </div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 10px', alignItems:'center', padding:'8px 0' }}>
        {words.slice(0, 40).map(w => {
          const size = Math.round(11 + (w.count / max) * 14)
          const col  = sentColor(w)
          const isAW = activeWord === w.word
          return (
            <button key={w.word} onClick={() => setActiveWord(isAW ? null : w.word)}
              title={`${w.count} reviews · neg: ${Math.round(w.neg_ratio*100)}% · pos: ${Math.round(w.pos_ratio*100)}%`}
              style={{ background: isAW ? `${col}20` : 'transparent', border: `1px solid ${isAW ? col : 'transparent'}`,
                borderRadius:4, padding:'1px 6px', cursor:'pointer', fontFamily:'DM Sans',
                fontSize:size, color:col, fontWeight: size > 20 ? 700 : size > 15 ? 600 : 500,
                opacity: activeWord && !isAW ? 0.3 : 1, transition:'all 0.12s' }}>
              {w.word}
            </button>
          )
        })}
      </div>

      {activeWord && (
        <div style={{ marginTop:8, borderTop:'1px solid var(--border)', paddingTop:10 }}>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:8, display:'flex', alignItems:'center', gap:8 }}>
            Reviews mentioning <span style={{ color:'var(--accent)', fontWeight:700 }}>"{activeWord}"</span>
            {!revLoading && <span style={{ background:'rgba(255,78,26,0.15)', color:'var(--accent)', border:'1px solid rgba(255,78,26,0.3)', borderRadius:10, padding:'1px 8px', fontSize:11, fontWeight:600 }}>{reviews.length}</span>}
            <button onClick={() => setActiveWord(null)} style={{ marginLeft:'auto', background:'none', border:'1px solid var(--border)', borderRadius:5, color:'var(--text-muted)', fontSize:11, padding:'2px 8px', cursor:'pointer', fontFamily:'DM Sans' }}>Clear ✕</button>
          </div>
          {revLoading ? (
            <div style={{ padding:'12px 0', color:'var(--text-muted)', fontSize:12 }}>Loading…</div>
          ) : reviews.length === 0 ? (
            <div style={{ padding:'12px 0', color:'var(--text-muted)', fontSize:12 }}>No reviews found.</div>
          ) : (
            <div style={{ maxHeight:280, overflowY:'auto' }}>
              {reviews.map((r, i) => (
                <ReviewCard key={r.review_id || i} r={r} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Review card (shared between DrillDown and InlineWordCloud) ────────────────
function ReviewCard({ r }) {
  const [open, setOpen] = useState(false)
  const sentColor = r.sentiment === 'Positive' ? '#22c55e' : r.sentiment === 'Negative' ? '#ef4444' : '#eab308'
  const stars = Math.round(parseFloat(r.rating) || 0)
  return (
    <div style={{ padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
        <span style={{ fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:4,
          background:`${sentColor}15`, color:sentColor, border:`1px solid ${sentColor}30` }}>
          {r.sentiment}
        </span>
        <span style={{ fontSize:11, color:'#eab308' }}>{'★'.repeat(stars)}{'☆'.repeat(Math.max(0,5-stars))}</span>
        <span style={{ fontSize:11, color:'var(--text-muted)', marginLeft:'auto' }}>
          {r.review_date?.replace('Reviewed in India on ','')} · {r.product_name}
        </span>
      </div>
      {r.title && <div style={{ fontSize:12, fontWeight:600, marginBottom:3 }}>{r.title}</div>}
      <div style={{ fontSize:12, color:'var(--text)', lineHeight:1.5, overflow:'hidden',
        display: open ? 'block' : '-webkit-box', WebkitLineClamp:3, WebkitBoxOrient:'vertical' }}>
        {r.review}
      </div>
      {r.review?.length > 200 && (
        <button onClick={() => setOpen(o => !o)} style={{ background:'none', border:'none', cursor:'pointer',
          color:'var(--accent)', fontSize:11, padding:0, textAlign:'left', fontFamily:'DM Sans', marginTop:3 }}>
          {open ? 'Show less ▲' : 'Read full review ▼'}
        </button>
      )}
    </div>
  )
}

// ── Burning issues (horizontal ranked bars) ───────────────────────────────────
function BurningIssues({ negPie, activeCat, onRowClick, filters, allProducts }) {
  if (!negPie?.length) return <div style={{ padding:'20px 0', textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>No data</div>
  const max = negPie[0].count
  const total = negPie.reduce((s,r)=>s+r.count,0)
  const COLS = ['#ef4444','#f97316','#fbbf24','#a855f7','#e879f9','#f43f5e','#94a3b8','#64748b']
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
      {negPie.map((item, i) => {
        const pct = total > 0 ? ((item.count/total)*100).toFixed(0) : 0
        const w = ((item.count/max)*100).toFixed(1)
        const c = COLS[i % COLS.length]
        const isActive = activeCat === item.category
        return (
          <div key={item.category}>
            <div
              onClick={() => onRowClick && onRowClick(item.category)}
              style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer',
                padding:'4px 6px', borderRadius:6, margin:'0 -6px',
                background: isActive ? 'rgba(255,78,26,0.08)' : 'transparent',
                border: `1px solid ${isActive ? 'rgba(255,78,26,0.25)' : 'transparent'}`,
                transition:'background 0.12s',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background='rgba(255,78,26,0.05)' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background='transparent' }}
            >
              <div style={{ width:26, fontSize:10, color:'var(--text-muted)', textAlign:'right', flexShrink:0 }}>#{i+1}</div>
              <div style={{ width:130, fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flexShrink:0, color: isActive ? 'var(--accent)' : 'var(--text)' }}>{item.category}</div>
              <div style={{ flex:1, height:8, background:'var(--border)', borderRadius:4, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${w}%`, background:c, borderRadius:4, opacity:0.85 }} />
              </div>
              <div style={{ width:28, fontSize:12, fontWeight:700, color:c, textAlign:'right', flexShrink:0 }}>{item.count}</div>
              <div style={{ width:36, fontSize:11, color:'var(--text-muted)', textAlign:'right', flexShrink:0 }}>{pct}%</div>
              <div style={{ fontSize:10, color: isActive ? 'var(--accent)' : 'var(--text-muted)', flexShrink:0 }}>{isActive ? '▲' : '▼'}</div>
            </div>
            {isActive && (
              <div style={{ marginLeft:32 }}>
                <InlineWordCloud category={item.category} filters={filters} allProducts={allProducts} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Trend tooltip ─────────────────────────────────────────────────────────────
// ── Rich rate tooltip ─────────────────────────────────────────────────────────
function RateTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const rolling = payload.find(p => p.dataKey === 'rolling_neg')?.value
  const daily   = payload.find(p => p.dataKey === 'neg_rate')?.value
  const pt      = payload[0]?.payload || {}
  const total   = (pt.Positive||0) + (pt.Negative||0) + (pt.Neutral||0)

  const verdict = rolling == null ? null
    : rolling > 50 ? { label:'Crisis', color:'#ef4444', icon:'🔴' }
    : rolling > 30 ? { label:'High — watch closely', color:'#f97316', icon:'⚠️' }
    : rolling > 20 ? { label:'Elevated', color:'#eab308', icon:'⚠️' }
    :                { label:'Healthy', color:'#22c55e', icon:'✅' }

  return (
    <div style={{ background:'#16161f', border:'1px solid var(--border)', borderRadius:10, padding:'12px 16px', fontSize:12, minWidth:200, boxShadow:'0 8px 24px rgba(0,0,0,0.5)' }}>
      <div style={{ fontWeight:700, marginBottom:8, color:'var(--text-muted)', fontSize:11, letterSpacing:'0.06em' }}>{fmtDay(label)}</div>
      {verdict && (
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10, padding:'4px 8px', background:`${verdict.color}12`, border:`1px solid ${verdict.color}30`, borderRadius:6 }}>
          <span>{verdict.icon}</span>
          <span style={{ color:verdict.color, fontWeight:700, fontSize:12 }}>{verdict.label}</span>
        </div>
      )}
      <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
        {rolling != null && (
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:16 }}>
            <span style={{ color:'var(--text-muted)' }}>7d rolling neg rate</span>
            <span style={{ fontWeight:700, color:'#ff4e1a', fontSize:14 }}>{rolling}%</span>
          </div>
        )}
        {daily != null && (
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:16 }}>
            <span style={{ color:'var(--text-muted)' }}>{"Today's neg rate"}</span>
            <span style={{ fontWeight:600, color:'#ef444490', fontSize:12 }}>{daily}%</span>
          </div>
        )}
        {total > 0 && (
          <>
            <div style={{ borderTop:'1px solid var(--border)', margin:'4px 0' }} />
            <div style={{ display:'flex', justifyContent:'space-between', gap:16 }}>
              <span style={{ color:'var(--text-muted)' }}>Reviews today</span>
              <span style={{ fontWeight:600 }}>{total}</span>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              {[['Neg', pt.Negative, '#ef4444'], ['Pos', pt.Positive, '#22c55e'], ['Neu', pt.Neutral, '#eab308']].map(([l,v,c]) => (
                <div key={l} style={{ flex:1, background:`${c}12`, borderRadius:5, padding:'3px 6px', textAlign:'center' }}>
                  <div style={{ fontSize:10, color:c, fontWeight:700 }}>{l}</div>
                  <div style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>{v||0}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Volume tooltip ────────────────────────────────────────────────────────────
function VolumeTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s,p) => s + (p.value||0), 0)
  const neg = payload.find(p=>p.dataKey==='Negative')?.value || 0
  const negPct = total ? ((neg/total)*100).toFixed(0) : 0
  return (
    <div style={{ background:'#16161f', border:'1px solid var(--border)', borderRadius:10, padding:'12px 16px', fontSize:12, minWidth:180, boxShadow:'0 8px 24px rgba(0,0,0,0.5)' }}>
      <div style={{ fontWeight:700, marginBottom:8, color:'var(--text-muted)', fontSize:11 }}>{fmtDay(label)}</div>
      <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
        {payload.map(p => (
          <div key={p.dataKey} style={{ display:'flex', justifyContent:'space-between', gap:16, alignItems:'center' }}>
            <span style={{ display:'flex', alignItems:'center', gap:5, color:'var(--text-muted)' }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:p.color, flexShrink:0, display:'inline-block' }} />
              {p.dataKey}
            </span>
            <span style={{ fontWeight:700, color:p.color }}>{p.value}</span>
          </div>
        ))}
        <div style={{ borderTop:'1px solid var(--border)', marginTop:4, paddingTop:6, display:'flex', justifyContent:'space-between' }}>
          <span style={{ color:'var(--text-muted)' }}>Neg rate today</span>
          <span style={{ fontWeight:700, color: negPct>50?'#ef4444':negPct>30?'#f97316':'#22c55e' }}>{negPct}%</span>
        </div>
      </div>
    </div>
  )
}

function Toggle({ value, options, onChange }) {
  return (
    <div style={{ display:'flex', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:7, padding:2, gap:2 }}>
      {options.map(o => (
        <button key={o.v} onClick={()=>onChange(o.v)} style={{
          padding:'3px 10px', borderRadius:5, border:'none', cursor:'pointer', fontSize:11, fontWeight:600, fontFamily:'DM Sans',
          background:value===o.v?'var(--accent)':'transparent',
          color:value===o.v?'#fff':'var(--text-muted)', transition:'all 0.15s',
        }}>{o.l}</button>
      ))}
    </div>
  )
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export default function AnalysisPage({ filters, allProducts, tree }) {
  const [data, setData]       = useState(null)
  const [summaryRows, setSummaryRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [hasData, setHasData] = useState(false)
  const [trendMode, setTrendMode] = useState('volume')
  const [drawerCat, setDrawerCat] = useState(null)
  const [drawerCatPos, setDrawerCatPos] = useState(null)

  const apiParams = {
    product_category: filters.product_category || null,
    product:   filters.product?.length ? filters.product : [],
    date_from: filters.date_from,
    date_to:   filters.date_to,
  }

  const load = useCallback(() => {
    if (!allProducts?.length) return
    setLoading(true)
    Promise.all([
      fetchAnalysis(apiParams),
      fetchSummary(apiParams),
    ])
      .then(([analysis, summary]) => {
        setData(analysis)
        setSummaryRows(summary || [])
        setHasData(true)
      })
      .finally(() => setLoading(false))
  }, [JSON.stringify(apiParams), allProducts?.length])

  useEffect(() => { load() }, [load])

  if (loading && !hasData) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200, color:'var(--text-muted)', gap:10 }}>
      <span style={{ fontSize:20 }}>⟳</span> Loading overview…
    </div>
  )

  const kpi     = data?.kpi || {}
  const trend   = data?.daily_trend || []
  const negPie  = data?.neg_pie || []
  const posPie  = data?.pos_pie || []
  const negPct  = kpi.total ? +((kpi.negative/kpi.total)*100).toFixed(1) : 0
  const posPct  = kpi.total ? +((kpi.positive/kpi.total)*100).toFixed(1) : 0

  // Build product summary from pie data for health cards
  // (re-use neg_pie + pos_pie totals; real per-product data comes from /api/summary)
  // We pass a minimal shape to ProductHealthGrid from what /api/analysis returns
  const productSummaryFromTrend = [] // populated by per-product breakdown if available

  // For rolling neg rate on trend
  const trendWithRolling = trend.map((pt, i, arr) => {
    const window = arr.slice(Math.max(0,i-6), i+1)
    const total = window.reduce((s,w)=>s+(w.Positive+w.Negative+w.Neutral),0)
    const neg   = window.reduce((s,w)=>s+w.Negative,0)
    return { ...pt, rolling_neg: total ? +(neg/total*100).toFixed(1) : 0, neg_rate: pt.Negative ? +(pt.Negative/(pt.Positive+pt.Negative+pt.Neutral)*100).toFixed(1) : 0 }
  })

  // Autoscale Y for rate chart — compute outside JSX so no IIFE needed
  const rateVals = trendWithRolling.map(d => d.rolling_neg).filter(v => v > 0)
  const rateMin  = rateVals.length ? Math.max(0, Math.floor(Math.min(...rateVals) / 5) * 5 - 5) : 0
  const rateMax  = rateVals.length ? Math.min(100, Math.ceil(Math.max(...rateVals) / 5) * 5 + 10) : 100

  const SC = { Positive:'#22c55e', Negative:'#ef4444', Neutral:'#eab308' }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>

      {/* 1. Alert banner */}
      <AlertBanner kpi={kpi} negPie={negPie} products={summaryRows} />

      {/* 2. KPI tiles */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        <KpiTile label="Feedback Volume" value={kpi.total?.toLocaleString()} color="#60a5fa"
          sub={`${allProducts?.length||0} product${allProducts?.length!==1?'s':''} · selected period`}
          tip="Total scraped reviews inside the selected date range. This is the size of the voice-of-customer sample behind the dashboard." />
        <KpiTile label="Customers Reporting Problems" value={`${negPct}%`}
          color={negPct>50?'#ef4444':negPct>30?'#f97316':'#22c55e'}
          sub={<span><strong style={{color:'#ef4444'}}>{kpi.negative?.toLocaleString()}</strong> reviews · {negPct>50?'🔴 Needs immediate action':negPct>30?'⚠️ Watch closely':'✅ In control'}</span>}
          tip="Share of reviews the model classified as Negative. This is the clearest early warning signal for customer pain in the selected period." />
        <KpiTile label="Customers Delighted" value={`${posPct}%`}
          color="#22c55e"
          sub={<span><strong style={{color:'#22c55e'}}>{kpi.positive?.toLocaleString()}</strong> reviews · {posPct>60?'✅ Strong brand equity':'⚠️ Room to improve'}</span>}
          tip="Share of reviews classified as Positive. This helps identify what the brand should protect while fixing the negatives." />
        <KpiTile label="Undecided / Neutral" value={`${kpi.total?((kpi.neutral/kpi.total)*100).toFixed(1):0}%`}
          color="#eab308"
          sub={<span><strong style={{color:'#eab308'}}>{kpi.neutral?.toLocaleString()}</strong> reviews · not strongly positive or negative</span>}
          tip="Neutral reviews usually reflect acceptable but unremarkable experiences. A large share here can mean customers are not yet impressed." />
      </div>

      {/* 3. Executive priorities */}
      <PriorityStrip kpi={kpi} negPie={negPie} posPie={posPie} summaryRows={summaryRows} />

      <Card
        title="Amazon Rating Signal"
        tip="This is the external market-facing rating view. It uses Amazon product-page rating snapshots over time, alongside scraped daily review averages and total rating count. Use this in Overview because it shows how public product perception is moving beyond just the current filtered review slice."
        sub="Public Amazon rating trend first · filtered review-period ratings live in Trends"
      >
        <RatingTrendChart filters={filters} allProducts={allProducts} tree={tree} />
      </Card>

      {/* 4. Burning issues — what to fix RIGHT NOW */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <Card
          title="🔴 What Needs Attention"
          tip="Issue areas driving the most negative reviews, ranked by volume. This is the action queue for leadership: what is hurting customer experience most right now. Click a row to see the sub-topics, then click a word to read the underlying reviews."
          sub="Prioritized by negative review volume"
        >
          <BurningIssues negPie={negPie} activeCat={drawerCat} onRowClick={cat => setDrawerCat(drawerCat === cat ? null : cat)} filters={filters} allProducts={allProducts} />
        </Card>

        <Card
          title="✅ What We Must Protect"
          tip="Categories appearing most in positive reviews. These are the strengths customers consistently value, and they should be preserved while teams fix pain points. Click a row to see the sub-topics, then click a word to read the underlying reviews."
          sub="Highest positive review concentration"
        >
          <BurningIssues negPie={posPie.map(p=>({...p}))} activeCat={drawerCatPos} onRowClick={cat => setDrawerCatPos(drawerCatPos === cat ? null : cat)} filters={filters} allProducts={allProducts} />
        </Card>
      </div>

      {/* 5. Sentiment trend — compact with toggle */}
      <Card
        title="Customer Signal Over Time"
        tip="Volume mode shows how many positive, negative, and neutral reviews came in each day. Neg Rate mode shows the rolling problem rate, which is the cleaner executive signal because it smooths out daily noise. Use Volume to understand scale and Neg Rate to understand pressure."
        sub="Volume shows scale · Neg Rate shows sustained pressure"
        controls={<Toggle value={trendMode} onChange={setTrendMode} options={[{v:'rate',l:'Neg Rate %'},{v:'volume',l:'Volume'}]} />}
      >
        {trend.length === 0 ? (
          <div style={{ padding:'24px 0', textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>
            No trend data — review dates may not be parsed correctly yet.
          </div>
        ) : trendMode === 'rate' ? (
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={trendWithRolling} margin={{ top:8, right:40, bottom:0, left:-10 }}>
              <defs>
                <linearGradient id="negGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill:'var(--text-muted)', fontSize:10 }} tickLine={false} axisLine={false} tickFormatter={fmtDay} />
              <YAxis domain={[rateMin, rateMax]} tick={{ fill:'var(--text-muted)', fontSize:10 }} tickLine={false} axisLine={false} tickFormatter={v=>`${v}%`} width={36} />
              <Tooltip content={<RateTip />} />
              {rateMax >= 30 && <ReferenceLine y={30} stroke="#eab308" strokeDasharray="4 2" strokeOpacity={0.5} label={{ value:'⚠ 30%', fill:'#eab308', fontSize:10, position:'insideRight' }} />}
              {rateMax >= 50 && <ReferenceLine y={50} stroke="#ef4444" strokeDasharray="4 2" strokeOpacity={0.5} label={{ value:'🔴 50%', fill:'#ef4444', fontSize:10, position:'insideRight' }} />}
              <Bar dataKey="neg_rate" fill="#ef4444" opacity={0.12} name="Daily Neg %" radius={[2,2,0,0]} barSize={6} />
              <Area type="monotone" dataKey="rolling_neg" stroke="#ff4e1a" strokeWidth={2.5} fill="url(#negGrad)" dot={false} activeDot={{ r:5, fill:'#ff4e1a', stroke:'#fff', strokeWidth:2 }} name="7d Rolling" />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={trend} margin={{ top:8, right:8, bottom:0, left:-10 }}>
              <defs>
                {Object.entries(SC).map(([s,c]) => (
                  <linearGradient key={s} id={`ov-${s}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={c} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={c} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill:'var(--text-muted)', fontSize:10 }} tickLine={false} axisLine={false} tickFormatter={fmtDay} />
              <YAxis tick={{ fill:'var(--text-muted)', fontSize:10 }} tickLine={false} axisLine={false} width={36} />
              <Tooltip content={<VolumeTip />} />
              {['Negative','Positive','Neutral'].map(s => (
                <Area key={s} type="monotone" dataKey={s} stroke={SC[s]} strokeWidth={2}
                  fill={`url(#ov-${s})`} dot={false} activeDot={{ r:4, stroke:'#fff', strokeWidth:1.5 }} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

    </div>
  )
}
