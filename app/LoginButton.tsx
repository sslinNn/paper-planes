'use client'
import Link from 'next/link'
import { track } from '@/lib/track'
import { authClient } from '@/lib/auth-client'
import { Arrow, XMark } from './icons'

export default function LoginButton() {
  const { data: session } = authClient.useSession()
  if (session) return <Link className="tag" href="/me">Your country <Arrow /></Link>
  return (
    <button className="tag" onClick={() => (track('login_clicked'), authClient.signIn.social({ provider: 'twitter', callbackURL: '/me' }))}>
      <XMark /> Log in with X
    </button>
  )
}
