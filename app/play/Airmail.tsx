'use client'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { at, projection, W } from '@/lib/geo'
import { countryName, countryNames, isCountry } from '@/lib/country'
import { EFFECT, EMOJI, LABEL, type Kind } from '@/lib/letters'
import {
  active, COMBO_WINDOW, CONDS, countryAt, headwind, MISSIONS, newGame, pickCond, select, shareText, step, tallyLine, targetPoint, TURN,
  type Cond, type CountryWeather, type Game, type GameEvent, type Letter, type Sky,
} from '@/lib/airmail'
import { dailyShare, dayNumber, flag, rng, routeCode, type Route } from '@/lib/postcard'
import { rankOf, unlocked, type Rank } from '@/lib/ranks'
import { isPlaneModel, type PlaneModel } from '@/lib/patrons'
import Hangar, { NAMES } from '../me/Hangar'
import { authClient } from '@/lib/auth-client'
import { track } from '@/lib/track'
import { PassportStamp, RubberFilter } from '../me/Passport'
import { XMark } from '../icons'
import { C, STILL, zoomFor, type Fx, type Ghost, type Pose, type View } from './draw'
import { drawGlobeResult, drawGlobeWorld } from './globe-world'
import { inkOf } from '@/lib/wars'
import type { WarState } from '@/lib/wars-db'
import { beep, chirp, crumple, honk, isMuted, rustle, setMusic, setMuted, setWind, silence, startMusic, stopMusic, thud, unlock } from './sound'

export type Bag = {
  guest: boolean; handle: string | null; home: [number, number] | null; homeCountry?: string | null
  letters: Letter[]; weather: CountryWeather[]; sky?: Sky[]; bag: Record<Kind, number>
  daily?: number // «Today's Mail #N» — один мешок на всех на день
  collecting?: boolean // вошёл, а реплаи ещё не собраны
  xp?: number // писем доставлено за все забеги — ранг пилота
  plane?: string
}
type BoardRow = { handle: string; image: string | null; score: number; delivered: number; xp: number }
type Mode = 'mine' | 'daily' | 'free'
type Phase = 'loading' | 'intro' | 'flying' | 'over'
type Stamped = { key: number; country: string; points: number; combo: number }

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const coarse = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
const place = (iso: string | null) => (iso && iso !== 'AQ' ? countryName(iso) : 'Antarctica')
const fmt = (n: number) => Math.round(n).toLocaleString('en')
const LOW = 25
const CRASH_MS = 1300
const TRAIL_EVERY = 0.25 // как в lib/airmail: точка следа раз в четверть секунды — по ней летит призрак

// подсказки первых полётов: учим по ходу, а не стеной правил
const HINTS: [number, number, (touch: boolean) => string][] = [
  [0.3, 4, (t) => (t ? 'Touch where you want to fly' : 'Point where you want to fly')],
  [4.3, 8.5, () => 'Fly into the pink circle to deliver the letter'],
  [9, 13, (t) => (t ? 'Hold DIVE: faster, but you sink' : 'Hold SPACE or the mouse button to dive: faster, but you sink')],
  [13.5, 18, () => 'Grey streaks are the wind: ride tailwinds, dodge headwinds'],
  [18.5, 23, () => 'Fly through blue planes to catch strangers’ letters'],
  [23.5, 28, () => 'Pink rings lift you · storms push you down'],
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
function readGhost(day: number): [number, number][] | null {
  try {
    return JSON.parse(localStorage.getItem(`airmail-ghost-${day}`) ?? 'null')
  } catch {
    return null
  }
}
// призрак на маршруте: точка следа по времени полёта, курс — по соседней точке
function ghostAt(trail: [number, number][] | null, t: number): Ghost {
  if (!trail || trail.length < 2 || t / TRAIL_EVERY > trail.length - 1) return null
  const i = Math.min(trail.length - 2, Math.floor(t / TRAIL_EVERY))
  const f = t / TRAIL_EVERY - i
  const [x0, y0] = trail[i]
  const [x1, y1] = trail[i + 1]
  const dx = Math.abs(x1 - x0) > W / 2 ? 0 : x1 - x0
  return { x: x0 + dx * f, y: y0 + (y1 - y0) * f, heading: Math.atan2(y1 - y0, dx || 1e-6) }
}

// запрос с таймаутом: задумалась база — через 12 с игрок видит «Try again», а не вечное «Sorting the mailbag…»
const get = (url: string) => fetch(url, { signal: AbortSignal.timeout(12000) })

const logIn = () => {
  track('login_clicked', { from: 'airmail' })
  authClient.signIn.social({ provider: 'twitter', callbackURL: '/play' })
}

// опыт гостя живёт в браузере; у залогиненного — на сервере (сумма забегов)
const localXp = () => readNum('airmail-xp')
// гость воюет за флаг, который выбрал; по умолчанию — регион из языка браузера (en-US → US)
const localNation = (): string => {
  try {
    const saved = localStorage.getItem('airmail-nation')
    if (saved && isCountry(saved)) return saved
    const region = new Intl.Locale(navigator.language).maximize().region
    return region && isCountry(region) ? region : 'US'
  } catch {
    return 'US'
  }
}
const localPlane = (): PlaneModel => {
  try {
    const p = localStorage.getItem('airmail-plane')
    return isPlaneModel(p) && unlocked(localXp(), p) ? p : 'dart'
  } catch {
    return 'dart'
  }
}

export default function Airmail({ challenge }: { challenge?: Route } = {}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const game = useRef<Game | null>(null)
  const input = useRef({ aim: null as number | null, keys: new Set<string>(), mouse: false, button: false })
  const view = useRef<View>({ vw: 1, vh: 1, dpr: 1, z: 1, cx: 0, cy: 0 })
  const fx = useRef<Fx>({ particles: [], floaters: [], rings: [] })
  const pose = useRef<Pose>({ ...STILL })
  const freeze = useRef(0)
  const shake = useRef(0)
  const planeAt = useRef({ px: 0, py: 0 }) // где самолётик на экране — курс считается от него
  const seeded = useRef<() => number>(Math.random)
  const onEvents = useRef<(ev: GameEvent[], g: Game) => void>(() => {})
  const [phase, setPhase] = useState<Phase>('loading')
  const [mine, setMine] = useState<Bag | null>(null)
  const [daily, setDaily] = useState<Bag | null>(null)
  const [authed, setAuthed] = useState(false)
  const [mode, setMode] = useState<Mode>('daily')
  const [hud, setHud] = useState({ alt: 100, letters: [] as Letter[], target: null as number | null, over: '', score: 0, combo: 0, comboLeft: 0, hint: '', wind: 0, t: 0, mission: '' })
  const [free, setFree] = useState<Bag | null>(null)
  const [cond, setCond] = useState<Cond>(CONDS.fair)
  const [stampOn, setStampOn] = useState<Stamped | null>(null)
  const [result, setResult] = useState<Game | null>(null)
  // localStorage читается лениво: на сервере фаза loading, эти значения в разметку ещё не попадают
  const [best, setBest] = useState(() => (typeof window === 'undefined' ? 0 : readNum('airmail-best-score')))
  const [dayBest, setDayBest] = useState(0)
  const [mute, setMute] = useState(() => (typeof window === 'undefined' ? false : isMuted()))
  const [touch] = useState(() => (typeof window === 'undefined' ? false : coarse()))
  const [xp, setXp] = useState(() => (typeof window === 'undefined' ? 0 : localXp()))
  const [plane, setPlane] = useState<PlaneModel>(() => (typeof window === 'undefined' ? 'dart' : localPlane()))
  const [board, setBoard] = useState<BoardRow[]>([])
  const [boardPlace, setBoardPlace] = useState<number | null>(null)
  const [promoted, setPromoted] = useState<Rank | null>(null)
  const [wars, setWars] = useState<WarState | null>(null)
  const [guestNation, setGuestNation] = useState(() => (typeof window === 'undefined' ? 'US' : localNation()))
  const [alert, setAlert] = useState<string | null>(null)
  const fills = useRef<Map<string, string> | undefined>(undefined)
  const xpRef = useRef(xp)
  const nationRef = useRef('US')
  useEffect(() => {
    xpRef.current = xp
  }, [xp])
  const bag = mode === 'mine' ? mine : mode === 'free' ? free : daily
  // фаза для асинхронных колбэков: личный мешок, догрузившийся посреди полёта, не должен подменять режим
  const phaseRef = useRef(phase)
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])
  const [failed, setFailed] = useState(false)

  // Mail Wars: чьи флаги где стоят и событие часа (письма в эту страну ×3)
  const loadWars = useCallback(() => {
    get('/api/wars').then((r) => (r.ok ? r.json() : null)).then((w: WarState | null) => {
      if (!w) return
      fills.current = new Map(w.rulers.map(([c, n]) => [c, `${inkOf(n)}59`]))
      setWars(w)
    }).catch(() => {})
  }, [])
  const nation = mine?.homeCountry && isCountry(mine.homeCountry) ? mine.homeCountry : guestNation
  useEffect(() => {
    nationRef.current = nation
  }, [nation])
  const chooseNation = (c: string) => {
    setGuestNation(c)
    try {
      localStorage.setItem('airmail-nation', c)
    } catch {}
  }

  // мешок дня для всех; личный — если вошёл. Вошёл прямо из игры — ждём, пока соберутся реплаи
  useEffect(() => {
    let stop = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const loadMine = async (tries: number) => {
      const r = await get('/api/airmail')
      if (stop || !r.ok) return
      const b = (await r.json()) as Bag & { authed?: false }
      if (stop || b.authed === false) return
      setAuthed(true)
      setXp(b.xp ?? 0)
      // модель — только открытая серверным рангом (локальный выбор гостя мог быть другим)
      setPlane(isPlaneModel(b.plane) && unlocked(b.xp ?? 0, b.plane) ? b.plane : 'dart')
      setMine(b)
      if (b.letters.length && phaseRef.current !== 'flying' && phaseRef.current !== 'over') setMode('mine')
      else if (b.collecting && tries < 15) timer = setTimeout(() => loadMine(tries + 1).catch(() => {}), 3000)
    }
    const loadDaily = async () => {
      const r = await get('/api/airmail/guest')
      if (!r.ok) throw new Error(`guest ${r.status}`)
      const b = (await r.json()) as Bag
      if (stop) return
      setDaily(b)
      if (b.daily) setDayBest(readNum(`airmail-daily-${b.daily}`))
    }
    // intro открывается, как только пришёл мешок дня; личный подтянется следом и сменит кнопку
    const ready = () => !stop && setPhase((p) => (p === 'loading' ? 'intro' : p))
    // intro открывается с первым пришедшим мешком (дня или свободным); ошибка — только если не пришёл ни один
    let misses = 0
    const miss = () => {
      if (++misses < 2 || stop) return
      setFailed(true)
      ready()
    }
    loadDaily().then(ready, miss)
    get('/api/airmail/free')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((b: Bag) => {
        if (stop) return
        setFree(b)
        ready()
      })
      .catch(miss)
    loadMine(0).catch(() => {})
    get('/api/airmail/board').then((r) => r.json()).then((b: { rows: BoardRow[] }) => !stop && setBoard(b.rows)).catch(() => {})
    loadWars()
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [loadWars])

  // ушли со страницы посреди полёта — музыка и ветер не должны играть дальше
  useEffect(() => () => {
    stopMusic()
    silence()
  }, [])

  const home = useCallback((b: Bag) => (b.daily ? null : (b.home ?? (b.homeCountry ? at(b.homeCountry) : null))), [])

  const start = useCallback((m: Mode) => {
    const b = m === 'mine' ? mine : m === 'free' ? free : daily
    if (!b?.letters.length) return
    unlock()
    setMode(m)
    // мешок дня фиксирован; свой и свободный — тасуются каждый раз: в руках 5–6 писем, остальные ждут в пуле
    const shuffled = b.daily ? b.letters : [...b.letters].sort(() => Math.random() - 0.5)
    const hand = b.daily ? shuffled : shuffled.slice(0, m === 'mine' ? 6 : 5)
    const rand = b.daily ? rng(b.daily * 104729) : Math.random
    // погода забега: у мешка дня — по сиду, самый первый полёт новичка — спокойный
    const c = b.daily ? pickCond(rng(b.daily * 31)) : readNum('airmail-runs') < 1 ? CONDS.fair : pickCond(Math.random)
    let origin = home(b)
    if (m === 'free') {
      const isos = [...new Set(b.letters.flatMap((l) => [l.from_country, l.to_country]).filter((x): x is string => !!x && x !== 'AQ'))]
      origin = at(isos[Math.floor(Math.random() * isos.length)] ?? null)
    }
    const g = newGame(hand, b.weather, origin, b.sky ?? [], plane, { pool: shuffled.slice(hand.length), cond: c, rand })
    // событие часа — только вне мешка дня: доска дня одинаково честна в любой час
    const ev = wars?.event
    g.alert = !b.daily && ev && ev.until > Date.now() ? ev.country : null
    setAlert(g.alert)
    setCond(c)
    // сид дня: у всех одни и те же грозы и чужие самолётики; у каждого дня своя мелодия
    seeded.current = rand
    startMusic(b.daily ?? Date.now())
    setBoardPlace(null)
    setPromoted(null)
    game.current = g
    fx.current = { particles: [], floaters: [], rings: [] }
    pose.current = { ...STILL }
    input.current.aim = null
    view.current = { ...view.current, cx: g.x, cy: g.y }
    setHud({ alt: 100, letters: g.letters, target: g.target, over: '', score: 0, combo: 0, comboLeft: 0, hint: '', wind: headwind(g), t: 0, mission: '' })
    setResult(null)
    setPhase('flying')
    track('airmail_start', { mode: m, letters: b.letters.length, day: b.daily })
  }, [mine, daily, free, home, plane, wars])

  // события игры: вес штампа, очки, звук, вибрация, обрывки бумаги, штамп в паспорт
  useEffect(() => {
    onEvents.current = (ev, g) => {
      const calm = reduced()
      const f = fx.current
      const burst = (color: string[], n: number) => {
        if (calm) return
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2
          const sp = 20 + Math.random() * 45
          f.particles.push({
            x: g.x, y: g.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 15, life: 1.2, max: 1.2,
            color: color[i % color.length], size: 1.6 + Math.random() * 1.8, rot: Math.random() * 6,
          })
        }
      }
      for (const e of ev) {
        if (e.type === 'delivered') {
          const country = e.letter.to_country ?? 'AQ'
          const [tx, ty] = targetPoint(e.letter)
          setStampOn({ key: g.t, country, points: e.points, combo: e.combo })
          thud(e.combo)
          navigator.vibrate?.(e.combo > 1 ? [30, 40, 30] : 35)
          // «сон» Ниймана: мир замирает на мгновение — удар чувствуется; в серии дольше
          if (!calm) freeze.current = performance.now() + Math.min(180, 80 + e.combo * 20)
          shake.current = 10 + e.combo * 2
          pose.current.pop = 1
          f.rings.push({ x: tx, y: ty, life: 0.6, max: 0.6, color: C.pink }, { x: tx, y: ty, life: 0.9, max: 0.9, color: C.blue })
          burst([C.pink, C.blue, C.soot], 26 + e.combo * 8)
          if (mode === 'mine' && bag && !bag.guest && e.letter.id > 0)
            fetch('/api/airmail/stamp', { method: 'POST', body: JSON.stringify({ planeId: e.letter.id }) }).catch(() => {})
          track('airmail_delivered', { kind: e.letter.kind ?? 'plain', country, combo: e.combo, mode })
        }
        if (e.type === 'caught') {
          chirp()
          navigator.vibrate?.(15)
          pose.current.pop = 0.7
          burst([C.blue, C.paper], 12)
          f.floaters.push({ x: g.x, y: g.y - 8, text: `+${e.points} caught ${e.stray.label}`, color: C.blue, life: 1.6, max: 1.6 })
        }
        if (e.type === 'storm') {
          navigator.vibrate?.([10, 40, 10])
          rustle()
          if (e.storm.hot) f.floaters.push({ x: g.x, y: g.y - 8, text: 'Into the argument!', color: C.soot, life: 1.4, max: 1.4 })
        }
        if (e.type === 'balloon') {
          chirp()
          pose.current.pop = 1
          f.floaters.push({ x: g.x, y: g.y - 8, text: '🎈 +lift', color: C.pink, life: 1.4, max: 1.4, big: true })
        }
        if (e.type === 'geese') {
          honk()
          navigator.vibrate?.([20, 30, 20])
          shake.current = 8
          burst([C.paper, C.soot], 16)
          f.floaters.push({ x: g.x, y: g.y - 8, text: 'Geese! −altitude', color: C.soot, life: 1.4, max: 1.4 })
        }
        if (e.type === 'gust') {
          rustle()
          f.floaters.push({ x: g.x, y: g.y - 8, text: 'Gust!', color: C.blue, life: 1.1, max: 1.1 })
        }
        if (e.type === 'rush') {
          beep()
          f.floaters.push({ x: g.x, y: g.y - 10, text: `⏱ Rush letter to @${e.letter.to_handle}: 16s, ×3`, color: C.pink, life: 2.4, max: 2.4 })
        }
        if (e.type === 'burned') f.floaters.push({ x: g.x, y: g.y - 8, text: `Rush letter to @${e.letter.to_handle} burned`, color: C.soot, life: 1.8, max: 1.8 })
        if (e.type === 'mission') {
          thud(3)
          pose.current.pop = 1
          burst([C.blue, C.pink], 30)
          f.floaters.push({ x: g.x, y: g.y - 12, text: `🎯 ${e.text} · +300`, color: C.blue, life: 2.2, max: 2.2, big: true })
          track('airmail_mission', { text: e.text })
        }
        if (e.type === 'crashed') crumple()
        if (e.type === 'emptied') burst([C.pink, C.blue, C.soot, C.paper], 80)
        if (e.type === 'crashed' || e.type === 'emptied')
          track('airmail_over', { delivered: g.delivered.length, score: Math.round(g.score), caught: g.caught, won: g.won, mode })
      }
      // горящее письмо дымит
      if (active(g)?.kind === 'hot' && !calm && Math.random() < 0.5)
        f.particles.push({ x: g.x, y: g.y, vx: (Math.random() - 0.5) * 6, vy: -4, life: 0.9, max: 0.9, color: 'rgb(29 29 27 / .45)', size: 1.4, rot: 0 })
      setWind(Math.min(1, (100 - g.alt) / 100 + (g.inStorm ? 0.5 : 0) + (g.diving ? 0.4 : 0)))
    }
  }, [bag, mode])

  // canvas под экран и плотность пикселей
  useEffect(() => {
    const c = canvas.current!
    const fit = () => {
      const dpr = Math.min(2, devicePixelRatio || 1)
      c.width = Math.round(innerWidth * dpr)
      c.height = Math.round(innerHeight * dpr)
      view.current = { ...view.current, vw: innerWidth, vh: innerHeight, dpr, z: zoomFor(innerWidth, innerHeight) }
    }
    fit()
    addEventListener('resize', fit)
    return () => removeEventListener('resize', fit)
  }, [])

  // attract mode: пока висит intro, самолётик сам развозит письма за карточкой — сцена живая с первого кадра
  useEffect(() => {
    const b = (mine?.letters.length ? mine : null) ?? (free?.letters.length ? free : null) ?? daily
    if (phase !== 'intro' || !b?.letters.length) return
    const ctx = canvas.current!.getContext('2d')!
    const calm = reduced()
    const fresh = () => newGame(b.letters, b.weather, home(b), b.sky ?? [])
    let g = fresh()
    view.current = { ...view.current, cx: g.x, cy: g.y }
    let raf = 0
    let last = performance.now()
    const none: Fx = { particles: [], floaters: [], rings: [] }
    const frame = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      step(g, { aim: autopilot(g), turn: 0, dive: false }, dt)
      g.alt = Math.max(g.alt, 45) // демо не падает
      if (g.done) g = fresh()
      follow(view.current, g, dt, calm)
      // карточка по центру (на телефоне — внизу): самолётик летает сбоку от неё, а не под ней
      const v = view.current
      drawGlobeWorld(ctx, v.vw < 721 ? { ...v, cy: v.cy + (v.vh * 0.22) / v.z } : { ...v, cx: v.cx - (v.vw * 0.33) / v.z }, g, none, 0, STILL, null, true, fills.current)
      if (!calm) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    const vis = () => (last = performance.now())
    document.addEventListener('visibilitychange', vis)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [phase, mine, daily, free, home])

  // итоги: планета с маршрутом медленно крутится за карточкой
  useEffect(() => {
    if (phase !== 'over' || !result) return
    const ctx = canvas.current!.getContext('2d')!
    const calm = reduced()
    const t0 = performance.now()
    let raf = 0
    const frame = (now: number) => {
      const v = view.current
      drawGlobeResult(ctx, v.vw, v.vh, v.dpr, result, calm ? 0 : Math.sin(((now - t0) / 1000) * 0.3) * 35, fills.current) // покачивается, маршрут не уходит из кадра
      if (!calm) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [phase, result])

  // игровой цикл
  useEffect(() => {
    if (phase !== 'flying' || !bag) return
    const ctx = canvas.current!.getContext('2d')!
    const calm = reduced()
    const tutorial = readNum('airmail-runs') < 2
    const ghostTrail = bag.daily ? readGhost(bag.daily) : null
    let raf = 0
    let last = performance.now()
    let hudAt = 0
    let overAt = 0
    let beepAt = 0
    let endAt = 0
    let lastOver: string | null = null
    let lastTarget: number | null = null
    const finish = (g: Game) => {
      silence()
      stopMusic()
      const before = xpRef.current
      const promote = (after: number) => {
        setXp(after)
        if (rankOf(after).name !== rankOf(before).name) setPromoted(rankOf(after))
      }
      const countries = g.delivered.map((l) => l.to_country ?? 'AQ')
      if (authed) {
        fetch('/api/airmail/run', {
          method: 'POST',
          body: JSON.stringify({ day: bag.daily ?? dayNumber(), mode, score: Math.round(g.score), delivered: g.delivered.length, km: Math.round(g.km), countries }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((r: { xp: number; place: number | null } | null) => {
            if (!r) return
            promote(r.xp)
            setBoardPlace(r.place)
            if (bag.daily) fetch('/api/airmail/board').then((x) => x.json()).then((b: { rows: BoardRow[] }) => setBoard(b.rows)).catch(() => {})
          })
          .catch(() => {})
      } else {
        writeNum('airmail-xp', before + g.delivered.length)
        promote(before + g.delivered.length)
      }
      writeNum('airmail-runs', readNum('airmail-runs') + 1)
      // Mail Wars: доставленные страны уходят под флаг пилота
      if (countries.some((c) => c !== 'AQ'))
        fetch('/api/wars', { method: 'POST', body: JSON.stringify({ nation: nationRef.current, countries }) }).then(loadWars, () => {})
      const score = Math.round(g.score)
      if (score > readNum('airmail-best-score')) {
        writeNum('airmail-best-score', score)
        setBest(score)
      }
      if (bag.daily && score > readNum(`airmail-daily-${bag.daily}`)) {
        writeNum(`airmail-daily-${bag.daily}`, score)
        setDayBest(score)
        try {
          localStorage.setItem(`airmail-ghost-${bag.daily}`, JSON.stringify(g.trail.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10])))
        } catch {}
      }
      setResult({ ...g })
      setPhase('over')
    }
    const frame = (now: number) => {
      const g = game.current!
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const inp = input.current
      const keys = inp.keys
      const turn = (keys.has('ArrowRight') || keys.has('d') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0)
      if (turn) inp.aim = null
      const dive = keys.has(' ') || keys.has('Shift') || keys.has('ArrowUp') || keys.has('w') || inp.mouse || inp.button
      const p = pose.current
      const frozen = now < freeze.current

      if (!g.done && !frozen) {
        const before = g.heading
        onEvents.current(step(g, { aim: inp.aim, turn, dive }, dt, seeded.current), g)
        // крен — от скорости поворота; сжатие — к пике
        const rate = dt ? Math.atan2(Math.sin(g.heading - before), Math.cos(g.heading - before)) / dt / TURN : 0
        p.bank += (Math.max(-1, Math.min(1, rate)) - p.bank) * Math.min(1, dt * 10)
        p.squash += ((g.diving ? 1 : 0) - p.squash) * Math.min(1, dt * 8)
        // взял письмо с характером — сказать, что оно делает с полётом
        if (g.target !== lastTarget) {
          lastTarget = g.target
          const l = active(g)
          if (l?.kind && l.kind !== 'plain')
            fx.current.floaters.push({ x: g.x, y: g.y - 10, text: `${EMOJI[l.kind]} ${LABEL[l.kind]}: ${EFFECT[l.kind]}`, color: C.pink, life: 2.2, max: 2.2 })
        }
      }
      p.pop = Math.max(0, p.pop - dt * 3)
      if (g.done && !endAt) endAt = now
      if (g.done && !g.won) p.crash = calm ? 1 : Math.min(1, (now - endAt) / CRASH_MS)

      const v = view.current
      if (!frozen) follow(v, g, dt, calm)
      const k = frozen ? 0 : Math.min(dt, 0.05)
      const f = fx.current
      for (const q of f.particles) {
        q.x += q.vx * k
        q.y += q.vy * k
        q.vy += 20 * k
        q.rot += k * 4
        q.life -= k
      }
      f.particles = f.particles.filter((q) => q.life > 0)
      for (const q of f.floaters) q.life -= k
      f.floaters = f.floaters.filter((q) => q.life > 0)
      for (const q of f.rings) q.life -= k
      f.rings = f.rings.filter((q) => q.life > 0)
      shake.current = calm ? 0 : Math.max(0, shake.current - k * 30)
      const ghost = g.done ? null : ghostAt(ghostTrail, g.t)
      // старт — пикирование с орбиты: первые полторы секунды камера падает от целой планеты к самолётику
      const orbit = calm ? 1 : 1 - (1 - Math.min(1, g.t / 1.5)) ** 3
      planeAt.current = drawGlobeWorld(ctx, orbit < 1 ? { ...v, z: v.z * (0.2 + 0.8 * orbit) } : v, g, f, calm ? 0 : Math.max(shake.current, g.inStorm ? 5 : 0), p, ghost, true, fills.current)

      if (!g.done && g.alt < LOW && now - beepAt > 180 + g.alt * 25) {
        beepAt = now
        beep()
      }
      if (now - overAt > 250 && !g.done) {
        overAt = now
        const iso = countryAt(projection.invert!([g.x, g.y]) as [number, number])
        if (iso && iso !== lastOver) setHud((h) => ({ ...h, over: countryName(iso) }))
        lastOver = iso
      }
      if (now - hudAt > 100) {
        hudAt = now
        const hint = tutorial && !g.done ? (HINTS.find(([a, b]) => g.t >= a && g.t < b)?.[2](touch) ?? '') : ''
        const comboLeft = g.combo ? Math.max(0, 1 - (g.t - g.lastDelivery) / COMBO_WINDOW) : 0
        const ms = g.mission && MISSIONS[g.mission.id]
        const mission = ms ? `${ms.text} · ${g.mission!.id === 'km' ? `${fmt(g.mission!.have)} / ${fmt(ms.need)} km` : `${g.mission!.have}/${ms.need}`}` : ''
        setHud((h) => ({ ...h, alt: g.alt, letters: g.letters, target: g.target, score: g.score, combo: g.combo, comboLeft, hint, wind: headwind(g), t: g.t, mission }))
        setMusic(g.alt, g.diving, g.inStorm)
      }
      // конец: самолётик штопором уходит вниз и сминается (или салют за пустой мешок) — и только потом итоги
      if (g.done && now - endAt > (calm ? 0 : g.won ? 900 : CRASH_MS + 400)) return finish(g)
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
  }, [phase, touch, bag, authed, mode, loadWars])

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
        start(phase === 'over' ? mode : mine?.letters.length ? 'mine' : 'free')
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
  }, [phase, start, pick, mode, mine])

  // палец/курсор задаёт курс относительно самолётика на экране; зажатая кнопка мыши — пике
  const aimAt = (e: React.PointerEvent) => {
    const g = game.current
    if (!g || phase !== 'flying') return
    const { px, py } = planeAt.current
    input.current.aim = Math.atan2(e.clientY - py, e.clientX - px)
    if (e.pointerType === 'mouse') input.current.mouse = (e.buttons & 1) === 1
  }
  const release = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') input.current.mouse = false
  }
  const choosePlane = (m: PlaneModel) => {
    if (!unlocked(xp, m)) return
    setPlane(m)
    track('plane_changed', { plane: m, from: 'airmail' })
    if (authed) fetch('/api/me', { method: 'POST', body: JSON.stringify({ plane: m }) }).catch(() => {})
    else
      try {
        localStorage.setItem('airmail-plane', m)
      } catch {}
  }
  const diveOn = () => {
    input.current.button = true
  }
  const diveOff = () => {
    input.current.button = false
  }

  const low = phase === 'flying' && hud.alt < LOW
  const dayLabel = daily?.daily ? `Today’s Mail #${daily.daily}` : 'Today’s Mail'
  const ownReady = !!mine?.letters.length
  // открытка чужого забега по сегодняшнему мешку: главная кнопка — лететь тот же маршрут и побить счёт
  const beatable = !!challenge?.day && challenge.day === daily?.daily && !!daily?.letters.length

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
          {/* колонка плашек: ветер, погода, задание — раскладка сама, перенос строки ничего не ломает */}
          <div className="am-chips">
            <WindChip w={hud.wind} />
            {cond.id !== 'fair' && <p className="am-cond" key={cond.id}><b>{cond.name}</b> · {cond.blurb}</p>}
            {hud.mission && <p className="am-mission">🎯 {hud.mission}</p>}
            {alert && <p className="am-alert">{flag(alert)} {countryName(alert)}: letters there ×3 this hour</p>}
          </div>
          <div className="am-alt" role="meter" aria-label="Altitude" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hud.alt)}>
            <span style={{ transform: `scaleY(${hud.alt / 100})` }} />
          </div>
          {low && hud.alt > 0 && <p className="am-low" role="alert">Pull up! Find a pink thermal or deliver</p>}
          <p className="am-over" aria-live="polite">{hud.over && <span key={hud.over}>Now over <strong>{hud.over}</strong></span>}</p>
          {hud.hint && <p className="am-hint" key={hud.hint}>{hud.hint}</p>}
          {touch && (
            <button type="button" className="am-dive" onPointerDown={diveOn} onPointerUp={diveOff} onPointerCancel={diveOff}
              onPointerLeave={diveOff} onContextMenu={(e) => e.preventDefault()} aria-label="Hold to dive">Dive</button>
          )}
          <ul className="am-bag" aria-label="Mailbag">
            {hud.letters.map((l, i) => (
              <li key={l.id}>
                <button type="button" className={`${l.id === hud.target ? 'on' : ''}${l.rush !== undefined ? ' rush' : ''}`} aria-pressed={l.id === hud.target} onClick={() => pick(l.id)}>
                  <span className="k" title={l.rush !== undefined ? 'Rush letter: ×3' : LABEL[l.kind ?? 'plain']}>{l.rush !== undefined ? '⏱' : EMOJI[l.kind ?? 'plain']}</span>
                  <span className="to">@{l.to_handle}</span>
                  <span className="c">{i < 9 ? `${i + 1} · ` : ''}{l.rush !== undefined ? `${Math.max(0, Math.ceil(l.rush - hud.t))}s · ×3 · ` : alert && l.to_country === alert ? '×3 · ' : ''}{place(l.to_country)}</span>
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
        <button type="button" className="am-mute" aria-label={mute ? 'Turn sound on' : 'Turn sound off'} aria-pressed={!mute} onClick={() => {
          setMuted(!mute)
          setMute(!mute)
        }}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 9h4l5-4v14l-5-4H4z" />
            {mute ? <path d="M16 9l5 6M21 9l-5 6" /> : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />}
          </svg>
        </button>
      )}

      {phase === 'loading' && <div className="am-card"><p className="status">Sorting the mailbag…</p></div>}

      {phase === 'intro' && (
        <div className="am-card am-intro">
          <h1 className="title" data-ink="Airmail">Airmail</h1>
          <p className="lede">Every reply you’ve sent on X is a letter. <strong>Fly it there.</strong></p>
          {challenge && (
            <p className="am-challenge">
              Someone scored <strong>{fmt(challenge.score)}</strong>{challenge.day ? <> on Today’s Mail #{challenge.day}</> : null}, delivering {challenge.countries.length} {challenge.countries.length === 1 ? 'letter' : 'letters'}.
              {beatable ? ' Same sky, same storms. Beat it.' : challenge.day && daily?.daily && challenge.day !== daily.daily ? ` That sky has flown; today’s is #${daily.daily}.` : ' Beat it.'}
            </p>
          )}
          <div className="am-actions">
            {beatable ? (
              <button type="button" className="tag am-go" onClick={() => start('daily')}>Beat it: {dayLabel}</button>
            ) : ownReady ? (
              <button type="button" className="tag am-go" onClick={() => start('mine')}>Fly your mail</button>
            ) : free?.letters.length ? (
              <button type="button" className="tag am-go" onClick={() => start('free')}>Fly free</button>
            ) : daily?.letters.length ? (
              <button type="button" className="tag am-go" onClick={() => start('daily')}>Fly {dayLabel}</button>
            ) : null}
            {(ownReady || beatable) && !!free?.letters.length && <button type="button" className="tag outline" onClick={() => start('free')}>Free flight</button>}
            {beatable && ownReady && <button type="button" className="tag outline" onClick={() => start('mine')}>Your mail</button>}
            {!beatable && (ownReady || !!free?.letters.length) && !!daily?.letters.length && (
              <button type="button" className="tag outline" onClick={() => start('daily')}>{dayLabel} · board</button>
            )}
          </div>
          {!authed && (
            <p className="am-login">
              <button type="button" className="tag outline" onClick={logIn}><XMark /> Log in to fly your own replies</button>
              <span className="fine">Read-only. We never post.</span>
            </p>
          )}
          {authed && !ownReady && mine?.collecting && <p className="fine am-wait">Reading your replies on X… your mailbag lands in a few seconds.</p>}
          {authed && !ownReady && !mine?.collecting && <p className="fine">No replies of yours in the sky yet. Reply to someone on X, then come back. Meanwhile, fly today’s mail.</p>}
          {daily && !daily.letters.length && !ownReady && !free?.letters.length && <p className="fine">No letters in the sky yet. Come back when the planes are flying.</p>}
          {failed && !free?.letters.length && !daily?.letters.length && !ownReady && (
            <p className="am-login">
              <span className="fine">Couldn’t reach the mailbag.</span>
              <button type="button" className="tag outline" onClick={() => location.reload()}>Try again</button>
            </p>
          )}
          <div className="am-wars">
            {mine?.homeCountry && isCountry(mine.homeCountry) ? (
              <p className="fine">Mail Wars: you fly for <b>{flag(nation)} {countryName(nation)}</b>. Every letter you land paints its country your flag.</p>
            ) : (
              <label className="fine">
                Mail Wars: every letter you land paints its country your flag. Fly for{' '}
                <select value={guestNation} onChange={(e) => chooseNation(e.target.value)}>
                  {countryNames().filter(([c]) => c !== 'AQ').map(([c, n]) => <option key={c} value={c}>{flag(c)} {n}</option>)}
                </select>
              </label>
            )}
            {wars?.empires[0] && <p className="fine">{flag(wars.empires[0].nation)} {countryName(wars.empires[0].nation)} rules {wars.empires[0].countries} {wars.empires[0].countries === 1 ? 'country' : 'countries'} this week.</p>}
            {wars?.event && <p className="fine am-event"><b>{wars.event.hot ? 'Storm alert' : 'Rush hour'}</b> {flag(wars.event.country)} {countryName(wars.event.country)}: letters there score ×3 this hour (not in {dayLabel}).</p>}
          </div>
          <Hangar xp={xp} plane={plane} onPlane={choosePlane} compact />
          {!!board.length && <p className="fine am-leader">Today’s leader: <b>@{board[0].handle}</b> · {fmt(board[0].score)}</p>}
          {!!dayBest && <p className="fine">Your best today: {fmt(dayBest)} · your ghost flies with you</p>}
          <p className="fine am-by">A game by <Link href="/">Paper Planes</Link>, the live map of replies on X. Today’s mail is the same sky for everyone.</p>
        </div>
      )}

      {phase === 'over' && result && bag && (() => {
        const g = result
        const countries = g.delivered.map((l) => l.to_country ?? 'AQ')
        const unique = [...new Set(countries)]
        const hot = g.delivered.filter((l) => l.kind === 'hot').length
        const code = routeCode({ score: g.score, km: g.km, countries, day: bag.daily ?? null })
        const link = `${location.origin}/play/r/${code}`
        const text = bag.daily
          ? `${dailyShare({ day: bag.daily, countries, score: g.score, hot, won: g.won })}\nFly the same sky today:`
          : shareText({ delivered: g.delivered, km: g.km, score: g.score, won: g.won, guest: mode !== 'mine', me: bag.handle, bag: bag.bag })
        const url = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`
        const line = tallyLine(bag.bag)
        const record = Math.round(g.score) >= best && g.score > 0
        return (
          <div className="am-card am-result">
            <h1 className="title" data-ink={g.won ? 'Bag empty' : 'Landed'}>{g.won ? 'Bag empty' : 'Landed'}</h1>
            <p className="am-final"><span className="n">{fmt(g.score)}</span>{record && <span className="rec">New best</span>}</p>
            <p className="lede">
              {bag.daily ? <>{dayLabel} · </> : null}
              <strong>{g.delivered.length}</strong> {g.delivered.length === 1 ? 'letter' : 'letters'} ·{' '}
              <strong>{unique.length}</strong> {unique.length === 1 ? 'country' : 'countries'} ·{' '}
              <strong>{fmt(g.km)}</strong> km{g.caught ? <> · <strong>{g.caught}</strong> caught</> : null}
              {g.missionsDone ? <> · <strong>{g.missionsDone}</strong> {g.missionsDone === 1 ? 'mission' : 'missions'}</> : null}
            </p>
            {g.cond.id !== 'fair' && <p className="fine">Weather: {g.cond.name}</p>}
            {unique.some((c) => c !== 'AQ') && (
              <p className="am-claim">{flag(nation)} {countryName(nation)} claims {unique.filter((c) => c !== 'AQ').map((c) => flag(c)).join(' ')}
                {wars?.rulers.length ? <> · <Link href="/">see the war</Link></> : null}</p>
            )}
            {promoted && (
              <p className="am-promo">Promoted: <b>{promoted.name}</b> · {NAMES[promoted.plane]} unlocked</p>
            )}
            <p className="fine">{rankOf(xp).name} · {xp} {xp === 1 ? 'letter' : 'letters'} delivered{boardPlace && bag.daily ? <> · <b>#{boardPlace} today</b></> : null}</p>
            {line && <p className="am-jev">Jev read {mode === 'mine' ? 'your' : 'this'} mailbag: {line}</p>}
            {bag.daily && !!board.length && (
              <ol className="am-board" aria-label={`${dayLabel} leaderboard`}>
                {board.slice(0, 5).map((r, i) => (
                  <li key={r.handle} className={r.handle === mine?.handle ? 'me' : ''}>
                    <span className="n">{i + 1}</span>
                    {/* eslint-disable-next-line @next/next/no-img-element -- аватарка X, оптимизатор не нужен */}
                    {r.image?.startsWith('https://pbs.twimg.com/') ? <img src={r.image} alt="" width={24} height={24} /> : <span className="av" />}
                    <a href={`https://x.com/${r.handle}`} target="_blank" rel="noopener">@{r.handle}</a>
                    <span className="rk">{rankOf(r.xp).name}</span>
                    <b>{fmt(r.score)}</b>
                  </li>
                ))}
              </ol>
            )}
            {bag.daily && !authed && <p className="fine">Log in with X to get on today’s board.</p>}
            {!!unique.length && (
              <ul className="am-stamps">
                {unique.slice(0, 6).map((c) => (
                  <li key={c}><PassportStamp stamp={{ country: c, count: countries.filter((x) => x === c).length, first: new Date().toISOString() }} airmail /></li>
                ))}
              </ul>
            )}
            <div className="am-actions">
              <a className="tag" href={url} target="_blank" rel="noopener" onClick={() => track('airmail_share', { delivered: g.delivered.length, score: Math.round(g.score), mode })}>
                <XMark /> Share your route
              </a>
              <button type="button" className="tag outline" onClick={() => start(mode)}>Fly again</button>
              {mode !== 'daily' && !!daily?.letters.length && <button type="button" className="tag outline" onClick={() => start('daily')}>{dayLabel}</button>}
              {mode !== 'free' && !!free?.letters.length && <button type="button" className="tag outline" onClick={() => start('free')}>Free flight</button>}
              {mode !== 'mine' && ownReady && <button type="button" className="tag outline" onClick={() => start('mine')}>Your mail</button>}
            </div>
            {!authed && (
              <p className="am-login">
                <button type="button" className="tag outline" onClick={logIn}><XMark /> Log in to fly your own replies</button>
              </p>
            )}
            {mode === 'mine' && <p className="fine">Stamps landed in <Link href="/me">your passport</Link>.</p>}
          </div>
        )
      })()}
    </div>
  )
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
