'use client'
import Link from 'next/link'
import { track } from '@/lib/track'
import { authClient } from '@/lib/auth-client'
import { Arrow, XMark } from './icons'

export default function LoginButton() {
  const { data: session } = authClient.useSession()
  if (session) return <Link className="tag" href="/me">Your country <Arrow /></Link>
  // главный страх перед OAuth — «бот начнёт постить от меня». Доступ только на чтение: говорим это прямо у кнопки
  return (
    <span className="login">
      <button className="tag" onClick={() => (track('login_clicked'), authClient.signIn.social({ provider: 'twitter', callbackURL: '/me' }))}>
        <XMark /> Log in with X
      </button>
      <span className="fine">Read-only. We never post or DM.</span>
    </span>
  )
}
