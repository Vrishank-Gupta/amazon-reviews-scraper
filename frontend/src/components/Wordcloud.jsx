import { useState, useMemo } from 'react'

// Interpolate between green → yellow → red based on neg_ratio
function sentimentColor(negRatio, posRatio) {
  if (negRatio > 0.6) return { color: '#ef4444', glow: 'rgba(239,68,68,0.25)' }
  if (negRatio > 0.4) return { color: '#f97316', glow: 'rgba(249,115,22,0.2)' }
  if (negRatio > 0.2) return { color: '#ffd166', glow: 'rgba(255,209,102,0.2)' }
  if (posRatio > 0.5) return { color: '#22c55e', glow: 'rgba(34,197,94,0.2)' }
  return { color: '#94a3b8', glow: 'rgba(148,163,184,0.1)' }
}

export default function WordCloud({ data, onWordClick, activeWord }) {
  const [hovered, setHovered] = useState(null)

  const words = useMemo(() => {
    if (!data?.length) return []
    const maxCount = Math.max(...data.map(d => d.count))
    const minCount = Math.min(...data.map(d => d.count))
    const range = maxCount - minCount || 1

    return data.map(d => {
      // Font size: 11px (least common) → 42px (most common)
      const normalized = (d.count - minCount) / range
      const fontSize = Math.round(11 + normalized * 31)
      const { color, glow } = sentimentColor(d.neg_ratio, d.pos_ratio)
      return { ...d, fontSize, color, glow }
    })
  }, [data])

  if (!words.length) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        No keyword data for selected filters
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        {[
          { color: '#ef4444', label: 'Mostly negative (>60%)' },
          { color: '#f97316', label: 'Mixed negative (40–60%)' },
          { color: '#ffd166', label: 'Slightly negative (20–40%)' },
          { color: '#22c55e', label: 'Mostly positive' },
          { color: '#94a3b8', label: 'Neutral / mixed' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
          </div>
        ))}
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto', fontStyle: 'italic' }}>
          Size = review count · Click to filter
        </span>
      </div>

      {/* Cloud */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px 14px',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        background: 'var(--surface2)',
        borderRadius: 10,
        border: '1px solid var(--border)',
        minHeight: 200,
        lineHeight: 1.4,
      }}>
        {words.map(word => {
          const isActive = activeWord === word.word
          const isHovered = hovered === word.word
          const scale = isActive ? 1.08 : isHovered ? 1.05 : 1

          return (
            <button
              key={word.word}
              onMouseEnter={() => setHovered(word.word)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onWordClick(word.word === activeWord ? null : word.word)}
              title={`${word.word}\n${word.count} reviews · ${Math.round(word.neg_ratio * 100)}% negative · ${Math.round(word.pos_ratio * 100)}% positive`}
              style={{
                background: 'none',
                border: isActive
                  ? `1px solid ${word.color}`
                  : '1px solid transparent',
                borderRadius: 6,
                padding: '2px 6px',
                cursor: 'pointer',
                fontSize: word.fontSize,
                fontWeight: word.fontSize > 26 ? 700 : word.fontSize > 18 ? 600 : 500,
                color: word.color,
                textShadow: (isHovered || isActive)
                  ? `0 0 12px ${word.glow}`
                  : 'none',
                boxShadow: isActive
                  ? `0 0 10px ${word.glow}`
                  : 'none',
                transform: `scale(${scale})`,
                transition: 'all 0.15s ease',
                opacity: activeWord && !isActive ? 0.35 : 1,
                fontFamily: 'DM Sans, sans-serif',
                letterSpacing: word.fontSize > 22 ? '-0.01em' : '0',
                whiteSpace: 'nowrap',
              }}
            >
              {word.word}
            </button>
          )
        })}
      </div>

      {/* Active word detail card */}
      {activeWord && (() => {
        const w = words.find(x => x.word === activeWord)
        if (!w) return null
        const total = w.count
        return (
          <div style={{
            background: 'var(--surface2)',
            border: `1px solid ${w.color}40`,
            borderRadius: 10,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 24,
            flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 2 }}>Selected keyword</div>
              <div style={{ fontSize: 22, fontFamily: 'Bebas Neue', letterSpacing: '0.06em', color: w.color }}>
                {w.word}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {[
                { label: 'Total Reviews', value: total, color: 'var(--text)' },
                { label: 'Negative', value: `${w.negative} (${Math.round(w.neg_ratio * 100)}%)`, color: '#ef4444' },
                { label: 'Positive', value: `${w.positive} (${Math.round(w.pos_ratio * 100)}%)`, color: '#22c55e' },
                { label: 'Neutral', value: w.neutral, color: '#eab308' },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
                  <div style={{ fontSize: 20, fontFamily: 'Bebas Neue', color, letterSpacing: '0.04em' }}>{value}</div>
                </div>
              ))}
            </div>
            <button
              onClick={() => onWordClick(null)}
              style={{
                marginLeft: 'auto', background: 'none',
                border: '1px solid var(--border)', borderRadius: 6,
                color: 'var(--text-muted)', fontSize: 12, padding: '5px 12px',
                cursor: 'pointer',
              }}
            >
              Clear ✕
            </button>
          </div>
        )
      })()}
    </div>
  )
}