export async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });

  if (res.status === 401) {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('auth-unauthorized'));
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `HTTP error ${res.status}`);
  }
  return data;
}

export const api = {
  checkAuth: () => fetchJson('/api/auth/status'),
  login: (password) => fetchJson('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => fetchJson('/api/auth/logout', { method: 'POST' }),

  getSubscriptions: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchJson(`/api/subscriptions${query ? `?${query}` : ''}`);
  },
  getStats: () => fetchJson('/api/subscriptions/stats'),
  createSubscription: (data) => fetchJson('/api/subscriptions', { method: 'POST', body: JSON.stringify(data) }),
  updateSubscription: (id, data) => fetchJson(`/api/subscriptions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleSubscription: (id) => fetchJson(`/api/subscriptions/${id}/toggle`, { method: 'PATCH' }),
  deleteSubscription: (id) => fetchJson(`/api/subscriptions/${id}`, { method: 'DELETE' }),

  getSettings: () => fetchJson('/api/settings'),
  updateSettings: (data) => fetchJson('/api/settings', { method: 'PUT', body: JSON.stringify(data) }),
  testTelegram: (data) => fetchJson('/api/settings/test-telegram', { method: 'POST', body: JSON.stringify(data) }),
  getLogs: () => fetchJson('/api/notifications/logs'),
};
