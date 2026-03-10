import ReviewsDrawer from './ReviewsDrawer'
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
import { fetchAnalysis } from '../api'
import { InfoTip, Card } from './shared'

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

// ── Burning issues (horizontal ranked bars) ───────────────────────────────────
function BurningIssues({ negPie, onRowClick }) {
  if (!negPie?.length) return <div style={{ padding:'20px 0', textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>No data</div>
  const max = negPie[0].count
  const total = negPie.reduce((s,r)=>s+r.count,0)
  const COLS = ['#ef4444','#f97316','#fbbf24','#a855f7','#e879f9','#f43f5e','#94a3b8','#64748b']
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      {negPie.map((item, i) => {
        const pct = total > 0 ? ((item.count/total)*100).toFixed(0) : 0
        const w = ((item.count/max)*100).toFixed(1)
        const c = COLS[i % COLS.length]
        return (
          <div key={item.category}
            onClick={() => onRowClick && onRowClick(item.category)}
            style={{ display:'flex', alignItems:'center', gap:10, cursor: onRowClick ? 'pointer' : 'default',
              padding:'4px 6px', borderRadius:6, margin:'0 -6px',
              transition:'background 0.12s',
            }}
            onMouseEnter={e => onRowClick && (e.currentTarget.style.background='rgba(255,78,26,0.07)')}
            onMouseLeave={e => e.currentTarget.style.background='transparent'}
          >
            <div style={{ width:26, fontSize:10, color:'var(--text-muted)', textAlign:'right', flexShrink:0 }}>#{i+1}</div>
            <div style={{ width:130, fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flexShrink:0 }}>{item.category}</div>
            <div style={{ flex:1, height:8, background:'var(--border)', borderRadius:4, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${w}%`, background:c, borderRadius:4, opacity:0.85 }} />
            </div>
            <div style={{ width:28, fontSize:12, fontWeight:700, color:c, textAlign:'right', flexShrink:0 }}>{item.count}</div>
            <div style={{ width:36, fontSize:11, color:'var(--text-muted)', textAlign:'right', flexShrink:0 }}>{pct}%</div>
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
export default function AnalysisPage({ filters, allProducts }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [hasData, setHasData] = useState(false)
  const [trendMode, setTrendMode] = useState('rate')
  const [drawerCat, setDrawerCat] = useState(null)
  const [drawerCatPos, setDrawerCatPos] = useState(null)

  const apiParams = {
    product:   filters.product?.length ? filters.product : allProducts,
    date_from: filters.date_from,
    date_to:   filters.date_to,
  }

  const load = useCallback(() => {
    if (!allProducts?.length) return
    setLoading(true)
    fetchAnalysis(apiParams).then(d => { setData(d); setHasData(true) }).finally(() => setLoading(false))
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
      <AlertBanner kpi={kpi} negPie={negPie} products={[]} />

      {/* 2. KPI tiles */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        <KpiTile label="Total Reviews" value={kpi.total?.toLocaleString()} color="#60a5fa"
          sub={`${allProducts?.length||0} product${allProducts?.length!==1?'s':''} · selected period`}
          tip="Total reviews scraped for the selected products and date range." />
        <KpiTile label="Negative Rate" value={`${negPct}%`}
          color={negPct>50?'#ef4444':negPct>30?'#f97316':'#22c55e'}
          sub={negPct>50?'🔴 Crisis — immediate action':negPct>30?'⚠️ High — needs attention':'✅ Healthy'}
          tip="The most important single metric. Under 20% is good. 20–30% is watch territory. Over 30% needs action. Over 50% is a crisis." />
        <KpiTile label="Positive Rate" value={`${posPct}%`}
          color="#22c55e"
          sub={`${kpi.positive?.toLocaleString()} positive reviews`}
          tip="Share of reviews tagged Positive. High positive alongside high negative = polarised product (quality inconsistency)." />
        <KpiTile label="Neutral Rate" value={`${kpi.total?((kpi.neutral/kpi.total)*100).toFixed(1):0}%`}
          color="#eab308"
          sub={`${kpi.neutral?.toLocaleString()} neutral reviews`}
          tip="A large neutral share means customers are indifferent — the product meets expectations but doesn't delight or disappoint." />
      </div>

      {/* 3. Burning issues — what to fix RIGHT NOW */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <Card
          title="🔴 Top Negative Issues"
          tip="Categories driving the most negative reviews, ranked by volume. This is your R&D priority list — fixing #1 has the highest customer impact. Each bar shows count and % share of all negatives."
          sub="Fix these to move the needle most — ranked by review volume"
        >
          <BurningIssues negPie={negPie} onRowClick={cat => setDrawerCat(drawerCat === cat ? null : cat)} />
          <ReviewsDrawer category={drawerCat} label={drawerCat} filters={filters} onClose={() => setDrawerCat(null)} />
        </Card>

        <Card
          title="✅ What Customers Love"
          tip="Categories appearing most in positive and neutral reviews. Protect these during product changes — they are your brand equity. A category appearing in both pies means it's polarising."
          sub="Protect these — they are your brand equity"
        >
          <BurningIssues negPie={posPie.map(p=>({...p}))} onRowClick={cat => setDrawerCatPos(drawerCatPos === cat ? null : cat)} />
          <ReviewsDrawer category={drawerCatPos} label={drawerCatPos} filters={filters} onClose={() => setDrawerCatPos(null)} />
        </Card>
      </div>

      {/* 4. Sentiment trend — compact with toggle */}
      <Card
        title="Sentiment Trend"
        tip="Volume mode: raw count of Positive/Negative/Neutral per day. Rate mode: 7-day rolling negative rate % — the signal you should track, not daily noise. A sustained rise in the rolling rate is an early warning."
        sub="Rolling 7-day negative rate is the signal — volume is the context"
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