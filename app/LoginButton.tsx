'use client'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect } from 'react'
import { track } from '@/lib/track'
import { authClient } from '@/lib/auth-client'
import { Arrow, XMark } from './icons'

// главный страх перед OAuth — «бот начнёт постить от меня». Доступ только на чтение: говорим это прямо у кнопки
const READ_ONLY = 'Read-only. We never post or DM.'

// OAuth не удался (чаще всего «Cancel» на экране X) — better-auth возвращает на /?error=…: говорим об этом, а не молчим
function LoginNote() {
  const error = useSearchParams().get('error')
  useEffect(() => {
    if (error) track('login_failed', { error })
  }, [error])
  const note = !error ? READ_ONLY : error === 'access_denied' ? 'Login with X was cancelled. Try again anytime.' : 'Couldn’t log in with X. Try again in a minute.'
  return <span className="fine">{note}</span>
}

export default function LoginButton() {
  const { data: session } = authClient.useSession()
  if (session) return <Link className="tag" href="/me">Your country <Arrow /></Link>
  return (
    <span className="login">
      <button className="tag" onClick={() => (track('login_clicked'), authClient.signIn.social({ provider: 'twitter', callbackURL: '/me' }))}>
        <XMark /> Log in with X
      </button>
      <Suspense fallback={<span className="fine">{READ_ONLY}</span>}>
        <LoginNote />
      </Suspense>
    </span>
  )
}
