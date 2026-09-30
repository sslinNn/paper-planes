'use client'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { at, projection, W } from '@/lib/geo'
import { countryName } from '@/lib/country'
import { EMOJI, LABEL, type Kind } from '@/lib/letters'
import {
  active, COMBO_WINDOW, countryAt, headwind, newGame, select, shareText, step, tallyLine, targetPoint,
  type CountryWeather, type Game, type GameEvent, type Letter, type Sky,
} from '@/lib/airmail'
import { track } from '@/lib/track'
import { PassportStamp, RubberFilter } from '../me/Passport'
import { C, drawResult, drawWorld, toScreen, zoomFor, type Floater, type Particle, type View } from './draw'
import { beep, chirp, crumple, isMuted, rustle, setMuted, setWind, silence, thud, unlock } from './sound'

export type Bag = {
  guest: boolean; handle: string | null; home: [number, number] | null; homeCountry?: string | null
  letters: Letter[]; weather: CountryWeather[]; sky?: Sky[]; bag: Record<Kind, number>
  fallback?: boolean // залогинен, но своих писем ещё нет — летит по общему небу
}
type Phase = 'loading' | 'intro' | 'flying' | 'over'
type Stamped = { key: number; country: string; points: number; combo: number }

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
const coarse = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
const place = (iso: string | null) => (iso && iso !== 'AQ' ? countryName(iso) : 'Antarctica')
const fmt = (n: number) => Math.round(n).toLocaleString('en')
const LOW = 25

// подсказки первых полётов: учим по ходу, а не стеной правил
const HINTS: [number, number, (touch: boolean) => string][] = [
  [0.5, 4.5, (t) => (t ? 'Touch where you want to fly' : 'Point where you want to fly')],
  [5, 10, (t) => (t ? 'Hold DIVE: faster, but you sink' : 'Hold SPACE or the mouse button to dive: faster, but you sink')],
  [11, 16, () => 'Grey streaks are the wind: ride tailwinds, dodge headwinds'],
  [17, 22, () => 'Fly through blue planes to catch strangers’ letters'],
  [23, 28, () => 'Pink rings lift you · storms push you down'],
]

// камера с упреждением по курсу; на шве карты прыгает вместе с самолётиком
function follow(v: View, g: Game, dt: number, calm: boolean) {
  const look = calm ? 0 : g.diving ? 70 : 45
  const tx = g.x + Math.cos(g.heading) * look
  const ty = g.y + Math.sin(g.heading) * look
  if (Math.abs(tx - v.cx) > W / 2) v.cx += Math.sign(tx - v.cx) * W
  v.cx += (tx - v.cx) * Math.min(1, dt * 3)
  v.cy += (ty - v.cy) * Math.min(1, dt * 3)
}

// курс прямо на активное письмо — для демо-полёта за карточкой intro
function autopilot(g: Game) {
  const a = active(g)
  if (!a) return null
  const [tx, ty] = targetPoint(a)
  let dx = tx - g.x
  if (Math.abs(dx) > W / 2) dx -= Math.sign(dx) * W
  return Math.atan2(ty - g.y, dx)
}

function readNum(key: string) {
  try {
    return Number(localStorage.getItem(key) ?? 0)
  } catch {
    return 0
  }
}
function writeNum(key: string, n: number) {
  try {
    localStorage.setItem(key, String(n))
  } catch {}
}

// ветер вдоль курса: попутный подгоняет, встречный тормозит — стрелка и процент от своей скорости
function WindChip({ w }: { w: number }) {
  if (Math.abs(w) < 0.08) return null
  const tail = w > 0
  return (
    <p className={`am-wind ${tail ? 'tail' : 'head'}`}>
      <svg viewBox="0 0 20 12" aria-hidden="true" style={{ rotate: tail ? '0deg' : '180deg' }}>
        <path d="M1 6 H15 M11 2 L16 6 L11 10" />
      </svg>
      {tail ? 'Tailwind' : 'Headwind'} {tail ? '+' : '−'}{Math.round(Math.abs(w) * 100)}%
    </p>
  )
}

export default function Airmail() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const game = useRef<Game | null>(null)
  const input = useRef({ aim: null as number | null, keys: new Set<string>(), mouse: false, button: false })
  const view = useRef<View>({ vw: 1, vh: 1, dpr: 1, z: 1, cx: 0, cy: 0 })
  const particles = useRef<Particle[]>([])
  const floaters = useRef<Floater[]>([])
  const shake = useRef(0)
  const onEvents = useRef<(ev: GameEvent[], g: Game) => void>(() => {})
  const [phase, setPhase] = useState<Phase>('loading')
  const [bag, setBag] = useState<Bag | null>(null)
  const [hud, setHud] = useState({ alt: 100, letters: [] as Letter[], target: null as number | null, over: '', score: 0, combo: 0, comboLeft: 0, hint: '', wind: 0 })
  const [stampOn, setStampOn] = useState<Stamped | null>(null)
  const [result, setResult] = useState<Game | null>(null)
  // localStorage читается лениво: на сервере фаза loading, эти значения в разметку ещё не попадают
  const [best, setBest] = useState(() => (typeof window === 'undefined' ? 0 : readNum('airmail-best-score')))
  const [mute, setMute] = useState(() => (typeof window === 'undefined' ? false : isMuted()))
  const [touch] = useState(() => (typeof window === 'undefined' ? false : coarse()))

  useEffect(() => {
    loadBag()
      .then((b) => (setBag(b), setPhase('intro')))
      .catch(() => setPhase('intro'))
  }, [])

  const home = useCallback((b: Bag) => (b.fallback ? null : (b.home ?? (b.homeCountry ? at(b.homeCountry) : null))), [])

  const start = useCallback(() => {
    if (!bag?.letters.length) return
    unlock()
    const g = newGame(bag.letters, bag.weather, home(bag), bag.sky ?? [])
    game.current = g
    particles.current = []
    floaters.current = []
    input.current.aim = null
    view.current = { ...view.current, cx: g.x, cy: g.y }
    setHud({ alt: 100, letters: g.letters, target: g.target, over: '', score: 0, combo: 0, comboLeft: 0, hint: '', wind: headwind(g) })
    setResult(null)
    setPhase('flying')
    track('airmail_start', { guest: bag.guest, letters: bag.letters.length })
  }, [bag, home])

  // события игры: штамп, очки, звук, вибрация, обрывки бумаги, штамп в паспорт
  useEffect(() => {
    onEvents.current = (ev, g) => {
      const calm = reduced()
      const burst = (color: string[], n: number) => {
        if (calm) return
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2
          const sp = 20 + Math.random() * 45
          particles.current.push({
            x: g.x, y: g.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 15, life: 1.2, max: 1.2,
            color: color[i % color.length], size: 1.6 + Math.random() * 1.8, rot: Math.random() * 6,
          })
        }
      }
      for (const e of ev) {
        if (e.type === 'delivered') {
          const country = e.letter.to_country ?? 'AQ'
          setStampOn({ key: g.t, country, points: e.points, combo: e.combo })
          thud(e.combo)
          navigator.vibrate?.(e.combo > 1 ? [30, 40, 30] : 35)
          shake.current = 10 + e.combo * 2
          burst([C.pink, C.blue, C.soot], 26 + e.combo * 8)
          if (bag && !bag.guest && !bag.fallback)
            fetch('/api/airmail/stamp', { method: 'POST', body: JSON.stringify({ planeId: e.letter.id }) }).catch(() => {})
          track('airmail_delivered', { kind: e.letter.kind ?? 'plain', country, combo: e.combo })
        }
        if (e.type === 'caught') {
          chirp()
          navigator.vibrate?.(15)
          burst([C.blue, C.paper], 12)
          floaters.current.push({ x: g.x, y: g.y - 8, text: `+${e.points} caught ${e.stray.label}`, color: C.blue, life: 1.6, max: 1.6 })
        }
        if (e.type === 'storm') {
          navigator.vibrate?.([10, 40, 10])
          rustle()
          if (e.storm.hot) floaters.current.push({ x: g.x, y: g.y - 8, text: 'Into the argument!', color: C.soot, life: 1.4, max: 1.4 })
        }
        if (e.type === 'crashed') crumple()
        if (e.type === 'crashed' || e.type === 'emptied')
          track('airmail_over', { delivered: g.delivered.length, score: Math.round(g.score), caught: g.caught, won: g.won, guest: bag?.guest })
      }
      // горящее письмо дымит
      if (active(g)?.kind === 'hot' && !calm && Math.random() < 0.5)
        particles.current.push({ x: g.x, y: g.y, vx: (Math.random() - 0.5) * 6, vy: -4, life: 0.9, max: 0.9, color: 'rgb(29 29 27 / .45)', size: 1.4, rot: 0 })
      setWind(Math.min(1, (100 - g.alt) / 100 + (g.inStorm ? 0.5 : 0) + (g.diving ? 0.4 : 0)))
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

  // attract mode: пока висит intro, самолётик сам развозит письма за карточкой — сцена живая с первого кадра
  useEffect(() => {
    if (phase !== 'intro' || !bag?.letters.length) return
    const ctx = canvas.current!.getContext('2d')!
    const calm = reduced()
    const fresh = () => newGame(bag.letters, bag.weather, home(bag), bag.sky ?? [])
    let g = fresh()
    view.current = { ...view.current, cx: g.x, cy: g.y }
    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      step(g, { aim: autopilot(g), turn: 0, dive: false }, dt)
      g.alt = Math.max(g.alt, 45) // демо не падает
      if (g.done) g = fresh()
      follow(view.current, g, dt, calm)
      // карточка по центру (на телефоне — внизу): самолётик летает сбоку от неё, а не под ней
      const v = view.current
      drawWorld(ctx, v.vw < 721 ? { ...v, cy: v.cy + (v.vh * 0.22) / v.z } : { ...v, cx: v.cx - (v.vw * 0.33) / v.z }, g, [], [], 0)
      if (!calm) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    const vis = () => (last = performance.now())
    document.addEventListener('visibilitychange', vis)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [phase, bag, home])

  // игровой цикл
  useEffect(() => {
    if (phase !== 'flying') return
    const ctx = canvas.current!.getContext('2d')!
    const calm = reduced()
    const tutorial = readNum('airmail-runs') < 2
    let raf = 0
    let last = performance.now()
    let hudAt = 0
    let overAt = 0
    let beepAt = 0
    let lastOver: string | null = null
    const frame = (now: number) => {
      const g = game.current!
      const dt = (now - last) / 1000
      last = now
      const inp = input.current
      const keys = inp.keys
      const turn = (keys.has('ArrowRight') || keys.has('d') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0)
      if (turn) inp.aim = null
      const dive = keys.has(' ') || keys.has('Shift') || keys.has('ArrowUp') || keys.has('w') || inp.mouse || inp.button
      onEvents.current(step(g, { aim: inp.aim, turn, dive }, dt), g)

      const v = view.current
      follow(v, g, dt, calm)
      const k = Math.min(dt, 0.05)
      for (const p of particles.current) {
        p.x += p.vx * k
        p.y += p.vy * k
        p.vy += 20 * k
        p.rot += k * 4
        p.life -= k
      }
      particles.current = particles.current.filter((p) => p.life > 0)
      for (const f of floaters.current) f.life -= k
      floaters.current = floaters.current.filter((f) => f.life > 0)
      shake.current = calm ? 0 : Math.max(0, shake.current - k * 30)
      drawWorld(ctx, v, g, particles.current, floaters.current, calm ? 0 : Math.max(shake.current, g.inStorm ? 5 : 0))

      if (g.alt < LOW && now - beepAt > 180 + g.alt * 25) {
        beepAt = now
        beep()
      }
      if (now - overAt > 250) {
        overAt = now
        const iso = countryAt(projection.invert!([g.x, g.y]) as [number, number])
        if (iso && iso !== lastOver) setHud((h) => ({ ...h, over: countryName(iso) }))
        lastOver = iso
      }
      if (now - hudAt > 100) {
        hudAt = now
        const hint = tutorial ? (HINTS.find(([a, b]) => g.t >= a && g.t < b)?.[2](touch) ?? '') : ''
        const comboLeft = g.combo ? Math.max(0, 1 - (g.t - g.lastDelivery) / COMBO_WINDOW) : 0
        setHud((h) => ({ ...h, alt: g.alt, letters: g.letters, target: g.target, score: g.score, combo: g.combo, comboLeft, hint, wind: headwind(g) }))
      }
      if (g.done) {
        silence()
        writeNum('airmail-runs', readNum('airmail-runs') + 1)
        if (g.score > readNum('airmail-best-score')) {
          writeNum('airmail-best-score', Math.round(g.score))
          setBest(Math.round(g.score))
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
  }, [phase, touch])

  const pick = useCallback((id: number) => {
    if (!game.current) return
    select(game.current, id)
    setHud((h) => ({ ...h, target: id }))
  }, [])

  // клавиатура: стрелки/WASD — руль, пробел/Shift/↑ — пике, 1–9 — письмо, Enter — старт
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
      if (k.startsWith('Arrow') || k === ' ') e.preventDefault()
      input.current.keys.add(k)
    }
    const up = (e: KeyboardEvent) => input.current.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key)
    const blur = () => input.current.keys.clear()
    addEventListener('keydown', down)
    addEventListener('keyup', up)
    addEventListener('blur', blur)
    return () => {
      removeEventListener('keydown', down)
      removeEventListener('keyup', up)
      removeEventListener('blur', blur)
    }
  }, [phase, start, pick])

  // палец/курсор задаёт курс относительно самолётика на экране; зажатая кнопка мыши — пике
  const aimAt = (e: React.PointerEvent) => {
    const g = game.current
    if (!g || phase !== 'flying') return
    const [px, py] = toScreen(view.current, g.x, g.y)
    input.current.aim = Math.atan2(e.clientY - py, e.clientX - px)
    if (e.pointerType === 'mouse') input.current.mouse = (e.buttons & 1) === 1
  }
  const release = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') input.current.mouse = false
  }
  const diveOn = () => {
    input.current.button = true
  }
  const diveOff = () => {
    input.current.button = false
  }

  const low = phase === 'flying' && hud.alt < LOW

  return (
    <div className={`airmail-stage${low ? ' low' : ''}`}>
      <canvas ref={canvas} className="airmail-canvas" onPointerDown={aimAt} onPointerMove={aimAt} onPointerUp={release} onPointerLeave={release}
        aria-label="Airmail flight map" />
      <RubberFilter />

      {phase === 'flying' && (
        <>
          <div className="am-score">
            <span className="n">{fmt(hud.score)}</span>
            {hud.combo > 1 && (
              <span className="combo" style={{ '--left': hud.comboLeft } as React.CSSProperties}>×{hud.combo} express</span>
            )}
          </div>
          <WindChip w={hud.wind} />
          <div className="am-alt" role="meter" aria-label="Altitude" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hud.alt)}>
            <span style={{ transform: `scaleY(${hud.alt / 100})` }} />
          </div>
          {low && <p className="am-low" role="alert">Pull up! Find a pink thermal or deliver</p>}
          <p className="am-over" aria-live="polite">{hud.over && <span key={hud.over}>Now over <strong>{hud.over}</strong></span>}</p>
          {hud.hint && <p className="am-hint" key={hud.hint}>{hud.hint}</p>}
          {touch && (
            <button type="button" className="am-dive" onPointerDown={diveOn} onPointerUp={diveOff} onPointerCancel={diveOff}
              onPointerLeave={diveOff} onContextMenu={(e) => e.preventDefault()} aria-label="Hold to dive">Dive</button>
          )}
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
        <div key={stampOn.key} className="am-stamp" onAnimationEnd={(e) => e.target === e.currentTarget && setStampOn(null)} aria-live="assertive">
          <PassportStamp stamp={{ country: stampOn.country, count: 1, first: new Date().toISOString() }} airmail />
          <p className="pts">+{fmt(stampOn.points)}{stampOn.combo > 1 && <span> ×{stampOn.combo} express</span>}</p>
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
          <h1 className="title" data-ink="Airmail">Airmail</h1>
          <p className="lede">Every reply you’ve sent on X is a letter. <strong>Fly it there</strong> before your paper plane hits the ground.</p>
          <ul className="am-rules">
            <li><strong>Steer</strong> with your finger, mouse or ← →. <strong>Hold {touch ? 'DIVE' : 'SPACE'}</strong> to trade height for speed.</li>
            <li>A letter lands when you fly into the <span className="pink">pink circle</span> around its recipient. Deliver fast to chain <strong>express combos</strong>.</li>
            <li>Grey streaks are the <strong>wind</strong>: trade winds blow west, westerlies blow east. Headwinds slow you down.</li>
            <li><span className="pink">Pink thermals</span> lift you where people are kind. Storms gather where X argues.</li>
            <li>Jev read every reply: 💌 glides long · 🔥 flies fast and burns · 😂 rides the wind · ❓ lifts double.</li>
          </ul>
          {bag?.guest && !bag.fallback && <p className="fine">You’re flying strangers’ letters. <Link href="/">Log in with X</Link> to fly yours.</p>}
          {bag?.fallback && <p className="fine">Your replies are still taking off. Meanwhile, fly strangers’ letters from the public sky.</p>}
          {bag && !bag.letters.length && <p className="fine">No letters in the sky yet. Come back when the planes are flying.</p>}
          {!bag && <p className="fine">Couldn’t reach the mailbag. Refresh to try again.</p>}
          <div className="am-actions">
            <button type="button" className="tag" onClick={start} disabled={!bag?.letters.length}>Fold &amp; fly</button>
            {!!best && <span className="fine">Best: {fmt(best)}</span>}
          </div>
          <p className="fine am-by">A game by <Link href="/">Paper Planes</Link>, the live map of replies on X.</p>
        </div>
      )}

      {phase === 'over' && result && bag && (() => {
        const g = result
        const countries = [...new Set(g.delivered.map((l) => l.to_country ?? 'AQ'))]
        const guest = bag.guest || !!bag.fallback
        const text = shareText({ delivered: g.delivered, km: g.km, score: g.score, won: g.won, guest, me: bag.handle, bag: bag.bag })
        const url = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(`${location.origin}/play`)}`
        const line = tallyLine(bag.bag)
        const record = Math.round(g.score) >= best && g.score > 0
        return (
          <div className="am-card am-result">
            <h1 className="title" data-ink={g.won ? 'Bag empty' : 'Landed'}>{g.won ? 'Bag empty' : 'Landed'}</h1>
            <p className="am-final"><span className="n">{fmt(g.score)}</span>{record && <span className="rec">New best</span>}</p>
            <p className="lede">
              <strong>{g.delivered.length}</strong> {g.delivered.length === 1 ? 'letter' : 'letters'} ·{' '}
              <strong>{countries.length}</strong> {countries.length === 1 ? 'country' : 'countries'} ·{' '}
              <strong>{fmt(g.km)}</strong> km{g.caught ? <> · <strong>{g.caught}</strong> caught</> : null}
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
              <a className="tag" href={url} target="_blank" rel="noopener" onClick={() => track('airmail_share', { delivered: g.delivered.length, score: Math.round(g.score), guest })}>Share on X</a>
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
