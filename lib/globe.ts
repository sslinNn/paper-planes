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
