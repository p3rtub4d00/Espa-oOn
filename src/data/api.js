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
  getAvailability: () => request('/api/availability'),

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

  verifyContract: (id, hash) =>
    request('/api/contracts/' + encodeURIComponent(id) + '/verify?hash=' + encodeURIComponent(hash)),

  createPixPayment: (reservation, contractId) =>
    request('/api/payments/asaas/pix', {
      method: 'POST',
      body: JSON.stringify({ reservation, contractId }),
    }),

  paymentStatus: (reservationId) =>
    request('/api/payments/asaas/' + encodeURIComponent(reservationId) + '/status'),

  lookupReservation: (code, cpf) =>
    request('/api/reservations/' + encodeURIComponent(code) + '?cpf=' + encodeURIComponent(cpf)),

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

  deleteImage: (id) =>
    request('/api/admin/images/' + encodeURIComponent(id), { method: 'DELETE' }),
}
