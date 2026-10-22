import { geoDistance, geoInterpolate } from 'd3-geo'

// математика глобуса без DOM: где самолётик на дуге, видна ли точка, куда можно наклонить камеру

export type LonLat = [number, number]

// позиция на большом круге от a к b, p — доля пути 0..1
export const flightAt = (a: LonLat, b: LonLat, p: number): LonLat => geoInterpolate(a, b)(Math.min(1, Math.max(0, p))) as LonLat

// точка на лицевой стороне глобуса (камера смотрит в center); маленький запас — у самого края всё сплюснуто
export const onFront = (p: LonLat, center: LonLat, margin = 0.08) => geoDistance(p, center) < Math.PI / 2 - margin

// камера не заваливается на полюса — там карта рвётся и теряется ориентация
export const clampTilt = (lat: number) => Math.max(-60, Math.min(60, lat))

// длиннее дуга — дольше полёт (секунды), как на плоской карте
export const flightSeconds = (a: LonLat, b: LonLat) => 2.4 + geoDistance(a, b) * 1.6

const known = (c: string | null | undefined) => !!c && c !== 'AQ'

// повтор истории на глобусе: из свежих рейсов — те, где известны обе страны. Рейсы «в туман» (страна адресата
// неизвестна) крутятся, только когда других нет: иначе небо новичка — сплошные дуги в Антарктиду
export function replayPool<P extends { from_country: string | null; to_country: string | null }>(planes: P[], recent = 120): P[] {
  const pool = planes.slice(0, recent)
  const routes = pool.filter((p) => known(p.from_country) && known(p.to_country))
  return routes.length ? routes : pool
}

// кого запускать из повтора: каждый третий раз — доставку из Mail Wars (если есть), остальные — реплаи.
// Нет реплаев — только доставки: глобус живой и без залогиненных пилотов
export const replayKind = (turn: number, planes: number, deliveries: number): 'plane' | 'delivery' | null =>
  !planes && !deliveries ? null : !deliveries ? 'plane' : !planes || turn % 3 === 2 ? 'delivery' : 'plane'
