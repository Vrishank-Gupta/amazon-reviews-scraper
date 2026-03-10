const BASE = '/api'

export async function fetchReviews(filters = {}) {
  const params = new URLSearchParams()
  if (filters.category && filters.category !== 'All') params.set('category', filters.category)
  if (filters.sentiment?.length) params.set('sentiment', filters.sentiment.join(','))
  if (filters.rating?.length) params.set('rating', filters.rating.join(','))
  if (filters.product?.length) params.set('product', filters.product.join('|||'))
  const res = await fetch(`${BASE}/reviews?${params}`)
  return res.json()
}

export async function fetchFilters() {
  const res = await fetch(`${BASE}/filters`)
  return res.json()
}

export async function fetchPipeline() {
  const res = await fetch(`${BASE}/pipeline`)
  return res.json()
}

export async function runPipeline() {
  const res = await fetch(`${BASE}/pipeline/run`, { method: 'POST' })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Failed to start pipeline')
  }
  return res.json()
}

export async function fetchStats() {
  const res = await fetch(`${BASE}/stats`)
  return res.json()
}

export async function fetchTrends(params = {}) {
  const p = new URLSearchParams()
  if (params.product?.length) p.set('product', params.product.join('|||'))
  if (params.date_from) p.set('date_from', params.date_from)
  if (params.date_to) p.set('date_to', params.date_to)
  if (params.granularity) p.set('granularity', params.granularity)
  const res = await fetch(`${BASE}/trends?${p}`)
  return res.json()
}

export async function fetchWordCloud(params = {}) {
  const p = new URLSearchParams()
  if (params.product?.length) p.set('product', params.product.join('|||'))
  if (params.date_from) p.set('date_from', params.date_from)
  if (params.date_to) p.set('date_to', params.date_to)
  const res = await fetch(`/api/wordcloud?${p}`)
  return res.json()
}

export async function fetchReviewsByKeyword(keyword, params = {}) {
  const p = new URLSearchParams({ keyword })
  if (params.product?.length) p.set('product', params.product.join('|||'))
  if (params.date_from) p.set('date_from', params.date_from)
  if (params.date_to) p.set('date_to', params.date_to)
  const res = await fetch(`/api/reviews/by-keyword?${p}`)
  return res.json()
}