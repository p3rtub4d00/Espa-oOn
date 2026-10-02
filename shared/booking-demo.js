// Only a boolean true from the club license enables fictitious CPF numbers.
export function isBookingCpfValid(value, demoMode, strictValidator) {
  const digits = String(value || '').replace(/\D/g, '')
  return demoMode === true ? digits.length === 11 : strictValidator(digits)
}

export const DEMO_BOOKING_CUSTOMER = Object.freeze({
  name: 'Cliente de Demonstração',
  cpf: '111.111.111-11',
  phone: '(69) 99999-9999',
  email: 'cliente@example.invalid',
  address: 'Endereço de demonstração',
})
