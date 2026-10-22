import type { Metadata } from 'next'
import Airmail from './play/Airmail'
import { startBags } from './play/bags'

// главная — сама игра: из ленты X приходят на пару секунд любопытства, и первым экраном должен быть полёт, а не логин.
// Живая карта реплаев — на /sky
const title = 'Airmail · Paper Planes'
const description = 'Every reply on X is a letter. Fly it there — before your paper plane hits the ground.'
export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description },
  twitter: { card: 'summary_large_image', title, description },
}

// мешки писем вшиты в HTML; страница перегенерируется раз в минуту — как CDN-кэш /api/airmail/free
export const revalidate = 60

export default async function Home() {
  return (
    <main className="airmail">
      <Airmail start={await startBags()} />
    </main>
  )
}
