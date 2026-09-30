import { geoContains, geoDistance, geoInterpolate } from 'd3-geo'
import { at, EARTH_KM, H, isoOf, land, projection, W } from './geo.ts'
import { EMOJI, KINDS, modOf, type Kind } from './letters.ts'

// ---------- типы ----------

export type Letter = {
  id: number; from_handle: string; to_handle: string; to_country: string | null; from_country?: string | null
  created_at?: string; kind: Kind | null
}
// чужой свежий реплай из общего неба — летит по своему настоящему маршруту, его можно поймать
export type Sky = { from_handle: string; to_handle: string; from_country: string | null; to_country: string | null }
export type CountryWeather = { iso: string; hot: number; warm: number; total: number }
export type Thermal = { x: number; y: number; r: number; lift: number; left: number; iso: string; warm: number }
export type Storm = { x: number; y: number; r: number; born: number; iso: string | null; hot: number }
export type Stray = { pts: [number, number][]; i: number; rate: number; x: number; y: number; heading: number; label: string }
export type Input = { aim: number | null; turn: number; dive: boolean } // aim — курс (рад), turn — −1..1 со стрелок
export type GameEvent =
  | { type: 'delivered'; letter: Letter; points: number; combo: number }
  | { type: 'caught'; stray: Stray; points: number }
  | { type: 'storm'; storm: Storm }
  | { type: 'crashed' }
  | { type: 'emptied' }
export type Game = {
  x: number; y: number; heading: number; alt: number; t: number
  letters: Letter[]; target: number | null; delivered: Letter[]
  thermals: Thermal[]; storms: Storm[]; seeds: { x: number; y: number; w: number; iso: string | null; hot: number }[]
  sky: Sky[]; strays: Stray[]; lastStray: number; caught: number
  score: number; combo: number; lastDelivery: number; leg: number
  startIso: string | null; left: boolean; diving: boolean
  trail: [number, number][]; km: number; inStorm: boolean; done: boolean; won: boolean
}

// ---------- константы (крутятся плейтестом) ----------

export const SPEED = 25 // единиц карты (ширина 1000) в секунду
export const TURN = 2.6 // рад/с
export const SINK = 6.5 // высоты в секунду (плейтест автопилотом: 40–90% писем без термиков)
export const DELIVERY_LIFT = 30
export const THERMAL_LIFT = 15
export const THERMAL_CHARGE = 30 // сколько высоты термик отдаёт за игру — кружить вечно нельзя
export const STORM_SINK = 12
export const CALM = 10 // секунд без гроз в начале
export const STORM_LIFE = 40
export const DIVE = { speed: 1.8, sink: 3 } // пике: высота в обмен на скорость
export const COMBO_WINDOW = 10 // секунд между доставками, чтобы серия не прервалась
export const COMBO_MAX = 5 // множитель серии не растёт выше — иначе счёт решает кучность писем, а не полёт
export const DELIVER_R = 9 // письмо ложится, только когда самолётик у метки адресата, а не на границе страны
export const CATCH_R = 9
export const CATCH_LIFT = 12
export const CATCH_POINTS = 50
const MAX_STRAYS = 3
const STRAY_EVERY = 2.5
const MAX_DT = 0.05
const TRAIL_EVERY = 0.25
const DEG = Math.PI / 180

// ---------- география ----------

// восточная составляющая ветра (доля SPEED) по широте: пассаты, западный перенос, полярные восточные
const KNOTS: [number, number][] = [[0, -0.35], [25, -0.35], [35, 0.5], [55, 0.5], [65, -0.25], [90, -0.25]]
export function wind(lat: number): number {
  const a = Math.min(90, Math.abs(lat))
  for (let i = 1; i < KNOTS.length; i++) {
    const [x1, y1] = KNOTS[i]
    const [x0, y0] = KNOTS[i - 1]
    if (a <= x1) return y0 + ((a - x0) / (x1 - x0)) * (y1 - y0)
  }
  return KNOTS.at(-1)![1]
}

// мир замкнут по x: расстояние по короткой стороне
export const wrapDx = (a: number, b: number) => {
  const d = Math.abs(a - b) % W
  return Math.min(d, W - d)
}
const dist = (x0: number, y0: number, x1: number, y1: number) => Math.hypot(wrapDx(x0, x1), y1 - y0)
const wrap = (x: number) => ((x % W) + W) % W

const byIso = new Map(land.map((f) => [isoOf(f), f]))
const lonlat = (x: number, y: number) => projection.invert!([x, y]) as [number, number]

// над страной адресата? Мелкие страны без полигона на карте 110m — по радиусу вокруг центра
export function delivered(p: [number, number], iso: string | null): boolean {
  if (!iso || iso === 'AQ') return p[1] < -60
  const f = byIso.get(iso)
  if (f && geoContains(f, p)) return true
  return geoDistance(p, at(iso)) < 2.5 * DEG
}

export const countryAt = (p: [number, number]) => {
  const f = land.find((f) => geoContains(f, p))
  return f ? isoOf(f) : null
}

// точка на карте, куда лететь с письмом
export const targetPoint = (l: Letter) =>
  projection(l.to_country && l.to_country !== 'AQ' ? at(l.to_country) : [0, -66])! as [number, number]

// ---------- игра ----------

// письмо в страну старта ждёт, пока самолётик из неё не вылетит: бесплатной доставки на месте нет
const local = (g: Game, l: Letter) => !g.left && !!g.startIso && l.to_country === g.startIso

function nearest(g: Game): number | null {
  const away = g.letters.filter((l) => !local(g, l))
  let best: Letter | null = null
  let bd = Infinity
  for (const l of away.length ? away : g.letters) {
    const [tx, ty] = targetPoint(l)
    const d = dist(g.x, g.y, tx, ty)
    if (d < bd) {
      bd = d
      best = l
    }
  }
  return best?.id ?? null
}

export const active = (g: Game) => g.letters.find((l) => l.id === g.target) ?? null

// у адресата: в круге сброса вокруг его метки
export const reached = (g: Game, l: Letter) => {
  const [tx, ty] = targetPoint(l)
  return dist(g.x, g.y, tx, ty) < DELIVER_R
}

// ветер вдоль курса в долях собственной скорости: + попутный, − встречный (письмо-шутка ловит ветер сильнее)
export const headwind = (g: Game) => wind(lonlat(g.x, g.y)[1]) * modOf(active(g)?.kind).wind * Math.cos(g.heading) / modOf(active(g)?.kind).speed
export function select(g: Game, id: number) {
  if (g.letters.some((l) => l.id === id)) g.target = id
}

export function newGame(letters: Letter[], weather: CountryWeather[], start: [number, number] | null, sky: Sky[] = []): Game {
  // без точки старта — из страны отправителя первого письма
  const origin = start ?? at(letters.find((l) => l.from_country)?.from_country ?? null)
  const [x, y] = projection(origin)!
  const max = Math.max(1, ...weather.map((w) => w.total))
  const places = weather.filter((w) => w.iso !== 'AQ').map((w) => ({ w, p: projection(at(w.iso))! }))
  const thermals = places.map(({ w, p }) => ({
    x: p[0], y: p[1], r: 14 + 16 * Math.min(1, w.total / max),
    lift: THERMAL_LIFT * (0.4 + (w.warm + 1) / (w.total + 2)), left: THERMAL_CHARGE, iso: w.iso, warm: w.warm,
  }))
  // грозы рождаются там, где X спорит; без погоды — над адресатами писем
  const seeds = places.length
    ? places.map(({ w, p }) => ({ x: p[0], y: p[1], w: w.hot * 3 + 1, iso: w.iso, hot: w.hot }))
    : letters.map((l) => ({ x: targetPoint(l)[0], y: targetPoint(l)[1], w: 1, iso: l.to_country, hot: 0 }))
  const g: Game = {
    x, y, heading: 0, alt: 100, t: 0, letters: [...letters], target: null, delivered: [],
    thermals, storms: [], seeds,
    sky: sky.filter((s) => s.from_country && s.to_country && s.from_country !== s.to_country), strays: [], lastStray: -Infinity, caught: 0,
    score: 0, combo: 0, lastDelivery: -Infinity, leg: 0,
    startIso: countryAt(origin), left: false, diving: false,
    trail: [[x, y]], km: 0, inStorm: false, done: false, won: false,
  }
  g.target = nearest(g)
  const a = active(g)
  if (a) {
    const [tx, ty] = targetPoint(a)
    let dx = tx - x
    if (Math.abs(dx) > W / 2) dx -= Math.sign(dx) * W
    g.heading = Math.atan2(ty - y, dx)
  }
  return g
}

function spawnStorm(g: Game, rand: () => number) {
  const total = g.seeds.reduce((s, p) => s + p.w, 0)
  let r = rand() * total
  const seed = g.seeds.find((p) => (r -= p.w) <= 0) ?? g.seeds[0]
  g.storms.push({
    x: wrap(seed.x + (rand() - 0.5) * 60),
    y: Math.min(H - 20, Math.max(20, seed.y + (rand() - 0.5) * 40)),
    r: 25 + rand() * 15, born: g.t, iso: seed.iso, hot: seed.hot,
  })
}

// чужой самолётик по настоящему маршруту (большой круг), который проходит рядом с игроком
function spawnStray(g: Game, rand: () => number) {
  const N = 48
  for (let tries = 0; tries < 20 && g.sky.length; tries++) {
    const s = g.sky[Math.floor(rand() * g.sky.length)]
    const route = geoInterpolate(at(s.from_country), at(s.to_country))
    const pts: [number, number][] = []
    for (let k = 0; k <= N; k++) {
      const [px, py] = projection(route(k / N))!
      // разворачиваем x через шов, чтобы соседние точки не прыгали на ширину мира
      const prev = pts[k - 1]
      pts.push([prev ? px + Math.round((prev[0] - px) / W) * W : px, py])
    }
    let best = -1
    let bd = Infinity
    pts.forEach(([px, py], k) => {
      const d = dist(g.x, g.y, wrap(px), py)
      if (d < bd) {
        bd = d
        best = k
      }
    })
    if (bd > 160) continue
    let len = 0
    for (let k = 1; k <= N; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1])
    const perSample = len / N
    if (perSample < 0.5) continue
    // появляется за ~120 единиц до точки встречи — игрок успевает её увидеть и перехватить
    const i = Math.max(0, best - 120 / perSample)
    const stray: Stray = { pts, i, rate: (SPEED * 0.8) / perSample, x: 0, y: 0, heading: 0, label: `@${s.from_handle} → @${s.to_handle}` }
    moveStray(stray, 0)
    g.strays.push(stray)
    return
  }
}

function moveStray(s: Stray, dt: number) {
  s.i += s.rate * dt
  const k = Math.min(s.pts.length - 2, Math.floor(s.i))
  const f = Math.min(1, s.i - k)
  const [x0, y0] = s.pts[k]
  const [x1, y1] = s.pts[k + 1]
  s.x = wrap(x0 + (x1 - x0) * f)
  s.y = y0 + (y1 - y0) * f
  s.heading = Math.atan2(y1 - y0, x1 - x0)
}

export function step(g: Game, input: Input, rawDt: number, rand = Math.random): GameEvent[] {
  if (g.done) return []
  const dt = Math.min(rawDt, MAX_DT)
  const ev: GameEvent[] = []
  const m = modOf(active(g)?.kind)
  g.t += dt
  g.diving = input.dive

  // курс: к пальцу/курсору не быстрее TURN, иначе стрелками
  if (input.aim !== null) {
    let d = input.aim - g.heading
    d = Math.atan2(Math.sin(d), Math.cos(d))
    g.heading += Math.max(-TURN * dt, Math.min(TURN * dt, d))
  } else g.heading += input.turn * TURN * dt
  // гроза болтает самолётик
  if (g.inStorm) g.heading += (rand() - 0.5) * 5 * dt

  const dive = input.dive ? DIVE : { speed: 1, sink: 1 }
  const before = lonlat(g.x, g.y)
  const vx = Math.cos(g.heading) * SPEED * m.speed * dive.speed + wind(before[1]) * SPEED * m.wind
  const vy = Math.sin(g.heading) * SPEED * m.speed * dive.speed
  g.x = wrap(g.x + vx * dt)
  g.y = Math.min(H - 2, Math.max(2, g.y + vy * dt))
  const here = lonlat(g.x, g.y)
  const km = geoDistance(before, here) * EARTH_KM
  g.km += km
  g.leg += km
  if (!g.left && !(g.startIso && delivered(here, g.startIso))) g.left = true

  // высота
  g.alt -= SINK * m.sink * dive.sink * dt
  for (const th of g.thermals) {
    if (th.left > 0 && dist(g.x, g.y, th.x, th.y) < th.r) {
      const lift = Math.min(th.left, th.lift * dt)
      th.left -= lift
      g.alt += lift
    }
  }
  const storm = g.storms.find((s) => dist(g.x, g.y, s.x, s.y) < s.r)
  if (storm) g.alt -= STORM_SINK * dt
  if (storm && !g.inStorm) ev.push({ type: 'storm', storm })
  g.inStorm = !!storm

  // грозы: после затишья, больше со временем, дрейфуют по ветру, живут STORM_LIFE
  g.storms = g.storms.filter((s) => g.t - s.born < STORM_LIFE)
  for (const s of g.storms) s.x = wrap(s.x + wind(lonlat(s.x, s.y)[1]) * SPEED * 0.5 * dt)
  const want = g.t < CALM ? 0 : Math.min(10, 3 + Math.floor((g.t - CALM) / 20))
  while (g.storms.length < want && g.seeds.length) spawnStorm(g, rand)

  // живое небо: чужие самолётики пересекают путь; пролетел сквозь — поймал
  for (const s of g.strays) moveStray(s, dt)
  g.strays = g.strays.filter((s) => {
    if (s.i >= s.pts.length - 1) return false
    if (dist(g.x, g.y, s.x, s.y) > CATCH_R) return true
    g.alt += CATCH_LIFT
    g.caught++
    const points = CATCH_POINTS * Math.max(1, g.combo)
    g.score += points
    ev.push({ type: 'caught', stray: s, points })
    return false
  })
  if (g.t > 2 && g.strays.length < MAX_STRAYS && g.t - g.lastStray > STRAY_EVERY) {
    g.lastStray = g.t
    spawnStray(g, rand)
  }

  // доставка: очки за длину плеча и «жар» письма, серия быстрых доставок умножает
  const letter = active(g)
  if (letter && !local(g, letter) && reached(g, letter)) {
    g.combo = g.t - g.lastDelivery < COMBO_WINDOW ? g.combo + 1 : 1
    g.lastDelivery = g.t
    const points = Math.round((100 + g.leg / 10) * m.score * Math.min(g.combo, COMBO_MAX))
    g.score += points
    g.leg = 0
    g.alt += DELIVERY_LIFT * m.delivery
    g.letters = g.letters.filter((l) => l.id !== letter.id)
    g.delivered.push(letter)
    g.target = nearest(g)
    ev.push({ type: 'delivered', letter, points, combo: g.combo })
  }
  if (g.t - g.lastDelivery >= COMBO_WINDOW) g.combo = 0
  g.alt = Math.min(100, g.alt)

  if (g.t - (g.trail.length - 1) * TRAIL_EVERY >= TRAIL_EVERY) g.trail.push([g.x, g.y])

  if (!g.letters.length) {
    g.done = g.won = true
    ev.push({ type: 'emptied' })
  } else if (g.alt <= 0) {
    g.alt = 0
    g.done = true
    ev.push({ type: 'crashed' })
  }
  return ev
}

// ---------- итоги ----------

export const tally = (letters: Letter[]) => {
  const t = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<Kind, number>
  for (const l of letters) t[l.kind ?? 'plain']++
  return t
}

export const tallyLine = (t: Record<Kind, number>) =>
  KINDS.filter((k) => k !== 'plain' && t[k]).map((k) => `${t[k]} ${EMOJI[k]}`).join(' · ')

export function shareText(o: { delivered: Letter[]; km: number; score: number; won: boolean; guest: boolean; me: string | null; bag: Record<Kind, number> }) {
  const n = o.delivered.length
  const countries = new Set(o.delivered.map((l) => l.to_country ?? 'AQ')).size
  const km = Math.round(o.km).toLocaleString('en')
  const score = Math.round(o.score).toLocaleString('en')
  const where = `${countries} ${countries === 1 ? 'country' : 'countries'}`
  const end = o.won ? 'and emptied my whole mailbag' : 'before my paper plane hit the ground'
  if (o.guest) return `Scored ${score} flying ${n} real X replies across ${where} (${km} km) as a paper plane ${end} ✈️ Beat that:`
  const lines = [`Scored ${score}: hand-delivered ${n} of my X replies to ${where} (${km} km) ${end} ✈️`]
  const total = Object.values(o.bag).reduce((a, b) => a + b, 0)
  if (o.bag.hot && total) lines.push(`Jev says ${Math.round((o.bag.hot / total) * 100)}% of my replies are hot takes 🔥`)
  const to = [...new Set(o.delivered.map((l) => l.to_handle).filter((h) => h && h !== o.me))].slice(0, 3)
  if (to.length) lines.push(`${to.map((h) => `@${h}`).join(' ')} — your mail arrived`)
  return lines.join('\n')
}
