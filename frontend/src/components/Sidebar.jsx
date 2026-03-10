import { SlidersHorizontal } from 'lucide-react'
import PipelineWidget from './PipelineWidget'

const SENTIMENTS = ['Positive', 'Neutral', 'Negative']

const sentimentColors = {
  Positive: 'var(--green)',
  Neutral: 'var(--yellow)',
  Negative: 'var(--red)',
}

function FilterSection({ title, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.12em',
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
      }}>
        {title}
      </span>
      {children}
    </div>
  )
}

function Chip({ label, selected, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 12px',
        borderRadius: 6,
        border: `1px solid ${selected ? (color || 'var(--accent)') : 'var(--border)'}`,
        background: selected ? (color ? color + '20' : 'var(--accent)20') : 'transparent',
        color: selected ? (color || 'var(--accent)') : 'var(--text-muted)',
        fontSize: 12,
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 0.15s',
        textAlign: 'left',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: '100%',
      }}
    >
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

  return (
    <aside style={{
      width: 220,
      minWidth: 220,
      background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      height: '100vh',
      position: 'sticky',
      top: 0,
      display: 'flex',
      flexDirection: 'column',
      padding: '24px 16px',
      gap: 24,
      overflowY: 'auto',
    }}>
      {/* Logo */}
      <div style={{ padding: '0 4px' }}>
        <div style={{
          fontFamily: 'Bebas Neue',
          fontSize: 26,
          letterSpacing: '0.08em',
          color: 'var(--accent)',
          lineHeight: 1,
        }}>
          VOC
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Voice of Customer
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)' }} />

      {/* Filters header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px' }}>
        <SlidersHorizontal size={14} style={{ color: 'var(--text-muted)' }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Filters
        </span>
      </div>

      {/* Category */}
      <FilterSection title="Category">
        <select
          value={filters.category || 'All'}
          onChange={e => onChange('category', e.target.value)}
          style={{
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--text)',
            padding: '8px 10px',
            fontSize: 13,
            width: '100%',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          <option value="All">All Categories</option>
          {options.categories?.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </FilterSection>

      {/* Sentiment */}
      <FilterSection title="Sentiment">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {SENTIMENTS.map(s => (
            <Chip
              key={s}
              label={s}
              selected={(filters.sentiment || []).includes(s)}
              color={sentimentColors[s]}
              onClick={() => toggle('sentiment', s)}
            />
          ))}
        </div>
      </FilterSection>

      {/* Rating */}
      <FilterSection title="Star Rating">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(options.ratings || []).map(r => (
            <Chip
              key={r}
              label={`★ ${r}`}
              selected={(filters.rating || []).includes(r)}
              onClick={() => toggle('rating', r)}
            />
          ))}
        </div>
      </FilterSection>

      {/* Product */}
      <FilterSection title="Product">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
          {(options.products || []).map(p => (
            <Chip
              key={p}
              label={p}
              selected={(filters.product || []).includes(p)}
              onClick={() => toggle('product', p)}
            />
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
