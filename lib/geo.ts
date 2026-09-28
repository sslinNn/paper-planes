import { geoCentroid, geoDistance, geoGraticule10, geoMercator, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import countries from 'i18n-iso-countries'
import world from 'world-atlas/countries-110m.json' with { type: 'json' }

// плоская карта во весь экран: Меркатор от 80° с.ш. до 72° ю.ш. (полоса Антарктиды внизу остаётся)
export const W = 1000
const NORTH = 80
const SOUTH = -72
export const projection = geoMercator().scale(W / (2 * Math.PI)).translate([W / 2, 0])
const top = projection([0, NORTH])![1]
projection.translate([W / 2, -top])
export const H = projection([0, SOUTH])![1]
export const path = geoPath(projection)

// неизвестная страна — Антарктида, у кромки льда, чтобы было видно
export const FOG: [number, number] = [0, -70]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const topo = world as any
export const land = (feature(topo, topo.objects.countries) as unknown as GeoJSON.FeatureCollection).features

// ponytail: центроид мультиполигона (Франция с Гвианой уезжает к Атлантике) — для игрушки ок
const centroids = new Map(land.map((f) => [String(f.id), geoCentroid(f)]))

export function at(iso: string | null): [number, number] {
  if (!iso || iso === 'AQ') return FOG
  return centroids.get(countries.alpha2ToNumeric(iso) ?? '') ?? FOG
}

export const graticule = geoGraticule10()

// ISO alpha-2 страны карты (у пары спорных территорий кода нет)
export const isoOf = (f: GeoJSON.Feature) => countries.numericToAlpha2(String(f.id)) ?? null

// радианы по большому кругу — для длительности полёта
export const distance = (a: [number, number], b: [number, number]) => geoDistance(a, b)
