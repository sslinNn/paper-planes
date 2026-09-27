import countries from 'i18n-iso-countries'
import en from 'i18n-iso-countries/langs/en.json' with { type: 'json' }
import ru from 'i18n-iso-countries/langs/ru.json' with { type: 'json' }

countries.registerLocale(en)
countries.registerLocale(ru)

// ponytail: ручной список городов/алиасов; расширять, когда доля «тумана» на карте станет заметной
const PLACES: Record<string, string> = {
  usa: 'US', us: 'US', america: 'US', uk: 'GB', england: 'GB', scotland: 'GB', 'рф': 'RU',
  moscow: 'RU', 'москва': 'RU', 'мск': 'RU', 'saint petersburg': 'RU', spb: 'RU', 'санкт-петербург': 'RU', 'спб': 'RU', 'питер': 'RU',
  kyiv: 'UA', kiev: 'UA', 'киев': 'UA', minsk: 'BY', 'минск': 'BY', almaty: 'KZ', 'алматы': 'KZ', tashkent: 'UZ', tbilisi: 'GE', yerevan: 'AM',
  london: 'GB', manchester: 'GB', paris: 'FR', berlin: 'DE', munich: 'DE', amsterdam: 'NL', madrid: 'ES', barcelona: 'ES',
  lisbon: 'PT', rome: 'IT', milan: 'IT', warsaw: 'PL', prague: 'CZ', vienna: 'AT', zurich: 'CH', stockholm: 'SE',
  helsinki: 'FI', oslo: 'NO', copenhagen: 'DK', dublin: 'IE', istanbul: 'TR', dubai: 'AE', 'tel aviv': 'IL',
  'new york': 'US', nyc: 'US', 'los angeles': 'US', 'san francisco': 'US', sf: 'US', 'bay area': 'US', seattle: 'US',
  austin: 'US', chicago: 'US', miami: 'US', boston: 'US', 'washington dc': 'US',
  toronto: 'CA', vancouver: 'CA', montreal: 'CA', 'mexico city': 'MX', 'são paulo': 'BR', 'sao paulo': 'BR',
  'rio de janeiro': 'BR', 'buenos aires': 'AR', bogota: 'CO', lima: 'PE', santiago: 'CL',
  lagos: 'NG', nairobi: 'KE', cairo: 'EG', johannesburg: 'ZA', 'cape town': 'ZA',
  tokyo: 'JP', osaka: 'JP', seoul: 'KR', beijing: 'CN', shanghai: 'CN', 'hong kong': 'HK', singapore: 'SG',
  bangkok: 'TH', jakarta: 'ID', manila: 'PH', mumbai: 'IN', delhi: 'IN', 'new delhi': 'IN', bangalore: 'IN',
  bengaluru: 'IN', karachi: 'PK', lahore: 'PK', dhaka: 'BD', sydney: 'AU', melbourne: 'AU', auckland: 'NZ',
}

const FLAG = /[\u{1F1E6}-\u{1F1FF}]{2}/u

export function parseCountry(location: string | null | undefined): string | null {
  if (!location) return null
  const flag = location.match(FLAG)?.[0]
  if (flag) return [...flag].map((c) => String.fromCharCode(c.codePointAt(0)! - 0x1f1e6 + 65)).join('')

  const whole = location.toLowerCase().trim()
  const parts = whole.split(/[,|/·•]/).map((s) => s.trim()).filter(Boolean).reverse()
  for (const p of [whole, ...parts]) {
    const hit = PLACES[p] ?? countries.getAlpha2Code(p, 'en') ?? countries.getAlpha2Code(p, 'ru')
    if (hit) return hit
  }
  return null
}

export const isCountry = (v: unknown): v is string =>
  typeof v === 'string' && /^[A-Z]{2}$/.test(v) && countries.isValid(v)

export const countryNames = () =>
  Object.entries(countries.getNames('en')).sort((a, b) => a[1].localeCompare(b[1]))
