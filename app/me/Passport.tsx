'use client'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { countryName } from '@/lib/country'
import { greeting, stampDesign, type StampDesign } from '@/lib/stamps'
import { Arrow } from '../icons'

export type Stamp = { country: string; count: number; first: string }
type Props = { handle: string; image?: string | null; home: string | null; stamps: Stamp[]; patronSince?: string | null; airmail?: Stamp[] }

const PER_PAGE = 4
const fmt = (iso: string) => new Date(iso).toLocaleDateString('en', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()
// аватарки только с домена X; берём крупную версию для фото на странице данных
const photoOf = (url?: string | null) => (url?.startsWith('https://pbs.twimg.com/') ? url.replace('_normal.', '_400x400.') : null)

// ---------- штамп ----------

const INK = (hue: number) => `oklch(0.5 0.17 ${hue})`

function Shape({ shape }: { shape: StampDesign['shape'] }) {
  switch (shape) {
    case 'circle':
      return <><circle cx="100" cy="75" r="68" /><circle cx="100" cy="75" r="61" /></>
    case 'oval':
      return <><ellipse cx="100" cy="75" rx="92" ry="66" /><ellipse cx="100" cy="75" rx="85" ry="59" /></>
    case 'rect':
      return <><rect x="10" y="12" width="180" height="126" rx="6" /><rect x="17" y="19" width="166" height="112" rx="3" /></>
    case 'octagon':
      return <><polygon points="52,8 148,8 192,48 192,102 148,142 52,142 8,102 8,48" /><polygon points="55,15 145,15 185,51 185,99 145,135 55,135 15,99 15,51" /></>
    case 'shield':
      return <><path d="M16 12 H184 V78 Q184 124 100 144 Q16 124 16 78 Z" /><path d="M23 19 H177 V78 Q177 118 100 137 Q23 118 23 78 Z" /></>
  }
}

function Motif({ motif }: { motif: StampDesign['motif'] }) {
  const g = { transform: 'translate(87 92)' }
  switch (motif) {
    case 'mountains': return <path {...g} d="M0 16 L8 4 L13 10 L18 2 L26 16" />
    case 'waves': return <path {...g} d="M0 6 q3.25 -4 6.5 0 t6.5 0 t6.5 0 t6.5 0 M0 13 q3.25 -4 6.5 0 t6.5 0 t6.5 0 t6.5 0" />
    case 'sun': return <g {...g}><circle cx="13" cy="9" r="4.5" /><path d="M13 0 V2 M13 16 V18 M4 9 H6 M20 9 H22 M6.5 2.5 L8 4 M18 14 L19.5 15.5 M19.5 2.5 L18 4 M8 14 L6.5 15.5" /></g>
    case 'star': return <polygon {...g} points="13,0 16,6.5 23,7 17.5,11.5 19.5,18 13,14 6.5,18 8.5,11.5 3,7 10,6.5" />
    case 'plane': return <g {...g}><path d="M26 8 L2 0 L7 8 Z" /><path d="M26 8 L7 8 L3 15 Z" /></g>
    case 'snow': return <path {...g} d="M13 0 V18 M5 4.5 L21 13.5 M21 4.5 L5 13.5 M10 1.5 L13 4 L16 1.5 M10 16.5 L13 14 L16 16.5" />
  }
}

export function PassportStamp({ stamp, airmail }: { stamp: Stamp; airmail?: boolean }) {
  const d = stampDesign(stamp.country)
  const name = countryName(stamp.country).toUpperCase()
  const hello = greeting(stamp.country)
  return (
    <svg className={airmail ? 'visa airmail-visa' : 'visa'} viewBox="0 0 200 150" style={{ '--visa': INK(d.hue), rotate: `${d.tilt}deg` } as React.CSSProperties} role="img" aria-label={`${name} stamp, first landed ${fmt(stamp.first)}, ${stamp.count} planes`}>
      <g filter="url(#rubber)">
        <g className="visa-line"><Shape shape={d.shape} /></g>
        <text className="visa-hello" x="100" y="46" {...(hello.length > 11 ? { textLength: 118, lengthAdjust: 'spacingAndGlyphs' } : {})}>{hello}</text>
        <text className="visa-name" x="100" y="78" {...(name.length > 10 ? { textLength: 136, lengthAdjust: 'spacingAndGlyphs' } : {})}>{name}</text>
        <g className="visa-line"><Motif motif={d.motif} /></g>
        <text className="visa-small" x="100" y="124">{fmt(stamp.first)} · ×{stamp.count}</text>
        <text className="visa-small visa-serial" x="100" y="134">{airmail ? 'PAR AVION · AIRMAIL' : d.serial}</text>
      </g>
    </svg>
  )
}

// штамп донатера: золотая фольга, звезда, дата первого доната
function PatronStamp({ since }: { since: string }) {
  return (
    <svg className="visa patron-visa" viewBox="0 0 200 150" style={{ rotate: '-4deg' } as React.CSSProperties} role="img" aria-label={`Patron of the sky since ${fmt(since)}`}>
      <g filter="url(#rubber)">
        <g className="visa-line"><circle cx="100" cy="75" r="68" /><circle cx="100" cy="75" r="61" /><circle cx="100" cy="75" r="44" /></g>
        <text className="visa-hello" x="100" y="36">PATRON</text>
        <text className="visa-name" x="100" y="72" textLength="120" lengthAdjust="spacingAndGlyphs">OF THE SKY</text>
        <g className="visa-line"><Motif motif="star" /></g>
        <text className="visa-small" x="100" y="128">{fmt(since)}</text>
      </g>
    </svg>
  )
}

// ---------- страницы ----------

function InsideCover({ diplomatic }: { diplomatic: boolean }) {
  return (
    <div className="page inside-cover">
      {diplomatic && <p className="dip-label">Diplomatic</p>}
      <svg className="emblem" viewBox="-12 -11 28 19" aria-hidden="true">
        <path d="M15 0 L-11 -10 L-4 0 Z" /><path d="M15 0 L-4 0 L-10 7 Z" />
      </svg>
      <p className="authority">Paper Planes<br />Air Authority</p>
      <p className="request">The bearer of this passport travels by reply. All timelines are requested to let them pass freely and to reply back.</p>
    </div>
  )
}

function IdentityPage(props: Props) {
  const { handle, image, home, stamps } = props
  const total = stamps.reduce((n, s) => n + s.count, 0)
  const issued = stamps[0]?.first
  // номер паспорта: PP + 7 цифр, постоянный для хэндла
  const id = stampDesign(handle.toUpperCase())
  const no = `PP${String(id.hue).padStart(3, '0')}${id.serial.slice(-4)}`
  const mrz1 = `P<PPL${handle.toUpperCase().replace(/[^A-Z0-9]/g, '<')}<<PAPER<PLANES`.padEnd(44, '<').slice(0, 44)
  const mrz2 = `${no}<${(home ?? 'AQ').padEnd(3, '<')}${String(total).padStart(4, '0')}<<${String(stamps.length).padStart(3, '0')}`.padEnd(44, '<').slice(0, 44)
  const photo = photoOf(image)
  return (
    <div className="page identity">
      <p className="doc-head">{props.patronSince ? 'Diplomatic passport' : 'Passport · Passeport · Паспорт'}</p>
      <div className="id-grid">
        {/* eslint-disable-next-line @next/next/no-img-element -- внешняя аватарка X, оптимизатор Next тут не нужен */}
        <div className="photo">{photo ? <img src={photo} alt={`@${handle}`} /> : <span>@</span>}</div>
        <dl>
          <div><dt>Type / Code</dt><dd>P / PPL</dd></div>
          <div><dt>Passport No.</dt><dd>{no}</dd></div>
          <div className="wide"><dt>Holder</dt><dd className="holder">@{handle}</dd></div>
          <div><dt>Home airport</dt><dd>{home ? countryName(home) : 'Antarctica'}</dd></div>
          <div><dt>Date of issue</dt><dd>{issued ? fmt(issued) : '—'}</dd></div>
          <div><dt>Planes sent</dt><dd>{total}</dd></div>
          <div><dt>Countries</dt><dd>{stamps.length}</dd></div>
        </dl>
      </div>
      <p className="mrz" aria-hidden="true">{mrz1}<br />{mrz2}</p>
    </div>
  )
}

function VisaPage({ stamps, n, patronSince, title = 'Visas', airmail }: { stamps: Stamp[]; n: number; patronSince?: string | null; title?: string; airmail?: boolean }) {
  return (
    <div className="page visas">
      <p className="doc-head">{title} <span>{n}</span></p>
      <ul className="visa-grid">
        {patronSince && <li key="patron"><PatronStamp since={patronSince} /></li>}
        {stamps.map((s) => <li key={s.country}><PassportStamp stamp={s} airmail={airmail} /></li>)}
      </ul>
      {!stamps.length && <p className="blank">{airmail ? 'Empty page. Deliver more letters in Airmail to fill it.' : 'Empty page. Reply to someone abroad on X and your next plane stamps it.'}</p>}
    </div>
  )
}

// резиновый штамп: рваная кромка и пропуски краски. Нужен на странице один раз — паспорт и игра
export function RubberFilter() {
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
      <filter id="rubber">
        <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4" result="grain" />
        <feDisplacementMap in="SourceGraphic" in2="grain" scale="2.2" result="rough" />
        <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="1" seed="9" result="speck" />
        <feColorMatrix in="speck" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -14 9" result="holes" />
        <feComposite in="rough" in2="holes" operator="in" />
      </filter>
    </svg>
  )
}

// ---------- книжка ----------

type Flip = null | 'next' | 'prev'

export default function Passport(props: Props) {
  // у донатера первая визовая страница начинается со штампа Patron of the Sky — он занимает одно место
  const lead = props.patronSince ? 1 : 0
  const visas: Stamp[][] = []
  for (let i = 0, cap = PER_PAGE - lead; i < Math.max(props.stamps.length, 1); i += cap, cap = PER_PAGE)
    visas.push(props.stamps.slice(i, i + cap))
  const pages: ReactNode[] = [
    <InsideCover key="c" diplomatic={!!props.patronSince} />,
    <IdentityPage key="id" {...props} />,
    ...visas.map((s, i) => <VisaPage key={i} stamps={s} n={i + 1} patronSince={i === 0 ? props.patronSince : null} />),
  ]
  // штампы из игры AIRMAIL — своими страницами после виз
  const air = props.airmail ?? []
  for (let i = 0; i < air.length; i += PER_PAGE)
    pages.push(<VisaPage key={`am${i}`} stamps={air.slice(i, i + PER_PAGE)} n={i / PER_PAGE + 1} title="Airmail" airmail />)
  if (pages.length % 2)
    pages.push(air.length
      ? <VisaPage key="blank" stamps={[]} n={Math.ceil(air.length / PER_PAGE) + 1} title="Airmail" airmail />
      : <VisaPage key="blank" stamps={[]} n={visas.length + 1} />)

  const [single, setSingle] = useState(false)
  const [at, setAt] = useState(0) // разворот (или страница на телефоне)
  const [flip, setFlip] = useState<Flip>(null)
  const startX = useRef<number | null>(null)

  useEffect(() => {
    const mq = matchMedia('(max-width: 720px)')
    const sync = () => {
      setSingle(mq.matches)
      setAt(0)
    }
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const last = single ? pages.length - 1 : pages.length / 2 - 1
  const go = useCallback((dir: Exclude<Flip, null>) => {
    if (flip) return
    if (dir === 'next' ? at >= last : at <= 0) return
    setFlip(dir)
  }, [flip, at, last])
  const done = () => {
    setAt((a) => a + (flip === 'next' ? 1 : -1))
    setFlip(null)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // стрелки в поле email или в выпадашке страны не должны листать паспорт
      if ((e.target as HTMLElement).closest?.('input, select, textarea')) return
      if (e.key === 'ArrowRight') go('next')
      if (e.key === 'ArrowLeft') go('prev')
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [go])

  const page = (i: number) => pages[i] ?? <div className="page" />
  let under: ReactNode
  let leaf: ReactNode = null
  if (single) {
    // телефон: одна страница; вперёд — лист уходит влево, назад — прилетает обратно
    under = <div className="half">{page(flip === 'next' ? at + 1 : at)}</div>
    if (flip === 'next') leaf = <div className="leaf single-next" onAnimationEnd={done}><div className="face">{page(at)}</div><div className="face back"><div className="page" /></div></div>
    if (flip === 'prev') leaf = <div className="leaf single-prev" onAnimationEnd={done}><div className="face">{page(at - 1)}</div><div className="face back"><div className="page" /></div></div>
  } else {
    const L = 2 * at
    under = (
      <>
        <div className="half">{page(flip === 'prev' ? L - 2 : L)}</div>
        <div className="half">{page(flip === 'next' ? L + 3 : L + 1)}</div>
      </>
    )
    if (flip === 'next') leaf = <div className="leaf turn-next" onAnimationEnd={done}><div className="face">{page(L + 1)}</div><div className="face back">{page(L + 2)}</div></div>
    if (flip === 'prev') leaf = <div className="leaf turn-prev" onAnimationEnd={done}><div className="face">{page(L)}</div><div className="face back">{page(L - 1)}</div></div>
  }

  return (
    <section className="passport-book" aria-label="Your paper planes passport">
      <RubberFilter />
      <div
        className={`book${single ? ' single' : ''}${props.patronSince ? ' diplomatic' : ''}`}
        onPointerDown={(e) => (startX.current = e.clientX)}
        onPointerUp={(e) => {
          if (startX.current === null) return
          const dx = e.clientX - startX.current
          startX.current = null
          if (Math.abs(dx) > 40) go(dx < 0 ? 'next' : 'prev')
        }}
      >
        {under}
        {leaf}
      </div>
      <nav className="book-nav">
        <button type="button" className="page-btn" onClick={() => go('prev')} disabled={at <= 0} aria-label="Previous page"><span className="flip-x"><Arrow /></span></button>
        <span>{single ? `${at + 1} / ${pages.length}` : `${2 * at + 1}–${2 * at + 2} / ${pages.length}`}</span>
        <button type="button" className="page-btn" onClick={() => go('next')} disabled={at >= last} aria-label="Next page"><Arrow /></button>
      </nav>
    </section>
  )
}
