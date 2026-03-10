export default function StatCard({ label, value, accent, delay = '' }) {
  return (
    <div
      className={`fade-up ${delay}`}
      style={{
        background: 'var(--surface)',
        border: `1px solid ${accent ? accent : 'var(--border)'}`,
        borderRadius: 12,
        padding: '20px 24px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {accent && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: 3,
          background: accent,
          borderRadius: '12px 12px 0 0',
        }} />
      )}
      <div style={{
        fontFamily: 'Bebas Neue',
        fontSize: 42,
        lineHeight: 1,
        color: accent || 'var(--text)',
        letterSpacing: '0.02em',
      }}>
        {value ?? '—'}
      </div>
      <div style={{
        fontSize: 12,
        color: 'var(--text-muted)',
        marginTop: 6,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        fontWeight: 500,
      }}>
        {label}
      </div>
    </div>
  )
}
