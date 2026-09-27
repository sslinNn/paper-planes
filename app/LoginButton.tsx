'use client'
import Link from 'next/link'
import { authClient } from '@/lib/auth-client'

const XMark = () => (
  <svg className="tag-x" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M18.9 1.2h3.7l-8 9.2L24 22.8h-7.4l-5.8-7.6-6.6 7.6H.5l8.6-9.8L0 1.2h7.6l5.2 6.9 6.1-6.9Zm-1.3 19.4h2L6.5 3.3H4.3l13.3 17.3Z" />
  </svg>
)

export default function LoginButton() {
  const { data: session } = authClient.useSession()
  if (session) return <Link className="tag" href="/me">Your country →</Link>
  return (
    <button className="tag" onClick={() => authClient.signIn.social({ provider: 'twitter', callbackURL: '/me' })}>
      <XMark />Log in with X
    </button>
  )
}
