// донаты через lava.top: валидация запроса, разбор вебхука, модели самолётиков для донатеров

export const PLANE_MODELS = ['dart', 'glider', 'swallow', 'crane'] as const
export type PlaneModel = (typeof PLANE_MODELS)[number]
export const isPlaneModel = (v: unknown): v is PlaneModel => PLANE_MODELS.includes(v as PlaneModel)

// лимиты lava.top (проверено API): USD/EUR от 5, RUB от 100
const LIMITS = { RUB: [100, 500_000], USD: [5, 5_000], EUR: [5, 5_000] } as const
type Currency = keyof typeof LIMITS
export const UTM_SOURCE = 'paper-planes'

export function donationRequest(body: unknown): { email: string; amount: number; currency: Currency } | null {
  if (!body || typeof body !== 'object') return null
  const { email, amount, currency } = body as Record<string, unknown>
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return null
  if (typeof currency !== 'string' || !(currency in LIMITS)) return null
  const n = Number(amount)
  const [min, max] = LIMITS[currency as Currency]
  if (!Number.isFinite(n) || n < min || n > max) return null
  return { email, amount: Math.round(n * 100) / 100, currency: currency as Currency }
}

// засчитываем только успешную оплату счёта, который создали мы (метка utm_source + id юзера в utm_content)
export function paidDonation(hook: unknown): { userId: string; contractId: string; amount: number; currency: string } | null {
  if (!hook || typeof hook !== 'object') return null
  const h = hook as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  if (h.eventType !== 'payment.success' || h.status !== 'completed') return null
  if (h.clientUtm?.utm_source !== UTM_SOURCE || typeof h.clientUtm?.utm_content !== 'string' || !h.clientUtm.utm_content) return null
  if (typeof h.contractId !== 'string' || !h.contractId) return null
  return { userId: h.clientUtm.utm_content, contractId: h.contractId, amount: Number(h.amount) || 0, currency: String(h.currency ?? '') }
}
