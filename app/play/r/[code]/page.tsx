import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { parseRoute } from '@/lib/postcard'
import Airmail from '../../Airmail'
import { startBags } from '../../bags'

// открытка забега: ссылка из шера в X. Превью — маршрут на карте (opengraph-image), по клику — та же игра с вызовом «побей»
type Props = { params: Promise<{ code: string }> }

// открытку открывают пачкой из одного твита: страница с вшитыми мешками кэшируется на минуту, база — раз на код
export const revalidate = 60
// без этого динамический сегмент рендерится на каждый запрос и revalidate не работает: коды не известны заранее,
// страница кэшируется при первом заходе по ней
export async function generateStaticParams() {
  return []
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = parseRoute((await params).code)
  if (!r) return {}
  const title = `Airmail: ${r.score.toLocaleString('en')}${r.day ? ` on Today’s Mail #${r.day}` : ''}`
  const description = `${r.countries.length} letters, ${r.km.toLocaleString('en')} km of real X replies flown as a paper plane. Beat it.`
  return { title, description, openGraph: { title, description }, twitter: { card: 'summary_large_image', title, description } }
}

export default async function RoutePage({ params }: Props) {
  const r = parseRoute((await params).code)
  if (!r) notFound()
  return (
    <main className="airmail">
      <Airmail challenge={r} start={await startBags()} />
    </main>
  )
}
