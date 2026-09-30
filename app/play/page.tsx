import type { Metadata } from 'next'
import Airmail from './Airmail'

const title = 'Airmail · Paper Planes'
const description = 'Every reply you’ve sent on X is a letter. Fly it there — before your paper plane hits the ground.'
export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description },
  twitter: { card: 'summary_large_image', title, description },
}

export default function Play() {
  return (
    <main className="airmail">
      <Airmail />
    </main>
  )
}
