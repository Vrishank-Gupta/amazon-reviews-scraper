import { useState, useEffect, useCallback } from 'react'
import { fetchReviews, fetchFilters, fetchStats } from './api'
import { downloadCSV } from './components/TrendsPage'
import Sidebar from './components/Sidebar'
import ReviewsTable from './components/ReviewsTable'
import TrendsPage from './components/TrendsPage'
import AnalysisPage from './components/AnalysisPage'
import SummaryPage from './components/SummaryPage'
import { RefreshCw, Download } from 'lucide-react'

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
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '8px 18px', borderRadius: 8,
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        background: active ? 'rgba(255,78,26,0.1)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        fontFamily: 'Bebas Neue', fontSize: 15, letterSpacing: '0.08em',
        cursor: 'pointer', transition: 'all 0.15s',
      }}
    >
      {emoji} {label}
    </button>
  )
}

export default function App() {
  const [tab, setTab] = useState('analysis')
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [reviews, setReviews] = useState([])
  const [options, setOptions] = useState({ categories: [], products: [], ratings: [] })
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetchFilters().then(o => {
      setOptions(o)
      setFilters(f => ({ ...f, product: o.products }))
    })
    fetchStats().then(setStats)
  }, [])

  const loadReviews = useCallback(async (f) => {
    setRefreshing(true)
    try {
      const data = await fetchReviews(f)
      setReviews(data)
    } finally {
      setRefreshing(false)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadReviews(filters)
  }, [filters, loadReviews])

  const handleFilterChange = (key, val) => {
    setFilters(f => ({ ...f, [key]: val }))
  }

  const sidebarFilters = { ...filters }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <Sidebar filters={filters} options={options} onChange={handleFilterChange} />

      <main style={{ flex: 1, padding: '32px 28px', display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>

        {/* Header */}
        <div className="fade-up" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 52, lineHeight: 1, color: 'var(--text)', fontFamily: 'Bebas Neue', letterSpacing: '0.02em' }}>
              CUSTOMER<br />
              <span style={{ color: 'var(--accent)' }}>INTELLIGENCE</span>
            </h1>
            <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
              Amazon review analytics · Voice of Customer · Qubo by Hero Electronix
            </p>
          </div>
          <button
            onClick={() => loadReviews(filters)}
            disabled={refreshing}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text-muted)', fontSize: 12,
              cursor: refreshing ? 'not-allowed' : 'pointer',
              fontFamily: 'DM Sans', transition: 'all 0.15s',
            }}
          >
            <RefreshCw size={13} className={refreshing ? 'spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Tab bar */}
        <div className="fade-up delay-1" style={{ display: 'flex', gap: 10 }}>
          <TabBtn active={tab === 'analysis'} onClick={() => setTab('analysis')} emoji="📊" label="Analysis" />
          <TabBtn active={tab === 'summary'} onClick={() => setTab('summary')} emoji="🧠" label="Summary" />
          <TabBtn active={tab === 'reviews'} onClick={() => setTab('reviews')} emoji="📋" label="Reviews" />
          <TabBtn active={tab === 'trends'} onClick={() => setTab('trends')} emoji="📈" label="Trends" />
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12, color: 'var(--text-muted)' }}>
            <span style={{ fontSize: 24 }}>⟳</span>
            <span>Loading…</span>
          </div>
        ) : tab === 'analysis' ? (
          <AnalysisPage filters={sidebarFilters} allProducts={options.products} />

        ) : tab === 'summary' ? (
          <SummaryPage filters={sidebarFilters} allProducts={options.products} />

        ) : tab === 'reviews' ? (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontFamily: 'Bebas Neue', fontSize: 20, letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
                Tagged Reviews ({reviews.length})
              </h3>
              <button
                onClick={() => downloadCSV(reviews)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 7,
                  border: '1px solid var(--accent)', background: 'rgba(255,78,26,0.08)', color: 'var(--accent)',
                  fontFamily: 'Bebas Neue', fontSize: 14, letterSpacing: '0.08em', cursor: 'pointer',
                }}
              >
                <Download size={13} /> EXPORT CSV
              </button>
            </div>
            <ReviewsTable data={reviews} />
          </div>

        ) : (
          <TrendsPage products={options.products} reviews={reviews} />
        )}

      </main>
    </div>
  )
}