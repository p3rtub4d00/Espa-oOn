export const DEFAULT_SETTINGS = {
  prices: {
    weekday12: 450,
    weekday24: 650,
    weekend12: 700,
    weekend24: 950,
    sunday12: 650,
    sunday24: 850,
  },
  blockedDays: [],
  specialDates: [],
  rentalHours: {
    '12h': '08:00 às 20:00',
    '24h': '08:00 às 08:00 do dia seguinte',
  },
}

export function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem('espacoon_settings') || '{}')
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      prices: { ...DEFAULT_SETTINGS.prices, ...(stored.prices || {}) },
      rentalHours: { ...DEFAULT_SETTINGS.rentalHours, ...(stored.rentalHours || {}) },
      blockedDays: Array.isArray(stored.blockedDays) ? stored.blockedDays : [],
      specialDates: Array.isArray(stored.specialDates) ? stored.specialDates : [],
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings) {
  localStorage.setItem('espacoon_settings', JSON.stringify(settings))
}

export function getPriceForDay(day, period, settings = loadSettings()) {
  const special = settings.specialDates.find((item) => Number(item.day) === Number(day))
  if (special) {
    return Number(period === '12h' ? special.price12 : special.price24)
  }

  const date = new Date(2026, 9, day)
  const weekday = date.getDay()
  if (weekday === 0) {
    return Number(period === '12h' ? settings.prices.sunday12 : settings.prices.sunday24)
  }
  if (weekday === 5 || weekday === 6) {
    return Number(period === '12h' ? settings.prices.weekend12 : settings.prices.weekend24)
  }
  return Number(period === '12h' ? settings.prices.weekday12 : settings.prices.weekday24)
}
