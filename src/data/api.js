async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
    ...options,
  })

  let data = null
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    data = await response.json()
  }

  if (!response.ok) {
    throw new Error(data?.error || 'Erro ao comunicar com o servidor.')
  }

  return data
}

export const api = {
  getSettings: () => request('/api/settings'),

  adminSession: () => request('/api/admin/session'),
  adminLogin: (password) =>
    request('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  adminLogout: () => request('/api/admin/logout', { method: 'POST' }),

  saveSettings: (settings) =>
    request('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  createContract: (contract) =>
    request('/api/contracts', {
      method: 'POST',
      body: JSON.stringify(contract),
    }),

  completePayment: (reservation, contract) =>
    request('/api/payments/simulate', {
      method: 'POST',
      body: JSON.stringify({ reservation, contract }),
    }),

  lookupReservation: (code, phoneEnd) =>
    request('/api/reservations/' + encodeURIComponent(code) + '?phoneEnd=' + encodeURIComponent(phoneEnd)),

  createVisit: (visit) =>
    request('/api/visits', {
      method: 'POST',
      body: JSON.stringify(visit),
    }),

  adminReservations: () => request('/api/admin/reservations'),
  adminContracts: () => request('/api/admin/contracts'),
  adminVisits: () => request('/api/admin/visits'),

  updateVisit: (id, changes) =>
    request('/api/admin/visits/' + encodeURIComponent(id), {
      method: 'PATCH',
      body: JSON.stringify(changes),
    }),

  uploadImage: (file) => {
    const body = new FormData()
    body.append('image', file)
    return request('/api/admin/images', { method: 'POST', body })
  },
}
