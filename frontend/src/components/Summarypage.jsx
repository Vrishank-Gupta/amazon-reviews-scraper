import { useState, useEffect, useCallback } from 'react'
import { fetchSummary } from '../api'

function StarLabel({ rating }) {
  const n = Math.round(parseFloat(rating)) || 0
  return (
    <span style={{ color: n >= 4 ? '#22c55e' : n === 3 ? '#eab308' : '#ef4444', fontSize: 12 }}>
      {'★'.repeat(n)}{'☆'.repeat(Math.max(0, 5 - n))}
      <span style={{ color: 'var(--text-muted)', marginLeft: 4, fontWeight: 400 }}>{rating} star{n !== 1 ? 's' : ''}</span>
    </span>
  )
}

function Delta({ val, invertColor = false }) {
  if (val === undefined || val === null) return <span style={{ color: 'var(--text-muted)' }}>—</span>
  const isPositive = val > 0
  // invertColor: for metrics where up = bad (e.g. negative %)
  const good = invertColor ? !isPositive : isPositive
  const color = val === 0 ? 'var(--text-muted)' : good ? '#22c55e' : '#ef4444'
  const arrow = val === 0 ? '—' : isPositive ? `↑ +${val}` : `↓ ${val}`
  return <span style={{ color, fontWeight: 700, fontSize: 12 }}>{arrow}</span>
}

function AiBrief({ row }) {
  return (
    <div style={{
      background: 'var(--surface2)', border: '1px solid var(--border)',
      borderTop: 'none', borderRadius: '0 0 10px 10px',
      padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontFamily: 'Bebas Neue', fontSize: 16, letterSpacing: '0.05em' }}>
          {row.product_name} — AI Brief
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.25)', color: '#60a5fa', borderRadius: 6, padding: '3px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          ✦ AI Generated
          {row.ai_generated_at && (
            <span style={{ fontWeight: 400, marginLeft: 4 }}>
              · {new Date(row.ai_generated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </span>
          )}
        </div>
      </div>

      {(!row.ai_issues?.length && !row.ai_positives?.length) ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          No AI brief available yet. Run the pipeline to generate summaries.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#ef4444' }}>
              Top Issues
            </div>
            {(row.ai_issues || []).map((p, i) => (
              <div key={i} style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 7, lineHeight: 1.5 }}>
                <span style={{ color: '#ef4444', flexShrink: 0 }}>•</span>
                {p}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#22c55e' }}>
              What Customers Love
            </div>
            {(row.ai_positives || []).map((p, i) => (
              <div key={i} style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 7, lineHeight: 1.5 }}>
                <span style={{ color: '#22c55e', flexShrink: 0 }}>•</span>
                {p}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const TH = ({ children, style }) => (
  <th style={{
    padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700,
    letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)',
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', background: 'var(--surface2)',
    ...style,
  }}>
    {children}
  </th>
)

export default function SummaryPage({ filters, allProducts }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  const apiParams = {
    product: filters.product?.length ? filters.product : allProducts,
    date_from: filters.date_from,
    date_to: filters.date_to,
  }

  const load = useCallback(() => {
    if (!allProducts?.length) return
    setLoading(true)
    fetchSummary(apiParams)
      .then(setRows)
      .finally(() => setLoading(false))
  }, [JSON.stringify(apiParams), allProducts?.length])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-muted)', gap: 10 }}>
      <span style={{ fontSize: 20 }}>⟳</span> Loading summary…
    </div>
  )

  if (!rows.length) return (
    <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
      No data for the selected filters.
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface2)' }}>
          <div>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: 18, letterSpacing: '0.06em', color: 'var(--text-muted)' }}>Product Summary</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Current period vs prior equivalent period · click row to expand AI brief
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>↑ red = worse &nbsp; ↓ green = improved</div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <TH>Product</TH>
                <TH>ASIN</TH>
                <TH>Avg Rating</TH>
                <TH>Δ Rating</TH>
                <TH>Reviews</TH>
                <TH>Δ Reviews</TH>
                <TH>Negative %</TH>
                <TH>Δ Neg %</TH>
                <TH style={{ width: 32 }}></TH>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const isExp = expanded === row.asin
                return (
                  <>
                    <tr
                      key={row.asin}
                      onClick={() => setExpanded(isExp ? null : row.asin)}
                      style={{ cursor: 'pointer', background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)', transition: 'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#ff4e1a0a'}
                      onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)'}
                    >
                      <td style={{ padding: '14px', fontSize: 13, fontWeight: 600, borderBottom: isExp ? 'none' : '1px solid var(--border)' }}>
                        {row.product_name || row.asin}
                      </td>
                      <td style={{ padding: '14px', fontSize: 11, color: 'var(--text-muted)', borderBottom: isExp ? 'none' : '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                        {row.asin}
                      </td>
                      <td style={{ padding: '14px', borderBottom: isExp ? 'none' : '1px solid var(--border)' }}>
                        <StarLabel rating={row.avg_rating} />
                        <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, marginTop: 5, width: 80 }}>
                          <div style={{ height: '100%', borderRadius: 2, background: 'linear-gradient(90deg, var(--accent), var(--accent2))', width: `${(row.avg_rating / 5) * 100}%` }} />
                        </div>
                      </td>
                      <td style={{ padding: '14px', borderBottom: isExp ? 'none' : '1px solid var(--border)' }}>
                        <Delta val={row.delta_rating} />
                      </td>
                      <td style={{ padding: '14px', fontSize: 13, fontWeight: 700, borderBottom: isExp ? 'none' : '1px solid var(--border)' }}>
                        {row.review_count?.toLocaleString()}
                      </td>
                      <td style={{ padding: '14px', borderBottom: isExp ? 'none' : '1px solid var(--border)' }}>
                        <Delta val={row.delta_reviews} />
                      </td>
                      <td style={{ padding: '14px', fontSize: 13, fontWeight: 700, color: row.neg_pct > 50 ? '#ef4444' : row.neg_pct > 30 ? '#eab308' : '#22c55e', borderBottom: isExp ? 'none' : '1px solid var(--border)' }}>
                        {row.neg_pct}%
                      </td>
                      <td style={{ padding: '14px', borderBottom: isExp ? 'none' : '1px solid var(--border)' }}>
                        <Delta val={row.delta_neg_pct} invertColor />
                      </td>
                      <td style={{ padding: '14px', color: 'var(--text-muted)', fontSize: 13, borderBottom: isExp ? 'none' : '1px solid var(--border)' }}>
                        {isExp ? '▲' : '▼'}
                      </td>
                    </tr>
                    {isExp && (
                      <tr key={`ai-${row.asin}`}>
                        <td colSpan={9} style={{ padding: '0 0 6px', borderBottom: '1px solid var(--border)' }}>
                          <AiBrief row={row} />
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ background: 'rgba(255,78,26,0.06)', border: '1px dashed rgba(255,78,26,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 11, color: 'var(--accent)', lineHeight: 1.6 }}>
        ✦ AI Briefs are generated by GPT-4o-mini from the actual review corpus. Re-run the pipeline to refresh summaries.
      </div>

    </div>
  )
}