import type { Metadata } from 'next'
import Link from 'next/link'
import { placeName, flag } from '@/lib/traffic'
import { SITE } from '@/lib/site'
import { Arrow, XMark } from '../icons'
import { loadBoard } from './data'

// табло обновляется раз в 5 минут — как и сборщик реплаев
export const revalidate = 300

const km = (n: number) => `${Math.round(n).toLocaleString('en')} km`
const plural = (n: number, one: string) => `${n.toLocaleString('en')} ${n === 1 ? one : one + 's'}`
const route = (key: string) => key.split('>') as [string, string]

export async function generateMetadata(): Promise<Metadata> {
  const b = await loadBoard()
  const title = 'Air traffic · Paper Planes'
  const description = b.landingOfDay
    ? `Today the planes are landing in ${placeName(b.landingOfDay.iso)}. ${plural(b.planes, 'paper plane')} crossing the map.`
    : `${plural(b.planes, 'paper plane')} crossing the map — every one a real reply on X.`
  return { title, description, openGraph: { title, description }, twitter: { title, description } }
}

export default async function TrafficPage() {
  const b = await loadBoard()
  const period = b.window === 'week' ? 'this week' : 'so far'
  const text = b.landingOfDay
    ? `Today the paper planes are landing in ${placeName(b.landingOfDay.iso)} ${flag(b.landingOfDay.iso)} ✈️`
    : 'Air traffic of replies on X ✈️'
  const share = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(`${SITE}/traffic`)}`

  return (
    <main className="sheet traffic">
      <h1 className="title me-title" data-ink="Air traffic">Air traffic</h1>
      <p className="lede">
        <strong>{plural(b.planes, 'paper plane')}</strong> {period}. Every one is a real reply on X, flying from one country to another.
      </p>

      {b.landingOfDay && (
        <Link className="landing" href={`/?country=${b.landingOfDay.iso}`}>
          <span className="landing-label">Landing of the day</span>
          <span className="landing-place">{flag(b.landingOfDay.iso)} {placeName(b.landingOfDay.iso)}</span>
          <span className="landing-count">{plural(b.landingOfDay.count, 'plane')} landed in the last 24 hours</span>
        </Link>
      )}

      <h2>Busiest routes</h2>
      {b.routes.length ? (
        <ol className="board">
          {b.routes.map((r) => {
            const [from, to] = route(r.key)
            return (
              <li key={r.key}>
                <Link href={`/?country=${from}`}>
                  <span className="board-route">{flag(from)} {placeName(from)} <Arrow /> {flag(to)} {placeName(to)}</span>
                  <b>{r.count}</b>
                  <span className="board-note">{plural(r.pilots, 'pilot')}</span>
                </Link>
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="empty">The sky is quiet. Planes show up here as soon as someone replies.</p>
      )}

      <h2>Busiest skies</h2>
      <ol className="board">
        {b.skies.map((s) => (
          <li key={s.iso}>
            <Link href={`/?country=${s.iso}`}>
              <span className="board-route">{flag(s.iso)} {placeName(s.iso)}</span>
              <b>{s.total}</b>
              <span className="board-note">{s.out} out · {s.in} in</span>
            </Link>
          </li>
        ))}
      </ol>

      {b.longest && (
        <dl className="log">
          <div>
            <dt>Longest flight {period}</dt>
            <dd>
              <b>{km(b.longest.km)}</b>
              <a href={`https://x.com/${b.longest.plane.from_handle}`} target="_blank" rel="noopener">@{b.longest.plane.from_handle}</a>
              {' '}from {placeName(b.longest.plane.from_country ?? 'AQ')} to {placeName(b.longest.plane.to_country ?? 'AQ')}
            </dd>
          </div>
        </dl>
      )}

      <p className="lede traffic-actions">
        <a className="tag" href={share} target="_blank" rel="noopener"><XMark /> Share the board</a>
        <Link className="tag" href="/">Watch them fly <Arrow /></Link>
      </p>
    </main>
  )
}
