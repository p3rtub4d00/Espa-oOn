export const DEFAULT_SETTINGS = {
  prices: {
    weekday12: 450,
    weekday24: 650,
    weekend12: 700,
    weekend24: 950,
    sunday12: 650,
    sunday24: 850,
  },
  blockedDates: [],
  specialDates: [],
  rentalHours: {
    '12h': '08:00 às 20:00',
    '24h': '08:00 às 08:00 do dia seguinte',
  },
  rentalStartTimes: {
    '12h': ['08:00'],
    '24h': ['08:00'],
  },
  gallery: [
    'https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=1200&q=85',
    'https://images.unsplash.com/photo-1572331165267-854da2b10ccc?auto=format&fit=crop&w=1200&q=85',
    'https://images.unsplash.com/photo-1601918774946-25832a4be0d6?auto=format&fit=crop&w=1200&q=85',
    'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1200&q=85',
    'https://images.unsplash.com/photo-1560184897-ae75f418493e?auto=format&fit=crop&w=1200&q=85',
  ],
  amenities: [
    { id: 'pool', name: 'Piscina', description: 'Área de lazer para aproveitar o dia.', icon: 'pool' },
    { id: 'field', name: 'Campo de futebol', description: 'Espaço para jogar com a turma.', icon: 'field' },
    { id: 'snooker', name: 'Sinuca', description: 'Mesa de sinuca disponível para os convidados.', icon: 'game' },
    { id: 'support', name: 'Área de apoio', description: 'Estrutura para confraternizações.', icon: 'food' },
  ],
  extras: [],
  notifications: {
    notifyPaidReservation: true,
    notifyNewVisit: true,
    notifyReservationDayBefore: true,
    notifyReservationSameDay: true,
    reservationDayBeforeTime: '18:00',
    reservationSameDayTime: '07:00',
  },
  cancellationPolicy: {
    text: 'Cancelamentos devem ser solicitados ao proprietário. A existência e o valor de eventual reembolso dependem da antecedência, das condições da reserva e da política informada pelo estabelecimento. Todo cancelamento e eventual valor devolvido serão registrados no sistema.',
  },
  establishment: {
    name: 'EspaçoOn',
    ownerName: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    locationNote: '',
    openingHours: '',
  },
  branding: {
    logoUrl: '',
    primaryColor: '#0f3554',
    secondaryColor: '#1f8efa',
    accentColor: '#53b9ff',
  },
  onboarding: {
    establishmentConfigured: false,
    pricesConfigured: false,
  },
}

export function loadSettings() {
  return {
    ...DEFAULT_SETTINGS,
    prices: { ...DEFAULT_SETTINGS.prices },
    rentalHours: { ...DEFAULT_SETTINGS.rentalHours },
    rentalStartTimes: {
      '12h': [...DEFAULT_SETTINGS.rentalStartTimes['12h']],
      '24h': [...DEFAULT_SETTINGS.rentalStartTimes['24h']],
    },
    blockedDates: [],
    specialDates: [],
    gallery: [...DEFAULT_SETTINGS.gallery],
    amenities: DEFAULT_SETTINGS.amenities.map((item) => ({ ...item })),
    extras: DEFAULT_SETTINGS.extras.map((item) => ({ ...item })),
    notifications: { ...DEFAULT_SETTINGS.notifications },
    cancellationPolicy: { ...DEFAULT_SETTINGS.cancellationPolicy },
    establishment: { ...DEFAULT_SETTINGS.establishment },
    branding: { ...DEFAULT_SETTINGS.branding },
    onboarding: { ...DEFAULT_SETTINGS.onboarding },
  }
}

export function getPriceForDate(dateValue, period, settings = loadSettings()) {
  const date = typeof dateValue === 'string'
    ? new Date(dateValue + 'T12:00:00')
    : dateValue

  const iso = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')

  const special = settings.specialDates.find((item) => item.date === iso)

  if (special) {
    return Number(period === '12h' ? special.price12 : special.price24)
  }

  const weekday = date.getDay()
  if (weekday === 0) {
    return Number(period === '12h' ? settings.prices.sunday12 : settings.prices.sunday24)
  }
  if (weekday === 5 || weekday === 6) {
    return Number(period === '12h' ? settings.prices.weekend12 : settings.prices.weekend24)
  }
  return Number(period === '12h' ? settings.prices.weekday12 : settings.prices.weekday24)
}

