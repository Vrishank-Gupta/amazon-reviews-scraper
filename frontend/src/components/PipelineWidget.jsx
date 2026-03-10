import { useState, useEffect } from 'react'
import { fetchPipeline, runPipeline } from '../api'
import { Play, CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react'

export default function PipelineWidget() {
  const [pipeline, setPipeline] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const poll = async () => {
    try {
      const data = await fetchPipeline()
      setPipeline(data)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    poll()
    const id = setInterval(poll, 3000)
    return () => clearInterval(id)
  }, [])

  const handleRun = async () => {
    setError(null)
    setLoading(true)
    try {
      await runPipeline()
      await poll()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const isRunning = pipeline?.status === 'RUNNING'

  const statusIcon = () => {
    if (!pipeline) return <Loader2 size={14} className="spin" style={{ color: 'var(--text-muted)' }} />
    if (isRunning) return <span className="pulse-dot" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--yellow)' }} />
    if (pipeline.status === 'SUCCESS') return <CheckCircle2 size={14} style={{ color: 'var(--green)' }} />
    if (pipeline.status === 'FAILED') return <XCircle size={14} style={{ color: 'var(--red)' }} />
    return <Clock size={14} style={{ color: 'var(--text-muted)' }} />
  }

  const fmtDate = (d) => d ? new Date(d).toLocaleString() : '—'

  return (
    <div style={{
      background: 'var(--surface2)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '16px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'Bebas Neue', fontSize: 18, letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
          DATA PIPELINE
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {statusIcon()}
          <span style={{
            fontSize: 12,
            fontWeight: 500,
            color: isRunning ? 'var(--yellow)' : pipeline?.status === 'SUCCESS' ? 'var(--green)' : pipeline?.status === 'FAILED' ? 'var(--red)' : 'var(--text-muted)',
          }}>
            {pipeline?.status ?? 'LOADING'}
          </span>
        </div>
      </div>

      {pipeline && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Last run: {fmtDate(pipeline.started_at)}
          </span>
          {pipeline.finished_at && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Finished: {fmtDate(pipeline.finished_at)}
            </span>
          )}
          {pipeline.message && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              "{pipeline.message}"
            </span>
          )}
        </div>
      )}

      {error && (
        <span style={{ fontSize: 12, color: 'var(--red)' }}>{error}</span>
      )}

      <button
        onClick={handleRun}
        disabled={isRunning || loading}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '10px 0',
          borderRadius: 8,
          border: 'none',
          cursor: isRunning || loading ? 'not-allowed' : 'pointer',
          background: isRunning || loading ? 'var(--border)' : 'var(--accent)',
          color: isRunning || loading ? 'var(--text-muted)' : '#fff',
          fontFamily: 'Bebas Neue',
          fontSize: 15,
          letterSpacing: '0.1em',
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => { if (!isRunning && !loading) e.target.style.background = 'var(--accent2)' }}
        onMouseLeave={e => { if (!isRunning && !loading) e.target.style.background = 'var(--accent)' }}
      >
        {loading || isRunning
          ? <><Loader2 size={14} className="spin" /> {isRunning ? 'RUNNING...' : 'STARTING...'}</>
          : <><Play size={14} fill="currentColor" /> RUN PIPELINE</>
        }
      </button>
    </div>
  )
}
