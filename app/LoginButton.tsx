'use client'
import Link from 'next/link'
import { authClient } from '@/lib/auth-client'
import { Arrow, XMark } from './icons'

export default function LoginButton() {
  const { data: session } = authClient.useSession()
  if (session) return <Link className="tag" href="/me">Your country <Arrow /></Link>
  return (
    <button className="tag" onClick={() => authClient.signIn.social({ provider: 'twitter', callbackURL: '/me' })}>
      <XMark /> Log in with X
    </button>
  )
}
