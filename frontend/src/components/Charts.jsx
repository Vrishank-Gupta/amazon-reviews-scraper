import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

const COLORS = ['#ef4444', '#ff8c42', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6']

const tooltipStyle = {
  background: '#18181f',
  border: '1px solid #222230',
  borderRadius: 8,
  color: '#f0ede8',
  fontSize: 12,
}

export function CategoryBar({ data }) {
  if (!data?.length) return null
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} layout="vertical" margin={{ left: 16, right: 16, top: 8, bottom: 8 }}>
        <XAxis type="number" tick={{ fill: '#666680', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="category"
          tick={{ fill: '#f0ede8', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={130}
        />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#ffffff08' }} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} fill="#ff4e1a" />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function SentimentPie({ data }) {
  if (!data?.length) return null
  const pieData = data.map(d => ({ name: d.sentiment, value: d.count }))
  const sentimentColors = { Positive: '#22c55e', Neutral: '#eab308', Negative: '#ef4444' }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={pieData}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={80}
          paddingAngle={3}
          dataKey="value"
        >
          {pieData.map((entry) => (
            <Cell key={entry.name} fill={sentimentColors[entry.name] || '#666680'} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, color: '#f0ede8' }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

export function RatingBar({ data }) {
  if (!data?.length) return null
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
        <XAxis dataKey="rating" tick={{ fill: '#666680', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `★${v}`} />
        <YAxis tick={{ fill: '#666680', fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#ffffff08' }} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((entry) => (
            <Cell
              key={entry.rating}
              fill={entry.rating <= 2 ? '#ef4444' : entry.rating === 3 ? '#eab308' : '#22c55e'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
