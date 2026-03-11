import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

// ── Reusable InfoTip ──────────────────────────────────────────────────────────
// Uses a portal so the tooltip renders into document.body — never clipped by
// sticky headers, overflow:hidden ancestors, or low stacking contexts.
export function InfoTip({ text }) {
  const [show, setShow]   = useState(false)
  const [pos,  setPos]    = useState({ top: 0, left: 0 })
  const btnRef            = useRef(null)

  useEffect(() => {
    if (!show || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setPos({
      // Place above the ? button; clamp so it never goes off-screen top
      top:  Math.max(8, r.top + window.scrollY - 8),
      left: r.left + r.width / 2 + window.scrollX,
    })
  }, [show])

  const tooltip = show ? createPortal(
    <div style={{
      position: 'absolute',
      top:  pos.top,
      left: pos.left,
      transform: 'translate(-50%, -100%)',
      background: '#1a1a28',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '10px 12px',
      fontSize: 11,
      color: 'var(--text)',
      lineHeight: 1.6,
      width: 240,
      zIndex: 9999,
      boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
      pointerEvents: 'none',
      whiteSpace: 'normal',
    }}>
      {text}
      <div style={{
        position:'absolute', bottom:-5, left:'50%',
        transform:'translateX(-50%)',
        width:8, height:8,
        background:'#1a1a28',
        borderRight:'1px solid var(--border)',
        borderBottom:'1px solid var(--border)',
        rotate:'45deg',
      }} />
    </div>,
    document.body
  ) : null

  return (
    <span style={{ position:'relative', display:'inline-flex', alignItems:'center' }}>
      <span
        ref={btnRef}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{
          display:'inline-flex', alignItems:'center', justifyContent:'center',
          width:15, height:15, borderRadius:'50%',
          background:'var(--surface2)', border:'1px solid var(--border)',
          color:'var(--text-muted)', fontSize:9, fontWeight:700,
          cursor:'help', lineHeight:1, flexShrink:0, fontFamily:'DM Sans',
        }}
      >?</span>
      {tooltip}
    </span>
  )
}

// ── SentBadge ─────────────────────────────────────────────────────────────────
export function SentBadge({ s }) {
  const map = {
    Negative: ['#ef4444','rgba(239,68,68,0.12)','▼'],
    Positive: ['#22c55e','rgba(34,197,94,0.12)','▲'],
    Neutral:  ['#eab308','rgba(234,179,8,0.12)','●'],
  }
  const [color, bg, icon] = map[s] || ['#94a3b8','transparent','●']
  return (
    <span style={{ padding:'2px 8px', borderRadius:10, fontSize:10, fontWeight:700, color, background:bg, border:`1px solid ${color}40` }}>
      {icon} {s}
    </span>
  )
}

// ── StarLabel ─────────────────────────────────────────────────────────────────
export function StarLabel({ rating }) {
  const n = Math.round(parseFloat(rating))||0
  const color = n>=4?'#22c55e':n===3?'#eab308':'#ef4444'
  return (
    <span style={{ color, fontSize:12 }}>
      {'★'.repeat(n)}{'☆'.repeat(Math.max(0,5-n))}
      <span style={{ color:'var(--text-muted)', marginLeft:4 }}>{n} star{n!==1?'s':''}</span>
    </span>
  )
}

// ── Delta ─────────────────────────────────────────────────────────────────────
export function Delta({ val, invertColor=false }) {
  if (val===undefined||val===null) return <span style={{ color:'var(--text-muted)' }}>—</span>
  const good = invertColor ? val<0 : val>0
  const color = val===0?'var(--text-muted)':good?'#22c55e':'#ef4444'
  const arrow = val===0?'→':val>0?`↑ +${val}`:`↓ ${val}`
  return <span style={{ color, fontWeight:700, fontSize:12 }}>{arrow}</span>
}

// ── Card ──────────────────────────────────────────────────────────────────────
export function Card({ title, sub, tip, children, controls, accent, style: extraStyle }) {
  return (
    <div style={{ background:'var(--surface)', border:`1px solid ${accent||'var(--border)'}`, borderRadius:12, padding:'18px 20px', display:'flex', flexDirection:'column', gap:14, ...extraStyle }}>
      {(title||controls) && (
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10, flexWrap:'wrap' }}>
          <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
            <div style={{ display:'flex', alignItems:'center', gap:7 }}>
              <span style={{ fontFamily:'Bebas Neue', fontSize:17, letterSpacing:'0.06em', color:'var(--text-muted)' }}>{title}</span>
              {tip && <InfoTip text={tip} />}
            </div>
            {sub && <div style={{ fontSize:11, color:'var(--text-muted)' }}>{sub}</div>}
          </div>
          {controls}
        </div>
      )}
      {children}
    </div>
  )
}