const BASE = '/api'

// ── Shared param builder ──────────────────────────────────────────────────────
// All API calls use `product_category` (product group) NOT the taxonomy `category`
function buildParams(filters = {}) {
  const p = new URLSearchParams()
  // Product-group filter — server resolves to ASINs
  if (filters.product_category) p.set('category', filters.product_category)
  if (filters.product?.length)   p.set('product', filters.product.join('|||'))
  if (filters.date_from)         p.set('date_from', filters.date_from)
  if (filters.date_to)           p.set('date_to', filters.date_to)
  return p
}

export async function fetchReviews(filters = {}) {
  const p = buildParams(filters)
  if (filters.sentiment?.length) p.set('sentiment', filters.sentiment.join(','))
  if (filters.rating?.length)    p.set('rating', filters.rating.join(','))
  const res = await fetch(`${BASE}/reviews?${p}`)
  return res.json()
}

export async function fetchFilters() {
  const res = await fetch(`${BASE}/filters`)
  return res.json()
}

export async function fetchAnalysis(filters = {}) {
  const p = buildParams(filters)
  const res = await fetch(`${BASE}/analysis?${p}`)
  return res.json()
}

export async function fetchSummary(filters = {}) {
  const p = buildParams(filters)
  const res = await fetch(`${BASE}/summary?${p}`)
  return res.json()
}

export async function fetchCxoTrends(filters = {}) {
  const p = buildParams(filters)
  const res = await fetch(`${BASE}/trends/cxo?${p}`)
  return res.json()
}

export async function fetchRatingTrends(filters = {}) {
  const p = buildParams(filters)
  const res = await fetch(`${BASE}/trends/rating?${p}`)
  return res.json()
}

export async function fetchWordCloud(filters = {}, taxonomyCategory = null) {
  const p = buildParams(filters)
  // product_category is already set via buildParams as 'category'
  // rename to product_category for wordcloud endpoint specifically
  if (p.has('category')) {
    p.set('product_category', p.get('category'))
    p.delete('category')
  }
  if (taxonomyCategory) p.set('category', taxonomyCategory)
  const res = await fetch(`${BASE}/wordcloud?${p}`)
  return res.json()
}

export async function fetchReviewsByKeyword(keyword, filters = {}) {
  const p = buildParams(filters)
  p.set('keyword', keyword)
  // rename category → product_category for this endpoint
  if (p.has('category')) {
    p.set('product_category', p.get('category'))
    p.delete('category')
  }
  const res = await fetch(`${BASE}/reviews/by-keyword?${p}`)
  return res.json()
}

export async function fetchPipeline() {
  const res = await fetch(`${BASE}/pipeline`)
  return res.json()
}

export async function runPipeline(days = 30, asins = []) {
  const res = await fetch(`${BASE}/pipeline/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ days, asins }),
  })
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
  const p = buildParams(params)
  if (params.granularity) p.set('granularity', params.granularity)
  const res = await fetch(`${BASE}/trends?${p}`)
  return res.json()
}

export async function fetchPipelineStatus() {
  const res = await fetch('/api/pipeline/status')
  return res.json()
}

export async function fetchAsins() {
  const res = await fetch(`${BASE}/asins`)
  return res.json()
}

export async function fetchCategories() {
  const res = await fetch(`${BASE}/categories`)
  return res.json()
}

export async function saveCategory(category) {
  const res = await fetch(`${BASE}/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Failed to save category')
  return data
}

export async function deleteCategory(categoryName) {
  const res = await fetch(`${BASE}/categories/${encodeURIComponent(categoryName)}`, {
    method: 'DELETE',
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Failed to delete category')
  return data
}

export async function saveAsin({ asin, product_name = '', category = '' }) {
  const res = await fetch(`${BASE}/asins`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ asin, product_name, category }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Failed to save ASIN')
  return data
}

export async function generateSummaries() {
  const res = await fetch(`${BASE}/summary/generate`, { method: 'POST' })
  return res.json()
}
