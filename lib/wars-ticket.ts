import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// билет на забег Mail Wars: «выдан тогда-то, номер такой-то», подписан секретом сервера. Без базы на выдаче,
// одноразовость проверяет приёмка заявки. Время выдачи подделать нельзя — подпись не сойдётся
// подписываем тем же секретом, что и сессии Better Auth: отдельная переменная окружения ради билетов не нужна
export const TICKET_SECRET = process.env.BETTER_AUTH_SECRET ?? 'local-dev-only'

const sign = (body: string, secret: string) => createHmac('sha256', secret).update(body).digest('base64url')

export function issueTicket(secret: string, now = Date.now()): string {
  const body = `${now}.${randomBytes(9).toString('base64url')}`
  return `${body}.${sign(body, secret)}`
}

export function readTicket(ticket: unknown, secret: string): { iat: number; nonce: string } | null {
  if (typeof ticket !== 'string' || ticket.length > 120) return null
  const [iat, nonce, sig, extra] = ticket.split('.')
  if (!iat || !nonce || !sig || extra !== undefined) return null
  const want = Buffer.from(sign(`${iat}.${nonce}`, secret))
  const got = Buffer.from(sig)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  const n = Number(iat)
  return Number.isSafeInteger(n) ? { iat: n, nonce } : null
}
