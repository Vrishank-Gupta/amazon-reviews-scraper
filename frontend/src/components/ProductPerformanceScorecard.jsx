function EmptyState() {
  return <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No data for selected filters</div>
}

function Stars({ rating }) {
  const rounded = Math.round(parseFloat(rating) || 0)
  const color = rounded >= 4 ? '#22c55e' : rounded >= 3 ? '#eab308' : '#ef4444'
  return (
    <span style={{ color, fontSize: 13 }}>
      {'★'.repeat(rounded)}{'☆'.repeat(Math.max(0, 5 - rounded))}{' '}
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{parseFloat(rating || 0).toFixed(1)}</span>
    </span>
  )
}

export default function ProductPerformanceScorecard({ Card, productSummary }) {
  return (
    <Card
      title="Product Performance Scorecard"
      tip="This is the core filtered comparison view for leadership and analysts. Review Rating is the average of scraped review stars within the selected period only, so it reflects the exact filter window being analyzed here. Health Score = 100 minus negative rate %. Sorted best to worst. The Verdict column gives an instant action signal: ✅ Good means no action needed, ⚠️ Watch means monitor closely, 🔴 Act Now means escalate immediately."
      sub="Review Rating = avg stars from reviews in the selected period"
    >
      {!productSummary.length ? <EmptyState /> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Product', 'Reviews', 'Review Rating', 'Neg %', 'Pos %', 'Health', 'Verdict'].map(header => (
                  <th key={header} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {productSummary.sort((left, right) => left.neg_pct - right.neg_pct).map((row, index) => {
                const health = Math.max(0, 100 - row.neg_pct)
                const healthColor = health >= 75 ? '#22c55e' : health >= 60 ? '#eab308' : '#ef4444'
                const verdict = health >= 75 ? '✅ Good' : health >= 60 ? '⚠️ Watch' : '🔴 Act Now'
                return (
                  <tr key={row.product} style={{ background: index % 2 === 0 ? 'var(--surface)' : 'var(--surface2)' }}>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600 }}>{row.product}</td>
                    <td style={{ padding: '10px 12px', fontSize: 13 }}>{row.total?.toLocaleString()}</td>
                    <td style={{ padding: '10px 12px' }}><Stars rating={row.avg_rating} /></td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ color: row.neg_pct > 50 ? '#ef4444' : row.neg_pct > 30 ? '#eab308' : '#22c55e', fontWeight: 700 }}>{row.neg_pct}%</span>
                      <div style={{ height: 3, width: 60, background: 'var(--border)', borderRadius: 2, marginTop: 3 }}>
                        <div style={{ height: '100%', width: `${row.neg_pct}%`, background: row.neg_pct > 50 ? '#ef4444' : row.neg_pct > 30 ? '#eab308' : '#22c55e', borderRadius: 2 }} />
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#22c55e', fontWeight: 700 }}>{Math.round((row.positive || 0) / Math.max(row.total, 1) * 100)}%</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ fontFamily: 'Bebas Neue', fontSize: 22, color: healthColor }}>{Math.round(health)}</div>
                        <div style={{ width: 40, height: 4, background: 'var(--border)', borderRadius: 2 }}>
                          <div style={{ height: '100%', width: `${health}%`, background: healthColor, borderRadius: 2 }} />
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 12, fontWeight: 700 }}>{verdict}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
