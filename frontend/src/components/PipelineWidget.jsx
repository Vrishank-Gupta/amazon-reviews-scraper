import { useState, useEffect } from 'react'
import { fetchPipelineStatus, runPipeline, fetchAsins, saveAsin, fetchCategories, saveCategory, deleteCategory } from '../api'
import { CheckCircle2, AlertCircle, Clock, Database, RefreshCw, Play, Loader2, ChevronDown, Plus, Trash2 } from 'lucide-react'

function StatusPill({ daysAgo }) {
  if (daysAgo === null || daysAgo === undefined)
    return <span style={pill('#94a3b8')}><Clock size={11} /> No data yet</span>
  if (daysAgo === 0)
    return <span style={pill('#22c55e')}><CheckCircle2 size={11} /> Scraped today</span>
  if (daysAgo <= 7)
    return <span style={pill('#22c55e')}><CheckCircle2 size={11} /> {daysAgo}d ago — fresh</span>
  if (daysAgo <= 14)
    return <span style={pill('#eab308')}><Clock size={11} /> {daysAgo}d ago</span>
  return <span style={pill('#ef4444')}><AlertCircle size={11} /> {daysAgo}d ago — stale</span>
}

function pill(color) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '3px 10px', borderRadius: 20,
    background: color + '18', border: `1px solid ${color}40`,
    fontSize: 11, fontWeight: 600, color,
  }
}

function Stat({ label, value, sub }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
      <span style={{ fontSize: 18, fontFamily: 'Bebas Neue', letterSpacing: '0.04em', color: 'var(--text)', lineHeight: 1 }}>{value}</span>
      {sub && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{sub}</span>}
    </div>
  )
}

function Check({ sel }) {
  return (
    <span style={{
      width: 13, height: 13, borderRadius: 3, flexShrink: 0,
      border: `1.5px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
      background: sel ? 'var(--accent)' : 'transparent',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 9, color: '#fff',
    }}>{sel ? '✓' : ''}</span>
  )
}

export default function PipelineWidget() {
  const [status, setStatus]           = useState(null)
  const [refreshing, setRefreshing]   = useState(false)
  const [days, setDays]               = useState(30)
  const [asins, setAsins]             = useState([])        // [{ asin, product_name, category }]
  const [selectedAsins, setSelectedAsins] = useState([])   // [] = all
  const [asinOpen, setAsinOpen]       = useState(false)
  const [running, setRunning]         = useState(false)
  const [error, setError]             = useState(null)
  const [success, setSuccess]         = useState(false)
  const [asinForm, setAsinForm]       = useState({ asin: '', product_name: '', category: '' })
  const [savingAsin, setSavingAsin]   = useState(false)
  const [asinMessage, setAsinMessage] = useState(null)
  const [categories, setCategories]   = useState([])
  const [newCategory, setNewCategory] = useState('')
  const [savingCategory, setSavingCategory] = useState(false)
  const [categoryMessage, setCategoryMessage] = useState(null)
  const [deletingCategory, setDeletingCategory] = useState(null)

  const loadAsins = async () => {
    try {
      const data = await fetchAsins()
      setAsins(Array.isArray(data) ? data : [])
    } catch (_) {}
  }

  const loadCategories = async () => {
    try {
      const data = await fetchCategories()
      setCategories(Array.isArray(data) ? data : [])
    } catch (_) {}
  }

  const load = async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true)
    try {
      const data = await fetchPipelineStatus()
      setStatus(data)
    } catch (e) { console.error(e) }
    finally { setRefreshing(false) }
  }

  useEffect(() => {
    load()
    loadAsins()
    loadCategories()
    const id = setInterval(() => load(), 30 * 1000)
    return () => clearInterval(id)
  }, [])

  // Build category → products tree from asins list
  const categoryTree = asins.reduce((tree, row) => {
    const cat = row.category || 'Uncategorised'
    if (!tree[cat]) tree[cat] = []
    tree[cat].push(row)
    return tree
  }, {})
  const groupedCategories = Object.keys(categoryTree)
  const managedCategories = categories

  const toggleAsin = (asin) => {
    setSelectedAsins(prev =>
      prev.includes(asin) ? prev.filter(a => a !== asin) : [...prev, asin]
    )
  }

  const toggleCategory = (cat) => {
    const catAsins = categoryTree[cat].map(r => r.asin)
    const allSelected = catAsins.every(a => selectedAsins.includes(a))
    if (allSelected) {
      setSelectedAsins(prev => prev.filter(a => !catAsins.includes(a)))
    } else {
      setSelectedAsins(prev => [...new Set([...prev, ...catAsins])])
    }
  }

  const isCatSelected = (cat) => {
    const catAsins = categoryTree[cat].map(r => r.asin)
    return catAsins.length > 0 && catAsins.every(a => selectedAsins.includes(a))
  }
  const isCatPartial = (cat) => {
    const catAsins = categoryTree[cat].map(r => r.asin)
    return catAsins.some(a => selectedAsins.includes(a)) && !catAsins.every(a => selectedAsins.includes(a))
  }

  const handleRun = async () => {
    setError(null)
    setSuccess(false)
    setRunning(true)
    try {
      await runPipeline(days, selectedAsins)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 4000)
      const startTotal = status?.total_reviews || 0
      let attempts = 0
      const poll = setInterval(async () => {
        attempts++
        try {
          const fresh = await fetchPipelineStatus()
          setStatus(fresh)
          if (fresh?.total_reviews > startTotal || attempts >= 80) {
            clearInterval(poll)
            setRunning(false)
          }
        } catch (_) {}
      }, 15000)
    } catch (e) {
      setError(e.message)
      setRunning(false)
    }
  }

  const handleSaveAsin = async () => {
    setError(null)
    setAsinMessage(null)
    const payload = {
      asin: asinForm.asin.trim().toUpperCase(),
      product_name: asinForm.product_name.trim(),
      category: asinForm.category.trim(),
    }
    if (!payload.asin) {
      setError('Please enter an ASIN before saving.')
      return
    }
    if (!payload.product_name) {
      setError('Please enter a product name before saving.')
      return
    }
    if (!payload.category) {
      setError('Please select a category before saving.')
      return
    }

    setSavingAsin(true)
    try {
      const saved = await saveAsin(payload)
      await loadAsins()
      await loadCategories()
      setSelectedAsins(prev => prev.includes(saved.asin) ? prev : [...prev, saved.asin])
      setAsinForm({ asin: '', product_name: '', category: payload.category })
      setAsinMessage(saved.message)
      setTimeout(() => setAsinMessage(null), 4000)
    } catch (e) {
      setError(e.message)
    } finally {
      setSavingAsin(false)
    }
  }

  const handleSaveCategory = async () => {
    setError(null)
    setCategoryMessage(null)
    const category = newCategory.trim()
    if (!category) {
      setError('Please enter a category name before saving.')
      return
    }

    setSavingCategory(true)
    try {
      const saved = await saveCategory(category)
      await loadCategories()
      setAsinForm(f => ({ ...f, category: saved.category }))
      setNewCategory('')
      setCategoryMessage(saved.message)
      setTimeout(() => setCategoryMessage(null), 4000)
    } catch (e) {
      setError(e.message)
    } finally {
      setSavingCategory(false)
    }
  }

  const handleDeleteCategory = async (categoryName) => {
    setError(null)
    setCategoryMessage(null)
    setDeletingCategory(categoryName)
    try {
      const removed = await deleteCategory(categoryName)
      await loadCategories()
      if (asinForm.category === categoryName) {
        setAsinForm(f => ({ ...f, category: '' }))
      }
      setCategoryMessage(removed.message)
      setTimeout(() => setCategoryMessage(null), 4000)
    } catch (e) {
      setError(e.message)
    } finally {
      setDeletingCategory(null)
    }
  }

  const fmtDate = (d) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const coveragePct = status?.total_reviews > 0
    ? Math.round((status.tagged_reviews / status.total_reviews) * 100) : 0

  const asinLabel = selectedAsins.length === 0
    ? 'All products'
    : `${selectedAsins.length} of ${asins.length} selected`

  return (
    <div style={{
      background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '16px 20px',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Database size={14} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontFamily: 'Bebas Neue', fontSize: 17, letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
            DATA STATUS
          </span>
        </div>
        <button onClick={() => load(true)} disabled={refreshing} title="Refresh"
          style={{ background: 'none', border: 'none', cursor: refreshing ? 'default' : 'pointer', color: 'var(--text-muted)', padding: 4, opacity: refreshing ? 0.5 : 1 }}>
          <RefreshCw size={13} className={refreshing ? 'spin' : ''} />
        </button>
      </div>

      {/* Status */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <StatusPill daysAgo={status?.days_ago} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Last scrape: <span style={{ color: 'var(--text)' }}>{fmtDate(status?.last_scrape)}</span>
        </span>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, paddingTop: 4, borderTop: '1px solid var(--border)' }}>
        <Stat label="Total"  value={status?.total_reviews?.toLocaleString() ?? '—'} sub="reviews" />
        <Stat label="Last 7d" value={status?.recent_reviews?.toLocaleString() ?? '—'} sub="new" />
        <Stat label="Tagged" value={status ? `${coveragePct}%` : '—'} sub={`${status?.tagged_reviews?.toLocaleString() ?? 0}`} />
      </div>

      {/* Manual run */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4, borderTop: '1px solid var(--border)' }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
          Manual Run
        </span>

        {/* Days input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Fetch last</span>
          <input
            type="number" min={1} max={365} value={days}
            onChange={e => setDays(Math.max(1, Math.min(365, parseInt(e.target.value) || 1)))}
            style={{
              width: 52, padding: '4px 8px',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 6, color: 'var(--text)', fontSize: 12,
              textAlign: 'center', outline: 'none',
            }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>days</span>
        </div>

        {/* Day presets */}
        <div style={{ display: 'flex', gap: 5 }}>
          {[7, 14, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} style={{
              flex: 1, padding: '3px 0', borderRadius: 5, fontSize: 11, cursor: 'pointer',
              border: `1px solid ${days === d ? 'var(--accent)' : 'var(--border)'}`,
              background: days === d ? 'var(--accent)20' : 'transparent',
              color: days === d ? 'var(--accent)' : 'var(--text-muted)',
            }}>
              {d}d
            </button>
          ))}
        </div>

        {/* Product selector — grouped by category */}
        {asins.length > 0 && (
          <div style={{ position: 'relative' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Products</span>

            <button
              onClick={() => setAsinOpen(o => !o)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 10px', borderRadius: 6,
                background: 'var(--surface)', border: `1px solid ${asinOpen ? 'var(--accent)' : 'var(--border)'}`,
                color: selectedAsins.length ? 'var(--text)' : 'var(--text-muted)',
                fontSize: 11, cursor: 'pointer',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {asinLabel}
              </span>
              <ChevronDown size={12} style={{ flexShrink: 0, transform: asinOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>

            {asinOpen && (
              <div style={{
                position: 'absolute', bottom: 'calc(100% + 4px)', left: 0, right: 0,
                background: '#1a1a24', border: '1px solid var(--border)',
                borderRadius: 8, overflow: 'hidden', maxHeight: 300, overflowY: 'auto',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 100,
              }}>

                {/* All products */}
                <button onClick={() => setSelectedAsins([])} style={{
                  width: '100%', padding: '8px 12px', textAlign: 'left',
                  background: selectedAsins.length === 0 ? 'rgba(255,78,26,0.1)' : 'transparent',
                  border: 'none', borderBottom: '1px solid var(--border)',
                  color: selectedAsins.length === 0 ? 'var(--accent)' : 'var(--text-muted)',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 7,
                }}>
                  <Check sel={selectedAsins.length === 0} />
                  All products
                </button>

                {/* Category groups */}
                {groupedCategories.map(cat => (
                  <div key={cat}>
                    {/* Category header row */}
                    <button onClick={() => toggleCategory(cat)} style={{
                      width: '100%', padding: '7px 12px', textAlign: 'left',
                      background: isCatSelected(cat) ? 'rgba(255,78,26,0.08)' : 'transparent',
                      border: 'none', borderBottom: '1px solid var(--border)',
                      color: isCatSelected(cat) ? 'var(--accent)' : 'var(--text)',
                      fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 7,
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>
                      <Check sel={isCatSelected(cat)} />
                      📁 {cat}
                      {isCatPartial(cat) && (
                        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>partial</span>
                      )}
                    </button>

                    {/* Products under category */}
                    {categoryTree[cat].map(({ asin, product_name }) => {
                      const sel = selectedAsins.includes(asin)
                      return (
                        <button key={asin} onClick={() => toggleAsin(asin)} style={{
                          width: '100%', padding: '6px 12px 6px 28px',
                          display: 'flex', alignItems: 'center', gap: 7,
                          background: sel ? 'rgba(255,78,26,0.05)' : 'transparent',
                          border: 'none', borderBottom: '1px solid var(--border)',
                          color: sel ? 'var(--text)' : 'var(--text-muted)',
                          fontSize: 11, cursor: 'pointer', textAlign: 'left',
                        }}>
                          <Check sel={sel} />
                          <span style={{ overflow: 'hidden' }}>
                            <span style={{ display: 'block', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {product_name}
                            </span>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{asin}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Quick add ASIN */}
        <div style={{ display:'flex', flexDirection:'column', gap:6, padding:'10px 0 2px', borderTop:'1px solid var(--border)' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Add ASIN to list</span>
          <div style={{ display:'flex', gap:6 }}>
            <input
              value={newCategory}
              onChange={e => setNewCategory(e.target.value)}
              placeholder="Add new category"
              style={{
                flex:1, padding: '7px 10px',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 6, color: 'var(--text)', fontSize: 12, outline: 'none',
              }}
            />
            <button
              onClick={handleSaveCategory}
              disabled={savingCategory}
              style={{
                display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                padding:'0 10px', borderRadius:8, cursor:savingCategory ? 'not-allowed' : 'pointer',
                border:'1px solid rgba(96,165,250,0.28)', background:'rgba(96,165,250,0.08)',
                color:savingCategory ? 'var(--text-muted)' : '#60a5fa', fontFamily:'DM Sans', fontSize:11, fontWeight:700,
              }}
            >
              {savingCategory ? <Loader2 size={12} className="spin" /> : <Plus size={12} />}
              CATEGORY
            </button>
          </div>
          {categoryMessage && <span style={{ fontSize: 11, color: '#60a5fa', lineHeight: 1.4 }}>{categoryMessage}</span>}
          {managedCategories.length > 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 6,
              padding: '8px 10px', borderRadius: 8,
              background: 'rgba(148,163,184,0.06)', border: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                Unused categories can be deleted here. If one was mis-added and is already assigned to ASINs,
                re-save those ASINs under the correct category first, then remove it.
              </span>
              {managedCategories.map(cat => {
                const deleting = deletingCategory === cat.name
                return (
                  <div key={cat.name} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    padding: '6px 0', borderTop: '1px solid rgba(148,163,184,0.12)',
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cat.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {cat.usage_count === 0 ? 'Unused' : `Used by ${cat.usage_count} ASIN${cat.usage_count === 1 ? '' : 's'}`}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteCategory(cat.name)}
                      disabled={!cat.can_delete || deleting}
                      title={cat.can_delete ? 'Delete unused category' : 'Reassign ASINs before deleting this category'}
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        padding: '6px 9px', borderRadius: 8,
                        border: `1px solid ${cat.can_delete ? 'rgba(239,68,68,0.28)' : 'rgba(148,163,184,0.18)'}`,
                        background: cat.can_delete ? 'rgba(239,68,68,0.08)' : 'rgba(148,163,184,0.08)',
                        color: cat.can_delete ? '#f87171' : 'var(--text-muted)',
                        cursor: (!cat.can_delete || deleting) ? 'not-allowed' : 'pointer',
                        opacity: deleting ? 0.8 : 1,
                      }}
                    >
                      {deleting ? <Loader2 size={12} className="spin" /> : <Trash2 size={12} />}
                      <span style={{ fontSize: 11, fontWeight: 700 }}>{cat.can_delete ? 'Delete' : 'In use'}</span>
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          <input
            value={asinForm.asin}
            onChange={e => setAsinForm(f => ({ ...f, asin: e.target.value.toUpperCase() }))}
            placeholder="ASIN"
            maxLength={20}
            style={{
              width: '100%', padding: '7px 10px',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 6, color: 'var(--text)', fontSize: 12, outline: 'none',
            }}
          />
          <input
            value={asinForm.product_name}
            onChange={e => setAsinForm(f => ({ ...f, product_name: e.target.value }))}
            placeholder="Product name"
            style={{
              width: '100%', padding: '7px 10px',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 6, color: 'var(--text)', fontSize: 12, outline: 'none',
            }}
          />
          <select
            value={asinForm.category}
            onChange={e => setAsinForm(f => ({ ...f, category: e.target.value }))}
            style={{
              width: '100%', padding: '7px 10px',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 6, color: 'var(--text)', fontSize: 12, outline: 'none',
              fontFamily: 'DM Sans',
            }}
          >
            <option value="">Select category</option>
            {managedCategories.map(cat => (
              <option key={cat.name} value={cat.name}>{cat.name}</option>
            ))}
          </select>
          <button
            onClick={handleSaveAsin}
            disabled={savingAsin || managedCategories.length === 0}
            style={{
              display:'flex', alignItems:'center', justifyContent:'center', gap:7,
              padding:'8px 0', borderRadius:8, cursor:(savingAsin || managedCategories.length === 0) ? 'not-allowed' : 'pointer',
              border:'1px solid rgba(255,78,26,0.28)',
              background:'rgba(255,78,26,0.08)', color:(savingAsin || managedCategories.length === 0) ? 'var(--text-muted)' : 'var(--accent)',
              fontFamily:'DM Sans', fontSize:12, fontWeight:700,
            }}
          >
            {savingAsin ? <><Loader2 size={13} className="spin" /> SAVING…</> : <><Plus size={13} /> ADD TO CSV</>}
          </button>
          {managedCategories.length === 0 && (
            <span style={{ fontSize: 11, color: '#eab308', lineHeight: 1.4 }}>
              Add a category first, then assign the new ASIN to it.
            </span>
          )}
          {asinMessage && <span style={{ fontSize: 11, color: '#22c55e', lineHeight: 1.4 }}>{asinMessage}</span>}
        </div>

        {/* Run button */}
        <button
          onClick={handleRun} disabled={running}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            padding: '9px 0', borderRadius: 8, border: 'none',
            cursor: running ? 'not-allowed' : 'pointer',
            background: success ? '#22c55e' : running ? 'var(--border)' : 'var(--accent)',
            color: running ? 'var(--text-muted)' : '#fff',
            fontFamily: 'Bebas Neue', fontSize: 14, letterSpacing: '0.1em',
            transition: 'all 0.2s',
          }}
        >
          {running ? <><Loader2 size={13} className="spin" /> RUNNING…</>
            : success ? <><CheckCircle2 size={13} /> STARTED!</>
            : <><Play size={13} fill="currentColor" /> RUN NOW</>}
        </button>

        {error && <span style={{ fontSize: 11, color: '#ef4444', lineHeight: 1.4 }}>{error}</span>}
      </div>
    </div>
  )
}
