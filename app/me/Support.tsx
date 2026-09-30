'use client'
import { useEffect, useState } from 'react'
import { track } from '@/lib/track'
const PRESETS = { USD: [5, 10, 25], EUR: [5, 10, 25], RUB: [300, 1000, 2500] } as const
type Currency = keyof typeof PRESETS

// поддержка: донат через lava.top; донатерам — золотая фольга и дипломатический паспорт (модели открываются рангом в AIRMAIL)
export default function Support({ patronSince, open }: { patronSince: string | null; open: boolean }) {
  const [currency, setCurrency] = useState<Currency>('USD')
  const [amount, setAmount] = useState<number>(10)
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // вернулись со страницы оплаты кнопкой «Назад» — браузер достаёт страницу из кэша вместе с «Opening payment…»
    const reset = (e: PageTransitionEvent) => e.persisted && setBusy(false)
    addEventListener('pageshow', reset)
    // lava вернула сюда после отказа банка или отмены — говорим об этом прямо
    const outcome = new URLSearchParams(location.search).get('payment')
    const note =
      outcome === 'failed' ? 'The payment didn’t go through: the bank declined it. No money was taken. Try another card or PayPal.'
        : outcome === 'cancelled' ? 'Payment cancelled. Nothing was charged.'
        : ''
    if (note) track('donation_returned', { outcome })
    const t = note ? setTimeout(() => setStatus(note), 0) : undefined
    return () => {
      removeEventListener('pageshow', reset)
      clearTimeout(t)
    }
  }, [])

  const donate = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setStatus('')
    track('donate_started', { amount, currency })
    const r = await fetch('/api/donate', { method: 'POST', body: JSON.stringify({ email, amount, currency }) }).catch(() => null)
    const j = r?.ok ? await r.json() : null
    if (j?.url) location.href = j.url
    else {
      setBusy(false)
      track('donate_failed', { status: r?.status ?? 0 })
      setStatus(
        r?.status === 400 ? 'Check the email and amount (at least 5 $ / 5 € / 100 ₽).'
          : r?.status === 422 ? 'lava.top didn’t accept this email. Try a different one.'
          : 'The payment page didn’t open. Try again in a minute.',
      )
    }
  }

  return (
    <section className="support" aria-labelledby="support-title">
      <h2 id="support-title">{patronSince ? 'Patron of the sky' : 'Support the sky'}</h2>

      {patronSince ? (
        <p className="support-note">Thank you. Your planes fly in gold foil and your passport is diplomatic.</p>
      ) : (
        <ul className="perks">
          <li><b>Gold foil</b> Your planes and trails print in metallic gold ink.</li>
          <li><b>Diplomatic passport</b> Black and gold cover and a Patron of the Sky stamp.</li>
        </ul>
      )}

      {open ? (
        <form className="donate" onSubmit={donate}>
          <div className="amounts" role="radiogroup" aria-label="Amount">
            {PRESETS[currency].map((a) => (
              <button key={a} type="button" role="radio" aria-checked={amount === a} onClick={() => setAmount(a)}>{a}</button>
            ))}
            <input aria-label="Custom amount" type="number" min={currency === 'RUB' ? 100 : 5} step="1" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            <select aria-label="Currency" value={currency} onChange={(e) => { const c = e.target.value as Currency; setCurrency(c); setAmount(PRESETS[c][1]) }}>
              <option>USD</option><option>EUR</option><option>RUB</option>
            </select>
          </div>
          <label className="email">Email for the receipt
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button className="tag" type="submit" disabled={busy}>{busy ? 'Opening payment…' : patronSince ? 'Donate again' : 'Donate and get gold'}</button>
          <p className="fine">Payments by lava.top: cards from any country, PayPal, Apple Pay. Any amount makes you a patron.</p>
          <p className="status" role="status">{status}</p>
        </form>
      ) : (
        <p className="support-note">Donations open soon.</p>
      )}
    </section>
  )
}
