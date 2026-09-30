import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { userBag } from '@/lib/airmail-db'

// личный мешок — никакого CDN-кэша: у каждого свой
export async function GET() {
  const s = await auth.api.getSession({ headers: await headers() })
  if (!s) return new Response(null, { status: 401 })
  const bag = await userBag(s.user.id)
  return bag ? Response.json(bag, { headers: { 'Cache-Control': 'private, no-store' } }) : new Response(null, { status: 404 })
}
