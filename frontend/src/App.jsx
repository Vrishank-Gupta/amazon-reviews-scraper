import { useState, useEffect, useCallback } from 'react'
import { fetchReviews, fetchFilters, fetchStats, fetchPipelineStatus, exportRawReviewsExcel, fetchAdminAccessLog, apiUrl } from './api'
import { downloadCSV } from './components/TrendsPage'
import FilterBar from './components/Filterbar'
import ReviewsTable from './components/ReviewsTable'
import TrendsPage from './components/TrendsPage'
import AnalysisPage from './components/Analysispage'
import SummaryPage from './components/Summarypage'
import LoginPage from './components/LoginPage'
import { RefreshCw, Download, ChevronDown, LogOut, ShieldCheck, Users, Clock3, ArrowLeft } from 'lucide-react'
import { SHOW_TRENDS_TAB } from './config/dashboard'

const DEFAULT_FILTERS = {
  product_category: [],
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

function formatAdminDate(value) {
  if (!value) return 'Not available'
  try {
    return new Date(value).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return value
  }
}

export default function App() {
  // ── Auth state ──────────────────────────────────────────────────────────────
  const [authChecked, setAuthChecked] = useState(false)
  const [authedEmail, setAuthedEmail] = useState(null)

  useEffect(() => {
    const token = localStorage.getItem('session_token')
    if (!token) { setAuthChecked(true); return }
    fetch(apiUrl('/api/auth/verify-session'), {
      headers: { 'X-Session-Token': token },
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => { setAuthedEmail(data.email); setAuthChecked(true) })
      .catch(() => {
        localStorage.removeItem('session_token')
        localStorage.removeItem('session_email')
        localStorage.removeItem('session_expires')
        setAuthChecked(true)
      })
  }, [])

  function handleLogout() {
    const token = localStorage.getItem('session_token')
    if (token) {
      fetch(apiUrl('/api/auth/logout'), {
        method: 'POST',
        headers: { 'X-Session-Token': token },
      }).catch(() => {})
    }
    localStorage.removeItem('session_token')
    localStorage.removeItem('session_email')
    localStorage.removeItem('session_expires')
    setAuthedEmail(null)
  }

  if (!authChecked) return null
  if (!authedEmail) return <LoginPage onLogin={email => setAuthedEmail(email)} />

  // ── Dashboard ───────────────────────────────────────────────────────────────
  if (window.location.pathname === '/admin') {
    return <AdminPanel authedEmail={authedEmail} onLogout={handleLogout} />
  }
  return <Dashboard authedEmail={authedEmail} onLogout={handleLogout} />
}

function AdminMetric({ icon, label, value }) {
  return (
    <div className="glass-panel" style={{ borderRadius: 10, padding: 16, minHeight: 92 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {icon} {label}
      </div>
      <div style={{ marginTop: 12, fontFamily: 'Bebas Neue', fontSize: 34, letterSpacing: '0.02em', lineHeight: 1, color: 'var(--text)' }}>
        {value}
      </div>
    </div>
  )
}

function AdminPanel({ authedEmail, onLogout }) {
  const [accessLog, setAccessLog] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadAccessLog = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setAccessLog(await fetchAdminAccessLog(200))
    } catch (err) {
      setError(err.message || 'Failed to fetch admin access log')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAccessLog()
  }, [loadAccessLog])

  const summary = accessLog?.summary || []
  const events = accessLog?.events || []
  const lastLogin = events[0]?.login_at

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          height: 56,
          padding: '0 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(10,12,24,0.74)',
          borderBottom: '1px solid var(--border)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          backdropFilter: 'blur(16px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ShieldCheck size={20} color="var(--accent)" />
          <div>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: 20, letterSpacing: '0.04em', color: 'var(--accent)', lineHeight: 1 }}>
              Admin Panel
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Amazon Reviews Dashboard</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', textDecoration: 'none', fontSize: 12 }}>
            <ArrowLeft size={13} /> Dashboard
          </a>
          <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>{authedEmail}</div>
            <button
              onClick={onLogout}
              title="Sign out"
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'none', border: 'none', padding: 0,
                color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer',
              }}
            >
              <LogOut size={11} /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="glass-panel" style={{ borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: 'Bebas Neue', fontSize: 30, letterSpacing: '0.02em', lineHeight: 1 }}>
              Dashboard Access
            </h1>
            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 3 }}>
              Successful email OTP logins are recorded here.
            </div>
          </div>
          <button
            onClick={loadAccessLog}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'rgba(255,255,255,0.03)',
              color: 'var(--text-muted)',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>

        {error && (
          <div className="glass-panel" style={{ borderRadius: 10, padding: 16, color: '#ff9b9b', borderColor: 'rgba(239,68,68,0.35)' }}>
            {error}
          </div>
        )}

        <div className="admin-metric-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          <AdminMetric icon={<Users size={14} />} label="Unique Users" value={accessLog?.unique_users ?? '-'} />
          <AdminMetric icon={<ShieldCheck size={14} />} label="Total Logins" value={accessLog?.total_logins ?? '-'} />
          <AdminMetric icon={<Clock3 size={14} />} label="Last Login" value={lastLogin ? formatAdminDate(lastLogin) : '-'} />
        </div>

        <div className="admin-content-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 0.65fr) minmax(420px, 1fr)', gap: 14, alignItems: 'start' }}>
          <section className="glass-panel" style={{ borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
              Users
            </div>
            <div style={{ maxHeight: 520, overflow: 'auto' }}>
              {summary.length ? summary.map(user => (
                <div key={user.email} style={{ padding: '12px 16px', borderBottom: '1px solid rgba(120,131,167,0.1)' }}>
                  <div style={{ color: 'var(--text)', fontWeight: 700, wordBreak: 'break-word' }}>{user.email}</div>
                  <div style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: 12 }}>
                    {user.login_count} login{Number(user.login_count) === 1 ? '' : 's'} · Last {formatAdminDate(user.last_login_at)}
                  </div>
                </div>
              )) : (
                <div style={{ padding: 16, color: 'var(--text-muted)' }}>{loading ? 'Loading users...' : 'No logins recorded yet.'}</div>
              )}
            </div>
          </section>

          <section className="glass-panel" style={{ borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>
              Recent Logins
            </div>
            <div style={{ overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead>
                  <tr style={{ color: 'var(--text-muted)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>Email</th>
                    <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>Login Time</th>
                    <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>IP</th>
                    <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>Browser</th>
                  </tr>
                </thead>
                <tbody>
                  {events.length ? events.map(event => (
                    <tr key={event.id} style={{ borderBottom: '1px solid rgba(120,131,167,0.1)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 700, wordBreak: 'break-word' }}>{event.email}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatAdminDate(event.login_at)}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{event.ip_address || '-'}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={event.user_agent || ''}>
                        {event.user_agent || '-'}
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="4" style={{ padding: 16, color: 'var(--text-muted)' }}>{loading ? 'Loading logins...' : 'No logins recorded yet.'}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

function Dashboard({ authedEmail, onLogout }) {
  const [tab, setTab] = useState('analysis')
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [reviews, setReviews] = useState([])
  const [options, setOptions] = useState({ tree: {}, products: [], ratings: [] })
  const [scrapeStatus, setScrapeStatus] = useState(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [exportingRaw, setExportingRaw] = useState(false)
  const [scrapeMenuOpen, setScrapeMenuOpen] = useState(false)

  useEffect(() => {
    fetchFilters().then(o => {
      setOptions(o)
      setFilters(f => ({ ...f, product: [], product_category: [] }))
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

  const handleRawExport = async () => {
    setExportingRaw(true)
    try {
      await exportRawReviewsExcel(filters)
    } catch (error) {
      window.alert(error?.message || 'Failed to export raw reviews')
    } finally {
      setExportingRaw(false)
    }
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
            <div style={{ fontFamily: 'Bebas Neue', fontSize: 20, letterSpacing: '0.04em', color: 'var(--accent)', lineHeight: 1 }}>
              Amazon Reviews Dashboard
            </div>
          </div>
          <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Qubo by Hero Electronix
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
          <button
            onClick={handleRawExport}
            disabled={exportingRaw}
            title="Export raw review Excel for the applied filters"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 12px',
              borderRadius: 7,
              fontFamily: 'DM Sans',
              border: '1px solid rgba(255,78,26,0.55)',
              background: 'rgba(255,78,26,0.08)',
              color: 'var(--accent)',
              fontSize: 12,
              cursor: exportingRaw ? 'not-allowed' : 'pointer',
              opacity: exportingRaw ? 0.7 : 1,
            }}
          >
            <Download size={12} /> {exportingRaw ? 'Exporting' : 'Export Raw'}
          </button>
          <a
            href="/admin"
            title="Open admin access log"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 10px',
              borderRadius: 7,
              border: '1px solid var(--border)',
              background: 'rgba(255,255,255,0.02)',
              color: 'var(--text-muted)',
              fontSize: 12,
              textDecoration: 'none',
            }}
          >
            <ShieldCheck size={12} /> Admin
          </a>
          <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>{authedEmail}</div>
            <button
              onClick={onLogout}
              title="Sign out"
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'none', border: 'none', padding: 0,
                color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer',
              }}
            >
              <LogOut size={11} /> Sign out
            </button>
          </div>
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
