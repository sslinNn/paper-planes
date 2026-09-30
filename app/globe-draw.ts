import { geoGraticule10, geoOrthographic, geoPath, geoRotation, type GeoProjection } from 'd3-geo'
import { isoOf, land } from '@/lib/geo'
import { AIRFRAMES } from '@/lib/airframes'
import type { PlaneModel } from '@/lib/patrons'

// глобус в riso-печати: бумажный океан, растр суши, розовый оттиск со сдвигом (несовпадение краски), свечение атмосферы
export const INK = { paper: '#f5f3eb', ocean: '#eceae1', blue: '#0078bf', pink: '#ff48b0', soot: '#1d1d1b' }
export type Cam = { lon: number; lat: number; r: number; cx: number; cy: number }

const LAND = { type: 'FeatureCollection', features: land } as GeoJSON.FeatureCollection
const GRATICULE = geoGraticule10()
const byIso = new Map(land.map((f) => [isoOf(f), f]))
let dots: CanvasPattern | null = null
const frames = new Map<string, { wing: Path2D[]; fold: Path2D[] }>()

const airframe = (model: PlaneModel) => {
  let f = frames.get(model)
  if (!f) frames.set(model, (f = { wing: AIRFRAMES[model].wing.map((d) => new Path2D(d)), fold: AIRFRAMES[model].fold.map((d) => new Path2D(d)) }))
  return f
}

// растр в экранных пикселях — как настоящий riso-растр: точки стоят на бумаге, а мир под ними крутится
function halftone(ctx: CanvasRenderingContext2D) {
  if (dots) return dots
  const c = document.createElement('canvas')
  c.width = c.height = 6
  const g = c.getContext('2d')!
  g.fillStyle = 'rgb(0 120 191 / .5)'
  g.beginPath()
  g.arc(3, 3, 1.15, 0, Math.PI * 2)
  g.fill()
  dots = ctx.createPattern(c, 'repeat')!
  return dots
}

export const globeProjection = (cam: Cam): GeoProjection =>
  geoOrthographic().translate([cam.cx, cam.cy]).scale(cam.r).rotate([-cam.lon, -cam.lat]).clipAngle(90).precision(0.6)

// fills — страны, залитые цветом (Mail Wars: чья почта правит страной)
export function drawGlobe(ctx: CanvasRenderingContext2D, cam: Cam, fills?: Map<string, string>) {
  const proj = globeProjection(cam)
  const path = geoPath(proj, ctx)
  const { cx, cy, r } = cam

  // тень на бумаге под планетой
  ctx.fillStyle = 'rgb(29 29 27 / .09)'
  ctx.beginPath()
  ctx.ellipse(cx + r * 0.08, cy + r * 1.1, r * 0.78, r * 0.1, 0, 0, Math.PI * 2)
  ctx.fill()

  // атмосфера: синее свечение по краю
  const glow = ctx.createRadialGradient(cx, cy, r * 0.96, cx, cy, r * 1.16)
  glow.addColorStop(0, 'rgb(0 120 191 / .28)')
  glow.addColorStop(1, 'rgb(0 120 191 / 0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(cx, cy, r * 1.16, 0, Math.PI * 2)
  ctx.fill()

  // океан
  ctx.fillStyle = INK.ocean
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()

  // сетка меридианов
  ctx.strokeStyle = 'rgb(0 120 191 / .16)'
  ctx.lineWidth = 0.8
  ctx.setLineDash([2, 3])
  ctx.beginPath()
  path(GRATICULE)
  ctx.stroke()
  ctx.setLineDash([])

  // розовый оттиск суши со сдвигом — riso-несовпадение
  ctx.save()
  ctx.translate(2, 1.4)
  ctx.fillStyle = 'rgb(255 72 176 / .22)'
  ctx.beginPath()
  path(LAND)
  ctx.fill()
  ctx.restore()

  // суша: бумага поверх розового (от оттиска остаётся только сдвинутая кромка), синяя подложка, растр, контур
  ctx.beginPath()
  path(LAND)
  ctx.fillStyle = INK.paper
  ctx.fill()
  ctx.fillStyle = 'rgb(0 120 191 / .1)'
  ctx.fill()
  ctx.fillStyle = halftone(ctx)
  ctx.fill()
  if (fills) {
    for (const [iso, color] of fills) {
      const f = byIso.get(iso)
      if (!f) continue
      ctx.beginPath()
      path(f)
      ctx.fillStyle = color
      ctx.fill()
    }
  }
  ctx.beginPath()
  path(LAND)
  ctx.strokeStyle = 'rgb(0 120 191 / .7)'
  ctx.lineWidth = 0.7
  ctx.stroke()

  // обод планеты
  ctx.strokeStyle = INK.soot
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()
  return proj
}

// дуга по большому кругу, обрезанная горизонтом
export function drawArc(ctx: CanvasRenderingContext2D, proj: GeoProjection, pts: [number, number][], color: string, width: number, dash?: number[]) {
  const path = geoPath(proj, ctx)
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.setLineDash(dash ?? [])
  ctx.beginPath()
  path({ type: 'LineString', coordinates: pts })
  ctx.stroke()
  ctx.setLineDash([])
}

export function drawDart(ctx: CanvasRenderingContext2D, x: number, y: number, heading: number, scale: number, model: PlaneModel = 'dart', color = INK.pink) {
  const a = airframe(model)
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(heading)
  const k = scale * AIRFRAMES[model].size
  ctx.scale(k, k)
  ctx.lineWidth = 0.7 / AIRFRAMES[model].size
  ctx.lineJoin = 'round'
  ctx.fillStyle = color
  ctx.strokeStyle = INK.soot
  for (const p of a.wing) {
    ctx.fill(p)
    ctx.stroke(p)
  }
  ctx.fillStyle = 'rgb(0 120 191 / .55)'
  for (const p of a.fold) ctx.fill(p)
  ctx.restore()
}

export function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, size = 11) {
  ctx.font = `800 ${size}px Archivo, system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  ctx.strokeStyle = INK.paper
  ctx.strokeText(text, x, y)
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
}

const RAD = Math.PI / 180

// точка на высоте h над поверхностью (доля радиуса) в той же ортографии: дуги рейсов поднимаются над планетой.
// z — глубина (1 к зрителю, −1 за планетой); visible — над горизонтом, в том числе выглядывая из-за края
export function lifted(cam: Cam, p: [number, number], h: number): { x: number; y: number; visible: boolean } {
  const [l, f] = geoRotation([-cam.lon, -cam.lat])(p)
  const cl = Math.cos(f * RAD)
  const X = cl * Math.sin(l * RAD), Y = Math.sin(f * RAD), Z = cl * Math.cos(l * RAD)
  const R = cam.r * (1 + h)
  const x = cam.cx + R * X, y = cam.cy - R * Y
  const visible = Z > 0 || Math.hypot(R * X, R * Y) > cam.r
  return { x, y, visible }
}

// дуга рейса в объёме: полилиния по поднятым точкам, невидимые куски пропускаем
export function drawLiftedArc(ctx: CanvasRenderingContext2D, pts: { x: number; y: number; visible: boolean }[], color: string, width: number, dash: number[]) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.setLineDash(dash)
  ctx.beginPath()
  let on = false
  for (const q of pts) {
    if (!q.visible) {
      on = false
      continue
    }
    if (on) ctx.lineTo(q.x, q.y)
    else ctx.moveTo(q.x, q.y)
    on = true
  }
  ctx.stroke()
  ctx.setLineDash([])
}
