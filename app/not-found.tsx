import Link from 'next/link'
import { Arrow } from './icons'

// потерянный адрес — письмо вернулось отправителю
export default function NotFound() {
  return (
    <main className="sheet">
      <h1 className="title me-title" data-ink="Return to sender">Return to sender</h1>
      <p className="lede">No such address. This letter came back with a stamp on it.</p>
      <p className="lede not-found-actions">
        <Link className="tag" href="/">Back to the map <Arrow /></Link>
        <Link className="tag outline" href="/play">Play Airmail <Arrow /></Link>
      </p>
    </main>
  )
}
