import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import LoginButton from '../../LoginButton'
import PlaneMap from '../../PlaneMap'
import { summary, summaryLine } from '@/lib/pilot'
import { findPilot } from './find'

// карточка пилота — ссылка, которой делятся в X. Кэш 5 минут: в наплыв из ленты БД дёргается раз на хэндл
export const revalidate = 300

type Props = { params: Promise<{ handle: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await findPilot((await params).handle)
  if (!p) return {}
  const title = `@${p.handle}'s paper planes`
  const description = `${summaryLine(summary(p.stamps))} — every reply on X flies as a paper plane.`
  return { title, description, openGraph: { title, description }, twitter: { title, description } }
}

export default async function PilotPage({ params }: Props) {
  const p = await findPilot((await params).handle)
  if (!p) notFound()
  const s = summary(p.stamps)
  const avatar = p.image?.startsWith('https://pbs.twimg.com/') ? p.image.replace('_normal.', '_400x400.') : null
  return (
    <main>
      <PlaneMap pilot={{ handle: p.handle, planes: p.planes }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- аватар X, next/image ради одной картинки не нужен */}
        {avatar && <img className="pilot-face" src={avatar} alt="" width={56} height={56} />}
        <h1 className="title" data-ink={`@${p.handle}`}>@{p.handle}</h1>
        <p className="lede">
          Replies flew to <strong>{summaryLine(s)}</strong>
          {s.since && <> since {new Date(s.since).toLocaleDateString('en', { month: 'short', year: 'numeric' })}</>}.
          Where do yours fly?
        </p>
        <LoginButton />
      </PlaneMap>
    </main>
  )
}
