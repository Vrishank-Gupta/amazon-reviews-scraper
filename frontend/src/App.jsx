import { useState, useEffect, useCallback } from 'react'
import { fetchReviews, fetchFilters, fetchStats, fetchPipelineStatus } from './api'
import { downloadCSV } from './components/TrendsPage'
import FilterBar from './components/Filterbar'
import ReviewsTable from './components/ReviewsTable'
import TrendsPage from './components/TrendsPage'
import AnalysisPage from './components/Analysispage'
import SummaryPage from './components/Summarypage'
import { RefreshCw, Download, ChevronDown } from 'lucide-react'
import { SHOW_TRENDS_TAB } from './config/dashboard'

const DEFAULT_FILTERS = {
  product_category: null,
  product: [],
  sentiment: [],
  rating: [],
  date_from: null,
  date_to: null,
}

const TAB_META = {
  analysis: {
    label: 'Overview',
    emoji: 'Overview',
    eyebrow: 'Executive Brief',
    title: 'Portfolio Overview',
    subtitle: 'Start with the headline, product pressure, customer pain, and strengths worth protecting.',
  },
  trends: {
    label: 'Trends',
    emoji: 'Trends',
    eyebrow: 'Diagnostic View',
    title: 'Trend Diagnostics',
    subtitle: 'Trace problem-rate movement, issue acceleration, and rating shifts over time.',
  },
  reviews: {
    label: 'All Reviews',
    emoji: 'All Reviews',
    eyebrow: 'Evidence Layer',
    title: 'All Reviews',
    subtitle: 'Validate every signal with the underlying customer language, tags, filters, and exports.',
  },
}

function TabBtn({ active, onClick, emoji }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        padding: '9px 16px',
        borderRadius: 10,
        border: `1px solid ${active ? 'rgba(255,78,26,0.35)' : 'var(--border)'}`,
        background: active
          ? 'linear-gradient(180deg, rgba(255,78,26,0.16), rgba(255,78,26,0.06))'
          : 'rgba(255,255,255,0.02)',
        color: active ? '#ffd7ca' : 'var(--text-muted)',
        fontFamily: 'Bebas Neue',
        fontSize: 15,
        letterSpacing: '0.08em',
        cursor: 'pointer',
        transition: 'all 0.15s',
        boxShadow: active ? '0 10px 24px rgba(255,78,26,0.12)' : 'none',
      }}
    >
      {emoji}
    </button>
  )
}

function formatHeaderDate(value) {
  if (!value) return null
  try {
    return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return value
  }
}

export default function App() {
  const [tab, setTab] = useState('analysis')
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [reviews, setReviews] = useState([])
  const [options, setOptions] = useState({ tree: {}, products: [], ratings: [] })
  const [scrapeStatus, setScrapeStatus] = useState(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [scrapeMenuOpen, setScrapeMenuOpen] = useState(false)

  useEffect(() => {
    fetchFilters().then(o => {
      setOptions(o)
      setFilters(f => ({ ...f, product: [], product_category: null }))
    })
    fetchStats()
    fetchPipelineStatus().then(setScrapeStatus).catch(() => {})
  }, [])

  const loadReviews = useCallback(async f => {
    setRefreshing(true)
    try {
      const [data, status] = await Promise.all([
        fetchReviews(f),
        fetchPipelineStatus().catch(() => null),
      ])
      setReviews(data)
      if (status) setScrapeStatus(status)
      setScrapeMenuOpen(false)
    } finally {
      setRefreshing(false)
      setInitialLoading(false)
    }
  }, [])

  useEffect(() => {
    loadReviews(filters)
  }, [filters, loadReviews])

  useEffect(() => {
    if (!SHOW_TRENDS_TAB && tab === 'trends') {
      setTab('analysis')
    }
  }, [tab])

  const handleFilterChange = updates => {
    setFilters(f => ({ ...f, ...updates }))
  }

  const visibleTabs = ['analysis', 'reviews', ...(SHOW_TRENDS_TAB ? ['trends'] : [])]
  const activeTab = visibleTabs.includes(tab) ? tab : 'analysis'
  const currentTab = TAB_META[activeTab]
  const latestScrapeProducts = scrapeStatus?.last_scrape
    ? (scrapeStatus.asin_breakdown || [])
        .filter(item => item.last_scrape && item.last_scrape.slice(0, 10) === scrapeStatus.last_scrape.slice(0, 10))
        .map(item => item.product_name)
    : []
  const headerScrapeLabel = formatHeaderDate(scrapeStatus?.last_scrape) || 'Not available'
  const headerDataStart = formatHeaderDate(scrapeStatus?.data_start_date)
  const headerDataEnd = formatHeaderDate(scrapeStatus?.data_end_date)
  const headerDataRange = headerDataStart && headerDataEnd
    ? `${headerDataStart} - ${headerDataEnd}`
    : headerDataEnd || headerDataStart || 'Not available'
  const headerProductSummary = latestScrapeProducts.length
    ? `${latestScrapeProducts.length} product${latestScrapeProducts.length === 1 ? '' : 's'} updated`
    : 'No products recorded yet'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 28px',
          height: 56,
          background: 'rgba(10,12,24,0.74)',
          borderBottom: '1px solid var(--border)',
          backdropFilter: 'blur(16px)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: 22, letterSpacing: '0.08em', color: 'var(--accent)', lineHeight: 1 }}>
              VOC
            </div>
          </div>
          <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Amazon VOC · <span style={{ color: 'var(--text)' }}>Qubo by Hero Electronix</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              position: 'relative',
            }}
          >
            <button
              onClick={() => setScrapeMenuOpen(open => !open)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                maxWidth: 320,
                padding: '6px 10px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'rgba(255,255,255,0.02)',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, textAlign: 'left' }}>
                <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  Last Scrape
                </div>
                <div style={{ fontSize: 12, color: 'var(--text)' }}>
                  {headerScrapeLabel}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Data range: {headerDataRange}
                </div>
              </div>
              <div
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 8px',
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.03)',
                  fontSize: 10,
                  letterSpacing: '0.04em',
                  color: 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                }}
              >
                <span>{headerProductSummary}</span>
                <ChevronDown size={12} style={{ transform: scrapeMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }} />
              </div>
            </button>
            {scrapeMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  width: 320,
                  maxHeight: 260,
                  overflowY: 'auto',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'rgba(14,17,30,0.96)',
                  boxShadow: '0 16px 36px rgba(0,0,0,0.35)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  zIndex: 120,
                }}
              >
                <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  Products In Latest Scrape
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Data available: {headerDataRange}
                </div>
                {latestScrapeProducts.length ? latestScrapeProducts.map(product => (
                  <div
                    key={product}
                    style={{
                      padding: '7px 8px',
                      borderRadius: 8,
                      background: 'rgba(255,255,255,0.03)',
                      color: 'var(--text)',
                      fontSize: 12,
                      lineHeight: 1.4,
                    }}
                  >
                    {product}
                  </div>
                )) : (
                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    No products recorded yet.
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => loadReviews(filters)}
            disabled={refreshing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 12px',
              borderRadius: 7,
              fontFamily: 'DM Sans',
              border: '1px solid var(--border)',
              background: 'rgba(255,255,255,0.02)',
              color: 'var(--text-muted)',
              fontSize: 12,
              cursor: refreshing ? 'not-allowed' : 'pointer',
            }}
          >
            <RefreshCw size={12} className={refreshing ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </header>

      <div
        style={{
          position: 'sticky',
          top: 56,
          zIndex: 90,
          flexShrink: 0,
          background: 'rgba(9,11,19,0.82)',
          borderBottom: '1px solid var(--border)',
          backdropFilter: 'blur(14px)',
          padding: '10px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          {visibleTabs.map(tabKey => (
            <TabBtn key={tabKey} active={activeTab === tabKey} onClick={() => setTab(tabKey)} emoji={TAB_META[tabKey].emoji} />
          ))}
        </div>
        <FilterBar filters={filters} options={options} onChange={handleFilterChange} tab={activeTab} />
        <div style={{ height: 2, margin: '4px -28px 0', overflow: 'hidden' }}>
          {refreshing && (
            <div
              style={{
                height: '100%',
                background: 'var(--accent)',
                width: '30%',
                borderRadius: 1,
                animation: 'progressSlide 1s ease-in-out infinite alternate',
              }}
            />
          )}
        </div>
      </div>

      <main style={{ flex: 1, padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
        <div className="glass-panel" style={{ borderRadius: 14, padding: '14px 20px' }}>
          <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.05, color: 'var(--text)', fontFamily: 'Bebas Neue', letterSpacing: '0.02em' }}>
            {currentTab.title}
          </h1>
        </div>

        {initialLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12, color: 'var(--text-muted)', height: 200 }}>
            <span style={{ fontSize: 24 }}>⟳</span><span>Loading…</span>
          </div>
        ) : activeTab === 'analysis' ? (
          <>
            <AnalysisPage filters={filters} allProducts={options.products} tree={options.tree} />
            <SummaryPage filters={filters} allProducts={options.products} />
          </>
        ) : activeTab === 'reviews' ? (
          <div className="glass-panel" style={{ borderRadius: 14, padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <h3 style={{ margin: 0, fontFamily: 'Bebas Neue', fontSize: 18, letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
                  All Reviews <span style={{ color: 'var(--accent)' }}>({reviews.length})</span>
                </h3>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Tagged customer reviews with search, sorting, and CSV export.
                </div>
              </div>
              <button
                onClick={() => downloadCSV(reviews)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  borderRadius: 7,
                  border: '1px solid var(--accent)',
                  background: 'rgba(255,78,26,0.08)',
                  color: 'var(--accent)',
                  fontFamily: 'Bebas Neue',
                  fontSize: 13,
                  letterSpacing: '0.08em',
                  cursor: 'pointer',
                }}
              >
                <Download size={12} /> EXPORT CSV
              </button>
            </div>
            <ReviewsTable data={reviews} />
          </div>
        ) : (
          <TrendsPage products={options.products} filters={filters} tree={options.tree} />
        )}
      </main>
    </div>
  )
}
