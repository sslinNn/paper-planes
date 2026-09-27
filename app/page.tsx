import LoginButton from './LoginButton'
import PlaneMap from './PlaneMap'

export default function Home() {
  return (
    <main>
      <header>
        <h1>✈ Paper Planes</h1>
        <p>Every reply you post on X flies across this map.</p>
        <LoginButton />
      </header>
      <PlaneMap />
    </main>
  )
}
