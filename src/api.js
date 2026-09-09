const BASE = '';

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

const API = {
  getCoupons: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return fetchJSON(`${BASE}/api/coupons${qs ? '?' + qs : ''}`);
  },
  getSummary: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return fetchJSON(`${BASE}/api/coupons/summary${qs ? '?' + qs : ''}`);
  },
  getCategories: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return fetchJSON(`${BASE}/api/coupons/categories${qs ? '?' + qs : ''}`);
  },
  getTopCoupons: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return fetchJSON(`${BASE}/api/coupons/top${qs ? '?' + qs : ''}`);
  },
  getFilters: () => fetchJSON(`${BASE}/api/filters`),
  getHealth: () => fetchJSON(`${BASE}/api/health`),
  triggerSync: (full = false) => fetch(`${BASE}/api/vtex-sync?full=${full}`, { method: 'POST' }),
};

export default API;
