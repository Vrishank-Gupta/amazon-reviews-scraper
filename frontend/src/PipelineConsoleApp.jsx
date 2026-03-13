import PipelineWidget from './components/PipelineWidget'

export default function PipelineConsoleApp() {
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
          <div style={{ fontFamily: 'Bebas Neue', fontSize: 22, letterSpacing: '0.08em', color: 'var(--accent)', lineHeight: 1 }}>
            VOC
          </div>
          <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Pipeline Operations | <span style={{ color: 'var(--text)' }}>Analyst Console</span>
          </div>
        </div>
      </header>

      <main style={{ flex: 1, padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="glass-panel" style={{ borderRadius: 14, padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Analyst Console
              </div>
              <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.05, color: 'var(--text)', fontFamily: 'Bebas Neue', letterSpacing: '0.02em' }}>
                Pipeline Operations
              </h1>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.6, maxWidth: 760 }}>
                Use this page to review scrape freshness, choose the time window, select products, add ASINs and categories, and run the pipeline from one place.
              </p>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 880 }}>
          <PipelineWidget />
        </div>
      </main>
    </div>
  )
}
