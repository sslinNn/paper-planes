'use client'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { at, projection } from '@/lib/geo'
import { countryName } from '@/lib/country'
import { EMOJI, LABEL, type Kind } from '@/lib/letters'
import { active, countryAt, newGame, select, shareText, step, tallyLine, type CountryWeather, type Game, type GameEvent, type Letter } from '@/lib/airmail'
import { track } from '@/lib/track'
import { PassportStamp, RubberFilter } from '../me/Passport'
import { C, drawResult, drawWorld, toScreen, zoomFor, type Particle, type View } from './draw'
import { crumple, isMuted, rustle, setMuted, setWind, silence, thud, unlock } from './sound'

export type Bag = {
  guest: boolean; handle: string | null; home: [number, number] | null; homeCountry?: string | null
  letters: Letter[]; weather: CountryWeather[]; bag: Record<Kind, number>
  fallback?: boolean // залогинен, но своих писем ещё нет — летит по общему небу
}
type Phase = 'loading' | 'intro' | 'flying' | 'over'

async function loadBag(): Promise<Bag> {
  const r = await fetch('/api/airmail')
  if (r.ok) {
    const b = (await r.json()) as Bag
    if (b.letters.length) return b
  }
  const g = (await (await fetch('/api/airmail/guest')).json()) as Bag
  return r.ok ? { ...g, fallback: true } : g
}

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const place = (iso: string | null) => (iso && iso !== 'AQ' ? countryName(iso) : 'Antarctica')

function readBest() {
  try {
    return Number(localStorage.getItem('airmail-best') ?? 0)
  } catch {
    return 0
  }
}

export default function Airmail() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const game = useRef<Game | null>(null)
  const input = useRef({ aim: null as number | null, keys: new Set<string>() })
  const view = useRef<View>({ vw: 1, vh: 1, dpr: 1, z: 1, cx: 0, cy: 0 })
  const particles = useRef<Particle[]>([])
  const shake = useRef(0)
  const onEvents = useRef<(ev: GameEvent[], g: Game) => void>(() => {})
  const [phase, setPhase] = useState<Phase>('loading')
  const [bag, setBag] = useState<Bag | null>(null)
  const [hud, setHud] = useState({ alt: 100, letters: [] as Letter[], target: null as number | null, over: '' })
  const [stampOn, setStampOn] = useState<{ key: number; country: string } | null>(null)
  const [result, setResult] = useState<Game | null>(null)
  // localStorage читается лениво: на сервере фаза loading, эти значения в разметку ещё не попадают
  const [best, setBest] = useState(() => (typeof window === 'undefined' ? 0 : readBest()))
  const [mute, setMute] = useState(() => (typeof window === 'undefined' ? false : isMuted()))

  useEffect(() => {
    loadBag()
      .then((b) => (setBag(b), setPhase('intro')))
      .catch(() => setPhase('intro'))
  }, [])

  const start = useCallback(() => {
    if (!bag?.letters.length) return
    unlock()
    const home = bag.fallback ? null : (bag.home ?? (bag.homeCountry ? at(bag.homeCountry) : null))
    const g = newGame(bag.letters, bag.weather, home)
    game.current = g
    particles.current = []
    view.current = { ...view.current, cx: g.x, cy: g.y }
    setHud({ alt: 100, letters: g.letters, target: g.target, over: '' })
    setResult(null)
    setPhase('flying')
    track('airmail_start', { guest: bag.guest, letters: bag.letters.length })
  }, [bag])

  // что делать на события игры: штамп, звук, вибрация, обрывки бумаги, штамп в паспорт
  useEffect(() => {
    onEvents.current = (ev, g) => {
      const calm = reduced()
      for (const e of ev) {
        if (e.type === 'delivered') {
          const country = e.letter.to_country ?? 'AQ'
          setStampOn({ key: g.t, country })
          thud()
          navigator.vibrate?.(35)
          shake.current = 10
          if (!calm)
            for (let i = 0; i < 26; i++) {
              const a = Math.random() * Math.PI * 2
              const sp = 20 + Math.random() * 40
              particles.current.push({
                x: g.x, y: g.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 15, life: 1.2, max: 1.2,
                color: [C.pink, C.blue, C.soot][i % 3], size: 1.6 + Math.random() * 1.6, rot: Math.random() * 6,
              })
            }
          if (bag && !bag.guest && !bag.fallback)
            fetch('/api/airmail/stamp', { method: 'POST', body: JSON.stringify({ planeId: e.letter.id }) }).catch(() => {})
          track('airmail_delivered', { kind: e.letter.kind ?? 'plain', country })
        }
        if (e.type === 'storm') {
          navigator.vibrate?.([10, 40, 10])
          rustle()
        }
        if (e.type === 'crashed') crumple()
        if (e.type === 'crashed' || e.type === 'emptied')
          track('airmail_over', { delivered: g.delivered.length, km: Math.round(g.km), won: g.won, guest: bag?.guest })
      }
      // горящее письмо дымит
      if (active(g)?.kind === 'hot' && !calm && Math.random() < 0.5)
        particles.current.push({ x: g.x, y: g.y, vx: (Math.random() - 0.5) * 6, vy: -4, life: 0.9, max: 0.9, color: 'rgb(29 29 27 / .45)', size: 1.4, rot: 0 })
      setWind(Math.min(1, (100 - g.alt) / 100 + (g.inStorm ? 0.5 : 0)))
    }
  }, [bag])

  // canvas под экран и плотность пикселей
  useEffect(() => {
    const c = canvas.current!
    const fit = () => {
      const dpr = Math.min(2, devicePixelRatio || 1)
      c.width = Math.round(innerWidth * dpr)
      c.height = Math.round(innerHeight * dpr)
      view.current = { ...view.current, vw: innerWidth, vh: innerHeight, dpr, z: zoomFor(innerWidth, innerHeight) }
      if (game.current?.done) drawResult(c.getContext('2d')!, innerWidth, innerHeight, dpr, game.current)
    }
    fit()
    addEventListener('resize', fit)
    return () => removeEventListener('resize', fit)
  }, [])

  // игровой цикл
  useEffect(() => {
    if (phase !== 'flying') return
    const ctx = canvas.current!.getContext('2d')!
    const calm = reduced()
    let raf = 0
    let last = performance.now()
    let hudAt = 0
    let overAt = 0
    let lastOver: string | null = null
    const frame = (now: number) => {
      const g = game.current!
      const dt = (now - last) / 1000
      last = now
      const keys = input.current.keys
      const turn = (keys.has('ArrowRight') || keys.has('d') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0)
      if (turn) input.current.aim = null
      onEvents.current(step(g, { aim: input.current.aim, turn }, dt), g)

      // камера с упреждением по курсу; на шве карты прыгает вместе с самолётиком
      const v = view.current
      const look = calm ? 0 : 40
      const tx = g.x + Math.cos(g.heading) * look
      const ty = g.y + Math.sin(g.heading) * look
      if (Math.abs(tx - v.cx) > 500) v.cx += Math.sign(tx - v.cx) * 1000
      v.cx += (tx - v.cx) * Math.min(1, dt * 3)
      v.cy += (ty - v.cy) * Math.min(1, dt * 3)

      const k = Math.min(dt, 0.05)
      for (const p of particles.current) {
        p.x += p.vx * k
        p.y += p.vy * k
        p.vy += 20 * k
        p.rot += k * 4
        p.life -= k
      }
      particles.current = particles.current.filter((p) => p.life > 0)
      shake.current = calm ? 0 : Math.max(0, shake.current - k * 30)
      drawWorld(ctx, v, g, particles.current, calm ? 0 : Math.max(shake.current, g.inStorm ? 5 : 0))

      if (now - overAt > 250) {
        overAt = now
        const iso = countryAt(projection.invert!([g.x, g.y]) as [number, number])
        if (iso && iso !== lastOver) setHud((h) => ({ ...h, over: countryName(iso) }))
        lastOver = iso
      }
      if (now - hudAt > 100) {
        hudAt = now
        setHud((h) => ({ ...h, alt: g.alt, letters: g.letters, target: g.target }))
      }
      if (g.done) {
        silence()
        if (g.delivered.length > readBest()) {
          try {
            localStorage.setItem('airmail-best', String(g.delivered.length))
          } catch {}
          setBest(g.delivered.length)
        }
        drawResult(ctx, v.vw, v.vh, v.dpr, g)
        setResult({ ...g })
        setPhase('over')
        return
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    // фоновая вкладка: rAF стоит, по возвращении dt не должен быть огромным
    const vis = () => (last = performance.now())
    document.addEventListener('visibilitychange', vis)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [phase])

  const pick = useCallback((id: number) => {
    if (!game.current) return
    select(game.current, id)
    setHud((h) => ({ ...h, target: id }))
  }, [])

  // клавиатура: стрелки/WASD — руль, 1–9 — письмо, Space/Enter — старт
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input, select, textarea')) return
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
      if ((k === ' ' || k === 'Enter') && (phase === 'intro' || phase === 'over')) {
        if ((e.target as HTMLElement).closest?.('a, button')) return
        e.preventDefault()
        start()
        return
      }
      if (phase !== 'flying') return
      if (/^[1-9]$/.test(k) && game.current) {
        const l = game.current.letters[Number(k) - 1]
        if (l) pick(l.id)
        return
      }
      if (k.startsWith('Arrow')) e.preventDefault()
      input.current.keys.add(k)
    }
    const up = (e: KeyboardEvent) => input.current.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key)
    addEventListener('keydown', down)
    addEventListener('keyup', up)
    return () => {
      removeEventListener('keydown', down)
      removeEventListener('keyup', up)
    }
  }, [phase, start, pick])

  // палец/курсор задаёт курс относительно самолётика на экране
  const aimAt = (e: React.PointerEvent) => {
    const g = game.current
    if (!g || phase !== 'flying') return
    const [px, py] = toScreen(view.current, g.x, g.y)
    input.current.aim = Math.atan2(e.clientY - py, e.clientX - px)
  }

  return (
    <div className="airmail-stage">
      <canvas ref={canvas} className="airmail-canvas" onPointerDown={aimAt} onPointerMove={aimAt} aria-label="Airmail flight map" />
      <RubberFilter />

      {phase === 'flying' && (
        <>
          <div className="am-alt" role="meter" aria-label="Altitude" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hud.alt)}>
            <span style={{ height: `${hud.alt}%` }} />
          </div>
          <p className="am-over" aria-live="polite">{hud.over && <span key={hud.over}>Now over <strong>{hud.over}</strong></span>}</p>
          <ul className="am-bag" aria-label="Mailbag">
            {hud.letters.map((l, i) => (
              <li key={l.id}>
                <button type="button" className={l.id === hud.target ? 'on' : ''} aria-pressed={l.id === hud.target} onClick={() => pick(l.id)}>
                  <span className="k" title={LABEL[l.kind ?? 'plain']}>{EMOJI[l.kind ?? 'plain']}</span>
                  <span className="to">@{l.to_handle}</span>
                  <span className="c">{i < 9 ? `${i + 1} · ` : ''}{place(l.to_country)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {stampOn && (
        <div key={stampOn.key} className="am-stamp" onAnimationEnd={() => setStampOn(null)} aria-live="assertive">
          <PassportStamp stamp={{ country: stampOn.country, count: 1, first: new Date().toISOString() }} airmail />
        </div>
      )}

      {phase !== 'loading' && (
        <button type="button" className="am-mute" aria-pressed={mute} onClick={() => {
          setMuted(!mute)
          setMute(!mute)
        }}>
          {mute ? 'Sound off' : 'Sound on'}
        </button>
      )}

      {phase === 'loading' && <div className="am-card"><p className="status">Sorting the mailbag…</p></div>}

      {phase === 'intro' && (
        <div className="am-card">
          <p className="am-kicker"><Link href="/">Paper Planes</Link> presents</p>
          <h1 className="title" data-ink="Airmail">Airmail</h1>
          <p className="lede">Every reply you’ve sent on X is a letter. <strong>Fly it there</strong> before your paper plane hits the ground.</p>
          <ul className="am-rules">
            <li>Steer with your finger, mouse or ← →. Tap a letter below to choose where you fly.</li>
            <li>Your shadow is your altitude. Deliveries and <span className="pink">pink thermals</span> lift you; storms push you down.</li>
            <li>Real winds: trade winds blow west, westerlies blow east.</li>
            <li>Jev read every reply: 💌 glides long · 🔥 flies fast and burns · 😂 rides the wind · ❓ lifts double.</li>
          </ul>
          {bag?.guest && !bag.fallback && <p className="fine">You’re flying strangers’ letters from the public sky. <Link href="/">Log in with X</Link> to fly yours.</p>}
          {bag?.fallback && <p className="fine">Your replies are still taking off. Meanwhile, fly strangers’ letters from the public sky.</p>}
          {bag && !bag.letters.length && <p className="fine">No letters in the sky yet. Come back when the planes are flying.</p>}
          {!bag && <p className="fine">Couldn’t reach the mailbag. Refresh to try again.</p>}
          <div className="am-actions">
            <button type="button" className="tag" onClick={start} disabled={!bag?.letters.length}>Fold &amp; fly</button>
            {!!best && <span className="fine">Best: {best} {best === 1 ? 'letter' : 'letters'}</span>}
          </div>
        </div>
      )}

      {phase === 'over' && result && bag && (() => {
        const g = result
        const countries = [...new Set(g.delivered.map((l) => l.to_country ?? 'AQ'))]
        const guest = bag.guest || !!bag.fallback
        const text = shareText({ delivered: g.delivered, km: g.km, won: g.won, guest, me: bag.handle, bag: bag.bag })
        const url = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(`${location.origin}/play`)}`
        const line = tallyLine(bag.bag)
        return (
          <div className="am-card am-result">
            <h1 className="title" data-ink={g.won ? 'Bag empty' : 'Landed'}>{g.won ? 'Bag empty' : 'Landed'}</h1>
            <p className="lede">
              <strong>{g.delivered.length}</strong> {g.delivered.length === 1 ? 'letter' : 'letters'} ·{' '}
              <strong>{countries.length}</strong> {countries.length === 1 ? 'country' : 'countries'} ·{' '}
              <strong>{Math.round(g.km).toLocaleString('en')}</strong> km
            </p>
            {line && <p className="am-jev">Jev read {guest ? 'this' : 'your'} mailbag: {line}</p>}
            {!!countries.length && (
              <ul className="am-stamps">
                {countries.slice(0, 6).map((c) => (
                  <li key={c}><PassportStamp stamp={{ country: c, count: g.delivered.filter((l) => (l.to_country ?? 'AQ') === c).length, first: new Date().toISOString() }} airmail /></li>
                ))}
              </ul>
            )}
            <div className="am-actions">
              <a className="tag" href={url} target="_blank" rel="noopener" onClick={() => track('airmail_share', { delivered: g.delivered.length, guest })}>Share on X</a>
              <button type="button" className="tag ghost" onClick={start}>Fly again</button>
            </div>
            {guest
              ? <p className="fine">These were strangers’ letters. <Link href="/">Log in with X</Link> to fly yours.</p>
              : <p className="fine">Stamps landed in <Link href="/me">your passport</Link>.</p>}
          </div>
        )
      })()}
    </div>
  )
}
