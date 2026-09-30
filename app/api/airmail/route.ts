import { after } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { collect } from '@/lib/collect'
import { userBag } from '@/lib/airmail-db'

// личный мешок — никакого CDN-кэша: у каждого свой
export async function GET() {
  const s = await auth.api.getSession({ headers: await headers() })
  // гость — не ошибка: игра просто не покажет «свою почту» (401 краснел бы в консоли у каждого гостя)
  if (!s) return Response.json({ authed: false }, { headers: { 'Cache-Control': 'private, no-store' } })
  const bag = await userBag(s.user.id)
  if (!bag) return new Response(null, { status: 404 })
  // вошёл прямо из игры: реплаи ещё не собраны — собираем сейчас, клиент подождёт (collect сам не чаще раза в 4 минуты)
  if (bag.collecting) after(() => collect(s.user.id))
  return Response.json(bag, { headers: { 'Cache-Control': 'private, no-store' } })
}
