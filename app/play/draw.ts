import { H, land, path, projection, W } from '@/lib/geo'
import { countryName } from '@/lib/country'
import { active, DELIVER_R, SPEED, targetPoint, THERMAL_CHARGE, STORM_LIFE, wind, type Game, type Hazard, type Letter } from '@/lib/airmail'
import { AIRFRAMES } from '@/lib/airframes'
import type { PlaneModel } from '@/lib/patrons'

export const C = { paper: '#f5f3eb', blue: '#0078bf', pink: '#ff48b0', soot: '#1d1d1b' }
export type View = { vw: number; vh: number; dpr: number; z: number; cx: number; cy: number }
export type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; rot: number }
export type Floater = { x: number; y: number; text: string; color: string; life: number; max: number; big?: boolean }
export type Ring = { x: number; y: number; life: number; max: number; color: string }
export type Fx = { particles: Particle[]; floaters: Floater[]; rings: Ring[] }
// тело самолётика: крен в повороте, сжатие в пике, подпрыгивание после подъёма, 0..1 падения
export type Pose = { bank: number; squash: number; pop: number; crash: number }
export type Ghost = { x: number; y: number; heading: number } | null
export const STILL: Pose = { bank: 0, squash: 0, pop: 0, crash: 0 }

let landPaths: { p: Path2D; b: [[number, number], [number, number]] }[] | null = null
const frames = new Map<string, { wing: Path2D[]; fold: Path2D[] }>()
let dots: CanvasPattern | null = null
const buildLand = () => (landPaths ??= land.map((f) => ({ p: new Path2D(path(f) ?? ''), b: path.bounds(f) })))
// пути модели самолётика для canvas — те же, что на SVG-карте, собираются один раз на модель
const airframe = (model: PlaneModel = 'dart') => {
  let f = frames.get(model)
  if (!f) frames.set(model, (f = { wing: AIRFRAMES[model].wing.map((d) => new Path2D(d)), fold: AIRFRAMES[model].fold.map((d) => new Path2D(d)) }))
  return f
}

// riso-растр суши, как на главной карте: синяя точка в клетке
function halftone(ctx: CanvasRenderingContext2D) {
  if (dots) return dots
  const c = document.createElement('canvas')
  c.width = c.height = 6
  const g = c.getContext('2d')!
  g.fillStyle = 'rgb(0 120 191 / .55)'
  g.beginPath()
  g.arc(3, 3, 1.25, 0, Math.PI * 2)
  g.fill()
  dots = ctx.createPattern(c, 'repeat')!
  dots.setTransform(new DOMMatrix().scale(0.45))
  return dots
}

// облака-вырезки: постоянные для мира (детерминированный генератор), чтобы не мигали между кадрами
const CLOUDS = (() => {
  let s = 7
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  return Array.from({ length: 90 }, () => ({ x: r() * W, y: 20 + r() * (H - 40), size: 7 + r() * 13, puffs: 3 + Math.floor(r() * 3), seed: r() }))
})()
const PARALLAX = 1.35 // облака ближе к камере, чем земля, — едут быстрее

// камера: на экране ~300 единиц карты по длинной стороне
export const zoomFor = (vw: number, vh: number) => Math.max(vw, vh) / 300

export const toScreen = (v: View, x: number, y: number, k = 1): [number, number] => {
  let dx = x - v.cx
  if (dx > W / 2) dx -= W
  if (dx < -W / 2) dx += W
  return [v.vw / 2 + dx * v.z * k, v.vh / 2 + (y - v.cy) * v.z * k]
}

// box — видимая часть мира [x0, y0, x1, y1]: страны вне экрана не рисуем, на телефоне это половина кадра
function drawLand(ctx: CanvasRenderingContext2D, z: number, box?: [number, number, number, number]) {
  const pat = halftone(ctx)
  ctx.strokeStyle = 'rgb(0 120 191 / .7)'
  ctx.lineWidth = 1 / z
  for (const { p, b } of buildLand()) {
    if (box && (b[1][0] < box[0] || b[0][0] > box[2] || b[1][1] < box[1] || b[0][1] > box[3])) continue
    ctx.fillStyle = 'rgb(0 120 191 / .08)'
    ctx.fill(p)
    ctx.fillStyle = pat
    ctx.fill(p)
    ctx.stroke(p)
  }
}

// след авиапочты: красно-синий пунктир конверта; на шве карты линия рвётся, а не тянется через весь мир
function drawTrail(ctx: CanvasRenderingContext2D, pts: [number, number][], z: number, width = 2.4) {
  ctx.lineWidth = width / z
  ctx.lineCap = 'butt'
  for (const [i, color] of [[0, C.blue], [1, C.pink]] as const) {
    ctx.strokeStyle = color
    ctx.setLineDash([6 / z, 6 / z])
    ctx.lineDashOffset = (-i * 6) / z
    ctx.beginPath()
    pts.forEach(([x, y], k) => (k && Math.abs(x - pts[k - 1][0]) < W / 2 ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.stroke()
  }
  ctx.setLineDash([])
}

function drawPlane(
  ctx: CanvasRenderingContext2D, x: number, y: number, heading: number, scale: number,
  style: 'shadow' | 'pilot' | 'stray' | 'ghost', pose: Pose = STILL, shadowAlpha = 0.2, model: PlaneModel = 'dart',
) {
  const a = airframe(model)
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(heading + pose.crash * pose.crash * 14)
  // крен читается как сплющивание по размаху крыльев; пике вытягивает; подъём подбрасывает
  const k = scale * (1 + 0.28 * pose.pop) * (1 - 0.85 * pose.crash)
  ctx.scale(k * (1 + 0.14 * pose.squash), k * (1 - 0.42 * Math.abs(pose.bank)) * (1 - 0.18 * pose.squash))
  if (style === 'shadow') {
    ctx.fillStyle = `rgb(29 29 27 / ${shadowAlpha.toFixed(3)})`
    for (const p of a.wing) ctx.fill(p)
  } else if (style === 'ghost') {
    ctx.globalAlpha = 0.45
    ctx.setLineDash([2, 2])
    ctx.lineWidth = 1
    ctx.strokeStyle = C.blue
    for (const p of a.wing) ctx.stroke(p)
  } else {
    ctx.lineWidth = 0.6
    ctx.lineJoin = 'round'
    ctx.fillStyle = style === 'pilot' ? C.pink : C.paper
    ctx.strokeStyle = style === 'pilot' ? C.soot : C.blue
    for (const p of a.wing) {
      ctx.fill(p)
      ctx.stroke(p)
    }
    // нижнее крыло темнее на стороне крена — самолётик «ложится» на бок
    ctx.fillStyle = `rgb(0 120 191 / ${(0.55 + 0.3 * Math.abs(pose.bank)).toFixed(3)})`
    for (const p of a.fold) ctx.fill(p)
  }
  ctx.restore()
}

// смятый бумажный шарик — то, что остаётся от самолётика
function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = C.pink
  ctx.strokeStyle = C.soot
  ctx.lineWidth = 0.6
  ctx.lineJoin = 'round'
  ctx.beginPath()
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2
    const rr = r * (0.75 + 0.25 * Math.sin(i * 2.7))
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
  }
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(-r * 0.5, -r * 0.2)
  ctx.lineTo(r * 0.1, r * 0.1)
  ctx.lineTo(r * 0.4, -r * 0.4)
  ctx.moveTo(-r * 0.2, r * 0.5)
  ctx.lineTo(r * 0.2, r * 0.15)
  ctx.stroke()
  ctx.restore()
}

// чернильный штамп там, где письмо легло: карта запоминает маршрут
function drawInk(ctx: CanvasRenderingContext2D, l: Letter, z: number) {
  const [x, y] = targetPoint(l)
  const iso = l.to_country ?? 'AQ'
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(((l.id * 37) % 30 - 15) * (Math.PI / 180))
  ctx.strokeStyle = 'rgb(255 72 176 / .85)'
  ctx.lineWidth = 1.4 / z
  ctx.beginPath()
  ctx.arc(0, 0, 7, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, 0, 5.6, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = 'rgb(255 72 176 / .9)'
  ctx.font = `900 ${5}px "Big Shoulders", Archivo, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(iso, 0, 0.3)
  ctx.restore()
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, z: number, color: string, size = 11) {
  ctx.font = `800 ${size / z}px Archivo, system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.lineWidth = 3 / z
  ctx.strokeStyle = C.paper
  ctx.lineJoin = 'round'
  ctx.strokeText(text, x, y)
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
}

// ветер: серые штрихи текут по пассатам и западному переносу со скоростью ветра на этой широте
const WIND_CELL = 30
const hash = (x: number, y: number) => {
  const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return h - Math.floor(h)
}
function drawWind(ctx: CanvasRenderingContext2D, v: View, t: number) {
  const hw = v.vw / 2 / v.z, hh = v.vh / 2 / v.z
  const x0 = Math.floor((v.cx - hw) / WIND_CELL) * WIND_CELL
  const y0 = Math.max(0, Math.floor((v.cy - hh) / WIND_CELL) * WIND_CELL)
  ctx.lineWidth = 1.4 / v.z
  ctx.lineCap = 'round'
  for (let y = y0; y <= Math.min(H, v.cy + hh); y += WIND_CELL) {
    const w = wind((projection.invert!([W / 2, y]) as [number, number])[1])
    const dir = Math.sign(w) || 1
    const len = 5 + Math.abs(w) * 16
    for (let x = x0; x <= v.cx + hw; x += WIND_CELL) {
      const j = hash(((x % W) + W) % W, y)
      const phase = (t * (Math.abs(w) * SPEED * 0.8) / WIND_CELL + j) % 1
      const px = x + (dir > 0 ? phase : 1 - phase) * WIND_CELL
      const py = y + (j - 0.5) * WIND_CELL * 0.7
      ctx.strokeStyle = `rgb(29 29 27 / ${(Math.sin(phase * Math.PI) * 0.55).toFixed(3)})`
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(px - dir * len, py)
      // острие по направлению ветра
      ctx.moveTo(px, py)
      ctx.lineTo(px - dir * 2.2, py - 1.4)
      ctx.stroke()
    }
  }
}

function drawLetters(ctx: CanvasRenderingContext2D, letters: Letter[], target: number | null, z: number, t: number) {
  // несколько писем в одну страну — одна метка, подписи стопкой
  const seen = new Map<string, number>()
  for (const l of [...letters].sort((a, b) => Number(b.id === target) - Number(a.id === target))) {
    const [x, y] = targetPoint(l)
    const key = `${Math.round(x)}:${Math.round(y)}`
    const n = seen.get(key) ?? 0
    seen.set(key, n + 1)
    const on = l.id === target
    const w = 14 / z, h = 9.5 / z
    if (!n) {
      if (on) {
        // круг сброса: письмо ложится, только когда самолётик внутри
        ctx.fillStyle = 'rgb(255 72 176 / .12)'
        ctx.strokeStyle = C.pink
        ctx.lineWidth = 1.5 / z
        ctx.setLineDash([3 / z, 3 / z])
        ctx.lineDashOffset = -t * 6 / z
        ctx.beginPath()
        ctx.arc(x, y, DELIVER_R, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        ctx.setLineDash([])
        ctx.lineWidth = 2.5 / z
        for (const k of [0, 0.5]) {
          const p = (t * 0.8 + k) % 1
          ctx.globalAlpha = 1 - p
          ctx.beginPath()
          ctx.arc(x, y, (10 + 26 * p) / z, 0, Math.PI * 2)
          ctx.stroke()
        }
        ctx.globalAlpha = 1
      }
      ctx.fillStyle = on ? C.pink : C.paper
      ctx.strokeStyle = C.soot
      ctx.lineWidth = 1.2 / z
      ctx.fillRect(x - w / 2, y - h / 2, w, h)
      ctx.strokeRect(x - w / 2, y - h / 2, w, h)
      ctx.beginPath()
      ctx.moveTo(x - w / 2, y - h / 2)
      ctx.lineTo(x, y + h / 6)
      ctx.lineTo(x + w / 2, y - h / 2)
      ctx.stroke()
    }
    if (l.rush !== undefined) {
      // кольцо таймера тает по часовой стрелке
      const left = Math.max(0, l.rush - t) / 16
      ctx.strokeStyle = C.pink
      ctx.lineWidth = 3 / z
      ctx.beginPath()
      ctx.arc(x, y, 13 / z + 4, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2)
      ctx.stroke()
      label(ctx, `⏱ ${Math.ceil(Math.max(0, l.rush - t))}s`, x, y - 20 / z - 4, z, C.pink, 12)
    }
    if (n < 3) label(ctx, n === 2 ? '…' : `@${l.to_handle}`, x, y + h + (12 + n * 13) / z, z, on ? C.pink : C.soot)
  }
}

// события: шар (подъём), клин гусей (сбивает), полоса порыва (сносит вбок, сначала видна бледно)
function drawHazards(ctx: CanvasRenderingContext2D, hs: Hazard[], v: View, t: number) {
  for (const h of hs) {
    if (h.type === 'balloon') {
      const y = h.y + Math.sin(t * 2 + h.born) * 1.5
      ctx.strokeStyle = C.soot
      ctx.lineWidth = 0.6 / v.z + 0.2
      ctx.beginPath()
      ctx.moveTo(h.x - 3, y + 5)
      ctx.lineTo(h.x - 1.6, y + 10)
      ctx.moveTo(h.x + 3, y + 5)
      ctx.lineTo(h.x + 1.6, y + 10)
      ctx.stroke()
      ctx.fillStyle = C.pink
      ctx.beginPath()
      ctx.ellipse(h.x, y, 6, 7, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = C.blue
      ctx.beginPath()
      ctx.ellipse(h.x, y, 2.2, 7, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = C.soot
      ctx.fillRect(h.x - 1.8, y + 10, 3.6, 2.6)
      label(ctx, 'lift!', h.x, y - 11, v.z, C.pink, 10)
    }
    if (h.type === 'geese') {
      const a = Math.atan2(h.vy, h.vx)
      ctx.save()
      ctx.translate(h.x, h.y)
      ctx.rotate(a)
      ctx.strokeStyle = h.hit ? 'rgb(29 29 27 / .35)' : C.soot
      ctx.lineWidth = 1.3 / v.z + 0.3
      ctx.lineCap = 'round'
      const flap = Math.sin(t * 12) * 1.2
      for (const [bx, by] of [[0, 0], [-4, -3.5], [-4, 3.5], [-8, -7], [-8, 7]]) {
        ctx.beginPath()
        ctx.moveTo(bx - 2, by - 2.2 - flap)
        ctx.lineTo(bx, by)
        ctx.lineTo(bx - 2, by + 2.2 + flap)
        ctx.stroke()
      }
      ctx.restore()
    }
    if (h.type === 'gust') {
      const live = t - h.born > 1.5
      const half = v.vw / 2 / v.z
      const x0 = v.cx - half - 20, x1 = v.cx + half + 20
      ctx.fillStyle = `rgb(0 120 191 / ${live ? 0.13 : 0.05 + 0.04 * Math.sin(t * 10)})`
      ctx.fillRect(x0, h.y - h.h, x1 - x0, h.h * 2)
      ctx.strokeStyle = `rgb(0 120 191 / ${live ? 0.7 : 0.35})`
      ctx.lineWidth = 1.4 / v.z
      ctx.beginPath()
      for (let x = Math.floor(x0 / 24) * 24; x < x1; x += 24) {
        const px = x + ((t * 40 * h.dir) % 24)
        for (const dy of [-h.h * 0.5, h.h * 0.5]) {
          ctx.moveTo(px - h.dir * 5, h.y + dy - 3)
          ctx.lineTo(px, h.y + dy)
          ctx.lineTo(px - h.dir * 5, h.y + dy + 3)
        }
      }
      ctx.stroke()
      if (!live) label(ctx, 'gust incoming', v.cx, h.y - h.h - 3, v.z, C.blue, 10)
    }
  }
}

// ночь и туман: вуаль с окном видимости вокруг самолётика
function drawVeil(ctx: CanvasRenderingContext2D, v: View, g: Game) {
  const kind = g.cond.veil
  if (!kind) return 0
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0)
  const [px, py] = toScreen(v, g.x, g.y)
  const r0 = Math.min(v.vw, v.vh) * (kind === 'night' ? 0.24 : 0.2)
  const grad = ctx.createRadialGradient(px, py, r0, px, py, r0 * 2.1)
  const rgb = kind === 'night' ? '14 17 38' : '245 243 235'
  grad.addColorStop(0, `rgb(${rgb} / 0)`)
  grad.addColorStop(1, `rgb(${rgb} / ${kind === 'night' ? 0.84 : 0.93})`)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, v.vw, v.vh)
  if (kind === 'night') {
    ctx.fillStyle = 'rgb(245 243 235 / .7)'
    for (let i = 0; i < 60; i++) {
      const sx = (hash(i, 1) * v.vw + v.cx * 0.3 * v.z) % v.vw
      const sy = hash(i, 2) * v.vh
      if (Math.hypot(sx - px, sy - py) > r0 * 1.8) ctx.fillRect(sx, sy, 1.5, 1.5)
    }
  }
  return r0
}

function drawClouds(ctx: CanvasRenderingContext2D, v: View, t: number) {
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0)
  const zc = v.z * PARALLAX
  for (const c of CLOUDS) {
    const [sx, sy] = toScreen(v, c.x + t * 1.5, c.y, PARALLAX)
    const r = c.size * zc * 0.5
    if (sx < -r * 3 || sx > v.vw + r * 3 || sy < -r * 3 || sy > v.vh + r * 3) continue
    // бумажная вырезка: синий оттиск со сдвигом (несовпадение riso), сверху бумага
    for (const [dx, dy, fill] of [[2.5, 2, 'rgb(0 120 191 / .28)'], [0, 0, 'rgb(245 243 235 / .93)']] as const) {
      ctx.fillStyle = fill
      ctx.beginPath()
      for (let k = 0; k < c.puffs; k++) {
        const px = sx + dx + (k - (c.puffs - 1) / 2) * r * 0.9
        const py = sy + dy - Math.sin((k + c.seed) * 2.1) * r * 0.35
        ctx.moveTo(px + r, py)
        ctx.arc(px, py, r * (0.75 + 0.25 * Math.sin(k * 1.7 + c.seed * 6)), 0, Math.PI * 2)
      }
      ctx.fill()
    }
  }
}

export function drawWorld(
  ctx: CanvasRenderingContext2D, v: View, g: Game, fx: Fx, shake: number, pose: Pose = STILL, ghost: Ghost = null, clouds = true,
) {
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0)
  ctx.fillStyle = C.paper
  ctx.fillRect(0, 0, v.vw, v.vh)
  const sx = shake ? (Math.random() - 0.5) * shake : 0
  const sy = shake ? (Math.random() - 0.5) * shake : 0
  const half = v.vw / 2 / v.z
  const halfH = v.vh / 2 / v.z
  const scale = 0.42 + g.alt * 0.0025
  const copies = [-W, 0, W].filter((off) => !(v.cx - off + half < 0 || v.cx - off - half > W))
  const world = (off: number) =>
    ctx.setTransform(v.dpr * v.z, 0, 0, v.dpr * v.z, v.dpr * (v.vw / 2 - (v.cx - off) * v.z + sx), v.dpr * (v.vh / 2 - v.cy * v.z + sy))
  for (const off of copies) {
    world(off)
    drawLand(ctx, v.z, [v.cx - off - half - 5, v.cy - halfH - 5, v.cx - off + half + 5, v.cy + halfH + 5])
    for (const l of g.delivered) drawInk(ctx, l, v.z)
    for (const th of g.thermals) {
      if (th.left <= 0) continue
      ctx.fillStyle = `rgb(255 72 176 / ${0.07 + 0.14 * (th.left / THERMAL_CHARGE)})`
      ctx.beginPath()
      ctx.arc(th.x, th.y, th.r, 0, Math.PI * 2)
      ctx.fill()
      // кольца стягиваются к центру — видно, что тут тянет вверх
      ctx.strokeStyle = 'rgb(255 72 176 / .6)'
      ctx.lineWidth = 1.2 / v.z
      for (const k of [0, 0.33, 0.66]) {
        const p = 1 - ((g.t * 0.5 + k) % 1)
        ctx.beginPath()
        ctx.arc(th.x, th.y, th.r * p, 0, Math.PI * 2)
        ctx.stroke()
      }
      if (th.warm) label(ctx, `💌 ${th.warm} kind ${th.warm === 1 ? 'reply' : 'replies'}`, th.x, th.y - th.r - 4 / v.z, v.z, C.pink, 10)
    }
    for (const s of g.storms) {
      const age = (g.t - s.born) / STORM_LIFE
      const a = Math.min(1, age * 6, (1 - age) * 6)
      ctx.fillStyle = `rgb(29 29 27 / ${0.26 * a})`
      for (let k = 0; k < 6; k++) {
        ctx.beginPath()
        ctx.arc(s.x + Math.cos(k * 1.3 + g.t * 0.4) * s.r * 0.45, s.y + Math.sin(k * 1.7 + g.t * 0.3) * s.r * 0.32, s.r * 0.58, 0, Math.PI * 2)
        ctx.fill()
      }
      // косой дождь штрихами
      ctx.strokeStyle = `rgb(0 120 191 / ${0.5 * a})`
      ctx.lineWidth = 1 / v.z
      ctx.beginPath()
      for (let k = 0; k < 14; k++) {
        const rx = s.x + Math.sin(k * 12.9898) * s.r * 0.7
        const ry = s.y + ((k * 7 + g.t * 40) % (s.r * 1.4)) - s.r * 0.5
        ctx.moveTo(rx, ry)
        ctx.lineTo(rx - 2, ry + 5)
      }
      ctx.stroke()
      if (a > 0.5 && Math.sin(g.t * 6 + s.born * 3) > 0.93) {
        ctx.strokeStyle = C.pink
        ctx.lineWidth = 2.5 / v.z
        ctx.beginPath()
        ctx.moveTo(s.x + 2, s.y - s.r * 0.45)
        ctx.lineTo(s.x - 4, s.y)
        ctx.lineTo(s.x + 3, s.y + 2)
        ctx.lineTo(s.x - 3, s.y + s.r * 0.55)
        ctx.stroke()
      }
      if (s.hot && a > 0.3)
        label(ctx, `🔥 ${s.hot} hot ${s.hot === 1 ? 'take' : 'takes'} · ${s.iso ? countryName(s.iso) : ''}`, s.x, s.y - s.r * 0.8, v.z, C.soot, 10)
    }
    if (!off) drawWind(ctx, v, g.t)
    drawTrail(ctx, g.trail.concat([[g.x, g.y]]), v.z)
    drawLetters(ctx, g.letters, g.target, v.z, g.t)
    drawHazards(ctx, g.hazards, v, g.t)
    // круг сброса лопается и расходится
    for (const r of fx.rings) {
      const p = 1 - r.life / r.max
      ctx.globalAlpha = 1 - p
      ctx.strokeStyle = r.color
      ctx.lineWidth = (3 * (1 - p) + 0.5) / v.z
      ctx.beginPath()
      ctx.arc(r.x, r.y, DELIVER_R * (1 + 2.5 * (1 - (1 - p) ** 3)), 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    for (const s of g.strays) {
      // хвост по настоящему маршруту
      const k = Math.floor(s.i)
      const tail = s.pts.slice(Math.max(0, k - 5), k + 1).map(([x, y]) => [x + (s.x - s.pts[Math.min(k, s.pts.length - 1)][0]), y] as [number, number])
      ctx.strokeStyle = 'rgb(0 120 191 / .5)'
      ctx.lineWidth = 1.2 / v.z
      ctx.setLineDash([2 / v.z, 3 / v.z])
      ctx.beginPath()
      tail.forEach(([x, y], n) => (n ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
      ctx.lineTo(s.x, s.y)
      ctx.stroke()
      ctx.setLineDash([])
      drawPlane(ctx, s.x, s.y, s.heading, 0.42, 'stray')
      label(ctx, s.label, s.x, s.y - 18 / v.z, v.z, C.blue, 9)
    }
    for (const p of fx.particles) {
      ctx.save()
      ctx.globalAlpha = Math.max(0, p.life / p.max)
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7)
      ctx.restore()
    }
    if (ghost) {
      drawPlane(ctx, ghost.x, ghost.y, ghost.heading, 0.5, 'ghost')
      label(ctx, 'your best', ghost.x, ghost.y - 14 / v.z, v.z, C.blue, 9)
    }
    // тень: чем выше самолётик, тем дальше и бледнее; у земли темнеет — тревога без цифр
    const alt = g.alt * (1 - pose.crash)
    drawPlane(ctx, g.x + alt * 0.14, g.y + alt * 0.2, g.heading, scale * 0.9, 'shadow', pose, 0.16 + (1 - alt / 100) * 0.3, g.plane)
  }
  if (clouds) drawClouds(ctx, v, g.t)
  // самолётик над облаками; в пике — линии скорости; при падении — штопор и бумажный шарик
  for (const off of copies) {
    world(off)
    if (g.diving && !pose.crash) {
      ctx.strokeStyle = 'rgb(29 29 27 / .6)'
      ctx.lineWidth = 1.6 / v.z
      ctx.beginPath()
      for (let k = 0; k < 8; k++) {
        const side = (k - 3.5) * 3
        const back = 10 + Math.random() * 14
        const bx = g.x - Math.cos(g.heading) * back - Math.sin(g.heading) * side
        const by = g.y - Math.sin(g.heading) * back + Math.cos(g.heading) * side
        ctx.moveTo(bx, by)
        ctx.lineTo(bx - Math.cos(g.heading) * 20, by - Math.sin(g.heading) * 20)
      }
      ctx.stroke()
    }
    if (pose.crash < 0.75) drawPlane(ctx, g.x, g.y, g.heading, scale, 'pilot', pose, 0.2, g.plane)
    else drawBall(ctx, g.x, g.y, 3.2 * Math.min(1, (pose.crash - 0.75) * 8))
    for (const f of fx.floaters) {
      const p = 1 - f.life / f.max
      ctx.globalAlpha = Math.min(1, (f.life / f.max) * 3)
      label(ctx, f.text, f.x, f.y - p * 18, v.z, f.color, f.big ? 20 : 13)
      ctx.globalAlpha = 1
    }
  }
  const sight = drawVeil(ctx, v, g)
  // стрелка к цели за экраном (в ночи и тумане — у самолётика, если цель вне окна видимости)
  const a = active(g)
  if (!a || pose.crash) return
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0)
  const [tx, ty] = toScreen(v, ...targetPoint(a))
  const [px, py] = toScreen(v, g.x, g.y)
  const m = 34
  const onScreen = tx > m && ty > m && tx < v.vw - m && ty < v.vh - m
  let ax: number, ay: number, ang: number
  if (sight && Math.hypot(tx - px, ty - py) > sight) {
    ang = Math.atan2(ty - py, tx - px)
    ax = px + Math.cos(ang) * sight * 0.8
    ay = py + Math.sin(ang) * sight * 0.8
  } else if (onScreen) return
  else {
    ang = Math.atan2(ty - v.vh / 2, tx - v.vw / 2)
    const k = Math.min((v.vw / 2 - m) / Math.abs(Math.cos(ang) || 1e-6), (v.vh / 2 - m) / Math.abs(Math.sin(ang) || 1e-6))
    ax = v.vw / 2 + Math.cos(ang) * k
    ay = v.vh / 2 + Math.sin(ang) * k
  }
  ctx.save()
  ctx.translate(ax, ay)
  ctx.rotate(ang)
  ctx.fillStyle = C.pink
  ctx.strokeStyle = C.soot
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(16, 0)
  ctx.lineTo(-10, -11)
  ctx.lineTo(-4, 0)
  ctx.lineTo(-10, 11)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

// итоговая карта: весь мир и весь маршрут
export function drawResult(ctx: CanvasRenderingContext2D, vw: number, vh: number, dpr: number, g: Game) {
  const z = Math.min(vw / W, vh / H)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = C.paper
  ctx.fillRect(0, 0, vw, vh)
  ctx.setTransform(dpr * z, 0, 0, dpr * z, (dpr * (vw - W * z)) / 2, (dpr * (vh - H * z)) / 2)
  drawLand(ctx, z)
  drawTrail(ctx, g.trail.concat([[g.x, g.y]]), z, 3)
  for (const l of g.delivered) drawInk(ctx, l, z)
  drawPlane(ctx, g.x, g.y, g.heading, 0.9 / z, 'pilot', STILL, 0.2, g.plane)
}
