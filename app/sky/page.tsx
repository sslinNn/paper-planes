import type { Metadata } from 'next'
import LoginButton from '../LoginButton'
import PlaneMap from '../PlaneMap'
import PlayLink from '../PlayLink'

const title = 'The live sky · Paper Planes'
const description = 'Every reply on X is a paper plane flying across the world. Log in and yours take off.'
export const metadata: Metadata = { title, description, openGraph: { title, description }, twitter: { title, description } }

// живая карта реплаев. Главное действие здесь — игра: она работает без логина, а логин — для тех, кто хочет свои самолётики
export default function Sky() {
  return (
    <main>
      <PlaneMap>
        <h1 className="title" data-ink="Paper Planes">Paper Planes</h1>
        <p className="lede">Every reply on X becomes a <strong>paper plane</strong>, flying from one country to another. Catch them in <strong>Airmail</strong>, or log in and yours take off.</p>
        <PlayLink from="sky" />
        <LoginButton secondary />
      </PlaneMap>
    </main>
  )
}
