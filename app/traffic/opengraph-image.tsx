import { ImageResponse } from 'next/og'
import { placeName } from '@/lib/traffic'
import { loadBoard } from './data'

// превью табло в ленте X: как табло вылетов — коды стран, стрелка, число рейсов
export const alt = 'Air traffic of paper planes: busiest routes of replies on X'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const revalidate = 900

const PAPER = '#f5f3eb'
const BLUE = '#0078bf'
const PINK = '#ff48b0'
const SOOT = '#1d1d1b'

// Google Fonts без браузерного User-Agent отдаёт TTF — его и понимает satori
async function font(family: string, weight: number) {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}:wght@${weight}`)).text()
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1]
    return url ? await (await fetch(url)).arrayBuffer() : null
  } catch {
    return null
  }
}

const code = (iso: string) => (iso === 'AQ' ? '??' : iso)

export default async function Image() {
  const b = await loadBoard()
  const [display, text] = await Promise.all([font('Big+Shoulders', 900), font('Archivo', 700)])
  const fonts = [
    ...(display ? [{ name: 'Display', data: display, weight: 900 as const }] : []),
    ...(text ? [{ name: 'Text', data: text, weight: 700 as const }] : []),
  ]
  const rows = b.routes.slice(0, 4)

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: PAPER, color: SOOT, fontFamily: 'Text', padding: '44px 56px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: `4px solid ${BLUE}`, paddingBottom: 14 }}>
          <div style={{ display: 'flex', fontFamily: 'Display', fontSize: 96, lineHeight: 0.8, color: BLUE, textShadow: `5px 4px 0 ${PINK}` }}>AIR TRAFFIC</div>
          <div style={{ display: 'flex', fontSize: 26 }}>{`${b.planes} paper planes · replies on X`}</div>
        </div>

        <div style={{ display: 'flex', flex: 1, gap: 40, marginTop: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            {rows.map((r, i) => {
              const [from, to] = r.key.split('>')
              return (
                <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '10px 0', borderBottom: `2px solid ${BLUE}` }}>
                  <div style={{ display: 'flex', fontFamily: 'Display', fontSize: 30, color: PINK, width: 44 }}>{`0${i + 1}`}</div>
                  <div style={{ display: 'flex', fontFamily: 'Display', fontSize: 52, lineHeight: 1, background: SOOT, color: PAPER, padding: '2px 12px' }}>{code(from)}</div>
                  <div style={{ display: 'flex', fontSize: 40, color: PINK }}>→</div>
                  <div style={{ display: 'flex', fontFamily: 'Display', fontSize: 52, lineHeight: 1, background: SOOT, color: PAPER, padding: '2px 12px' }}>{code(to)}</div>
                  <div style={{ display: 'flex', flex: 1 }} />
                  <div style={{ display: 'flex', fontFamily: 'Display', fontSize: 52, color: BLUE }}>{`×${r.count}`}</div>
                </div>
              )
            })}
          </div>

          {b.landingOfDay && (
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: 360, padding: 28, border: `4px solid ${BLUE}`, background: 'rgba(255,72,176,.14)' }}>
              <div style={{ display: 'flex', fontSize: 24 }}>LANDING OF THE DAY</div>
              <div style={{ display: 'flex', fontFamily: 'Display', fontSize: 80, lineHeight: 0.9, color: BLUE, marginTop: 10 }}>{placeName(b.landingOfDay.iso).toUpperCase()}</div>
              <div style={{ display: 'flex', fontSize: 26, marginTop: 14 }}>{`${b.landingOfDay.count} planes in 24 h`}</div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', fontFamily: 'Display', fontSize: 36, color: BLUE, marginTop: 18 }}>PAPER PLANES</div>
      </div>
    ),
    { ...size, fonts },
  )
}
