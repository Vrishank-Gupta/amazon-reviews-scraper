/**
 * PRODUCTS TAB  — per-product deep dive
 *
 * Layout:
 *  1. Sortable product table with health scores + deltas
 *  2. Expanded row → AI brief (issues + what customers love)
 *  3. Drill-down panel (appears below selected product):
 *     - Category breakdown pies (neg + pos)
 *     - Keyword cloud → click word → read actual reviews
 *
 * This is the "go from hunch to evidence" tab.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer
} from 'recharts'
import { fetchSummary, fetchReviewsByKeyword } from '../api'
import { InfoTip, StarLabel, Delta, SentBadge, Card } from './shared'

const PIE_NEG = ['#ef4444','#f97316','#fbbf24','#a855f7','#e879f9','#f43f5e','#94a3b8','#64748b']
const PIE_POS = ['#22c55e','#14b8a6','#60a5fa','#a78bfa','#34d399','#38bdf8','#94a3b8','#64748b']

// ── Helpers ───────────────────────────────────────────────────────────────────
function NegBar({ pct }) {
  const color = pct>50?'#ef4444':pct>30?'#eab308':'#22c55e'
  return (
    <div>
      <span style={{ color, fontWeight:700, fontSize:13 }}>{pct}%</span>
      <div style={{ height:3, width:64, background:'var(--border)', borderRadius:2, marginTop:3 }}>
        <div style={{ height:'100%', width:`${Math.min(pct,100)}%`, background:color, borderRadius:2 }} />
      </div>
    </div>
  )
}

function HealthBadge({ negPct }) {
  const h = Math.max(0, 100 - negPct)
  const color = h>=75?'#22c55e':h>=60?'#eab308':'#ef4444'
  const label = h>=75?'Good':h>=60?'Watch':'Act Now'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:7 }}>
      <div style={{ fontFamily:'Bebas Neue', fontSize:22, lineHeight:1, color }}>{Math.round(h)}</div>
      <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
        <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.1em', color, background:`${color}15`, border:`1px solid ${color}35`, borderRadius:3, padding:'1px 5px', width:'fit-content', textTransform:'uppercase' }}>{label}</div>
        <div style={{ width:44, height:3, background:'var(--border)', borderRadius:2 }}>
          <div style={{ height:'100%', width:`${h}%`, background:color, borderRadius:2 }} />
        </div>
      </div>
    </div>
  )
}

// ── AI Brief ──────────────────────────────────────────────────────────────────
function AiBrief({ row }) {
  const hasData = row.ai_issues?.length || row.ai_positives?.length
  if (!hasData) return null
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'#ef4444', marginBottom:2 }}>🔴 Top Issues</div>
        {row.ai_issues.map((p,i) => (
          <div key={i} style={{ fontSize:12, color:'var(--text)', display:'flex', gap:7, lineHeight:1.55, padding:'6px 8px', background:'rgba(239,68,68,0.06)', borderRadius:6, borderLeft:'2px solid rgba(239,68,68,0.3)' }}>
            <span style={{ color:'#ef4444', flexShrink:0, fontWeight:700 }}>{i+1}.</span>{p}
          </div>
        ))}
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'#22c55e', marginBottom:2 }}>✅ What Customers Love</div>
        {row.ai_positives.map((p,i) => (
          <div key={i} style={{ fontSize:12, color:'var(--text)', display:'flex', gap:7, lineHeight:1.55, padding:'6px 8px', background:'rgba(34,197,94,0.06)', borderRadius:6, borderLeft:'2px solid rgba(34,197,94,0.3)' }}>
            <span style={{ color:'#22c55e', flexShrink:0, fontWeight:700 }}>{i+1}.</span>{p}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Review card ───────────────────────────────────────────────────────────────
function ReviewCard({ r }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ padding:'11px 14px', borderBottom:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:5 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
        <SentBadge s={r.sentiment} />
        <StarLabel rating={r.rating} />
        <span style={{ fontSize:11, color:'var(--text-muted)', marginLeft:'auto' }}>{r.review_date?.replace('Reviewed in India on ','')}</span>
      </div>
      {r.title && <div style={{ fontSize:12, fontWeight:600 }}>{r.title}</div>}
      <div style={{ fontSize:12, color:'var(--text)', lineHeight:1.5, overflow:'hidden', display:open?'block':'-webkit-box', WebkitLineClamp:3, WebkitBoxOrient:'vertical' }}>
        {r.review}
      </div>
      {r.review?.length > 200 && (
        <button onClick={() => setOpen(o=>!o)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--accent)', fontSize:11, padding:0, textAlign:'left', fontFamily:'DM Sans' }}>
          {open ? 'Show less ▲' : 'Read full review ▼'}
        </button>
      )}
    </div>
  )
}

// ── Keyword cloud ─────────────────────────────────────────────────────────────
function WordCloud({ words, filters, onWordClick, activeWord }) {
  if (!words?.length) return (
    <div style={{ padding:'18px 0', textAlign:'center', color:'var(--text-muted)', fontSize:12 }}>
      No sub-tags — click a pie slice to filter
    </div>
  )
  const max = Math.max(...words.map(w=>w.count))
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:'6px 12px', alignItems:'center', justifyContent:'center', padding:'16px', background:'var(--surface)', borderRadius:10, border:'1px solid var(--border)', minHeight:80 }}>
      {words.map(w => {
        const size = Math.round(11 + (w.count/max)*26)
        const nr = w.neg_ratio||0
        const color = nr>0.6?'#ef4444':nr>0.4?'#f97316':nr>0.2?'#eab308':'#22c55e'
        const isActive = activeWord===w.word
        return (
          <button key={w.word} onClick={() => onWordClick(isActive?null:w.word)} style={{
            background:isActive?'rgba(255,78,26,0.12)':'none',
            border:isActive?'1px solid rgba(255,78,26,0.4)':'1px solid transparent',
            borderRadius:4, padding:'2px 6px', cursor:'pointer',
            fontFamily:'DM Sans', fontSize:size, color,
            fontWeight:size>24?700:size>18?600:500,
            opacity:activeWord&&!isActive?0.25:1, transition:'all 0.15s',
          }}>{w.word}</button>
        )
      })}
    </div>
  )
}

// ── Drill-down panel ──────────────────────────────────────────────────────────
function DrillDown({ row, filters }) {
  const [wcData, setWcData]       = useState([])
  const [wcLoading, setWcLoading] = useState(false)
  const [wcCat, setWcCat]         = useState(null)
  const [wcSent, setWcSent]       = useState(null)
  const [activeWord, setActiveWord] = useState(null)
  const [reviews, setReviews]     = useState([])
  const [revLoading, setRevLoading] = useState(false)
  const [negPieData, setNegPieData] = useState([])
  const [posPieData, setPosPieData] = useState([])

  const apiProduct = row.asin  // filter wordcloud by this product's ASIN name
  const productFilter = { ...filters, product: [row.product_name] }

  useEffect(() => {
    setWcCat(null); setActiveWord(null); setReviews([])
    // Fetch analysis data for this specific product to get pies
    const p = new URLSearchParams()
    p.set('product', row.product_name)
    if (filters.date_from) p.set('date_from', filters.date_from)
    if (filters.date_to)   p.set('date_to',   filters.date_to)
    fetch(`/api/analysis?${p}`)
      .then(r=>r.json())
      .then(d => { setNegPieData(d.neg_pie||[]); setPosPieData(d.pos_pie||[]) })
      .catch(()=>{})
  }, [row.asin, filters.date_from, filters.date_to])

  useEffect(() => {
    setWcLoading(true); setActiveWord(null); setReviews([])
    const p = new URLSearchParams()
    p.set('product', row.product_name)
    if (filters.date_from) p.set('date_from', filters.date_from)
    if (filters.date_to)   p.set('date_to',   filters.date_to)
    if (wcCat) p.set('category', wcCat)
    fetch(`/api/wordcloud?${p}`)
      .then(r=>r.json()).then(setWcData).catch(()=>setWcData([])).finally(()=>setWcLoading(false))
  }, [row.product_name, wcCat, filters.date_from, filters.date_to])

  useEffect(() => {
    if (!activeWord) { setReviews([]); return }
    setRevLoading(true)
    const p = new URLSearchParams({ keyword: activeWord, product: row.product_name })
    if (filters.date_from) p.set('date_from', filters.date_from)
    if (filters.date_to)   p.set('date_to',   filters.date_to)
    fetch(`/api/reviews/by-keyword?${p}`)
      .then(r=>r.json())
      .then(data => {
        const f = wcSent==='neg' ? data.filter(r=>r.sentiment==='Negative')
          : wcSent==='pos' ? data.filter(r=>r.sentiment!=='Negative') : data
        setReviews(f)
      })
      .catch(()=>setReviews([]))
      .finally(()=>setRevLoading(false))
  }, [activeWord, wcSent, row.product_name])

  const handlePieClick = (entry, sentiment) => {
    const cat = entry?.name||entry?.category
    if (!cat) return
    if (wcCat===cat && wcSent===sentiment) { setWcCat(null); setWcSent(null) }
    else { setWcCat(cat); setWcSent(sentiment) }
  }

  const PieTip = ({ active, payload }) => {
    if (!active||!payload?.length) return null
    return (
      <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', fontSize:12 }}>
        <div style={{ fontWeight:700 }}>{payload[0].name}</div>
        <div style={{ color:'var(--text-muted)' }}>{payload[0].value} reviews</div>
      </div>
    )
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16, padding:'16px 18px', background:'var(--surface2)', borderTop:'1px solid var(--border)' }}>

      {(row.ai_issues?.length || row.ai_positives?.length) ? (
        <div>
          <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:10, display:'flex', alignItems:'center', gap:6 }}>
            ✦ AI Analysis
            <span style={{ background:'rgba(96,165,250,0.1)', border:'1px solid rgba(96,165,250,0.25)', color:'#60a5fa', borderRadius:4, padding:'1px 7px', fontSize:9 }}>GPT-4o-mini</span>
            {row.ai_generated_at && <span style={{ fontWeight:400 }}>· {new Date(row.ai_generated_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span>}
          </div>
          <AiBrief row={row} />
        </div>
      ) : null}

      {/* Pies */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        {[
          { title:'Negative by Category', data:negPieData, colors:PIE_NEG, sent:'neg' },
          { title:'Positive by Category', data:posPieData, colors:PIE_POS, sent:'pos' },
        ].map(({ title, data:pd, colors, sent }) => (
          <div key={sent} style={{ background:'var(--surface)', border:`1px solid ${wcCat&&wcSent===sent?'rgba(255,78,26,0.4)':'var(--border)'}`, borderRadius:10, padding:'14px 16px' }}>
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:sent==='neg'?'#ef4444':'#22c55e', marginBottom:8 }}>{title}</div>
            {!pd.length ? (
              <div style={{ padding:'12px 0', textAlign:'center', color:'var(--text-muted)', fontSize:12 }}>No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie data={pd} dataKey="count" nameKey="category"
                    cx="40%" cy="50%" outerRadius={62} innerRadius={30}
                    cursor="pointer" onClick={e=>handlePieClick(e,sent)} stroke="none">
                    {pd.map((e,i) => (
                      <Cell key={i} fill={colors[i%colors.length]}
                        opacity={wcCat===e.category&&wcSent===sent?1:wcCat?0.35:1} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTip />} />
                  <Legend layout="vertical" align="right" verticalAlign="middle"
                    formatter={v=><span style={{ fontSize:10, color:'var(--text-muted)', cursor:'pointer' }}>{v}</span>}
                    onClick={e=>handlePieClick({name:e.value},sent)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        ))}
      </div>

      {/* Keyword cloud */}
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:7 }}>
            <span style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-muted)' }}>Keyword Cloud</span>
            <InfoTip text="Sub-tags sized by volume, coloured by sentiment (red=negative, green=positive). Click a word to read the actual reviews mentioning it." />
            {wcCat && (
              <span style={{ fontSize:10, background:'rgba(255,78,26,0.1)', border:'1px solid rgba(255,78,26,0.3)', color:'var(--accent)', borderRadius:4, padding:'1px 8px', display:'flex', alignItems:'center', gap:4 }}>
                {wcCat}
                <button onClick={()=>{setWcCat(null);setWcSent(null)}} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:13, lineHeight:1, padding:0 }}>✕</button>
              </span>
            )}
          </div>
          {activeWord && (
            <button onClick={()=>{setActiveWord(null);setReviews([])}} style={{ background:'none', border:'1px solid var(--border)', borderRadius:5, color:'var(--text-muted)', fontSize:11, padding:'3px 9px', cursor:'pointer', fontFamily:'DM Sans' }}>
              Clear ✕
            </button>
          )}
        </div>
        {wcLoading ? (
          <div style={{ padding:'16px 0', textAlign:'center', color:'var(--text-muted)', fontSize:12 }}>Loading…</div>
        ) : (
          <WordCloud words={wcData} filters={productFilter} activeWord={activeWord} onWordClick={w=>{setActiveWord(w)}} />
        )}
        {!wcCat && !activeWord && (
          <div style={{ fontSize:11, color:'var(--text-muted)', textAlign:'center', fontStyle:'italic' }}>
            Click a pie slice to filter by category · then click a word to read reviews
          </div>
        )}
        {wcCat && !activeWord && (
          <div style={{ fontSize:11, color:'var(--text-muted)', textAlign:'center', fontStyle:'italic' }}>
            Now click a word to read the reviews ↓
          </div>
        )}
      </div>

      {/* Reviews */}
      {activeWord && (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
          <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', background:'var(--surface2)', display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontFamily:'Bebas Neue', fontSize:14, letterSpacing:'0.06em', color:'var(--text-muted)' }}>
              Reviews — <span style={{ color:'var(--accent)' }}>{activeWord}</span>
            </span>
            {!revLoading && (
              <span style={{ background:'rgba(255,78,26,0.15)', color:'var(--accent)', border:'1px solid rgba(255,78,26,0.3)', borderRadius:10, padding:'1px 8px', fontSize:11, fontWeight:600 }}>
                {reviews.length}
              </span>
            )}
          </div>
          {revLoading ? (
            <div style={{ padding:20, textAlign:'center', color:'var(--text-muted)', fontSize:12 }}>Loading…</div>
          ) : reviews.length === 0 ? (
            <div style={{ padding:20, textAlign:'center', color:'var(--text-muted)', fontSize:12 }}>No reviews found.</div>
          ) : (
            <div style={{ maxHeight:320, overflowY:'auto' }}>
              {reviews.map((r,i) => <ReviewCard key={r.review_id||i} r={r} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── TH ────────────────────────────────────────────────────────────────────────
function TH({ children, tip, onClick, sortDir }) {
  return (
    <th onClick={onClick} style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-muted)', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap', background:'var(--surface2)', cursor:onClick?'pointer':'default', userSelect:'none' }}>
      <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
        {children}
        {onClick && <span style={{ opacity:0.5, fontSize:9 }}>{sortDir != null ? (sortDir > 0 ? '↑' : '↓') : '↕'}</span>}
        {tip && <InfoTip text={tip} />}
      </span>
    </th>
  )
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export default function SummaryPage({ filters, allProducts }) {
  const [rows, setRows]     = useState([])
  const [loading, setLoading] = useState(true)
  const [hasData, setHasData] = useState(false)
  const [drillRow, setDrillRow] = useState(null) // expanded product
  const [sortKey, setSortKey]   = useState('review_count')
  const [sortDir, setSortDir]   = useState(-1)

  const apiParams = {
    product:   filters.product?.length ? filters.product : allProducts,
    date_from: filters.date_from,
    date_to:   filters.date_to,
  }

  const load = useCallback(() => {
    if (!allProducts?.length) return
    setLoading(true)
    fetchSummary(apiParams).then(r => { setRows(r); setHasData(true) }).finally(() => setLoading(false))
  }, [JSON.stringify(apiParams), allProducts?.length])

  useEffect(() => { load() }, [load])

  const handleSort = key => {
    if (sortKey===key) setSortDir(d => -d)
    else { setSortKey(key); setSortDir(-1) }
  }

  const sorted = [...rows].sort((a,b) => {
    const av = a[sortKey]??0, bv = b[sortKey]??0
    return typeof av==='string' ? av.localeCompare(bv)*sortDir : (av-bv)*sortDir
  })

  // Portfolio summary row
  const totalReviews = rows.reduce((s,r)=>s+r.review_count,0)
  const avgNeg = rows.length ? +(rows.reduce((s,r)=>s+r.neg_pct,0)/rows.length).toFixed(1) : 0
  const worst  = [...rows].sort((a,b)=>b.neg_pct-a.neg_pct)[0]
  const best   = [...rows].sort((a,b)=>a.neg_pct-b.neg_pct)[0]

  if (loading && !hasData) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200, color:'var(--text-muted)', gap:10 }}>
      <span style={{ fontSize:20 }}>⟳</span> Loading products…
    </div>
  )
  if (!rows.length) return (
    <div style={{ padding:32, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>No data for selected filters.</div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

      {/* Portfolio strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
        {[
          { label:'Portfolio Neg Rate', value:`${avgNeg}%`, color:avgNeg>50?'#ef4444':avgNeg>30?'#f97316':'#22c55e',
            sub:`Avg across ${rows.length} products`,
            tip:'Average negative rate across all products in the filter. A portfolio-level health signal.' },
          { label:'Total Reviews', value:totalReviews.toLocaleString(), color:'#60a5fa',
            sub:'In selected period',
            tip:'Total reviews for all selected products in the date range.' },
          { label:'Needs Attention', value:worst?.product_name?.split(' ').slice(0,2).join(' '), color:'#ef4444',
            sub:`${worst?.neg_pct}% neg rate · click to drill down`,
            tip:'Worst performing product by negative rate. Click its row in the table to investigate.' },
          { label:'Best Performer', value:best?.product_name?.split(' ').slice(0,2).join(' '), color:'#22c55e',
            sub:`${best?.neg_pct}% neg rate`,
            tip:'Best performing product by negative rate. Study what it does right.' },
        ].map(({ label, value, color, sub, tip }) => (
          <div key={label} style={{ background:'var(--surface)', border:`1px solid ${color}25`, borderRadius:10, padding:'12px 14px', display:'flex', flexDirection:'column', gap:4, borderLeft:`3px solid ${color}` }}>
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <span style={{ fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-muted)' }}>{label}</span>
              <InfoTip text={tip} />
            </div>
            <div style={{ fontFamily:'Bebas Neue', fontSize:22, lineHeight:1.1, color }}>{value||'—'}</div>
            <div style={{ fontSize:10, color:'var(--text-muted)' }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)', background:'var(--surface2)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:7 }}>
              <span style={{ fontFamily:'Bebas Neue', fontSize:17, letterSpacing:'0.06em', color:'var(--text-muted)' }}>Product Breakdown</span>
              <InfoTip text="Per-product metrics vs prior equivalent period. Click a row to expand: AI brief + category pies + keyword cloud + actual reviews. Sort by any column." />
            </div>
            <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>
              Click any row to expand → AI brief + issue categories + keyword drill-down + reviews
            </div>
          </div>
          <div style={{ fontSize:11, color:'var(--text-muted)', display:'flex', gap:10 }}>
            <span><span style={{ color:'#ef4444', fontWeight:700 }}>↑ red</span> = worse vs prior period</span>
            <span><span style={{ color:'#22c55e', fontWeight:700 }}>↓ green</span> = improved</span>
          </div>
        </div>

        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                <TH onClick={()=>handleSort('product_name')} sortDir={sortKey==='product_name'?sortDir:null}
                  tip="Product name">Product</TH>
                <TH tip="Amazon ASIN">ASIN</TH>
                <TH onClick={()=>handleSort('avg_rating')} sortDir={sortKey==='avg_rating'?sortDir:null}
                  tip="Average star rating (1–5) in current period">Avg Rating</TH>
                <TH tip="Rating change vs prior period. Lower is worse (red ↑ means rating dropped)">Δ Rating</TH>
                <TH onClick={()=>handleSort('review_count')} sortDir={sortKey==='review_count'?sortDir:null}
                  tip="Total reviews in current period">Reviews</TH>
                <TH tip="Review count change vs prior period">Δ Reviews</TH>
                <TH onClick={()=>handleSort('neg_pct')} sortDir={sortKey==='neg_pct'?sortDir:null}
                  tip="% of reviews tagged Negative. Under 20% good. 30%+ needs action. 50%+ crisis.">Neg %</TH>
                <TH tip="Neg rate change vs prior period. Red ↑ is worsening.">Δ Neg %</TH>
                <TH tip="Health = 100 minus neg rate. Good ≥75, Watch 60–75, Act Now below 60">Health</TH>
                <TH></TH>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => {
                const isDrill = drillRow?.asin === row.asin
                const rowBg = i%2===0?'var(--surface)':'var(--surface2)'
                return (
                  <>
                    <tr key={row.asin}
                      onClick={() => setDrillRow(isDrill ? null : row)}
                      style={{ cursor:'pointer', background:isDrill?'rgba(255,78,26,0.05)':rowBg, transition:'background 0.1s', borderLeft:isDrill?'3px solid var(--accent)':'3px solid transparent' }}
                      onMouseEnter={e => e.currentTarget.style.background='rgba(255,78,26,0.04)'}
                      onMouseLeave={e => e.currentTarget.style.background=isDrill?'rgba(255,78,26,0.05)':rowBg}
                    >
                      <td style={{ padding:'12px 14px', fontSize:13, fontWeight:600, borderBottom:isDrill?'none':'1px solid var(--border)', maxWidth:170, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {row.product_name||row.asin}
                      </td>
                      <td style={{ padding:'12px 14px', fontSize:11, color:'var(--text-muted)', borderBottom:isDrill?'none':'1px solid var(--border)', whiteSpace:'nowrap' }}>{row.asin}</td>
                      <td style={{ padding:'12px 14px', borderBottom:isDrill?'none':'1px solid var(--border)' }}>
                        <StarLabel rating={row.avg_rating} />
                        <div style={{ height:3, background:'var(--border)', borderRadius:2, marginTop:4, width:64 }}>
                          <div style={{ height:'100%', borderRadius:2, background:'linear-gradient(90deg,var(--accent),var(--accent2))', width:`${(row.avg_rating/5)*100}%` }} />
                        </div>
                      </td>
                      <td style={{ padding:'12px 14px', borderBottom:isDrill?'none':'1px solid var(--border)' }}><Delta val={row.delta_rating} /></td>
                      <td style={{ padding:'12px 14px', fontSize:13, fontWeight:700, borderBottom:isDrill?'none':'1px solid var(--border)' }}>{row.review_count?.toLocaleString()}</td>
                      <td style={{ padding:'12px 14px', borderBottom:isDrill?'none':'1px solid var(--border)' }}><Delta val={row.delta_reviews} /></td>
                      <td style={{ padding:'12px 14px', borderBottom:isDrill?'none':'1px solid var(--border)' }}><NegBar pct={row.neg_pct} /></td>
                      <td style={{ padding:'12px 14px', borderBottom:isDrill?'none':'1px solid var(--border)' }}><Delta val={row.delta_neg_pct} invertColor /></td>
                      <td style={{ padding:'12px 14px', borderBottom:isDrill?'none':'1px solid var(--border)' }}><HealthBadge negPct={row.neg_pct} /></td>
                      <td style={{ padding:'12px 14px', color:'var(--accent)', fontSize:12, borderBottom:isDrill?'none':'1px solid var(--border)', fontWeight:700 }}>
                        {isDrill ? '▲ collapse' : '▼ drill down'}
                      </td>
                    </tr>
                    {isDrill && (
                      <tr key={`drill-${row.asin}`}>
                        <td colSpan={10} style={{ padding:0, borderBottom:'1px solid var(--border)' }}>
                          <DrillDown row={row} filters={apiParams} />
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>


    </div>
  )
}