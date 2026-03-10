import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchReviews, fetchFilters, fetchStats } from './api'
import { downloadCSV } from './components/TrendsPage'
import FilterBar from './components/FilterBar'
import ReviewsTable from './components/ReviewsTable'
import TrendsPage from './components/TrendsPage'
import AnalysisPage from './components/AnalysisPage'
import SummaryPage from './components/SummaryPage'
import PipelineWidget from './components/PipelineWidget'
import { RefreshCw, Download, Database, X } from 'lucide-react'

const DEFAULT_FILTERS = {
  category: 'All',
  sentiment: [],
  rating: [],
  product: [],
  date_from: null,
  date_to: null,
}

function TabBtn({ active, onClick, label, emoji }) {
  return (
    <button onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:7,
      padding:'8px 18px', borderRadius:8,
      border:`1px solid ${active?'var(--accent)':'var(--border)'}`,
      background: active?'rgba(255,78,26,0.1)':'transparent',
      color: active?'var(--accent)':'var(--text-muted)',
      fontFamily:'Bebas Neue', fontSize:15, letterSpacing:'0.08em',
      cursor:'pointer', transition:'all 0.15s',
    }}>
      {emoji} {label}
    </button>
  )
}

// ── Pipeline drawer ───────────────────────────────────────────────────────────
function PipelineDrawer({ open, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose])
  if (!open) return null
  return (
    <div ref={ref} style={{
      position:'fixed', top:0, right:0, width:320, height:'100vh',
      background:'var(--surface)', borderLeft:'1px solid var(--border)',
      zIndex:300, display:'flex', flexDirection:'column',
      boxShadow:'-12px 0 40px rgba(0,0,0,0.4)',
    }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 20px', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <Database size={14} style={{ color:'var(--text-muted)' }} />
          <span style={{ fontFamily:'Bebas Neue', fontSize:18, letterSpacing:'0.06em', color:'var(--text-muted)' }}>Data Pipeline</span>
        </div>
        <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:4, display:'flex' }}>
          <X size={16} />
        </button>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:20 }}>
        <PipelineWidget />
      </div>
    </div>
  )
}

export default function App() {
  const [tab, setTab]         = useState('analysis')
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [reviews, setReviews] = useState([])
  const [options, setOptions] = useState({ categories:[], products:[], ratings:[] })
  const [initialLoading, setInitialLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [pipelineOpen, setPipelineOpen] = useState(false)

  useEffect(() => {
    fetchFilters().then(o => {
      setOptions(o)
      setFilters(f => ({ ...f, product: o.products }))
    })
    fetchStats()
  }, [])

  const loadReviews = useCallback(async (f) => {
    setRefreshing(true)
    try {
      const data = await fetchReviews(f)
      setReviews(data)
    } finally {
      setRefreshing(false)
      setInitialLoading(false)
    }
  }, [])

  useEffect(() => {
    loadReviews(filters)
  }, [filters, loadReviews])

  const handleFilterChange = (key, val) => {
    setFilters(f => ({ ...f, [key]: val }))
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', flexDirection:'column' }}>

      {/* ── Top header bar ── */}
      <header style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'0 28px', height:56,
        background:'var(--surface)', borderBottom:'1px solid var(--border)',
        position:'sticky', top:0, zIndex:100, flexShrink:0,
      }}>
        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div>
            <div style={{ fontFamily:'Bebas Neue', fontSize:22, letterSpacing:'0.08em', color:'var(--accent)', lineHeight:1 }}>VOC</div>
          </div>
          <div style={{ width:1, height:24, background:'var(--border)' }} />
          <div style={{ fontSize:12, color:'var(--text-muted)' }}>
            Amazon VOC · <span style={{ color:'var(--text)' }}>Qubo by Hero Electronix</span>
          </div>
        </div>

        {/* Right actions */}
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button onClick={() => loadReviews(filters)} disabled={refreshing} style={{
            display:'flex', alignItems:'center', gap:5,
            padding:'6px 12px', borderRadius:7, fontFamily:'DM Sans',
            border:'1px solid var(--border)', background:'transparent',
            color:'var(--text-muted)', fontSize:12, cursor:refreshing?'not-allowed':'pointer',
          }}>
            <RefreshCw size={12} className={refreshing?'spin':''} /> Refresh
          </button>
          <button onClick={() => setPipelineOpen(true)} style={{
            display:'flex', alignItems:'center', gap:5,
            padding:'6px 12px', borderRadius:7, fontFamily:'DM Sans',
            border:'1px solid var(--border)', background:'transparent',
            color:'var(--text-muted)', fontSize:12, cursor:'pointer',
          }}>
            <Database size={12} /> Pipeline
          </button>
        </div>
      </header>

      {/* ── Sticky sub-header: tabs + filters ── */}
      <div style={{
        position:'sticky', top:56, zIndex:90, flexShrink:0,
        background:'var(--bg)', borderBottom:'1px solid var(--border)',
        padding:'10px 28px', display:'flex', flexDirection:'column', gap:10,
      }}>
        <div style={{ display:'flex', gap:8 }}>
          <TabBtn active={tab==='analysis'} onClick={()=>setTab('analysis')} emoji="🎯" label="Overview" />
          <TabBtn active={tab==='summary'}  onClick={()=>setTab('summary')}  emoji="📦" label="Products" />
          <TabBtn active={tab==='reviews'}  onClick={()=>setTab('reviews')}  emoji="💬" label="Reviews"  />
          <TabBtn active={tab==='trends'}   onClick={()=>setTab('trends')}   emoji="📈" label="Trends"   />
        </div>
        <FilterBar filters={filters} options={options} onChange={handleFilterChange} tab={tab} />
        {/* Thin progress bar — shows refresh without blocking scroll */}
        <div style={{ height:2, margin:'4px -28px 0', overflow:'hidden' }}>
          {refreshing && (
            <div style={{ height:'100%', background:'var(--accent)', width:'30%', borderRadius:1, animation:'progressSlide 1s ease-in-out infinite alternate' }} />
          )}
        </div>
      </div>

      {/* ── Main content ── */}
      <main style={{ flex:1, padding:'20px 28px', display:'flex', flexDirection:'column', gap:14, minWidth:0 }}>

        {/* Page title */}
        <div>
          <h1 style={{ margin:0, fontSize:38, lineHeight:1, color:'var(--text)', fontFamily:'Bebas Neue', letterSpacing:'0.02em' }}>
            CUSTOMER <span style={{ color:'var(--accent)' }}>INTELLIGENCE</span>
          </h1>
          <p style={{ margin:'4px 0 0', color:'var(--text-muted)', fontSize:12 }}>
            Voice of Customer · Amazon review analytics
          </p>
        </div>

        {/* Tab content */}
        {initialLoading ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flex:1, gap:12, color:'var(--text-muted)', height:200 }}>
            <span style={{ fontSize:24 }}>⟳</span><span>Loading…</span>
          </div>

        ) : tab === 'analysis' ? (
          <AnalysisPage filters={filters} allProducts={options.products} />

        ) : tab === 'summary' ? (
          <SummaryPage filters={filters} allProducts={options.products} />

        ) : tab === 'reviews' ? (
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'18px 22px', display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <h3 style={{ margin:0, fontFamily:'Bebas Neue', fontSize:18, letterSpacing:'0.06em', color:'var(--text-muted)' }}>
                Tagged Reviews <span style={{ color:'var(--accent)' }}>({reviews.length})</span>
              </h3>
              <button onClick={() => downloadCSV(reviews)} style={{
                display:'flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:7,
                border:'1px solid var(--accent)', background:'rgba(255,78,26,0.08)', color:'var(--accent)',
                fontFamily:'Bebas Neue', fontSize:13, letterSpacing:'0.08em', cursor:'pointer',
              }}>
                <Download size={12} /> EXPORT CSV
              </button>
            </div>
            <ReviewsTable data={reviews} />
          </div>

        ) : (
          <TrendsPage products={options.products} reviews={reviews} filters={filters} />
        )}
      </main>

      {/* Pipeline drawer */}
      <PipelineDrawer open={pipelineOpen} onClose={() => setPipelineOpen(false)} />
    </div>
  )
}