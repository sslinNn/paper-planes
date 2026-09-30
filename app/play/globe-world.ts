import { geoCentroid, geoDistance, geoInterpolate } from 'd3-geo'
import { H, projection, W } from '@/lib/geo'
import { countryName } from '@/lib/country'
import { active, DELIVER_R, SPEED, targetPoint, THERMAL_CHARGE, STORM_LIFE, wind, type Game, type Letter } from '@/lib/airmail'
import { drawArc, drawGlobe, type Cam } from '../globe-draw'
import { C, drawBall, drawClouds, drawPlane, drawVeil, hash, label, STILL, WIND_CELL, type Fx, type Ghost, type Pose, type View } from './draw'

// игра на глобусе: физика живёт в плоских координатах Миллера (lib/airmail), а рисуем на сфере.
// Камера — ортография над самолётиком; радиус такой, что в кадр входит тот же охват мира (~108° долготы),
// поэтому по краям экрана сама собой видна кривизна планеты
type Pt = { x: number; y: number; vis: boolean }
const ll = (x: number, y: number) => projection.invert!([((x % W) + W) % W, Math.min(H, Math.max(0, y))]) as [number, number]

// тот же масштаб, что у плоской карты (v.z пикселей на единицу у экватора), — физика настроена под него
const globeRadius = (v: View) => (v.z * W) / (2 * Math.PI)

function makeScreen(v: View, shakeX: number, shakeY: number) {
  const center = ll(v.cx, v.cy)
  const cam: Cam = { lon: center[0], lat: center[1], r: globeRadius(v), cx: v.vw / 2 + shakeX, cy: v.vh / 2 + shakeY }
  return { center, cam }
}

export function drawGlobeWorld(
  ctx: CanvasRenderingContext2D, v: View, g: Game, fx: Fx, shake: number, pose: Pose = STILL, ghost: Ghost = null, clouds = true, fills?: Map<string, string>,
): { px: number; py: number } {
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0)
  ctx.fillStyle = C.paper
  ctx.fillRect(0, 0, v.vw, v.vh)
  const { center, cam } = makeScreen(v, shake ? (Math.random() - 0.5) * shake : 0, shake ? (Math.random() - 0.5) * shake : 0)
  const proj = drawGlobe(ctx, cam, fills)
  const S = (x: number, y: number): Pt => {
    const p = ll(x, y)
    const [px, py] = proj(p)!
    return { x: px, y: py, vis: geoDistance(p, center) < Math.PI / 2 - 0.03 }
  }
  // пикселей на единицу карты у центра — для размеров кругов и спрайтов
  const a0 = S(v.cx, v.cy), a1 = S(v.cx + 1, v.cy)
  const k = Math.max(0.5, Math.hypot(a1.x - a0.x, a1.y - a0.y))
  const heading = (x: number, y: number, dx: number, dy: number) => {
    const p = S(x, y), q = S(x + dx, y + dy)
    return Math.atan2(q.y - p.y, q.x - p.x)
  }
  const line = (pts: [number, number][], color: string, width: number, dash: number[] = []) => {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.setLineDash(dash)
    ctx.beginPath()
    let on = false
    let prev: [number, number] | null = null
    for (const [x, y] of pts) {
      const q = S(x, y)
      const jump = prev && Math.abs(x - prev[0]) > W / 2
      if (!q.vis || jump) on = false
      if (q.vis) {
        if (on) ctx.lineTo(q.x, q.y)
        else ctx.moveTo(q.x, q.y)
        on = true
      }
      prev = [x, y]
    }
    ctx.stroke()
    ctx.setLineDash([])
  }
  const circle = (x: number, y: number, r: number) => {
    const c = S(x, y)
    if (!c.vis) return null
    ctx.beginPath()
    ctx.arc(c.x, c.y, Math.max(0.5, r * k), 0, Math.PI * 2)
    return c
  }

  // чернильные штампы доставленных писем
  for (const l of g.delivered) drawInk(ctx, S, l, k)

  // термики: кольца стягиваются к центру
  for (const th of g.thermals) {
    if (th.left <= 0) continue
    const c = circle(th.x, th.y, th.r)
    if (!c) continue
    ctx.fillStyle = `rgb(255 72 176 / ${0.07 + 0.14 * (th.left / THERMAL_CHARGE)})`
    ctx.fill()
    ctx.strokeStyle = 'rgb(255 72 176 / .6)'
    ctx.lineWidth = 1.2
    for (const q of [0, 0.33, 0.66]) {
      const p = 1 - ((g.t * 0.5 + q) % 1)
      ctx.beginPath()
      ctx.arc(c.x, c.y, th.r * p * k, 0, Math.PI * 2)
      ctx.stroke()
    }
    if (th.warm) label(ctx, `💌 ${th.warm} kind ${th.warm === 1 ? 'reply' : 'replies'}`, c.x, c.y - th.r * k - 4, 1, C.pink, 10)
  }

  // грозы
  for (const s of g.storms) {
    const age = (g.t - s.born) / STORM_LIFE
    const al = Math.min(1, age * 6, (1 - age) * 6)
    const c = S(s.x, s.y)
    if (!c.vis) continue
    ctx.fillStyle = `rgb(29 29 27 / ${0.26 * al})`
    for (let q = 0; q < 6; q++) {
      const b = S(s.x + Math.cos(q * 1.3 + g.t * 0.4) * s.r * 0.45, s.y + Math.sin(q * 1.7 + g.t * 0.3) * s.r * 0.32)
      ctx.beginPath()
      ctx.arc(b.x, b.y, s.r * 0.58 * k, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.strokeStyle = `rgb(0 120 191 / ${0.5 * al})`
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let q = 0; q < 14; q++) {
      const rx = s.x + Math.sin(q * 12.9898) * s.r * 0.7
      const ry = s.y + ((q * 7 + g.t * 40) % (s.r * 1.4)) - s.r * 0.5
      const p1 = S(rx, ry), p2 = S(rx - 2, ry + 5)
      ctx.moveTo(p1.x, p1.y)
      ctx.lineTo(p2.x, p2.y)
    }
    ctx.stroke()
    if (al > 0.5 && Math.sin(g.t * 6 + s.born * 3) > 0.93) {
      ctx.strokeStyle = C.pink
      ctx.lineWidth = 2.5
      ctx.beginPath()
      for (const [dx, dy] of [[2, -0.45], [-4, 0], [3, 0.02], [-3, 0.55]] as const) {
        const p = S(s.x + dx, s.y + dy * s.r)
        ctx.lineTo(p.x, p.y)
      }
      ctx.stroke()
    }
    if (s.hot && al > 0.3) label(ctx, `🔥 ${s.hot} hot ${s.hot === 1 ? 'take' : 'takes'} · ${s.iso ? countryName(s.iso) : ''}`, c.x, c.y - s.r * 0.8 * k, 1, C.soot, 10)
  }

  // ветер: штрихи по пассатам и западному переносу
  {
    const hw = v.vw / 2 / k, hh = v.vh / 2 / k
    const x0 = Math.floor((v.cx - hw) / WIND_CELL) * WIND_CELL
    const y0 = Math.max(0, Math.floor((v.cy - hh) / WIND_CELL) * WIND_CELL)
    ctx.lineWidth = 1.4
    ctx.lineCap = 'round'
    for (let y = y0; y <= Math.min(H, v.cy + hh); y += WIND_CELL) {
      const w = wind(ll(W / 2, y)[1])
      const dir = Math.sign(w) || 1
      const len = 5 + Math.abs(w) * 16
      for (let x = x0; x <= v.cx + hw; x += WIND_CELL) {
        const j = hash(((x % W) + W) % W, y)
        const phase = (g.t * (Math.abs(w) * SPEED * 0.8) / WIND_CELL + j) % 1
        const px = x + (dir > 0 ? phase : 1 - phase) * WIND_CELL
        const py = y + (j - 0.5) * WIND_CELL * 0.7
        const p = S(px, py)
        if (!p.vis) continue
        const t1 = S(px - dir * len, py), t2 = S(px - dir * 2.2, py - 1.4)
        ctx.strokeStyle = `rgb(29 29 27 / ${(Math.sin(phase * Math.PI) * 0.55).toFixed(3)})`
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(t1.x, t1.y)
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(t2.x, t2.y)
        ctx.stroke()
      }
    }
  }

  // след авиапочты: красно-синий пунктир
  const trail = g.trail.concat([[g.x, g.y]])
  line(trail, C.blue, 2.4, [6, 6])
  ctx.lineDashOffset = -6
  line(trail, C.pink, 2.4, [6, 6])
  ctx.lineDashOffset = 0

  drawLetters(ctx, S, g.letters, g.target, k, g.t, g.alert)

  // события
  for (const h of g.hazards) {
    if (h.type === 'balloon') {
      const c = S(h.x, h.y + Math.sin(g.t * 2 + h.born) * 1.5)
      if (!c.vis) continue
      ctx.save()
      ctx.translate(c.x, c.y)
      ctx.scale(k, k)
      ctx.strokeStyle = C.soot
      ctx.lineWidth = 0.6
      ctx.beginPath()
      ctx.moveTo(-3, 5)
      ctx.lineTo(-1.6, 10)
      ctx.moveTo(3, 5)
      ctx.lineTo(1.6, 10)
      ctx.stroke()
      ctx.fillStyle = C.pink
      ctx.beginPath()
      ctx.ellipse(0, 0, 6, 7, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = C.blue
      ctx.beginPath()
      ctx.ellipse(0, 0, 2.2, 7, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = C.soot
      ctx.fillRect(-1.8, 10, 3.6, 2.6)
      ctx.restore()
      label(ctx, 'lift!', c.x, c.y - 11 * k, 1, C.pink, 10)
    }
    if (h.type === 'geese') {
      const c = S(h.x, h.y)
      if (!c.vis) continue
      ctx.save()
      ctx.translate(c.x, c.y)
      ctx.rotate(heading(h.x, h.y, h.vx * 0.05, h.vy * 0.05))
      ctx.scale(k, k)
      ctx.strokeStyle = h.hit ? 'rgb(29 29 27 / .35)' : C.soot
      ctx.lineWidth = 1.3
      ctx.lineCap = 'round'
      const flap = Math.sin(g.t * 12) * 1.2
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
      // полоса порыва — это полоса широт: рисуем её по параллелям через видимую часть мира
      const live = g.t - h.born > 1.5
      const half = v.vw / 2 / k
      const xs = Array.from({ length: 25 }, (_, q) => v.cx - half - 20 + ((half * 2 + 40) * q) / 24)
      const top = xs.map((x) => S(x, h.y - h.h)), bot = xs.map((x) => S(x, h.y + h.h)).reverse()
      const band = [...top, ...bot].filter((p) => p.vis)
      if (band.length > 3) {
        ctx.fillStyle = `rgb(0 120 191 / ${live ? 0.13 : 0.05 + 0.04 * Math.sin(g.t * 10)})`
        ctx.beginPath()
        band.forEach((p, q) => (q ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
        ctx.closePath()
        ctx.fill()
      }
      ctx.strokeStyle = `rgb(0 120 191 / ${live ? 0.7 : 0.35})`
      ctx.lineWidth = 1.4
      ctx.beginPath()
      for (let x = Math.floor((v.cx - half) / 24) * 24; x < v.cx + half; x += 24) {
        const px = x + ((g.t * 40 * h.dir) % 24)
        for (const dy of [-h.h * 0.5, h.h * 0.5]) {
          const p = S(px, h.y + dy)
          if (!p.vis) continue
          const b1 = S(px - h.dir * 5, h.y + dy - 3), b2 = S(px - h.dir * 5, h.y + dy + 3)
          ctx.moveTo(b1.x, b1.y)
          ctx.lineTo(p.x, p.y)
          ctx.lineTo(b2.x, b2.y)
        }
      }
      ctx.stroke()
      const mid = S(v.cx, h.y - h.h - 3)
      if (!live && mid.vis) label(ctx, 'gust incoming', mid.x, mid.y, 1, C.blue, 10)
    }
  }

  // круг сброса лопается и расходится
  for (const r of fx.rings) {
    const p = 1 - r.life / r.max
    const c = S(r.x, r.y)
    if (!c.vis) continue
    ctx.globalAlpha = 1 - p
    ctx.strokeStyle = r.color
    ctx.lineWidth = 3 * (1 - p) + 0.5
    ctx.beginPath()
    ctx.arc(c.x, c.y, DELIVER_R * (1 + 2.5 * (1 - (1 - p) ** 3)) * k, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // чужие самолётики по своим маршрутам
  for (const s of g.strays) {
    const q = Math.floor(s.i)
    const tail = s.pts.slice(Math.max(0, q - 5), q + 1).map(([x, y]) => [x + (s.x - s.pts[Math.min(q, s.pts.length - 1)][0]), y] as [number, number])
    line([...tail, [s.x, s.y]], 'rgb(0 120 191 / .5)', 1.2, [2, 3])
    const c = S(s.x, s.y)
    if (!c.vis) continue
    drawPlane(ctx, c.x, c.y, heading(s.x, s.y, Math.cos(s.heading), Math.sin(s.heading)), 0.42 * k, 'stray')
    label(ctx, s.label, c.x, c.y - 18, 1, C.blue, 9)
  }

  for (const p of fx.particles) {
    const c = S(p.x, p.y)
    if (!c.vis) continue
    ctx.save()
    ctx.globalAlpha = Math.max(0, p.life / p.max)
    ctx.translate(c.x, c.y)
    ctx.rotate(p.rot)
    ctx.fillStyle = p.color
    ctx.fillRect((-p.size / 2) * k, (-p.size / 2) * k, p.size * k, p.size * 0.7 * k)
    ctx.restore()
  }

  if (ghost) {
    const c = S(ghost.x, ghost.y)
    if (c.vis) {
      drawPlane(ctx, c.x, c.y, heading(ghost.x, ghost.y, Math.cos(ghost.heading), Math.sin(ghost.heading)), 0.5 * k, 'ghost')
      label(ctx, 'your best', c.x, c.y - 14, 1, C.blue, 9)
    }
  }

  // тень: чем выше самолётик, тем дальше и бледнее; у земли темнеет
  const scale = 0.42 + g.alt * 0.0025
  const alt = g.alt * (1 - pose.crash)
  const hd = heading(g.x, g.y, Math.cos(g.heading), Math.sin(g.heading))
  const sh = S(g.x + alt * 0.14, g.y + alt * 0.2)
  drawPlane(ctx, sh.x, sh.y, hd, scale * 0.9 * k, 'shadow', pose, 0.16 + (1 - alt / 100) * 0.3, g.plane)

  if (clouds) drawClouds(ctx, v, g.t)
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0)

  // самолётик над облаками; в пике — линии скорости; при падении — штопор и бумажный шарик
  const me = S(g.x, g.y)
  if (g.diving && !pose.crash) {
    const segs: [number, number][][] = []
    for (let q = 0; q < 8; q++) {
      const side = (q - 3.5) * 3
      const back = 10 + Math.random() * 14
      const bx = g.x - Math.cos(g.heading) * back - Math.sin(g.heading) * side
      const by = g.y - Math.sin(g.heading) * back + Math.cos(g.heading) * side
      segs.push([[bx, by], [bx - Math.cos(g.heading) * 20, by - Math.sin(g.heading) * 20]])
    }
    for (const sgm of segs) line(sgm, 'rgb(29 29 27 / .6)', 1.6)
  }
  if (pose.crash < 0.75) drawPlane(ctx, me.x, me.y, hd, scale * k, 'pilot', pose, 0.2, g.plane)
  else drawBall(ctx, me.x, me.y, 3.2 * k * Math.min(1, (pose.crash - 0.75) * 8))
  for (const f of fx.floaters) {
    const c = S(f.x, f.y)
    const p = 1 - f.life / f.max
    ctx.globalAlpha = Math.min(1, (f.life / f.max) * 3)
    label(ctx, f.text, c.x, c.y - p * 18 * k, 1, f.color, f.big ? 20 : 13)
    ctx.globalAlpha = 1
  }

  const sight = drawVeil(ctx, v, g, [me.x, me.y])
  drawArrow(ctx, v, g, S, me, sight, pose)
  return { px: me.x, py: me.y }
}

function drawInk(ctx: CanvasRenderingContext2D, S: (x: number, y: number) => Pt, l: Letter, k: number) {
  const [x, y] = targetPoint(l)
  const c = S(x, y)
  if (!c.vis) return
  ctx.save()
  ctx.translate(c.x, c.y)
  ctx.rotate((((l.id * 37) % 30) - 15) * (Math.PI / 180))
  ctx.strokeStyle = 'rgb(255 72 176 / .85)'
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.arc(0, 0, 7 * k, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, 0, 5.6 * k, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = 'rgb(255 72 176 / .9)'
  ctx.font = `900 ${5 * k}px "Big Shoulders", Archivo, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(l.to_country ?? 'AQ', 0, 0.3 * k)
  ctx.restore()
  ctx.textBaseline = 'alphabetic'
}

function drawLetters(ctx: CanvasRenderingContext2D, S: (x: number, y: number) => Pt, letters: Letter[], target: number | null, k: number, t: number, alert: string | null) {
  const seen = new Map<string, number>()
  for (const l of [...letters].sort((a, b) => Number(b.id === target) - Number(a.id === target))) {
    const [wx, wy] = targetPoint(l)
    const c = S(wx, wy)
    if (!c.vis) continue
    const key = `${Math.round(wx)}:${Math.round(wy)}`
    const n = seen.get(key) ?? 0
    seen.set(key, n + 1)
    const on = l.id === target
    const w = 14, h = 9.5
    if (!n) {
      if (on) {
        ctx.fillStyle = 'rgb(255 72 176 / .12)'
        ctx.strokeStyle = C.pink
        ctx.lineWidth = 1.5
        ctx.setLineDash([3, 3])
        ctx.lineDashOffset = -t * 6
        ctx.beginPath()
        ctx.arc(c.x, c.y, DELIVER_R * k, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        ctx.setLineDash([])
        ctx.lineDashOffset = 0
        ctx.lineWidth = 2.5
        for (const q of [0, 0.5]) {
          const p = (t * 0.8 + q) % 1
          ctx.globalAlpha = 1 - p
          ctx.beginPath()
          ctx.arc(c.x, c.y, 10 + 26 * p, 0, Math.PI * 2)
          ctx.stroke()
        }
        ctx.globalAlpha = 1
      }
      ctx.fillStyle = on ? C.pink : C.paper
      ctx.strokeStyle = C.soot
      ctx.lineWidth = 1.2
      ctx.fillRect(c.x - w / 2, c.y - h / 2, w, h)
      ctx.strokeRect(c.x - w / 2, c.y - h / 2, w, h)
      ctx.beginPath()
      ctx.moveTo(c.x - w / 2, c.y - h / 2)
      ctx.lineTo(c.x, c.y + h / 6)
      ctx.lineTo(c.x + w / 2, c.y - h / 2)
      ctx.stroke()
    }
    if (l.rush !== undefined) {
      const left = Math.max(0, l.rush - t) / 16
      ctx.strokeStyle = C.pink
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(c.x, c.y, 17, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2)
      ctx.stroke()
      label(ctx, `⏱ ${Math.ceil(Math.max(0, l.rush - t))}s`, c.x, c.y - 24, 1, C.pink, 12)
    }
    if (n < 3) label(ctx, n === 2 ? '…' : `@${l.to_handle}${alert && l.to_country === alert ? ' ×3' : ''}`, c.x, c.y + h + 12 + n * 13, 1, on ? C.pink : C.soot)
  }
}

// стрелка к цели: цель за горизонтом — направление по большому кругу, а не напрямую сквозь планету
function drawArrow(ctx: CanvasRenderingContext2D, v: View, g: Game, S: (x: number, y: number) => Pt, me: Pt, sight: number, pose: Pose) {
  const a = active(g)
  if (!a || pose.crash) return
  const [tx, ty] = targetPoint(a)
  let t = S(tx, ty)
  if (!t.vis) {
    // точка на четверти пути к цели по большому кругу — она на видимой стороне и задаёт направление
    const from = projection.invert!([g.x, g.y]) as [number, number], to = projection.invert!([tx, ty]) as [number, number]
    const mid = geoInterpolate(from, to)(0.25) as [number, number]
    const [mx, my] = projection(mid)!
    t = { ...S(mx, my), vis: false }
  }
  const m = 34
  const onScreen = t.vis && t.x > m && t.y > m && t.x < v.vw - m && t.y < v.vh - m
  let ax: number, ay: number, ang: number
  if (sight && Math.hypot(t.x - me.x, t.y - me.y) > sight) {
    ang = Math.atan2(t.y - me.y, t.x - me.x)
    ax = me.x + Math.cos(ang) * sight * 0.8
    ay = me.y + Math.sin(ang) * sight * 0.8
  } else if (onScreen) return
  else {
    ang = Math.atan2(t.y - me.y, t.x - me.x)
    const q = Math.min((v.vw / 2 - m) / Math.abs(Math.cos(ang) || 1e-6), (v.vh / 2 - m) / Math.abs(Math.sin(ang) || 1e-6))
    ax = v.vw / 2 + Math.cos(ang) * q
    ay = v.vh / 2 + Math.sin(ang) * q
  }
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0)
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

// итоги: глобус медленно крутится, по нему весь маршрут и чернильные штампы
export function drawGlobeResult(ctx: CanvasRenderingContext2D, vw: number, vh: number, dpr: number, g: Game, spin: number) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = C.paper
  ctx.fillRect(0, 0, vw, vh)
  const route = g.trail.concat([[g.x, g.y]]).map(([x, y]) => ll(x, y))
  const mid = route.length > 1 ? geoCentroid({ type: 'LineString', coordinates: route }) : (route[0] ?? [0, 20])
  const cam: Cam = { lon: mid[0] + spin, lat: Math.max(-55, Math.min(55, mid[1])), r: Math.min(vw, vh) * 0.4, cx: vw * (vw > 720 ? 0.66 : 0.5), cy: vh * (vw > 720 ? 0.5 : 0.3) }
  const proj = drawGlobe(ctx, cam)
  drawArc(ctx, proj, route, C.blue, 3, [6, 6])
  ctx.lineDashOffset = -6
  drawArc(ctx, proj, route, C.pink, 3, [6, 6])
  ctx.lineDashOffset = 0
  const center: [number, number] = [cam.lon, cam.lat]
  for (const l of g.delivered) {
    const p = projection.invert!(targetPoint(l)) as [number, number]
    if (geoDistance(p, center) > Math.PI / 2 - 0.05) continue
    const [x, y] = proj(p)!
    ctx.strokeStyle = C.pink
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y, 6, 0, Math.PI * 2)
    ctx.stroke()
  }
}
