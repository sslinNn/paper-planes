import type { Metadata } from 'next'
import LoginButton from '../LoginButton'
import PlaneMap from '../PlaneMap'
import PlayLink from '../PlayLink'

const title = 'The live sky · Paper Planes'
const description = 'Where do your replies on X travel? Each one is a paper plane flying from your country to theirs.'
export const metadata: Metadata = { title, description, openGraph: { title, description }, twitter: { title, description } }

// живая карта реплаев. Главное действие здесь — игра: она работает без логина, а логин — для тех, кто хочет свои самолётики
export default function Sky() {
  return (
    <main>
      <PlaneMap>
        <h1 className="title" data-ink="Paper Planes">Paper Planes</h1>
        <p className="lede">Where do your replies on X travel? Each one becomes a <strong>paper plane</strong>, flying from your country to theirs. Log in to see yours, or catch everyone’s in <strong>Airmail</strong>.</p>
        <PlayLink from="sky" />
        <LoginButton secondary />
      </PlaneMap>
    </main>
  )
}
