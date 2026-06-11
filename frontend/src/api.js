const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '')

export function apiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return API_BASE ? `${API_BASE}${normalizedPath}` : normalizedPath
}

export function appPath(path) {
  const base = import.meta.env.BASE_URL || '/'
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  const normalizedPath = path.replace(/^\/+/, '')
  return `${normalizedBase}${normalizedPath}`
}

function getSessionToken() {
  return localStorage.getItem('session_token') || ''
}

export function authHeaders(extra = {}) {
  const token = getSessionToken()
  return token ? { 'X-Session-Token': token, ...extra } : { ...extra }
}

async function apiFetch(url, options = {}) {
  const { headers = {}, ...rest } = options
  return fetch(url, {
    ...rest,
    headers: { ...authHeaders(), ...headers },
  })
}

// ── Shared param builder ──────────────────────────────────────────────────────
// All API calls use `product_category` (product group) NOT the taxonomy `category`
function buildParams(filters = {}) {
  const p = new URLSearchParams()
  const productCategories = Array.isArray(filters.product_category)
    ? filters.product_category
    : (filters.product_category ? [filters.product_category] : [])
  // Product-group filter — server resolves to ASINs
  if (productCategories.length) p.set('category', productCategories.join('|||'))
  if (filters.product?.length)   p.set('product', filters.product.join('|||'))
  if (filters.date_from)         p.set('date_from', filters.date_from)
  if (filters.date_to)           p.set('date_to', filters.date_to)
  if (filters.rating?.length)    p.set('rating', filters.rating.join(','))
  return p
}

export async function fetchReviews(filters = {}) {
  const p = buildParams(filters)
  if (filters.sentiment?.length) p.set('sentiment', filters.sentiment.join(','))
  const res = await apiFetch(apiUrl(`/api/reviews?${p}`))
  return res.json()
}

export async function exportRawReviewsExcel(filters = {}) {
  const p = buildParams(filters)
  if (filters.sentiment?.length) p.set('sentiment', filters.sentiment.join(','))

  const res = await apiFetch(apiUrl(`/api/reviews/export/raw.xlsx?${p}`))
  if (!res.ok) {
    const message = await res.text().catch(() => '')
    throw new Error(message || 'Failed to export raw reviews')
  }

  const blob = await res.blob()
  const disposition = res.headers.get('Content-Disposition') || ''
  const filenameMatch = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
  const filename = filenameMatch ? decodeURIComponent(filenameMatch[1]) : 'raw_reviews_filtered.xlsx'
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function fetchFilters() {
  const res = await apiFetch(apiUrl('/api/filters'))
  return res.json()
}

export async function fetchAdminAccessLog(limit = 200) {
  const res = await apiFetch(apiUrl(`/api/admin/access-log?limit=${limit}`))
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || 'Failed to fetch admin access log')
  return data
}

export async function fetchAnalysis(filters = {}) {
  const p = buildParams(filters)
  const res = await apiFetch(apiUrl(`/api/analysis?${p}`))
  return res.json()
}

export async function fetchSummary(filters = {}) {
  const p = buildParams(filters)
  const res = await apiFetch(apiUrl(`/api/summary?${p}`))
  return res.json()
}

export async function fetchCxoTrends(filters = {}) {
  const p = buildParams(filters)
  const res = await apiFetch(apiUrl(`/api/trends/cxo?${p}`))
  return res.json()
}

export async function fetchRatingTrends(filters = {}) {
  const p = buildParams(filters)
  const res = await apiFetch(apiUrl(`/api/trends/rating?${p}`))
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
  const res = await apiFetch(apiUrl(`/api/wordcloud?${p}`))
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
  const res = await apiFetch(apiUrl(`/api/reviews/by-keyword?${p}`))
  return res.json()
}

export async function fetchPipeline() {
  const res = await apiFetch(apiUrl('/api/pipeline'))
  return res.json()
}

export async function fetchPipelineCapabilities() {
  const res = await apiFetch(apiUrl('/api/pipeline/capabilities'))
  return res.json()
}

export async function runPipeline(days = 30, asins = []) {
  const res = await apiFetch(apiUrl('/api/pipeline/run'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ days, asins }),
  })
  if (!res.ok) {
    const raw = await res.text()
    try {
      const err = JSON.parse(raw)
      throw new Error(err.detail || 'Failed to start pipeline')
    } catch {
      throw new Error(raw || 'Failed to start pipeline')
    }
  }
  return res.json()
}

export async function fetchPipelineJobs(limit = 10) {
  const res = await apiFetch(apiUrl(`/api/pipeline/jobs?limit=${limit}`))
  return res.json()
}

export async function fetchPipelineJob(jobId) {
  const res = await apiFetch(apiUrl(`/api/pipeline/jobs/${jobId}`))
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || 'Failed to fetch pipeline job')
  }
  return res.json()
}

export async function fetchStats() {
  const res = await apiFetch(apiUrl('/api/stats'))
  return res.json()
}

export async function fetchTrends(params = {}) {
  const p = buildParams(params)
  if (params.granularity) p.set('granularity', params.granularity)
  const res = await apiFetch(apiUrl(`/api/trends?${p}`))
  return res.json()
}

export async function fetchPipelineStatus() {
  const res = await apiFetch(apiUrl('/api/pipeline/status'))
  return res.json()
}

export async function fetchAsins() {
  const res = await apiFetch(apiUrl('/api/asins'))
  return res.json()
}

export async function fetchCategories() {
  const res = await apiFetch(apiUrl('/api/categories'))
  return res.json()
}

export async function saveCategory(category) {
  const res = await apiFetch(apiUrl('/api/categories'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Failed to save category')
  return data
}

export async function deleteCategory(categoryName) {
  const res = await apiFetch(apiUrl(`/api/categories/${encodeURIComponent(categoryName)}`), {
    method: 'DELETE',
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Failed to delete category')
  return data
}

export async function saveAsin({ asin, product_name = '', category = '' }) {
  const res = await apiFetch(apiUrl('/api/asins'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ asin, product_name, category }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Failed to save ASIN')
  return data
}

export async function generateSummaries() {
  const res = await apiFetch(apiUrl('/api/summary/generate'), { method: 'POST' })
  return res.json()
}
