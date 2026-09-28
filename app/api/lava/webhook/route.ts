import { timingSafeEqual } from 'node:crypto'
import { pool } from '@/lib/db'
import { paidDonation } from '@/lib/patrons'

const same = (a: string, b: string) => {
  const [x, y] = [Buffer.from(a), Buffer.from(b)]
  return x.length === y.length && timingSafeEqual(x, y)
}

// ключ вебхука принимаем так, как его может прислать lava: X-Api-Key, Bearer или Basic (логин или пароль)
function authorized(req: Request, key: string) {
  if (same(req.headers.get('x-api-key') ?? '', key)) return true
  const [scheme, value = ''] = (req.headers.get('authorization') ?? '').split(' ')
  if (/^bearer$/i.test(scheme)) return same(value, key)
  if (/^basic$/i.test(scheme)) {
    const [user = '', pass = ''] = Buffer.from(value, 'base64').toString().split(':')
    return same(user, key) || same(pass, key)
  }
  return false
}

// lava.top шлёт сюда события оплаты; ключ из профиля lava (Integration → webhook, auth "API key")
export async function POST(req: Request) {
  const key = process.env.LAVA_WEBHOOK_KEY
  if (!key || !authorized(req, key)) return new Response(null, { status: 401 })

  const paid = paidDonation(await req.json().catch(() => null))
  if (paid) {
    // один контракт — одна запись: повторная доставка вебхука ничего не удваивает
    await pool.query(
      `insert into patrons (contract_id, user_id, amount, currency)
       select $1, id, $3, $4 from "user" where id = $2
       on conflict (contract_id) do nothing`,
      [paid.contractId, paid.userId, paid.amount, paid.currency],
    )
  }
  return new Response(null, { status: 200 })
}
