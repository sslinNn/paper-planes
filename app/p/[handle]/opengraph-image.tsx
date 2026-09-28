import { ImageResponse } from 'next/og'
import { at, graticule, H, land, path, W } from '@/lib/geo'
import { summary } from '@/lib/pilot'
import { findPilot } from './find'

// превью карточки в ленте X: мир в две краски, дуги пилота розовым, крупно — сколько стран
export const alt = 'Paper planes of a pilot on X'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const revalidate = 3600

const PAPER = '#f5f3eb'
const BLUE = '#0078bf'
const PINK = '#ff48b0'
const SOOT = '#1d1d1b'

// статика карты — один раз на процесс
const LAND = land.map((f) => path(f) ?? '').join('')
const GRID = path(graticule) ?? ''

// Google Fonts без браузерного User-Agent отдаёт TTF — его и понимает satori. Сабсет только нужных букв
async function font(family: string, weight: number, text: string) {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&text=${encodeURIComponent(text)}`)).text()
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1]
    return url ? await (await fetch(url)).arrayBuffer() : null
  } catch {
    return null // без шрифта картинка всё равно соберётся на встроенном
  }
}

export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const p = await findPilot((await params).handle)
  const handle = p ? `@${p.handle}` : 'Paper Planes'
  const s = summary(p?.stamps ?? [])
  const from = at(p?.country ?? null)
  const arcs = (p?.stamps ?? [])
    .map((st) => path({ type: 'LineString', coordinates: [from, at(st.country)] }))
    .filter(Boolean)
    .join('')
  const dots = (p?.stamps ?? []).map((st) => path.pointRadius(5)({ type: 'Point', coordinates: at(st.country) }) ?? '').join('')
  const avatar = p?.image?.startsWith('https://pbs.twimg.com/') ? p.image.replace('_normal.', '_400x400.') : null

  const big = `${handle}${s.countries}PAPER PLANES`
  const small = 'COUNTRIESPLANESreplies on X flew to·0123456789'
  const [display, text] = await Promise.all([font('Big+Shoulders', 900, big.toUpperCase() + big), font('Archivo', 700, small)])
  const fonts = [
    ...(display ? [{ name: 'Display', data: display, weight: 900 as const }] : []),
    ...(text ? [{ name: 'Text', data: text, weight: 700 as const }] : []),
  ]

  const mapH = (size.width * H) / W
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: PAPER, color: SOOT, fontFamily: 'Text' }}>
        <svg width={size.width} height={mapH} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', left: 0, top: (size.height - mapH) / 2 }}>
          <path d={GRID} fill="none" stroke={BLUE} strokeOpacity={0.15} strokeWidth={0.6} />
          <path d={LAND} fill={BLUE} fillOpacity={0.2} stroke={BLUE} strokeOpacity={0.5} strokeWidth={0.5} />
          <path d={arcs} fill="none" stroke={PINK} strokeWidth={2.4} strokeLinecap="round" />
          <path d={dots} fill={PINK} />
        </svg>

        <div style={{ position: 'absolute', left: 48, top: 44, display: 'flex', alignItems: 'center', gap: 22, padding: '18px 26px 18px 18px', background: PAPER, border: `3px solid ${BLUE}` }}>
          {avatar && (
            <img src={avatar} width={96} height={96} style={{ borderRadius: 48, border: `3px solid ${PINK}` }} alt="" />
          )}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontFamily: 'Display', fontSize: 72, lineHeight: 0.9, color: BLUE, textTransform: 'uppercase' }}>{handle}</div>
            <div style={{ display: 'flex', fontSize: 26, marginTop: 8 }}>replies on X flew to</div>
          </div>
        </div>

        <div style={{ position: 'absolute', right: 48, bottom: 40, display: 'flex', alignItems: 'flex-end', gap: 16 }}>
          <div style={{ display: 'flex', fontFamily: 'Display', fontSize: 200, lineHeight: 0.8, color: BLUE, textShadow: `7px 5px 0 ${PINK}` }}>{s.countries}</div>
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 30, paddingBottom: 6 }}>
            <div>{s.countries === 1 ? 'COUNTRY' : 'COUNTRIES'}</div>
            <div style={{ display: 'flex', color: BLUE }}>{`${s.planes} ${s.planes === 1 ? 'PLANE' : 'PLANES'}`}</div>
          </div>
        </div>

        <div style={{ display: 'flex', position: 'absolute', left: 48, bottom: 40, fontFamily: 'Display', fontSize: 40, color: BLUE }}>PAPER PLANES</div>
      </div>
    ),
    { ...size, fonts },
  )
}
