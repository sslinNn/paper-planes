import { ImageResponse } from 'next/og'

// превью /play в ленте X: авиапочтовый конверт — кайма в косую полоску и крупное AIRMAIL
export const alt = 'Airmail: a paper-plane game where the letters are your real X replies'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

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

const Stripe = () => (
  <div style={{ display: 'flex', height: 28, width: '100%', overflow: 'hidden' }}>
    {Array.from({ length: 44 }, (_, i) => (
      <div key={i} style={{ width: 30, flexShrink: 0, height: 28, background: i % 2 ? BLUE : PINK, transform: 'skewX(-30deg)' }} />
    ))}
  </div>
)

export default async function Image() {
  const [display, text] = await Promise.all([font('Big+Shoulders', 900), font('Archivo', 700)])
  const fonts = [
    ...(display ? [{ name: 'Display', data: display, weight: 900 as const }] : []),
    ...(text ? [{ name: 'Text', data: text, weight: 700 as const }] : []),
  ]
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: PAPER, color: SOOT, fontFamily: 'Text' }}>
        <Stripe />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 72px' }}>
          <div style={{ fontSize: 26, letterSpacing: 4, textTransform: 'uppercase' }}>Paper Planes presents</div>
          <div style={{ fontFamily: 'Display', fontSize: 200, lineHeight: 0.85, color: BLUE, marginTop: 10 }}>AIRMAIL</div>
          <div style={{ fontSize: 46, marginTop: 18 }}>Your X replies are letters. Fly them there.</div>
          <div style={{ fontSize: 26, marginTop: 18, color: PINK }}>Real trade winds · storms made of arguments · stamps in your passport</div>
        </div>
        <Stripe />
      </div>
    ),
    { ...size, fonts },
  )
}
