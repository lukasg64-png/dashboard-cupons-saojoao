const BASE = '';

async function fetchJSON(url, fallbackUrl = null) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (fallbackUrl) {
      const fallbackRes = await fetch(fallbackUrl);
      if (fallbackRes.ok) return await fallbackRes.json();
    }
    throw err;
  }
}

const API = {
  getCoupons: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return fetchJSON(`${BASE}/api/coupons${qs ? '?' + qs : ''}`, './data/coupons_data.json');
  },
  getSummary: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return fetchJSON(`${BASE}/api/coupons/summary${qs ? '?' + qs : ''}`, './data/coupons_summary.json');
  },
  getCategories: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return fetchJSON(`${BASE}/api/coupons/categories${qs ? '?' + qs : ''}`, './data/coupons_categories.json');
  },
  getTopCoupons: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return fetchJSON(`${BASE}/api/coupons/top${qs ? '?' + qs : ''}`, './data/coupons_top.json');
  },
  getFilters: () => fetchJSON(`${BASE}/api/filters`, './data/filters.json'),
  getHealth: () => fetchJSON(`${BASE}/api/health`, './data/health.json').catch(() => ({ status: 'ok', mode: 'static' })),
  triggerSync: (full = false) => fetch(`${BASE}/api/vtex-sync?full=${full}`, { method: 'POST' }),
};

export default API;
