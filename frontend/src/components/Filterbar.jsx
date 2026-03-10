/**
 * FilterBar — horizontal filter strip below the tab bar
 *
 * Shows only filters relevant to the active tab:
 *   Overview / Products / Trends → Date + Product
 *   Reviews                      → Date + Product + Sentiment + Rating
 *
 * Active filters render as dismissible chips so state is always visible.
 * A "Reset" button appears only when non-default filters are active.
 */
import { useState, useRef, useEffect } from 'react'
import { SlidersHorizontal, X, ChevronDown, Calendar, Package } from 'lucide-react'

const SC = { Positive:'#22c55e', Neutral:'#eab308', Negative:'#ef4444' }
const DATE_PRESETS = [
  { label:'7d',  days:7  },
  { label:'30d', days:30 },
  { label:'90d', days:90 },
  { label:'All', days:null },
]

function fmtDate(d) {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'2-digit'}) } catch { return d }
}

// ── Dropdown wrapper ──────────────────────────────────────────────────────────
function Dropdown({ trigger, children, align='left' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  return (
    <div ref={ref} style={{ position:'relative' }}>
      <div onClick={() => setOpen(o=>!o)}>{trigger(open)}</div>
      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 6px)', [align]:0, zIndex:200,
          background:'#14141e', border:'1px solid var(--border)', borderRadius:10,
          boxShadow:'0 12px 32px rgba(0,0,0,0.6)', minWidth:200, overflow:'hidden',
        }} onClick={e=>e.stopPropagation()}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

// ── Filter pill button ────────────────────────────────────────────────────────
function PillBtn({ label, active, icon, onClick }) {
  return (
    <button onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:5,
      padding:'5px 12px', borderRadius:20, cursor:'pointer',
      border:`1px solid ${active?'var(--accent)':'var(--border)'}`,
      background: active?'rgba(255,78,26,0.1)':'var(--surface)',
      color: active?'var(--accent)':'var(--text-muted)',
      fontSize:12, fontWeight:500, fontFamily:'DM Sans',
      transition:'all 0.15s', whiteSpace:'nowrap',
    }}>
      {icon}{label}<ChevronDown size={11} style={{ opacity:0.6 }} />
    </button>
  )
}

// ── Active filter chip ────────────────────────────────────────────────────────
function ActiveChip({ label, color, onRemove }) {
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:4,
      padding:'3px 8px 3px 10px', borderRadius:20,
      background: color?`${color}15`:'rgba(255,78,26,0.1)',
      border:`1px solid ${color||'var(--accent)'}40`,
      color: color||'var(--accent)', fontSize:11, fontWeight:600,
      whiteSpace:'nowrap',
    }}>
      {label}
      <button onClick={onRemove} style={{ background:'none', border:'none', cursor:'pointer', color:'inherit', padding:0, lineHeight:1, display:'flex', opacity:0.7 }}>
        <X size={11} />
      </button>
    </span>
  )
}

// ── DATE DROPDOWN ─────────────────────────────────────────────────────────────
function DateDropdown({ filters, onChange }) {
  const activePreset = (() => {
    if (!filters.date_from && !filters.date_to) return 'All'
    if (!filters.date_from) return null
    const days = Math.round((new Date() - new Date(filters.date_from)) / 86400000)
    if (days <= 8) return '7d'
    if (days <= 31) return '30d'
    if (days <= 92) return '90d'
    return null
  })()

  const applyPreset = (days) => {
    if (days === null) { onChange('date_from', null); onChange('date_to', null) }
    else {
      const to = new Date(), from = new Date()
      from.setDate(to.getDate() - days)
      onChange('date_from', from.toISOString().slice(0,10))
      onChange('date_to', to.toISOString().slice(0,10))
    }
  }

  const hasDate = filters.date_from || filters.date_to
  const label = activePreset && activePreset !== 'All'
    ? `Last ${activePreset}`
    : filters.date_from && filters.date_to
    ? `${fmtDate(filters.date_from)} → ${fmtDate(filters.date_to)}`
    : 'Date Range'

  return (
    <Dropdown
      trigger={open => <PillBtn label={label} active={hasDate && activePreset !== 'All'} icon={<Calendar size={12} />} />}
    >
      {(close) => (
        <div style={{ padding:14, display:'flex', flexDirection:'column', gap:10 }}>
          <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-muted)' }}>Quick Select</div>
          <div style={{ display:'flex', gap:6 }}>
            {DATE_PRESETS.map(p => (
              <button key={p.label} onClick={() => { applyPreset(p.days); close() }} style={{
                flex:1, padding:'5px 0', borderRadius:6, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'DM Sans',
                border:`1px solid ${activePreset===p.label?'var(--accent)':'var(--border)'}`,
                background: activePreset===p.label?'rgba(255,78,26,0.12)':'var(--surface2)',
                color: activePreset===p.label?'var(--accent)':'var(--text-muted)',
              }}>{p.label}</button>
            ))}
          </div>
          <div style={{ borderTop:'1px solid var(--border)', paddingTop:10, display:'flex', flexDirection:'column', gap:6 }}>
            <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-muted)' }}>Custom Range</div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <input type="date" value={filters.date_from||''} onChange={e=>onChange('date_from',e.target.value||null)}
                style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, color:'var(--text)', padding:'6px 10px', fontSize:12, outline:'none', fontFamily:'DM Sans', width:'100%' }} />
              <input type="date" value={filters.date_to||''} onChange={e=>onChange('date_to',e.target.value||null)}
                style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, color:'var(--text)', padding:'6px 10px', fontSize:12, outline:'none', fontFamily:'DM Sans', width:'100%' }} />
            </div>
          </div>
        </div>
      )}
    </Dropdown>
  )
}

// ── PRODUCT DROPDOWN ──────────────────────────────────────────────────────────
function ProductDropdown({ filters, options, onChange }) {
  const all = options.products || []
  const selected = filters.product || []
  const isAll = selected.length === 0 || selected.length === all.length

  const toggle = (p) => {
    const next = selected.includes(p) ? selected.filter(x=>x!==p) : [...selected, p]
    onChange('product', next.length === all.length ? all : next)
  }

  const label = isAll ? 'All Products' : `${selected.length} of ${all.length} products`

  return (
    <Dropdown
      trigger={open => <PillBtn label={label} active={!isAll} icon={<Package size={12} />} />}
    >
      {(close) => (
        <div style={{ maxHeight:280, overflowY:'auto' }}>
          <button onClick={() => { onChange('product', all); }} style={{
            width:'100%', padding:'9px 14px', textAlign:'left', background:isAll?'rgba(255,78,26,0.08)':'transparent',
            border:'none', borderBottom:'1px solid var(--border)', color:isAll?'var(--accent)':'var(--text-muted)',
            fontSize:11, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:7,
          }}>
            <span style={{ width:14, height:14, borderRadius:3, border:`1.5px solid ${isAll?'var(--accent)':'var(--border)'}`, background:isAll?'var(--accent)':'transparent', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:9, color:'#fff', flexShrink:0 }}>{isAll?'✓':''}</span>
            All Products
          </button>
          {all.map(p => {
            const sel = selected.includes(p)
            return (
              <button key={p} onClick={() => toggle(p)} style={{
                width:'100%', padding:'8px 14px', textAlign:'left', display:'flex', alignItems:'center', gap:7,
                background:sel?'rgba(255,78,26,0.06)':'transparent', border:'none', borderBottom:'1px solid var(--border)',
                color:'var(--text)', fontSize:12, cursor:'pointer',
              }}>
                <span style={{ width:14, height:14, borderRadius:3, border:`1.5px solid ${sel?'var(--accent)':'var(--border)'}`, background:sel?'var(--accent)':'transparent', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:9, color:'#fff', flexShrink:0, flexShrink:0 }}>{sel?'✓':''}</span>
                <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, textAlign:'left' }}>{p}</span>
              </button>
            )
          })}
        </div>
      )}
    </Dropdown>
  )
}

// ── SENTIMENT DROPDOWN (Reviews tab only) ─────────────────────────────────────
function SentimentDropdown({ filters, onChange }) {
  const selected = filters.sentiment || []
  const label = selected.length === 0 ? 'All Sentiments' : selected.join(', ')
  const toggle = s => {
    const next = selected.includes(s) ? selected.filter(x=>x!==s) : [...selected, s]
    onChange('sentiment', next)
  }
  return (
    <Dropdown trigger={open => <PillBtn label={label} active={selected.length > 0} />}>
      {(close) => (
        <div style={{ padding:8, display:'flex', flexDirection:'column', gap:2 }}>
          {['Positive','Neutral','Negative'].map(s => {
            const sel = selected.includes(s)
            const color = SC[s]
            return (
              <button key={s} onClick={() => toggle(s)} style={{
                display:'flex', alignItems:'center', gap:8, padding:'7px 10px', borderRadius:6,
                background:sel?`${color}12`:'transparent', border:'none', cursor:'pointer',
                color:sel?color:'var(--text-muted)', fontSize:12, fontWeight:sel?600:400, textAlign:'left',
              }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background:color, flexShrink:0 }} />{s}
                {sel && <span style={{ marginLeft:'auto', fontSize:11 }}>✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </Dropdown>
  )
}

// ── RATING DROPDOWN (Reviews tab only) ────────────────────────────────────────
function RatingDropdown({ filters, options, onChange }) {
  const selected = filters.rating || []
  const all = options.ratings || []
  const label = selected.length === 0 ? 'All Ratings' : selected.map(r=>`${r}★`).join(', ')
  const toggle = r => {
    const next = selected.includes(r) ? selected.filter(x=>x!==r) : [...selected, r]
    onChange('rating', next)
  }
  return (
    <Dropdown trigger={open => <PillBtn label={label} active={selected.length > 0} />}>
      {(close) => (
        <div style={{ padding:8, display:'flex', flexDirection:'column', gap:2 }}>
          {all.map(r => {
            const sel = selected.includes(r)
            const stars = Math.round(parseFloat(r))
            const color = stars>=4?'#22c55e':stars===3?'#eab308':'#ef4444'
            return (
              <button key={r} onClick={() => toggle(r)} style={{
                display:'flex', alignItems:'center', gap:8, padding:'7px 10px', borderRadius:6,
                background:sel?`${color}12`:'transparent', border:'none', cursor:'pointer',
                color:sel?color:'var(--text-muted)', fontSize:12, fontWeight:sel?600:400,
              }}>
                <span style={{ color, fontSize:13 }}>{'★'.repeat(stars)}{'☆'.repeat(Math.max(0,5-stars))}</span>
                {r} stars
                {sel && <span style={{ marginLeft:'auto', fontSize:11 }}>✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </Dropdown>
  )
}

// ── MAIN FilterBar ────────────────────────────────────────────────────────────
export default function FilterBar({ filters, options, onChange, tab }) {
  const showReviewFilters = tab === 'reviews'

  const isAll = !filters.product?.length || filters.product.length === (options.products||[]).length
  const hasDate = (filters.date_from || filters.date_to) && !((!filters.date_from) && (!filters.date_to))
  const hasSentiment = (filters.sentiment||[]).length > 0
  const hasRating = (filters.rating||[]).length > 0
  const hasAnyActive = !isAll || hasDate || hasSentiment || hasRating

  const resetAll = () => {
    onChange('product', options.products || [])
    onChange('date_from', null)
    onChange('date_to', null)
    onChange('sentiment', [])
    onChange('rating', [])
  }

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
    <div style={{
      display:'flex', alignItems:'center', gap:8, flexWrap:'wrap',
      padding:'10px 14px',
      background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10,
    }}>
      {/* Label */}
      <div style={{ display:'flex', alignItems:'center', gap:5, marginRight:4 }}>
        <SlidersHorizontal size={13} style={{ color:'var(--text-muted)' }} />
        <span style={{ fontSize:11, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--text-muted)' }}>Filters</span>
      </div>

      {/* Divider */}
      <div style={{ width:1, height:20, background:'var(--border)', flexShrink:0 }} />

      {/* Date */}
      <DateDropdown filters={filters} onChange={onChange} />

      {/* Product */}
      <ProductDropdown filters={filters} options={options} onChange={onChange} />

      {/* Reviews-only filters */}
      {showReviewFilters && <>
        <div style={{ width:1, height:20, background:'var(--border)', flexShrink:0 }} />
        <span style={{ fontSize:10, color:'var(--text-muted)', fontStyle:'italic' }}>Reviews only:</span>
        <SentimentDropdown filters={filters} onChange={onChange} />
        <RatingDropdown filters={filters} options={options} onChange={onChange} />
      </>}

      {/* Active filter chips */}
      {hasAnyActive && (
        <>
          <div style={{ width:1, height:20, background:'var(--border)', flexShrink:0 }} />
          <div style={{ display:'flex', gap:5, flexWrap:'wrap', alignItems:'center' }}>
            {!isAll && filters.product?.length < (options.products||[]).length && (
              <ActiveChip
                label={`${filters.product.length} product${filters.product.length!==1?'s':''}`}
                onRemove={() => onChange('product', options.products||[])}
              />
            )}
            {hasDate && (
              <ActiveChip
                label={
                  activePreset && activePreset !== 'All'
                    ? `Last ${activePreset}`
                    : `${fmtDate(filters.date_from)} → ${fmtDate(filters.date_to)}`
                }
                onRemove={() => { onChange('date_from',null); onChange('date_to',null) }}
              />
            )}
            {(filters.sentiment||[]).map(s => (
              <ActiveChip key={s} label={s} color={SC[s]}
                onRemove={() => onChange('sentiment',(filters.sentiment||[]).filter(x=>x!==s))} />
            ))}
            {(filters.rating||[]).map(r => (
              <ActiveChip key={r} label={`${r}★`}
                onRemove={() => onChange('rating',(filters.rating||[]).filter(x=>x!==r))} />
            ))}
          </div>
        </>
      )}

      {/* Reset */}
      {hasAnyActive && (
        <button onClick={resetAll} style={{
          marginLeft:'auto', display:'flex', alignItems:'center', gap:4,
          padding:'4px 10px', borderRadius:6, border:'1px solid var(--border)',
          background:'transparent', color:'var(--text-muted)', fontSize:11,
          cursor:'pointer', fontFamily:'DM Sans', transition:'all 0.15s',
        }}>
          <X size={11} /> Reset
        </button>
      )}

      {/* Scope note for non-reviews tabs */}
      {!showReviewFilters && (
        <div style={{ marginLeft:'auto', fontSize:10, color:'var(--text-muted)', fontStyle:'italic' }}>
          Sentiment & rating filters apply to Reviews tab only
        </div>
      )}
    </div>
  )
}