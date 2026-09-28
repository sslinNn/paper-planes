// каждый штамп в паспорте свой: форма, рисунок, наклон и краска выводятся из кода страны,
// приветствие — на языке страны
const HELLO: Record<string, string> = {
  RU: 'ПРИВЕТ', UA: 'ПРИВІТ', BY: 'ПРЫВІТАННЕ', KZ: 'СӘЛЕМ', UZ: 'SALOM', GE: 'გამარჯობა', AM: 'ԲԱՐԵՎ',
  US: 'HOWDY', GB: 'CHEERS', IE: 'DIA DUIT', CA: 'HELLO · BONJOUR', AU: "G'DAY", NZ: 'KIA ORA',
  FR: 'BONJOUR', DE: 'HALLO', AT: 'SERVUS', CH: 'GRÜEZI', IT: 'CIAO', ES: '¡HOLA!', PT: 'OLÁ', NL: 'HOI', BE: 'HALLO',
  SE: 'HEJ', NO: 'HEI', DK: 'HEJ', FI: 'MOI', IS: 'HALLÓ', EE: 'TERE', LV: 'SVEIKI', LT: 'LABAS',
  PL: 'CZEŚĆ', CZ: 'AHOJ', SK: 'AHOJ', HU: 'SZIA', RO: 'SALUT', BG: 'ЗДРАВЕЙ', RS: 'ЋАО', HR: 'BOK', GR: 'ΓΕΙΑ ΣΟΥ',
  TR: 'MERHABA', IL: 'שלום', AE: 'مرحبا', SA: 'مرحبا', EG: 'أهلاً', IR: 'سلام', PK: 'سلام',
  IN: 'नमस्ते', BD: 'নমস্কার', CN: '你好', TW: '你好', HK: '你好', JP: 'こんにちは', KR: '안녕하세요',
  TH: 'สวัสดี', VN: 'XIN CHÀO', ID: 'HALO', MY: 'HELO', PH: 'KUMUSTA', SG: 'HELLO LAH',
  MX: '¡QUÉ ONDA!', AR: '¡CHE!', BR: 'OLÁ', CO: '¡QUIUBO!', CL: '¡HOLA!', PE: '¡HOLA!',
  NG: 'HOW FAR', KE: 'JAMBO', TZ: 'JAMBO', ZA: 'HOWZIT', GH: 'AKWAABA', MA: 'SALAM',
  AQ: 'PENGUINS SAY HI',
}
export const greeting = (code: string) => HELLO[code] ?? 'HELLO'

export const SHAPES = ['circle', 'rect', 'oval', 'octagon', 'shield'] as const
export const MOTIFS = ['mountains', 'waves', 'sun', 'star', 'plane'] as const
export type StampDesign = {
  shape: (typeof SHAPES)[number]
  motif: (typeof MOTIFS)[number] | 'snow'
  tilt: number
  hue: number
  serial: string
}

// FNV-1a: одинаковый результат для одной страны на любом устройстве
function hash(s: string, salt: number) {
  let h = 0x811c9dc5 ^ salt
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193)
  return h >>> 0
}

export function stampDesign(code: string): StampDesign {
  return {
    shape: SHAPES[hash(code, 1) % SHAPES.length],
    motif: code === 'AQ' ? 'snow' : MOTIFS[hash(code, 2) % MOTIFS.length],
    tilt: (hash(code, 3) % 19) - 9,
    // чернила штампа: тёмные насыщенные тона, синий диапазон карты пропущен
    hue: ((h) => (h < 200 ? h : h + 60))(hash(code, 4) % 300),
    serial: `${code}-${String(hash(code, 5) % 10000).padStart(4, '0')}`,
  }
}
