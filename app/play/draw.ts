import { H, land, path, W } from '@/lib/geo'
import { active, targetPoint, THERMAL_CHARGE, STORM_LIFE, type Game, type Letter } from '@/lib/airmail'
import { AIRFRAMES } from '@/lib/airframes'

export const C = { paper: '#f5f3eb', blue: '#0078bf', pink: '#ff48b0', soot: '#1d1d1b' }
export type View = { vw: number; vh: number; dpr: number; z: number; cx: number; cy: number }
export type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; rot: number }

let landPaths: Path2D[] | null = null
let plane: { wing: Path2D[]; fold: Path2D[] } | null = null
const buildLand = () => (landPaths ??= land.map((f) => new Path2D(path(f) ?? '')))
const airframe = () => (plane ??= { wing: AIRFRAMES.dart.wing.map((d) => new Path2D(d)), fold: AIRFRAMES.dart.fold.map((d) => new Path2D(d)) })

// камера: на экране ~320 единиц карты по длинной стороне
export const zoomFor = (vw: number, vh: number) => Math.max(vw, vh) / 320

export const toScreen = (v: View, x: number, y: number): [number, number] => {
  let dx = x - v.cx
  if (dx > W / 2) dx -= W
  if (dx < -W / 2) dx += W
  return [v.vw / 2 + dx * v.z, v.vh / 2 + (y - v.cy) * v.z]
}

function drawLand(ctx: CanvasRenderingContext2D, z: number) {
  ctx.fillStyle = 'rgb(0 120 191 / .13)'
  ctx.strokeStyle = 'rgb(0 120 191 / .55)'
  ctx.lineWidth = 1 / z
  for (const p of buildLand()) {
    ctx.fill(p)
    ctx.stroke(p)
  }
}

// след авиапочты: красно-синий пунктир конверта; на шве карты линия рвётся, а не тянется через весь мир
function drawTrail(ctx: CanvasRenderingContext2D, pts: [number, number][], z: number) {
  ctx.lineWidth = 2.2 / z
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

function drawPlane(ctx: CanvasRenderingContext2D, x: number, y: number, heading: number, scale: number, shadow: boolean) {
  const a = airframe()
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(heading)
  ctx.scale(scale, scale)
  if (shadow) {
    ctx.fillStyle = 'rgb(29 29 27 / .22)'
    for (const p of a.wing) ctx.fill(p)
  } else {
    ctx.lineWidth = 0.5
    ctx.lineJoin = 'round'
    ctx.fillStyle = C.pink
    ctx.strokeStyle = C.soot
    for (const p of a.wing) {
      ctx.fill(p)
      ctx.stroke(p)
    }
    ctx.fillStyle = 'rgb(0 120 191 / .55)'
    for (const p of a.fold) ctx.fill(p)
  }
  ctx.restore()
}

function drawLetters(ctx: CanvasRenderingContext2D, letters: Letter[], target: number | null, z: number, t: number) {
  ctx.font = `700 ${11 / z}px Archivo, system-ui, sans-serif`
  ctx.textAlign = 'center'
  // несколько писем в одну страну — одна метка, подписи стопкой
  const seen = new Map<string, number>()
  for (const l of [...letters].sort((a, b) => Number(b.id === target) - Number(a.id === target))) {
    const [x, y] = targetPoint(l)
    const key = `${Math.round(x)}:${Math.round(y)}`
    const n = seen.get(key) ?? 0
    seen.set(key, n + 1)
    const on = l.id === target
    const w = 12 / z, h = 8 / z
    if (!n) {
      if (on) {
        ctx.strokeStyle = C.pink
        ctx.lineWidth = 2 / z
        ctx.beginPath()
        ctx.arc(x, y, (12 + 5 * Math.sin(t * 4)) / z, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.fillStyle = on ? C.pink : C.paper
      ctx.strokeStyle = C.soot
      ctx.lineWidth = 1 / z
      ctx.fillRect(x - w / 2, y - h / 2, w, h)
      ctx.strokeRect(x - w / 2, y - h / 2, w, h)
      ctx.beginPath()
      ctx.moveTo(x - w / 2, y - h / 2)
      ctx.lineTo(x, y + h / 6)
      ctx.lineTo(x + w / 2, y - h / 2)
      ctx.stroke()
    }
    if (n < 3) {
      ctx.fillStyle = on ? C.pink : C.soot
      ctx.fillText(n === 2 ? '…' : `@${l.to_handle}`, x, y + h + (11 + n * 12) / z)
    }
  }
}

export function drawWorld(ctx: CanvasRenderingContext2D, v: View, g: Game, particles: Particle[], shake: number) {
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0)
  ctx.fillStyle = C.paper
  ctx.fillRect(0, 0, v.vw, v.vh)
  const sx = shake ? (Math.random() - 0.5) * shake : 0
  const sy = shake ? (Math.random() - 0.5) * shake : 0
  const half = v.vw / 2 / v.z
  for (const off of [-W, 0, W]) {
    // копия мира рисуется, только если её край попал в экран
    if (v.cx - off + half < 0 || v.cx - off - half > W) continue
    ctx.setTransform(v.dpr * v.z, 0, 0, v.dpr * v.z, v.dpr * (v.vw / 2 - (v.cx - off) * v.z + sx), v.dpr * (v.vh / 2 - v.cy * v.z + sy))
    drawLand(ctx, v.z)
    for (const th of g.thermals) {
      if (th.left <= 0) continue
      ctx.fillStyle = `rgb(255 72 176 / ${0.05 + 0.12 * (th.left / THERMAL_CHARGE)})`
      ctx.beginPath()
      ctx.arc(th.x, th.y, th.r, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgb(255 72 176 / .55)'
      ctx.lineWidth = 1 / v.z
      ctx.setLineDash([3 / v.z, 4 / v.z])
      ctx.lineDashOffset = (-g.t * 8) / v.z
      ctx.stroke()
      ctx.setLineDash([])
    }
    for (const s of g.storms) {
      const age = (g.t - s.born) / STORM_LIFE
      const a = Math.min(1, age * 6, (1 - age) * 6)
      ctx.fillStyle = `rgb(29 29 27 / ${0.2 * a})`
      for (let k = 0; k < 5; k++) {
        ctx.beginPath()
        ctx.arc(s.x + Math.cos(k * 1.3 + g.t * 0.3) * s.r * 0.4, s.y + Math.sin(k * 1.7 + g.t * 0.2) * s.r * 0.3, s.r * 0.6, 0, Math.PI * 2)
        ctx.fill()
      }
      // молния изредка
      if (a > 0.5 && Math.sin(g.t * 7 + s.born) > 0.97) {
        ctx.strokeStyle = C.pink
        ctx.lineWidth = 2 / v.z
        ctx.beginPath()
        ctx.moveTo(s.x, s.y - s.r * 0.4)
        ctx.lineTo(s.x - 3, s.y)
        ctx.lineTo(s.x + 2, s.y + 1)
        ctx.lineTo(s.x - 2, s.y + s.r * 0.5)
        ctx.stroke()
      }
    }
    drawTrail(ctx, g.trail.concat([[g.x, g.y]]), v.z)
    drawLetters(ctx, g.letters, g.target, v.z, g.t)
    for (const p of particles) {
      ctx.save()
      ctx.globalAlpha = Math.max(0, p.life / p.max)
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7)
      ctx.restore()
    }
    // высота видна тенью: чем выше самолётик, тем дальше от него тень, и сам он чуть крупнее
    const scale = 0.3 + g.alt * 0.0015
    drawPlane(ctx, g.x + g.alt * 0.06, g.y + g.alt * 0.1, g.heading, scale, true)
    drawPlane(ctx, g.x, g.y, g.heading, scale, false)
  }
  // стрелка к цели за экраном
  const a = active(g)
  if (!a) return
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0)
  const [tx, ty] = toScreen(v, ...targetPoint(a))
  const m = 30
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
  ctx.moveTo(14, 0)
  ctx.lineTo(-9, -10)
  ctx.lineTo(-3, 0)
  ctx.lineTo(-9, 10)
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
  drawTrail(ctx, g.trail.concat([[g.x, g.y]]), z)
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
  drawPlane(ctx, g.x, g.y, g.heading, 0.9 / z, false)
}
