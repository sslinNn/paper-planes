import LoginButton from './LoginButton'
import PlaneMap from './PlaneMap'

export default function Home() {
  return (
    <main>
      <PlaneMap>
        <h1 className="title" data-ink="Paper Planes">Paper Planes</h1>
        <p className="lede">Every reply on X becomes a <strong>paper plane</strong>, flying from one country to another. Log in and yours take off.</p>
        <LoginButton />
      </PlaneMap>
    </main>
  )
}
