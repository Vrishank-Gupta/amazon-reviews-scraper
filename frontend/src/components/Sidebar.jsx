import { SlidersHorizontal } from 'lucide-react'
import PipelineWidget from './PipelineWidget'

const SENTIMENTS = ['Positive', 'Neutral', 'Negative']
const sentimentColors = { Positive: 'var(--green)', Neutral: 'var(--yellow)', Negative: 'var(--red)' }

const DATE_PRESETS = [
  { label: '7d',  days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: 'All', days: null },
]

function FilterSection({ title, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
        {title}
      </span>
      {children}
    </div>
  )
}

function Chip({ label, selected, color, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 12px', borderRadius: 6,
      border: `1px solid ${selected ? (color || 'var(--accent)') : 'var(--border)'}`,
      background: selected ? (color ? color + '20' : 'var(--accent)20') : 'transparent',
      color: selected ? (color || 'var(--accent)') : 'var(--text-muted)',
      fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
      textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
    }}>
      {label}
    </button>
  )
}

export default function Sidebar({ filters, options, onChange }) {
  const toggle = (key, val) => {
    const cur = filters[key] || []
    const next = cur.includes(val) ? cur.filter(x => x !== val) : [...cur, val]
    onChange(key, next)
  }

  const applyPreset = (days) => {
    if (days === null) {
      onChange('date_from', null)
      onChange('date_to', null)
    } else {
      const to = new Date()
      const from = new Date()
      from.setDate(to.getDate() - days)
      onChange('date_from', from.toISOString().slice(0, 10))
      onChange('date_to', to.toISOString().slice(0, 10))
    }
  }

  // Determine active preset
  const activePreset = (() => {
    if (!filters.date_from && !filters.date_to) return 'All'
    if (!filters.date_from) return null
    const days = Math.round((new Date() - new Date(filters.date_from)) / 86400000)
    if (days <= 8) return '7d'
    if (days <= 31) return '30d'
    if (days <= 92) return '90d'
    return null
  })()

  return (
    <aside style={{
      width: 220, minWidth: 220,
      background: 'var(--surface)', borderRight: '1px solid var(--border)',
      height: '100vh', position: 'sticky', top: 0,
      display: 'flex', flexDirection: 'column',
      padding: '24px 16px', gap: 24, overflowY: 'auto',
    }}>
      {/* Logo */}
      <div style={{ padding: '0 4px' }}>
        <div style={{ fontFamily: 'Bebas Neue', fontSize: 26, letterSpacing: '0.08em', color: 'var(--accent)', lineHeight: 1 }}>VOC</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Voice of Customer</div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px' }}>
        <SlidersHorizontal size={14} style={{ color: 'var(--text-muted)' }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Filters</span>
      </div>

      {/* Date Range */}
      <FilterSection title="Date Range">
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {DATE_PRESETS.map(p => (
            <button key={p.label} onClick={() => applyPreset(p.days)} style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${activePreset === p.label ? 'var(--accent)' : 'var(--border)'}`,
              background: activePreset === p.label ? 'rgba(255,78,26,0.12)' : 'transparent',
              color: activePreset === p.label ? 'var(--accent)' : 'var(--text-muted)',
              transition: 'all 0.15s', fontFamily: 'DM Sans',
            }}>
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <input type="date" value={filters.date_from || ''} onChange={e => onChange('date_from', e.target.value || null)}
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '5px 8px', fontSize: 11, width: '100%', outline: 'none', fontFamily: 'DM Sans' }} />
          <input type="date" value={filters.date_to || ''} onChange={e => onChange('date_to', e.target.value || null)}
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '5px 8px', fontSize: 11, width: '100%', outline: 'none', fontFamily: 'DM Sans' }} />
        </div>
      </FilterSection>

      {/* Sentiment */}
      <FilterSection title="Sentiment">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {SENTIMENTS.map(s => (
            <Chip key={s} label={s} selected={(filters.sentiment || []).includes(s)} color={sentimentColors[s]} onClick={() => toggle('sentiment', s)} />
          ))}
        </div>
      </FilterSection>

      {/* Rating */}
      <FilterSection title="Star Rating">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(options.ratings || []).map(r => (
            <Chip key={r} label={`★ ${r}`} selected={(filters.rating || []).includes(r)} onClick={() => toggle('rating', r)} />
          ))}
        </div>
      </FilterSection>

      {/* Product */}
      <FilterSection title="Product">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
          {(options.products || []).map(p => (
            <Chip key={p} label={p} selected={(filters.product || []).includes(p)} onClick={() => toggle('product', p)} />
          ))}
        </div>
      </FilterSection>

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ borderTop: '1px solid var(--border)' }} />
        <PipelineWidget />
      </div>
    </aside>
  )
}