'use client'
import Link from 'next/link'
import { track } from '@/lib/track'
import { Arrow } from './icons'

// дорога в игру с карты: кнопку меряем отдельно — по ней видно, уводит ли карта людей в Airmail
export default function PlayLink({ from, className = 'tag play-link', children = 'Play Airmail' }: { from: string; className?: string; children?: React.ReactNode }) {
  return (
    <Link className={className} href="/" onClick={() => track('play_clicked', { from })}>
      {children} <Arrow />
    </Link>
  )
}
