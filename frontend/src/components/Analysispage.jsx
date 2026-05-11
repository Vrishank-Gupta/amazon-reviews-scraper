import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Bar,
  ReferenceLine,
} from 'recharts'
import { fetchAnalysis, fetchCxoTrends, fetchWordCloud, fetchSummary } from '../api'
import { Card } from './shared'
import RatingTrendChart from './RatingTrendChart'
import ReviewsDrawer from './ReviewsDrawer'
import WordCloud from './Wordcloud'

function fmtDay(day) {
  try {
    return new Date(day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  } catch {
    return day
  }
}

function getDefaultWidgetProduct({ parentProducts, parentCategory, scopedProducts, widgetValue }) {
  if (widgetValue !== undefined) return widgetValue
  if (parentProducts.length === 1) return parentProducts[0]
  if (parentProducts.length > 1 || parentCategory) return null
  return scopedProducts[0] || null
}

function Toggle({ value, onChange, options }) {
  return (
    <div style={{ display: 'flex', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: 2, gap: 2 }}>
      {options.map(option => (
        <button
          key={option.v}
          onClick={() => onChange(option.v)}
          style={{
            padding: '3px 10px',
            borderRadius: 5,
            border: 'none',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 600,
            fontFamily: 'DM Sans',
            background: value === option.v ? 'var(--accent)' : 'transparent',
            color: value === option.v ? '#fff' : 'var(--text-muted)',
            transition: 'all 0.15s',
          }}
        >
          {option.l}
        </button>
      ))}
    </div>
  )
}

function EmptyState({ text = 'No data for selected filters.' }) {
  return <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>{text}</div>
}

function getPeriodLabel(filters) {
  if (!filters.date_from && !filters.date_to) return 'All time'
  if (!filters.date_from) return `Up to ${new Date(filters.date_to).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
  const days = Math.round((new Date() - new Date(filters.date_from)) / 86400000)
  if (days <= 8) return 'Last 7 days'
  if (days <= 31) return 'Last 30 days'
  if (days <= 92) return 'Last 90 days'
  const from = new Date(filters.date_from).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  const to = filters.date_to ? new Date(filters.date_to).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Today'
  return `${from} – ${to}`
}

function AlertsBanner({ kpi, momentum }) {
  const total = kpi.total || 0
  const negPct = total ? +((kpi.negative / total) * 100).toFixed(1) : 0
  const alerts = []

  if (negPct > 30) alerts.push({ level: 'critical', text: `Overall negative rate is ${negPct}% — above the 30% problem threshold` })
  else if (negPct > 20) alerts.push({ level: 'warn', text: `Negative rate is ${negPct}% — approaching the 30% watch threshold` })

  const newIssues = (momentum || []).filter(m => m.first === 0 && m.second > 0)
  if (newIssues.length > 0)
    alerts.push({ level: 'warn', text: `${newIssues.length} new issue${newIssues.length > 1 ? 's' : ''} detected: ${newIssues.slice(0, 2).map(m => m.category).join(', ')}${newIssues.length > 2 ? ` +${newIssues.length - 2} more` : ''}` })

  ;(momentum || []).filter(m => m.first > 0 && (m.pct_change || 0) >= 50).slice(0, 1)
    .forEach(m => alerts.push({ level: 'warn', text: `"${m.category}" rising ${m.pct_change}% vs prior period` }))

  if (!alerts.length) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {alerts.slice(0, 3).map((alert, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
          background: alert.level === 'critical' ? 'rgba(239,68,68,0.07)' : 'rgba(234,179,8,0.07)',
          border: `1px solid ${alert.level === 'critical' ? 'rgba(239,68,68,0.25)' : 'rgba(234,179,8,0.25)'}`,
          borderLeft: `3px solid ${alert.level === 'critical' ? '#ef4444' : '#eab308'}`,
          borderRadius: 8, fontSize: 12,
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: alert.level === 'critical' ? '#ef4444' : '#eab308', flexShrink: 0, whiteSpace: 'nowrap' }}>
            {alert.level === 'critical' ? '● CRITICAL' : '▲ WATCH'}
          </span>
          <span style={{ color: 'var(--text)', lineHeight: 1.4 }}>{alert.text}</span>
        </div>
      ))}
    </div>
  )
}

function KeywordToneTabs({ value, onChange }) {
  const options = [
    ['mixed', 'Mixed'],
    ['negative', 'Negative'],
    ['neutral', 'Neutral'],
    ['positive', 'Positive'],
  ]

  return (
    <div style={{ display: 'flex', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: 2, gap: 2, flexWrap: 'wrap' }}>
      {options.map(([tone, label]) => (
        <button
          key={tone}
          onClick={() => onChange(tone)}
          style={{
            padding: '3px 10px',
            borderRadius: 5,
            border: 'none',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 600,
            fontFamily: 'DM Sans',
            background: value === tone ? 'var(--accent)' : 'transparent',
            color: value === tone ? '#fff' : 'var(--text-muted)',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function buildWordRows(words, tone) {
  const countKey = tone === 'mixed' ? 'count' : tone
  return (words || [])
    .map(word => ({ ...word, count: tone === 'mixed' ? word.count : (word[countKey] || 0) }))
    .filter(word => word.count > 0)
    .sort((left, right) => right.count - left.count)
}

function OverviewCards({ kpi, productCount, periodLabel }) {
  const total = kpi.total || 0
  const negative = kpi.negative || 0
  const positive = kpi.positive || 0
  const neutral = kpi.neutral || 0
  const negativePct = total ? ((negative / total) * 100).toFixed(1) : '0.0'
  const positivePct = total ? ((positive / total) * 100).toFixed(1) : '0.0'
  const neutralPct = total ? ((neutral / total) * 100).toFixed(1) : '0.0'

  const cards = [
    { label: 'Feedback Volume', value: total.toLocaleString(), sub: `${productCount} products · ${periodLabel}`, color: '#60a5fa' },
    { label: '1-2 Stars', value: negative.toLocaleString(), sub: `${negativePct}% of reviews · ${periodLabel}`, color: '#ef4444' },
    { label: '4-5 Stars', value: positive.toLocaleString(), sub: `${positivePct}% of reviews · ${periodLabel}`, color: '#22c55e' },
    { label: '3 Stars', value: neutral.toLocaleString(), sub: `${neutralPct}% of reviews · ${periodLabel}`, color: '#eab308' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {cards.map(card => (
        <div key={card.label} style={{ background: 'var(--surface)', border: `1px solid ${card.color}25`, borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 5, borderLeft: `3px solid ${card.color}` }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{card.label}</div>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: 30, lineHeight: 1, color: card.color }}>{card.value}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{card.sub}</div>
        </div>
      ))}
    </div>
  )
}

function VolumeTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload || {}
  const total = (point.Positive || 0) + (point.Negative || 0) + (point.Neutral || 0)

  return (
    <div style={{ background: '#16161f', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', fontSize: 12, minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
      <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--text-muted)', fontSize: 11, letterSpacing: '0.06em' }}>{fmtDay(label)}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ color: 'var(--text-muted)' }}>Reviews that day</span>
          <span style={{ fontWeight: 700 }}>{total}</span>
        </div>
        {[
          ['Negative', point.Negative, '#ef4444'],
          ['Positive', point.Positive, '#22c55e'],
          ['Neutral', point.Neutral, '#eab308'],
        ].map(([text, value, color]) => (
          <div key={text} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ color }}>{text}</span>
            <span style={{ fontWeight: 700 }}>{value || 0}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RateTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const rolling = payload.find(point => point.dataKey === 'rolling_neg')?.value
  const daily = payload.find(point => point.dataKey === 'neg_rate')?.value
  const point = payload[0]?.payload || {}
  const total = (point.Positive || 0) + (point.Negative || 0) + (point.Neutral || 0)

  return (
    <div style={{ background: '#16161f', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', fontSize: 12, minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
      <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--text-muted)', fontSize: 11, letterSpacing: '0.06em' }}>{fmtDay(label)}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ color: 'var(--text-muted)' }}>7d rolling neg rate</span>
          <span style={{ fontWeight: 700, color: '#ff4e1a' }}>{rolling}%</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ color: 'var(--text-muted)' }}>Daily neg rate</span>
          <span style={{ fontWeight: 700, color: '#ef4444' }}>{daily}%</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ color: 'var(--text-muted)' }}>Reviews that day</span>
          <span style={{ fontWeight: 700 }}>{total}</span>
        </div>
      </div>
    </div>
  )
}

function EmergingIssues({ momentum, onSelect }) {
  const items = [...(momentum || [])]
    .filter(item => (item.second || 0) > 0 && ((item.first === 0 && item.second > 0) || (item.change || 0) > 0))
    .sort((left, right) => {
      const leftIsNew = left.first === 0 ? 1 : 0
      const rightIsNew = right.first === 0 ? 1 : 0
      if (leftIsNew !== rightIsNew) return rightIsNew - leftIsNew
      return (right.change || 0) - (left.change || 0)
    })
    .slice(0, 5)

  if (!items.length) return <EmptyState />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(item => {
        const isNew = item.first === 0 && item.second > 0
        const signalColor = isNew ? '#f97316' : '#ef4444'
        const pctLabel = isNew ? 'New' : (item.pct_change > 0 ? `+${item.pct_change}%` : `${item.pct_change}%`)

        return (
          <button
            key={item.category}
            onClick={() => onSelect?.(item.category)}
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${signalColor}24`,
              borderRadius: 10,
              padding: '10px 12px',
              display: 'grid',
              gridTemplateColumns: '1fr auto auto',
              gap: 10,
              alignItems: 'center',
              cursor: 'pointer',
              color: 'inherit',
              textAlign: 'left',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{item.category}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {isNew ? 'New issue in the recent half of the period' : `Up from ${item.first} to ${item.second} mentions`}
              </div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: signalColor }}>
              {isNew ? 'NEW' : `${item.change > 0 ? '+' : ''}${item.change}`}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pctLabel}</div>
          </button>
        )
      })}
    </div>
  )
}

function CategoryReviewMix({ rows, onSelect }) {
  if (!rows.length) return <EmptyState />
  const max = Math.max(...rows.map(row => row.total || 0), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map(row => {
        const total = row.total || 0
        const scale = total / max
        const negWidth = total ? (row.Negative / total) * 100 : 0
        const neuWidth = total ? (row.Neutral / total) * 100 : 0
        const posWidth = total ? (row.Positive / total) * 100 : 0

        return (
          <div key={row.category} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 54px', gap: 12, alignItems: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{row.category}</div>
            <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
              <div style={{ width: `${Math.max(scale * 100, 8)}%`, minWidth: 120, maxWidth: '100%' }}>
                <div style={{ display: 'flex', height: 16, borderRadius: 999, overflow: 'hidden', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }}>
                  <button onClick={() => row.Negative > 0 && onSelect?.(row.category, 'Negative')} disabled={row.Negative === 0} style={{ width: `${negWidth}%`, minWidth: row.Negative ? 10 : 0, background: '#ef4444', border: 'none', cursor: row.Negative ? 'pointer' : 'default', opacity: row.Negative ? 1 : 0 }} title={`${row.category} - Negative - ${row.Negative} reviews`} />
                  <button onClick={() => row.Neutral > 0 && onSelect?.(row.category, 'Neutral')} disabled={row.Neutral === 0} style={{ width: `${neuWidth}%`, minWidth: row.Neutral ? 10 : 0, background: '#eab308', border: 'none', cursor: row.Neutral ? 'pointer' : 'default', opacity: row.Neutral ? 1 : 0 }} title={`${row.category} - Neutral - ${row.Neutral} reviews`} />
                  <button onClick={() => row.Positive > 0 && onSelect?.(row.category, 'Positive')} disabled={row.Positive === 0} style={{ width: `${posWidth}%`, minWidth: row.Positive ? 10 : 0, background: '#22c55e', border: 'none', cursor: row.Positive ? 'pointer' : 'default', opacity: row.Positive ? 1 : 0 }} title={`${row.category} - Positive - ${row.Positive} reviews`} />
                </div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>{total}</div>
          </div>
        )
      })}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-muted)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: '#ef4444' }} /> Negative</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: '#eab308' }} /> Neutral</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: '#22c55e' }} /> Positive</span>
      </div>
    </div>
  )
}

function CategoryWordCloudPanel({ category, sentiment, filters, onClose }) {
  const [words, setWords] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeWord, setActiveWord] = useState(null)
  const defaultTone = sentiment === 'Negative' ? 'negative' : sentiment === 'Positive' ? 'positive' : sentiment === 'Neutral' ? 'neutral' : 'mixed'
  const [tone, setTone] = useState(defaultTone)

  useEffect(() => {
    setTone(defaultTone)
  }, [defaultTone, category, sentiment])

  useEffect(() => {
    if (!category) return
    setLoading(true)
    setActiveWord(null)
    fetchWordCloud(filters, category)
      .then(payload => setWords(payload || []))
      .catch(() => setWords([]))
      .finally(() => setLoading(false))
  }, [category, JSON.stringify(filters)])

  const toneLabel = tone.charAt(0).toUpperCase() + tone.slice(1)
  const toneColor = tone === 'negative' ? '#ef4444' : tone === 'positive' ? '#22c55e' : tone === 'neutral' ? '#eab308' : 'var(--text-muted)'
  const wordRows = buildWordRows(words, tone)
  const drawerSentiment = tone === 'mixed' ? null : toneLabel

  return (
    <div style={{ marginTop: 14, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'Bebas Neue', fontSize: 16, letterSpacing: '0.06em', color: 'var(--text-muted)' }}>Keyword Drill-Down</span>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: toneColor, background: `${toneColor}15`, border: `1px solid ${toneColor}35`, borderRadius: 999, padding: '3px 8px' }}>
              {category} - {toneLabel}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Click a keyword to open matching reviews for this category. Use the tone tabs to switch between mixed, negative, neutral, and positive keyword views.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <KeywordToneTabs value={tone} onChange={setTone} />
          <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-muted)', fontSize: 11, padding: '5px 10px', cursor: 'pointer', fontFamily: 'DM Sans' }}>
            Close
          </button>
        </div>
      </div>

      {loading ? (
        <EmptyState text="Loading keyword cloud..." />
      ) : !wordRows.length ? (
        <EmptyState text="No keyword data for this category in the selected filters." />
      ) : (
        <WordCloud data={wordRows} activeWord={activeWord} onWordClick={setActiveWord} />
      )}

      <ReviewsDrawer
        category={activeWord}
        label={activeWord}
        sentiment={drawerSentiment}
        taxonomyCategory={category}
        filters={filters}
        onClose={() => setActiveWord(null)}
      />
    </div>
  )
}

function PortfolioHealthStrip({ healthScore, topIssue, topCat, atRisk, onSelectIssue, onSelectCategory }) {
  const scoreColor = healthScore >= 75 ? '#22c55e' : healthScore >= 55 ? '#eab308' : '#ef4444'
  const cards = [
    {
      label: 'Brand Health',
      icon: '◎',
      content: (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
            <span style={{ fontFamily: 'Bebas Neue', fontSize: 34, lineHeight: 1, color: scoreColor }}>{healthScore.toFixed(0)}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>/ 100</span>
          </div>
          <div style={{ marginTop: 6, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, healthScore)}%`, background: scoreColor, borderRadius: 2, transition: 'width 0.4s ease' }} />
          </div>
          <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>Based on rating + negative share</div>
        </>
      ),
      onClick: null,
    },
    {
      label: 'Top Issue · 7d',
      icon: '⚠',
      content: topIssue ? (
        <>
          <div style={{ marginTop: 6, fontSize: 14, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topIssue.category}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{topIssue.mentions} mentions · {topIssue.isNew ? 'new this period' : 'growing'}</div>
          <div style={{ marginTop: 6, display: 'inline-block', fontSize: 10, fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 999, padding: '2px 8px' }}>Investigate →</div>
        </>
      ) : <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>No notable issues.</div>,
      onClick: topIssue ? () => onSelectIssue?.(topIssue.category) : null,
      hoverColor: 'rgba(239,68,68,0.08)',
    },
    {
      label: 'Top Category',
      icon: '★',
      content: topCat ? (
        <>
          <div style={{ marginTop: 6, fontSize: 14, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topCat.category}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{topCat.total} reviews · {topCat.total ? ((topCat.Positive / topCat.total) * 100).toFixed(0) : 0}% positive</div>
          <div style={{ marginTop: 6, display: 'inline-block', fontSize: 10, fontWeight: 700, color: '#22c55e', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 999, padding: '2px 8px' }}>Performing well</div>
        </>
      ) : <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>—</div>,
      onClick: topCat ? () => onSelectCategory?.(topCat.category) : null,
      hoverColor: 'rgba(34,197,94,0.06)',
    },
    {
      label: 'Most At-Risk',
      icon: '▼',
      content: atRisk ? (
        <>
          <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{atRisk.product_name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{atRisk.review_count} reviews · <span style={{ color: '#ef4444', fontWeight: 700 }}>{atRisk.neg_pct}% neg</span></div>
          <div style={{ marginTop: 6, display: 'inline-block', fontSize: 10, fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 999, padding: '2px 8px' }}>Action needed</div>
        </>
      ) : <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>—</div>,
      onClick: null,
      hoverColor: 'rgba(239,68,68,0.06)',
    },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, padding: '14px 16px', background: 'linear-gradient(135deg, rgba(24,28,44,0.9), rgba(18,22,36,0.95))', border: '1px solid var(--border)', borderRadius: 14 }}>
      {cards.map(card => (
        <div
          key={card.label}
          onClick={card.onClick || undefined}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', cursor: card.onClick ? 'pointer' : 'default', transition: 'border-color 0.15s, background 0.15s' }}
          onMouseEnter={e => { if (card.onClick) { e.currentTarget.style.background = card.hoverColor; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' } }}
          onMouseLeave={e => { if (card.onClick) { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.borderColor = 'var(--border)' } }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            <span>{card.label}</span>
            <span style={{ opacity: 0.5 }}>{card.icon}</span>
          </div>
          {card.content}
        </div>
      ))}
    </div>
  )
}

function AutoInsights({ insights }) {
  if (!insights.length) return null
  const toneColor = { alert: '#ef4444', warn: '#eab308', good: '#22c55e', info: 'var(--text-muted)' }
  return (
    <div style={{ padding: '12px 16px', background: 'linear-gradient(135deg, rgba(24,28,44,0.9), rgba(18,22,36,0.95))', border: '1px solid var(--border)', borderRadius: 12 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>✦</span> Auto-detected signals
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {insights.map((item, i) => (
          <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: toneColor[item.tone] || 'var(--text-muted)', flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{item.title}</span>
            </div>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{item.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AnalysisPage({ filters, allProducts, tree }) {
  const [data, setData] = useState(null)
  const [cxoData, setCxoData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [hasData, setHasData] = useState(false)
  const [trendMode, setTrendMode] = useState('sentiment')
  const [emergingCat, setEmergingCat] = useState(null)
  const [issueFilter, setIssueFilter] = useState(undefined)
  const [localIssueData, setLocalIssueData] = useState(null)
  const [signalProd, setSignalProd] = useState(undefined)
  const [localTrendData, setLocalTrendData] = useState(null)
  const [categoryCloud, setCategoryCloud] = useState(null)
  const [summaryRows, setSummaryRows] = useState([])

  const scopedProducts = useMemo(() => {
    if (filters.product?.length) return filters.product
    if (filters.product_category) return tree?.[filters.product_category] || []
    return allProducts || []
  }, [filters.product, filters.product_category, tree, allProducts])

  const effectiveIssueFilter = getDefaultWidgetProduct({
    parentProducts: filters.product || [],
    parentCategory: filters.product_category,
    scopedProducts,
    widgetValue: issueFilter,
  })
  const effectiveSignalProd = getDefaultWidgetProduct({
    parentProducts: filters.product || [],
    parentCategory: filters.product_category,
    scopedProducts,
    widgetValue: signalProd,
  })

  useEffect(() => {
    if (issueFilter && !scopedProducts.includes(issueFilter)) setIssueFilter(undefined)
    if (signalProd && !scopedProducts.includes(signalProd)) setSignalProd(undefined)
  }, [JSON.stringify(scopedProducts), issueFilter, signalProd])

  const apiParams = {
    product_category: filters.product_category || null,
    product: filters.product?.length ? filters.product : [],
    date_from: filters.date_from,
    date_to: filters.date_to,
  }

  const load = useCallback(() => {
    if (!allProducts?.length) return
    setLoading(true)
    Promise.all([
      fetchAnalysis(apiParams),
      fetchCxoTrends(apiParams).catch(() => null),
      fetchSummary(apiParams).catch(() => []),
    ])
      .then(([analysis, cxo, summary]) => {
        setData(analysis)
        setCxoData(cxo)
        setSummaryRows(summary || [])
        setHasData(true)
      })
      .finally(() => setLoading(false))
  }, [JSON.stringify(apiParams), allProducts?.length])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!effectiveIssueFilter) {
      setLocalIssueData(null)
      return
    }
    fetchAnalysis({ product: [effectiveIssueFilter], date_from: apiParams.date_from, date_to: apiParams.date_to })
      .then(setLocalIssueData)
      .catch(() => setLocalIssueData(null))
  }, [effectiveIssueFilter, apiParams.date_from, apiParams.date_to])

  useEffect(() => {
    if (!effectiveSignalProd) {
      setLocalTrendData(null)
      return
    }
    fetchCxoTrends({ product: [effectiveSignalProd], date_from: apiParams.date_from, date_to: apiParams.date_to })
      .then(payload => setLocalTrendData(payload || null))
      .catch(() => setLocalTrendData(null))
  }, [effectiveSignalProd, apiParams.date_from, apiParams.date_to])

  const kpi = data?.kpi || {}
  const trend = data?.daily_trend || []
  const dailyRating = cxoData?.daily_rating || []
  const momentum = cxoData?.category_momentum || []
  const periodLabel = getPeriodLabel(filters)
  const activeTrend = localTrendData?.daily_trend ?? trend
  const activeDailyRating = localTrendData?.daily_rating ?? dailyRating
  const displayedCategoryBreakdown = (localIssueData?.category_breakdown ?? data?.category_breakdown ?? []).slice(0, 8)

  const portfolioHealth = useMemo(() => {
    if (!data) return null
    const total = kpi.total || 0
    const negShare = total ? (kpi.negative / total) * 100 : 0
    const validRows = summaryRows.filter(r => (r.review_count || 0) >= 5)
    const totalReviews = validRows.reduce((s, r) => s + (r.review_count || 0), 0)
    const weightedAvg = totalReviews > 0
      ? validRows.reduce((s, r) => s + (r.avg_rating || 0) * (r.review_count || 0), 0) / totalReviews
      : 0
    const ratingComp = weightedAvg > 0 ? ((weightedAvg - 1) / 4) * 60 : 0
    const negComp = Math.max(0, 40 - negShare * 1.2)
    const healthScore = Math.max(0, Math.min(100, ratingComp + negComp))
    const topMomentum = [...(momentum || [])].sort((a, b) => (b.second || 0) - (a.second || 0))[0]
    const topIssue = topMomentum
      ? { category: topMomentum.category, mentions: topMomentum.second, isNew: topMomentum.first === 0 }
      : null
    const catBreakdown = (data.category_breakdown || []).filter(c => (c.total || 0) >= 10)
    const topCat = [...catBreakdown].sort((a, b) => {
      const aNeg = a.total ? a.Negative / a.total : 1
      const bNeg = b.total ? b.Negative / b.total : 1
      return aNeg - bNeg
    })[0] || null
    const atRisk = [...summaryRows].filter(r => (r.review_count || 0) >= 8).sort((a, b) => (b.neg_pct || 0) - (a.neg_pct || 0))[0] || null
    return { healthScore, topIssue, topCat, atRisk }
  }, [data, summaryRows, kpi, momentum])

  const autoInsights = useMemo(() => {
    if (!data || !cxoData) return []
    const total = kpi.total || 0
    const negShare = total ? (kpi.negative / total) * 100 : 0
    const insights = []
    const newIssues = (momentum || []).filter(m => m.first === 0 && m.second > 0)
    if (newIssues.length > 0) {
      insights.push({ tone: 'alert', title: `${newIssues[0].category} is a new issue`, body: `${newIssues[0].second} mentions in the recent period with no prior history.` })
    }
    const rising = (momentum || []).filter(m => m.first > 0 && (m.pct_change || 0) >= 50).sort((a, b) => (b.pct_change || 0) - (a.pct_change || 0))[0]
    if (rising && !newIssues.length) {
      insights.push({ tone: 'warn', title: `${rising.category} rising`, body: `Up ${rising.pct_change}% vs prior period (${rising.first} → ${rising.second} mentions).` })
    }
    if (negShare > 30) {
      insights.push({ tone: 'alert', title: 'Negative share elevated', body: `${negShare.toFixed(0)}% of reviews are negative. Investigate top issues below.` })
    } else if (negShare > 0 && negShare <= 20) {
      insights.push({ tone: 'good', title: 'Sentiment healthy', body: `${negShare.toFixed(0)}% negative rate — within the acceptable range.` })
    }
    const trend = data.daily_trend || []
    if (trend.length >= 8) {
      const q = Math.floor(trend.length / 4)
      const early = trend.slice(0, q)
      const recent = trend.slice(-q)
      const earlyTotal = early.reduce((s, p) => s + p.Positive + p.Negative + p.Neutral, 0)
      const recentTotal = recent.reduce((s, p) => s + p.Positive + p.Negative + p.Neutral, 0)
      const earlyRate = earlyTotal ? (early.reduce((s, p) => s + p.Negative, 0) / earlyTotal) * 100 : 0
      const recentRate = recentTotal ? (recent.reduce((s, p) => s + p.Negative, 0) / recentTotal) * 100 : 0
      if (recentRate < earlyRate - 4 && earlyRate > 0) {
        insights.push({ tone: 'good', title: 'Sentiment improving', body: `Negative rate dropped from ${earlyRate.toFixed(0)}% to ${recentRate.toFixed(0)}% across the period.` })
      }
    }
    if (!insights.length) insights.push({ tone: 'info', title: 'No anomalies detected', body: 'Sentiment, volume, and issue signals look stable for the selected window.' })
    return insights.slice(0, 3)
  }, [data, cxoData, kpi, momentum])

  if (loading && !hasData) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-muted)', gap: 10 }}>
        <span style={{ fontSize: 20 }}>...</span> Loading overview...
      </div>
    )
  }

  const trendWithRolling = activeTrend.map((point, index, rows) => {
    const window = rows.slice(Math.max(0, index - 6), index + 1)
    const total = window.reduce((sum, row) => sum + (row.Positive + row.Negative + row.Neutral), 0)
    const negative = window.reduce((sum, row) => sum + row.Negative, 0)
    return {
      ...point,
      rolling_neg: total ? +((negative / total) * 100).toFixed(1) : 0,
      neg_rate: point.Negative ? +((point.Negative / (point.Positive + point.Negative + point.Neutral)) * 100).toFixed(1) : 0,
    }
  })

  const rateVals = trendWithRolling.map(point => point.rolling_neg).filter(value => value > 0)
  const rateMin = rateVals.length ? Math.max(0, Math.floor(Math.min(...rateVals) / 5) * 5 - 5) : 0
  const rateMax = rateVals.length ? Math.min(100, Math.ceil(Math.max(...rateVals) / 5) * 5 + 10) : 100
  const sentimentColors = { Positive: '#22c55e', Negative: '#ef4444', Neutral: '#eab308' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {portfolioHealth && (
        <PortfolioHealthStrip
          healthScore={portfolioHealth.healthScore}
          topIssue={portfolioHealth.topIssue}
          topCat={portfolioHealth.topCat}
          atRisk={portfolioHealth.atRisk}
          onSelectIssue={category => setEmergingCat(category)}
          onSelectCategory={category => setCategoryCloud({ category, sentiment: 'Negative' })}
        />
      )}
      <AlertsBanner kpi={kpi} momentum={momentum} />
      <AutoInsights insights={autoInsights} />
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, alignItems: 'start' }}>
        <OverviewCards kpi={kpi} productCount={scopedProducts.length || allProducts?.length || 0} periodLabel={periodLabel} />
        <Card title="Amazon Rating Signal" tip="Amazon product-page rating snapshots over time, alongside scraped daily review averages.">
          <RatingTrendChart filters={filters} tree={tree} />
        </Card>
      </div>

      <Card
        title="Category Review Mix"
        sub="Horizontal length shows total reviews. Each bar is split into negative, neutral, and positive review volume."
        tip="Click any colored section to open the category keyword cloud for that category and sentiment."
        controls={
          <select value={effectiveIssueFilter || ''} onChange={event => { setIssueFilter(event.target.value || null); setCategoryCloud(null) }} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', color: effectiveIssueFilter ? 'var(--accent)' : 'var(--text-muted)', fontSize: 11, fontFamily: 'DM Sans', cursor: 'pointer', outline: 'none' }}>
            <option value="">All Products</option>
            {scopedProducts.map(product => <option key={product} value={product}>{product}</option>)}
          </select>
        }
      >
        <CategoryReviewMix rows={displayedCategoryBreakdown} onSelect={(category, sentiment) => setCategoryCloud(current => current?.category === category && current?.sentiment === sentiment ? null : { category, sentiment })} />
        {categoryCloud && <CategoryWordCloudPanel category={categoryCloud.category} sentiment={categoryCloud.sentiment} filters={filters} onClose={() => setCategoryCloud(null)} />}
      </Card>

      <Card
        title="Customer Signal Over Time"
        tip="Neg Rate shows the 7-day rolling problem rate. Sentiment shows daily positive, negative, and neutral breakdown. Reviews shows the daily stacked split from 1-star to 5-star."
        controls={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select value={effectiveSignalProd || ''} onChange={event => setSignalProd(event.target.value || null)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', color: effectiveSignalProd ? 'var(--accent)' : 'var(--text-muted)', fontSize: 11, fontFamily: 'DM Sans', cursor: 'pointer', outline: 'none' }}>
              <option value="">All Products</option>
              {scopedProducts.map(product => <option key={product} value={product}>{product}</option>)}
            </select>
            <Toggle value={trendMode} onChange={setTrendMode} options={[{ v: 'rate', l: 'Neg Rate %' }, { v: 'sentiment', l: 'Sentiment' }, { v: 'reviews', l: 'Reviews' }]} />
          </div>
        }
      >
        {activeTrend.length === 0 ? (
          <EmptyState text="No trend data - review dates may not be parsed correctly yet." />
        ) : trendMode === 'rate' ? (
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={trendWithRolling} margin={{ top: 8, right: 40, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id="negGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={fmtDay} />
              <YAxis domain={[rateMin, rateMax]} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={value => `${value}%`} width={36} />
              <Tooltip content={<RateTip />} />
              {rateMax >= 30 && <ReferenceLine y={30} stroke="#eab308" strokeDasharray="4 2" strokeOpacity={0.5} label={{ value: '30%', fill: '#eab308', fontSize: 10, position: 'insideRight' }} />}
              {rateMax >= 50 && <ReferenceLine y={50} stroke="#ef4444" strokeDasharray="4 2" strokeOpacity={0.5} label={{ value: '50%', fill: '#ef4444', fontSize: 10, position: 'insideRight' }} />}
              <Bar dataKey="neg_rate" fill="#ef4444" opacity={0.12} name="Daily Neg %" radius={[2, 2, 0, 0]} barSize={6} />
              <Area type="monotone" dataKey="rolling_neg" stroke="#ff4e1a" strokeWidth={2.5} fill="url(#negGrad)" dot={false} activeDot={{ r: 5, fill: '#ff4e1a', stroke: '#fff', strokeWidth: 2 }} name="7d Rolling" />
            </ComposedChart>
          </ResponsiveContainer>
        ) : trendMode === 'sentiment' ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={activeTrend} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
              <defs>
                {Object.entries(sentimentColors).map(([sentiment, color]) => (
                  <linearGradient key={sentiment} id={`ov-${sentiment}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={fmtDay} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} width={36} />
              <Tooltip content={<VolumeTip />} />
              {['Negative', 'Positive', 'Neutral'].map(sentiment => (
                <Area key={sentiment} type="monotone" dataKey={sentiment} stroke={sentimentColors[sentiment]} strokeWidth={2} fill={`url(#ov-${sentiment})`} dot={false} activeDot={{ r: 4, stroke: '#fff', strokeWidth: 1.5 }} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        ) : !activeDailyRating.length ? (
          <EmptyState text="No daily review volume available for the selected filters." />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={activeDailyRating} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={fmtDay} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} width={36} />
                <Tooltip content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const point = payload[0]?.payload || {}
                  return (
                    <div style={{ background: '#16161f', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', fontSize: 12, minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                      <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--text-muted)', fontSize: 11, letterSpacing: '0.06em' }}>{fmtDay(label)}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                          <span style={{ color: 'var(--text-muted)' }}>Total reviews</span>
                          <span style={{ fontWeight: 700 }}>{point.total || 0}</span>
                        </div>
                        {[
                          ['5 star', point.star_5, '#22c55e'],
                          ['4 star', point.star_4, '#84cc16'],
                          ['3 star', point.star_3, '#eab308'],
                          ['2 star', point.star_2, '#f97316'],
                          ['1 star', point.star_1, '#ef4444'],
                        ].map(([text, value, color]) => (
                          <div key={text} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                            <span style={{ color }}>{text}</span>
                            <span style={{ fontWeight: 700 }}>{value || 0}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                }} />
                <Bar dataKey="star_1" stackId="stars" fill="#ef4444" name="1 star" />
                <Bar dataKey="star_2" stackId="stars" fill="#f97316" name="2 star" />
                <Bar dataKey="star_3" stackId="stars" fill="#eab308" name="3 star" />
                <Bar dataKey="star_4" stackId="stars" fill="#84cc16" name="4 star" />
                <Bar dataKey="star_5" stackId="stars" fill="#22c55e" name="5 star" />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-muted)' }}>
              {[
                ['1 star', '#ef4444'],
                ['2 star', '#f97316'],
                ['3 star', '#eab308'],
                ['4 star', '#84cc16'],
                ['5 star', '#22c55e'],
              ].map(([text, color]) => (
                <span key={text} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                  {text}
                </span>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card title="Emerging Issues" tip="Issues that were absent or small in the first half of the selected period and are now growing.">
        <EmergingIssues momentum={momentum} onSelect={category => setEmergingCat(emergingCat === category ? null : category)} />
        <ReviewsDrawer category={emergingCat} label={emergingCat} filters={filters} onClose={() => setEmergingCat(null)} />
      </Card>
    </div>
  )
}
