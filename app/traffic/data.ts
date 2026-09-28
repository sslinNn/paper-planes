import { cache } from 'react'
import { at, distance } from '@/lib/geo'
import { trafficRows } from '@/lib/pilot-db'
import { board } from '@/lib/traffic'

const EARTH_KM = 6371

// страница, метаданные и картинка табло — один запрос на рендер
export const loadBoard = cache(async () => {
  const { planes, window } = await trafficRows()
  return { ...board(planes, (p) => distance(at(p.from_country), at(p.to_country)) * EARTH_KM), window }
})
