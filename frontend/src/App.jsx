import { useState, useEffect, useCallback } from 'react'
import { fetchReviews, fetchFilters, fetchStats } from './api'
import { downloadCSV } from './components/TrendsPage'
import Sidebar from './components/Sidebar'
import StatCard from './components/StatCard'
import ReviewsTable from './components/ReviewsTable'
import TrendsPage from './components/TrendsPage'
import { CategoryBar, SentimentPie, RatingBar } from './components/Charts'
import { Loader2, RefreshCw, Download, BarChart2, LayoutDashboard } from 'lucide-react'

const DEFAULT_FILTERS = {
  category: 'All',
  sentiment: ['Negative'],
  rating: [],
  product: [],
}

function Section({ title, children, delay = '', headerRight }) {
  return (
    <div className={`fade-up ${delay}`} style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '20px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{
          margin: 0,
          fontFamily: 'Bebas Neue',
          fontSize: 20,
          letterSpacing: '0.06em',
          color: 'var(--text-muted)',
        }}>
          {title}
        </h3>
        {headerRight}
      </div>
      {children}
    </div>
  )
}

function TabBtn({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '8px 18px',
        borderRadius: 8,
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        background: active ? 'var(--accent)18' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        fontFamily: 'Bebas Neue',
        fontSize: 15,
        letterSpacing: '0.08em',
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      <Icon size={14} />
      {label}
    </button>
  )
}

export default function App() {
  const [tab, setTab] = useState('overview')
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

  const negCount = reviews.filter(r => r.sentiment === 'Negative').length
  const uniqueCats = new Set(reviews.flatMap(r => r.primary_categories || [])).size

  const categoryBarData = (() => {
    const counts = {}
    reviews.forEach(r => (r.primary_categories || []).forEach(c => {
      counts[c] = (counts[c] || 0) + 1
    }))
    return Object.entries(counts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  })()

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <Sidebar filters={filters} options={options} onChange={handleFilterChange} />

      <main style={{ flex: 1, padding: '32px 28px', display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>

        {/* Header */}
        <div className="fade-up" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 52, lineHeight: 1, color: 'var(--text)' }}>
              CUSTOMER<br />
              <span style={{ color: 'var(--accent)' }}>INTELLIGENCE</span>
            </h1>
            <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
              Amazon review analytics · Voice of Customer
            </p>
          </div>
          <button
            onClick={() => loadReviews(filters)}
            disabled={refreshing}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text-muted)',
              fontSize: 12, cursor: refreshing ? 'not-allowed' : 'pointer',
              fontFamily: 'DM Sans',
            }}
          >
            <RefreshCw size={13} className={refreshing ? 'spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Tab bar */}
        <div className="fade-up delay-1" style={{ display: 'flex', gap: 10 }}>
          <TabBtn active={tab === 'overview'} onClick={() => setTab('overview')} icon={LayoutDashboard} label="Overview" />
          <TabBtn active={tab === 'trends'} onClick={() => setTab('trends')} icon={BarChart2} label="Trends & Analytics" />
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12, color: 'var(--text-muted)' }}>
            <Loader2 size={24} className="spin" />
            <span>Loading reviews...</span>
          </div>
        ) : tab === 'overview' ? (
          <>
            {/* KPI cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              <StatCard label="Total Reviews" value={reviews.length.toLocaleString()} delay="delay-1" />
              <StatCard label="Negative Reviews" value={negCount.toLocaleString()} accent="var(--red)" delay="delay-2" />
              <StatCard label="Unique Categories" value={uniqueCats} accent="var(--accent)" delay="delay-3" />
            </div>

            {/* Charts row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <Section title="Issues by Category" delay="delay-1">
                <CategoryBar data={categoryBarData} />
              </Section>
              <Section title="Sentiment Split" delay="delay-2">
                <SentimentPie data={stats?.sentiment_counts || []} />
              </Section>
              <Section title="Rating Distribution" delay="delay-3">
                <RatingBar data={stats?.rating_dist || []} />
              </Section>
            </div>

            {/* Reviews table with CSV download */}
            <Section
              title={`Tagged Reviews  (${reviews.length})`}
              delay="delay-4"
              headerRight={
                <button
                  onClick={() => downloadCSV(reviews)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 14px', borderRadius: 7,
                    border: '1px solid var(--accent)',
                    background: 'var(--accent)15',
                    color: 'var(--accent)',
                    fontFamily: 'Bebas Neue', fontSize: 14,
                    letterSpacing: '0.08em', cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--accent)30'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--accent)15'}
                >
                  <Download size={13} />
                  EXPORT CSV
                </button>
              }
            >
              <ReviewsTable data={reviews} />
            </Section>
          </>
        ) : (
          <TrendsPage products={options.products} reviews={reviews} />
        )}
      </main>
    </div>
  )
}
