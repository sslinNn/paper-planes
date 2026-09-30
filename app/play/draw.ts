import { H, land, path, projection, W } from '@/lib/geo'
import { countryName } from '@/lib/country'
import { active, DELIVER_R, SPEED, targetPoint, THERMAL_CHARGE, STORM_LIFE, wind, type Game, type Letter } from '@/lib/airmail'
import { AIRFRAMES } from '@/lib/airframes'

export const C = { paper: '#f5f3eb', blue: '#0078bf', pink: '#ff48b0', soot: '#1d1d1b' }
export type View = { vw: number; vh: number; dpr: number; z: number; cx: number; cy: number }
export type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; rot: number }
export type Floater = { x: number; y: number; text: string; color: string; life: number; max: number; big?: boolean }

let landPaths: Path2D[] | null = null
let plane: { wing: Path2D[]; fold: Path2D[] } | null = null
let dots: CanvasPattern | null = null
const buildLand = () => (landPaths ??= land.map((f) => new Path2D(path(f) ?? '')))
const airframe = () => (plane ??= { wing: AIRFRAMES.dart.wing.map((d) => new Path2D(d)), fold: AIRFRAMES.dart.fold.map((d) => new Path2D(d)) })

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

function drawLand(ctx: CanvasRenderingContext2D, z: number) {
  const pat = halftone(ctx)
  ctx.strokeStyle = 'rgb(0 120 191 / .7)'
  ctx.lineWidth = 1 / z
  for (const p of buildLand()) {
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

function drawPlane(ctx: CanvasRenderingContext2D, x: number, y: number, heading: number, scale: number, style: 'shadow' | 'pilot' | 'stray') {
  const a = airframe()
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(heading)
  ctx.scale(scale, scale)
  if (style === 'shadow') {
    ctx.fillStyle = 'rgb(29 29 27 / .2)'
    for (const p of a.wing) ctx.fill(p)
  } else {
    ctx.lineWidth = 0.6
    ctx.lineJoin = 'round'
    ctx.fillStyle = style === 'pilot' ? C.pink : C.paper
    ctx.strokeStyle = style === 'pilot' ? C.soot : C.blue
    for (const p of a.wing) {
      ctx.fill(p)
      ctx.stroke(p)
    }
    ctx.fillStyle = 'rgb(0 120 191 / .55)'
    for (const p of a.fold) ctx.fill(p)
  }
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
    if (n < 3) label(ctx, n === 2 ? '…' : `@${l.to_handle}`, x, y + h + (12 + n * 13) / z, z, on ? C.pink : C.soot)
  }
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
  ctx: CanvasRenderingContext2D, v: View, g: Game, particles: Particle[], floaters: Floater[], shake: number, clouds = true,
) {
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0)
  ctx.fillStyle = C.paper
  ctx.fillRect(0, 0, v.vw, v.vh)
  const sx = shake ? (Math.random() - 0.5) * shake : 0
  const sy = shake ? (Math.random() - 0.5) * shake : 0
  const half = v.vw / 2 / v.z
  const scale = 0.42 + g.alt * 0.0025
  for (const off of [-W, 0, W]) {
    // копия мира рисуется, только если её край попал в экран
    if (v.cx - off + half < 0 || v.cx - off - half > W) continue
    ctx.setTransform(v.dpr * v.z, 0, 0, v.dpr * v.z, v.dpr * (v.vw / 2 - (v.cx - off) * v.z + sx), v.dpr * (v.vh / 2 - v.cy * v.z + sy))
    drawLand(ctx, v.z)
    for (const th of g.thermals) {
      if (th.left <= 0) continue
      ctx.fillStyle = `rgb(255 72 176 / ${0.07 + 0.14 * (th.left / THERMAL_CHARGE)})`
      ctx.beginPath()
      ctx.arc(th.x, th.y, th.r, 0, Math.PI * 2)
      ctx.fill()
      // кольца поднимаются к центру — видно, что тут тянет вверх
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
      label(ctx, s.label, s.x, s.y - 9 / v.z * 2, v.z, C.blue, 9)
    }
    for (const p of particles) {
      ctx.save()
      ctx.globalAlpha = Math.max(0, p.life / p.max)
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7)
      ctx.restore()
    }
    // тень: чем выше самолётик, тем дальше от него тень
    drawPlane(ctx, g.x + g.alt * 0.14, g.y + g.alt * 0.2, g.heading, scale * 0.9, 'shadow')
  }
  if (clouds) drawClouds(ctx, v, g.t)
  // самолётик над облаками; в пике — линии скорости
  for (const off of [-W, 0, W]) {
    if (v.cx - off + half < 0 || v.cx - off - half > W) continue
    ctx.setTransform(v.dpr * v.z, 0, 0, v.dpr * v.z, v.dpr * (v.vw / 2 - (v.cx - off) * v.z + sx), v.dpr * (v.vh / 2 - v.cy * v.z + sy))
    if (g.diving) {
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
    drawPlane(ctx, g.x, g.y, g.heading, scale, 'pilot')
    for (const f of floaters) {
      const p = 1 - f.life / f.max
      ctx.globalAlpha = Math.min(1, (f.life / f.max) * 3)
      label(ctx, f.text, f.x, f.y - p * 18, v.z, f.color, f.big ? 20 : 13)
      ctx.globalAlpha = 1
    }
  }
  // стрелка к цели за экраном
  const a = active(g)
  if (!a) return
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0)
  const [tx, ty] = toScreen(v, ...targetPoint(a))
  const m = 34
  if (tx > m && ty > m && tx < v.vw - m && ty < v.vh - m) return
  const ang = Math.atan2(ty - v.vh / 2, tx - v.vw / 2)
  const k = Math.min((v.vw / 2 - m) / Math.abs(Math.cos(ang) || 1e-6), (v.vh / 2 - m) / Math.abs(Math.sin(ang) || 1e-6))
  ctx.save()
  ctx.translate(v.vw / 2 + Math.cos(ang) * k, v.vh / 2 + Math.sin(ang) * k)
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
  for (const l of g.delivered) {
    const [x, y] = targetPoint(l)
    ctx.fillStyle = C.pink
    ctx.strokeStyle = C.soot
    ctx.lineWidth = 1 / z
    ctx.beginPath()
    ctx.arc(x, y, 4 / z, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  drawPlane(ctx, g.x, g.y, g.heading, 0.9 / z, 'pilot')
}
