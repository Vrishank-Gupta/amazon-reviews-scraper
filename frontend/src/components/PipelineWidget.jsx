import { useState, useEffect } from 'react'
import { fetchPipelineStatus, runPipeline, fetchAsins } from '../api'
import { CheckCircle2, AlertCircle, Clock, Database, RefreshCw, Play, Loader2, ChevronDown } from 'lucide-react'

function StatusPill({ daysAgo }) {
  if (daysAgo === null || daysAgo === undefined)
    return <span style={pill('#94a3b8')}><Clock size={11} /> No data yet</span>
  if (daysAgo === 0)
    return <span style={pill('#22c55e')}><CheckCircle2 size={11} /> Scraped today</span>
  if (daysAgo <= 7)
    return <span style={pill('#22c55e')}><CheckCircle2 size={11} /> {daysAgo}d ago — fresh</span>
  if (daysAgo <= 14)
    return <span style={pill('#eab308')}><Clock size={11} /> {daysAgo}d ago</span>
  return <span style={pill('#ef4444')}><AlertCircle size={11} /> {daysAgo}d ago — stale</span>
}

function pill(color) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '3px 10px', borderRadius: 20,
    background: color + '18', border: `1px solid ${color}40`,
    fontSize: 11, fontWeight: 600, color,
  }
}

function Stat({ label, value, sub }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
      <span style={{ fontSize: 18, fontFamily: 'Bebas Neue', letterSpacing: '0.04em', color: 'var(--text)', lineHeight: 1 }}>{value}</span>
      {sub && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{sub}</span>}
    </div>
  )
}

export default function PipelineWidget() {
  const [status, setStatus] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [days, setDays] = useState(30)
  const [asins, setAsins] = useState([])           // all available ASINs from CSV
  const [selectedAsins, setSelectedAsins] = useState([]) // [] = all
  const [asinOpen, setAsinOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  const load = async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true)
    try {
      const data = await fetchPipelineStatus()
      setStatus(data)
    } catch (e) { console.error(e) }
    finally { setRefreshing(false) }
  }

  useEffect(() => {
    load()
    fetchAsins().then(data => {
      setAsins(Array.isArray(data) ? data : [])
    }).catch(() => {})
    const id = setInterval(() => load(), 30 * 1000)
    return () => clearInterval(id)
  }, [])

  const toggleAsin = (asin) => {
    setSelectedAsins(prev =>
      prev.includes(asin) ? prev.filter(a => a !== asin) : [...prev, asin]
    )
  }

  const handleRun = async () => {
    setError(null)
    setSuccess(false)
    setRunning(true)
    try {
      await runPipeline(days, selectedAsins)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 4000)
      // Pipeline runs in background — poll every 15s until review count grows
      const startTotal = status?.total_reviews || 0
      let attempts = 0
      const poll = setInterval(async () => {
        attempts++
        try {
          const fresh = await fetchPipelineStatus()
          setStatus(fresh)
          if (fresh?.total_reviews > startTotal || attempts >= 80) {
            clearInterval(poll)
            setRunning(false)
          }
        } catch (_) {}
      }, 15000)
    } catch (e) {
      setError(e.message)
      setRunning(false)
    }
  }

  const fmtDate = (d) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const coveragePct = status?.total_reviews > 0
    ? Math.round((status.tagged_reviews / status.total_reviews) * 100) : 0

  const asinLabel = selectedAsins.length === 0
    ? 'All products'
    : selectedAsins.length === asins.length
    ? 'All products'
    : `${selectedAsins.length} of ${asins.length} selected`

  return (
    <div style={{
      background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '16px 20px',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Database size={14} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontFamily: 'Bebas Neue', fontSize: 17, letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
            DATA STATUS
          </span>
        </div>
        <button onClick={() => load(true)} disabled={refreshing} title="Refresh"
          style={{ background: 'none', border: 'none', cursor: refreshing ? 'default' : 'pointer', color: 'var(--text-muted)', padding: 4, opacity: refreshing ? 0.5 : 1 }}>
          <RefreshCw size={13} className={refreshing ? 'spin' : ''} />
        </button>
      </div>

      {/* Status */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <StatusPill daysAgo={status?.days_ago} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Last scrape: <span style={{ color: 'var(--text)' }}>{fmtDate(status?.last_scrape)}</span>
        </span>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, paddingTop: 4, borderTop: '1px solid var(--border)' }}>
        <Stat label="Total" value={status?.total_reviews?.toLocaleString() ?? '—'} sub="reviews" />
        <Stat label="Last 7d" value={status?.recent_reviews?.toLocaleString() ?? '—'} sub="new" />
        <Stat label="Tagged" value={status ? `${coveragePct}%` : '—'} sub={`${status?.tagged_reviews?.toLocaleString() ?? 0}`} />
      </div>

      {/* Manual run */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4, borderTop: '1px solid var(--border)' }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
          Manual Run
        </span>

        {/* Days input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Fetch last</span>
          <input
            type="number" min={1} max={365} value={days}
            onChange={e => setDays(Math.max(1, Math.min(365, parseInt(e.target.value) || 1)))}
            style={{
              width: 52, padding: '4px 8px',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 6, color: 'var(--text)', fontSize: 12,
              textAlign: 'center', outline: 'none',
            }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>days</span>
        </div>

        {/* Day presets */}
        <div style={{ display: 'flex', gap: 5 }}>
          {[7, 14, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} style={{
              flex: 1, padding: '3px 0', borderRadius: 5, fontSize: 11, cursor: 'pointer',
              border: `1px solid ${days === d ? 'var(--accent)' : 'var(--border)'}`,
              background: days === d ? 'var(--accent)20' : 'transparent',
              color: days === d ? 'var(--accent)' : 'var(--text-muted)',
              transition: 'all 0.12s',
            }}>
              {d}d
            </button>
          ))}
        </div>

        {/* ASIN multi-select dropdown */}
        {asins.length > 0 && (
          <div style={{ position: 'relative' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Products</span>

            {/* Trigger */}
            <button
              onClick={() => setAsinOpen(o => !o)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 10px', borderRadius: 6,
                background: 'var(--surface)', border: `1px solid ${asinOpen ? 'var(--accent)' : 'var(--border)'}`,
                color: selectedAsins.length ? 'var(--text)' : 'var(--text-muted)',
                fontSize: 11, cursor: 'pointer', transition: 'border 0.15s',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {asinLabel}
              </span>
              <ChevronDown size={12} style={{ flexShrink: 0, transform: asinOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>

            {/* Dropdown */}
            {asinOpen && (
              <div style={{
                position: 'absolute', bottom: 'calc(100% + 4px)', left: 0, right: 0,
                background: '#1a1a24', border: '1px solid var(--border)',
                borderRadius: 8, overflow: 'hidden',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 100,
              }}>
                {/* Select all */}
                <button
                  onClick={() => setSelectedAsins([])}
                  style={{
                    width: '100%', padding: '8px 12px', textAlign: 'left',
                    background: selectedAsins.length === 0 ? 'var(--accent)15' : 'transparent',
                    border: 'none', borderBottom: '1px solid var(--border)',
                    color: selectedAsins.length === 0 ? 'var(--accent)' : 'var(--text-muted)',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  ✓ All products
                </button>

                {/* Individual ASINs */}
                {asins.map(({ asin, product_name }) => {
                  const sel = selectedAsins.includes(asin)
                  return (
                    <button
                      key={asin}
                      onClick={() => toggleAsin(asin)}
                      style={{
                        width: '100%', padding: '7px 12px',
                        display: 'flex', alignItems: 'center', gap: 8,
                        background: sel ? 'var(--accent)10' : 'transparent',
                        border: 'none', borderBottom: '1px solid var(--border)',
                        color: 'var(--text)', fontSize: 11, cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      {/* Checkbox */}
                      <span style={{
                        width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                        border: `1.5px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                        background: sel ? 'var(--accent)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, color: '#fff',
                      }}>
                        {sel ? '✓' : ''}
                      </span>
                      <span style={{ overflow: 'hidden' }}>
                        <span style={{ display: 'block', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {product_name}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{asin}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Run button */}
        <button
          onClick={handleRun} disabled={running}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            padding: '9px 0', borderRadius: 8, border: 'none',
            cursor: running ? 'not-allowed' : 'pointer',
            background: success ? '#22c55e' : running ? 'var(--border)' : 'var(--accent)',
            color: running ? 'var(--text-muted)' : '#fff',
            fontFamily: 'Bebas Neue', fontSize: 14, letterSpacing: '0.1em',
            transition: 'all 0.2s',
          }}
        >
          {running ? <><Loader2 size={13} className="spin" /> RUNNING…</>
            : success ? <><CheckCircle2 size={13} /> STARTED!</>
            : <><Play size={13} fill="currentColor" /> RUN NOW</>}
        </button>

        {error && <span style={{ fontSize: 11, color: '#ef4444', lineHeight: 1.4 }}>{error}</span>}
      </div>
    </div>
  )
}