import { ImageResponse } from 'next/og'
import { geoInterpolate } from 'd3-geo'
import { at, graticule, H, land, path, W } from '@/lib/geo'
import { parseRoute } from '@/lib/postcard'

// открытка маршрута для ленты X: riso-карта, путь авиапочтовым пунктиром от страны к стране, штампы, крупный счёт
export const alt = 'An Airmail route: real X replies flown as a paper plane'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const revalidate = 86400

const PAPER = '#f5f3eb'
const BLUE = '#0078bf'
const PINK = '#ff48b0'
const SOOT = '#1d1d1b'

// статика карты — один раз на процесс
const LAND = land.map((f) => path(f) ?? '').join('')
const GRID = path(graticule) ?? ''

async function font(family: string, weight: number, text: string) {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&text=${encodeURIComponent(text)}`)).text()
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1]
    return url ? await (await fetch(url)).arrayBuffer() : null
  } catch {
    return null // без шрифта картинка всё равно соберётся на встроенном
  }
}

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const r = parseRoute((await params).code) ?? { score: 0, km: 0, countries: [], day: null }
  const pts = r.countries.map((c) => at(c))
  // большой круг между соседними доставками — как летят самолётики на главной карте
  const legs = pts.slice(1).map((b, i) => {
    const f = geoInterpolate(pts[i], b)
    return path({ type: 'LineString', coordinates: Array.from({ length: 17 }, (_, k) => f(k / 16)) }) ?? ''
  }).join('')
  const stamps = pts.map((p) => path.pointRadius(9)({ type: 'Point', coordinates: p }) ?? '').join('')
  const inner = pts.map((p) => path.pointRadius(5.5)({ type: 'Point', coordinates: p }) ?? '').join('')
  const score = r.score.toLocaleString('en')
  const head = r.day ? `TODAY’S MAIL #${r.day}` : 'MY REPLIES, HAND-DELIVERED'
  const line = `${r.countries.length} ${r.countries.length === 1 ? 'LETTER' : 'LETTERS'} · ${r.km.toLocaleString('en')} KM`
  const route = r.countries.slice(0, 8).join(' → ') + (r.countries.length > 8 ? ' …' : '')

  const big = `AIRMAIL${score}`
  const small = `${head}${line}${route}BEAT IT ON PAPERPLANES`
  const [display, text] = await Promise.all([font('Big+Shoulders', 900, big), font('Archivo', 800, small)])
  const fonts = [
    ...(display ? [{ name: 'Display', data: display, weight: 900 as const }] : []),
    ...(text ? [{ name: 'Text', data: text, weight: 800 as const }] : []),
  ]

  const mapH = (size.width * H) / W
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: PAPER, color: SOOT, fontFamily: 'Text' }}>
        <svg width={size.width} height={mapH} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', left: 0, top: (size.height - mapH) / 2 }}>
          <path d={GRID} fill="none" stroke={BLUE} strokeOpacity={0.15} strokeWidth={0.6} />
          <path d={LAND} fill={BLUE} fillOpacity={0.2} stroke={BLUE} strokeOpacity={0.5} strokeWidth={0.5} />
          <path d={legs} fill="none" stroke={BLUE} strokeWidth={3.2} strokeDasharray="7 7" />
          <path d={legs} fill="none" stroke={PINK} strokeWidth={3.2} strokeDasharray="7 7" strokeDashoffset={7} />
          <path d={stamps} fill={PAPER} stroke={PINK} strokeWidth={2.2} />
          <path d={inner} fill="none" stroke={PINK} strokeWidth={1.4} />
        </svg>

        {/* кайма авиапочтового конверта */}
        <div style={{ position: 'absolute', left: 0, top: 0, display: 'flex', width: '100%', height: 18 }}>
          {Array.from({ length: 44 }, (_, i) => <div key={i} style={{ width: 30, flexShrink: 0, height: 18, background: i % 2 ? BLUE : PINK, transform: 'skewX(-30deg)' }} />)}
        </div>

        <div style={{ position: 'absolute', left: 48, top: 48, display: 'flex', flexDirection: 'column', padding: '16px 24px 18px', background: PAPER, border: `3px solid ${SOOT}`, boxShadow: `6px 4px 0 ${PINK}` }}>
          <div style={{ display: 'flex', fontFamily: 'Display', fontSize: 64, lineHeight: 0.9, color: BLUE }}>AIRMAIL</div>
          <div style={{ display: 'flex', fontSize: 24, marginTop: 6, letterSpacing: 1 }}>{head}</div>
        </div>

        <div style={{ position: 'absolute', right: 48, bottom: 44, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', fontFamily: 'Display', fontSize: 190, lineHeight: 0.8, color: BLUE, textShadow: `7px 5px 0 ${PINK}` }}>{score}</div>
          <div style={{ display: 'flex', fontSize: 28, marginTop: 14 }}>{line}</div>
        </div>

        <div style={{ position: 'absolute', left: 48, bottom: 44, display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 560 }}>
          {route && <div style={{ display: 'flex', fontSize: 26, color: PINK }}>{route}</div>}
          <div style={{ display: 'flex', fontSize: 22 }}>BEAT IT ON PAPERPLANES</div>
        </div>
      </div>
    ),
    { ...size, fonts },
  )
}
