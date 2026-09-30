import { geoContains, geoDistance, geoInterpolate } from 'd3-geo'
import { at, EARTH_KM, H, isoOf, land, projection, W } from './geo.ts'
import { EMOJI, KINDS, modOf, type Kind } from './letters.ts'
import { PLANE_MOD } from './ranks.ts'
import type { PlaneModel } from './patrons.ts'

// ---------- типы ----------

export type Letter = {
  id: number; from_handle: string; to_handle: string; to_country: string | null; from_country?: string | null
  created_at?: string; kind: Kind | null
  rush?: number // срочное письмо: к этому моменту полёта (с) надо успеть, иначе сгорит; платит ×3
}
// чужой свежий реплай из общего неба — летит по своему настоящему маршруту, его можно поймать
export type Sky = { from_handle: string; to_handle: string; from_country: string | null; to_country: string | null }
export type CountryWeather = { iso: string; hot: number; warm: number; total: number }
export type Thermal = { x: number; y: number; r: number; lift: number; left: number; iso: string; warm: number }
export type Storm = { x: number; y: number; r: number; born: number; iso: string | null; hot: number }
export type Stray = { pts: [number, number][]; i: number; rate: number; x: number; y: number; heading: number; label: string }
export type Input = { aim: number | null; turn: number; dive: boolean } // aim — курс (рад), turn — −1..1 со стрелок

// погода забега: одно условие на полёт — меняет ветер, грозы, термики или видимость
export type CondId = 'fair' | 'jet' | 'monsoon' | 'clear' | 'night' | 'fog'
export type Cond = {
  id: CondId; name: string; blurb: string; wind: number; thermal: number; stormR: number
  calm: number; stormBase: number; stormEvery: number; stormCap: number; veil: null | 'night' | 'fog'
}
const FAIR: Cond = { id: 'fair', name: 'Fair weather', blurb: 'Steady winds, normal skies', wind: 1, thermal: 1, stormR: 1, calm: 10, stormBase: 3, stormEvery: 20, stormCap: 10, veil: null }
export const CONDS: Record<CondId, Cond> = {
  fair: FAIR,
  jet: { ...FAIR, id: 'jet', name: 'Jet stream', blurb: 'Winds ×2: ride them or fight them', wind: 2 },
  monsoon: { ...FAIR, id: 'monsoon', name: 'Monsoon', blurb: 'Storms come early and often', calm: 5, stormBase: 5, stormEvery: 12, stormCap: 14 },
  clear: { ...FAIR, id: 'clear', name: 'Clear skies', blurb: 'Barely a breeze, strong thermals, big storms', wind: 0.2, thermal: 1.6, stormR: 1.4 },
  night: { ...FAIR, id: 'night', name: 'Night mail', blurb: 'Dark skies: follow the arrow', veil: 'night' },
  fog: { ...FAIR, id: 'fog', name: 'Fog', blurb: 'Recipients show up only up close', veil: 'fog' },
}
const COND_IDS = Object.keys(CONDS) as CondId[]
export const pickCond = (rand: () => number) => CONDS[COND_IDS[Math.floor(rand() * COND_IDS.length)]]

// события посреди полёта: шар поднимает, гуси сбивают, порыв сносит вбок
export type Hazard =
  | { type: 'balloon'; x: number; y: number; born: number }
  | { type: 'geese'; x: number; y: number; vx: number; vy: number; born: number; hit: boolean }
  | { type: 'gust'; y: number; h: number; dir: number; born: number }

// задание на забег: одна цель, после выполнения — следующая
export type MissionId = 'hot' | 'ocean' | 'catch2' | 'combo3' | 'km' | 'balloon'
export const MISSIONS: Record<MissionId, { text: string; need: number }> = {
  hot: { text: 'Deliver a 🔥 hot take', need: 1 },
  ocean: { text: 'Land a letter after a 5,000 km leg', need: 1 },
  catch2: { text: 'Catch 2 stray planes', need: 2 },
  combo3: { text: 'Chain a ×3 express', need: 1 },
  km: { text: 'Fly 8,000 km', need: 8000 },
  balloon: { text: 'Grab a balloon', need: 1 },
}
export type Extra = { pool?: Letter[]; cond?: Cond; rand?: () => number }
export type GameEvent =
  | { type: 'delivered'; letter: Letter; points: number; combo: number }
  | { type: 'caught'; stray: Stray; points: number }
  | { type: 'storm'; storm: Storm }
  | { type: 'crashed' }
  | { type: 'emptied' }
  | { type: 'balloon' }
  | { type: 'geese' }
  | { type: 'gust' }
  | { type: 'rush'; letter: Letter }
  | { type: 'burned'; letter: Letter }
  | { type: 'mission'; text: string }
export type Game = {
  x: number; y: number; heading: number; alt: number; t: number
  letters: Letter[]; target: number | null; delivered: Letter[]
  thermals: Thermal[]; storms: Storm[]; seeds: { x: number; y: number; w: number; iso: string | null; hot: number }[]
  sky: Sky[]; strays: Stray[]; lastStray: number; caught: number
  score: number; combo: number; lastDelivery: number; leg: number
  startIso: string | null; left: boolean; diving: boolean; plane: PlaneModel
  trail: [number, number][]; km: number; inStorm: boolean; done: boolean; won: boolean
  pool: Letter[]; cond: Cond; hazards: Hazard[]; nextEvent: number; inGust: boolean; rushSeq: number
  mission: { id: MissionId; have: number } | null; missionsDone: number
  drop: [number, number] | null // где легло прошлое письмо: следующее — только после нового захода
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
export const BALLOON_LIFT = 35
export const GEESE_HIT = 15
export const RUSH_SECONDS = 16
export const MISSION_LIFT = 25
export const MISSION_POINTS = 300
const FIRST_EVENT = 8
const HAZARD_LIFE = { balloon: 20, geese: 14, gust: 9 } as const
const GUST_WARN = 1.5 // столько секунд порыв виден, но ещё не сносит
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
export const headwind = (g: Game) =>
  (wind(lonlat(g.x, g.y)[1]) * g.cond.wind * modOf(active(g)?.kind).wind * PLANE_MOD[g.plane].wind * Math.cos(g.heading)) /
  (modOf(active(g)?.kind).speed * PLANE_MOD[g.plane].speed)
export function select(g: Game, id: number) {
  if (g.letters.some((l) => l.id === id)) g.target = id
}

export function newGame(
  letters: Letter[], weather: CountryWeather[], start: [number, number] | null, sky: Sky[] = [], plane: PlaneModel = 'dart', extra: Extra = {},
): Game {
  const cond = extra.cond ?? FAIR
  // без точки старта — из страны отправителя первого письма
  const origin = start ?? at(letters.find((l) => l.from_country)?.from_country ?? null)
  const [x, y] = projection(origin)!
  const max = Math.max(1, ...weather.map((w) => w.total))
  const places = weather.filter((w) => w.iso !== 'AQ').map((w) => ({ w, p: projection(at(w.iso))! }))
  const thermals = places.map(({ w, p }) => ({
    x: p[0], y: p[1], r: 14 + 16 * Math.min(1, w.total / max),
    lift: THERMAL_LIFT * cond.thermal * (0.4 + (w.warm + 1) / (w.total + 2)), left: THERMAL_CHARGE, iso: w.iso, warm: w.warm,
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
    startIso: countryAt(origin), left: false, diving: false, plane,
    trail: [[x, y]], km: 0, inStorm: false, done: false, won: false,
    pool: [...(extra.pool ?? [])], cond, hazards: [], nextEvent: FIRST_EVENT, inGust: false, rushSeq: -1,
    mission: null, missionsDone: 0, drop: null,
  }
  nextMission(g, extra.rand ?? Math.random)
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

function nextMission(g: Game, rand: () => number) {
  const hot = [...g.letters, ...g.pool].some((l) => l.kind === 'hot')
  const ids = (Object.keys(MISSIONS) as MissionId[]).filter((id) => id !== g.mission?.id && (id !== 'hot' || hot))
  g.mission = { id: ids[Math.floor(rand() * ids.length)], have: 0 }
}

// продвинуть задание; выполнено — награда и следующее
function progress(g: Game, id: MissionId, by: number, ev: GameEvent[], rand: () => number) {
  if (!g.mission || g.mission.id !== id) return
  g.mission.have += by
  if (g.mission.have < MISSIONS[id].need) return
  g.alt += MISSION_LIFT
  g.score += MISSION_POINTS
  g.missionsDone++
  ev.push({ type: 'mission', text: MISSIONS[id].text })
  nextMission(g, rand)
}

// событие посреди полёта: всегда рядом с игроком, чтобы было что решать
function spawnEvent(g: Game, rand: () => number): GameEvent | null {
  const r = rand()
  const fx = Math.cos(g.heading), fy = Math.sin(g.heading)
  if (r < 0.25) {
    const side = (rand() - 0.5) * 60
    g.hazards.push({ type: 'balloon', x: wrap(g.x + fx * 110 - fy * side), y: Math.min(H - 10, Math.max(10, g.y + fy * 110 + fx * side)), born: g.t })
    return null
  }
  if (r < 0.5) {
    // клин летит поперёк пути: из точки сбоку в точку впереди
    const s = rand() < 0.5 ? -1 : 1
    const ax = g.x + fx * 60, ay = g.y + fy * 60
    const x0 = ax + fy * s * 130, y0 = ay - fx * s * 130
    const len = Math.hypot(ax - x0, ay - y0) || 1
    g.hazards.push({ type: 'geese', x: wrap(x0), y: y0, vx: ((ax - x0) / len) * 30, vy: ((ay - y0) / len) * 30, born: g.t, hit: false })
    return null
  }
  if (r < 0.72) {
    g.hazards.push({ type: 'gust', y: g.y + (rand() - 0.5) * 30, h: 18, dir: rand() < 0.5 ? -1 : 1, born: g.t })
    return null
  }
  // срочное письмо: настоящий реплай из неба, адресат не слишком близко и не слишком далеко
  const near = g.sky.filter((s) => {
    const [tx, ty] = projection(at(s.to_country))!
    const d = dist(g.x, g.y, tx, ty)
    return d > 60 && d < 220
  })
  if (!near.length) return null
  const s = near[Math.floor(rand() * near.length)]
  const letter: Letter = { id: g.rushSeq--, from_handle: s.from_handle, to_handle: s.to_handle, to_country: s.to_country, from_country: s.from_country, kind: null, rush: g.t + RUSH_SECONDS }
  g.letters.push(letter)
  return { type: 'rush', letter }
}

function spawnStorm(g: Game, rand: () => number) {
  const total = g.seeds.reduce((s, p) => s + p.w, 0)
  let r = rand() * total
  const seed = g.seeds.find((p) => (r -= p.w) <= 0) ?? g.seeds[0]
  g.storms.push({
    x: wrap(seed.x + (rand() - 0.5) * 60),
    y: Math.min(H - 20, Math.max(20, seed.y + (rand() - 0.5) * 40)),
    r: (25 + rand() * 15) * g.cond.stormR, born: g.t, iso: seed.iso, hot: seed.hot,
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
  const pm = PLANE_MOD[g.plane]
  g.t += dt
  g.diving = input.dive

  // курс: к пальцу/курсору не быстрее TURN, иначе стрелками
  if (input.aim !== null) {
    let d = input.aim - g.heading
    d = Math.atan2(Math.sin(d), Math.cos(d))
    g.heading += Math.max(-TURN * pm.turn * dt, Math.min(TURN * pm.turn * dt, d))
  } else g.heading += input.turn * TURN * pm.turn * dt
  // гроза болтает самолётик
  // (своя случайность: сид дня управляет только тем, где и когда рождаются грозы и чужие самолётики)
  if (g.inStorm) g.heading += (Math.random() - 0.5) * 5 * dt

  const dive = input.dive ? DIVE : { speed: 1, sink: 1 }
  const before = lonlat(g.x, g.y)
  const gust = g.hazards.find((h) => h.type === 'gust' && g.t - h.born > GUST_WARN && Math.abs(g.y - h.y) < h.h)
  const vx = Math.cos(g.heading) * SPEED * m.speed * pm.speed * dive.speed + wind(before[1]) * SPEED * g.cond.wind * m.wind * pm.wind +
    (gust?.type === 'gust' ? gust.dir * SPEED * 0.9 : 0)
  const vy = Math.sin(g.heading) * SPEED * m.speed * pm.speed * dive.speed
  g.x = wrap(g.x + vx * dt)
  g.y = Math.min(H - 2, Math.max(2, g.y + vy * dt))
  const here = lonlat(g.x, g.y)
  const km = geoDistance(before, here) * EARTH_KM
  g.km += km
  g.leg += km
  if (gust && !g.inGust) ev.push({ type: 'gust' })
  g.inGust = !!gust
  progress(g, 'km', km, ev, rand)
  if (!g.left && !(g.startIso && delivered(here, g.startIso))) g.left = true

  // высота
  g.alt -= SINK * m.sink * pm.sink * dive.sink * dt
  for (const th of g.thermals) {
    if (th.left > 0 && dist(g.x, g.y, th.x, th.y) < th.r) {
      const lift = Math.min(th.left, th.lift * dt)
      th.left -= lift
      g.alt += lift
    }
  }
  const storm = g.storms.find((s) => dist(g.x, g.y, s.x, s.y) < s.r)
  if (storm) g.alt -= STORM_SINK * pm.storm * dt
  if (storm && !g.inStorm) ev.push({ type: 'storm', storm })
  g.inStorm = !!storm

  // грозы: после затишья, больше со временем, дрейфуют по ветру, живут STORM_LIFE
  g.storms = g.storms.filter((s) => g.t - s.born < STORM_LIFE)
  for (const s of g.storms) s.x = wrap(s.x + wind(lonlat(s.x, s.y)[1]) * SPEED * 0.5 * dt)
  const c = g.cond
  const want = g.t < c.calm ? 0 : Math.min(c.stormCap, c.stormBase + Math.floor((g.t - c.calm) / c.stormEvery))
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
    progress(g, 'catch2', 1, ev, rand)
    return false
  })

  // события: шар, гуси, порыв, срочное письмо
  g.hazards = g.hazards.filter((h) => g.t - h.born < HAZARD_LIFE[h.type])
  for (const h of g.hazards) {
    if (h.type === 'geese') {
      h.x = wrap(h.x + h.vx * dt)
      h.y += h.vy * dt
      if (!h.hit && dist(g.x, g.y, h.x, h.y) < 9) {
        h.hit = true
        g.alt -= GEESE_HIT
        ev.push({ type: 'geese' })
      }
    }
  }
  const balloon = g.hazards.find((h) => h.type === 'balloon' && dist(g.x, g.y, h.x, h.y) < 10)
  if (balloon) {
    g.hazards = g.hazards.filter((h) => h !== balloon)
    g.alt += BALLOON_LIFT
    ev.push({ type: 'balloon' })
    progress(g, 'balloon', 1, ev, rand)
  }
  if (g.t >= g.nextEvent) {
    g.nextEvent = g.t + 9 + rand() * 5
    const e = spawnEvent(g, rand)
    if (e) ev.push(e)
  }
  for (const l of g.letters.filter((l) => l.rush !== undefined && g.t > l.rush)) {
    g.letters = g.letters.filter((x) => x !== l)
    if (g.target === l.id) g.target = nearest(g)
    ev.push({ type: 'burned', letter: l })
  }
  if (g.t > 2 && g.strays.length < MAX_STRAYS && g.t - g.lastStray > STRAY_EVERY) {
    g.lastStray = g.t
    spawnStray(g, rand)
  }

  // доставка: очки за длину плеча и «жар» письма, серия быстрых доставок умножает.
  // Кружить в одном круге и сбрасывать пачку писем в ту же точку нельзя: сначала отлети на два радиуса
  if (g.drop && dist(g.x, g.y, g.drop[0], g.drop[1]) > DELIVER_R * 2) g.drop = null
  const letter = active(g)
  if (letter && !g.drop && !local(g, letter) && reached(g, letter)) {
    g.combo = g.t - g.lastDelivery < COMBO_WINDOW ? g.combo + 1 : 1
    g.lastDelivery = g.t
    const points = Math.round((100 + g.leg / 10) * m.score * Math.min(g.combo, COMBO_MAX) * (letter.rush !== undefined ? 3 : 1))
    g.score += points
    const leg = g.leg
    g.leg = 0
    g.drop = targetPoint(letter)
    g.alt += DELIVERY_LIFT * m.delivery
    g.letters = g.letters.filter((l) => l.id !== letter.id)
    g.delivered.push(letter)
    // бесконечный мешок: на место доставленного — следующее письмо из пула
    const next = g.pool.shift()
    if (next) g.letters.push(next)
    g.target = nearest(g)
    ev.push({ type: 'delivered', letter, points, combo: g.combo })
    if (letter.kind === 'hot') progress(g, 'hot', 1, ev, rand)
    if (leg >= 5000) progress(g, 'ocean', 1, ev, rand)
    if (g.combo >= 3) progress(g, 'combo3', 1, ev, rand)
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
