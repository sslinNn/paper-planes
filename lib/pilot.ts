export type Stamp = { country: string; count: number; first: string }

// хэндл X: 1–15 символов [A-Za-z0-9_]. В ссылке может прийти с @ и url-кодированным
export function normalizeHandle(raw: string): string | null {
  let h = raw
  try {
    h = decodeURIComponent(raw)
  } catch {}
  h = h.replace(/^@/, '')
  return /^\w{1,15}$/.test(h) ? h : null
}

// цифры для карточки: Антарктида — «страна неизвестна», в счёт стран не идёт
export function summary(stamps: Stamp[]) {
  const countries = stamps.filter((s) => s.country !== 'AQ').length
  const planes = stamps.reduce((n, s) => n + s.count, 0)
  const since = stamps.reduce<string | null>((m, s) => (!m || s.first < m ? s.first : m), null)
  return { countries, planes, since }
}

export const summaryLine = ({ countries, planes }: ReturnType<typeof summary>) =>
  `${countries} ${countries === 1 ? 'country' : 'countries'} · ${planes} ${planes === 1 ? 'plane' : 'planes'}`
