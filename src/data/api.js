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
    const error = new Error(data?.error || 'Erro ao comunicar com o servidor.')
    error.status = response.status
    error.code = data?.code
    error.data = data
    throw error
  }

  return data
}

export const api = {
  getContractTerms: () => request('/api/contracts/terms'),
  requestAdminRecovery: phone => request('/api/admin/recovery-request', { method: 'POST', body: JSON.stringify({ phone }) }),
  chatConfig: () => request('/api/chat/config'),
  chat: (message, history) => request('/api/chat', { method: 'POST', body: JSON.stringify({ message, history }) }),
  getSettings: () => request('/api/settings'),
  getAdminSettings: () => request('/api/admin/settings'),
  getAvailability: () => request('/api/availability'),
  licenseStatus: (force = false) => request('/api/license' + (force ? '?force=1' : '')),
  licenseBilling: () => request('/api/license/billing'),
  createLicensePix: () => request('/api/license/billing/pix', { method: 'POST' }),

  adminSession: () => request('/api/admin/session'),
  adminLogin: (password) =>
    request('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  adminLogout: () => request('/api/admin/logout', { method: 'POST' }),
  changeAdminPassword: (currentPassword, newPassword, confirmation) =>
    request('/api/admin/password/change', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword, confirmation }),
    }),
  paymentConfig: () => request('/api/payments/config'),
  paymentProviderStatus: () => request('/api/admin/payment-provider'),
  connectMercadoPago: () =>
    request('/api/admin/payments/mercadopago/connect', { method: 'POST' }),
  disconnectMercadoPago: () =>
    request('/api/admin/payments/mercadopago/disconnect', { method: 'POST' }),

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

  createMercadoPagoCheckout: (reservation, contractId) =>
    request('/api/payments/mercadopago/checkout', {
      method: 'POST',
      body: JSON.stringify({ reservation, contractId }),
    }),

  createCardPayment: (reservation, contractId, card) =>
    request('/api/payments/mercadopago/card', {
      method: 'POST',
      body: JSON.stringify({ reservation, contractId, card }),
    }),

  paymentStatus: (reservationId) =>
    request('/api/payments/asaas/' + encodeURIComponent(reservationId) + '/status'),

  lookupReservation: (code, cpf) =>
    request('/api/reservations/lookup', { method: 'POST', body: JSON.stringify({ code, cpf }) }),

  requestReschedule: (payload) => request('/api/reservations/reschedule', { method: 'POST', body: JSON.stringify(payload) }),
  respondReschedule: (id, payload) => request('/api/admin/reservations/' + encodeURIComponent(id) + '/reschedule', { method: 'POST', body: JSON.stringify(payload) }),
  markRescheduleFee: (id, changeId) => request('/api/admin/reservations/' + encodeURIComponent(id) + '/reschedule-fee', { method: 'POST', body: JSON.stringify({ changeId }) }),
  createVisit: (visit) =>
    request('/api/visits', {
      method: 'POST',
      body: JSON.stringify(visit),
    }),

  adminReservations: () => request('/api/admin/reservations'),
  createManualReservation: (reservation) =>
    request('/api/admin/reservations/manual', {
      method: 'POST',
      body: JSON.stringify(reservation),
    }),
  deletePendingReservation: (id) =>
    request('/api/admin/reservations/' + encodeURIComponent(id), { method: 'DELETE' }),
  markManualReservationPaid: (id) =>
    request('/api/admin/reservations/' + encodeURIComponent(id) + '/manual-paid', {
      method: 'POST',
    }),
  cancelPaidReservation: (id, reason, refundAmount) =>
    request('/api/admin/reservations/' + encodeURIComponent(id) + '/cancel', {
      method: 'POST',
      body: JSON.stringify({ reason, refundAmount }),
    }),
  markRefundRecorded: (id) =>
    request('/api/admin/reservations/' + encodeURIComponent(id) + '/refund-recorded', {
      method: 'POST',
    }),
  adminContracts: () => request('/api/admin/contracts'),
  adminVisits: () => request('/api/admin/visits'),
  adminRevenue: (month) =>
    request('/api/admin/revenue?month=' + encodeURIComponent(month)),
  resetSiteData: (password, confirmation) =>
    request('/api/admin/reset-data', {
      method: 'POST',
      body: JSON.stringify({ password, confirmation }),
    }),

  pushStatus: () => request('/api/admin/push/status'),
  subscribePush: (subscription) =>
    request('/api/admin/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription }),
    }),
  unsubscribePush: (endpoint) =>
    request('/api/admin/push/subscribe', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint }),
    }),
  testPush: (endpoint) =>
    request('/api/admin/push/test', {
      method: 'POST',
      body: JSON.stringify({ endpoint }),
    }),
  testPushBackground: (endpoint) =>
    request('/api/admin/push/test-background', {
      method: 'POST',
      body: JSON.stringify({ endpoint }),
    }),

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
