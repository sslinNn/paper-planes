'use client'
import Link from 'next/link'
import { PLANE_MODELS, type PlaneModel } from '@/lib/patrons'
import { nextRank, rankOf, RANKS, TRAIT, unlocked } from '@/lib/ranks'
import { Airframe } from '../PlaneMap'
import { Arrow } from '../icons'

export const NAMES: Record<PlaneModel, string> = { dart: 'Dart', glider: 'Glider', swallow: 'Swallow', crane: 'Crane' }

// ангар: ранг пилота AIRMAIL открывает модели; закрытые — серые, с порогом ранга
export default function Hangar({ xp, plane, onPlane, compact }: { xp: number; plane: PlaneModel; onPlane: (p: PlaneModel) => void; compact?: boolean }) {
  const rank = rankOf(xp)
  const next = nextRank(xp)
  return (
    <section className={`hangar-box${compact ? ' compact' : ''}`} aria-label="Hangar">
      <p className="rank">
        <b>{rank.name}</b> · {xp} {xp === 1 ? 'letter' : 'letters'} delivered
        {next && <span className="to-next"> · {next.xp - xp} to {next.name}</span>}
      </p>
      {next && <span className="rank-bar" style={{ '--p': (xp - rank.xp) / (next.xp - rank.xp) } as React.CSSProperties} aria-hidden="true" />}
      <div className="hangar" role="radiogroup" aria-label="Your plane model">
        {PLANE_MODELS.map((m) => {
          const open = unlocked(xp, m)
          const need = RANKS.find((r) => r.plane === m)!
          return (
            <button key={m} type="button" role="radio" aria-checked={plane === m} disabled={!open} className="airframe" title={TRAIT[m]}
              onClick={() => onPlane(m)}>
              <svg viewBox="-17 -16 34 32" aria-hidden="true"><g className="dart"><Airframe model={m} /></g></svg>
              {NAMES[m]}
              <small>{open ? TRAIT[m] : `${need.name} · ${need.xp} letters`}</small>
            </button>
          )
        })}
      </div>
      {!compact && <p className="fine"><Link href="/play">Deliver letters in Airmail to rank up <Arrow /></Link></p>}
    </section>
  )
}
