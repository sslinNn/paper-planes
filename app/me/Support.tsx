'use client'
import { useState } from 'react'
import { PLANE_MODELS, type PlaneModel } from '@/lib/patrons'
import { Airframe } from '../PlaneMap'

const NAMES: Record<PlaneModel, string> = { dart: 'Dart', glider: 'Glider', swallow: 'Swallow', crane: 'Crane' }
const PRESETS = { USD: [3, 10, 25], EUR: [3, 10, 25], RUB: [300, 1000, 2500] } as const
type Currency = keyof typeof PRESETS

// поддержка: донат через lava.top; донатерам — золотая фольга, своя модель и дипломатический паспорт
export default function Support({ patronSince, plane, open, onPlane }: {
  patronSince: string | null; plane: PlaneModel; open: boolean; onPlane: (p: PlaneModel) => void
}) {
  const [currency, setCurrency] = useState<Currency>('USD')
  const [amount, setAmount] = useState<number>(10)
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const donate = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setStatus('')
    const r = await fetch('/api/donate', { method: 'POST', body: JSON.stringify({ email, amount, currency }) }).catch(() => null)
    const j = r?.ok ? await r.json() : null
    if (j?.url) location.href = j.url
    else {
      setBusy(false)
      setStatus(r?.status === 400 ? 'Check the email and amount.' : 'The payment page didn’t open. Try again in a minute.')
    }
  }

  return (
    <section className="support" aria-labelledby="support-title">
      <h2 id="support-title">{patronSince ? 'Patron of the sky' : 'Support the sky'}</h2>

      {patronSince ? (
        <>
          <p className="support-note">Thank you. Your planes fly in gold foil and your passport is diplomatic. Pick your airframe:</p>
          <div className="hangar" role="radiogroup" aria-label="Your plane model">
            {PLANE_MODELS.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={plane === m} className="airframe" onClick={() => onPlane(m)}>
                <svg viewBox="-17 -16 34 32" aria-hidden="true" className="patron"><g className="dart"><Airframe model={m} /></g></svg>
                {NAMES[m]}
              </button>
            ))}
          </div>
        </>
      ) : (
        <ul className="perks">
          <li><b>Gold foil</b> Your planes and trails print in metallic gold ink.</li>
          <li><b>Your airframe</b> Fly a glider, a swallow or an origami crane instead of a dart.</li>
          <li><b>Diplomatic passport</b> Black and gold cover and a Patron of the Sky stamp.</li>
        </ul>
      )}

      {open ? (
        <form className="donate" onSubmit={donate}>
          <div className="amounts" role="radiogroup" aria-label="Amount">
            {PRESETS[currency].map((a) => (
              <button key={a} type="button" role="radio" aria-checked={amount === a} onClick={() => setAmount(a)}>{a}</button>
            ))}
            <input aria-label="Custom amount" type="number" min={currency === 'RUB' ? 100 : 1} step="1" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
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
