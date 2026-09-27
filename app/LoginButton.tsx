'use client'
import { authClient } from '@/lib/auth-client'

export default function LoginButton() {
  const { data: session } = authClient.useSession()
  if (session) return <a className="btn" href="/me">Your country</a>
  return (
    <button className="btn" onClick={() => authClient.signIn.social({ provider: 'twitter', callbackURL: '/me' })}>
      Log in with X
    </button>
  )
}
