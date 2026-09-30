import Link from 'next/link'
import LoginButton from './LoginButton'
import { Arrow } from './icons'
import PlaneMap from './PlaneMap'

export default function Home() {
  return (
    <main>
      <PlaneMap>
        <h1 className="title" data-ink="Paper Planes">Paper Planes</h1>
        <p className="lede">Every reply on X becomes a <strong>paper plane</strong>, flying from one country to another. Log in and yours take off.</p>
        <LoginButton />
        <Link className="tag play-link" href="/play">Play Airmail <Arrow /></Link>
      </PlaneMap>
    </main>
  )
}
