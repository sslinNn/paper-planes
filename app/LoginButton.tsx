'use client'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect } from 'react'
import { track } from '@/lib/track'
import { authClient } from '@/lib/auth-client'
import { Arrow, XMark } from './icons'

// главный страх перед OAuth — «бот начнёт постить от меня». Доступ только на чтение: говорим это прямо у кнопки
const READ_ONLY = 'Read-only. We never post or DM.'

// вход через X; неудача (чаще всего «Cancel» на экране X) возвращает сюда же с ?error=…
export const logInWithX = (from: string, callbackURL: string) => {
  track('login_clicked', { from })
  authClient.signIn.social({ provider: 'twitter', callbackURL, errorCallbackURL: location.pathname })
}

function Note({ text }: { text: string }) {
  const error = useSearchParams().get('error')
  useEffect(() => {
    if (error) track('login_failed', { error })
  }, [error])
  const note = !error ? text : error === 'access_denied' ? 'Login with X was cancelled. Try again anytime.' : 'Couldn’t log in with X. Try again in a minute.'
  return <span className="fine">{note}</span>
}

// подпись под кнопкой входа: говорит, что вход не удался, вместо того чтобы молчать
export function LoginNote({ text = READ_ONLY }: { text?: string }) {
  return (
    <Suspense fallback={<span className="fine">{text}</span>}>
      <Note text={text} />
    </Suspense>
  )
}

// secondary — когда главное действие страницы другое (игра): кнопка контурная, а не розовая
export default function LoginButton({ secondary = false }: { secondary?: boolean }) {
  const { data: session } = authClient.useSession()
  if (session) return <Link className={secondary ? 'tag outline' : 'tag'} href="/me">Your country <Arrow /></Link>
  return (
    <span className="login">
      <button className={secondary ? 'tag outline' : 'tag'} onClick={() => logInWithX('map', '/me')}>
        <XMark /> {secondary ? 'See where your replies fly' : 'Log in with X'}
      </button>
      <LoginNote />
    </span>
  )
}
