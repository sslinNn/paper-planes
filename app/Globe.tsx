'use client'
import { useEffect, useRef } from 'react'
import { at } from '@/lib/geo'
import { clampTilt, flightAt, flightSeconds, onFront, type LonLat } from '@/lib/globe'
import { geoDistance } from 'd3-geo'
import { countryOf, type PlaneRow } from '@/lib/sky'
import { isPlaneModel } from '@/lib/patrons'
import { drawArc, drawDart, drawGlobe, drawLiftedArc, INK, label, lifted, type Cam } from './globe-draw'

type Flight = { p: PlaneRow; a: LonLat; b: LonLat; t0: number; dur: number; top: number }

const MAX_AIR = 12
const REPLAY_MS = 1300
const AUTO_SPIN = 5 // градусов в секунду, когда никто не трогает
const IDLE_MS = 2500
const TRAIL_FADE = 1.6 // секунд тает след после посадки

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

// глобус главной: настоящие реплаи летят по большим кругам; тащишь — крутится с инерцией, колесо/щипок — ближе
export default function Globe({ planes, lead, fills }: { planes: PlaneRow[]; lead?: string | null; fills?: Map<string, string> }) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const planesRef = useRef(planes)
  const fillsRef = useRef(fills)
  useEffect(() => {
    planesRef.current = planes
    fillsRef.current = fills
  }, [planes, fills])

  useEffect(() => {
    const el = box.current!
    const c = canvas.current!
    const ctx = c.getContext('2d')!
    const calm = reduced()
    const cam: Cam = { lon: 20, lat: 25, r: 100, cx: 0, cy: 0 }
    let zoom = 1
    let w = 1, h = 1, dpr = 1
    const fit = () => {
      dpr = Math.min(2, devicePixelRatio || 1)
      w = el.clientWidth
      h = el.clientHeight
      c.width = Math.round(w * dpr)
      c.height = Math.round(h * dpr)
      c.style.width = `${w}px`
      c.style.height = `${h}px`
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)

    // старт — над самым оживлённым местом: средняя точка вылетов последних самолётиков
    const first = planesRef.current.slice(0, 30).map((p) => at(p.from_country))
    if (first.length) {
      cam.lon = first.reduce((s, p) => s + p[0], 0) / first.length
      cam.lat = clampTilt(first.reduce((s, p) => s + p[1], 0) / first.length)
    }

    // вращение пальцем/мышью с инерцией; два пальца — приближение
    const ptrs = new Map<number, { x: number; y: number }>()
    let vel = { lon: 0, lat: 0 }
    let touched = -Infinity
    let pinch = 0
    const down = (e: PointerEvent) => {
      c.setPointerCapture(e.pointerId)
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
      touched = performance.now()
      vel = { lon: 0, lat: 0 }
      if (ptrs.size === 2) {
        const [p, q] = [...ptrs.values()]
        pinch = Math.hypot(p.x - q.x, p.y - q.y)
      }
    }
    const move = (e: PointerEvent) => {
      const prev = ptrs.get(e.pointerId)
      if (!prev) return
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
      touched = performance.now()
      if (ptrs.size === 2) {
        const [p, q] = [...ptrs.values()]
        const d = Math.hypot(p.x - q.x, p.y - q.y)
        if (pinch) zoom = Math.min(2.6, Math.max(0.85, (zoom * d) / pinch))
        pinch = d
        return
      }
      const k = 180 / Math.PI / cam.r // пиксели → градусы на поверхности
      const dl = -(e.clientX - prev.x) * k
      const dp = (e.clientY - prev.y) * k
      cam.lon += dl
      cam.lat = clampTilt(cam.lat + dp)
      vel = { lon: dl * 60, lat: dp * 60 }
    }
    const up = (e: PointerEvent) => {
      ptrs.delete(e.pointerId)
      if (ptrs.size < 2) pinch = 0
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      zoom = Math.min(2.6, Math.max(0.85, zoom * Math.exp(-e.deltaY * 0.0015)))
      touched = performance.now()
    }
    c.addEventListener('pointerdown', down)
    c.addEventListener('pointermove', move)
    c.addEventListener('pointerup', up)
    c.addEventListener('pointercancel', up)
    c.addEventListener('wheel', wheel, { passive: false })

    // рейсы: сначала свежие, в паузах — повтор истории
    const air: Flight[] = []
    let seen = planesRef.current[0]?.id ?? 0
    let replayAt = 0
    const launch = (p: PlaneRow, now: number) => {
      const a = at(p.from_country), b = at(p.to_country)
      // чем дальше перелёт, тем выше дуга над планетой
      air.push({ p, a, b, t0: now, dur: flightSeconds(a, b) * 1000, top: 0.05 + 0.22 * (geoDistance(a, b) / Math.PI) })
    }

    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const ps = planesRef.current
      // новые самолётики с опроса — в небо сразу
      for (const p of ps) if (p.id > seen && air.length < MAX_AIR * 1.5) launch(p, now)
      if (ps[0]) seen = Math.max(seen, ps[0].id)
      if (!calm && now > replayAt && air.length < MAX_AIR && ps.length) {
        replayAt = now + REPLAY_MS
        launch(ps[Math.floor(Math.random() * Math.min(ps.length, 120))], now)
      }

      // инерция и автоповорот
      const idle = now - touched > IDLE_MS
      if (!ptrs.size) {
        cam.lon += vel.lon * dt
        cam.lat = clampTilt(cam.lat + vel.lat * dt)
        vel.lon *= 0.94
        vel.lat *= 0.94
      }
      if (idle && !calm) cam.lon += AUTO_SPIN * dt
      cam.cx = w / 2
      cam.cy = h / 2 - h * 0.02
      cam.r = Math.min(w, h) * 0.42 * zoom

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = INK.paper
      ctx.fillRect(0, 0, w, h)
      const proj = drawGlobe(ctx, cam, fillsRef.current)
      const center: LonLat = [cam.lon, cam.lat]
      const size = Math.max(0.55, cam.r / 330)

      for (let i = air.length - 1; i >= 0; i--) {
        const f = air[i]
        const p = (now - f.t0) / f.dur
        if (p > 1 + TRAIL_FADE / (f.dur / 1000)) {
          air.splice(i, 1)
          continue
        }
        const mine = !!lead && (f.p.from_handle === lead || f.p.to_handle === lead)
        const color = mine ? INK.pink : INK.blue
        const fade = p <= 1 ? 1 : Math.max(0, 1 - ((p - 1) * f.dur) / 1000 / TRAIL_FADE)
        const q = Math.min(1, p)
        const n = Math.max(2, Math.ceil(q * 40))
        // след по поднятой дуге: высота — синус по доле пути, самолётик поднимается и снижается к адресату
        const arc = Array.from({ length: n + 1 }, (_, k) => {
          const t = (q * k) / n
          return lifted(cam, flightAt(f.a, f.b, t), f.top * Math.sin(Math.PI * t))
        })
        ctx.globalAlpha = fade
        drawLiftedArc(ctx, arc, color, mine ? 2.4 : 1.6, [5, 4])
        ctx.globalAlpha = 1
        const head = arc[arc.length - 1]
        if (p <= 1 && head.visible) {
          const hereLL = flightAt(f.a, f.b, q)
          // тень самолётика на поверхности под ним
          if (onFront(hereLL, center)) {
            const [sx, sy] = proj(hereLL)!
            ctx.fillStyle = 'rgb(29 29 27 / .18)'
            ctx.beginPath()
            ctx.ellipse(sx, sy, 5 * size, 2.4 * size, 0, 0, Math.PI * 2)
            ctx.fill()
          }
          const ahead = lifted(cam, flightAt(f.a, f.b, Math.min(1, q + 0.01)), f.top * Math.sin(Math.PI * Math.min(1, q + 0.01)))
          const model = isPlaneModel(f.p.from_plane) ? f.p.from_plane : 'dart'
          drawDart(ctx, head.x, head.y, Math.atan2(ahead.y - head.y, ahead.x - head.x), size * (mine ? 1.25 : 1), model, mine ? INK.pink : '#f5f3eb')
          if (mine || air.length < 6) label(ctx, `@${f.p.from_handle}`, head.x, head.y - 14 * size, mine ? INK.pink : INK.soot, 10)
        } else if (p > 1 && onFront(f.b, center)) {
          // посадка: кольцо расходится по месту прилёта
          const [x, y] = proj(f.b)!
          const k = ((p - 1) * f.dur) / 1000 / TRAIL_FADE
          ctx.strokeStyle = `rgb(255 72 176 / ${(1 - k).toFixed(3)})`
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(x, y, 4 + k * 16, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
      // в спокойном режиме — неподвижные маршруты вместо полётов
      if (calm) {
        for (const p of ps.slice(0, 40)) {
          const a = at(countryOf(p.from_country) === 'AQ' ? null : p.from_country), b = at(p.to_country)
          drawArc(ctx, proj, Array.from({ length: 25 }, (_, k) => flightAt(a, b, k / 24)), 'rgb(255 72 176 / .6)', 1.4, [4, 4])
        }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      c.removeEventListener('pointerdown', down)
      c.removeEventListener('pointermove', move)
      c.removeEventListener('pointerup', up)
      c.removeEventListener('pointercancel', up)
      c.removeEventListener('wheel', wheel)
    }
  }, [lead])

  return (
    <div className="globe-stage" ref={box}>
      <canvas ref={canvas} className="globe-canvas" role="img" aria-label="Globe of replies on X flying as paper planes. Drag to spin." />
      <p className="globe-hint" aria-hidden="true">Drag to spin the planet</p>
    </div>
  )
}
